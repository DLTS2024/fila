<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';
use DLoop\Validation;
use DLoop\HttpError;

$checks = 0;
function check(bool $value, string $label): void {
    global $checks;
    if (!$value) { throw new RuntimeException('Failed: ' . $label); }
    $checks++;
}
function rejects(callable $call, int $status = 422): void {
    try { $call(); } catch (HttpError $e) { check($e->status === $status, 'HTTP validation status'); return; }
    throw new RuntimeException('Invalid value accepted.');
}
check(Validation::email('ADMIN@example.com') === 'admin@example.com', 'Email normalization');
rejects(fn () => Validation::email(['email']));
rejects(fn () => Validation::email('not an email'));
rejects(fn () => Validation::keys(['injected' => 1], ['email']));
check(Validation::password('valid-password-123', true) === 'valid-password-123', 'New password');
rejects(fn () => Validation::password('short', true));
rejects(fn () => Validation::password(str_repeat('x', 73), true));
rejects(fn () => Validation::password("embedded\0nul"));
check(Validation::integer('100', 1, 100, 50) === 100, 'Integer boundary');
check(Validation::integer(null, 1, 100, 50) === 50, 'Integer default');
foreach (['1e2', '-1', '01', '101', ['1']] as $bad) { rejects(fn () => Validation::integer($bad, 1, 100, 50)); }
rejects(fn () => Validation::text("bad\ntext", 150));
rejects(fn () => Validation::text("\xff", 150));
rejects(fn () => Validation::text(['array'], 150));
check(Validation::text(' PLA ', 30) === 'PLA', 'Text trimming');
$hash = password_hash('unit-only-password', PASSWORD_BCRYPT, ['cost' => 12]);
check(password_verify('unit-only-password', $hash), 'Password verifies');
check(!password_verify('incorrect-password', $hash), 'Wrong password fails');
echo "PASS: $checks input validation/password checks. No database used.\n";
