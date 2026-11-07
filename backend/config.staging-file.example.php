<?php
declare(strict_types=1);

// Install only as the staging private config.local.php. No environment secrets.
return (static function (): array {
    // Explicit deployment profile; environment variables cannot enable this file.
    $profile = 'disabled'; // Use 'wifi-enabled' only for reviewed staging deployment.
    if (!in_array($profile, ['disabled', 'wifi-enabled'], true)) throw new RuntimeException('Invalid staging profile.');
    $root = realpath(__DIR__);
    $secret = realpath(__DIR__.'/secrets/staging-secrets.json');
    $inside = static function (string $file, string $directory): bool {
        return str_starts_with(str_replace('\\', '/', $file), rtrim(str_replace('\\', '/', $directory), '/').'/');
    };
    if (!$root || !$secret || !$inside($secret, $root) || !is_file($secret) || !is_readable($secret)) {
        throw new RuntimeException('Private staging configuration unavailable.');
    }
    foreach (['/home4/dltsin/public_html', $_SERVER['DOCUMENT_ROOT'] ?? ''] as $directory) {
        $public = $directory !== '' ? realpath($directory) : false;
        if ($public && ($inside($root, $public) || $root === $public || $inside($secret, $public))) {
            throw new RuntimeException('Private staging configuration unavailable.');
        }
    }
    // Hosting is Linux. Reject group/world access and mismatched ownership.
    if (PHP_OS_FAMILY !== 'Windows') {
        foreach ([$root, __FILE__, $root.'/secrets', $secret] as $private) {
            $mode = fileperms($private);
            if ($mode === false || ($mode & 0077) !== 0 || fileowner($private) !== fileowner(__FILE__)) {
                throw new RuntimeException('Private staging configuration unavailable.');
            }
        }
    }
    if (filesize($secret) > 8192) throw new RuntimeException('Private staging configuration unavailable.');
    $values = json_decode(file_get_contents($secret), true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($values) || count($values) !== 2 || !isset($values['databasePassword'], $values['appKey'])
        || !is_string($values['databasePassword']) || $values['databasePassword'] === ''
        || !is_string($values['appKey']) || strlen($values['appKey']) < 32
        || str_contains($values['databasePassword'], "\0") || str_contains($values['appKey'], "\0")) {
        throw new RuntimeException('Private staging configuration unavailable.');
    }
    return [
        'environment'=>'production',
        'access_mode'=>'AUTHENTICATED',
        'allowed_origins'=>['https://staging-fila.dlts.in'],
        'phone_nfc_origin'=>'https://staging-fila.dlts.in',
        'app_key'=>$values['appKey'],
        'session_dir'=>$root.'/var/sessions',
        'session_idle_seconds'=>1800,
        'session_absolute_seconds'=>28800,
        'staging_wifi_profile'=>$profile,
        'wifi_scale_enabled'=>$profile === 'wifi-enabled',
        'database'=>[
            'host'=>'localhost', 'port'=>3306,
            'name'=>'dltsin_fila_stage', 'user'=>'dltsin_fila_stage',
            'password'=>$values['databasePassword'],
        ],
    ];
})();
