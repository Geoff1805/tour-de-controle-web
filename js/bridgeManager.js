/**
 * Gestionnaire de la Passerelle PC Bridge (FastAPI) & SSE Temps Réel
 * Assure la parité 100% avec Antigravity Mobile (Approvals Human-in-the-Loop, SSE Stream, Missions)
 */

export class BridgeManager {
	constructor(appRef) {
		this.app = appRef;
		this.eventSource = null;
		this.isConnected = false;
		this.pendingApprovals = [];
		this.reconnectTimer = null;
		this.dom = {
			badge: null,
			approvalsContainer: null,
		};
	}

	init() {
		this.dom.badge = document.getElementById("bridge-status-badge");
		this.dom.approvalsContainer = document.getElementById(
			"bridge-approvals-list",
		);

		// Démarrer la surveillance du Bridge
		this.checkBridgeStatus();
		this.connectSSE();

		// Rafraîchissement périodique toutes les 30s
		setInterval(() => this.checkBridgeStatus(), 30000);
	}

	getBridgeUrl() {
		return localStorage.getItem("tdc_bridge_url") || "http://localhost:8765";
	}

	getBridgeToken() {
		return (
			sessionStorage.getItem("tdc_bridge_token") ||
			localStorage.getItem("tdc_bridge_token") ||
			""
		);
	}

	getHeaders() {
		const headers = { "Content-Type": "application/json" };
		const token = this.getBridgeToken();
		if (token) headers.Authorization = `Bearer ${token}`;
		return headers;
	}

	async checkBridgeStatus() {
		const url = this.getBridgeUrl();
		try {
			const res = await fetch(`${url}/health`, {
				method: "GET",
				signal: AbortSignal.timeout(4000),
			});
			if (res.ok) {
				const data = await res.json();
				this.isConnected = true;
				this.updateBadge(true, data.tailscale_ip || "En ligne");
				return data;
			}
		} catch (_e) {
			this.isConnected = false;
			this.updateBadge(false, "Hors-ligne");
		}
		return null;
	}

	updateBadge(online, text) {
		if (!this.dom.badge) return;
		this.dom.badge.textContent = text || (online ? "En ligne" : "Hors-ligne");
		this.dom.badge.className = online
			? "badge badge-ok"
			: "badge badge-private";
	}

	connectSSE() {
		if (this.eventSource) {
			try {
				this.eventSource.close();
			} catch (_) {}
			this.eventSource = null;
		}

		const url = this.getBridgeUrl();
		const token = this.getBridgeToken();
		const sseUrl = token
			? `${url}/stream/events?token=${encodeURIComponent(token)}`
			: `${url}/stream/events`;

		try {
			this.eventSource = new EventSource(sseUrl);

			this.eventSource.onopen = () => {
				this.isConnected = true;
				this.updateBadge(true, "SSE Actif ⚡");
			};

			this.eventSource.onmessage = (e) => {
				if (!e.data) return;
				try {
					const event = JSON.parse(e.data);
					this.handleIncomingEvent(event);
				} catch (_err) {
					console.warn("Événement SSE non-JSON:", e.data);
				}
			};

			this.eventSource.onerror = () => {
				this.isConnected = false;
				this.updateBadge(false, "Déconnecté");
				try {
					this.eventSource.close();
				} catch (_) {}
				this.eventSource = null;

				// Tentative de reconnexion après 10s
				if (!this.reconnectTimer) {
					this.reconnectTimer = setTimeout(() => {
						this.reconnectTimer = null;
						this.connectSSE();
					}, 10000);
				}
			};
		} catch (err) {
			console.warn("Connexion SSE impossible:", err);
		}
	}

	handleIncomingEvent(event) {
		console.log("⚡ Événement SSE reçu:", event);

		if (event.type === "approval_request") {
			this.addApproval(event);
			this.notifyUser(
				"Demande d'approbation reçue !",
				event.title || "Commande sensible",
			);
		} else if (event.type === "approval_response") {
			this.removeApproval(event.agent_id);
		} else if (event.type === "mission_launched") {
			this.notifyUser("Mission Antigravity lancée", event.prompt || "");
		} else if (event.type === "config_synced") {
			this.notifyUser(
				"Configurations synchronisées",
				"Le dépôt central a été mis à jour.",
			);
		}
	}

	notifyUser(title, body) {
		if ("Notification" in window && Notification.permission === "granted") {
			try {
				new Notification(title, { body, icon: "favicon.svg" });
			} catch (_) {}
		}
	}

