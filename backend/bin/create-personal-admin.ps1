param([string]$Php = 'C:\xampp\php\php.exe')
$ErrorActionPreference = 'Stop'
$previousConfig = $env:DLOOP_CONFIG_FILE
try {
    $env:DLOOP_CONFIG_FILE = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../var/personal/config.local.php')).Path
    Write-Host 'Target: LOCAL dloop_personal. Existing test databases are not used.'
    $answer = Read-Host 'Type dloop_personal to create its first administrator (anything else cancels)'
    if ($answer -cne 'dloop_personal') { throw 'Cancelled. No administrator created.' }
    # Existing helper prompts locally; email/password never enter chat or args.
    & (Join-Path $PSScriptRoot 'create-admin.ps1') -Php $Php
    if ($LASTEXITCODE -ne 0) { throw 'First-admin setup did not complete.' }
    & $Php (Join-Path $PSScriptRoot 'setup-personal-local.php') --finalize
    if ($LASTEXITCODE -ne 0) { throw 'Administrator exists, but privilege finalization needs inspection. Do not rerun account creation.' }
} finally { $env:DLOOP_CONFIG_FILE = $previousConfig }
