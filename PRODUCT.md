# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

- Serveur auto-hébergé : Node.js, Express et SQLite.
- Interface bureau : React/Vite dans Electron.
- Client iOS/iPadOS : SwiftUI natif, construit et testé avec Xcode 26 sur GitHub Actions `macos-26`.

## Users

Wattelier s'adresse aux particuliers qui auto-hébergent leur suivi électrique et veulent consulter
leur consommation ou piloter leurs prises depuis leur domicile comme à distance. L'application
iOS doit rester utile d'une seule main sur iPhone et exploiter les grandes largeurs sur iPad.

## Product Purpose

Wattelier rassemble les mesures électriques disponibles sur le serveur personnel de l'utilisateur,
les rend compréhensibles en temps réel et dans la durée, et permet de piloter les prises compatibles.
Le succès signifie que l'utilisateur comprend rapidement sa situation énergétique sans céder ses
données à un service centralisé.

## Positioning

Le serveur, la base et les identifiants des fournisseurs restent chez l'utilisateur. Les clients
bureau, Web et iOS lisent la même API privée au lieu de recopier les données dans un cloud Wattelier.

## Operating Context

- Premier accès iOS par collage du jeton de connexion `wtl1_…` créé sur le serveur.
- Accès distant HTTPS, notamment au travers de Tailscale Serve.
- Consultation fréquente et brève de la puissance des prises, des consommations et des coûts.
- Consultation détaillée de l'historique, des appareils et de la facturation.
- Pilotage marche/arrêt des prises depuis les appareils autorisés.
- Mode de démonstration intégré pour découvrir l'application et permettre la revue App Store sans
  donner accès à un serveur privé.

## Capabilities and Constraints

- Les données Linky de la maison et les mesures des prises sont comparées, jamais additionnées.
- La puissance instantanée reste présentée comme celle des prises tant qu'aucune mesure globale en
  temps réel n'existe.
- Les sources réelles, manuelles et de démonstration restent identifiables et séparées.
- Le jeton d'accès est enregistré uniquement dans le trousseau iOS et transmis par HTTPS avec
  `Authorization: Bearer`.
- L'application ne crée aucun compte Wattelier et ne collecte aucune donnée pour le mainteneur.
- Identifiant de bundle : `com.n0thytvoff.Wattelier`.
- App ID Prefix / équipe Apple : `9P86WD9PWT`.
- Identifiant App Store Connect : `6799259363` ; UGS : `Wattelier-ios`.
- Langue initiale : français.

## Brand Commitments

Le nom Wattelier, le monogramme W traversé par une impulsion, le design Signal bleu électrique sur
surfaces bleu nuit et l'accent rose réservé aux alertes sont communs aux plateformes. Sur iOS, la
marque s'exprime sans remplacer les conventions SwiftUI, SF Symbols, Dynamic Type et les matériaux
système.

## Evidence on Hand

- Identité vectorielle : `web/public/brand/`.
- Interface et états de référence : `web/src/`.
- API de référence : `server/index.js` et `server/stats.js`.
- Contrat de jeton autonome : `server/connection-token.js`.
- Licence publique : AGPL-3.0, `LICENSE` et `NOTICE`.

## Product Principles

1. Garder les données et les secrets sous le contrôle de l'utilisateur.
2. Nommer exactement la source et la fraîcheur de chaque mesure.
3. Rendre le direct lisible en quelques secondes, puis permettre l'analyse sans simplification
   trompeuse.
4. Traduire la même identité dans les conventions natives de chaque plateforme.
5. Prévoir les états hors ligne, serveur inaccessible, jeton révoqué et absence de données comme des
   parcours normaux.

## Accessibility & Inclusion

L'application prend en charge Dynamic Type, VoiceOver, le contraste accru, Réduire les animations,
les thèmes clair/sombre/automatique et des zones tactiles d'au moins 44 points.