	addApproval(item) {
		const existingIndex = this.pendingApprovals.findIndex(
			(a) => a.agent_id === item.agent_id,
		);
		if (existingIndex >= 0) {
			this.pendingApprovals[existingIndex] = item;
		} else {
			this.pendingApprovals.unshift(item);
		}
		this.renderApprovals();
		this.updateHeaderCounter();
	}

	removeApproval(agentId) {
		this.pendingApprovals = this.pendingApprovals.filter(
			(a) => a.agent_id !== agentId,
		);
		this.renderApprovals();
		this.updateHeaderCounter();
	}

	async respondApproval(agentId, decision, modification = null) {
		const url = this.getBridgeUrl();
		try {
			const res = await fetch(`${url}/approvals/respond`, {
				method: "POST",
				headers: this.getHeaders(),
				body: JSON.stringify({
					agent_id: agentId,
					decision: decision, // "approve" ou "reject"
					modification: modification,
				}),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.detail || `HTTP ${res.status}`);
			}

			this.removeApproval(agentId);
			return true;
		} catch (e) {
			alert(`Erreur lors de l'envoi de la décision : ${e.message}`);
			return false;
		}
	}

	renderApprovals() {
		if (!this.dom.approvalsContainer) {
			this.dom.approvalsContainer = document.getElementById(
				"bridge-approvals-list",
			);
		}
		if (!this.dom.approvalsContainer) return;

		if (this.pendingApprovals.length === 0) {
			this.dom.approvalsContainer.innerHTML = `
				<div class="empty-state" style="padding: 16px; text-align: center; color: var(--text-muted); background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 8px;">
					⚡ Aucune commande d'agent Antigravity en attente d'approbation.
				</div>
			`;
			return;
		}

		this.dom.approvalsContainer.innerHTML = this.pendingApprovals
			.map((item) => {
				const _isCommand = item.action_type !== "diff";
				const codeContent = item.diff_or_command || item.command || "";
				const timeStr = item.timestamp
					? new Date(item.timestamp * 1000).toLocaleTimeString()
					: "";

				return `
				<div class="card" style="border-left: 4px solid var(--accent-indigo); margin-bottom: 12px; background: #0b1220;">
					<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
						<div>
							<span class="badge badge-warning" style="margin-right: 8px;">⚡ Human-In-The-Loop</span>
							<strong style="font-size: 1rem; color: #fff;">${this.escapeHTML(item.title || "Validation Requise")}</strong>
							<span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">${timeStr}</span>
						</div>
						<span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">Agent: ${this.escapeHTML(item.agent_id || "inconnu")}</span>
					</div>

					<p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 10px;">
						${this.escapeHTML(item.description || "L'agent Antigravity demande l'autorisation d'exécuter l'action ci-dessous :")}
					</p>

					<div style="background: #030712; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 12px; max-height: 200px; overflow: auto; font-family: var(--font-mono); font-size: 0.82rem; color: #38bdf8;">
						<code>${this.escapeHTML(codeContent)}</code>
					</div>

					<div style="display: flex; gap: 10px; justify-content: flex-end;">
						<button type="button" class="btn btn-secondary btn-sm" data-action="reject-approval" data-agent-id="${this.escapeHTML(item.agent_id)}" style="background: rgba(239, 68, 68, 0.15); border-color: #ef4444; color: #ef4444;">
							❌ Rejeter
						</button>
						<button type="button" class="btn btn-primary btn-sm" data-action="approve-approval" data-agent-id="${this.escapeHTML(item.agent_id)}" style="background: #22c55e; border-color: #22c55e; color: #000; font-weight: 700;">
							✅ Approuver en 1-Tap
						</button>
					</div>
				</div>
			`;
			})
			.join("");

		// Écouteurs de clics pour Approuver / Rejeter
		this.dom.approvalsContainer
			.querySelectorAll("button[data-action]")
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					const action = btn.getAttribute("data-action");
					const agentId = btn.getAttribute("data-agent-id");
					if (action === "approve-approval") {
						this.respondApproval(agentId, "approve");
					} else if (action === "reject-approval") {
						this.respondApproval(agentId, "reject");
					}
				});
			});
	}

	updateHeaderCounter() {
		const prCountElem = document.getElementById("header-pr-count");
		if (prCountElem && this.app) {
			const total = (this.app.openPrCount || 0) + this.pendingApprovals.length;
			prCountElem.textContent = String(total);
		}
	}

	escapeHTML(str) {
		return String(str || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}
}
