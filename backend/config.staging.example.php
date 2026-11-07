<?php
declare(strict_types=1);
// Private staging-only template. Never place this file beneath a web root.
// No fallback to production credentials, database, origin or local bootstrap.
$required=static function(string $name):string{
    $value=getenv($name);
    if(!is_string($value)||$value==='')throw new RuntimeException('Private staging environment is incomplete.');
    return $value;
};
$origin=$required('DLOOP_STAGING_ORIGIN');
$parts=parse_url($origin);
if(!$parts||($parts['scheme']??'')!=='https'||!isset($parts['host'])
    ||isset($parts['user'])||isset($parts['pass'])||isset($parts['path'])
    ||isset($parts['query'])||isset($parts['fragment'])
    ||strtolower($parts['host'])==='fila.dlts.in'){
    throw new RuntimeException('A separate HTTPS staging origin is required.');
}
$name=$required('DLOOP_STAGING_DB_NAME');
$user=$required('DLOOP_STAGING_DB_USER');
if(in_array(strtolower($name),['dltsin_fila','dloop_personal'],true)
    ||str_contains(strtolower($name),'phase5a')
    ||in_array(strtolower($user),['dltsin_fila','dloop_personal_runtime'],true)){
    throw new RuntimeException('Separate staging database and database login required.');
}
$profile=getenv('DLOOP_STAGING_WIFI_PROFILE') ?: 'disabled';
if (!in_array($profile,['disabled','wifi-enabled'],true)
    || (getenv('DLOOP_STAGING_WIFI_SCALE_ENABLED')==='1' && $profile!=='wifi-enabled')) {
    throw new RuntimeException('Explicit staging Wi-Fi profile required.');
}
return [
    // "production" selects HTTPS/cookie hardening, not the deployment target.
    'environment'=>'production',
    'access_mode'=>'AUTHENTICATED',
    'allowed_origins'=>[$origin],
    'phone_nfc_origin'=>$origin,
    'app_key'=>$required('DLOOP_STAGING_APP_KEY'),
    'session_dir'=>__DIR__.'/var/sessions',
    'session_idle_seconds'=>1800,
    'session_absolute_seconds'=>28800,
    'staging_wifi_profile'=>$profile,
    'wifi_scale_enabled'=>$profile==='wifi-enabled',
    'database'=>[
        'host'=>'localhost','port'=>3306,'name'=>$name,'user'=>$user,
        'password'=>$required('DLOOP_STAGING_DB_PASSWORD'),
    ],
];
