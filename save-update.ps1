# ============================================================
# Insurance Defect Warning System - One-click Save Script
# Usage: Run this script in PowerShell
# ============================================================

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# Use English names for folders to avoid encoding issues on Chinese locales
$ProjectDir = $PSScriptRoot
$ParentDir  = Split-Path $ProjectDir -Parent
$BackupDir  = Join-Path $ParentDir "backups"

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Defect System - One-click Save Script" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ProjectDir

# Create backup dir if not exists
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

# -- Step 1: Git commit --
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

$commitMsg = $Message
if (-not $commitMsg) {
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    $commitMsg = "update: code update $date"
}

Write-Host "Step 1: Git commit..." -ForegroundColor Yellow
git add .
$status = git status --porcelain
if ($status) {
    git commit -m $commitMsg
    Write-Host "  [OK] Committed: $commitMsg" -ForegroundColor Green
} else {
    Write-Host "  [INFO] No changes to commit" -ForegroundColor Gray
}

# -- Step 2: Push to GitHub --
Write-Host ""
Write-Host "Step 2: Push to GitHub..." -ForegroundColor Yellow
try {
    git push origin main
    Write-Host "  [OK] Pushed to GitHub" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] GitHub push failed (network issue)" -ForegroundColor DarkYellow
}

# -- Step 3: ZIP Backup --
Write-Host ""
Write-Host "Step 3: Creating ZIP backup..." -ForegroundColor Yellow
$date = Get-Date -Format "yyyyMMdd_HHmm"
$zipPath = "$BackupDir\insurance-defect-system_$date.zip"

# Keep last 5 backups
if (Test-Path $BackupDir) {
    $oldBackups = Get-ChildItem "$BackupDir\insurance-defect-system_*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5
    foreach ($old in $oldBackups) {
        Remove-Item $old.FullName -Force
        Write-Host "  [CLEAN] Removed old backup: $($old.Name)" -ForegroundColor Gray
    }
}

Compress-Archive -Path $ProjectDir -DestinationPath $zipPath -Force
Write-Host "  [OK] Backup complete: $zipPath" -ForegroundColor Green

# -- Complete --
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Finished successfully!" -ForegroundColor Cyan
Write-Host "  Source: $ProjectDir" -ForegroundColor White
Write-Host "  Backup: $zipPath" -ForegroundColor White
Write-Host "  GitHub: https://github.com/09084887064r-oss/insurance-defect-system" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
