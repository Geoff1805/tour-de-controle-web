import { AiClient } from "./aiClient.js";
import { GasClient } from "./gasClient.js";
import { GasManager } from "./gasManager.js";
import { GitHubClient } from "./githubClient.js";
import { renderMarkdown } from "./markdown.js";
import { AgentsHub } from "./agentsHub.js";

class TourDeControleApp {
	constructor() {
		this.gh = new GitHubClient();
		this.ai = new AiClient();
		this.gas = new GasManager();
		this.gasClient = new GasClient();
		this.agentsHub = new AgentsHub(this);
		this.privateCatalog = null;
		this.currentUser = null;
		this.repos = [];
		this.docsList = [];
		this.activeDocPath = "rules/global.md";
		this.activeDocSha = null;
		this.isEditMode = false;

		// Scripts Google Workspace : chargés dynamiquement depuis le dépôt privé
		// après connexion (PAT). Aucune donnée en dur dans ce dépôt public.
		this.claspScripts = [];

		this.init();
	}

	async init() {
		this.importFromUrl();
		this.bindEvents();
		this.updateAuthPill();
		this.renderWorkspaceScripts();
		this.agentsHub.refreshTargets();

		window.addEventListener("hashchange", () => {
			if (this.importFromUrl()) {
				if (this.gh.isAuthenticated()) {
					this.loadAuthenticatedSession();
				}
			}
		});

		if (this.gh.isAuthenticated()) {
			await this.loadAuthenticatedSession();
		} else {
			this.repos = this.getDefaultCatalog();
			this.renderReposGrid("all");
			this.populateMissionProjects();
			this.updateKpiCounters();
			this.renderDocsFallback();
		}
	}

	importFromUrl() {
		try {
			const hash = window.location.hash.startsWith("#")
				? window.location.hash.slice(1)
				: "";
			const params = new URLSearchParams(hash || window.location.search);

			const gh =
				params.get("gh") || params.get("token") || params.get("gh_token");
			const gemini =
				params.get("gemini") || params.get("key") || params.get("gemini_key");
			const mistral = params.get("mistral") || params.get("mistral_key");
			const groq = params.get("groq") || params.get("groq_key");
			const gas = params.get("gas") || params.get("gas_token");
			const bridge = params.get("bridge") || params.get("bridge_url");
			const jules = params.get("jules") || params.get("jules_key");
			const bridgeToken = params.get("bridge_token");

			let imported = false;
			const remember =
				localStorage.getItem("tdc_remember_tokens") !== "false";
			if (gh) {
				this.gh.setToken(gh.trim(), remember);
				imported = true;
			}
			if (gemini) {
				this.ai.setGeminiKey(gemini.trim(), remember);
				imported = true;
			}
			if (mistral) {
				this.ai.setMistralKey(mistral.trim(), remember);
				imported = true;
			}
			if (groq) {
				this.ai.setGroqKey(groq.trim(), remember);
				imported = true;
			}
			if (gas) {
				this.gas.setManualToken(gas.trim(), remember);
				imported = true;
			}
			if (bridge) {
				localStorage.setItem("tdc_bridge_url", bridge.trim());
			}
			if (jules) {
				this.agentsHub.setJulesKey(jules.trim(), remember);
				imported = true;
			}
			if (bridgeToken) {
				this.agentsHub.setBridgeToken(bridgeToken.trim(), remember);
				imported = true;
			}

			if (imported) {
				window.history.replaceState(null, "", window.location.pathname);
				this.closeSettings();
				this.showToast(
					"Accès configurés automatiquement avec succès !",
					"success",
				);
				return true;
			}
		} catch (e) {
			console.warn("Erreur import URL:", e);
		}
		return false;
	}

	showToast(message, type = "success") {
		const container = document.getElementById("toast-container");
		const toast = document.createElement("div");
		toast.className = `toast ${type}`;
		toast.textContent = message;
		container.appendChild(toast);
		setTimeout(() => {
			toast.style.opacity = "0";
			toast.style.transition = "opacity 0.3s ease";
			setTimeout(() => toast.remove(), 300);
		}, 4000);
	}

