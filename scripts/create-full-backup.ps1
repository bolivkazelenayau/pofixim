$ErrorActionPreference = "Stop"

function Get-Timestamp {
  return Get-Date -Format "yyyyMMdd-HHmmss"
}

function Get-DbUrlFromEnvFile {
  $envPath = Join-Path (Get-Location) ".env"
  if (-not (Test-Path $envPath)) {
    throw ".env not found: $envPath"
  }
  $line = Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) {
    throw "DATABASE_URL is missing in .env"
  }
  return $line.Split('=', 2)[1].Trim()
}

function Resolve-PgBinary([string]$name) {
  $cmd = Get-Command "$name.exe" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "C:\Program Files\PostgreSQL\18\bin\$name.exe",
    "C:\Program Files\PostgreSQL\17\bin\$name.exe",
    "C:\Program Files\PostgreSQL\16\bin\$name.exe",
    "C:\Program Files\PostgreSQL\15\bin\$name.exe",
    "C:\Program Files\PostgreSQL\14\bin\$name.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  throw "$name.exe not found in PATH or common PostgreSQL install paths."
}

$dbUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { Get-DbUrlFromEnvFile }
$pgDump = Resolve-PgBinary "pg_dump"
$stamp = Get-Timestamp
$backupRoot = Join-Path (Get-Location) "backups"
$backupDir = Join-Path $backupRoot "db-backup-$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$sqlDumpPath = Join-Path $backupDir "full.sql"
$customDumpPath = Join-Path $backupDir "full.custom.dump"

Write-Host "Backup dir: $backupDir"
Write-Host "Creating plain SQL dump..."
& $pgDump --dbname="$dbUrl" --file="$sqlDumpPath" --no-owner --no-privileges

Write-Host "Creating custom-format dump..."
& $pgDump --dbname="$dbUrl" --format=custom --file="$customDumpPath" --no-owner --no-privileges

Write-Host "Creating JSON/CSV snapshots..."
$env:DATABASE_URL = $dbUrl
node scripts/create-db-backup.mjs | Out-Host

Write-Host "Done."
Write-Host "SQL dump:     $sqlDumpPath"
Write-Host "Custom dump:  $customDumpPath"
