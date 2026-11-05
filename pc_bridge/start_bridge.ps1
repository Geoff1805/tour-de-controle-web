# Antigravity Controller - PC Bridge
# Script de demarrage PowerShell

param(
    [string]$Token = $env:AGY_BRIDGE_TOKEN,
    [int]$Port = 8765,
    [string]$BindHost = "0.0.0.0"
)

# Configuration Encodage UTF-8 Standard (Antigravity)
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'


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
    Write-Error "AGY_BRIDGE_TOKEN est obligatoire. Definis-le dans l'environnement Windows avant de demarrer le bridge."
    exit 1
}
$env:AGY_BRIDGE_TOKEN = $Token

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host " Antigravity Controller - Serveur Bridge PC" -ForegroundColor Magenta
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "   Adresse : http://${BindHost}:${Port}" -ForegroundColor Green
Write-Host "   Health  : http://localhost:${Port}/health" -ForegroundColor Green
Write-Host "   SSE     : http://localhost:${Port}/stream/events" -ForegroundColor Green
Write-Host "   Token   : configure (non affiche)" -ForegroundColor Yellow
Write-Host "   Reseau  : Securise via Tailscale VPN" -ForegroundColor Cyan
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

Push-Location $PSScriptRoot
try {
    & $pythonBin -m uvicorn main:app --host $BindHost --port $Port
} finally {
    Pop-Location
}
