<?php
declare(strict_types=1);

// Copy to config.local.php OUTSIDE the public document root. No real credentials here.
return [
    'environment' => 'local', // production on cPanel
    'allowed_origins' => ['http://127.0.0.1:5173', 'http://localhost:5173'],
    'app_key' => '', // at least 32 random bytes, e.g. bin2hex(random_bytes(32))
    'session_dir' => __DIR__ . '/var/sessions', // private, writable by PHP only
    'session_idle_seconds' => 1800,
    'session_absolute_seconds' => 28800,
    'database' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => '',
        'user' => '',
        'password' => '',
        // Use local socket/localhost on cPanel; remote DB transport needs verified TLS.
    ],
];
