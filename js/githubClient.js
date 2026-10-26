/**
 * Client GitHub API 100% Client-Side pour la Tour de Contrôle Antigravity
 * Architecture Zero-Knowledge : Ne transmet aucune donnée à un serveur intermédiaire.
 */

export class GitHubClient {
	constructor() {
		this.tokenKey = "tdc_gh_token";
		this.fallbackKey = "gitcms_token";
	}

	getToken() {
		return (
			sessionStorage.getItem(this.tokenKey) ||
			localStorage.getItem(this.tokenKey) ||
			sessionStorage.getItem(this.fallbackKey) ||
			localStorage.getItem(this.fallbackKey) ||
			""
		);
	}

	setToken(token, remember = true) {
		const clean = (token || "").trim();
		if (clean) {
			if (remember) {
				localStorage.setItem(this.tokenKey, clean);
				localStorage.setItem(this.fallbackKey, clean);
				sessionStorage.removeItem(this.tokenKey);
				sessionStorage.removeItem(this.fallbackKey);
			} else {
				sessionStorage.setItem(this.tokenKey, clean);
				sessionStorage.setItem(this.fallbackKey, clean);
				localStorage.removeItem(this.tokenKey);
				localStorage.removeItem(this.fallbackKey);
			}
		} else {
			localStorage.removeItem(this.tokenKey);
			localStorage.removeItem(this.fallbackKey);
			sessionStorage.removeItem(this.tokenKey);
			sessionStorage.removeItem(this.fallbackKey);
		}
	}

	isAuthenticated() {
		return Boolean(this.getToken());
	}

	utf8ToBase64(str) {
		const bytes = new TextEncoder().encode(str);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	base64ToUtf8(base64) {
		const clean = base64.replace(/\s/g, "");
		const binary = atob(clean);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return new TextDecoder("utf-8").decode(bytes);
	}

	async request(endpoint, options = {}) {
		const token = this.getToken();
		const url = endpoint.startsWith("https://")
			? endpoint
			: `https://api.github.com${endpoint}`;
		const headers = {
			Accept: "application/vnd.github.v3+json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers || {}),
		};

		const res = await fetch(url, { ...options, headers });
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			const msg = err.message || `Erreur GitHub HTTP ${res.status}`;
			throw new Error(msg);
		}
		if (res.status === 204) return null;
		return res.json();
	}

	async getCurrentUser() {
		return this.request("/user");
	}

	async listUserRepos() {
		return this.request("/user/repos?per_page=100&sort=updated&type=all");
	}

	async getRepo(owner, repoName) {
		return this.request(`/repos/${owner}/${repoName}`);
	}

	async getFolderContents(owner, repoName, folderPath = "", ref = "main") {
		const cleanPath = folderPath.replace(/^\/+/, "");
		return this.request(
			`/repos/${owner}/${repoName}/contents/${cleanPath}?ref=${ref}`,
		);
	}

	async getFile(owner, repoName, filePath, ref = "main") {
		const cleanPath = filePath.replace(/^\/+/, "");
		const data = await this.request(
			`/repos/${owner}/${repoName}/contents/${cleanPath}?ref=${ref}`,
		);
		return {
			content: this.base64ToUtf8(data.content),
			sha: data.sha,
		};
	}

	async putFile(
		owner,
		repoName,
		filePath,
		content,
		message,
		sha = null,
		branch = "main",
	) {
		const cleanPath = filePath.replace(/^\/+/, "");
		const body = {
			message,
			content: this.utf8ToBase64(content),
			branch,
		};
		if (sha) body.sha = sha;

		return this.request(`/repos/${owner}/${repoName}/contents/${cleanPath}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	async getLatestRelease(owner, repoName) {
		try {
			return await this.request(`/repos/${owner}/${repoName}/releases/latest`);
		} catch (_) {
			return null;
		}
	}

	async getLatestWorkflowRun(owner, repoName) {
		try {
			const data = await this.request(
				`/repos/${owner}/${repoName}/actions/runs?per_page=1`,
			);
			return data.workflow_runs?.[0] || null;
		} catch (_) {
			return null;
		}
	}

	async triggerWorkflow(owner, repoName, workflowId = "ci.yml", ref = "main") {
		return this.request(
			`/repos/${owner}/${repoName}/actions/workflows/${workflowId}/dispatches`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ref }),
			},
		);
	}

	async createIssue(owner, repoName, title, body, labels = ["ai-solve"]) {
		return this.request(`/repos/${owner}/${repoName}/issues`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title, body, labels }),
		});
	}
}
