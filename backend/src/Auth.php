<?php
declare(strict_types=1);

namespace DLoop;

final class Auth
{
    // Timing-only bcrypt hash; never an administrator credential.
    private const DUMMY_HASH = '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

    public function __construct(private array $config, private \Closure $database) {}

    public function start(): void
    {
        LocalAccess::check($this->config, $_SERVER);
        $secure = $this->config['environment'] === 'production';
        if ($secure && ($_SERVER['HTTPS'] ?? '') !== 'on' && (int) ($_SERVER['SERVER_PORT'] ?? 0) !== 443) {
            throw new HttpError(400, 'https_required', 'HTTPS is required.');
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.gc_maxlifetime', (string) $this->config['session_absolute_seconds']);
        session_save_path($this->config['session_dir']);
        session_name('dloop_session');
        session_set_cookie_params(['lifetime' => 0, 'path' => '/api/v1', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict']);
        if (!session_start()) {
            throw new \RuntimeException('Session start failed.');
        }
        $expectedMode = $this->config['access_mode'] ?? 'AUTHENTICATED';
        if (isset($_SESSION['user_id']) && (($_SESSION['access_mode'] ?? 'AUTHENTICATED') !== $expectedMode ||
            (LocalAccess::enabled($this->config) && ($_SESSION['local_binding'] ?? '') !== $this->localBinding()))) { $this->reset(); }
        $now = time();
        if (isset($_SESSION['user_id']) && ($now - ($_SESSION['last_seen'] ?? 0) > $this->config['session_idle_seconds']
            || $now - ($_SESSION['authenticated_at'] ?? 0) > $this->config['session_absolute_seconds'])) {
            $this->reset();
        }
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
        if (isset($_SESSION['user_id'])) {
            $_SESSION['last_seen'] = $now;
            if ($now - ($_SESSION['rotated_at'] ?? 0) >= 900) {
                session_regenerate_id(true);
                $_SESSION['rotated_at'] = $now;
            }
        }
    }

    public function csrf(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!in_array($origin, $this->config['allowed_origins'], true) || !is_string($token)
            || !isset($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $token)) {
            throw new HttpError(403, 'csrf_failed', 'Request verification failed. Refresh your session.');
        }
    }

    public function user(): ?array
    {
        if (!isset($_SESSION['user_id'])) {
            return null;
        }
        if (LocalAccess::enabled($this->config) && (string)$_SESSION['user_id'] !== $this->config['local_user_id']) { $this->reset(); return null; }
        $q = ($this->database)()->prepare('SELECT id, email, role, active FROM users WHERE id = ?');
        $q->execute([$_SESSION['user_id']]);
        $user = $q->fetch();
        if (!$user || (int) $user['active'] !== 1 || $user['role'] !== 'admin') {
            $this->reset();
            return null;
        }
        unset($user['active']);
        $user['id'] = (string) $user['id'];
        return $user;
    }

    public function requireAdmin(): array
    {
        $user = $this->user();
        if (!$user) {
            throw new HttpError(401, 'unauthenticated', 'Administrator sign-in is required.');
        }
        return $user;
    }

    public function login(array $input): array
    {
        if (LocalAccess::enabled($this->config)) { throw new HttpError(409, 'local_bootstrap_required', 'Use the local session bootstrap.'); }
        $email = Validation::email($input['email'] ?? null);
        $password = Validation::password($input['password'] ?? null);
        $pdo = ($this->database)();
        $this->reserveLoginAttempt($pdo, $email);
        $q = $pdo->prepare('SELECT id, password_hash, role, active FROM users WHERE email = ?');
        $q->execute([$email]);
        $user = $q->fetch();
        $valid = password_verify($password, $user['password_hash'] ?? self::DUMMY_HASH);
        if (!$valid || !$user || (int) $user['active'] !== 1 || $user['role'] !== 'admin') {
            throw new HttpError(401, 'invalid_credentials', 'Invalid email or password.');
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_BCRYPT, ['cost' => 12])) {
            $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?')->execute([$hash, $user['id']]);
        }
        $this->reset();
        $_SESSION['user_id'] = (string) $user['id'];
        $_SESSION['access_mode'] = 'AUTHENTICATED';
        $_SESSION['authenticated_at'] = $_SESSION['last_seen'] = $_SESSION['rotated_at'] = time();
        return ['accessMode'=>'AUTHENTICATED','phoneNfcOrigin'=>$this->config['phone_nfc_origin']??null,'authenticated' => true, 'user' => ['id' => (string) $user['id'], 'email' => $email, 'role' => 'admin'], 'csrfToken' => $_SESSION['csrf']];
    }

    public function logout(): array
    {
        $this->reset();
        return ['authenticated' => false, 'user' => null, 'csrfToken' => $_SESSION['csrf']];
    }

    private function localBinding(): string
    {
        return hash_hmac('sha256', $this->config['database']['name'] . ':' . $this->config['local_user_id'], $this->config['local_bridge_token']);
    }

    public function localBootstrap(): array
    {
        if (!LocalAccess::enabled($this->config)) { throw new HttpError(404, 'not_found', 'Local bootstrap is disabled.'); }
        LocalAccess::check($this->config, $_SERVER);
        $this->csrf();
        $q = ($this->database)()->prepare("SELECT id, email, role, active FROM users WHERE id = ?");
        $q->execute([$this->config['local_user_id']]);
        $user = $q->fetch();
        if (!$user || (int)$user['active'] !== 1 || $user['role'] !== 'admin') { throw new HttpError(403, 'local_actor_unavailable', 'Configured local operator is unavailable.'); }
        $this->reset();
        $_SESSION['user_id'] = (string)$user['id'];
        $_SESSION['access_mode'] = 'LOCAL_SINGLE_USER';
        $_SESSION['local_binding'] = $this->localBinding();
        $_SESSION['authenticated_at'] = $_SESSION['last_seen'] = $_SESSION['rotated_at'] = time();
        unset($user['active']); $user['id'] = (string)$user['id'];
        return ['authenticated' => true, 'user' => $user, 'csrfToken' => $_SESSION['csrf'], 'accessMode' => 'LOCAL_SINGLE_USER'];
    }

    private function reset(): void
    {
        $_SESSION = [];
        if (!session_regenerate_id(true)) {
            throw new \RuntimeException('Session rotation failed.');
        }
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    private function reserveLoginAttempt(\PDO $pdo, string $email): void
    {
        // Never trust client-supplied Forwarded/X-Forwarded-For headers.
        $buckets = [
            hash_hmac('sha256', 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), $this->config['app_key']) => 30,
            hash_hmac('sha256', 'account:' . $email, $this->config['app_key']) => 10,
        ];
        $pdo->beginTransaction();
        try {
            $blocked = false;
            foreach ($buckets as $bucket => $limit) {
                $q = $pdo->prepare('INSERT INTO login_throttles (bucket, attempts, window_started) VALUES (?, 0, UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE bucket = bucket');
                $q->execute([$bucket]);
                $q = $pdo->prepare('SELECT attempts, TIMESTAMPDIFF(SECOND, window_started, UTC_TIMESTAMP(6)) AS age FROM login_throttles WHERE bucket = ? FOR UPDATE');
                $q->execute([$bucket]);
                $row = $q->fetch();
                $attempts = (int) $row['age'] >= 900 ? 0 : (int) $row['attempts'];
                if ($attempts >= $limit) {
                    $blocked = true;
                    break;
                } else {
                    $q = $pdo->prepare('UPDATE login_throttles SET attempts = ?, window_started = IF(? = 0, UTC_TIMESTAMP(6), window_started) WHERE bucket = ?');
                    $q->execute([$attempts + 1, $attempts, $bucket]);
                }
            }
            $pdo->commit();
            if ($blocked) {
                header('Retry-After: 900');
                throw new HttpError(429, 'login_throttled', 'Too many sign-in attempts. Try again later.');
            }
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
