# Desinstallation du lanceur Batch du demarrage de session Windows
# Antigravity Batch Runner (Zero-Tunnel)

# Configuration Encodage UTF-8 Standard (Antigravity)
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$vbsTarget = Join-Path $startupDir "AntigravityBatchStartup.vbs"
$binDir = "$env:USERPROFILE\.gemini\antigravity\bin"
$shimTarget = Join-Path $binDir "batch.cmd"

if (Test-Path $vbsTarget) {
    Remove-Item -Path $vbsTarget -Force
    Write-Host "[OK] Lanceur de demarrage supprime :" -ForegroundColor Green
    Write-Host "     $vbsTarget" -ForegroundColor Gray
}

if (Test-Path $shimTarget) {
    Remove-Item -Path $shimTarget -Force
    Write-Host "[OK] Raccourci CLI 'batch' supprime :" -ForegroundColor Green
    Write-Host "     $shimTarget" -ForegroundColor Gray
}

Write-Host "[OK] Runner Batch desinstalle du demarrage de session." -ForegroundColor Green
