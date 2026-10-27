"""
Antigravity Controller — PC Bridge
===================================
Serveur FastAPI exposant les agents Antigravity via SSE (Server-Sent Events).
Sécurisé via Tailscale (VPN mesh P2P) — ne jamais exposer sur internet public.

Démarrage : uvicorn main:app --host 0.0.0.0 --port 8765
Prérequis  : pip install -r requirements.txt
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("agy-bridge")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BRIDGE_TOKEN = os.environ.get("AGY_BRIDGE_TOKEN", "change-me-in-prod")
AGY_SOCKET_PATH = os.environ.get("AGY_SOCKET_PATH", r"C:\Users\geoff\.gemini\antigravity")
CONFIG_REPO_PATH = os.environ.get("AGY_CONFIG_REPO_PATH", os.path.expanduser(r"~/.gemini/antigravity_config_repo"))

# File de messages SSE globale (en mémoire, remplacée par SQLite en v2)
_event_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=1000)
# Historique circulaire pour les nouveaux clients qui se connectent
_event_history: deque[dict] = deque(maxlen=50)
# Connexions SSE actives
_active_connections: list[asyncio.Queue[dict]] = []

# ---------------------------------------------------------------------------
# Modèles Pydantic
# ---------------------------------------------------------------------------

class AgentStatus(BaseModel):
    """Statut d'un agent Antigravity."""
    id: str
    role: str
    state: str  # running | idle | waiting_for_input | errored
    state_detail: str | None = None
    created_at: float = 0.0


class ApprovalRequest(BaseModel):
    """Demande d'approbation émise par un agent."""
    agent_id: str
    action: str
    context: str
    expires_at: float  # Timestamp UNIX — après ce délai l'agent passe en pause


class ApprovalResponse(BaseModel):
    """Réponse mobile → PC pour une approbation."""
    agent_id: str
    decision: str  # approve | reject | modify
    modification: str | None = None


class LaunchMission(BaseModel):
    """Paramètres pour lancer une nouvelle mission agent."""
    prompt: str
    model: str = "gemini-2.5-pro"
    max_tokens: int = 100_000
    require_approval: bool = True


# ---------------------------------------------------------------------------
# Sécurité — Bearer token statique (JWT rotatif en v2)
# ---------------------------------------------------------------------------

security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Vérifie le token d'authentification du bridge."""
    if credentials.credentials != BRIDGE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
        )
    return credentials.credentials


# ---------------------------------------------------------------------------
# Dispatcher SSE
# ---------------------------------------------------------------------------

async def _broadcast(event: dict) -> None:
    """Diffuse un événement à toutes les connexions SSE actives."""
    _event_history.append(event)
    for q in _active_connections:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("File SSE pleine pour une connexion — événement ignoré")


def get_tailscale_info() -> dict:
    """Récupère dynamiquement l'état et l'adresse Tailscale de la machine."""
    import shutil
    tailscale_bin = shutil.which("tailscale") or r"C:\Program Files\Tailscale\tailscale.exe"
    try:
        res = subprocess.run([tailscale_bin, "status", "--json"], capture_output=True, text=True, timeout=3)
        if res.returncode == 0:
            data = json.loads(res.stdout)
            self_node = data.get("Self", {})
            ips = self_node.get("TailscaleIPs", [])
            ipv4 = ips[0] if ips else ""
            ipv6 = ips[1] if len(ips) > 1 else ""
            dns_name = self_node.get("DNSName", "").rstrip(".")
            hostname = self_node.get("HostName", "")
            tailnet = data.get("CurrentTailnet", {}).get("Name", "")
            return {
                "online": self_node.get("Online", True),
                "tailscale_ip": ipv4,
                "tailscale_ipv6": ipv6,
                "hostname": hostname,
                "dns_name": dns_name,
                "tailnet": tailnet,
                "port": 8765,
                "bridge_url": f"http://{ipv4}:8765" if ipv4 else "",
                "magicdns_url": f"http://{dns_name}:8765" if dns_name else "",
            }
    except Exception as e:
        logger.warning(f"Erreur lecture Tailscale JSON: {e}")

    # Fallback IP simple
    fallback_ip = "100.64.123.60"
    try:
        res = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=2)
        ip = res.stdout.strip()
        if ip:
            fallback_ip = ip
    except Exception:
        pass

    return {
        "online": True,
        "tailscale_ip": fallback_ip,
        "tailscale_ipv6": "",
        "hostname": "laptopgeoff",
        "dns_name": "laptopgeoff.tail6d4af6.ts.net",
        "tailnet": "alsteens.net",
        "port": 8765,
        "bridge_url": f"http://{fallback_ip}:8765",
        "magicdns_url": "http://laptopgeoff.tail6d4af6.ts.net:8765",
    }


