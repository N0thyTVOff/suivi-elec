# Métadonnées App Store — français

## Sous-titre

Votre énergie, enfin claire

## Texte promotionnel

Consultez votre serveur Wattelier depuis votre iPhone ou iPad, à la maison comme à distance.

## Description

Wattelier vous permet de retrouver les données de votre serveur énergétique auto-hébergé dans une
application native, claire et respectueuse de votre vie privée.

Suivez la consommation quotidienne de la maison, observez en direct la puissance de vos prises,
consultez l’historique et la projection de facturation, puis pilotez les appareils compatibles.

Vos mesures restent sur votre propre serveur. Wattelier ne crée aucun compte central, n’intègre
aucune publicité et ne revend aucune donnée. La connexion est établie directement en HTTPS à l’aide
du jeton généré par votre serveur.

Fonctionnalités principales :

- vue d’ensemble de la consommation et des coûts ;
- puissance en temps réel des prises connectées ;
- historique sur 7, 30 ou 90 jours ;
- distinction explicite entre la maison et les prises ;
- commande marche/arrêt des appareils compatibles ;
- projection de facturation et échéancier ;
- thèmes clair, sombre ou automatique ;
- interface adaptée à l’iPhone et à l’iPad ;
- mode démonstration disponible sans serveur.

Wattelier nécessite un serveur Wattelier auto-hébergé pour afficher vos propres données. L’accès
distant nécessite une adresse HTTPS atteignable.

## Mots-clés

énergie,électricité,consommation,linky,prises,domotique,auto-hébergé,suivi,facture

## Notes pour App Review

Aucun compte utilisateur n’est requis. Sur l’écran initial, choisissez « Découvrir avec des données
de démonstration » afin d’accéder immédiatement à toutes les vues et de tester les commandes sans
serveur externe. Le mode réel se connecte au serveur auto-hébergé de l’utilisateur via un jeton
`wtl1_…` qui contient une URL HTTPS et un secret d’accès.

La consommation « Maison » et la consommation « Prises » sont volontairement présentées comme deux
séries distinctes : les prises sont un sous-ensemble de la maison et ne sont jamais additionnées à
la mesure globale.
