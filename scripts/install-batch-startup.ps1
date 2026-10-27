# Installation du lanceur Batch au demarrage de session Windows
# Antigravity Batch Runner (Zero-Tunnel)

param(
    [switch]$Force
)

# Configuration Encodage UTF-8 Standard (Antigravity)
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$vbsTarget = Join-Path $startupDir "AntigravityBatchStartup.vbs"
$runnerPath = (Join-Path $PSScriptRoot "run-batch-runner.ps1")
$binDir = "$env:USERPROFILE\.gemini\antigravity\bin"
$shimTarget = Join-Path $binDir "batch.cmd"

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host " Configuration du Runner Batch au Demarrage Windows" -ForegroundColor Magenta
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan

# 1. Generation du lanceur silencieux VBS dans Startup
$vbsContent = "Set WshShell = CreateObject(""WScript.Shell"")`r`nWshShell.Run ""powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """"$runnerPath"""" -Startup"", 0, False`r`n"

[System.IO.File]::WriteAllText($vbsTarget, $vbsContent, [System.Text.Encoding]::ASCII)
Write-Host "[OK] Lanceur silencieux configure dans le demarrage Windows :" -ForegroundColor Green
Write-Host "     $vbsTarget" -ForegroundColor Gray

# 2. Creation du shim CLI 'batch' dans le PATH
if (Test-Path $binDir) {
    $cmdContent = "@echo off`r`npowershell -ExecutionPolicy Bypass -NoProfile -File `"$runnerPath`" %*`r`n"
    [System.IO.File]::WriteAllText($shimTarget, $cmdContent, [System.Text.Encoding]::ASCII)
    Write-Host "[OK] Raccourci CLI 'batch' disponible dans le terminal :" -ForegroundColor Green
    Write-Host "     $shimTarget" -ForegroundColor Gray
}

# 3. Test immediat d'interrogation
Write-Host "`n[TEST] Execution test du runner..." -ForegroundColor Cyan
& powershell.exe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-batch-runner.ps1")

Write-Host "`n[OK] Installation terminee avec succes !" -ForegroundColor Green
Write-Host "     Desormais, a chaque ouverture de session Windows (des connexion au Wi-Fi)," -ForegroundColor White
Write-Host "     le runner interrogera la file d'attente GitHub en arriere-plan (0% CPU, 0 tunnel)." -ForegroundColor White
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
