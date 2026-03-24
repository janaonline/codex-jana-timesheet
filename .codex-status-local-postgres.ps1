$pgCtl = "C:\Program Files\PostgreSQL\13\bin\pg_ctl.exe"
$dataDir = Join-Path $PSScriptRoot ".codex-postgres-data"

if (!(Test-Path $dataDir)) {
  Write-Output "missing"
  exit 1
}

& $pgCtl -D $dataDir status