	bindEvents() {
		document.querySelectorAll(".nav-tab").forEach((btn) => {
			btn.addEventListener("click", () => {
				const tabId = btn.getAttribute("data-tab");
				this.switchTab(tabId);
			});
		});

		// Filtres Dashboard
		document
			.getElementById("project-search")
			?.addEventListener("input", (e) => {
				this.filterDashboard(e.target.value);
			});

		document
			.querySelectorAll("#project-category-filters .chip")
			.forEach((chip) => {
				chip.addEventListener("click", () => {
					for (const c of document.querySelectorAll(
						"#project-category-filters .chip",
					)) {
						c.classList.remove("active");
					}
					chip.classList.add("active");
					const cat = chip.getAttribute("data-cat");
					this.renderReposGrid(
						cat,
						document.getElementById("project-search")?.value,
					);
				});
			});

		// Boutons Header
		document
			.getElementById("btn-refresh-all")
			?.addEventListener("click", () => {
				if (this.gh.isAuthenticated()) {
					this.loadAuthenticatedSession(true);
					this.showToast("Actualisation en direct depuis GitHub...", "success");
				} else {
					this.openSettings();
				}
			});

		document
			.getElementById("btn-open-settings")
			?.addEventListener("click", () => this.openSettings());
		document
			.getElementById("btn-close-settings")
			?.addEventListener("click", () => this.closeSettings());
		document
			.getElementById("btn-cancel-settings")
			?.addEventListener("click", () => this.closeSettings());
		document
			.getElementById("btn-save-settings")
			?.addEventListener("click", () => this.saveSettingsFromModal());

		// Fermeture du modal sur clic arrière-plan ou touche Échap
		const modalOverlay = document.getElementById("modal-settings");
		modalOverlay?.addEventListener("click", (e) => {
			if (e.target === modalOverlay) this.closeSettings();
		});
		window.addEventListener("keydown", (e) => {
			if (e.key === "Escape") this.closeSettings();
		});

		// Notice catalogue
		document
			.getElementById("btn-open-settings-notice")
			?.addEventListener("click", () => this.openSettings());

		// Lien discret vers l'onglet Règles & Docs (masqué de la navigation)
		document
			.getElementById("link-docs-discrete")
			?.addEventListener("click", (e) => {
				e.preventDefault();
				this.switchTab("docs");
			});

		// Modal - Boutons de test
		document
			.getElementById("btn-test-gh-modal")
			?.addEventListener("click", () =>
				this.testGitHub(
					document.getElementById("input-gh-token")?.value,
					"modal-gh-status",
				),
			);
		document
			.getElementById("btn-test-mistral-modal")
			?.addEventListener("click", () =>
				this.testMistral(
					document.getElementById("input-mistral-key")?.value,
					"modal-mistral-status",
				),
			);
		document
			.getElementById("btn-test-groq-modal")
			?.addEventListener("click", () =>
				this.testGroq(
					document.getElementById("input-groq-key")?.value,
					"modal-groq-status",
				),
			);
		document
			.getElementById("btn-test-gemini-modal")
			?.addEventListener("click", () =>
				this.testGemini(
					document.getElementById("input-gemini-key")?.value,
					"modal-gemini-status",
				),
			);
		document
			.getElementById("btn-login-google-modal")
			?.addEventListener("click", () => this.loginGoogle("modal-gas-status"));

		// Pipeline Autonome Apps Script (Dev ➔ Test ➔ Déploiement)
		document
			.getElementById("btn-run-gas-pipeline")
			?.addEventListener("click", () => this.runGasPipeline());

		// Sous-menu Apps Script : ouvrir le script sélectionné dans Interdevappscript
		document
			.getElementById("btn-open-gas-studio")
			?.addEventListener("click", () => {
				const scriptId =
					document.getElementById("agent-gas-script")?.value || "";
				if (!scriptId) {
					this.showToast(
						"Sélectionnez d'abord un script Apps Script.",
						"error",
					);
					return;
				}
				window.open(
					"https://geoff1805.github.io/Interdevappscript/?scriptId=" +
						encodeURIComponent(scriptId),
					"_blank",
					"noopener",
				);
			});

		// Modal - Import JSON & Lien Magique
		document
			.getElementById("btn-import-config-file")
			?.addEventListener("click", () => {
				document.getElementById("input-import-config-file")?.click();
			});
		document
			.getElementById("input-import-config-file")
			?.addEventListener("change", (e) => this.handleConfigFileSelected(e));
		document
			.getElementById("btn-copy-magic-link")
			?.addEventListener("click", () => this.copyMagicLink());

		// Docs Viewer & Editor
		document
			.getElementById("btn-toggle-edit-doc")
			?.addEventListener("click", () => this.toggleDocEdit());
		document
			.getElementById("btn-save-doc-github")
			?.addEventListener("click", () => this.saveActiveDocToGitHub());
		document
			.getElementById("btn-copy-doc")
			?.addEventListener("click", () => this.copyActiveDoc());

		// Raccourci clavier Ctrl+S
		window.addEventListener("keydown", (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s") {
				const docsTab = document.getElementById("tab-docs");
				if (!docsTab.classList.contains("hidden") && this.isEditMode) {
					e.preventDefault();
					this.saveActiveDocToGitHub();
				}
			}
		});

		// Missions & Prompts
		document
			.getElementById("btn-generate-prompt")
			?.addEventListener("click", () => this.generateTransitionPrompt());
		document
			.getElementById("btn-copy-prompt")
			?.addEventListener("click", () => this.copyPromptOutput());
		document
			.getElementById("btn-dispatch-issue")
			?.addEventListener("click", () => this.dispatchAutonomousIssue());

		// Copilote IA
		document
			.getElementById("btn-ask-gemini")
			?.addEventListener("click", () => this.askGemini());

		// PC Bridge
		document
			.getElementById("btn-ping-bridge")
			?.addEventListener("click", () => this.pingBridge());
		document
			.getElementById("btn-sync-bridge")
			?.addEventListener("click", () => this.triggerBridgeSync());

