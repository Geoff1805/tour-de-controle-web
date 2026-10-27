/**
 * Gestionnaire du Chat IA pour la Tour de Contrôle Antigravity
 * Multi-fournisseurs : Google Gemini Flash, Mistral Codestral, Groq Cloud, PC Bridge
 * Rendu Markdown avec coloration et copie de code
 * 100% Client-Side — Persistance localStorage
 */

import { renderMarkdown } from "./markdown.js";

export class ChatManager {
	constructor(aiClient, appRef) {
		this.ai = aiClient;
		this.app = appRef;
		this.storageKey = "tdc_chat_history_v1";
		this.messages = [];
		this.isLoading = false;

		this.provider = localStorage.getItem("tdc_chat_provider") || "gemini";
		this.model = localStorage.getItem("tdc_chat_model") || "gemini-2.5-flash";
		this.injectContext =
			localStorage.getItem("tdc_chat_inject_context") !== "false";

		this.dom = {
			container: null,
			messagesList: null,
			form: null,
			input: null,
			providerSelect: null,
			modelSelect: null,
			contextCheckbox: null,
			clearBtn: null,
			chipsContainer: null,
		};
	}

	init() {
		this.dom.container = document.getElementById("tab-chat");
		this.dom.messagesList = document.getElementById("chat-messages-list");
		this.dom.form = document.getElementById("chat-form");
		this.dom.input = document.getElementById("chat-input");
		this.dom.providerSelect = document.getElementById("chat-provider-select");
		this.dom.modelSelect = document.getElementById("chat-model-select");
		this.dom.contextCheckbox = document.getElementById("chat-inject-context");
		this.dom.clearBtn = document.getElementById("btn-chat-clear");
		this.dom.chipsContainer = document.getElementById("chat-quick-chips");

		if (!this.dom.messagesList || !this.dom.form) return;

		// Initialisation des sélecteurs
		if (this.dom.providerSelect) {
			this.dom.providerSelect.value = this.provider;
			this.updateModelOptions();
			this.dom.providerSelect.addEventListener("change", (e) => {
				this.provider = e.target.value;
				localStorage.setItem("tdc_chat_provider", this.provider);
				this.updateModelOptions();
			});
		}

		if (this.dom.modelSelect) {
			this.dom.modelSelect.value = this.model;
			this.dom.modelSelect.addEventListener("change", (e) => {
				this.model = e.target.value;
				localStorage.setItem("tdc_chat_model", this.model);
			});
		}

		if (this.dom.contextCheckbox) {
			this.dom.contextCheckbox.checked = this.injectContext;
			this.dom.contextCheckbox.addEventListener("change", (e) => {
				this.injectContext = e.target.checked;
				localStorage.setItem(
					"tdc_chat_inject_context",
					String(this.injectContext),
				);
			});
		}

		// Envoi de message (Formulaire & Enter)
		this.dom.form.addEventListener("submit", (e) => {
			e.preventDefault();
			this.handleSend();
		});

		this.dom.input?.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		// Effacer l'historique
		this.dom.clearBtn?.addEventListener("click", () => {
			if (confirm("Effacer tout l'historique du Chat IA ?")) {
				this.clearHistory();
			}
		});

		// Quick Chips
		this.dom.chipsContainer?.addEventListener("click", (e) => {
			const chip = e.target.closest(".chat-chip");
			if (!chip) return;
			const prompt =
				chip.getAttribute("data-prompt") || chip.textContent.trim();
			if (prompt && this.dom.input) {
				this.dom.input.value = prompt;
				this.handleSend();
			}
		});

		// Délégation pour boutons de copie dans les blocs de code
		this.dom.messagesList.addEventListener("click", (e) => {
			const btn = e.target.closest(".btn-copy-code");
			if (!btn) return;
			const codeBlock = btn.parentElement?.querySelector("code");
			if (codeBlock) {
				navigator.clipboard.writeText(codeBlock.innerText).then(() => {
					const orig = btn.innerText;
					btn.innerText = "✓ Copié !";
					setTimeout(() => (btn.innerText = orig), 2000);
				});
			}
		});

		this.loadHistory();
	}

