/**
 * Hub Agents IA — Orchestrateur de missions : Jules (Google) → Copilot (GitHub) → PC Bridge (Antigravity)
 * Mêmes règles qu'Antigravity PC : une mission = un prompt + une cible + approbation.
 * 100% Client-Side — Zero-Knowledge : clés en localStorage, jamais en dur.
 */

export class AgentsHub {
	constructor(app) {
		this.app = app;
		this.julesKeyStorage = "tdc_jules_key";
		this.bridgeTokenStorage = "tdc_bridge_token";
		this.julesBase = "https://jules.googleapis.com/v1alpha";
		this.pcOptionValue = "__pc_antigravity__";
	}

	// ---------- Crédentiels ----------

	getJulesKey() {
		return (
			sessionStorage.getItem(this.julesKeyStorage) ||
			localStorage.getItem(this.julesKeyStorage) ||
			""
		);
	}

	setJulesKey(key, remember = true) {
		const clean = (key || "").trim();
		if (clean) {
			if (remember) {
				localStorage.setItem(this.julesKeyStorage, clean);
				sessionStorage.removeItem(this.julesKeyStorage);
			} else {
				sessionStorage.setItem(this.julesKeyStorage, clean);
				localStorage.removeItem(this.julesKeyStorage);
			}
		} else {
			localStorage.removeItem(this.julesKeyStorage);
			sessionStorage.removeItem(this.julesKeyStorage);
		}
	}

	getBridgeToken() {
		return (
			sessionStorage.getItem(this.bridgeTokenStorage) ||
			localStorage.getItem(this.bridgeTokenStorage) ||
			""
		);
	}

	setBridgeToken(token, remember = true) {
		const clean = (token || "").trim();
		if (clean) {
			if (remember) {
				localStorage.setItem(this.bridgeTokenStorage, clean);
				sessionStorage.removeItem(this.bridgeTokenStorage);
			} else {
				sessionStorage.setItem(this.bridgeTokenStorage, clean);
				localStorage.removeItem(this.bridgeTokenStorage);
			}
		} else {
			localStorage.removeItem(this.bridgeTokenStorage);
			sessionStorage.removeItem(this.bridgeTokenStorage);
		}
	}

	getBridgeUrl() {
		return localStorage.getItem("tdc_bridge_url") || "http://localhost:8765";
	}

	bridgeHeaders() {
		const token = this.getBridgeToken();
		return token ? { Authorization: `Bearer ${token}` } : {};
	}

	async ghFetch(path, options = {}) {
		const token = this.app.gh ? this.app.gh.getToken() : "";
		const res = await fetch(`https://api.github.com${path}`, {
			...options,
			headers: {
				Accept: "application/vnd.github.v3+json",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(options.headers || {}),
			},
		});
		if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
		return res.status === 204 ? null : res.json();
	}

	// ---------- Cibles (liste unifiée) ----------

	getGasHubRepo() {
		return this.app.privateCatalog?.gasHubRepo || null;
	}

	refreshTargets() {
		const sel = document.getElementById("agent-target");
		if (!sel) return;
		const repos = this.app.repos || [];
		let html = repos
			.map(
				(r) =>
					'<option value="' +
					r.name +
					'">📦 ' +
					r.name +
					(r.language ? ` (${r.language})` : "") +
					"</option>",
			)
			.join("");
		if (!repos.length)
			html = `<option value="">— Connectez-vous (PAT) —</option>${html}`;
		html += `<option value="${this.pcOptionValue}">🖥️ PC Antigravity (via Bridge — mission approuvée)</option>`;
		sel.innerHTML = html;
		this.updateTargetUI();
	}

	updateTargetUI() {
		const target = document.getElementById("agent-target")?.value || "";
		const isPC = target === this.pcOptionValue;
		const isGasHub = !!target && !isPC && target === this.getGasHubRepo();
		const gasRow = document.getElementById("agent-gas-script-row");
		const submenu = document.getElementById("gas-context-submenu");
		const branchRow = document.getElementById("agent-branch-row");
		const showGas = isGasHub && this.app.claspScripts?.length;
		if (gasRow) gasRow.style.display = showGas ? "" : "none";
		if (submenu) submenu.style.display = showGas ? "" : "none";
		if (showGas && gasRow) {
			const gasSel = document.getElementById("agent-gas-script");
			if (gasSel)
				gasSel.innerHTML = this.app.claspScripts
					.map((s) => `<option value="${s.id}">${s.name}</option>`)
					.join("");
		}
		if (branchRow) branchRow.style.display = isPC ? "none" : "";
	}

