# Antigravity Batch Runner (Zero-Tunnel Engine)
# Verification et execution en batch des missions GitHub

param(
    [switch]$Startup,
    [switch]$AutoRun,
    [switch]$Watch,
    [int]$IntervalSec = 60,
    [int]$MaxWaitWifiSec = 45
)

# Configuration Encodage UTF-8 Standard (Antigravity)
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

$AGY_DIR = "$env:USERPROFILE\.gemini\antigravity"
$BATCH_JSON = Join-Path $AGY_DIR "pending_batch.json"
$BATCH_MD = Join-Path $AGY_DIR "BATCH_MISSIONS.md"
$SYNC_SCRIPT = Join-Path $PSScriptRoot "..\pc_bridge\sync_config.ps1"

function Show-Notification {
    param([string]$Title, [string]$Message)
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $textNodes = $template.GetElementsByTagName("text")
        $textNodes.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null
        $textNodes.Item(1).AppendChild($template.CreateTextNode($Message)) | Out-Null
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Antigravity Batch")
        $notification = [Windows.UI.Notifications.ToastNotification]::new($template)
        $notifier.Show($notification)
    } catch {
        # Notification silencieuse si indisponible
    }
}

function Wait-ForNetwork {
    param([int]$TimeoutSec)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        try {
            $tcp = [System.Net.Sockets.TcpClient]::new()
            $connect = $tcp.BeginConnect("api.github.com", 443, $null, $null)
            $success = $connect.AsyncWaitHandle.WaitOne(2000, $false)
            if ($success -and $tcp.Connected) {
                $tcp.EndConnect($connect)
                $tcp.Close()
                return $true
            }
            $tcp.Close()
        } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

function Check-BatchQueue {
    Write-Host "[Batch Runner] Interrogation de la file GitHub (/user/issues?labels=batch-mission)..." -ForegroundColor Cyan
    try {
        $raw = & gh api "/user/issues?filter=all&labels=batch-mission&state=open" 2>$null | Out-String
        if (-not $raw) { return @() }
        $items = $raw | ConvertFrom-Json
        return @($items)
    } catch {
        Write-Warning "Erreur lors de la requête GitHub API : $_"
        return @()
    }
}

function Save-BatchState {
    param([array]$Missions)

    if (-not (Test-Path $AGY_DIR)) {
        New-Item -ItemType Directory -Path $AGY_DIR -Force | Out-Null
    }

    $state = [PSCustomObject]@{
        pending_count = $Missions.Count
        updated_at    = (Get-Date).ToString("o")
        missions      = $Missions | ForEach-Object {
            $repo = if ($_.repository.full_name) { $_.repository.full_name } else { $_.repository.nameWithOwner }
            $url = if ($_.html_url) { $_.html_url } else { $_.url }
            $createdAt = if ($_.created_at) { $_.created_at } else { $_.createdAt }
            [PSCustomObject]@{
                number     = $_.number
                repo       = $repo
                title      = $_.title
                url        = $url
                created_at = $createdAt
                labels     = ($_.labels | ForEach-Object { $_.name }) -join ", "
            }
        }
    }

    $state | ConvertTo-Json -Depth 5 | Set-Content -Path $BATCH_JSON -Encoding UTF8

    # Génération du Markdown de suivi pour Antigravity
    $md = @()
    $md += "# 📥 File d'Attente Batch Antigravity"
    $md += ""
    $md += "> Dernier scan : **$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')** | Missions en attente : **$($Missions.Count)**"
    $md += ""
    if ($Missions.Count -eq 0) {
        $md += "✨ *Aucune mission en attente dans la file.*"
    } else {
        $md += "| # | Dépôt | Titre | Date | Actions |"
        $md += "| :--- | :--- | :--- | :--- | :--- |"
        foreach ($m in $Missions) {
            $repo = if ($m.repository.full_name) { $m.repository.full_name } else { $m.repository.nameWithOwner }
            $url = if ($m.html_url) { $m.html_url } else { $m.url }
            $createdAt = if ($m.created_at) { $m.created_at } else { $m.createdAt }
            $num = $m.number
            $md += "| #$num | `$repo` | [$($m.title)]($url) | $createdAt | `gh issue view $num --repo $repo` |"
        }
        $md += ""
        $md += "### Détails des Missions"
        foreach ($m in $Missions) {
            $repo = if ($m.repository.full_name) { $m.repository.full_name } else { $m.repository.nameWithOwner }
            $url = if ($m.html_url) { $m.html_url } else { $m.url }
            $md += "#### #$($m.number) - $($m.title) (`$repo`)"
            $md += "- **URL** : $url"
            $md += "- **Instructions** :"
            $md += '```text'
            $md += $m.body
            $md += '```'
            $md += ""
        }
    }
    $md -join "`n" | Set-Content -Path $BATCH_MD -Encoding UTF8
}

function Process-AutomaticTasks {
    param([array]$Missions)

    foreach ($m in $Missions) {
        $repo = if ($m.repository.full_name) { $m.repository.full_name } else { $m.repository.nameWithOwner }
        $num = $m.number
        $labels = ($m.labels | ForEach-Object { $_.name })
        
        # 1. Traitement automatique des demandes de synchronisation de config
        if ($labels -contains "sync-config" -or $m.title -match "\[Sync\]|Synchronisation") {
            Write-Host "🔄 [Auto] Exécution de la synchronisation de configuration pour #$num..." -ForegroundColor Magenta
            if (Test-Path $SYNC_SCRIPT) {
                & powershell.exe -ExecutionPolicy Bypass -File $SYNC_SCRIPT -Force
                Write-Host "✓ Synchronisation terminée. Clôture de l'Issue #$num..." -ForegroundColor Green
                & gh issue close $num --repo $repo --comment "✅ Synchronisation des configurations terminée avec succès sur PC Windows."
            }
        }
    }
}

# ----------------- MAIN -----------------

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " 🚀 Antigravity Batch Runner (Zero-Tunnel Engine)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Attente du réseau si démarré avec Windows
if ($Startup) {
    Write-Host "[Startup] Vérification de la connectivité Wi-Fi / Internet (max $($MaxWaitWifiSec)s)..." -ForegroundColor Yellow
    $netOk = Wait-ForNetwork -TimeoutSec $MaxWaitWifiSec
    if (-not $netOk) {
        Write-Warning "[Startup] Réseau indisponible. Le runner s'arrête sans bloquer la session."
        exit 0
    }
    Write-Host "[Startup] Connectivité réseau confirmée !" -ForegroundColor Green
}

do {
    $missions = Check-BatchQueue
    Save-BatchState -Missions $missions

    if ($missions.Count -eq 0) {
        Write-Host "✓ File d'attente vide (0 mission). Tout est à jour." -ForegroundColor Green
    } else {
        Write-Host "⚡ $($missions.Count) mission(s) trouvée(s) dans la file !" -ForegroundColor Yellow
        foreach ($m in $missions) {
            $repo = if ($m.repository.full_name) { $m.repository.full_name } else { $m.repository.nameWithOwner }
            Write-Host "   - [#$($m.number)] $repo : $($m.title)" -ForegroundColor White
        }

        # Notification Toast Windows
        Show-Notification -Title "🚀 Antigravity Batch" -Message "$($missions.Count) mission(s) en attente dans la file GitHub."

        # Exécution des tâches automatiques (sync, etc.)
        Process-AutomaticTasks -Missions $missions
    }

    if ($Watch) {
        Write-Host "[Watch] En attente de la prochaine vérification dans $($IntervalSec)s..." -ForegroundColor DarkGray
        Start-Sleep -Seconds $IntervalSec
    }
} while ($Watch)

Write-Host "====================================================" -ForegroundColor Cyan