	updateModelOptions() {
		if (!this.dom.modelSelect) return;
		this.dom.modelSelect.innerHTML = "";

		const modelsByProvider = {
			gemini: [
				{
					val: "gemini-2.5-flash",
					label: "Gemini 2.5 Flash (Rapide & Gratuit)",
				},
				{ val: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Raisonnement Élite)" },
			],
			groq: [
				{ val: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (Groq ~500 t/s)" },
				{ val: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)" },
			],
			mistral: [
				{ val: "codestral-latest", label: "Codestral Latest (Mistral Élite)" },
				{ val: "mistral-large-latest", label: "Mistral Large (Général)" },
			],
			bridge: [
				{
					val: "antigravity-local",
					label: "Agent Antigravity PC (FastAPI Local)",
				},
			],
		};

		const list = modelsByProvider[this.provider] || modelsByProvider.gemini;
		list.forEach((m) => {
			const opt = document.createElement("option");
			opt.value = m.val;
			opt.textContent = m.label;
			this.dom.modelSelect.appendChild(opt);
		});

		this.model = list[0].val;
		localStorage.setItem("tdc_chat_model", this.model);
	}

	loadHistory() {
		try {
			const saved = localStorage.getItem(this.storageKey);
			this.messages = saved ? JSON.parse(saved) : [];
		} catch (_e) {
			this.messages = [];
		}

		if (this.messages.length === 0) {
			this.messages = [
				{
					role: "assistant",
					content:
						`👋 **Bonjour Geoffroy !** Je suis l'assistant IA de la Tour de Contrôle.\n\nJe peux vous assister pour :\n- 📊 Analyser l'état de vos dépôts et pipelines CI/CD.\n- 🤖 Déclencher des missions ou résoudre des anomalies avec **Jules**, **Copilot** ou le **PC Bridge**.\n- 🛡️ Auditer la sécurité Dependabot et les versions de vos applications (` +
						"`InstallAPK`" +
						`, ` +
						"`Bullix`" +
						`, ` +
						"`Needix`" +
						`).\n\nQue souhaitez-vous accomplir aujourd'hui ?`,
					timestamp: Date.now(),
				},
			];
		}

		this.renderAllMessages();
	}

	saveHistory() {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(this.messages));
		} catch (e) {
			console.warn("Impossible de sauvegarder l'historique du chat:", e);
		}
	}

	clearHistory() {
		this.messages = [];
		localStorage.removeItem(this.storageKey);
		this.loadHistory();
	}

	renderAllMessages() {
		if (!this.dom.messagesList) return;
		this.dom.messagesList.innerHTML = "";
		for (const m of this.messages) {
			this.appendMessageDOM(m);
		}
		this.scrollToBottom();
	}

	appendMessageDOM(message) {
		const isUser = message.role === "user";
		const item = document.createElement("div");
		item.className = `chat-message-row ${isUser ? "user" : "assistant"}`;

		const avatar = document.createElement("div");
		avatar.className = "chat-avatar";
		avatar.innerHTML = isUser ? "👤" : this.provider === "bridge" ? "🖥️" : "🤖";

		const bubble = document.createElement("div");
		bubble.className = "chat-bubble";

		const header = document.createElement("div");
		header.className = "chat-bubble-header";
		const timeStr = new Date(
			message.timestamp || Date.now(),
		).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
		header.innerHTML = `<strong>${isUser ? "Vous" : "Assistant Antigravity"}</strong> <span>${timeStr}</span>`;

		const body = document.createElement("div");
		body.className = "chat-bubble-body markdown-viewer";
		body.innerHTML = renderMarkdown(message.content);

		// Ajout du bouton de copie aux blocs de code
		body.querySelectorAll("pre").forEach((pre) => {
			pre.style.position = "relative";
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "btn-copy-code";
			btn.innerText = "Copier";
			pre.appendChild(btn);
		});

		bubble.appendChild(header);
		bubble.appendChild(body);

		item.appendChild(avatar);
		item.appendChild(bubble);
		this.dom.messagesList.appendChild(item);
	}

	scrollToBottom() {
		if (this.dom.messagesList) {
			this.dom.messagesList.scrollTop = this.dom.messagesList.scrollHeight;
		}
	}

	async handleSend() {
		if (this.isLoading) return;
		const text = this.dom.input?.value.trim();
		if (!text) return;

		// Ajout message utilisateur
		const userMsg = {
			role: "user",
			content: text,
			timestamp: Date.now(),
		};
		this.messages.push(userMsg);
		this.appendMessageDOM(userMsg);
		this.saveHistory();
		this.dom.input.value = "";
		this.scrollToBottom();

		// Indicateur de chargement
		this.isLoading = true;
		this.showTypingIndicator();

		try {
			// Construction du contexte des projets si coché
			let systemInstruction = "";
			if (this.injectContext && this.app) {
				systemInstruction = this.buildContextSystemPrompt();
			}

			// Appel de l'IA
			const reply = await this.ai.chat(this.messages, {
				provider: this.provider,
				model: this.model,
				system: systemInstruction,
			});

			this.removeTypingIndicator();

			const aiMsg = {
				role: "assistant",
				content: reply || "Aucune réponse reçue.",
				timestamp: Date.now(),
			};
			this.messages.push(aiMsg);
			this.appendMessageDOM(aiMsg);
			this.saveHistory();
			this.scrollToBottom();
		} catch (err) {
			this.removeTypingIndicator();
			const errMsg = {
				role: "assistant",
				content: `⚠️ **Erreur lors de l'appel IA (${this.provider})** :\n\n> ${err.message}\n\n*Vérifiez vos clés dans le bouton ⚙️ Crédentiels en haut à droite.*`,
				timestamp: Date.now(),
			};
			this.messages.push(errMsg);
			this.appendMessageDOM(errMsg);
			this.scrollToBottom();
		} finally {
			this.isLoading = false;
		}
	}

	showTypingIndicator() {
		const row = document.createElement("div");
		row.id = "chat-typing-indicator";
		row.className = "chat-message-row assistant";
		row.innerHTML = `
			<div class="chat-avatar">🤖</div>
			<div class="chat-bubble typing-bubble">
				<span class="typing-dot"></span>
				<span class="typing-dot"></span>
				<span class="typing-dot"></span>
			</div>
		`;
		this.dom.messagesList.appendChild(row);
		this.scrollToBottom();
	}

	removeTypingIndicator() {
		document.getElementById("chat-typing-indicator")?.remove();
	}

	buildContextSystemPrompt() {
		let context = `${this.ai.getChatSystemInstruction()}\n\n`;

		// Inventaire des dépôts depuis l'application
		if (this.app?.projects && this.app.projects.length > 0) {
			context += `### Contexte de l'Écosystème Actuel (Tour de Contrôle) :\n`;
			context += `- Total de dépôts gérés : ${this.app.projects.length}\n`;

			const failing = this.app.projects.filter((p) => p.status === "failure");
			if (failing.length > 0) {
				context += `- Dépôts en échec CI/CD : ${failing.map((p) => p.name).join(", ")}\n`;
			} else {
				context += `- Tous les pipelines CI/CD sont au vert (zéro échec).\n`;
			}

			const openPRs = this.app.openPrCount || 0;
			context += `- Pull Requests en attente d'approbation : ${openPRs}\n`;

			const names = this.app.projects
				.slice(0, 10)
				.map((p) => p.name)
				.join(", ");
			context += `- Exemples de projets actifs : ${names}...\n`;
		}

		// Statut PC Bridge
		const bridgeUrl =
			localStorage.getItem("tdc_bridge_url") || "http://localhost:8765";
		context += `- PC Bridge configuré sur : ${bridgeUrl}\n`;

		return context;
	}
}
