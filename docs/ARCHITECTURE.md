# Architecture

```text
Application Windows (Electron)
  ├── mode serveur ──> démarre/arrête le même serveur Express
  ├── mode client ──> charge exclusivement l'origine HTTPS du serveur distant
  ├── fenêtres sécurisées (isolation de contexte, sandbox, sans Node.js)
  ├── zone de notification et démarrage automatique optionnel
  ├── connexion distante chiffrée par Windows (DPAPI)
  └── mode serveur ──> données installées ou portables ──> elec.db locale

Navigateur React / future app mobile
  ├── jeton Bearer ou cookie HttpOnly
  ├── REST /api/* ──> Express ──> statistiques ──> SQLite locale
  └── SSE /api/events <───────── collecte Linky, Sonoff et Omajin
                                      ├── Conso API (HTTPS)
                                      ├── eWeLink (HTTPS/WebSocket)
                                      ├── Sonoff LAN (mDNS/HTTP chiffré)
                                      └── Tuya Cloud (HTTPS signé)
```

`desktop/main.js` propose le choix serveur/client au premier lancement des éditions installée et
portable. Le mode serveur appelle `startServer()`/`stopServer()` sans dupliquer le backend. Le mode
client valide un jeton de connexion autonome, enregistre sa configuration avec `safeStorage` et ne
charge que l'origine HTTPS autorisée, sans pont Electron. En mode installé, les données résident dans
`%APPDATA%\Wattelier\app-data` ; en mode portable, elles résident dans `Wattelier-data` à côté de
l'exécutable. `desktop/updater.js` vérifie les releases GitHub ; l’installateur NSIS peut appliquer
une mise à jour, tandis que l’édition portable conserve un remplacement manuel. Le choix
d’installation automatique réside dans `desktop-preferences.json`, à côté des autres données
locales. `desktop/tailscale.js` détecte Tailscale et peut activer Tailscale Serve vers le serveur
local ; cette intégration reste facultative. `desktop/reset.js` enregistre une demande minimale hors
du dossier de données ; au redémarrage suivant, avant l’ouverture de SQLite et des journaux, ce
dossier est renommé en sauvegarde datée. `server/index.js` expose l'API, le flux SSE et le build statique. `server/db.js`
possède le schéma SQLite et les migrations additives. `server/stats.js` contient les agrégations.
`server/linky.js` gère la synchronisation et le rattrapage. `server/sonoff/` sépare cloud,
découverte LAN et cryptographie. `server/omajin/` contient le client OpenAPI Tuya signé, la
normalisation des points de données et la collecte OSP-FR-01. `web/src/` contient l'interface React
et les pages métier.

## Invariants

- les données maison Linky et les mesures des prises sont comparées, jamais additionnées ;
- les données `source='demo'` restent séparées des données réelles ;
- les clés Sonoff, clés de projet Tuya, jetons, PRM et données SQLite ne quittent pas le stockage local ;
- les réponses API ne renvoient ni `conso_token`, ni mot de passe eWeLink, ni clé d'appareil, ni
  `tuya_access_id`, ni `tuya_access_secret` ;
- le secret serveur n'est stocké côté serveur que sous forme d'empreinte SHA-256 ; le jeton de
  connexion `wtl1_…` contient l'origine HTTPS et ce secret, n'est affiché qu'à sa création et doit
  être traité comme un mot de passe ;
- une seule instance de collecte eWeLink doit fonctionner ;
- les migrations existantes restent additives et compatibles avec une base déjà remplie.

Les nouvelles installations exigent un jeton pour toute l'API. Le serveur écoute par défaut sur le
réseau local. Tailscale Serve fournit facultativement une origine HTTPS privée au tailnet ; une autre
forme d'exposition distante exige toujours TLS ou un VPN. Le HTML statique et l'état
minimal d'onboarding sont publics, mais aucune donnée énergétique n'est accessible sans jeton.
