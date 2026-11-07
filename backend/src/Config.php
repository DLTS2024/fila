<?php
declare(strict_types=1);

namespace DLoop;

final class Config
{
    public static function load(string $appRoot): array
    {
        $file = getenv('DLOOP_CONFIG_FILE') ?: $appRoot . '/config.local.php';
        $real = realpath($file);
        if ($real === false || !is_file($real)) {
            throw new \RuntimeException('Private configuration is unavailable.');
        }
        $public = realpath(PHP_SAPI === 'cli' ? $appRoot . '/public' : (($_SERVER['DOCUMENT_ROOT'] ?? '') ?: $appRoot . '/public'));
        if ($public && self::within($real, $public)) {
            throw new \RuntimeException('Configuration must be outside the document root.');
        }
        ob_start();
        try {
            $c = require $real;
            $output = ob_get_clean();
        } catch (\Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        if ($output !== '') { throw new \RuntimeException('Private configuration must not emit output.'); }
        if (!is_array($c) || !in_array($c['environment'] ?? '', ['local', 'production'], true)
            || !is_string($c['app_key'] ?? null) || strlen($c['app_key']) < 32
            || !is_array($c['allowed_origins'] ?? null) || !$c['allowed_origins']) {
            throw new \RuntimeException('Invalid private configuration.');
        }
        foreach ($c['allowed_origins'] as $origin) {
            $parts = is_string($origin) ? parse_url($origin) : false;
            if (!$parts || !isset($parts['scheme'], $parts['host'])
                || isset($parts['path']) || isset($parts['query']) || isset($parts['fragment']) || isset($parts['user'])
                || !in_array($parts['scheme'], ['http', 'https'], true)
                || ($parts['scheme'] !== 'https' && ($c['environment'] !== 'local' || !in_array($parts['host'], ['localhost', '127.0.0.1', '[::1]'], true)))) {
                throw new \RuntimeException('Invalid allowed origin.');
            }
        }
        $sessionDir = realpath($c['session_dir'] ?? '');
        if (!$sessionDir || !is_dir($sessionDir) || !is_writable($sessionDir)
            || ($public && self::within($sessionDir, $public))) {
            throw new \RuntimeException('Private session directory is unavailable.');
        }
        foreach (['session_idle_seconds', 'session_absolute_seconds'] as $key) {
            if (!is_int($c[$key] ?? null) || $c[$key] < 60 || $c[$key] > 86400) {
                throw new \RuntimeException('Invalid session lifetime.');
            }
        }
        $db = $c['database'] ?? [];
        if (!is_array($db) || !preg_match('/^[A-Za-z0-9_]+$/D', $db['name'] ?? '')
            || !is_string($db['user'] ?? null) || $db['user'] === ''
            || !is_string($db['password'] ?? null) || !is_string($db['host'] ?? null)
            || !preg_match('/^[A-Za-z0-9.:-]+$/D', $db['host'])
            || !is_int($db['port'] ?? null) || $db['port'] < 1 || $db['port'] > 65535
            || ($c['environment'] === 'production' && ($db['password'] === '' || !in_array($db['host'], ['localhost', '127.0.0.1', '::1'], true)))) {
            throw new \RuntimeException('Invalid database configuration.');
        }
        if(isset($c['phone_nfc_origin'])){
            $phone=parse_url($c['phone_nfc_origin']);
            if(!$phone||($phone['scheme']??'')!=='https'||isset($phone['user'])||isset($phone['pass'])||isset($phone['query'])||isset($phone['fragment'])||isset($phone['path'])||!in_array($c['phone_nfc_origin'],$c['allowed_origins'],true)||($c['access_mode']??'AUTHENTICATED')!=='AUTHENTICATED')throw new \RuntimeException('Phone NFC origin requires an authenticated HTTPS deployment.');
        }
        LocalAccess::validate($c);
        if(isset($c['wifi_scale_enabled'])&&!is_bool($c['wifi_scale_enabled']))throw new \RuntimeException('Invalid Wi-Fi scale configuration.');
        if(($c['wifi_scale_enabled']??false)&&PHP_INT_SIZE<8)throw new \RuntimeException('Wi-Fi scale timestamps require 64-bit PHP.');
        if(($c['wifi_scale_enabled']??false)&&LocalAccess::enabled($c))throw new \RuntimeException('Public device uploads require authenticated mode.');
        // Staging opt-in must never enable a production identity, even outside CLI validation.
        if (isset($c['staging_wifi_profile'])) {
            $profile = $c['staging_wifi_profile'];
            if (!in_array($profile, ['disabled', 'wifi-enabled'], true)
                || ($c['wifi_scale_enabled'] ?? null) !== ($profile === 'wifi-enabled')
                || $c['environment'] !== 'production' || ($c['access_mode'] ?? '') !== 'AUTHENTICATED'
                || $db['name'] !== 'dltsin_fila_stage' || $db['user'] !== 'dltsin_fila_stage'
                || $db['host'] !== 'localhost' || $db['port'] !== 3306
                || $c['allowed_origins'] !== ['https://staging-fila.dlts.in']
                || ($c['phone_nfc_origin'] ?? '') !== 'https://staging-fila.dlts.in') {
                throw new \RuntimeException('Invalid staging deployment identity or Wi-Fi profile.');
            }
        }
        return $c;
    }

    private static function within(string $path, string $directory): bool
    {
        $path = str_replace('\\', '/', $path);
        $directory = rtrim(str_replace('\\', '/', $directory), '/') . '/';
        return str_starts_with(strtolower($path), strtolower($directory));
    }
}
