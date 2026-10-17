"""Exercise the Windows launcher without changing the running deployment."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe")
pytestmark = pytest.mark.skipif(
    sys.platform != "win32" or not POWERSHELL,
    reason="The local launcher targets Windows PowerShell 5.1.",
)


HARNESS = r"""
param([string]$Launcher, [string]$Scenario)
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Launcher, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
# Import the actual functions without running Docker or reading application configuration.
foreach ($name in @('Open-LocalFrontend', 'Start-LocalService')) {
    $definition = $ast.FindAll({
        param($node)
        $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $false)
    if (@($definition).Count -ne 1) { throw "Missing function: $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}
$script:checks = 0
$script:opened = @()
function Invoke-RestMethod {
    param($Uri, $TimeoutSec)
    if ($Uri -ne 'http://127.0.0.1:9900/api/v1/health/ready') { throw "Unexpected URL: $Uri" }
    $script:checks += 1
    if ($Scenario -eq 'retry' -and $script:checks -eq 1) { throw 'Backend is still starting.' }
    if ($Scenario -eq 'unreachable') { throw 'Connection refused.' }
    if ($Scenario -eq 'unready') { return @{ data = @{ status = 'degraded' } } }
    return @{ data = @{ status = 'ready' } }
}
function Start-Process {
    param($FilePath, $ErrorAction)
    $script:opened += $FilePath
    if ($Scenario -eq 'browser-failure') { throw 'No default browser association.' }
}
function Test-LocalPort { param($Port) return $true }
$success = $false
$errorText = ''
$timeoutSeconds = 1
if ($Scenario -eq 'retry') { $timeoutSeconds = 4 }
$skipBrowser = $Scenario -eq 'no-browser'
try {
    if ($Scenario -eq 'existing') {
        $ProjectRoot = Split-Path -Parent $Launcher
        $output = @(Start-LocalService 'backend' 'must-not-start.exe' @() 9900)
        if ($output -notcontains '[running] backend port=9900') { throw 'Existing backend was not reused.' }
    }
    $null = Open-LocalFrontend -NoBrowser:$skipBrowser -TimeoutSeconds $timeoutSeconds
    $success = $true
} catch { $errorText = $_.Exception.Message }
@{
    success = $success
    error = $errorText
    checks = $script:checks
    opened = @($script:opened)
    powershellMajor = $PSVersionTable.PSVersion.Major
} | ConvertTo-Json -Compress
"""


def run_frontend_launcher(tmp_path, scenario):
    harness = tmp_path / "launcher-harness.ps1"
    harness.write_text(HARNESS, encoding="utf-8-sig")
    result = subprocess.run(
        [
            POWERSHELL,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(harness),
            "-Launcher",
            str(ROOT / "start-local.ps1"),
            "-Scenario",
            scenario,
        ],
        text=True,
        capture_output=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize("scenario, checks", [("ready", 1), ("existing", 1), ("retry", 2)])
def test_browser_opens_once_after_readiness(tmp_path, scenario, checks):
    result = run_frontend_launcher(tmp_path, scenario)
    assert result["powershellMajor"] == 5
    assert result["success"], result["error"]
    assert result["checks"] == checks
    assert result["opened"] == ["http://localhost:9900"]


def test_no_browser_option_still_checks_readiness(tmp_path):
    result = run_frontend_launcher(tmp_path, "no-browser")
    assert result["success"]
    assert result["checks"] == 1
    assert result["opened"] == []


@pytest.mark.parametrize("scenario", ["unready", "unreachable"])
def test_failed_startup_does_not_open_browser(tmp_path, scenario):
    result = run_frontend_launcher(tmp_path, scenario)
    assert not result["success"]
    assert "readiness check failed" in result["error"]
    assert result["opened"] == []


def test_browser_failure_is_reported_once_with_manual_url(tmp_path):
    result = run_frontend_launcher(tmp_path, "browser-failure")
    assert not result["success"]
    assert "default browser could not be opened" in result["error"]
    assert "http://localhost:9900" in result["error"]
    assert result["checks"] == 1
    assert result["opened"] == ["http://localhost:9900"]


@pytest.mark.parametrize("exit_code", [0, 7])
def test_cmd_handles_spaces_forwards_options_and_preserves_exit_code(tmp_path, exit_code):
    fixture = tmp_path / "launcher path with spaces"
    fixture.mkdir()
    launcher = fixture / "start-local.cmd"
    shutil.copyfile(ROOT / launcher.name, launcher)
    (fixture / "start-local.ps1").write_text(
        "param([switch]$ServicesOnly, [switch]$NoBrowser)\n"
        "@{servicesOnly=[bool]$ServicesOnly; noBrowser=[bool]$NoBrowser; "
        "root=$PSScriptRoot} | ConvertTo-Json -Compress\n"
        f"exit {exit_code}\n",
        encoding="utf-8-sig",
    )
    command = f'"{os.environ["COMSPEC"]}" /d /s /c ""{launcher}" -ServicesOnly -NoBrowser"'
    result = subprocess.run(
        command,
        cwd=tmp_path,
        input="\n",
        text=True,
        capture_output=True,
        timeout=20,
    )
    assert result.returncode == exit_code, result.stderr
    payload = json.loads(next(line for line in result.stdout.splitlines() if line.startswith("{")))
    assert payload == {"servicesOnly": True, "noBrowser": True, "root": str(fixture)}
    assert ("[error] Local startup failed." in result.stdout) == (exit_code != 0)
