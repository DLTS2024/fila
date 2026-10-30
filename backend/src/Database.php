<?php
declare(strict_types=1);

namespace DLoop;

final class Database
{
    public static function connect(array $config): \PDO
    {
        $d = $config['database'];
        $pdo = new \PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $d['host'], $d['port'], $d['name']), $d['user'], $d['password'], [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
            \PDO::ATTR_PERSISTENT => false,
            \PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
        $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
        if (stripos($version, 'MariaDB') !== false) {
            preg_match('/(\d+\.\d+\.\d+)-MariaDB/i', $version, $match);
            $supported = isset($match[1]) && version_compare($match[1], '10.6.0', '>=');
        } else {
            preg_match('/^(\d+\.\d+\.\d+)/', $version, $match);
            $supported = isset($match[1]) && version_compare($match[1], '8.0.16', '>=');
        }
        if (!$supported) { throw new \RuntimeException('Database version lacks required enforced constraints.'); }
        return $pdo;
    }
}
