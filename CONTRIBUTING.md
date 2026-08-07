# Contribuer

Les signalements et propositions documentés via les formulaires d'issues sont bienvenus. La
gouvernance actuelle prévoit que le mainteneur `@N0thyTVOff` réalise et fusionne les PR. Une PR
externe depuis un fork reste possible techniquement, mais n'accorde ni accès en écriture, ni accès
aux secrets, et ses workflows nécessitent l'approbation du mainteneur.

N'incluez jamais de jeton Linky, PRM réel, identifiant eWeLink, clé Sonoff, Access ID/Secret Tuya,
Device ID réel, base SQLite, journal ou capture contenant des données personnelles. Les
vulnérabilités doivent être signalées en privé selon [SECURITY.md](SECURITY.md).

## Cycle d'une modification

1. Associer la modification à une issue.
2. Créer une branche depuis `main`.
3. Ajouter ou adapter les tests.
4. Exécuter `npm run check` et `npm run audit`.
5. Ouvrir une PR dont le titre respecte Conventional Commits.
6. Attendre le check agrégé `CI`, résoudre les conversations, puis fusionner en squash.

## Releases groupées

Release Please ouvre et maintient une seule PR `chore(main): release X.Y.Z`. Les nouvelles PR
fusionnées enrichissent cette même Release PR et son changelog. Elle n'est jamais fusionnée
automatiquement. Sa fusion manuelle constitue l'autorisation explicite de créer le tag et la
GitHub Release. Aucun déploiement n'est configuré. Si la CI n'est pas automatiquement attachée au
commit d'une Release PR créée avec `GITHUB_TOKEN`, lancez manuellement le workflow CI sur sa
branche avant la fusion.

Le dépôt doit contenir un secret Actions `RELEASE_PLEASE_TOKEN`, créé avec un jeton finement limité
à ce seul dépôt et aux permissions **Contents: read/write**, **Pull requests: read/write** et
**Issues: read/write**. Enregistrez-le dans _Settings → Secrets and variables → Actions_ ; ne le
copiez jamais dans une issue, un fichier ou un journal. Ce choix permet de laisser désactivée
l'autorisation générale des workflows à approuver des PR et déclenche normalement la CI de la
Release PR.
