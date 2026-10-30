<?php
declare(strict_types=1);

// Local PHP built-in server router. Never deploy this file to the public root.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (is_string($path) && ($path === '/api/v1' || str_starts_with($path, '/api/v1/'))) {
    require __DIR__ . '/public/api/v1/index.php';
    return true;
}
http_response_code(404);
header('Content-Type: application/json; charset=utf-8');
echo '{"error":"Not found.","code":"not_found"}';
return true;
