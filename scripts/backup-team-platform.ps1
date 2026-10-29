[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot '.env'
$connectionString = $env:TEAM_PLATFORM_BACKUP_URL

if (-not $connectionString -and (Test-Path -LiteralPath $envFile)) {
  $lines = Get-Content -LiteralPath $envFile
  $line = $lines | Where-Object { $_ -match '^\s*DIRECT_URL\s*=' } | Select-Object -First 1
  if (-not $line) {
    $line = $lines | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  }
  if ($line -match '^\s*[^=]+=(.*)$') {
    $connectionString = $Matches[1].Trim()
    if (($connectionString.StartsWith('"') -and $connectionString.EndsWith('"')) -or
        ($connectionString.StartsWith("'") -and $connectionString.EndsWith("'"))) {
      $connectionString = $connectionString.Substring(1, $connectionString.Length - 2)
    }
  }
}

if (-not $connectionString -or $connectionString -match 'YOUR[_ -]?PASSWORD|PASSWORD_REQUIRED|YOUR_PROJECT_HOST') {
  throw 'Set TEAM_PLATFORM_BACKUP_URL or configure DIRECT_URL in the local .env file.'
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  $candidate = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
  if (Test-Path -LiteralPath $candidate) { $pgDumpPath = $candidate }
  else { throw 'pg_dump was not found. Install PostgreSQL client tools first.' }
} else {
  $pgDumpPath = $pgDump.Source
}

$pgRestore = Join-Path (Split-Path -Parent $pgDumpPath) 'pg_restore.exe'
if (-not (Test-Path -LiteralPath $pgRestore)) {
  throw 'pg_restore was not found next to pg_dump.'
}

$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$backupDirectory = Join-Path $OutputDirectory $stamp
[System.IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
$backupFile = Join-Path $backupDirectory 'team-platform.dump'

$uri = [System.Uri]$connectionString
$userInfo = $uri.UserInfo.Split(':', 2)
if ($userInfo.Count -ne 2 -or -not $uri.Host -or $uri.Port -le 0) {
  throw 'The database URL must include a username, password, host, and port.'
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

  & $pgDumpPath --format=custom --schema=team_platform --no-owner --no-acl --file=$backupFile
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump could not create the database backup.' }

  if ((Get-Item -LiteralPath $backupFile).Length -lt 5) {
    throw 'The backup archive is empty.'
  }
  & $pgRestore --list $backupFile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The backup archive could not be read back.' }

  $size = (Get-Item -LiteralPath $backupFile).Length
  Write-Output "Backup archive verified: $backupFile ($size bytes)"
} catch {
  Remove-Item -LiteralPath $backupFile -Force -ErrorAction SilentlyContinue
  throw
} finally {
  foreach ($key in $previousPgEnv.Keys) {
    [Environment]::SetEnvironmentVariable($key, $previousPgEnv[$key], 'Process')
  }
  $uri = $null
  $userInfo = $null
  $connectionString = $null
}
