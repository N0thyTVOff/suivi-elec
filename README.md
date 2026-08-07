# Wattelier

![Wattelier](web/public/brand/wattelier-wordmark.svg)

[![CI](https://github.com/N0thyTVOff/wattelier/actions/workflows/ci.yml/badge.svg)](https://github.com/N0thyTVOff/wattelier/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/N0thyTVOff/wattelier?display_name=tag)](https://github.com/N0thyTVOff/wattelier/releases)
[![Licence AGPL-3.0](https://img.shields.io/github/license/N0thyTVOff/wattelier)](LICENSE)
[![Issues](https://img.shields.io/github/issues/N0thyTVOff/wattelier)](https://github.com/N0thyTVOff/wattelier/issues)

**Votre énergie, enfin claire.** Wattelier est une application locale et auto-hébergée qui réunit
les consommations Linky obtenues via Conso API, les prises Sonoff/eWeLink et Omajin/Tuya, les
coûts, les analyses et la mensualisation. Les données restent dans une base SQLite sur votre
machine.

> Wattelier ne remplace ni un dispositif de sécurité électrique ni la facture du fournisseur. Il
> n’existe aucun service Wattelier hébergé et aucune application iOS officielle à ce jour.

## Installer Wattelier sur Windows

Téléchargez l’un des deux fichiers x64 depuis la
[dernière release](https://github.com/N0thyTVOff/wattelier/releases) :

- `Wattelier-Setup-vX.Y.Z-x64.exe` installe l’application, les raccourcis et le démarrage automatique ;
- `Wattelier-Portable-vX.Y.Z-x64.exe` fonctionne sans installation et conserve ses données dans
  `Wattelier-data` à côté du programme.

Comparez le SHA-256 du fichier avec `SHA256SUMS.txt`. La première version peut ne pas être signée :
Windows SmartScreen affiche alors un avertissement malgré une somme correcte. Les détails, les
emplacements de données et la migration sont dans [INSTALLATION.md](INSTALLATION.md).

Au premier lancement, Wattelier peut importer l’ancien fichier `data/elec.db`. L’assistant permet
ensuite de choisir séparément Linky, eWeLink et Omajin, de configurer le contrat et de générer le
jeton à conserver pour les autres appareils.

## Fonctionnalités

- vue d’ensemble Signal et thèmes clair, sombre ou automatique ;
- consommation Linky quotidienne, courbe de charge et puissance maximale ;
- puissance des prises Sonoff en temps réel sur le LAN, historique et commande marche/arrêt ;
- prises Omajin OSP-FR-01 via Tuya Cloud : puissance, tension, courant et commande marche/arrêt ;
- vues par jour, appareil et période, heatmap, veilles, pics et projections ;
- tarifs Base, HP/HC, Tempo, EJP ou personnalisés, budget et échéancier ;
- connecteurs Linky/eWeLink/Omajin activables indépendamment et mode de démonstration ;
- export CSV, journal d’événements et API HTTP `/api/*` stable pour le futur client iOS ;
- serveur accessible sur le réseau local, protégé par un jeton ;
- application Windows avec zone de notification et collecte en arrière-plan.

La puissance instantanée affichée est celle des prises mesurées. Wattelier ne présente jamais
cette valeur comme la puissance globale du logement et n’additionne jamais les données Linky aux
données des prises.

## Exécuter depuis les sources

Prérequis : Node.js 22 et npm 10 ou ultérieur.

```bash
git clone https://github.com/N0thyTVOff/wattelier.git
cd wattelier
npm ci
npm run build
npm start
```

Ouvrez ensuite <http://localhost:3017>. Copiez `.env.example` vers `.env` uniquement si vous avez
besoin d’une configuration automatisée : les connecteurs peuvent être configurés depuis
l’interface.

| Variable             | Obligatoire       | Description                                     |
| -------------------- | ----------------- | ----------------------------------------------- |
| `EWELINK_EMAIL`      | Sonoff uniquement | Compte eWeLink dédié recommandé                 |
| `EWELINK_PASSWORD`   | Sonoff uniquement | Mot de passe eWeLink                            |
| `EWELINK_REGION`     | Non               | Région eWeLink, `eu` par défaut                 |
| `TUYA_ACCESS_ID`     | Omajin uniquement | Access ID du projet Cloud Tuya                  |
| `TUYA_ACCESS_SECRET` | Omajin uniquement | Access Secret du projet Cloud Tuya              |
| `TUYA_REGION`        | Non               | Centre Tuya, `eu` pour un compte français       |
| `TUYA_DEVICE_IDS`    | Omajin uniquement | IDs séparés par virgule, optionnellement nommés |
| `PORT`               | Non               | Port HTTP, `3017` par défaut                    |
| `HOST`               | Non               | Adresse d’écoute, `0.0.0.0`                     |
| `TRUST_PROXY`        | Non               | `1` derrière un reverse proxy                   |
| `DATA_DIR`           | Non               | Stockage persistant, `./data`                   |

La procédure d’association de l’OSP-FR-01 est détaillée dans
[docs/OMAJIN.md](docs/OMAJIN.md). Le numéro de série imprimé sur la prise n’est pas l’identifiant
Tuya demandé par Wattelier.

`.env`, les bases, journaux et archives sont ignorés par Git. Ne partagez jamais `elec.db` : ce
fichier peut contenir des identifiants et l’historique énergétique du logement.

## Développement et qualité

```bash
npm run dev
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
npm run test:e2e       # après : npx playwright install chromium
npm run desktop:dir   # paquet Windows non compressé
npm run desktop:build # installateur NSIS + portable
```

La CI agrège les contrôles dans le check obligatoire `CI`. L’architecture et les conventions sont
décrites dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Contributions et releases

Les issues publiques documentées sont bienvenues. La création et la fusion des PR restent
réservées au mainteneur ; consultez [CONTRIBUTING.md](CONTRIBUTING.md).

Release Please maintient une Release PR groupée. Sa fusion crée la release, puis le workflow
Windows construit et contrôle l’installateur et l’édition portable. Il joint aussi leurs sommes
SHA-256 et les métadonnées minimales nécessaires à la détection des mises à jour. L’édition
installée peut télécharger et installer automatiquement une nouvelle version si l’utilisateur
l’active dans les réglages ; l’édition portable prévient et ouvre le téléchargement manuel. Les
archives de sources générées automatiquement par GitHub restent disponibles pour l’AGPL.

## Sécurité et licence

Signalez les vulnérabilités avec le
[formulaire privé GitHub](https://github.com/N0thyTVOff/wattelier/security/advisories/new), jamais
dans une issue publique. Consultez [SECURITY.md](SECURITY.md).

Copyright © 2026 N0thyTVOff. Wattelier est distribué sous
[GNU Affero General Public License v3.0 uniquement](LICENSE), sans garantie. Consultez
[NOTICE](NOTICE) pour l’adresse officielle du dépôt.
