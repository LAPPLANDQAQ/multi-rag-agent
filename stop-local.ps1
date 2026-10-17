$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$StatePath = Join-Path $PSScriptRoot 'logs\local-processes.json'
if (Test-Path -LiteralPath $StatePath) {
    $records = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    $remainingRecords = @()
    foreach ($record in $records) {
        $process = Get-Process -Id $record.Pid -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.Ticks -eq $record.StartTicks -and $process.Path -eq $record.Executable) {
            & taskkill.exe /PID $process.Id /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not stop $($record.Name)." }
            Write-Output "[stopped] $($record.Name)"
        } elseif ($process) {
            Write-Warning "Process identity changed; retained $($record.Name) without stopping it."
            $remainingRecords += $record
        }
    }
    ConvertTo-Json -InputObject @($remainingRecords) | Set-Content -LiteralPath $StatePath -Encoding UTF8
    if ($remainingRecords.Count) { throw 'Some processes could not be identified safely.' }
}
docker compose -f docker-compose.yml -f compose.local.yml stop etcd minio standalone attu redis
if ($LASTEXITCODE -ne 0) { throw 'Could not stop dependency containers.' }
Write-Output '[stopped] Local deployment stopped; data retained.'
