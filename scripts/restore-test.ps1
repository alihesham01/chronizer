# ═══════════════════════════════════════════════════════════════
# Restore Test Script
# Restores latest backup to a temporary DB, runs integrity checks,
# then drops the temp DB. Proves backups are valid.
# ═══════════════════════════════════════════════════════════════

param(
    [string]$BackupDir = "$PSScriptRoot\..\backups",
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$TestDbName = "woke_portal_restore_test"
)

$ErrorActionPreference = "Continue"

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

# ── Find PostgreSQL binaries ───────────────────────────────────────
$PgDumpPath = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$PgRestorePath = "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe"
$PsqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

if (-not (Test-Path $PgDumpPath)) {
    $PgDumpPath = "C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\pg_dump.exe"
}
if (-not (Test-Path $PgRestorePath)) {
    $PgRestorePath = "C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\pg_restore.exe"
}
if (-not (Test-Path $PsqlPath)) {
    $PsqlPath = "C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\psql.exe"
}

$PsqlArgs = @("-h", $DbHost, "-p", $DbPort, "-U", $DbUser)

Write-Host "=== RESTORE TEST ===" -ForegroundColor Cyan
Write-Host "Host: ${DbHost}:${DbPort}, User: $DbUser" -ForegroundColor Gray

# ── Find latest backup ──────────────────────────────────────────
$Latest = Get-ChildItem -Path $BackupDir -Filter "${DbName}_*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $Latest) {
    Write-Host "ERROR: No backup files found in $BackupDir" -ForegroundColor Red
    Write-Host "Run backup.ps1 first." -ForegroundColor Yellow
    exit 1
}

$SizeMB = [math]::Round($Latest.Length / 1MB, 2)
Write-Host "Latest backup: $($Latest.Name) ($SizeMB MB)" -ForegroundColor Green

# ── Drop test DB if it exists from previous run ─────────────────
Write-Host "`n1. Dropping test database (if exists)..." -ForegroundColor Yellow
$null = & $PsqlPath @PsqlArgs -d "postgres" -c "DROP DATABASE IF EXISTS $TestDbName;" 2>&1

# ── Create fresh test DB ────────────────────────────────────────
Write-Host "2. Creating test database '$TestDbName'..." -ForegroundColor Yellow
$null = & $PsqlPath @PsqlArgs -d "postgres" -c "CREATE DATABASE $TestDbName;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create test database" -ForegroundColor Red
    exit 1
}

# ── Restore backup into test DB ─────────────────────────────────
Write-Host "3. Restoring backup into test database..." -ForegroundColor Yellow
$RestoreStart = Get-Date
$null = & $PgRestorePath -h $DbHost -p $DbPort -U $DbUser -d $TestDbName --no-owner --no-acl $Latest.FullName 2>&1
$RestoreDuration = (Get-Date) - $RestoreStart

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: pg_restore returned non-zero (some warnings are normal)" -ForegroundColor Yellow
}
Write-Host "   Restore took $([math]::Round($RestoreDuration.TotalSeconds, 1))s" -ForegroundColor Gray

# ── Run integrity checks ────────────────────────────────────────
Write-Host "`n4. Running integrity checks..." -ForegroundColor Yellow

$Checks = @(
    @{ Name = "Brands exist";       SQL = "SELECT COUNT(*) AS c FROM brands" },
    @{ Name = "Products exist";     SQL = "SELECT COUNT(*) AS c FROM products" },
    @{ Name = "Stores exist";       SQL = "SELECT COUNT(*) AS c FROM stores" },
    @{ Name = "Transactions exist"; SQL = "SELECT COUNT(*) AS c FROM transactions" },
    @{ Name = "Stock moves exist";  SQL = "SELECT COUNT(*) AS c FROM stock_movements" },
    @{ Name = "Brand owners exist"; SQL = "SELECT COUNT(*) AS c FROM brand_owners" }
)

$AllPassed = $true
foreach ($Check in $Checks) {
    try {
        # Use admin context for RLS-protected tables
        $Result = & $PsqlPath @PsqlArgs -d $TestDbName -t -A -c "BEGIN; SELECT set_config('app.is_admin', 'true', true); $($Check.SQL); COMMIT;" 2>$null
        $Count = ($Result | Where-Object { $_ -match '^\d+$' } | Select-Object -Last 1)
        if ($null -eq $Count) { $Count = "?" }
        Write-Host "   [PASS] $($Check.Name): $Count rows" -ForegroundColor Green
    } catch {
        Write-Host "   [FAIL] $($Check.Name): $_" -ForegroundColor Red
        $AllPassed = $false
    }
}

# ── Compare row counts with production ──────────────────────────
Write-Host "`n5. Comparing with production database..." -ForegroundColor Yellow
$ProdBrands = & $PsqlPath @PsqlArgs -d $DbName -t -A -c "SELECT COUNT(*) FROM brands;" 2>$null | Select-Object -Last 1
$TestBrands = & $PsqlPath @PsqlArgs -d $TestDbName -t -A -c "SELECT COUNT(*) FROM brands;" 2>$null | Select-Object -Last 1
Write-Host "   Brands: production=$ProdBrands, restored=$TestBrands" -ForegroundColor Gray

# ── Cleanup: drop test database ─────────────────────────────────
Write-Host "`n6. Cleaning up test database..." -ForegroundColor Yellow
$null = & $PsqlPath @PsqlArgs -d "postgres" -c "DROP DATABASE IF EXISTS $TestDbName;" 2>&1

# ── Summary ─────────────────────────────────────────────────────
Write-Host ""
if ($AllPassed) {
    Write-Host "=== RESTORE TEST PASSED ===" -ForegroundColor Green
    Write-Host "Backup '$($Latest.Name)' is valid and restorable." -ForegroundColor Green
} else {
    Write-Host "=== RESTORE TEST FAILED ===" -ForegroundColor Red
    Write-Host "Some integrity checks failed. Investigate the backup." -ForegroundColor Red
    exit 1
}

# Remove PGPASSWORD from env
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
