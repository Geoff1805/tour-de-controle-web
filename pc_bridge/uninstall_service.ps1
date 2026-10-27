# Antigravity Controller - Desinstallation du Service Permanent



# Configuration Encodage UTF-8 Standard (Antigravity)
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$vbsTarget = Join-Path $startupDir "AntigravityBridge.vbs"

if (Test-Path $vbsTarget) {
    Remove-Item -Path $vbsTarget -Force
    Write-Host "[OK] Lanceur de demarrage supprime." -ForegroundColor Green
}

$procId = (Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue).OwningProcess
if ($procId) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Processus sur le port 8765 arrete." -ForegroundColor Green
}

Write-Host "[OK] Service Antigravity Bridge desinstalle avec succes." -ForegroundColor Green
