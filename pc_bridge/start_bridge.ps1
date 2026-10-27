# Antigravity Controller - PC Bridge
# Script de demarrage PowerShell

param(
    [string]$Token = $env:AGY_BRIDGE_TOKEN,
    [int]$Port = 8765,
    [string]$BindHost = "0.0.0.0"
)

# 1. Detection de Python
$pythonBin = "python"
$knownPython = "$env:LOCALAPPDATA\Programs\Python\Python312-arm64\python.exe"
if (Test-Path $knownPython) {
    $pythonBin = $knownPython
} elseif (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python est introuvable."
    exit 1
}

# 2. Token de securite
if (-not $Token) {
    $Token = "antigravity-secure-key-2026"
    Write-Host "[INFO] Variable AGY_BRIDGE_TOKEN non definie : token par defaut = '$Token'" -ForegroundColor Yellow
}
$env:AGY_BRIDGE_TOKEN = $Token

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host " Antigravity Controller - Serveur Bridge PC" -ForegroundColor Magenta
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "   Adresse : http://${BindHost}:${Port}" -ForegroundColor Green
Write-Host "   Health  : http://localhost:${Port}/health" -ForegroundColor Green
Write-Host "   SSE     : http://localhost:${Port}/stream/events" -ForegroundColor Green
Write-Host "   Token   : $Token" -ForegroundColor Yellow
Write-Host "   Reseau  : Securise via Tailscale VPN" -ForegroundColor Cyan
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

Push-Location $PSScriptRoot
try {
    & $pythonBin -m uvicorn main:app --host $BindHost --port $Port
} finally {
    Pop-Location
}
