<?php
declare(strict_types=1);

// Intentionally NOT common.php: this command must never execute DB/admin tools.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static function (): never { throw new RuntimeException('Validation failed.'); });
$initialBufferLevel = ob_get_level();
ob_start();
try {
    if (count($argv) !== 1) throw new RuntimeException('No arguments accepted.');
    $root = dirname(__DIR__);
    // Only nonsecret process-local path selection. Ignore inherited overrides.
    putenv('DLOOP_CONFIG_FILE='.$root.'/config.local.php');
    require_once $root.'/src/bootstrap.php';
    $c = \DLoop\Config::load($root);
    // Legacy reviewed file-backed configs have an explicit boolean but no profile key.
    $profile=array_key_exists('staging_wifi_profile',$c)?$c['staging_wifi_profile']:(($c['wifi_scale_enabled']??null)===true?'wifi-enabled':'disabled');
    if ($c['environment'] !== 'production' || $c['access_mode'] !== 'AUTHENTICATED'
        || $c['allowed_origins'] !== ['https://staging-fila.dlts.in']
        || ($c['phone_nfc_origin'] ?? null) !== 'https://staging-fila.dlts.in'
        || $c['database']['name'] !== 'dltsin_fila_stage' || $c['database']['user'] !== 'dltsin_fila_stage'
        || $c['database']['host'] !== 'localhost' || $c['database']['port'] !== 3306
        || (!in_array($profile, ['disabled','wifi-enabled'], true) || ($c['wifi_scale_enabled'] ?? null) !== (($profile) === 'wifi-enabled')) || PHP_INT_SIZE !== 8) {
        throw new RuntimeException('Validation failed.');
    }
    if (ob_get_length() !== 0) throw new RuntimeException('Unexpected output.');
    while (ob_get_level() > $initialBufferLevel) ob_end_clean();
    echo "PASS: staging configuration valid; no database connection attempted.\n";
} catch (Throwable $e) {
    while (ob_get_level() > $initialBufferLevel) ob_end_clean();
    echo "FAIL: staging configuration validation failed.\n";
    exit(1);
}
