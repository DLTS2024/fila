<?php
declare(strict_types=1);
namespace DLoop;

// Short-lived selection only. Never changes inventory, tags or measurements.
final class SpoolSelection
{
    public function __construct(private array $config, private \PDO $db) {}

    public function exchange(string $actor, array $server, ?string $spoolId = null): array
    {
        if (($this->config['access_mode'] ?? 'AUTHENTICATED') !== 'AUTHENTICATED'
            || empty($this->config['phone_nfc_origin'])
            || !(($server['HTTPS'] ?? '') === 'on' || ($server['HTTPS'] ?? '') === '1' || (string)($server['SERVER_PORT'] ?? '') === '443')) {
            throw new HttpError(403, 'secure_sync_required', 'Selection sync requires an authenticated HTTPS deployment; localhost mode stays private.');
        }
        if ($spoolId !== null && !$this->active($spoolId)) throw new HttpError(422, 'unknown_spool', 'Select an existing active spool.');
        $file = $this->config['session_dir'].'/spool-selection-'.hash_hmac('sha256', $actor, $this->config['app_key']).'.json';
        $handle = fopen($file, 'c+');
        if (!$handle) throw new \RuntimeException('Selection store unavailable.');
        try {
            if (!flock($handle, LOCK_EX)) throw new \RuntimeException('Selection lock unavailable.');
            if ($spoolId !== null) {
                $data = ['spoolId'=>$spoolId, 'eventId'=>bin2hex(random_bytes(16)), 'expiresAt'=>time()+120];
                $encoded = json_encode($data, JSON_THROW_ON_ERROR);
                rewind($handle);if(!ftruncate($handle,0)||fwrite($handle,$encoded)!==strlen($encoded)||!fflush($handle))throw new \RuntimeException('Selection write failed.');
            } else {
                $encoded = stream_get_contents($handle, 4097);
                $data = strlen($encoded)>4096 ? null : json_decode($encoded, true);
            }
            if (!is_array($data) || !is_int($data['expiresAt']??null) || $data['expiresAt'] <= time()
                || !is_string($data['eventId']??null) || !preg_match('/^[a-f0-9]{32}$/D',$data['eventId'])
                || !is_string($data['spoolId']??null) || !$this->active($data['spoolId'])) return ['selection'=>null];
            return ['selection'=>$data];
        } finally { flock($handle,LOCK_UN);fclose($handle); }
    }

    private function active(string $id): bool
    {
        if(!preg_match('/^[a-f0-9-]{36}$/D',$id))return false;
        $q=$this->db->prepare("SELECT COUNT(*) FROM spools WHERE id=? AND status='active'");$q->execute([$id]);
        return (int)$q->fetchColumn()===1;
    }
}
