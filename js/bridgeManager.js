/**
 * Gestionnaire Batch Queue Antigravity & Passerelle Zero-Tunnel
 * Mode Batch Asynchrone via GitHub Issues (label: batch-mission)
 * Plus aucun tunnel, VPN ou port ouvert requis !
 */

export class BridgeManager {
	constructor(appRef) {
		this.app = appRef;
		this.pendingBatchMissions = [];
		this.pendingApprovals = [];
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

		// Surveillance périodique de la file Batch GitHub (toutes les 45s)
		this.checkBatchStatus();
		setInterval(() => this.checkBatchStatus(), 45000);
	}

	async checkBatchStatus() {
		if (!this.app.gh?.isAuthenticated()) {
			this.updateBadge(false, "Non connecté");
			return null;
		}

		try {
			const items =
				(await this.app.gh.request(
					"/user/issues?filter=all&labels=batch-mission&state=open&per_page=50",
				)) || [];
			this.pendingBatchMissions = Array.isArray(items) ? items : [];

			if (items.length === 0) {
				this.updateBadge(true, "Batch : 0 en attente", "badge-ok");
			} else {
				this.updateBadge(
					true,
					`Batch : ${items.length} en attente`,
					"badge-warning",
				);
			}

			this.renderApprovals();
			this.updateHeaderCounter();
			return items;
		} catch (err) {
			console.warn("Erreur interrogation file Batch GitHub:", err);
			this.updateBadge(false, "Batch : erreur API", "badge-private");
			return null;
		}
	}

	updateBadge(online, text, className) {
		if (!this.dom.badge) return;
		this.dom.badge.textContent = text || "Batch actif";
		this.dom.badge.className =
			className || (online ? "badge badge-ok" : "badge badge-private");
	}

	async cancelBatchMission(repoFullName, issueNumber) {
		const [owner, repo] = (repoFullName || "").split("/");
		if (!owner || !repo) return;
		if (
			!confirm(
				`Voulez-vous annuler et retirer la mission #${issueNumber} de la file Batch ?`,
			)
		)
			return;

		try {
			await this.app.gh.closeIssue(
				owner,
				repo,
				issueNumber,
				"Annulé depuis la Tour de Contrôle Web.",
			);
			this.app.showToast(
				`Mission #${issueNumber} annulée et retirée de la file.`,
				"success",
			);
			await this.checkBatchStatus();
		} catch (err) {
			this.app.showToast(`Erreur annulation : ${err.message}`, "error");
		}
	}

	renderApprovals() {
		if (!this.dom.approvalsContainer) {
			this.dom.approvalsContainer = document.getElementById(
				"bridge-approvals-list",
			);
		}
		if (!this.dom.approvalsContainer) return;

		if (
			this.pendingBatchMissions.length === 0 &&
			this.pendingApprovals.length === 0
		) {
			this.dom.approvalsContainer.innerHTML = `
				<div class="empty-state" style="padding: 16px; text-align: center; color: var(--text-muted); background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 8px;">
					✨ Aucune mission batch en attente d'exécution. Le PC dépile automatiquement au démarrage de session.
				</div>
			`;
			return;
		}

		const batchHtml = this.pendingBatchMissions
			.map((item) => {
				const repoName = item.repository_url
					? item.repository_url.replace("https://api.github.com/repos/", "")
					: "";
				const dateStr = item.created_at
					? new Date(item.created_at).toLocaleString()
					: "";
				const cleanBody = (item.body || "")
					.replace(/###.*/g, "")
					.trim()
					.substring(0, 180);

				return `
				<div class="card" style="border-left: 4px solid #38bdf8; margin-bottom: 12px; background: #0b1220;">
					<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
						<div>
							<span class="badge badge-warning" style="margin-right: 8px;">📥 En attente Batch PC</span>
							<strong style="font-size: 1rem; color: #fff;">#${item.number} ${this.escapeHTML(item.title)}</strong>
							<span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">${dateStr}</span>
						</div>
						<span style="font-family: var(--font-mono); font-size: 0.75rem; color: #38bdf8;">${this.escapeHTML(repoName)}</span>
					</div>

					<p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 10px; white-space: pre-line;">
						${this.escapeHTML(cleanBody || "Mission programmée pour le PC Antigravity.")}
					</p>

					<div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center;">
						<a href="${item.html_url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration: none;">
							🔗 Voir sur GitHub
						</a>
						<button type="button" class="btn btn-secondary btn-sm" data-action="cancel-batch" data-repo="${this.escapeHTML(repoName)}" data-issue="${item.number}" style="background: rgba(239, 68, 68, 0.15); border-color: #ef4444; color: #ef4444;">
							❌ Annuler la mission
						</button>
					</div>
				</div>
			`;
			})
			.join("");

		this.dom.approvalsContainer.innerHTML = batchHtml;

		// Écouteurs de clics pour Annuler
		this.dom.approvalsContainer
			.querySelectorAll('button[data-action="cancel-batch"]')
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					const repo = btn.getAttribute("data-repo");
					const issue = btn.getAttribute("data-issue");
					this.cancelBatchMission(repo, issue);
				});
			});
	}

	updateHeaderCounter() {
		const prCountElem = document.getElementById("header-pr-count");
		if (prCountElem && this.app) {
			const total =
				(this.app.openPrCount || 0) + this.pendingBatchMissions.length;
			prCountElem.textContent = String(total);
		}
	}

	escapeHTML(str) {
		return String(str || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}
}
