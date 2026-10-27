# 🏛️ Tour de Contrôle Antigravity — Console Unifiée (Web & APK Mobile)

> Centre de commandement et de supervision pour l'écosystème Antigravity.
> Application unifiée disponible en **PWA Web**, en **APK Android natif** (`AntigravityController-v*.apk`), et connectée en direct au PC Bridge.

---

## 🌟 Fonctionnalités Unifiées

1. **🏛️ Dépôts & CI/CD** : Supervision globale en direct de vos projets (`InstallAPK`, `Bullix`, `Needix`, `Improv-SQE-Consult`, etc.), statuts des workflows GitHub Actions et dispatching.
2. **💬 Chat IA Conversationnel** :
   - Assistant de pilotage conversationnel multi-moteurs (Google Gemini Flash, Mistral Codestral, Groq Cloud ~500 tps, et agent local PC Bridge).
   - Suggestions de commandes en 1-tap, audit de santé des dépôts, injection de contexte automatique et rendu Markdown riche.
3. **🤖 Hub Agents IA (Jules & Copilot)** : Orchestration autonome de missions, création d'issues `ai-solve` et dispatching automatique.
4. **✅ Approbations & Human-in-the-Loop** :
   - **⚡ Approbations Temps Réel (Agents Antigravity)** : Validation/rejet immédiat en 1-tap des commandes sensibles et diffs de code via le stream SSE du PC Bridge.
   - **🐙 Pull Requests GitHub** : Review et fusion sécurisée des PRs sans commit direct.
5. **🖥️ PC Bridge FastAPI & Tailscale** : Communication bidirectionnelle chiffrée avec le PC local via Tailscale WireGuard (`/health`, `/config/sync`, `/missions/launch`, `/stream/events`).

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
