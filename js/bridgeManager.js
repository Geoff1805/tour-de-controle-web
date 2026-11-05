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
		this.batchLastCheckedAt = null;
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

		// Surveillance périodique de la file Batch GitHub et VM
		this.checkBatchStatus();
		this.checkVmJobsStatus();
		this.fetchLiveNotifications();
		setInterval(() => this.checkVmJobsStatus(), 30000);
		setInterval(() => this.checkBatchStatus(), 45000);
		setInterval(() => this.fetchLiveNotifications(), 20000);

		const btnRefreshVm = document.getElementById("btn-refresh-vm-status");
		if (btnRefreshVm) {
			btnRefreshVm.addEventListener("click", () => {
				this.checkVmJobsStatus();
				this.fetchLiveNotifications();
			});
		}
	}

	async checkBatchStatus() {
		if (!this.app.gh?.isAuthenticated()) {
			this.updateBadge(false, "Non connecté");
			return null;
		}

		try {
			const items =
				(await this.app.gh.request(
					"/user/issues?filter=all&labels=batch-mission&state=all&per_page=50",
				)) || [];
			this.pendingBatchMissions = Array.isArray(items) ? items : [];
			this.batchLastCheckedAt = new Date();
			const openCount = this.pendingBatchMissions.filter(
				(item) => item.state === "open",
			).length;

			if (openCount === 0) {
				this.updateBadge(true, "Batch : 0 en attente", "badge-ok");
			} else {
				this.updateBadge(
					true,
					`Batch : ${openCount} en attente`,
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
			this.sendPushNotification(
				"❌ Mission Batch Retirée",
				`Mission #${issueNumber} annulée sur ${owner}/${repo} depuis la Tour de Contrôle.`,
				"x,wastebasket",
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
			this.dom.approvalsContainer.innerHTML = this.renderBatchSummary(
				"Aucune mission batch connue. Le PC interroge GitHub au démarrage et selon le cron.",
			);
			return;
		}

		const openCount = this.pendingBatchMissions.filter(
			(item) => item.state === "open",
		).length;
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
				const isOpen = item.state === "open";
				const statusLabel = isOpen ? "📥 En attente du PC" : "✅ Clôturée";
				const statusClass = isOpen ? "badge-warning" : "badge-ok";
				const updatedDate = item.updated_at
					? new Date(item.updated_at).toLocaleString("fr-FR")
					: dateStr;

				return `
				<div class="card" style="border-left: 4px solid #38bdf8; margin-bottom: 12px; background: #0b1220;">
					<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
						<div>
							<span class="badge ${statusClass}" style="margin-right: 8px;">${statusLabel}</span>
							<strong style="font-size: 1rem; color: #fff;">#${item.number} ${this.escapeHTML(item.title)}</strong>
							<span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">${dateStr}</span>
						</div>
						<span style="font-family: var(--font-mono); font-size: 0.75rem; color: #38bdf8;">${this.escapeHTML(repoName)}</span>
					</div>

					<p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 4px; white-space: pre-line;">
						${this.escapeHTML(cleanBody || "Mission programmée pour le PC Antigravity.")}
					</p>
					<div class="help-text" style="margin-bottom: 10px;">Dernière activité : ${updatedDate}</div>

					<div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center;">
						<a href="${item.html_url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration: none;">
							🔗 Voir sur GitHub
						</a>
						${isOpen ? `<button type="button" class="btn btn-secondary btn-sm" data-action="cancel-batch" data-repo="${this.escapeHTML(repoName)}" data-issue="${item.number}" style="background: rgba(239, 68, 68, 0.15); border-color: #ef4444; color: #ef4444;">❌ Annuler la mission</button>` : ""}
					</div>
				</div>
			`;
			})
			.join("");

		this.dom.approvalsContainer.innerHTML =
			this.renderBatchSummary(
				`${openCount} mission(s) en attente · ${this.pendingBatchMissions.length - openCount} clôturée(s)`,
			) + batchHtml;

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

	renderBatchSummary(message) {
		const checkedAt = this.batchLastCheckedAt
			? this.batchLastCheckedAt.toLocaleTimeString("fr-FR")
			: "jamais";
		return `<div class="panel-card" style="margin-bottom: 12px; padding: 12px 16px; border-left: 4px solid #38bdf8;">
			<strong>Suivi du messaging batch</strong>
			<div class="help-text" style="margin-top: 4px;">${this.escapeHTML(message)} · Dernier scan : ${checkedAt}</div>
		</div>`;
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

	async sendPushNotification(
		title,
		message,
		tags = "bell",
		priority = "default",
	) {
		try {
			await fetch("https://ntfy.sh/geoff_oracle_console_ia_9823", {
				method: "POST",
				headers: {
					Title: title,
					Priority: priority,
					Tags: tags,
				},
				body: message,
			});
		} catch (err) {
			console.warn("Erreur envoi notification ntfy:", err);
		}
	}

	async checkVmJobsStatus() {
		try {
			const token = "OkgjNYuMGwaMrRL-9Hk3D01v3iRy79-dw6TR8xB5lMM";
			const res = await fetch(
				"https://workspacesearch-api.g-6e8.workers.dev/api/jobs/stats",
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!res.ok) return;
			const data = await res.json();
			this.updateVmJobsUI(data);
		} catch (err) {
			console.warn("Erreur actualisation métriques VM jobs:", err);
		}
	}

	updateVmJobsUI(data) {
		const badge = document.getElementById("vm-jobs-status-badge");
		const percentText = document.getElementById("vm-jobs-percent-text");
		const bar = document.getElementById("vm-jobs-progress-bar");
		const doneEl = document.getElementById("vm-jobs-done-count");
		const ignoredEl = document.getElementById("vm-jobs-ignored-count");
		const pendingEl = document.getElementById("vm-jobs-pending-count");
		const totalEl = document.getElementById("vm-jobs-total-count");

		if (!badge || !data?.stats) return;

		const pct = data.progress_percent || 0;
		const isVmActive = data.vm_status === "active";

		badge.textContent = isVmActive ? `VM Active (${pct}%)` : "VM Hors ligne";
		badge.className = isVmActive ? "badge badge-ok" : "badge badge-private";

		if (percentText) percentText.textContent = `${pct}%`;
		if (bar) bar.style.width = `${pct}%`;
		if (doneEl) doneEl.textContent = data.stats.done ?? "--";
		if (ignoredEl) ignoredEl.textContent = data.stats.ignored ?? "--";
		if (pendingEl) pendingEl.textContent = data.stats.pending ?? "--";
		if (totalEl) totalEl.textContent = data.stats.total ?? "--";
	}

	async fetchLiveNotifications() {
		const container = document.getElementById("vm-live-notifications-list");
		if (!container) return;

		try {
			const res = await fetch(
				"https://ntfy.sh/geoff_oracle_console_ia_9823/json?poll=1&since=24h",
			);
			if (!res.ok) return;
			const text = await res.text();
			const lines = text.trim().split("\n");
			const messages = [];

			for (const line of lines) {
				if (!line) continue;
				try {
					const item = JSON.parse(line);
					if (item.event === "message") {
						messages.push(item);
					}
				} catch (_) {}
			}

			if (messages.length === 0) {
				container.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding: 6px 0;">Aucune alerte récente sur le canal (tout est nominal).</div>`;
				return;
			}

			// Trier du plus récent au plus ancien (max 8)
			messages.reverse();
			const recent = messages.slice(0, 8);

			container.innerHTML = recent
				.map((m) => {
					const timeStr = m.time
						? new Date(m.time * 1000).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})
						: "";
					const title = m.title || "Notification";
					const msg = (m.message || "").replace(/\n/g, " • ").substring(0, 140);
					const isError = /erreur|warning|echec|alerte/i.test(
						`${title} ${msg}`,
					);
					const borderCol = isError ? "#ef4444" : "#f59e0b";

					return `
					<div style="background: rgba(0, 0, 0, 0.35); border-left: 3px solid ${borderCol}; padding: 6px 10px; border-radius: 4px; font-size: 0.8rem;">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
							<strong style="color: #fff; font-size: 0.82rem;">${this.escapeHTML(title)}</strong>
							<span style="font-size: 0.72rem; color: var(--text-muted);">${timeStr}</span>
						</div>
						<div style="color: var(--text-secondary); font-size: 0.78rem; line-height: 1.3;">${this.escapeHTML(msg)}</div>
					</div>
				`;
				})
				.join("");
		} catch (err) {
			console.warn("Erreur lecture flux ntfy:", err);
		}
	}
}
