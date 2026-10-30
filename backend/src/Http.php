<?php
declare(strict_types=1);

namespace DLoop;

final class HttpError extends \RuntimeException
{
    public function __construct(public int $status, public string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}

final class Http
{
    public static function json(int $status, array $payload): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        echo json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function body(array $keys): array
    {
        if (!preg_match('~^application/json(?:\s*;\s*charset=utf-8)?$~i', $_SERVER['CONTENT_TYPE'] ?? '')) {
            throw new HttpError(415, 'unsupported_media_type', 'Use application/json.');
        }
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) {
            throw new HttpError(413, 'request_too_large', 'Request body exceeds 8 KiB.');
        }
        $raw = file_get_contents('php://input', false, null, 0, 8193);
        if ($raw === false || strlen($raw) > 8192) {
            throw new HttpError(413, 'request_too_large', 'Request body exceeds 8 KiB.');
        }
        try {
            $object = json_decode($raw, false, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new HttpError(400, 'invalid_json', 'A valid JSON object is required.');
        }
        if (!$object instanceof \stdClass) {
            throw new HttpError(400, 'invalid_json', 'A JSON object is required.');
        }
        $data = (array) $object;
        Validation::keys($data, $keys);
        return $data;
    }
}
