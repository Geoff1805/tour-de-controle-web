# Antigravity Controller - Installation du Service Permanent
# Installe le lanceur silencieux dans le dossier de demarrage automatique Windows



# Configuration Encodage UTF-8 Standard (Antigravity)
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$vbsSource = Join-Path $PSScriptRoot "AntigravityBridge.vbs"
$vbsTarget = Join-Path $startupDir "AntigravityBridge.vbs"

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host " Configuration du Service d'Arriere-plan Antigravity" -ForegroundColor Magenta
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan

# 1. Copie du lanceur dans le dossier Startup
Copy-Item -Path $vbsSource -Destination $vbsTarget -Force
Write-Host "[OK] Lanceur permanent installe dans le demarrage Windows :" -ForegroundColor Green
Write-Host "     $vbsTarget" -ForegroundColor Gray

# 2. Arret de tout processus existant sur le port 8765
Write-Host "[INFO] Arret des processus precedents sur le port 8765..." -ForegroundColor Yellow
$procId = (Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue).OwningProcess
if ($procId) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 3. Lancement immediat en mode totalement invisible via WScript
Write-Host "[INFO] Lancement du service invisible..." -ForegroundColor Green
Start-Process "wscript.exe" -ArgumentList "`"$vbsTarget`""
Start-Sleep -Seconds 3

# 4. Verification de sante (Healthcheck)
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -Method Get -TimeoutSec 5
    Write-Host "[OK] Service Antigravity Bridge operationnel en arriere-plan !" -ForegroundColor Green
    Write-Host "     Statut  : $($res.status)" -ForegroundColor Cyan
    Write-Host "     Version : $($res.version)" -ForegroundColor Cyan
    Write-Host "     Port    : 8765" -ForegroundColor Cyan
    Write-Host "     Logs    : $env:USERPROFILE\.gemini\antigravity\logs\bridge.log" -ForegroundColor Gray
} catch {
    Write-Warning "Le bridge demarre... Consultez le fichier de log : $env:USERPROFILE\.gemini\antigravity\logs\bridge.log"
}

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
