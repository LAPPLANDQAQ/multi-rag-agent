<# 
Read-only smoke checks for the Multi-Agent AIOps local demo.

This script reports local readiness without starting/stopping services and without
mutating .env, logs, data, databases, Docker containers, or vector stores.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = "",
    [int]$TimeoutSec = 3
)

$ErrorActionPreference = "Continue"
$Script:PassCount = 0
$Script:WarnCount = 0
$Script:FailCount = 0

function Write-Result {
    param(
        [ValidateSet("PASS", "WARN", "FAIL")]
        [string]$Status,
        [string]$Name,
        [string]$Detail = ""
    )

    switch ($Status) {
        "PASS" { $Script:PassCount++ ; $color = "Green" }
        "WARN" { $Script:WarnCount++ ; $color = "Yellow" }
        "FAIL" { $Script:FailCount++ ; $color = "Red" }
    }

    if ($Detail) {
        Write-Host ("[{0}] {1} - {2}" -f $Status, $Name, $Detail) -ForegroundColor $color
    } else {
        Write-Host ("[{0}] {1}" -f $Status, $Name) -ForegroundColor $color
    }
}

function Get-EnvValue {
    param(
        [string]$Name,
        [string]$DefaultValue = ""
    )

    $envPath = Join-Path $PWD ".env"
    if (-not (Test-Path -LiteralPath $envPath)) {
        return $DefaultValue
    }

    try {
        $line = Get-Content -LiteralPath $envPath -Encoding UTF8 | Where-Object {
            $_ -match "^\s*$([regex]::Escape($Name))\s*="
        } | Select-Object -First 1
        if (-not $line) {
            return $DefaultValue
        }
        return (($line -split "=", 2)[1]).Trim()
    } catch {
        return $DefaultValue
    }
}

