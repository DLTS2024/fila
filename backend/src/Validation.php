<?php
declare(strict_types=1);

namespace DLoop;

final class Validation
{
    public static function keys(array $input, array $allowed): void
    {
        if (array_diff(array_keys($input), $allowed)) {
            throw new HttpError(422, 'validation_error', 'Unexpected request fields.');
        }
    }

    public static function email(mixed $value): string
    {
        if (!is_string($value) || strlen($value) > 254 || !filter_var($value, FILTER_VALIDATE_EMAIL)
            || !preg_match('/^[\x21-\x7E]+$/D', $value)) {
            throw new HttpError(422, 'validation_error', 'A valid email address is required.');
        }
        return strtolower($value);
    }

    public static function password(mixed $value, bool $new = false): string
    {
        if (!is_string($value) || strlen($value) < ($new ? 12 : 1) || strlen($value) > 72 || str_contains($value, "\0")) {
            throw new HttpError(422, 'validation_error', $new ? 'Password must be 12–72 bytes.' : 'Invalid password format.');
        }
        return $value;
    }

    public static function integer(mixed $value, int $min, int $max, int $default): int
    {
        if ($value === null) {
            return $default;
        }
        if (!is_string($value) || !preg_match('/^(0|[1-9][0-9]{0,8})$/D', $value) || (int) $value < $min || (int) $value > $max) {
            throw new HttpError(422, 'validation_error', 'Invalid pagination or filter value.');
        }
        return (int) $value;
    }

    public static function text(mixed $value, int $max): string
    {
        if (!is_string($value) || strlen($value) > $max || preg_match('//u', $value) !== 1 || preg_match('/[\x00-\x1F\x7F]/', $value)) {
            throw new HttpError(422, 'validation_error', 'Invalid text filter.');
        }
        return trim($value);
    }
}
