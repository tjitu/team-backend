[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
$targetConnectionString = $env:TEAM_PLATFORM_RESTORE_URL
if (-not $targetConnectionString) {
  throw 'Set TEAM_PLATFORM_RESTORE_URL to the connection string for a fresh, isolated recovery project.'
}
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
  throw 'The requested backup archive was not found.'
}

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
  $candidate = 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe'
  if (Test-Path -LiteralPath $candidate) { $pgRestorePath = $candidate }
  else { throw 'pg_restore was not found. Install PostgreSQL client tools first.' }
} else {
  $pgRestorePath = $pgRestore.Source
}
$psqlPath = Join-Path (Split-Path -Parent $pgRestorePath) 'psql.exe'
if (-not (Test-Path -LiteralPath $psqlPath)) {
  throw 'psql was not found next to pg_restore.'
}

$uri = [System.Uri]$targetConnectionString
$userInfo = $uri.UserInfo.Split(':', 2)
if ($userInfo.Count -ne 2 -or -not $uri.Host -or $uri.Port -le 0) {
  throw 'The target URL must include a username, password, host, and port.'
}

$previousPgEnv = @{}
foreach ($key in @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE', 'PGSERVICE')) {
  $previousPgEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}

try {
  $env:PGHOST = $uri.Host
  $env:PGPORT = [string]$uri.Port
  $env:PGUSER = [System.Uri]::UnescapeDataString($userInfo[0])
  $env:PGPASSWORD = [System.Uri]::UnescapeDataString($userInfo[1])
  $env:PGDATABASE = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  $env:PGSSLMODE = 'require'
  $env:PGSERVICE = $null

  & $pgRestorePath --list $BackupFile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The backup archive is invalid or unreadable.' }

  $existingSchema = & $psqlPath -X -qAt -c "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'team_platform')"
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify that the restore target is reachable.' }
  if ($existingSchema.Trim() -eq 't') {
    throw 'The target already has a team_platform schema. Restore only into a fresh isolated project.'
  }

  & $pgRestorePath --exit-on-error --single-transaction --no-owner --no-acl $BackupFile
  if ($LASTEXITCODE -ne 0) { throw 'Restore failed. Inspect the target project before retrying.' }

  Write-Output 'Team Platform schema and data restored successfully.'
} finally {
  foreach ($key in $previousPgEnv.Keys) {
    [Environment]::SetEnvironmentVariable($key, $previousPgEnv[$key], 'Process')
  }
  $uri = $null
  $userInfo = $null
  $targetConnectionString = $null
}
