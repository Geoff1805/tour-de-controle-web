# Antigravity Controller - Script d'execution en arriere-plan
# Destine a etre execute par la tache planifiee Windows sans fenetre console

$ErrorActionPreference = "Continue"

$logDir = "$env:USERPROFILE\.gemini\antigravity\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir "bridge.log"

$pythonBin = "$env:LOCALAPPDATA\Programs\Python\Python312-arm64\python.exe"
if (-not (Test-Path $pythonBin)) {
    $pythonBin = "python"
}

$env:AGY_BRIDGE_TOKEN = "antigravity-secure-key-2026"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "[$timestamp] [INFO] Demarrage du bridge Antigravity Controller..."

Push-Location $PSScriptRoot
try {
    & $pythonBin -m uvicorn main:app --host 0.0.0.0 --port 8765 *>> $logFile
} catch {
    Add-Content -Path $logFile -Value "[$timestamp] [ERROR] Exception bridge: $_"
} finally {
    Pop-Location
}
