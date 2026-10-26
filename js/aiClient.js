/**
 * Client Multi-IA pour la Tour de Contrôle Antigravity
 * Supporte : Google Gemini (Flash), Mistral AI (Codestral), Groq Cloud (Qwen/Llama)
 * 100% Client-Side REST — Zero-Knowledge
 */

export class AiClient {
	constructor() {
		this.geminiKeyStorage = "tdc_gemini_key";
		this.mistralKeyStorage = "tdc_mistral_key";
		this.groqKeyStorage = "tdc_groq_key";

		this.defaultProvider = "mistral"; // Codestral est le choix d'excellence pour le code
		this.defaultModel = "codestral-latest";
	}

	// --- Getters / Setters Clés ---
	getApiKey(provider = "gemini") {
		const getStored = (key) =>
			sessionStorage.getItem(key) || localStorage.getItem(key) || "";

		if (provider === "mistral") {
			return getStored(this.mistralKeyStorage);
		}
		if (provider === "groq") {
			return getStored(this.groqKeyStorage);
		}
		return (
			getStored(this.geminiKeyStorage) ||
			getStored("interdev_gemini_api_key")
		);
	}

	setApiKey(key, provider = "gemini", remember = true) {
		const clean = (key || "").trim();
		const write = (k, val) => {
			if (val) {
				if (remember) {
					localStorage.setItem(k, val);
					sessionStorage.removeItem(k);
				} else {
					sessionStorage.setItem(k, val);
					localStorage.removeItem(k);
				}
			} else {
				localStorage.removeItem(k);
				sessionStorage.removeItem(k);
			}
		};

		if (provider === "mistral") {
			write(this.mistralKeyStorage, clean);
			return;
		}
		if (provider === "groq") {
			write(this.groqKeyStorage, clean);
			return;
		}
		write(this.geminiKeyStorage, clean);
		write("interdev_gemini_api_key", clean);
	}

	getMistralKey() {
		return this.getApiKey("mistral");
	}
	getGroqKey() {
		return this.getApiKey("groq");
	}
	getGeminiKey() {
		return this.getApiKey("gemini");
	}

	setMistralKey(key, remember = true) {
		this.setApiKey(key, "mistral", remember);
	}
	setGroqKey(key, remember = true) {
		this.setApiKey(key, "groq", remember);
	}
	setGeminiKey(key, remember = true) {
		this.setApiKey(key, "gemini", remember);
	}

	// --- Instruction Système ---
	getSystemInstruction() {
		return `Tu es un Ingénieur Développeur Expert Google Apps Script et Architecture Cloud (Écosystème Geoff1805).
Ta mission est de concevoir, auditer, développer et refactorer du code Google Apps Script (JavaScript ES6/V8) robuste, sécurisé et prêt pour la production.

Règles de développement Apps Script strictes :
1. Code propre, moderne (const/let, arrow functions, async/await si applicable).
2. Toujours inclure une gestion des erreurs robuste (try/catch avec Logger.log ou console.error).
3. Respecter les quotas Google Workspace (optimiser les appels batch Sheets/Gmail, éviter les boucles lentes).
4. Fournir TOUJOURS le code JavaScript complet exécutable. Si tu ajoutes ou modifies du code, fournis le fichier .gs prêt à être injecté.
5. Zéro dépendance externe npm incompatible Apps Script. Utiliser les services natifs : GmailApp, DriveApp, CalendarApp, SpreadsheetApp, UrlFetchApp, ScriptApp.`;
	}

	// --- Inférence Multi-Fournisseurs ---
	async ask(prompt, options = {}) {
		const provider = options.provider || this.defaultProvider;
		const model =
			options.model ||
			(provider === "mistral"
				? "codestral-latest"
				: provider === "groq"
					? "qwen/qwen3.8-27b"
					: "gemini-2.5-flash");
		const system = options.system || this.getSystemInstruction();

		if (provider === "mistral") {
			return await this.askMistral(prompt, model, system);
		}
		if (provider === "groq") {
			return await this.askGroq(prompt, model, system);
		}
		return await this.askGemini(prompt, model, system);
	}

	// --- 1. Mistral AI (Codestral) ---
	async askMistral(prompt, model = "codestral-latest", system = "") {
		const key = this.getMistralKey();
		if (!key) {
			throw new Error(
				"Clé API Mistral (Codestral) manquante. Veuillez la configurer dans Crédentiels.",
			);
		}

		const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{ role: "system", content: system || this.getSystemInstruction() },
					{ role: "user", content: prompt },
				],
				temperature: 0.2,
			}),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(
				err.message ||
					err.error?.message ||
					`Erreur Mistral HTTP ${res.status}`,
			);
		}

		const data = await res.json();
		return data.choices?.[0]?.message?.content || "";
	}

	// --- 2. Groq Cloud (Qwen / GPT-OSS) ---
	async askGroq(prompt, model = "qwen/qwen3.8-27b", system = "") {
		const key = this.getGroqKey();
		if (!key) {
			throw new Error(
				"Clé API Groq manquante. Veuillez la configurer dans Crédentiels.",
			);
		}

		const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{ role: "system", content: system || this.getSystemInstruction() },
					{ role: "user", content: prompt },
				],
				temperature: 0.2,
			}),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(
				err.message || err.error?.message || `Erreur Groq HTTP ${res.status}`,
			);
		}

		const data = await res.json();
		return data.choices?.[0]?.message?.content || "";
	}

	// --- 3. Google Gemini (Flash) ---
	async askGemini(prompt, model = "gemini-2.5-flash", system = "") {
		const key = this.getGeminiKey();
		if (!key) {
			throw new Error(
				"Clé API Google Gemini manquante. Veuillez la configurer dans Crédentiels.",
			);
		}

		const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;

		const payload = {
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			systemInstruction: {
				parts: [{ text: system || this.getSystemInstruction() }],
			},
			generationConfig: {
				temperature: 0.2,
				maxOutputTokens: 4096,
			},
		};

		const res = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error?.message || `Erreur Gemini HTTP ${res.status}`);
		}

		const data = await res.json();
		return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
	}
}