		// Hub Agents IA (Orchestrateur : Jules → Copilot → PC Bridge)
		document
			.getElementById("agent-target")
			?.addEventListener("change", () => this.agentsHub.updateTargetUI());
		document
			.getElementById("btn-launch-mission")
			?.addEventListener("click", () => this.agentsHub.launchMission());
		document
			.getElementById("btn-agents-refresh")
			?.addEventListener("click", () => this.agentsHub.refreshTasks());
		document
			.getElementById("btn-test-jules-modal")
			?.addEventListener("click", async () => {
				const key = document.getElementById("input-jules-key")?.value?.trim();
				const el = document.getElementById("modal-jules-status");
				if (!key) {
					if (el) {
						el.className = "badge badge-err";
						el.textContent = "❌ Clé manquante";
					}
					return;
				}
				if (el) {
					el.className = "badge badge-warn";
					el.textContent = "⏳ Test API...";
				}
				try {
					const sources = await this.agentsHub.testJulesKey(key);
					if (el) {
						el.className = "badge badge-ok";
						el.textContent = "✅ Jules validé (" + sources + " sources)";
					}
					this.agentsHub.setJulesKey(
						key,
						document.getElementById("input-remember-tokens")?.checked ?? true,
					);
					this.showToast("Clé Jules validée et enregistrée !", "success");
				} catch (err) {
					if (el) {
						el.className = "badge badge-err";
						el.textContent = "❌ Clé invalide";
					}
					this.showToast("Échec test Jules : " + err.message, "error");
				}
			});
	}

	switchTab(tabId) {
		document.querySelectorAll(".nav-tab").forEach((b) => {
			b.classList.toggle("active", b.getAttribute("data-tab") === tabId);
			b.setAttribute("aria-selected", b.getAttribute("data-tab") === tabId);
		});
		document.querySelectorAll(".tab-panel").forEach((p) => {
			p.classList.toggle("hidden", p.id !== `tab-${tabId}`);
		});
	}

	updateAuthPill() {
		const pill = document.getElementById("gh-status-pill");
		const text = document.getElementById("gh-status-text");
		const notice = document.getElementById("guest-notice");
		if (this.gh.isAuthenticated()) {
			pill?.classList.add("connected");
			if (text)
				text.textContent = this.currentUser
					? `@${this.currentUser.login}`
					: "Connecté GitHub";
			notice?.classList.add("hidden");
		} else {
			pill?.classList.remove("connected");
			if (text) text.textContent = "Mode Découverte";
			notice?.classList.remove("hidden");
		}
	}

	getDefaultCatalog() {
		// Catalogue invité neutre : seuls les dépôts publics sont listés ici.
		// Le catalogue complet (dépôts privés + scripts Apps Script) est chargé
		// depuis le dépôt privé "tour-de-controle" après connexion (PAT).
		return [
			{
				name: "tour-de-controle-web",
				description: "Console Web Client-Side Zero-Knowledge hébergée sur GitHub Pages.",
				language: "JavaScript",
				private: false,
				html_url: "https://github.com/Geoff1805/tour-de-controle-web",
				default_branch: "main",
			},
			{
				name: "Interdevappscript",
				description: "Studio Web Client-Side pour l'édition et le test de scripts Google Apps Script via OAuth2 GIS.",
				language: "JavaScript",
				private: false,
				html_url: "https://github.com/Geoff1805/Interdevappscript",
				default_branch: "main",
			},
			{
				name: "GitCMSstudio",
				description: "Studio CMS Markdown autonome pour la gestion de contenu web et documentation.",
				language: "JavaScript",
				private: false,
				html_url: "https://github.com/Geoff1805/GitCMSstudio",
				default_branch: "main",
			},
		];
	}

	async loadPrivateCatalog() {
		const owner = this.currentUser?.login;
		if (!owner) return;

		try {
			const { content } = await this.gh.getFile(
				owner,
				"tour-de-controle",
				"config/workspace_catalog.json",
			);
			const data = JSON.parse(content);
			this.privateCatalog = data;
			if (Array.isArray(data.claspScripts)) {
				this.claspScripts = data.claspScripts;
				this.renderWorkspaceScripts();
				this.agentsHub.refreshTargets();
			}
			return data;
		} catch (e) {
			console.warn("Catalogue privé non disponible :", e);
			return null;
		}
	}

	renderDocsFallback() {
		this.docsList = [
			{ path: "rules/global.md", label: "📜 Règles globales" },
		];
		const nav = document.getElementById("docs-nav-list");
		if (nav) {
			nav.innerHTML = this.docsList
				.map(
					(d) => `
				<li>
					<button type="button" class="doc-nav-item active" style="width: 100%; text-align: left;">
						${d.label}
					</button>
				</li>
			`,
				)
				.join("");
		}
		const viewer = document.getElementById("doc-viewer-container");
		if (viewer) {
			viewer.innerHTML = renderMarkdown(
				"# Règles Globales d'Architecture Antigravity\n\n> Pour synchroniser vos règles privées en direct depuis `tour-de-controle`, configurez votre token GitHub dans les **Crédentiels**.",
			);
		}
	}

	async testGitHub(token, statusElementId) {
		const el = document.getElementById(statusElementId);
		const clean = (token || "").trim();
		if (!clean) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Token manquant";
			}
			return;
		}

		if (el) {
			el.className = "badge badge-warn";
			el.textContent = "⏳ Vérification...";
		}

		try {
			const res = await fetch("https://api.github.com/user", {
				headers: {
					Authorization: `Bearer ${clean}`,
					Accept: "application/vnd.github.v3+json",
				},
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const user = await res.json();
			if (el) {
				el.className = "badge badge-ok";
				el.textContent = `✅ @${user.login} valide`;
			}
			this.gh.setToken(clean);
			this.showToast(
				`Connexion GitHub réussie pour @${user.login} !`,
				"success",
			);
		} catch (err) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Token invalide";
			}
			this.showToast(`Échec du test GitHub : ${err.message}`, "error");
		}
	}

	async testGemini(key, statusElementId) {
		const el = document.getElementById(statusElementId);
		const clean = (key || "").trim();
		if (!clean) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Clé manquante";
			}
			return;
		}

		if (el) {
			el.className = "badge badge-warn";
			el.textContent = "⏳ Test API...";
		}

		try {
			const res = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models?key=${clean}`,
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			if (el) {
				el.className = "badge badge-ok";
				el.textContent = "✅ Clé Gemini valide";
			}
			this.ai.setApiKey(clean);
			this.showToast(
				"Clé Google AI Studio validée et enregistrée !",
				"success",
			);
		} catch (err) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Clé invalide";
			}
			this.showToast(`Échec test Gemini : ${err.message}`, "error");
		}
	}

	loginGoogle(statusElementId) {
		const el = document.getElementById(statusElementId);
		try {
			this.gas.login(
				(_token) => {
					if (el) {
						el.className = "badge badge-ok";
						el.textContent = `✅ Connecté (${this.gas.getUserEmail() || "Google"})`;
					}
					this.showToast(
						"Connecté à Google Apps Script (Permanent) !",
						"success",
					);
					setTimeout(() => this.closeSettings(), 1200);
				},
				(err) => {
					if (el) {
						el.className = "badge badge-err";
						el.textContent = "❌ Erreur Google";
					}
					this.showToast(`Erreur Google GIS : ${err}`, "error");
				},
			);
		} catch (e) {
			this.showToast(e.message, "error");
		}
	}

	async loadAuthenticatedSession(_force = false) {
		this.closeSettings();
		this.switchTab("dashboard");

		try {
			this.currentUser = await this.gh.getCurrentUser();
			this.updateAuthPill();

			// Charger tous les dépôts de l'utilisateur
			this.repos = await this.gh.listUserRepos();
			this.renderReposGrid("all");
			this.populateMissionProjects();
			this.updateKpiCounters();

			// Charger le catalogue privé (scripts Apps Script, etc.)
			this.loadPrivateCatalog();
			this.agentsHub.refreshTargets();

			// Charger la documentation de manière isolée
			this.loadPrivateDocsList()
				.then(() => this.loadActiveDoc())
				.catch((e) => console.warn("Docs privés non disponibles:", e));

			// Enrichir avec CI et Releases en tâche de fond
			this.enrichReposMetadata();
		} catch (err) {
			console.error("Erreur de session GitHub :", err);
			this.showToast(`Mode hors-ligne : ${err.message}`, "info");
			this.repos = this.getDefaultCatalog();
			this.renderReposGrid("all");
			this.updateKpiCounters();
			this.renderDocsFallback();
		}
	}

	updateKpiCounters() {
		const count = this.repos.length;
		const privCount = this.repos.filter((r) => r.private).length;

		const kpiProjects = document.getElementById("kpi-projects");
		const kpiPrivate = document.getElementById("kpi-private-count");
		const headerRepoCount = document.getElementById("header-repo-count");
		const catAll = document.getElementById("cat-count-all");

		if (kpiProjects) kpiProjects.textContent = count;
		if (kpiPrivate) kpiPrivate.textContent = privCount;
		if (headerRepoCount) headerRepoCount.textContent = count;
		if (catAll) catAll.textContent = count;

		// Compteurs par catégorie
		let mob = 0;
		let web = 0;
		let inf = 0;
		for (const r of this.repos) {
			const c = this.categorizeRepo(r);
			if (c === "mobile") mob++;
			else if (c === "web") web++;
			else inf++;
		}
		const catMob = document.getElementById("cat-count-mobile");
		const catWeb = document.getElementById("cat-count-web");
		const catInf = document.getElementById("cat-count-infra");
		if (catMob) catMob.textContent = mob;
		if (catWeb) catWeb.textContent = web;
		if (catInf) catInf.textContent = inf;
	}

	categorizeRepo(repo) {
		const lang = (repo.language || "").toLowerCase();
		const name = repo.name.toLowerCase();
		const desc = (repo.description || "").toLowerCase();

		if (
			lang === "kotlin" ||
			lang === "dart" ||
			desc.includes("android") ||
			desc.includes("kmp") ||
			name.includes("apk") ||
			name.includes("mobile")
		) {
			return "mobile";
		}
		if (
			lang === "typescript" ||
			lang === "javascript" ||
			lang === "html" ||
			desc.includes("web") ||
			desc.includes("pages") ||
			desc.includes("cms")
		) {
			return "web";
		}
		return "infra";
	}

	renderReposGrid(category = "all", searchQuery = "") {
		const grid = document.getElementById("projects-grid");
		if (!grid) return;

		let list = this.repos;
		if (category !== "all") {
			list = list.filter((r) => this.categorizeRepo(r) === category);
		}
		if (searchQuery) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter(
				(r) =>
					r.name.toLowerCase().includes(q) ||
					(r.description || "").toLowerCase().includes(q) ||
					(r.language || "").toLowerCase().includes(q),
			);
		}

		if (list.length === 0) {
			grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">Aucun dépôt trouvé.</div>`;
			return;
		}

		grid.innerHTML = list
			.map((r) => {
				const cat = this.categorizeRepo(r);
				const isPriv = r.private;
				return `
        <div class="project-card" id="card-${r.name}">
          <div>
            <div class="project-card-header">
              <span class="project-name">${r.name}</span>
              <span class="badge ${isPriv ? "badge-private" : "badge-public"}">
                ${isPriv ? "🔒 Privé" : "🌐 Public"}
              </span>
            </div>
            <div class="project-type">${r.language || "Code"} • ${cat.toUpperCase()}</div>
            <p class="project-desc" style="margin-top: 8px;">${r.description || "Aucune description renseignée."}</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div class="project-meta">
              <span id="ci-badge-${r.name}">CI/CD : <em>Actif</em></span>
              <span id="release-badge-${r.name}"></span>
            </div>

            <div class="project-actions">
              ${r.homepage ? `<a href="${r.homepage}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">🚀 Ouvrir App</a>` : ""}
              <button class="btn btn-secondary btn-sm" onclick="window.app.quickDispatchCI('${r.name}')" title="Déclencher workflow CI">⚡ Run CI</button>
              <a href="${r.html_url}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">GitHub ↗</a>
            </div>
          </div>
        </div>
      `;
			})
			.join("");
	}

	filterDashboard(query) {
		const activeChip = document.querySelector(
			"#project-category-filters .chip.active",
		);
		const cat = activeChip ? activeChip.getAttribute("data-cat") : "all";
		this.renderReposGrid(cat, query);
	}

	async enrichReposMetadata() {
		const owner = this.currentUser?.login;
		if (!owner) return;

		for (const r of this.repos) {
			const ciEl = document.getElementById(`ci-badge-${r.name}`);
			if (ciEl) {
				try {
					const run = await this.gh.getLatestWorkflowRun(owner, r.name);
					if (run) {
						const isSuccess = run.conclusion === "success";
						const isRunning =
							run.status === "in_progress" || run.status === "queued";
						const badgeClass = isSuccess
							? "badge-ok"
							: isRunning
								? "badge-warn"
								: "badge-err";
						const icon = isSuccess
							? "✅ Pass"
							: isRunning
								? "🔄 Run"
								: "❌ Fail";
						ciEl.innerHTML = `<span class="badge ${badgeClass}">${icon}</span>`;
					}
				} catch (_) {}
			}

			const relEl = document.getElementById(`release-badge-${r.name}`);
			if (relEl) {
				try {
					const rel = await this.gh.getLatestRelease(owner, r.name);
					if (rel?.assets) {
						const apkAsset = rel.assets.find((a) => a.name.endsWith(".apk"));
						if (apkAsset) {
							relEl.innerHTML = `<a href="${apkAsset.browser_download_url}" class="badge badge-ok" style="text-decoration:none;" title="Télécharger l'APK directement">📥 ${apkAsset.name}</a>`;
						}
					}
				} catch (_) {}
			}
		}
	}

	async quickDispatchCI(repoName) {
		const owner = this.currentUser?.login;
		if (!owner) return;

		try {
			this.showToast(`Lancement CI sur ${repoName}...`, "success");
			await this.gh.triggerWorkflow(owner, repoName, "ci.yml");
			this.showToast(`Workflow lancé avec succès sur ${repoName} !`, "success");
			setTimeout(() => this.enrichReposMetadata(), 3000);
		} catch (err) {
			this.showToast(`Erreur déclenchement CI : ${err.message}`, "error");
		}
	}

	// --- Documentation & Règles ---
	async loadPrivateDocsList() {
		const owner = this.currentUser?.login;
		if (!owner) return;

		this.docsList = [{ path: "rules/global.md", label: "📜 rules/global.md" }];

		try {
			const docs = await this.gh.getFolderContents(
				owner,
				"tour-de-controle",
				"docs",
			);
			if (Array.isArray(docs)) {
				for (const d of docs) {
					if (d.name.endsWith(".md")) {
						this.docsList.push({
							path: `docs/${d.name}`,
							label: `📖 docs/${d.name}`,
						});
					}
				}
			}
		} catch (_) {}

		try {
			const configs = await this.gh.getFolderContents(
				owner,
				"tour-de-controle",
				"config",
			);
			if (Array.isArray(configs)) {
				for (const c of configs) {
					if (c.name.endsWith(".yaml") || c.name.endsWith(".json")) {
						this.docsList.push({
							path: `config/${c.name}`,
							label: `⚙️ config/${c.name}`,
						});
					}
				}
			}
		} catch (_) {}

		this.renderDocsNav();
	}

	renderDocsNav() {
		const list = document.getElementById("docs-nav-list");
		if (!list) return;

		list.innerHTML = this.docsList
			.map(
				(d) => `
      <li class="doc-nav-item ${d.path === this.activeDocPath ? "active" : ""}" onclick="window.app.selectDoc('${d.path}')">
        ${d.label}
      </li>
    `,
			)
			.join("");
	}

	async selectDoc(docPath) {
		this.activeDocPath = docPath;
		this.renderDocsNav();
		await this.loadActiveDoc();
	}

	async loadActiveDoc() {
		const owner = this.currentUser?.login;
		const titleEl = document.getElementById("doc-active-title");
		const statusEl = document.getElementById("doc-active-status");
		const viewerEl = document.getElementById("doc-viewer-container");
		const editorEl = document.getElementById("doc-editor-textarea");

		if (titleEl) titleEl.textContent = this.activeDocPath;
		if (statusEl) statusEl.textContent = "Chargement depuis GitHub privé...";

		let content = "";
		this.activeDocSha = null;

		if (owner) {
			try {
				const file = await this.gh.getFile(
					owner,
					"tour-de-controle",
					this.activeDocPath,
				);
				content = file.content;
				this.activeDocSha = file.sha;
				if (statusEl)
					statusEl.textContent = `Synchronisé avec tour-de-controle (SHA: ${this.activeDocSha.substring(0, 7)})`;
			} catch (err) {
				content = `# Fichier non disponible\nImpossible de charger \`${this.activeDocPath}\` (${err.message}).`;
			}
		}

		if (viewerEl) viewerEl.innerHTML = renderMarkdown(content);
		if (editorEl) editorEl.value = content;
	}

	toggleDocEdit() {
		this.isEditMode = !this.isEditMode;
		const btnToggle = document.getElementById("btn-toggle-edit-doc");
		const btnSave = document.getElementById("btn-save-doc-github");
		const viewer = document.getElementById("doc-viewer-container");
		const editor = document.getElementById("doc-editor-container");

		if (this.isEditMode) {
			viewer?.classList.add("hidden");
			editor?.classList.remove("hidden");
			btnSave?.classList.remove("hidden");
			if (btnToggle) btnToggle.textContent = "👁️ Mode Lecture";
		} else {
			const content =
				document.getElementById("doc-editor-textarea")?.value || "";
			if (viewer) viewer.innerHTML = renderMarkdown(content);
			viewer?.classList.remove("hidden");
			editor?.classList.add("hidden");
			btnSave?.classList.add("hidden");
			if (btnToggle) btnToggle.textContent = "✏️ Mode Édition";
		}
	}

	async saveActiveDocToGitHub() {
		const owner = this.currentUser?.login;
		if (!owner) return;

		const content = document.getElementById("doc-editor-textarea")?.value;
		const commitMsg = `docs: update ${this.activeDocPath} via Tour de Contrôle Web`;

		try {
			this.showToast(`Commit sur ${this.activeDocPath}...`, "success");
			const res = await this.gh.putFile(
				owner,
				"tour-de-controle",
				this.activeDocPath,
				content,
				commitMsg,
				this.activeDocSha,
			);
			this.activeDocSha = res.content?.sha || this.activeDocSha;
			this.showToast(
				"Document sauvegardé et poussé sur tour-de-controle (main) !",
				"success",
			);
			this.toggleDocEdit();
		} catch (err) {
			this.showToast(`Échec du commit : ${err.message}`, "error");
		}
	}

	copyActiveDoc() {
		const content = document.getElementById("doc-editor-textarea")?.value;
		this.copyText(content, "Contenu copié dans le presse-papier !");
	}

	// --- Workspace (12 Scripts Google Apps Script) ---
	renderWorkspaceScripts() {
		const grid = document.getElementById("workspace-scripts-grid");
		if (!grid) return;

		if (!this.claspScripts.length) {
			grid.innerHTML =
				"<p class=\"help-text\" style=\"padding: 24px; text-align: center;\">🔒 Configurez vos crédentiels GitHub (PAT) pour charger vos scripts Apps Script privés.</p>";
			return;
		}

		grid.innerHTML = this.claspScripts
			.map(
				(s) => `
      <div class="project-card">
        <div>
          <div class="project-card-header">
            <span class="project-name" style="font-family: var(--font-mono); font-size: 0.92rem;">${s.name}</span>
            <span class="badge badge-public">GAS V8</span>
          </div>
          <p class="project-desc" style="margin-top: 8px;">${s.desc}</p>
          <div class="project-meta" style="margin-top: 6px;">
            <span>ID: <code>${s.id.substring(0, 16)}...</code></span>
          </div>
        </div>
        <div class="project-actions">
          <a href="https://geoff1805.github.io/Interdevappscript/" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
            ⚡ Ouvrir dans Interdevappscript
          </a>
          <button class="btn btn-ghost btn-sm" onclick="window.app.copyText('${s.id}', 'Script ID copié !')">📋 Copier ID</button>
        </div>
      </div>
    `,
			)
			.join("");
	}

	// --- Missions & Prompts ---
	populateMissionProjects() {
		const sel = document.getElementById("mission-project");
		if (!sel) return;
		sel.innerHTML = this.repos
			.map(
				(r) =>
					`<option value="${r.name}">${r.name} (${r.language || "Code"})</option>`,
			)
			.join("");
	}

	generateTransitionPrompt() {
		const projName = document.getElementById("mission-project")?.value;
		const mType = document.getElementById("mission-type")?.value;
		const title =
			document.getElementById("mission-title")?.value.trim() ||
			"Mission sans titre";
		const desc =
			document.getElementById("mission-desc")?.value.trim() ||
			"Aucune description détaillée.";
		const output = document.getElementById("mission-output");

		const prompt = `📌 [Projet détecté : ${projName}]
🔄 Mission Tour de Contrôle : ${title}
---------------------------------------------------------------------------
• Emplacement : G:\\Mon Drive\\05_Dev\\${projName}
• Type d'intervention : ${mType}

🎯 Objectif fonctionnel :
${desc}

🛡️ Règles absolues de l'Agent Antigravity :
1. Règle 1 : Propagation transversale des correctifs et zéro régression.
2. Règle 7 : Consultation préalable de la KB locale et zéro scan superflu.
3. Règle 13 : Rigueur absolue des tests unitaires et fonctionnels.
4. Règle 16 : Diagnostic Git préalable et verrou anti-collision (.build.lock).
---------------------------------------------------------------------------
Procède étape par étape et rapporte chaque validation avec liens cliquables file:///.`;

		if (output) output.value = prompt;
		this.showToast("Prompt de transition généré !", "success");
	}

	copyPromptOutput() {
		const prompt = document.getElementById("mission-output")?.value;
		this.copyText(prompt, "Prompt copié ! Prêt à coller dans Antigravity IDE.");
	}

	async dispatchAutonomousIssue() {
		const owner = this.currentUser?.login;
		if (!owner) return;

		const projName = document.getElementById("mission-project")?.value;
		const title = document.getElementById("mission-title")?.value.trim();
		const desc = document.getElementById("mission-desc")?.value.trim();

		if (!title) {
			this.showToast("Veuillez renseigner un titre de mission.", "error");
			return;
		}

		const body = `### 🤖 Mission Déclenchée depuis la Tour de Contrôle Web

**Projet cible :** \`${projName}\`
**Date :** ${new Date().toISOString()}

#### Objectif :
${desc || title}

---
*Cette Issue porte le label \`ai-solve\` et sera prise en charge de manière autonome par le workflow CI/CD \`ai-issue-solver.yml\` pour ouvrir une Pull Request.*`;

		try {
			this.showToast(`Création issue sur ${projName}...`, "success");
			const res = await this.gh.createIssue(owner, projName, title, body, [
				"ai-solve",
			]);
			this.showToast(
				`Issue #${res.number} créée avec succès sur ${projName} !`,
				"success",
			);
		} catch (err) {
			this.showToast(`Erreur création Issue : ${err.message}`, "error");
		}
	}

	// --- Copilote IA (Gemini 3.8 Flash) ---
	async askGemini() {
		const input = document.getElementById("ai-chat-input");
		const responseBox = document.getElementById("ai-chat-response");
		const prompt = input?.value.trim();

		if (!prompt) return;
		if (!this.ai.getApiKey()) {
			this.openSettings();
			return;
		}

		if (responseBox)
			responseBox.innerHTML = `<em>✨ Réflexion du Copilote Gemini en cours...</em>`;

		try {
			const answer = await this.ai.ask(prompt);
			if (responseBox) responseBox.innerHTML = renderMarkdown(answer);
		} catch (err) {
			if (responseBox)
				responseBox.innerHTML = `<span style="color: var(--accent-red);">❌ Erreur : ${err.message}</span>`;
		}
	}

	// --- PC Bridge ---
	async pingBridge() {
		const bridgeUrl =
			localStorage.getItem("tdc_bridge_url") || "http://localhost:8765";
		const badge = document.getElementById("bridge-status-badge");

		try {
			const res = await fetch(`${bridgeUrl}/config`, {
				mode: "cors",
				headers: this.agentsHub.getBridgeToken()
					? { Authorization: `Bearer ${this.agentsHub.getBridgeToken()}` }
					: {},
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (badge) {
				badge.className = "badge badge-ok";
				badge.textContent = `En ligne (${data.git?.commit_sha ? data.git.commit_sha.substring(0, 7) : "Connecté"})`;
			}
			this.showToast("PC Bridge connecté !", "success");
		} catch (err) {
			if (badge) {
				badge.className = "badge badge-err";
				badge.textContent = "Hors-ligne";
			}
			this.showToast(`PC Bridge inaccessible (${err.message})`, "error");
		}
	}

	async triggerBridgeSync() {
		const bridgeUrl =
			localStorage.getItem("tdc_bridge_url") || "http://localhost:8765";
		try {
			this.showToast("Déclenchement synchronisation...", "success");
			const res = await fetch(`${bridgeUrl}/config/sync`, {
				method: "POST",
				mode: "cors",
				headers: this.agentsHub.getBridgeToken()
					? { Authorization: `Bearer ${this.agentsHub.getBridgeToken()}` }
					: {},
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			this.showToast("Synchronisation PC terminée avec succès !", "success");
		} catch (err) {
			this.showToast(`Erreur sync : ${err.message}`, "error");
		}
	}

	// --- Modal Paramètres ---
	openSettings() {
		const modal = document.getElementById("modal-settings");
		const inputRemember = document.getElementById("input-remember-tokens");
		if (inputRemember) {
			inputRemember.checked =
				localStorage.getItem("tdc_remember_tokens") !== "false";
		}
		const inputGh = document.getElementById("input-gh-token");
		const inputMistral = document.getElementById("input-mistral-key");
		const inputGroq = document.getElementById("input-groq-key");
		const inputGemini = document.getElementById("input-gemini-key");
		const inputGas = document.getElementById("input-gas-token");
		const inputBridge = document.getElementById("input-bridge-url");
		const inputJules = document.getElementById("input-jules-key");
		const inputBridgeToken = document.getElementById("input-bridge-token");

		if (inputGh) inputGh.value = this.gh.getToken();
		if (inputMistral) inputMistral.value = this.ai.getMistralKey();
		if (inputGroq) inputGroq.value = this.ai.getGroqKey();
		if (inputGemini) inputGemini.value = this.ai.getGeminiKey();
		if (inputGas) inputGas.value = this.gas.getToken();
		if (inputBridge)
			inputBridge.value =
				localStorage.getItem("tdc_bridge_url") || "http://localhost:8765";
		if (inputJules) inputJules.value = this.agentsHub.getJulesKey();
		if (inputBridgeToken)
			inputBridgeToken.value = this.agentsHub.getBridgeToken();

		modal?.classList.remove("hidden");
	}

	closeSettings() {
		document.getElementById("modal-settings")?.classList.add("hidden");
	}

	saveSettingsFromModal() {
		const ghToken =
			document.getElementById("input-gh-token")?.value.trim() || "";
		const mistralKey =
			document.getElementById("input-mistral-key")?.value.trim() || "";
		const groqKey =
			document.getElementById("input-groq-key")?.value.trim() || "";
		const geminiKey =
			document.getElementById("input-gemini-key")?.value.trim() || "";
		const gasToken =
			document.getElementById("input-gas-token")?.value.trim() || "";
		const bridgeUrl =
			document.getElementById("input-bridge-url")?.value.trim() ||
			"http://localhost:8765";
		const julesKey =
			document.getElementById("input-jules-key")?.value.trim() || "";
		const bridgeToken =
			document.getElementById("input-bridge-token")?.value.trim() || "";

		const remember =
			document.getElementById("input-remember-tokens")?.checked ?? true;
		localStorage.setItem("tdc_remember_tokens", remember ? "true" : "false");

		if (ghToken) this.gh.setToken(ghToken, remember);
		if (mistralKey) this.ai.setMistralKey(mistralKey, remember);
		if (groqKey) this.ai.setGroqKey(groqKey, remember);
		if (geminiKey) this.ai.setGeminiKey(geminiKey, remember);
		if (gasToken) this.gas.setManualToken(gasToken, remember);
		if (julesKey) this.agentsHub.setJulesKey(julesKey, remember);
		if (bridgeToken) this.agentsHub.setBridgeToken(bridgeToken, remember);
		localStorage.setItem("tdc_bridge_url", bridgeUrl);

		this.closeSettings();
		this.showToast("Crédentiels enregistrés avec succès !", "success");

		if (this.gh.isAuthenticated()) {
			this.loadAuthenticatedSession();
		} else {
			this.updateAuthPill();
		}
	}

	handleConfigFileSelected(event) {
		const file = event.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const json = JSON.parse(e.target?.result);
				const remember =
					document.getElementById("input-remember-tokens")?.checked ?? true;
				localStorage.setItem("tdc_remember_tokens", remember ? "true" : "false");

				if (json.github_token) this.gh.setToken(json.github_token, remember);
				if (json.mistral_api_key) this.ai.setMistralKey(json.mistral_api_key, remember);
				if (json.groq_api_key) this.ai.setGroqKey(json.groq_api_key, remember);
				if (json.gemini_api_key) this.ai.setGeminiKey(json.gemini_api_key, remember);
				if (json.gas_token) this.gas.setManualToken(json.gas_token, remember);
				if (json.bridge_url)
					localStorage.setItem("tdc_bridge_url", json.bridge_url);

				this.closeSettings();
				this.showToast(
					"Fichier de configuration importé avec succès !",
					"success",
				);

				if (this.gh.isAuthenticated()) {
					this.loadAuthenticatedSession();
				}
			} catch (err) {
				this.showToast(`Erreur JSON : ${err.message}`, "error");
			}
		};
		reader.readAsText(file);
	}

	copyMagicLink() {
		const gh =
			this.gh.getToken() ||
			document.getElementById("input-gh-token")?.value.trim() ||
			"";
		const mistral =
			this.ai.getMistralKey() ||
			document.getElementById("input-mistral-key")?.value.trim() ||
			"";
		const groq =
			this.ai.getGroqKey() ||
			document.getElementById("input-groq-key")?.value.trim() ||
			"";
		const gemini =
			this.ai.getGeminiKey() ||
			document.getElementById("input-gemini-key")?.value.trim() ||
			"";
		const gas =
			this.gas.getToken() ||
			document.getElementById("input-gas-token")?.value.trim() ||
			"";
		const jules =
			this.agentsHub.getJulesKey() ||
			document.getElementById("input-jules-key")?.value.trim() ||
			"";
		const bridgeToken = this.agentsHub.getBridgeToken();

		const url = new URL(window.location.origin + window.location.pathname);
		const hashParts = [];
		if (gh) hashParts.push(`gh=${encodeURIComponent(gh)}`);
		if (mistral) hashParts.push(`mistral=${encodeURIComponent(mistral)}`);
		if (groq) hashParts.push(`groq=${encodeURIComponent(groq)}`);
		if (gemini) hashParts.push(`gemini=${encodeURIComponent(gemini)}`);
		if (gas) hashParts.push(`gas=${encodeURIComponent(gas)}`);
		if (jules) hashParts.push(`jules=${encodeURIComponent(jules)}`);
		if (bridgeToken)
			hashParts.push(`bridge_token=${encodeURIComponent(bridgeToken)}`);

		url.hash = hashParts.join("&");
		this.copyText(url.toString(), "Lien Magique copié dans le presse-papier !");
	}

	// --- Tests IA Dédiés ---
	async testMistral(key, statusElementId) {
		const el = document.getElementById(statusElementId);
		const clean = (key || "").trim();
		if (!clean) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Clé manquante";
			}
			return;
		}
		if (el) {
			el.className = "badge badge-warn";
			el.textContent = "⏳ Test API...";
		}
		try {
			const res = await fetch("https://api.mistral.ai/v1/models", {
				headers: { Authorization: `Bearer ${clean}` },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			if (el) {
				el.className = "badge badge-ok";
				el.textContent = "✅ Codestral validé";
			}
			this.ai.setMistralKey(clean);
			this.showToast("Clé Mistral AI validée et enregistrée !", "success");
		} catch (err) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Clé invalide";
			}
			this.showToast(`Échec test Mistral : ${err.message}`, "error");
		}
	}

	async testGroq(key, statusElementId) {
		const el = document.getElementById(statusElementId);
		const clean = (key || "").trim();
		if (!clean) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Clé manquante";
			}
			return;
		}
		if (el) {
			el.className = "badge badge-warn";
			el.textContent = "⏳ Test API...";
		}
		try {
			const res = await fetch("https://api.groq.com/openai/v1/models", {
				headers: { Authorization: `Bearer ${clean}` },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			if (el) {
				el.className = "badge badge-ok";
				el.textContent = "✅ Groq validé";
			}
			this.ai.setGroqKey(clean);
			this.showToast("Clé Groq Cloud validée et enregistrée !", "success");
		} catch (err) {
			if (el) {
				el.className = "badge badge-err";
				el.textContent = "❌ Clé invalide";
			}
			this.showToast(`Échec test Groq : ${err.message}`, "error");
		}
	}

	// --- Pipeline Autonome Apps Script : Dev ➔ Test ➔ Déploiement ---
	updatePipelineStep(stepNum, state, message) {
		const stepEl = document.getElementById(`step-${stepNum}`);
		if (!stepEl) return;
		stepEl.className = `step-item ${state}`;
		const icon = stepEl.querySelector(".step-icon");
		if (icon) {
			if (state === "active") icon.textContent = "⏳";
			else if (state === "done") icon.textContent = "✅";
			else if (state === "error") icon.textContent = "❌";
			else icon.textContent = "⚪";
		}
		if (message) {
			const label = stepEl.querySelector("span:last-child");
			if (label)
				label.innerHTML = `<strong>Étape ${stepNum} :</strong> ${message}`;
		}
	}

	async runGasPipeline() {
		const scriptId = document.getElementById("agent-gas-script")?.value;
		const aiChoice =
			document.getElementById("auto-gas-ai")?.value ||
			"mistral:codestral-latest";
		const prompt = document.getElementById("auto-gas-prompt")?.value.trim();
		const stepper = document.getElementById("gas-pipeline-stepper");
		const resultBox = document.getElementById("gas-pipeline-result");
		const btn = document.getElementById("btn-run-gas-pipeline");

		const [provider, model] = aiChoice.split(":");

		if (!prompt) {
			this.showToast(
				"Veuillez formuler votre besoin de développement.",
				"error",
			);
			return;
		}

		const token = this.gas.getToken();
		if (!token) {
			this.showToast(
				"Veuillez vous connecter à Google Apps Script (section 5 des Crédentiels).",
				"error",
			);
			this.openSettings();
			return;
		}

		stepper?.classList.remove("hidden");
		resultBox?.classList.add("hidden");
		if (btn) btn.disabled = true;

		// Initialisation des étapes
		for (let i = 1; i <= 4; i++) {
			this.updatePipelineStep(i, "pending");
		}

		try {
			// Étape 1 : Récupération du code existant
			this.updatePipelineStep(
				1,
				"active",
				"Extraction du code source existant via Google Apps Script API...",
			);
			const files = await this.gasClient.getProjectContent(scriptId, token);
			this.updatePipelineStep(
				1,
				"done",
				`Code source extrait avec succès (${files.length} fichiers trouvés)`,
			);

			// Identification du fichier principal
			let mainFile =
				files.find((f) => f.type === "SERVER_JS" && f.name !== "appsscript") ||
				files.find((f) => f.name.endsWith(".gs"));
			if (!mainFile) {
				mainFile = {
					name: "Code",
					type: "SERVER_JS",
					source: "// Code initial Apps Script\n",
				};
				files.push(mainFile);
			}

			// Étape 2 : Développement IA
			this.updatePipelineStep(
				2,
				"active",
				`Développement du code par l'IA (${provider} - ${model})...`,
			);
			const aiPrompt = `Voici le code Google Apps Script existant du fichier "${mainFile.name}" :
\`\`\`javascript
${mainFile.source.slice(0, 10000)}
\`\`\`

Besoin métier exprimé par l'utilisateur :
"${prompt}"

Consigne absolue :
Fournis le code JavaScript Google Apps Script complet, propre et prêt pour la production.
Inclus les commentaires, try/catch et gestion d'erreurs.
Réponds UNIQUEMENT avec le bloc de code \`\`\`javascript ... \`\`\`.`;

			const aiResponse = await this.ai.ask(aiPrompt, { provider, model });

			// Nettoyer le code généré
			let generatedCode = aiResponse;
			const codeMatch = aiResponse.match(
				/```(?:javascript|js)?\s*([\s\S]*?)```/i,
			);
			if (codeMatch) {
				generatedCode = codeMatch[1].trim();
			}

			this.updatePipelineStep(
				2,
				"done",
				`Développement IA validé avec succès (${generatedCode.split("\n").length} lignes générées)`,
			);

			// Étape 3 : Tests syntaxiques & intégrité
			this.updatePipelineStep(
				3,
				"active",
				"Validation syntaxique JavaScript et intégrité Google V8...",
			);
			try {
				new Function(generatedCode);
			} catch (syntaxErr) {
				throw new Error(
					`Erreur de syntaxe détectée dans le code produit : ${syntaxErr.message}`,
				);
			}
			this.updatePipelineStep(
				3,
				"done",
				"Tests syntaxiques validés à 100% (Zéro erreur)",
			);

			// Étape 4 : Déploiement direct Google Apps Script
			this.updatePipelineStep(
				4,
				"active",
				"Déploiement direct dans Google Apps Script Cloud...",
			);
			mainFile.source = generatedCode;
			await this.gasClient.updateProjectContent(scriptId, token, files);
			this.updatePipelineStep(
				4,
				"done",
				"Script déployé en Cloud avec succès !",
			);

			// Rapport final
			if (resultBox) {
				resultBox.classList.remove("hidden");
				resultBox.innerHTML = `
					<div class="panel-card" style="background: rgba(16, 185, 129, 0.1); border: 1px solid var(--accent-green); padding: 16px; margin-top: 14px;">
						<div style="font-weight: 800; font-size: 1.05rem; color: var(--accent-green); margin-bottom: 8px;">🎉 Déploiement Cloud Réussi avec Succès !</div>
						<p class="help-text" style="color: #fff; margin-bottom: 14px;">Le fichier <code>${mainFile.name}</code> a été mis à jour et validé sur votre projet Google Apps Script en direct.</p>
						<div style="display: flex; gap: 10px; flex-wrap: wrap;">
							<a href="https://script.google.com/d/${encodeURIComponent(scriptId)}/edit" target="_blank" rel="noopener" class="btn btn-primary btn-sm">↗️ Ouvrir Google Apps Script</a>
							<a href="https://geoff1805.github.io/Interdevappscript/?scriptId=${encodeURIComponent(scriptId)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">⚡ Ouvrir dans Interdevappscript Studio</a>
						</div>
					</div>
				`;
			}
			this.showToast("Déploiement Google Apps Script réussi !", "success");
		} catch (err) {
			console.error("Erreur pipeline Apps Script :", err);
			this.showToast(`Échec du pipeline : ${err.message}`, "error");
			if (resultBox) {
				resultBox.classList.remove("hidden");
				resultBox.innerHTML = `
					<div class="panel-card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); padding: 16px; margin-top: 14px;">
						<div style="font-weight: 800; color: var(--accent-red); margin-bottom: 6px;">❌ Erreur lors du cycle autonome :</div>
						<p class="help-text" style="color: #fff; margin: 0;">${err.message}</p>
					</div>
				`;
			}
		} finally {
			if (btn) btn.disabled = false;
		}
	}

	copyText(text, successMsg = "Copié !") {
		if (!text) return;
		navigator.clipboard
			.writeText(text)
			.then(() => this.showToast(successMsg, "success"))
			.catch(() => this.showToast("Erreur copie", "error"));
	}
}

window.addEventListener("DOMContentLoaded", () => {
	window.app = new TourDeControleApp();
});
