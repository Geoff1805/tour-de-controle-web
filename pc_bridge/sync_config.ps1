<#
.SYNOPSIS
    Script de synchronisation automatique de la configuration Antigravity avec GitHub.
.DESCRIPTION
    Surveille et synchronise le dépôt central 'antigravity-config' avec le répertoire local
    Antigravity (C:\Users\geoff\.gemini\antigravity).
    Permet la mise à jour bidirectionnelle : push depuis Windows ou pull des modifs mobile.
#>

param(
    [string]$Action = "sync", # "pull", "push", "sync", "watch"
    [string]$ConfigRepoDir = "$env:USERPROFILE\.gemini\antigravity_config_repo",
    [string]$LocalAgyDir = "$env:USERPROFILE\.gemini\antigravity",
    [string]$RemoteRepo = "https://github.com/Geoff1805/antigravity-config.git"
)

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " 🔄 Antigravity 2.0 — Synchronisateur de Configuration" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

# 1. Vérification / Initialisation du clone local
if (-not (Test-Path "$ConfigRepoDir\.git")) {
    Write-Host "📁 Dépôt local absent, initialisation dans : $ConfigRepoDir" -ForegroundColor Yellow
    if (-not (Test-Path $ConfigRepoDir)) {
        New-Item -ItemType Directory -Force -Path $ConfigRepoDir | Out-Null
    }
    
    # Clone ou git init
    Push-Location $ConfigRepoDir
    try {
        git clone $RemoteRepo . 2>$null
        if (-not (Test-Path "$ConfigRepoDir\.git")) {
            git init -b main
            git remote add origin $RemoteRepo 2>$null
        }
    } finally {
        Pop-Location
    }
}

function Sync-FromGitToAgy {
    Write-Host "⬇️ Pull depuis GitHub et déploiement vers Antigravity..." -ForegroundColor Green
    Push-Location $ConfigRepoDir
    try {
        git pull origin main 2>$null
        
        # Copie des règles, skills, prompts et configs
        $items = @("rules", "skills", "prompts", "mcp")
        foreach ($item in $items) {
            $src = Join-Path $ConfigRepoDir $item
            $dest = Join-Path $LocalAgyDir $item
            if (Test-Path $src) {
                Copy-Item -Path "$src\*" -Destination $dest -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  ✓ $item synchronisé" -ForegroundColor Gray
            }
        }
        Write-Host "✅ Configuration locale mise à jour !" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

function Update-TailscaleConnectionInfo {
    $tailscaleBin = "tailscale"
    $knownPath = "C:\Program Files\Tailscale\tailscale.exe"
    if (Test-Path $knownPath) { $tailscaleBin = $knownPath }
    
    try {
        $jsonStr = & $tailscaleBin status --json 2>$null | Out-String
        if ($jsonStr) {
            $ts = $jsonStr | ConvertFrom-Json
            $selfNode = $ts.Self
            $ips = $selfNode.TailscaleIPs
            $ipv4 = if ($ips.Count -gt 0) { $ips[0] } else { "" }
            $ipv6 = if ($ips.Count -gt 1) { $ips[1] } else { "" }
            $dnsName = if ($selfNode.DNSName) { $selfNode.DNSName.TrimEnd('.') } else { "" }
            $hostname = $selfNode.HostName
            $tailnet = $ts.CurrentTailnet.Name
            
            $connInfo = [PSCustomObject]@{
                tailscale_ip   = $ipv4
                tailscale_ipv6 = $ipv6
                hostname       = $hostname
                dns_name       = $dnsName
                tailnet        = $tailnet
                port           = 8765
                bridge_url     = if ($ipv4) { "http://${ipv4}:8765" } else { "" }
                magicdns_url   = if ($dnsName) { "http://${dnsName}:8765" } else { "" }
                status         = "online"
                updated_at     = (Get-Date -Format "o")
            }
            
            $configDir = Join-Path $ConfigRepoDir "config"
            if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Force -Path $configDir | Out-Null }
            $connFile = Join-Path $configDir "connection.json"
            $connInfo | ConvertTo-Json -Depth 4 | Set-Content -Path $connFile -Encoding utf8
            Write-Host "  ✓ Info de connexion Tailscale générée ($ipv4, $dnsName)" -ForegroundColor Green
        }
    } catch {
        Write-Warning "Impossible de récupérer l'état Tailscale : $_"
    }
}

function Sync-FromAgyToGit {
    Write-Host "⬆️ Détection des modifications locales et push vers GitHub..." -ForegroundColor Cyan
    Push-Location $ConfigRepoDir
    try {
        # Actualise les métadonnées de connexion réseau Tailscale
        Update-TailscaleConnectionInfo

        # Copie inverse (inclut mcp pour préserver les évolutions d'ai-council)
        $items = @("rules", "skills", "prompts", "mcp")
        foreach ($item in $items) {
            $src = Join-Path $LocalAgyDir $item
            $dest = Join-Path $ConfigRepoDir $item
            if (Test-Path $src) {
                if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
                Copy-Item -Path "$src\*" -Destination $dest -Recurse -Force -ErrorAction SilentlyContinue
            }
        }

        git add .
        $status = git status --porcelain
        if ($status) {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            git commit -m "chore(sync): mise à jour de la configuration ($timestamp)"
            git push origin main
            Write-Host "🚀 Modifications publiées sur GitHub !" -ForegroundColor Green
        } else {
            Write-Host "ℹ️ Aucune modification locale à pousser." -ForegroundColor Gray
        }
    } finally {
        Pop-Location
    }
}

switch ($Action.ToLower()) {
    "pull"  { Sync-FromGitToAgy }
    "push"  { Sync-FromAgyToGit }
    "sync"  {
        Sync-FromGitToAgy
        Sync-FromAgyToGit
    }
    "watch" {
        Write-Host "👀 Mode surveillance actif (vérification toutes les 60 secondes)..." -ForegroundColor Yellow
        while ($true) {
            Sync-FromGitToAgy
            Start-Sleep -Seconds 60
        }
    }
}
