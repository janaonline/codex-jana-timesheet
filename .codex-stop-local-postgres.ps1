$pgCtl = "C:\Program Files\PostgreSQL\13\bin\pg_ctl.exe"
$dataDir = Join-Path $PSScriptRoot ".codex-postgres-data"

if (Test-Path $dataDir) {
  & $pgCtl -D $dataDir -m fast stop | Out-Null
}