	readTask() {
		const target = document.getElementById("agent-target")?.value || "";
		const isPC = target === this.pcOptionValue;
		if (!target)
			throw new Error(
				"Sélectionnez une cible (connectez-vous avec votre PAT si la liste est vide).",
			);
		const title =
			(document.getElementById("agent-task-title")?.value || "").trim() ||
			"Mission IA";
		let desc =
			(document.getElementById("agent-task-desc")?.value || "").trim() || "";
		if (!desc) throw new Error("Décrivez la mise à jour à effectuer.");
		if (!isPC && target === this.getGasHubRepo()) {
			const gasSel = document.getElementById("agent-gas-script");
			const script = gasSel?.selectedOptions?.[0]
				? gasSel.selectedOptions[0].textContent.trim()
				: "";
			if (script)
				desc = `Script Google Apps Script concerné : ${script}.\n\n${desc}`;
		}
		return { target, isPC, title, desc };
	}

	// ---------- Orchestrateur : un seul point d'entrée ----------

	async launchMission() {
		let task;
		try {
			task = this.readTask();
		} catch (e) {
			this.app.showToast(e.message, "error");
			return;
		}

		if (task.isPC) {
			await this.launchBridgeMission(task);
			return;
		}

		const owner = this.app.currentUser ? this.app.currentUser.login : null;
		if (!owner) {
			this.app.showToast("Connectez-vous avec votre PAT GitHub.", "error");
			return;
		}

		if (this.getJulesKey()) {
			this.renderStatus(
				`⏳ Mission « ${task.title} » confiée à Jules (orchestrateur) sur ${task.target}...`,
			);
			const ok = await this.launchJules(task, owner);
			if (ok) return;
			this.renderStatus(
				"⚠️ Jules indisponible — bascule automatique vers Copilot...",
			);
			await this.launchCopilot(task, owner, true);
		} else {
			this.renderStatus(
				`ℹ️ Clé Jules absente — mission confiée à Copilot sur ${task.target}...`,
			);
			await this.launchCopilot(task, owner, false);
		}
	}

	// ---------- Jules (API v1alpha) ----------

	async julesFetch(endpoint, options = {}) {
		const key = this.getJulesKey();
		if (!key)
			throw new Error(
				"Clé API Jules manquante. Configurez-la dans Crédentiels.",
			);
		const res = await fetch(this.julesBase + endpoint, {
			...options,
			headers: {
				"Content-Type": "application/json",
				"X-Goog-Api-Key": key,
				...(options.headers || {}),
			},
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error?.message || `Erreur Jules HTTP ${res.status}`);
		}
		return res.json();
	}

	async testJulesKey(key) {
		const res = await fetch(`${this.julesBase}/sources`, {
			headers: { "X-Goog-Api-Key": key },
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		return (data.sources || []).length;
	}

	async launchJules(task, owner) {
		const branch =
			(document.getElementById("agent-branch")?.value || "").trim() || "main";
		try {
			const session = await this.julesFetch("/sessions", {
				method: "POST",
				body: JSON.stringify({
					prompt: task.desc,
					sourceContext: {
						source: `sources/github/${owner}/${task.target}`,
						githubRepoContext: { startingBranch: branch },
					},
					automationMode: "AUTO_CREATE_PR",
					title: task.title,
				}),
			});
			this.app.showToast(
				`Mission confiée à Jules — PR à venir sur ${task.target}`,
				"success",
			);
			this.renderStatus(
				"✅ Mission « " +
					task.title +
					" » lancée sur " +
					task.target +
					" (branche " +
					branch +
					"). Jules code, teste et ouvre une Pull Request à valider. Suivi : jules.google ou bouton 🔄.",
				session.name || "",
			);
			return true;
		} catch (err) {
			this.renderStatus(`❌ Jules : ${err.message}`);
			return false;
		}
	}

	// ---------- Copilot (Issue → PR, exécutant de secours ou par défaut) ----------

	async launchCopilot(task, owner, isFallback) {
		try {
			const issue = await this.app.gh.createIssue(
				owner,
				task.target,
				task.title,
				task.desc,
				["copilot"],
			);
			const issueUrl =
				issue.html_url ||
				`https://github.com/${owner}/${task.target}/issues/${issue.number}`;
			try {
				await this.ghFetch(
					`/repos/${owner}/${task.target}/issues/${issue.number}`,
					{
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ assignees: ["copilot"] }),
					},
				);
				this.app.showToast(
					isFallback
						? `Copilot a pris le relais — issue #${issue.number}`
						: "Mission assignée à Copilot",
					"success",
				);
				this.renderStatus(
					(isFallback ? "🔀 Jules indisponible → Copilot. " : "") +
						"✅ Issue #" +
						issue.number +
						" créée et assignée à @copilot sur " +
						task.target +
						". Copilot ouvrira une Pull Request à valider : " +
						issueUrl,
				);
			} catch (assignErr) {
				this.renderStatus(
					"✅ Issue #" +
						issue.number +
						" créée sur " +
						task.target +
						" — assignez @copilot manuellement (" +
						assignErr.message +
						") : " +
						issueUrl,
				);
			}
			return true;
		} catch (err) {
			this.renderStatus(`❌ Copilot : ${err.message}`);
			this.app.showToast(`Échec Copilot : ${err.message}`, "error");
			return false;
		}
	}

