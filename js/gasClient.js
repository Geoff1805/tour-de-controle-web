/**
 * Client officiel Google Apps Script REST API v1
 * Documentation : https://developers.google.com/apps-script/api/reference/rest/v1/projects
 */

export class GasClient {
	constructor(baseUrl = "https://script.googleapis.com/v1") {
		this.baseUrl = baseUrl;
	}

	/**
	 * Récupère le contenu d'un projet Apps Script (liste des fichiers)
	 */
	async getProjectContent(scriptId, accessToken) {
		if (!scriptId) throw new Error("ID de projet Apps Script requis.");
		if (!accessToken)
			throw new Error("Token d'accès Google requis. Veuillez vous connecter.");

		const url = `${this.baseUrl}/projects/${encodeURIComponent(scriptId)}/content`;
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			const err = await response.json().catch(() => ({}));
			throw new Error(
				err.error?.message ||
					`Erreur HTTP ${response.status} lors de la lecture du projet Apps Script.`,
			);
		}

		const data = await response.json();
		const rawFiles = data.files || [];

		// Normalisation vers des fichiers avec extension conviviale
		return rawFiles.map((file) => {
			let extension = ".gs";
			if (file.type === "HTML") extension = ".html";
			if (file.type === "JSON") extension = ".json";

			const displayName = file.name.endsWith(extension)
				? file.name
				: `${file.name}${extension}`;

			return {
				id: file.name,
				name: file.name,
				displayName: displayName,
				type: file.type,
				source: file.source || "",
				createTime: file.createTime,
				updateTime: file.updateTime,
				lastModifyUser: file.lastModifyUser,
			};
		});
	}

	/**
	 * Pousse la totalité des fichiers vers Google Apps Script (Déploiement direct)
	 */
	async updateProjectContent(scriptId, accessToken, files) {
		if (!scriptId) throw new Error("ID de projet Apps Script requis.");
		if (!accessToken)
			throw new Error("Token d'accès Google requis. Veuillez vous connecter.");

		const payloadFiles = files.map((f) => {
			let type = f.type || "SERVER_JS";
			let name = f.name;

			if (name.endsWith(".gs")) {
				name = name.slice(0, -3);
				type = "SERVER_JS";
			} else if (name.endsWith(".html")) {
				name = name.slice(0, -5);
				type = "HTML";
			} else if (name.endsWith(".json")) {
				name = name.slice(0, -5);
				type = "JSON";
			}

			return {
				name: name,
				type: type,
				source: f.source,
			};
		});

		// Google exige impérativement que le manifest appsscript.json soit présent
		const hasManifest = payloadFiles.some(
			(f) => f.name === "appsscript" && f.type === "JSON",
		);
		if (!hasManifest) {
			payloadFiles.push({
				name: "appsscript",
				type: "JSON",
				source: JSON.stringify(
					{
						timeZone: "Europe/Paris",
						dependencies: {},
						exceptionLogging: "STACKDRIVER",
						runtimeVersion: "V8",
					},
					null,
					2,
				),
			});
		}

		const url = `${this.baseUrl}/projects/${encodeURIComponent(scriptId)}/content`;
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				files: payloadFiles,
			}),
		});

		if (!response.ok) {
			const err = await response.json().catch(() => ({}));
			throw new Error(
				err.error?.message ||
					`Erreur HTTP ${response.status} lors de la mise à jour Apps Script.`,
			);
		}

		return await response.json();
	}

	/**
	 * Récupère les métadonnées du projet (Titre, etc.)
	 */
	async getProjectMetadata(scriptId, accessToken) {
		const url = `${this.baseUrl}/projects/${encodeURIComponent(scriptId)}`;
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) return null;
		return await response.json();
	}
}