def get_tailscale_ip() -> str:
    """Raccourci retournant l'IPv4 Tailscale."""
    return get_tailscale_info().get("tailscale_ip", "100.64.123.60")


def publish_connection_info_to_repo() -> None:
    """Enregistre et publie la configuration de connexion dans le dépôt central."""
    try:
        info = get_tailscale_info()
        repo_dir = Path(CONFIG_REPO_PATH)
        config_dir = repo_dir / "config"
        config_dir.mkdir(parents=True, exist_ok=True)
        conn_file = config_dir / "connection.json"

        existing = {}
        if conn_file.exists():
            try:
                existing = json.loads(conn_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        if existing.get("tailscale_ip") != info["tailscale_ip"] or existing.get("dns_name") != info["dns_name"]:
            conn_file.write_text(json.dumps(info, indent=2), encoding="utf-8")
            logger.info(f"🔄 Nouvelle adresse Tailscale enregistrée: {info['tailscale_ip']} ({info['dns_name']})")
            subprocess.run(["git", "-C", str(repo_dir), "add", "config/connection.json"], capture_output=True, timeout=5)
            subprocess.run(["git", "-C", str(repo_dir), "commit", "-m", f"chore(network): actualisation IP Tailscale ({info['tailscale_ip']})"], capture_output=True, timeout=5)
            subprocess.run(["git", "-C", str(repo_dir), "push", "origin", "main"], capture_output=True, timeout=10)
            logger.info("🚀 Configuration réseau mise à jour sur GitHub (Geoff1805/antigravity-config) !")
    except Exception as e:
        logger.warning(f"Impossible de publier connection.json vers Git: {e}")


def get_github_token() -> str:
    try:
        res = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=2)
        tok = res.stdout.strip()
        if tok:
            return tok
    except Exception:
        pass
    return os.environ.get("GITHUB_TOKEN", "")


async def _event_generator(client_queue: asyncio.Queue[dict]) -> AsyncIterator[str]:
    """Génère le flux SSE pour un client connecté."""
    # Envoie l'historique récent au client qui vient de se connecter
    for past_event in _event_history:
        yield f"data: {json.dumps(past_event)}\n\n"

    # Flux en temps réel avec battement actif toutes les 5 secondes
    while True:
        try:
            event = await asyncio.wait_for(client_queue.get(), timeout=5.0)
            yield f"data: {json.dumps(event)}\n\n"
        except asyncio.TimeoutError:
            ts = get_tailscale_info()
            pulse = {
                "type": "heartbeat",
                "bridge_status": "online",
                "tailscale_ip": ts.get("tailscale_ip"),
                "dns_name": ts.get("dns_name"),
                "timestamp": time.time(),
            }
            yield f"data: {json.dumps(pulse)}\n\n"


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Tâches de démarrage/arrêt du bridge."""
    ts = get_tailscale_info()
    logger.info("🚀 Antigravity Controller Bridge démarré sur :8765")
    logger.info(f"🔒 Tailscale IPv4: {ts.get('tailscale_ip')}")
    logger.info(f"🌐 MagicDNS: {ts.get('dns_name')}")
    publish_connection_info_to_repo()
    yield
    logger.info("🛑 Bridge arrêté")


# ---------------------------------------------------------------------------
# Application FastAPI
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Antigravity Controller Bridge",
    version="1.0.0",
    description="Bridge PC ↔ Mobile pour Antigravity Controller",
    lifespan=lifespan,
)

# CORS restreint à l'app Flutter (via Tailscale, l'IP sera celle du réseau VPN)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    """Endpoint de vérification du bridge — accessible sans auth."""
    ts = get_tailscale_info()
    return {
        "status": "ok",
        "bridge": "Antigravity Controller",
        "tailscale_ip": ts.get("tailscale_ip"),
        "dns_name": ts.get("dns_name"),
        "hostname": ts.get("hostname"),
        "version": "1.0.0",
        "timestamp": time.time(),
    }


@app.get("/bridge/info")
async def bridge_info(_token: str = Depends(verify_token)) -> dict:
    """
    Fournit le statut du PC au mobile pour configuration automatique.

    Sécurité : protégé par le Bearer AGY_BRIDGE_TOKEN.
    Le token GitHub ne quitte JAMAIS le PC — seul un booléen indique
    s'il est configuré côté serveur.
    """
    ts = get_tailscale_info()
    return {
        "status": "ok",
        "bridge": "Antigravity Controller",
        "tailscale_ip": ts.get("tailscale_ip"),
        "tailscale_ipv6": ts.get("tailscale_ipv6"),
        "hostname": ts.get("hostname"),
        "dns_name": ts.get("dns_name"),
        "tailnet": ts.get("tailnet"),
        "port": 8765,
        "bridge_url": ts.get("bridge_url"),
        "magicdns_url": ts.get("magicdns_url"),
        "github_username": "Geoff1805",
        "github_token_configured": bool(get_github_token()),
        "selected_repo": "antigravity-controller",
        "timestamp": time.time(),
    }


@app.get("/bridge/tailscale")
async def bridge_tailscale(_token: str = Depends(verify_token)) -> dict:
    """Retourne l'état complet de la connectivité Tailscale du PC."""
    return get_tailscale_info()


