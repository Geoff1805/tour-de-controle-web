# 🏛️ Tour de Contrôle Antigravity — Console Unifiée (Web & APK Mobile)

> Centre de commandement et de supervision pour l'écosystème Antigravity.
> Application unifiée disponible en **PWA Web**, en **APK Android natif** (`AntigravityController-v*.apk`), et connectée via le moteur Batch Zero-Tunnel.

---

## 🌟 Fonctionnalités Unifiées

1. **🏛️ Dépôts & CI/CD** : Supervision globale en direct de vos projets (`InstallAPK`, `Bullix`, `Needix`, `Improv-SQE-Consult`, etc.), statuts des workflows GitHub Actions et dispatching.
2. **💬 Chat IA Conversationnel** :
   - Assistant de pilotage conversationnel multi-moteurs (Google Gemini Flash, Mistral Codestral, Groq Cloud ~500 tps).
   - Suggestions de commandes en 1-tap, audit de santé des dépôts, injection de contexte automatique et rendu Markdown riche.
3. **🤖 Hub Agents IA (Jules & Copilot)** : Orchestration autonome de missions, création d'issues `ai-solve` et dispatching automatique.
4. **✅ Approbations & Human-in-the-Loop** :
   - **📥 File d'Attente Batch (Agents Antigravity)** : Programmation de missions en différé, exécutées automatiquement par le PC Windows au démarrage de session dès la connexion Wi-Fi.
   - **🐙 Pull Requests GitHub** : Review et fusion sécurisée des PRs sans commit direct.
5. **⚡ Moteur Batch Zero-Tunnel (GitHub Native)** : Plus aucun tunnel, VPN Tailscale ou port ouvert requis. Les missions sont déposées dans la file GitHub et dépilées par le runner local (`run-batch-runner.ps1` ou commande `batch`).

---

## 🔒 Architecture "Zero-Knowledge"

- **Zéro donnée en dur** : Aucun secret, token GitHub ou clé IA n'est stocké dans le dépôt public.
- **Stockage Client Sécurisé** : Vos clés (PAT GitHub, Gemini, Mistral, Groq, Bridge Token) sont conservées exclusivement dans le `localStorage` de votre navigateur ou de votre application mobile.

---

## 📱 Distribution & Accès

### 1. Accès Web & PWA (Tous écrans)
Accessible directement sur GitHub Pages :
👉 **[https://geoff1805.github.io/tour-de-controle-web/](https://geoff1805.github.io/tour-de-controle-web/)**
*(Installable en 1-clic sur Android et iOS comme application autonome via le menu du navigateur)*.

### 2. APK Android (`InstallAPK`)
L'APK officiel est généré automatiquement par GitHub Actions à chaque version :
- Nom normalisé : `AntigravityController-v<versionName>.apk`
- Zéro archive ZIP superflue : directement téléchargeable et installable via [InstallAPK](https://github.com/Geoff1805/InstallAPK).

---

## 🚀 Compilation Locale de l'APK Android

```powershell
cd android

# Copier les assets Web récents
./gradlew copyWebAssets

# Compiler l'APK Android Release normalisé
./gradlew assembleRelease
```
L'APK compilé se trouve dans `android/app/build/outputs/apk/release/app-release.apk` et est distribué sous `build-artifacts/AntigravityController-v<versionName>.apk`.

---

## 📜 Licence
MIT License (c) 2026 Geoff1805
