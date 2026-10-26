# 🏛️ Tour de Contrôle Antigravity — Web Console

> Interface Web Client-Side Zero-Knowledge pour la Tour de Contrôle et l'Écosystème Antigravity.

Cette application web statique s'exécute **à 100% dans le navigateur de l'utilisateur** sans aucun serveur intermédiaire.

---

## 🔒 Architecture "Zero-Knowledge"

- **Zéro donnée en dur** : Aucun nom de projet privé, aucune règle d'architecture ni aucun secret n'est contenu dans ce dépôt.
- **Mode Non Connecté** : Les visiteurs anonymes voient une interface neutre les invitant à renseigner leur Personal Access Token (PAT) GitHub.
- **Mode Connecté** : Avec votre token (conservé exclusivement dans le `localStorage` de votre navigateur), l'application interroge en direct l'API GitHub pour charger vos dépôts privés, consulter vos statuts CI/CD et lire vos règles.

---

## 🚀 Utilisation en Ligne

L'application est accessible directement sur GitHub Pages :
👉 **[https://geoff1805.github.io/tour-de-controle-web/](https://geoff1805.github.io/tour-de-controle-web/)**

---

## 📜 Licence

MIT License (c) 2026 Geoff1805
