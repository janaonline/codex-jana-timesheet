$postgresBin = "C:\Program Files\PostgreSQL\13\bin"
$initdb = Join-Path $postgresBin "initdb.exe"
$pgCtl = Join-Path $postgresBin "pg_ctl.exe"
$createdb = Join-Path $postgresBin "createdb.exe"
$psql = Join-Path $postgresBin "psql.exe"

$root = $PSScriptRoot
$dataDir = Join-Path $root ".codex-postgres-data"
$logFile = Join-Path $root ".codex-postgres.log"
$port = 55432
$user = "postgres"
$database = "directors_timesheet"

if (!(Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir | Out-Null
  & $initdb -D $dataDir -U $user -A trust -E UTF8 | Out-Null
}

& $pgCtl -D $dataDir status | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $pgCtl -D $dataDir -l $logFile -w -o "-p $port -h 127.0.0.1" start | Out-Null
}

$dbExists = & $psql -h 127.0.0.1 -p $port -U $user -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database';"
if ($dbExists.Trim() -ne "1") {
  & $createdb -h 127.0.0.1 -p $port -U $user $database | Out-Null
}

Write-Output "postgres:$port"
