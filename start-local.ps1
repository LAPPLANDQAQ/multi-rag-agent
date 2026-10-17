param([switch]$ServicesOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot
$Python = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
$LogDir = Join-Path $ProjectRoot 'logs'
$StatePath = Join-Path $LogDir 'local-processes.json'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$env:PYTHONIOENCODING = 'utf-8'

function Test-LocalPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}

function Open-LocalFrontend([switch]$NoBrowser, [int]$TimeoutSeconds = 90) {
    $frontendUrl = 'http://localhost:9900'
    $healthUrl = 'http://127.0.0.1:9900/api/v1/health/ready'
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $applicationReady = $false
    $lastStatus = 'Application is not ready yet.'
    while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $ready = Invoke-RestMethod -Uri $healthUrl -TimeoutSec ([Math]::Min(5, $TimeoutSeconds))
            if ($ready.data.status -eq 'ready') {
                $applicationReady = $true
                break
            }
            $lastStatus = "Application health status: $($ready.data.status)"
        } catch {
            $lastStatus = $_.Exception.Message
        }
        Start-Sleep -Seconds 1
    }
    if (-not $applicationReady) {
        throw "Application readiness check failed after $TimeoutSeconds seconds. $lastStatus See logs\backend.err.log"
    }
    Write-Output "[ready] Open $frontendUrl"
    if (-not $NoBrowser) {
        try { Start-Process -FilePath $frontendUrl -ErrorAction Stop | Out-Null }
        catch { throw "Application is ready, but the default browser could not be opened. Open $frontendUrl manually. $($_.Exception.Message)" }
    }
}

$script:Records = @()
if (Test-Path -LiteralPath $StatePath) {
    $script:Records = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($null -eq $script:Records) { $script:Records = @() }
}

function Start-LocalService([string]$Name, [string]$Executable, [string[]]$Arguments, [int]$Port, [string]$Directory = $ProjectRoot) {
    if (Test-LocalPort $Port) {
        Write-Output "[running] $Name port=$Port"
        return
    }
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments `
        -WorkingDirectory $Directory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $LogDir "$Name.out.log") `
        -RedirectStandardError (Join-Path $LogDir "$Name.err.log")
    $script:Records = @($script:Records | Where-Object { $_.Name -ne $Name })
    $script:Records += [PSCustomObject]@{
        Name = $Name; Pid = $process.Id; StartTicks = $process.StartTime.Ticks; Executable = $Executable
    }
    ConvertTo-Json -InputObject @($script:Records) | Set-Content -LiteralPath $StatePath -Encoding UTF8
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalPort $Port) { Write-Output "[ready] $Name port=$Port"; return }
        $process.Refresh()
        if ($process.HasExited) { throw "$Name exited. See logs\$Name.err.log" }
        Start-Sleep -Seconds 1
    }
    throw "$Name did not start. See logs\$Name.err.log"
}

if (-not (Test-Path -LiteralPath $Python)) { throw 'Missing .venv. Install requirements.txt first.' }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop before running this launcher.' }
docker compose -f docker-compose.yml -f compose.local.yml up -d --wait --wait-timeout 180 etcd minio standalone attu redis
if ($LASTEXITCODE -ne 0) { throw 'Dependency containers are not healthy.' }

$env:DEFAULT_SEARCH_ENGINE = 'bing'
$env:SEARCH_MODE = 'auto'
$Node = (Get-Command node.exe).Source
Start-LocalService 'open-websearch' $Node @('build/index.js', 'serve', '--host', '127.0.0.1', '--port', '3210') 3210 (Join-Path $ProjectRoot 'open-webSearch-main')
foreach ($server in @(@('system',8005), @('websearch',8006), @('winlog',8008), @('network',8009), @('docker',8011))) {
    Start-LocalService "mcp-$($server[0])" $Python @('-u', 'scripts/local_mcp.py', $server[0]) $server[1]
}
if ($ServicesOnly) { Write-Output '[ready] Dependency and MCP services are running.'; exit 0 }

& $Python -c "from app.config import settings; settings.validate_runtime()"
if ($LASTEXITCODE -ne 0) { throw 'Fill DASHSCOPE_API_KEY in .env first.' }
& $Python scripts/init_agentops_db.py
if ($LASTEXITCODE -ne 0) { throw 'AgentOps database initialization failed.' }
Start-LocalService 'backend' $Python @('-u', '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '9900') 9900
Open-LocalFrontend -NoBrowser:$NoBrowser
