<?php
declare(strict_types=1);

namespace DLoop;

final class Api
{
    private ?\PDO $pdo = null;

    public function __construct(private array $config) {}

    private function db(): \PDO
    {
        return $this->pdo ??= Database::connect($this->config);
    }

    public function dispatch(): void
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $routes = [
            '/api/v1/auth/session' => 'GET', '/api/v1/auth/login' => 'POST', '/api/v1/auth/logout' => 'POST',
            '/api/v1/dashboard' => 'GET', '/api/v1/brands' => 'GET', '/api/v1/tare-profiles' => 'GET', '/api/v1/spools' => 'GET',
        ];
        if (!is_string($path) || !isset($routes[$path])) {
            throw new HttpError(404, 'not_found', 'API route not found.');
        }
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== $routes[$path]) {
            header('Allow: ' . $routes[$path]);
            throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
        }
        $auth = new Auth($this->config, fn () => $this->db());
        $auth->start();
        if ($path === '/api/v1/auth/session') {
            Validation::keys($_GET, []);
            $user = $auth->user();
            Http::json(200, ['data' => ['authenticated' => $user !== null, 'user' => $user, 'csrfToken' => $_SESSION['csrf']]]);
        }
        if ($routes[$path] === 'POST') {
            Validation::keys($_GET, []);
            $auth->csrf();
            if ($path === '/api/v1/auth/login') {
                Http::json(200, ['data' => $auth->login(Http::body(['email', 'password']))]);
            }
            $auth->requireAdmin();
            Http::body([]);
            Http::json(200, ['data' => $auth->logout()]);
        }
        $auth->requireAdmin();
        $result = match ($path) {
            '/api/v1/dashboard' => $this->dashboard(),
            '/api/v1/brands' => $this->brands(),
            '/api/v1/tare-profiles' => $this->tareProfiles(),
            '/api/v1/spools' => $this->spools(),
        };
        Http::json(200, $result);
    }

    private function dashboard(): array
    {
        Validation::keys($_GET, []);
        $row = $this->db()->query("SELECT COUNT(*) AS total_spools, COALESCE(SUM(remaining_g), 0) AS remaining_g, COALESCE(SUM(remaining_g > 0 AND remaining_g < 200), 0) AS low_stock_spools, COALESCE(SUM(remaining_g = 0), 0) AS empty_spools FROM spools WHERE status = 'active'")->fetch();
        return ['data' => ['totalSpools' => (int) $row['total_spools'], 'remainingG' => (string) $row['remaining_g'], 'lowStockSpools' => (int) $row['low_stock_spools'], 'emptySpools' => (int) $row['empty_spools'], 'lowStockThresholdG' => '200.00']];
    }

    private function pagination(array $allowed): array
    {
        Validation::keys($_GET, array_merge(['limit', 'offset'], $allowed));
        return [Validation::integer($_GET['limit'] ?? null, 1, 100, 50), Validation::integer($_GET['offset'] ?? null, 0, 1000000, 0)];
    }

    private function listing(string $select, string $from, array $where, array $params, string $order, int $limit, int $offset): array
    {
        $clause = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $pdo = $this->db();
        // All SQL fragments are internal constants. Only validated values are parameters.
        $pdo->beginTransaction();
        try {
            $q = $pdo->prepare('SELECT COUNT(*) FROM ' . $from . $clause);
            $q->execute($params);
            $total = (int) $q->fetchColumn();
            $q = $pdo->prepare('SELECT ' . $select . ' FROM ' . $from . $clause . ' ORDER BY ' . $order . ' LIMIT ? OFFSET ?');
            foreach ($params as $i => $value) {
                $q->bindValue($i + 1, $value);
            }
            $q->bindValue(count($params) + 1, $limit, \PDO::PARAM_INT);
            $q->bindValue(count($params) + 2, $offset, \PDO::PARAM_INT);
            $q->execute();
            $rows = $q->fetchAll();
            $pdo->commit();
            return ['data' => $rows, 'meta' => ['total' => $total, 'limit' => $limit, 'offset' => $offset]];
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    private function brands(): array
    {
        [$limit, $offset] = $this->pagination(['q']);
        $where = []; $params = [];
        if (isset($_GET['q'])) {
            $where[] = 'LOCATE(?, name) > 0';
            $params[] = Validation::text($_GET['q'], 150);
        }
        return $this->listing('id, name', 'brands', $where, $params, 'name, id', $limit, $offset);
    }

    private function tareProfiles(): array
    {
        [$limit, $offset] = $this->pagination(['brand_id']);
        $where = []; $params = [];
        if (isset($_GET['brand_id'])) {
            $where[] = 't.brand_id = ?';
            $params[] = Validation::integer($_GET['brand_id'], 1, 999999999, 1);
        }
        return $this->listing('t.id, t.brand_id, b.name AS brand, t.spool_type, t.nominal_capacity_g, t.empty_mass_g, t.verified_at, t.notes', 'tare_profiles t JOIN brands b ON b.id = t.brand_id', $where, $params, 'b.name, t.spool_type, t.id', $limit, $offset);
    }

    private function spools(): array
    {
        [$limit, $offset] = $this->pagination(['q', 'brand_id', 'material', 'status', 'low_stock']);
        $where = []; $params = [];
        $status = isset($_GET['status']) ? Validation::text($_GET['status'], 20) : 'active';
        if (!in_array($status, ['active', 'archived'], true)) {
            throw new HttpError(422, 'validation_error', 'Invalid spool status.');
        }
        $where[] = 's.status = ?'; $params[] = $status;
        if (isset($_GET['q'])) {
            $value = Validation::text($_GET['q'], 150);
            $where[] = '(LOCATE(?, s.name) > 0 OR LOCATE(?, s.code) > 0 OR LOCATE(?, b.name) > 0)';
            array_push($params, $value, $value, $value);
        }
        if (isset($_GET['brand_id'])) {
            $where[] = 's.brand_id = ?'; $params[] = Validation::integer($_GET['brand_id'], 1, 999999999, 1);
        }
        if (isset($_GET['material'])) {
            $where[] = 's.material = ?'; $params[] = Validation::text($_GET['material'], 30);
        }
        if (isset($_GET['low_stock'])) {
            $low = Validation::integer($_GET['low_stock'], 0, 1, 0);
            if ($low === 1) { $where[] = 's.remaining_g > 0 AND s.remaining_g < 200'; }
        }
        return $this->listing('s.id, s.code, s.name, s.brand_id, b.name AS brand, s.catalogue_product_id, s.tare_profile_id, s.tare_override_g, COALESCE(s.tare_override_g, t.empty_mass_g) AS effective_tare_g, s.material, s.color_name, s.color_hex, s.nominal_capacity_g, s.initial_filament_g, s.remaining_g, s.last_gross_g, s.measured, s.location, s.status, s.version, s.created_at, s.updated_at, n.uid AS nfc_uid', 'spools s JOIN brands b ON b.id = s.brand_id LEFT JOIN tare_profiles t ON t.id = s.tare_profile_id LEFT JOIN nfc_tags n ON n.spool_id = s.id', $where, $params, 's.created_at DESC, s.id', $limit, $offset);
    }
}
