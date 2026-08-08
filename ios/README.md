# Wattelier pour iOS et iPadOS

Client SwiftUI natif du serveur auto-hébergé Wattelier. L’application ne réplique pas les données
dans un cloud tiers : elle se connecte directement à l’URL HTTPS contenue dans le jeton `wtl1_…`.

## Fonctionnalités

- connexion sécurisée par jeton, conservé dans le trousseau iOS ;
- vue d’ensemble avec séparation stricte de la maison et des prises ;
- puissance en temps réel des prises, historique et graphiques ;
- état et commande marche/arrêt des appareils compatibles ;
- suivi de facturation et réglages clair, sombre ou système ;
- mode démonstration hors ligne pour découvrir l’app et pour App Review ;
- interface iPhone par onglets et interface iPad par barre latérale.

## Développement

Le projet Xcode est généré afin d’éviter les conflits dans les fichiers `.pbxproj` :

```sh
cd ios
brew install xcodegen
xcodegen generate
open Wattelier.xcodeproj
```

La cible minimale est iOS 17. Le bundle est `com.n0thytvoff.Wattelier`. La CI GitHub compile et
teste l’app sur `macos-26` avec Xcode 26 ; aucun Mac local n’est nécessaire pour cette validation.

## Livraison sans Mac

Le workflow **iOS · TestFlight** archive, signe et transmet l’app à App Store Connect. Sa
configuration détaillée est dans [docs/APP_STORE_IOS.md](../docs/APP_STORE_IOS.md).

Ne placez jamais une clé Apple, un certificat, un jeton Wattelier ou une URL privée dans le dépôt.
