# Architecture

```text
Application Windows (Electron) ──> démarre/arrête le même serveur Express
  ├── fenêtre locale sécurisée (isolation de contexte, sandbox, sans Node.js)
  ├── zone de notification et démarrage automatique optionnel
  └── données installées ou portables ──> elec.db locale

Navigateur React / future app mobile
  ├── jeton Bearer ou cookie HttpOnly
  ├── REST /api/* ──> Express ──> statistiques ──> SQLite locale
  └── SSE /api/events <───────── collecte Linky, Sonoff et Omajin
                                      ├── Conso API (HTTPS)
                                      ├── eWeLink (HTTPS/WebSocket)
                                      ├── Sonoff LAN (mDNS/HTTP chiffré)
                                      └── Tuya Cloud (HTTPS signé)
```

`desktop/main.js` gère le cycle de vie Windows et appelle `startServer()`/`stopServer()` sans
dupliquer le backend. En mode installé, les données résident dans
`%APPDATA%\Wattelier\app-data` ; en mode portable, elles résident dans `Wattelier-data` à côté de
l'exécutable. `desktop/updater.js` vérifie les releases GitHub ; l’installateur NSIS peut appliquer
une mise à jour, tandis que l’édition portable conserve un remplacement manuel. Le choix
d’installation automatique réside dans `desktop-preferences.json`, à côté des autres données
locales. `server/index.js` expose l'API, le flux SSE et le build statique. `server/db.js`
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
- le jeton serveur n'est stocké que sous forme d'empreinte SHA-256 et n'est affiché qu'à sa création ;
- une seule instance de collecte eWeLink doit fonctionner ;
- les migrations existantes restent additives et compatibles avec une base déjà remplie.

Les nouvelles installations exigent un jeton pour toute l'API. Le serveur écoute par défaut sur le
réseau local ; une exposition à Internet exige toujours TLS ou un VPN. Le HTML statique et l'état
minimal d'onboarding sont publics, mais aucune donnée énergétique n'est accessible sans jeton.
