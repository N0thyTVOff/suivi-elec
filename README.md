# ⚡ Suivi Élec

[![CI](https://github.com/N0thyTVOff/suivi-elec/actions/workflows/ci.yml/badge.svg)](https://github.com/N0thyTVOff/suivi-elec/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/N0thyTVOff/suivi-elec?display_name=tag)](https://github.com/N0thyTVOff/suivi-elec/releases)
[![Licence AGPL-3.0](https://img.shields.io/github/license/N0thyTVOff/suivi-elec)](LICENSE)
[![Issues](https://img.shields.io/github/issues/N0thyTVOff/suivi-elec)](https://github.com/N0thyTVOff/suivi-elec/issues)

Tableau de bord auto-hébergé pour suivre localement la consommation électrique d'un logement.
Il réunit les mesures Linky obtenues via Conso API, les prises Sonoff/eWeLink, les coûts, les
statistiques et la mensualisation. Les données sont conservées sur la machine dans SQLite.

> Le projet ne remplace pas un dispositif de sécurité électrique ni une facture fournisseur.
> Il n'existe actuellement aucun service hébergé et aucune application iOS officielle.

## Fonctionnalités

- consommation Linky quotidienne, courbe de charge et puissance maximale ;
- puissance Sonoff en temps réel sur le LAN, historique et commande marche/arrêt ;
- vues par jour, appareil, période, heatmap, veille, pics et projections ;
- tarifs, budget mensuel et suivi des échéances ;
- mode de démonstration, export CSV et journal d'événements ;
- interface responsive accessible sur le réseau local.

Une future application iOS est envisagée, mais ne fait pas partie de la version actuelle.

## Démarrage rapide

Prérequis : Node.js 22, npm 10 ou ultérieur, Windows, macOS ou Linux. Les scripts de démarrage
automatique fournis sont spécifiques à Windows.

```bash
git clone https://github.com/N0thyTVOff/suivi-elec.git
cd suivi-elec
npm ci
npm run build
npm start
```

Ouvrez ensuite <http://localhost:3017>. Le mode démo permet de découvrir l'interface sans compte
ni matériel. Consultez [INSTALLATION.md](INSTALLATION.md) pour Linky, Sonoff et Windows.

## Configuration

Copiez `.env.example` vers `.env`, puis renseignez localement les variables utiles :

| Variable           | Obligatoire       | Description                      |
| ------------------ | ----------------- | -------------------------------- |
| `EWELINK_EMAIL`    | Sonoff uniquement | Compte eWeLink, idéalement dédié |
| `EWELINK_PASSWORD` | Sonoff uniquement | Mot de passe eWeLink             |
| `EWELINK_REGION`   | Non               | Région eWeLink, `eu` par défaut  |
| `PORT`             | Non               | Port HTTP, `3017` par défaut     |

Le jeton Conso API et le PRM se saisissent dans Réglages. `.env`, `data/`, les journaux et les
archives sont ignorés par Git. Ne partagez jamais la base SQLite : elle peut contenir un jeton
Linky, un PRM, des clés d'appareils et l'historique énergétique du logement.

## Développement et qualité

```bash
npm run dev           # Express :3017 + Vite :5173
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
npm run check         # tous les contrôles locaux hors audit
```

La CI exécute les contrôles indépendamment, puis les agrège dans le check obligatoire `CI`.
L'architecture et les conventions sont détaillées dans
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Contribution et releases

Les issues documentées sont bienvenues. La politique actuelle réserve la création et la fusion
des PR au mainteneur ; une proposition externe depuis un fork reste techniquement possible sur
GitHub, mais elle ne donne aucun droit d'écriture ni accès aux secrets. Voir
[CONTRIBUTING.md](CONTRIBUTING.md).

Release Please maintient **une seule Release PR groupée**. Chaque PR fonctionnelle est fusionnée
séparément dans `main`, puis met à jour `chore(main): release X.Y.Z`. Tant que le mainteneur ne
fusionne pas manuellement cette Release PR, aucun tag, aucune GitHub Release et aucun déploiement
de production ne sont créés. Aucun déploiement n'est configuré pour ce projet local.

Le mainteneur doit ajouter une fois le secret GitHub Actions `RELEASE_PLEASE_TOKEN` selon
[CONTRIBUTING.md](CONTRIBUTING.md). Sa valeur n'est jamais nécessaire dans la configuration locale.

## Sécurité et confidentialité

Signalez les vulnérabilités avec le
[formulaire privé GitHub](https://github.com/N0thyTVOff/suivi-elec/security/advisories/new), jamais
dans une issue publique. Les limites du modèle local et la procédure sont décrites dans
[SECURITY.md](SECURITY.md).

## Licence

Copyright © 2026 N0thyTVOff. Distribué sous licence
[GNU Affero General Public License v3.0 uniquement](LICENSE). Consultez [NOTICE](NOTICE) pour
l'adresse du dépôt officiel. Le logiciel est fourni sans garantie.
