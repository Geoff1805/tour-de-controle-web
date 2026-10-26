/**
 * Gestionnaire d'accès Google Apps Script (Workspace)
 * 100% Client-Side — Partage de session avec Interdevappscript
 */

export class GasManager {
	constructor() {
		this.tokenKey = "interdev_google_access_token";
		this.manualTokenKey = "interdev_google_manual_token";
		this.userEmailKey = "interdev_google_user_email";
		this.clientId =
			"740777072621-33egh4phvjfgu84alpn1ovj16s83g7hs.apps.googleusercontent.com";
		this.tokenClient = null;
	}

	getToken() {
		return (
			sessionStorage.getItem(this.tokenKey) ||
			localStorage.getItem(this.tokenKey) ||
			sessionStorage.getItem(this.manualTokenKey) ||
			localStorage.getItem(this.manualTokenKey) ||
			""
		);
	}

	getUserEmail() {
		return (
			sessionStorage.getItem(this.userEmailKey) ||
			localStorage.getItem(this.userEmailKey) ||
			""
		);
	}

	setManualToken(token, remember = true) {
		const clean = (token || "").trim();
		if (clean) {
			if (remember) {
				localStorage.setItem(this.manualTokenKey, clean);
				sessionStorage.removeItem(this.manualTokenKey);
			} else {
				sessionStorage.setItem(this.manualTokenKey, clean);
				localStorage.removeItem(this.manualTokenKey);
			}
		} else {
			localStorage.removeItem(this.manualTokenKey);
			sessionStorage.removeItem(this.manualTokenKey);
		}
	}

	isAuthenticated() {
		return Boolean(this.getToken());
	}

	initGisClient(onSuccess, onError) {
		if (
			typeof window.google === "undefined" ||
			!window.google.accounts?.oauth2
		) {
			return false;
		}

		try {
			this.tokenClient = window.google.accounts.oauth2.initTokenClient({
				client_id: this.clientId,
				scope:
					"https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/userinfo.email",
				callback: async (resp) => {
					if (resp.error) {
						if (onError) onError(resp.error);
						return;
					}
					if (resp.access_token) {
						localStorage.setItem(this.tokenKey, resp.access_token);
						try {
							const userRes = await fetch(
								"https://www.googleapis.com/oauth2/v3/userinfo",
								{
									headers: { Authorization: `Bearer ${resp.access_token}` },
								},
							);
							if (userRes.ok) {
								const userData = await userRes.json();
								if (userData.email) {
									localStorage.setItem(this.userEmailKey, userData.email);
								}
							}
						} catch (_) {}
						if (onSuccess) onSuccess(resp.access_token);
					}
				},
			});
			return true;
		} catch (e) {
			console.error("GIS init error:", e);
			return false;
		}
	}

	login(onSuccess, onError) {
		if (!this.tokenClient) {
			const ok = this.initGisClient(onSuccess, onError);
			if (!ok) {
				throw new Error("Client Google Identity Services non disponible.");
			}
		}
		this.tokenClient.requestAccessToken({ prompt: "consent" });
	}
}
