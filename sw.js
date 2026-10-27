/**
 * Service Worker pour la Tour de Contrôle Antigravity (PWA)
 * Cache-first pour les assets statiques, Network-first pour les requêtes API (GitHub, Bridge, Gemini)
 */

const CACHE_NAME = "tdc-v2.9.0";
const STATIC_ASSETS = [
	"./",
	"./index.html",
	"./manifest.json",
	"./favicon.svg",
	"./favicon.ico",
	"./apple-touch-icon.png",
	"./css/style.css",
	"./js/app.js",
	"./js/aiClient.js",
	"./js/chatManager.js",
	"./js/bridgeManager.js",
	"./js/agentsHub.js",
	"./js/githubClient.js",
	"./js/gasClient.js",
	"./js/gasManager.js",
	"./js/markdown.js",
	"./icons/icon-192.png",
	"./icons/icon-512.png",
];

// Installation : Mise en cache des assets essentiels
self.addEventListener("install", (e) => {
	e.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {
				return cache.addAll(STATIC_ASSETS);
			})
			.then(() => self.skipWaiting()),
	);
});

// Activation : Nettoyage des anciens caches
self.addEventListener("activate", (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => {
				return Promise.all(
					keys
						.filter((key) => key !== CACHE_NAME)
						.map((key) => caches.delete(key)),
				);
			})
			.then(() => self.clients.claim()),
	);
});

// Fetch : Stratégie hybride
self.addEventListener("fetch", (e) => {
	const url = new URL(e.request.url);

	// Ne pas intercepter les requêtes API externes ou SSE
	if (
		url.origin !== self.location.origin ||
		e.request.method !== "GET" ||
		url.pathname.includes("/stream/") ||
		url.pathname.includes("/events")
	) {
		return;
	}

	e.respondWith(
		caches.match(e.request).then((cached) => {
			if (cached) {
				// Revalidation en arrière-plan (Stale-While-Revalidate)
				fetch(e.request)
					.then((fresh) => {
						if (fresh.ok) {
							caches.open(CACHE_NAME).then((c) => c.put(e.request, fresh));
						}
					})
					.catch(() => {});
				return cached;
			}
			return fetch(e.request);
		}),
	);
});
