param([string]$Php = 'php')
$ErrorActionPreference = 'Stop'
$adminEmail = Read-Host 'First administrator email'
$adminPassword = Read-Host 'Password (12–72 UTF-8 bytes)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $payload = @{ email = $adminEmail; password = $plainPassword } | ConvertTo-Json -Compress
    # Pipe to standard input; never pass secrets as process arguments or save them.
    $originalEncoding = $OutputEncoding
    $OutputEncoding = [Text.UTF8Encoding]::new($false)
    try { $payload | & $Php (Join-Path $PSScriptRoot 'create-admin.php') }
    finally { $OutputEncoding = $originalEncoding }
    if ($LASTEXITCODE -ne 0) { throw 'Administrator initialization failed.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plainPassword = $null
    $payload = $null
    $adminPassword.Dispose()
}
