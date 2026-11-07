<?php
declare(strict_types=1);
namespace DLoop;

final class LocalAccess
{
    public static function enabled(array $config): bool { return ($config['access_mode'] ?? 'AUTHENTICATED') === 'LOCAL_SINGLE_USER'; }

    public static function validate(array $config): void
    {
        $mode = $config['access_mode'] ?? 'AUTHENTICATED';
        if (!in_array($mode, ['AUTHENTICATED', 'LOCAL_SINGLE_USER'], true)) { throw new \RuntimeException('Invalid access mode.'); }
        if (!self::enabled($config)) { return; }
        if (($config['environment'] ?? '') !== 'local' ||
            !is_string($config['local_bridge_token'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $config['local_bridge_token']) ||
            !is_string($config['local_user_id'] ?? null) || !preg_match('/^[1-9][0-9]*$/D', $config['local_user_id'])) {
            throw new \RuntimeException('Local mode requires a local environment, private bridge token and explicit actor.');
        }
        foreach ($config['allowed_origins'] ?? [] as $origin) {
            $parts = parse_url($origin);
            if (!$parts || ($parts['scheme'] ?? '') !== 'http' || !in_array($parts['host'] ?? '', ['localhost','127.0.0.1','[::1]'], true)) {
                throw new \RuntimeException('Local mode requires literal loopback origins.');
            }
        }
    }

    public static function check(array $config, array $server): void
    {
        if (!self::enabled($config)) { return; }
        $deny = static function (): never { throw new HttpError(403, 'local_access_denied', 'This studio accepts trusted local connections only.'); };
        if (!in_array($server['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'], true)) { $deny(); }
        $bind = $server['SERVER_ADDR'] ?? (PHP_SAPI === 'cli-server' ? ($server['SERVER_NAME'] ?? '') : '');
        if (!in_array($bind, ['127.0.0.1','::1','localhost'], true)) { $deny(); }
        $host = $server['HTTP_HOST'] ?? '';
        if (!preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?$/D', $host, $m) || (isset($m[2]) && (int)$m[2] > 65535)) { $deny(); }
        foreach (['HTTP_FORWARDED','HTTP_X_FORWARDED_FOR','HTTP_X_FORWARDED_HOST','HTTP_X_FORWARDED_PROTO','HTTP_X_REAL_IP'] as $header) {
            if (isset($server[$header])) { $deny(); }
        }
        if (!is_string($server['HTTP_X_DLOOP_LOCAL_BRIDGE'] ?? null) || !hash_equals($config['local_bridge_token'], $server['HTTP_X_DLOOP_LOCAL_BRIDGE'])) { $deny(); }
        $site = $server['HTTP_SEC_FETCH_SITE'] ?? '';
        if (!in_array($site, ['', 'none', 'same-origin'], true)) { $deny(); }
        if (isset($server['HTTP_ORIGIN']) && !in_array($server['HTTP_ORIGIN'], $config['allowed_origins'], true)) { $deny(); }
        if (isset($server['HTTP_REFERER'])) {
            $r = parse_url($server['HTTP_REFERER']);
            $origin = ($r['scheme'] ?? '') . '://' . ($r['host'] ?? '') . (isset($r['port']) ? ':' . $r['port'] : '');
            if (!in_array($origin, $config['allowed_origins'], true)) { $deny(); }
        }
    }
}
