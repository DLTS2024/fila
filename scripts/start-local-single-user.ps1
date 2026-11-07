param([string]$Php='C:\xampp\php\php.exe')
$ErrorActionPreference='Stop'
$projectPath=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:DLOOP_CONFIG_FILE=Join-Path $projectPath 'backend/var/personal/config.local.php'
# Capture the private token in memory only; never arguments, logs or browser env.
$bridge = & $Php (Join-Path $projectPath 'backend/bin/local-bridge.php')
if($LASTEXITCODE -ne 0 -or $bridge -notmatch '^[a-f0-9]{64}$'){throw 'Enable the approved local access configuration first.'}
$backendProcess=$null
try{
    foreach($port in @(8001,5173)){
        $occupied=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if($occupied){throw "Port $port is already in use. Stop the existing studio deliberately; no process was killed."}
    }
    $backendProcess=Start-Process -FilePath $Php -ArgumentList @('-S','127.0.0.1:8001','-t','backend/public','backend/router.php') -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru
    $backendReady=$false
    for($attempt=0;$attempt -lt 40;$attempt++){
        if($backendProcess.HasExited){throw 'Local backend could not start.'}
        try{$sessionCheck=Invoke-RestMethod -Uri 'http://127.0.0.1:8001/api/v1/auth/session' -Headers @{'X-DLoop-Local-Bridge'=$bridge} -TimeoutSec 1; if($sessionCheck.data.accessMode -eq 'LOCAL_SINGLE_USER'){$backendReady=$true;break}}catch{}
        Start-Sleep -Milliseconds 100
    }
    if(-not $backendReady){throw 'Protected local backend readiness check failed.'}
    $env:DLOOP_ACCESS_MODE='LOCAL_SINGLE_USER'
    $env:DLOOP_LOCAL_BRIDGE_TOKEN=$bridge
    $env:DLOOP_API_PROXY='http://127.0.0.1:8001'
    Push-Location $projectPath
    try{& npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort}finally{Pop-Location}
}finally{
    $env:DLOOP_LOCAL_BRIDGE_TOKEN=$null;$bridge=$null
    $sessionCheck=$null
    if($backendProcess -and -not $backendProcess.HasExited){Stop-Process -Id $backendProcess.Id}
}
