# ═══════════════════════════════════════════════════════════════
# Automated PostgreSQL Backup Script
# Run daily via Task Scheduler or cron equivalent
# ═══════════════════════════════════════════════════════════════

param(
    [string]$BackupDir = "$PSScriptRoot\..\backups",
    [int]$RetentionDays = 30,
    [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

# ── Parse DATABASE_URL or fall back to individual vars ──────────
if ($DatabaseUrl -match "postgres(ql)?://(?<user>[^:]+):(?<pass>[^@]+)@(?<host>[^:]+):(?<port>\d+)/(?<db>.+)") {
    $DbHost = $Matches.host
    $DbPort = $Matches.port
    $DbName = $Matches.db
    $DbUser = $Matches.user
    $env:PGPASSWORD = $Matches.pass
} else {
    $DbHost = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
    $DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
    $DbName = if ($env:DB_NAME) { $env:DB_NAME } else { "woke_portal" }
    $DbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
    if ($env:DB_PASSWORD) { $env:PGPASSWORD = $env:DB_PASSWORD }
}

# ── Create backup directory ─────────────────────────────────────
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$BackupFile = Join-Path $BackupDir "${DbName}_${Timestamp}.sql.gz"
$BackupPlain = Join-Path $BackupDir "${DbName}_${Timestamp}.sql"

Write-Host "[$Timestamp] Starting backup of $DbName@${DbHost}:${DbPort}..." -ForegroundColor Cyan

# ── Find pg_dump ───────────────────────────────────────────────
$PgDumpPath = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if (-not (Test-Path $PgDumpPath)) {
    # Try alternative path
    $PgDumpPath = "C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\pg_dump.exe"
}
if (-not (Test-Path $PgDumpPath)) {
    throw "pg_dump.exe not found. Please install PostgreSQL or update the path in this script."
}

# ── Run pg_dump ─────────────────────────────────────────────────
try {
    # Try compressed first
    $pgDumpArgs = @(
        "-h", $DbHost,
        "-p", $DbPort,
        "-U", $DbUser,
        "-d", $DbName,
        "--no-owner",
        "--no-acl",
        "--format=custom",
        "-f", "$BackupPlain.dump"
    )

    & $PgDumpPath @pgDumpArgs 2>&1

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE"
    }

    $FinalFile = "$BackupPlain.dump"
    $Size = (Get-Item $FinalFile).Length
    $SizeMB = [math]::Round($Size / 1MB, 2)

    Write-Host "[$Timestamp] Backup completed: $FinalFile ($SizeMB MB)" -ForegroundColor Green
} catch {
    Write-Host "[$Timestamp] ERROR: $_" -ForegroundColor Red
    exit 1
}

# ── Cleanup old backups ─────────────────────────────────────────
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
$OldBackups = Get-ChildItem -Path $BackupDir -Filter "${DbName}_*" | Where-Object { $_.LastWriteTime -lt $CutoffDate }

if ($OldBackups.Count -gt 0) {
    Write-Host "Removing $($OldBackups.Count) backups older than $RetentionDays days..." -ForegroundColor Yellow
    $OldBackups | Remove-Item -Force
}

# ── Summary ─────────────────────────────────────────────────────
$AllBackups = Get-ChildItem -Path $BackupDir -Filter "${DbName}_*" | Sort-Object LastWriteTime -Descending
$TotalSize = ($AllBackups | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host "Backup summary:" -ForegroundColor Cyan
Write-Host "  Latest:     $FinalFile"
Write-Host "  Size:       $SizeMB MB"
Write-Host "  Total:      $($AllBackups.Count) backups ($([math]::Round($TotalSize / 1MB, 2)) MB)"
Write-Host "  Retention:  $RetentionDays days"

# Remove PGPASSWORD from env
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