	// ---------- PC Bridge (Antigravity) ----------

	async launchBridgeMission(task) {
		const bridgeUrl = this.getBridgeUrl();
		this.renderStatus(
			`⏳ Mission « ${task.title} » envoyée au PC Antigravity (${bridgeUrl})...`,
		);
		try {
			const res = await fetch(`${bridgeUrl}/missions/launch`, {
				method: "POST",
				mode: "cors",
				headers: {
					"Content-Type": "application/json",
					...this.bridgeHeaders(),
				},
				body: JSON.stringify({
					prompt: `[${task.title}] ${task.desc}`,
					require_approval: true,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			this.app.showToast("Mission transmise à Antigravity !", "success");
			this.renderStatus(
				"✅ Mission « " +
					task.title +
					" » reçue par le PC (statut : " +
					(data.status || "queued") +
					"). L'agent Antigravity exécutera la tâche avec approbation requise, comme depuis l'IDE.",
			);
		} catch (err) {
			this.app.showToast(`Bridge inaccessible : ${err.message}`, "error");
			this.renderStatus(
				"❌ Bridge : " +
					err.message +
					" — vérifiez l'URL et le token dans Crédentiels, et que le serveur FastAPI tourne sur le PC.",
			);
		}
	}

	// ---------- Suivi : sessions Jules + PRs ouvertes ----------

	async refreshTasks() {
		const owner = this.app.currentUser ? this.app.currentUser.login : null;
		let html = "";

		if (this.getJulesKey()) {
			try {
				const data = await this.julesFetch("/sessions?pageSize=6");
				html +=
					'<div style="font-weight: 800; margin-bottom: 8px;">🚀 Sessions Jules</div>';
				const sessions = data.sessions || [];
				if (!sessions.length)
					html += '<p class="help-text">Aucune session Jules en cours.</p>';
				for (const s of sessions) {
					const pr =
						(s.outputs || [])
							.map((o) => o.pullRequest?.url)
							.filter(Boolean)[0] || null;
					html +=
						'<div class="project-card" style="margin-bottom: 8px;"><div>' +
						'<div class="project-card-header"><span class="project-name">' +
						(s.title || s.name || "Session") +
						"</span>" +
						'<span class="badge ' +
						(pr ? "badge-ok" : "badge-warn") +
						'">' +
						(pr ? "PR prête" : "En cours") +
						"</span></div>" +
						'<div class="project-meta" style="margin-top: 6px;">' +
						(pr
							? `<a href="${pr}" target="_blank" rel="noopener">Voir la Pull Request</a>`
							: "Traitement asynchrone en cours...") +
						"</div></div></div>";
				}
			} catch (e) {
				html += `<p class="help-text">⚠️ Jules indisponible : ${e.message}</p>`;
			}
		}

		if (owner && this.app.gh.isAuthenticated()) {
			html +=
				'<div style="font-weight: 800; margin: 12px 0 8px;">🐙 Pull Requests ouvertes</div>';
			const repos = (this.app.repos || []).slice(0, 6);
			const results = await Promise.allSettled(
				repos.map((r) =>
					this.ghFetch(`/repos/${owner}/${r.name}/pulls?state=open&per_page=5`),
				),
			);
			let prCount = 0;
			for (const res of results) {
				if (res.status !== "fulfilled" || !Array.isArray(res.value)) continue;
				for (const pr of res.value) {
					prCount++;
					html +=
						'<div class="project-card" style="margin-bottom: 8px;"><div>' +
						'<div class="project-card-header"><span class="project-name">' +
						pr.title +
						"</span>" +
						'<span class="badge badge-public">' +
						(pr.head?.repo ? pr.head.repo.name : "dépôt") +
						"</span></div>" +
						'<div class="project-meta" style="margin-top: 6px;">' +
						'<a href="' +
						pr.html_url +
						'" target="_blank" rel="noopener">Réviser / Fusionner</a>' +
						"</div></div></div>";
				}
			}
			if (!prCount)
				html +=
					'<p class="help-text">Aucune PR ouverte sur vos dépôts récents.</p>';
		}

		if (!html) {
			html =
				"🔒 Connectez-vous (PAT) et/ou configurez une clé Jules pour suivre les tâches des agents.";
		}
		const box = document.getElementById("agents-status");
		if (box) box.innerHTML = html;
	}

	renderStatus(text, extra = "") {
		const box = document.getElementById("agents-status");
		if (box) {
			box.innerHTML =
				'<p style="margin: 0 0 6px;">' +
				text +
				"</p>" +
				(extra ? `<p class="help-text">Session : ${extra}</p>` : "");
		}
	}
}
