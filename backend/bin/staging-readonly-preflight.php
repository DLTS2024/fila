<?php
declare(strict_types=1);
namespace DLoop\StagingPreflight;
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors','0');
ini_set('log_errors','0');
set_error_handler(static function (): never { throw new \RuntimeException(); });
try {
    if (count($argv) !== 1 || PHP_VERSION_ID < 80300 || PHP_INT_SIZE !== 8) throw new \RuntimeException();
    if (!extension_loaded('pdo_mysql')) { echo "FAIL: PDO_MYSQL_REQUIRED\n"; exit(1); }
    $root=dirname(__DIR__);
    if (!putenv('DLOOP_CONFIG_FILE='.$root.'/config.local.php')) throw new \RuntimeException();
    require_once $root.'/src/bootstrap.php';
    $c=\DLoop\Config::load($root);
    // Legacy reviewed file-backed configs have an explicit boolean but no profile key.
    $profile=array_key_exists('staging_wifi_profile',$c)?$c['staging_wifi_profile']:(($c['wifi_scale_enabled']??null)===true?'wifi-enabled':'disabled');
    if ($c['environment']!=='production' || $c['access_mode']!=='AUTHENTICATED'
        || $c['database']['name']!=='dltsin_fila_stage' || $c['database']['user']!=='dltsin_fila_stage'
        || $c['database']['host']!=='localhost' || $c['database']['port']!==3306
        || $c['allowed_origins']!==['https://staging-fila.dlts.in']
        || ($c['phone_nfc_origin']??null)!=='https://staging-fila.dlts.in'
        || (!in_array($profile, ['disabled','wifi-enabled'], true) || ($c['wifi_scale_enabled'] ?? null) !== (($profile) === 'wifi-enabled'))) throw new \RuntimeException();
    // First connection occurs only inside the original read-only preflight below.
    require $root.'/bin/production-preflight.php';
    $argv=[$root.'/bin/migrate.php','--status'];
    require $root.'/bin/migrate.php';
} catch (\Throwable $e) {
    echo "FAIL: STAGING_READONLY_PREFLIGHT\n";
    exit(1);
}