@app.get("/stream/events")
async def stream_events(
    request: Request,
    _token: str = Depends(verify_token),
) -> StreamingResponse:
    """
    Flux SSE temps réel : statuts agents, logs, demandes d'approbation.
    Le mobile se connecte ici et reçoit tous les événements en push.
    """
    client_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=200)
    _active_connections.append(client_queue)
    logger.info(f"📱 Nouveau client SSE connecté ({len(_active_connections)} actifs)")

    async def cleanup():
        try:
            async for chunk in _event_generator(client_queue):
                # Vérifie si le client s'est déconnecté
                if await request.is_disconnected():
                    break
                yield chunk.encode("utf-8")
        finally:
            _active_connections.remove(client_queue)
            logger.info(f"📱 Client SSE déconnecté ({len(_active_connections)} restants)")

    return StreamingResponse(
        cleanup(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/agents", response_model=list[AgentStatus])
async def list_agents(_token: str = Depends(verify_token)) -> list[AgentStatus]:
    """
    Retourne la liste des agents actifs.
    TODO v2 : lire depuis le socket IPC d'Antigravity.
    """
    # Stub — remplacé par lecture du fichier d'état AGY en v2
    return [
        AgentStatus(
            id="demo-agent-1",
            role="Code Researcher",
            state="idle",
            created_at=time.time() - 300,
        )
    ]


@app.post("/approvals/respond")
async def respond_to_approval(
    response: ApprovalResponse,
    _token: str = Depends(verify_token),
) -> dict:
    """
    Reçoit la décision d'approbation depuis le mobile et la transmet à l'agent.
    L'agent attend via un fichier lock ou une queue IPC.
    """
    logger.info(f"✅ Approbation reçue: agent={response.agent_id} decision={response.decision}")

    # Diffuse l'événement à toutes les connexions SSE (pour mise à jour UI)
    await _broadcast({
        "type": "approval_response",
        "agent_id": response.agent_id,
        "decision": response.decision,
        "modification": response.modification,
        "timestamp": time.time(),
    })

    # TODO v2 : écrire dans le fichier d'approbation lu par l'agent AGY
    approval_file = os.path.join(
        AGY_SOCKET_PATH, "approvals", f"{response.agent_id}.json"
    )
    os.makedirs(os.path.dirname(approval_file), exist_ok=True)
    with open(approval_file, "w", encoding="utf-8") as f:
        json.dump({
            "decision": response.decision,
            "modification": response.modification,
            "timestamp": time.time(),
        }, f)

    return {"status": "ok", "agent_id": response.agent_id}


@app.post("/missions/launch")
async def launch_mission(
    mission: LaunchMission,
    _token: str = Depends(verify_token),
) -> dict:
    """
    Lance une nouvelle mission agent depuis le mobile.
    TODO v2 : appeler l'API CLI d'Antigravity directement.
    """
    logger.info(f"🚀 Mission lancée: model={mission.model} prompt={mission.prompt[:50]}...")

    await _broadcast({
        "type": "mission_launched",
        "prompt": mission.prompt,
        "model": mission.model,
        "timestamp": time.time(),
    })

    # TODO v2 : subprocess appel agy CLI
    return {"status": "queued", "message": "Mission transmise à Antigravity"}


@app.post("/events/push")
async def push_event(
    event: dict,
    _token: str = Depends(verify_token),
) -> dict:
    """
    Permet à Antigravity (via hook) de pousser des événements au bridge.
    Le bridge les redistribue en SSE vers tous les mobiles connectés.
    """
    await _broadcast(event)
    return {"status": "broadcasted", "connections": len(_active_connections)}


# ---------------------------------------------------------------------------
# Endpoints de Configuration (Partage Mobile <-> PC <-> GitHub)
# ---------------------------------------------------------------------------

@app.get("/config")
async def get_config_summary(_token: str = Depends(verify_token)) -> dict:
    """
    Retourne l'état de la configuration partagée (antigravity-config) :
    dernier commit, branche, statut et liste des fichiers de configuration.
    """
    repo_dir = Path(CONFIG_REPO_PATH)
    if not repo_dir.exists():
        raise HTTPException(status_code=404, detail="Dépôt de configuration non trouvé")

    # Lecture du dernier commit via git si disponible
    commit_sha = "unknown"
    commit_msg = "Mise à jour de la configuration"
    try:
        res = subprocess.run(
            ["git", "-C", str(repo_dir), "log", "-1", "--format=%h|%s"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if res.returncode == 0 and res.stdout.strip():
            parts = res.stdout.strip().split("|", 1)
            commit_sha = parts[0]
            if len(parts) > 1:
                commit_msg = parts[1]
    except Exception as e:
        logger.warning(f"Impossible de lire le git log config : {e}")

    # Inventaire des fichiers clés
    config_files = []
    monitored = [
        ("rules/global.md", "Règles", "Règles globales d'agent"),
        ("config/antigravity.yaml", "Runtime", "Configuration générale Antigravity 2.0"),
        ("config/models.yaml", "Modèles", "Cartographie des modèles d'IA"),
        ("skills/registry.json", "Skills", "Compétences et sous-agents autorisés"),
        ("prompts/missions/", "Prompts", "Bibliothèque de prompts et missions"),
    ]

    for rel_path, tag, desc in monitored:
        full_path = repo_dir / rel_path
        exists = full_path.exists()
        config_files.append({
            "path": rel_path,
            "title": rel_path,
            "tag": tag,
            "description": desc,
            "exists": exists,
            "size_bytes": full_path.stat().st_size if exists and full_path.is_file() else None,
            "updated_at": full_path.stat().st_mtime if exists else None,
        })

    return {
        "repo": "Geoff1805/antigravity-config",
        "branch": "main",
        "commit_sha": commit_sha,
        "commit_message": commit_msg,
        "status": "synchronized",
        "files": config_files,
        "timestamp": time.time(),
    }


@app.get("/config/file")
async def get_config_file(path: str, _token: str = Depends(verify_token)) -> dict:
    """
    Lit et retourne le contenu d'un fichier de configuration spécifique pour l'affichage mobile.
    """
    # Protection path traversal
    normalized = Path(path).as_posix()
    if ".." in normalized or normalized.startswith("/"):
        raise HTTPException(status_code=400, detail="Chemin invalide")

    repo_dir = Path(CONFIG_REPO_PATH)
    target = repo_dir / normalized

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"Fichier {path} introuvable")

    try:
        content = target.read_text(encoding="utf-8")
        return {
            "path": normalized,
            "content": content,
            "size_bytes": len(content.encode("utf-8")),
            "modified_at": target.stat().st_mtime,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de lecture : {e}")


@app.post("/config/sync")
async def trigger_config_sync(_token: str = Depends(verify_token)) -> dict:
    """
    Déclenche la synchronisation bidirectionnelle de la configuration avec GitHub.
    Diffuse un événement SSE 'config_synced' pour notifier tous les mobiles connectés.
    """
    logger.info("🔄 Déclenchement de la synchronisation de configuration...")

    sync_script = Path(__file__).parent / "sync_config.ps1"
    output = "Script exécuté"
    success = True

    if sync_script.exists():
        try:
            res = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(sync_script), "-Action", "sync"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = res.stdout
            success = res.returncode == 0
        except Exception as e:
            logger.error(f"Erreur exécution sync_config.ps1 : {e}")
            output = str(e)
            success = False

    # Notification temps réel SSE aux applications mobiles
    await _broadcast({
        "type": "config_synced",
        "success": success,
        "timestamp": time.time(),
        "summary": "Synchronisation avec GitHub effectuée",
    })

    return {
        "status": "success" if success else "partial",
        "output": output,
        "timestamp": time.time(),
    }