function Test-CommandAvailable {
    param([string]$CommandName)
    return [bool](Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Invoke-VersionCommand {
    param(
        [string]$Name,
        [string[]]$Command
    )

    try {
        $output = & $Command[0] @($Command | Select-Object -Skip 1) 2>&1
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            $firstLine = ($output | Where-Object { $_ -and $_.ToString() -notmatch "^WARNING:" } | Select-Object -First 1)
            if (-not $firstLine) {
                $firstLine = ($output | Select-Object -First 1)
            }
            Write-Result "PASS" $Name ([string]$firstLine)
        } else {
            Write-Result "WARN" $Name (($output -join " ") -replace "\s+", " ")
        }
    } catch {
        Write-Result "WARN" $Name $_.Exception.Message
    }
}

function Invoke-HttpCheck {
    param(
        [string]$Name,
        [string]$Url,
        [switch]$Critical
    )

    try {
        $resp = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
        $status = [int]$resp.StatusCode
        if ($status -ge 200 -and $status -lt 300) {
            Write-Result "PASS" $Name ("HTTP {0} {1}" -f $status, $Url)
        } elseif ($Critical) {
            Write-Result "FAIL" $Name ("HTTP {0} {1}" -f $status, $Url)
        } else {
            Write-Result "WARN" $Name ("HTTP {0} {1}" -f $status, $Url)
        }
    } catch {
        $message = $_.Exception.Message
        if ($Critical) {
            Write-Result "FAIL" $Name ("unavailable: {0}" -f $message)
        } else {
            Write-Result "WARN" $Name ("unavailable: {0}" -f $message)
        }
    }
}

function Invoke-RestJsonCheck {
    param(
        [string]$Name,
        [string]$Url
    )

    try {
        $resp = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec $TimeoutSec
        if ($null -ne $resp) {
            $summary = ""
            if ($null -ne $resp.data -and $null -ne $resp.data.total) {
                $summary = "total=$($resp.data.total)"
            } elseif ($null -ne $resp.status) {
                $summary = "status=$($resp.status)"
            } else {
                $summary = "response received"
            }
            Write-Result "PASS" $Name ("{0} {1}" -f $summary, $Url)
        } else {
            Write-Result "WARN" $Name ("empty response {0}" -f $Url)
        }
    } catch {
        Write-Result "WARN" $Name ("unavailable: {0}" -f $_.Exception.Message)
    }
}

function Invoke-DockerComposePs {
    if (-not (Test-CommandAvailable "docker")) {
        Write-Result "WARN" "Docker Compose status" "docker command not found"
        return
    }

    try {
        $output = docker compose ps 2>&1
        if ($LASTEXITCODE -eq 0) {
            $lines = @($output | Where-Object { $_ -and $_.ToString().Trim() })
            $detail = if ($lines.Count -gt 0) { ("{0} output lines" -f $lines.Count) } else { "no compose services reported" }
            Write-Result "PASS" "Docker Compose status" $detail
        } else {
            Write-Result "WARN" "Docker Compose status" (($output -join " ") -replace "\s+", " ")
        }
    } catch {
        Write-Result "WARN" "Docker Compose status" $_.Exception.Message
    }
}

Write-Host "Multi-Agent AIOps read-only smoke check"
Write-Host ("Working directory: {0}" -f (Get-Location))
Write-Host ""

$repoMarkers = @("README.md", "app\main.py", "mcp_servers", "scripts", "docker-compose.yml")
$missing = @($repoMarkers | Where-Object { -not (Test-Path -LiteralPath (Join-Path $PWD $_)) })
if ($missing.Count -eq 0) {
    Write-Result "PASS" "Repository root" "required project markers found"
} else {
    Write-Result "FAIL" "Repository root" ("missing: {0}" -f ($missing -join ", "))
}

if (Test-Path -LiteralPath ".env") {
    Write-Result "PASS" ".env presence" ".env exists"
} else {
    Write-Result "WARN" ".env presence" ".env not found; runtime config may be incomplete"
}

$venvPython = Join-Path $PWD ".venv\Scripts\python.exe"
if (Test-Path -LiteralPath $venvPython) {
    Invoke-VersionCommand "Virtualenv Python" @($venvPython, "--version")
} else {
    Write-Result "WARN" "Virtualenv Python" ".venv\Scripts\python.exe not found"
}

if (Test-CommandAvailable "python") {
    Invoke-VersionCommand "System Python" @("python", "--version")
} elseif (Test-CommandAvailable "py") {
    Invoke-VersionCommand "System Python" @("py", "--version")
} elseif (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Result "FAIL" "Python" "no virtualenv or system Python found"
} else {
    Write-Result "PASS" "Python" "virtualenv Python available"
}

if (Test-CommandAvailable "node") {
    Invoke-VersionCommand "Node.js" @("node", "--version")
} else {
    Write-Result "WARN" "Node.js" "node command not found"
}

if (Test-CommandAvailable "docker") {
    Invoke-VersionCommand "Docker CLI" @("docker", "--version")
} else {
    Write-Result "WARN" "Docker CLI" "docker command not found"
}
Invoke-DockerComposePs

$port = Get-EnvValue -Name "PORT" -DefaultValue "9900"
if (-not $BaseUrl) {
    $BaseUrl = "http://localhost:$port"
}
$BaseUrl = $BaseUrl.TrimEnd("/")

Invoke-HttpCheck "FastAPI health" "$BaseUrl/api/v1/health"
Invoke-HttpCheck "FastAPI readiness" "$BaseUrl/api/v1/health/ready"
Invoke-RestJsonCheck "Skills endpoint" "$BaseUrl/api/v1/skills"

$openWebSearchBase = Get-EnvValue -Name "OPEN_WEBSEARCH_BASE_URL" -DefaultValue "http://127.0.0.1:3210"
$openWebSearchBase = $openWebSearchBase.TrimEnd("/")
Invoke-HttpCheck "open-webSearch health" "$openWebSearchBase/health"

Write-Host ""
Write-Host ("Summary: {0} pass, {1} warning, {2} critical failure(s)" -f $Script:PassCount, $Script:WarnCount, $Script:FailCount)
if ($Script:FailCount -gt 0) {
    exit 1
}
exit 0
