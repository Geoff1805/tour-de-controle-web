# Journal des Mises à Jour — Écosystème Antigravity

> Fichier d'information à destination d'**Antigravity PC** et de l'écosystème (agents, bridge, applications).
> Tenez-vous informé des changements structurants avant toute intervention sur les dépôts.

---

## 2026-10-26 — Sécurité Bridge, Appli Android & Console Web

### 1. 🔒 Correctif sécurité du pc_bridge (`antigravity-controller`, commit `8a6ff697`)

- `GET /bridge/info` exposait le token GitHub **sans authentification**.
- Désormais : `/bridge/info` et `/bridge/tailscale` sont protégés par le Bearer `AGY_BRIDGE_TOKEN` ; le champ `github_token` est remplacé par un simple booléen `github_token_configured` — le token GitHub ne quitte jamais le PC.
- `/health` reste sans auth (statut de base uniquement).
- **Action PC requise** : `git pull` puis redémarrage du bridge.

### 2. 📱 Mise à jour de l'appli Android Antigravity Controller (commits `6c3a6b85` + `de1f0df5`)

Alignée sur le Hub Agents IA de la console Web, **sans aucun secret ni donnée personnelle en dur** :

- **Purge zéro-secret** : plus aucun token GitHub, IP Tailscale, Magic DNS, token bridge, username ou nom de dépôt embarqués dans le code. Tout se configure dans l'écran Configuration de l'appli (PAT GitHub, clé API Jules, token bridge, URL Tailscale).
- **Nouveau Hub multi-agents** (écran Missions) : Auto (Bridge → Jules → repli Copilot), PC via Bridge (validation humaine), Google Jules (PR à valider), GitHub Copilot (PR à valider) ou GitHub Actions (autonome). Le dépôt cible vient de la configuration, plus aucun hardcodage de workflow ou de dépôt.
- **Centre d'approbation enrichi** : bouton « Approuver (review sans fusion) » — approbation formelle GitHub (review `APPROVE`) —, scan des Pull Requests **multi-dépôts**, badge du dépôt d'origine sur chaque carte.
- `bridge_service.dart` : `getBridgeInfo()` envoie désormais le header Bearer ; les adresses privées ont été retirées de la liste de candidats.
- **Action PC requise** : `git pull`, puis rebuild de l'APK (flutter-ci / InstallAPK). Après installation, ressaisir les accès dans l'écran Configuration de l'appli.

### 3. 🌐 Console Web — nouvel onglet « ✅ Approbations » (`tour-de-controle-web`, ce dépôt)

- Nouvel onglet de navigation avec compteur de PRs ouvertes, chargé à la volée.
- **Scan multi-dépôts** : toutes les Pull Requests ouvertes des dépôts (hors forks), triées par mise à jour, avec auteur, dépôt et date.
- Trois actions par PR, en direct via GitHub API (Zero-Knowledge, PAT navigateur uniquement) :
  - **✅ Approuver (review)** — approbation formelle `APPROVE` **sans fusion** ;
  - **🔀 Approuver & Fusionner** — review `APPROVE` puis fusion squash ;
  - **🚫 Fermer** — clôture de la PR.
- `githubClient.js` : nouvelles méthodes `listPullRequests`, `listPullRequestsAcrossRepos`, `approvePullRequest`, `mergePullRequest`, `closePullRequest`.
- Règle conservée : une mission = un prompt + une cible + une approbation — jamais de commit direct sans validation humaine.

### Rappel de règles de l'écosystème

- Pas de secret en dur dans aucun dépôt ; les tokens restent dans les stores locaux (Web) ou l'écran Configuration (Android).
- Les approbations GitHub sont des reviews formelles (`APPROVE`) ; la fusion reste une action explicite de l'humain.
- Après tout `git pull` sur le PC : redémarrer le bridge pour appliquer les correctifs de sécurité.
