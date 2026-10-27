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

	async ensureLabel(
		owner,
		repoName,
		name = "batch-mission",
		color = "38bdf8",
		description = "Missions en attente du PC Antigravity",
	) {
		try {
			await this.request(`/repos/${owner}/${repoName}/labels`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, color, description }),
			});
		} catch (_) {
			// Le label existe déjà ou non bloquant
		}
	}

	async createIssue(owner, repoName, title, body, labels = ["ai-solve"]) {
		if (labels.includes("batch-mission")) {
			await this.ensureLabel(owner, repoName, "batch-mission");
		}
		return this.request(`/repos/${owner}/${repoName}/issues`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title, body, labels }),
		});
	}

	async searchIssues(query) {
		return this.request(
			`/search/issues?q=${encodeURIComponent(query)}&sort=created&order=asc`,
		);
	}

	async closeIssue(owner, repoName, number, comment = null) {
		if (comment) {
			await this.request(
				`/repos/${owner}/${repoName}/issues/${number}/comments`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ body: comment }),
				},
			);
		}
		return this.request(`/repos/${owner}/${repoName}/issues/${number}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ state: "closed" }),
		});
	}

	// ─── Pull Requests : approbations formelles & cycle de vie ───

	async listPullRequests(owner, repoName, state = "open") {
		return this.request(
			`/repos/${owner}/${repoName}/pulls?state=${state}&sort=updated&direction=desc&per_page=50`,
		);
	}

	/** Scan multi-dépôts : renvoie les PRs ouvertes, annotées _owner/_repo. */
	async listPullRequestsAcrossRepos(owner, repoNames, limit = 15) {
		const names = (repoNames || []).slice(0, limit);
		const results = await Promise.all(
			names.map(async (name) => {
				try {
					const prs = await this.listPullRequests(owner, name);
					return prs.map((pr) => ({ ...pr, _owner: owner, _repo: name }));
				} catch (_) {
					return [];
				}
			}),
		);
		return results
			.flat()
			.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
	}

	/** Approbation formelle : review APPROVE sans fusion. */
	async approvePullRequest(owner, repoName, number) {
		return this.request(`/repos/${owner}/${repoName}/pulls/${number}/reviews`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ event: "APPROVE" }),
		});
	}

	async mergePullRequest(owner, repoName, number, mergeMethod = "squash") {
		return this.request(`/repos/${owner}/${repoName}/pulls/${number}/merge`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ merge_method: mergeMethod }),
		});
	}

	async closePullRequest(owner, repoName, number) {
		return this.request(`/repos/${owner}/${repoName}/pulls/${number}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ state: "closed" }),
		});
	}
}
