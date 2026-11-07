param([string]$Php = 'C:\xampp\php\php.exe', [string]$ConfigFile = '')
$ErrorActionPreference = 'Stop'
$previousConfig = $env:DLOOP_CONFIG_FILE
$previousEncoding = $OutputEncoding
$first = $null; $second = $null
$firstPointer = [IntPtr]::Zero; $secondPointer = [IntPtr]::Zero
try {
    if (-not $ConfigFile) {
        $ConfigFile = Read-Host 'Path to the private configuration for your existing local studio (not a fixture database)'
    }
    $resolvedConfig = (Resolve-Path -LiteralPath $ConfigFile).Path
    $env:DLOOP_CONFIG_FILE = $resolvedConfig
    $OutputEncoding = [Text.UTF8Encoding]::new($false)
    $adminEmail = Read-Host 'Existing administrator email'
    $script = Join-Path $PSScriptRoot 'reset-admin-password.php'
    $inspection = (@{email=$adminEmail} | ConvertTo-Json -Compress) | & $Php $script --inspect
    if ($LASTEXITCODE -ne 0) { throw 'Administrator inspection failed. Nothing changed.' }
    $target = ($inspection -join "`n") | ConvertFrom-Json
    Write-Host "Configuration: $resolvedConfig"
    Write-Host "LOCAL database: $($target.host):$($target.port)/$($target.database)"
    Write-Host "Existing administrator: $($target.email) (ID $($target.id))"
    $confirmation = Read-Host 'Type the displayed database name to confirm the target (anything else cancels)'
    if ($confirmation -cne $target.database) { throw 'Cancelled. Nothing changed.' }
    $first = Read-Host 'New password (12-72 UTF-8 bytes; input hidden)' -AsSecureString
    $second = Read-Host 'Confirm new password (input hidden)' -AsSecureString
    $firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
    $secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
    $plainFirst = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
    $plainSecond = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)
    if ($plainFirst -cne $plainSecond) { throw 'Passwords do not match. Nothing changed.' }
    $byteCount = [Text.Encoding]::UTF8.GetByteCount($plainFirst)
    if ($byteCount -lt 12 -or $byteCount -gt 72 -or $plainFirst.Contains([string][char]0)) {
        throw 'Password must be 12-72 UTF-8 bytes without NUL. Nothing changed.'
    }
    $payload = @{email=$adminEmail;password=$plainFirst;target=$target.target} | ConvertTo-Json -Compress
    # Secret travels in stdin only: never in arguments, history or a saved file.
    $payload | & $Php $script
    if ($LASTEXITCODE -ne 0) { throw 'Password reset failed. Review the safe error above.' }
} finally {
    if ($firstPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer) }
    if ($secondPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer) }
    if ($first) { $first.Dispose() }; if ($second) { $second.Dispose() }
    $plainFirst=$null; $plainSecond=$null; $payload=$null; $inspection=$null
    $OutputEncoding=$previousEncoding
    $env:DLOOP_CONFIG_FILE=$previousConfig
}
