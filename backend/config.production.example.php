<?php
declare(strict_types=1);
// Install OUTSIDE every public root. Set environment values privately in the PHP
// hosting handler. No VITE_* variables, credentials in .htaccess, or public .env.
$required=static function(string $name):string{$value=getenv($name);if(!is_string($value)||$value==='')throw new RuntimeException('Required private production environment is unavailable.');return $value;};
$origin=getenv('DLOOP_STUDIO_ORIGIN')?:'https://fila.dlts.in';
return [
 'environment'=>'production','access_mode'=>'AUTHENTICATED',
 'allowed_origins'=>[$origin],'phone_nfc_origin'=>$origin,
 'app_key'=>$required('DLOOP_APP_KEY'),'session_dir'=>__DIR__.'/var/sessions',
 'session_idle_seconds'=>1800,'session_absolute_seconds'=>28800,
 'wifi_scale_enabled'=>getenv('DLOOP_WIFI_SCALE_ENABLED')==='1',
 'database'=>['host'=>'localhost','port'=>3306,'name'=>getenv('DLOOP_DB_NAME')?:'dltsin_fila','user'=>getenv('DLOOP_DB_USER')?:'dltsin_fila','password'=>$required('DLOOP_DB_PASSWORD')],
];
