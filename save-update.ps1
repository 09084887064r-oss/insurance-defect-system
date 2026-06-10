# ============================================================
# 保险产品缺陷预警系统 — 一键保存更新脚本
# 使用方式：在 PowerShell 中运行此脚本
# ============================================================

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = "D:\缺陷预警系统"
$BackupDir  = "D:\项目备份"

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  缺陷预警系统 — 一键保存脚本" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ProjectDir

# ── 第一步：Git 提交 ──────────────────────────────────────
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

$commitMsg = $Message
if (-not $commitMsg) {
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    $commitMsg = "update: 代码更新 $date"
}

Write-Host "📝 Step 1: Git 提交..." -ForegroundColor Yellow
git add .
$status = git status --porcelain
if ($status) {
    git commit -m $commitMsg
    Write-Host "  ✅ 已提交：$commitMsg" -ForegroundColor Green
} else {
    Write-Host "  ℹ️  没有新的改动需要提交" -ForegroundColor Gray
}

# ── 第二步：推送到 GitHub ─────────────────────────────────
Write-Host ""
Write-Host "☁️  Step 2: 推送到 GitHub..." -ForegroundColor Yellow
try {
    git push origin main
    Write-Host "  ✅ 已推送到 GitHub" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  GitHub 推送失败（可能需要网络）" -ForegroundColor DarkYellow
}

# ── 第三步：ZIP 备份 ──────────────────────────────────────
Write-Host ""
Write-Host "📦 Step 3: 创建 ZIP 备份..." -ForegroundColor Yellow
$date = Get-Date -Format "yyyyMMdd_HHmm"
$zipPath = "$BackupDir\insurance-defect-system_$date.zip"

# 保留最近5个备份，删除旧的
$oldBackups = Get-ChildItem "$BackupDir\insurance-defect-system_*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5
foreach ($old in $oldBackups) {
    Remove-Item $old.FullName -Force
    Write-Host "  🗑️  删除旧备份：$($old.Name)" -ForegroundColor Gray
}

Compress-Archive -Path $ProjectDir -DestinationPath $zipPath -Force
Write-Host "  ✅ 备份完成：$zipPath" -ForegroundColor Green

# ── 完成 ─────────────────────────────────────────────────
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  🎉 全部完成！" -ForegroundColor Cyan
Write-Host "  📁 源码：$ProjectDir" -ForegroundColor White
Write-Host "  📦 备份：$zipPath" -ForegroundColor White
Write-Host "  🐙 GitHub：https://github.com/09084887064r-oss/insurance-defect-system" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
