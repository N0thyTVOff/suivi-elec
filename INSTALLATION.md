# Installation

## Prérequis

- Node.js 22 et npm 10 ou ultérieur ;
- une machine qui reste allumée pour une collecte continue ;
- facultatif : un compte eWeLink et/ou un accès Conso API autorisé pour votre Linky.

## Installation standard

```bash
npm ci
copy .env.example .env   # Windows ; utilisez cp sous macOS/Linux
npm run build
npm start
```

L'application écoute sur `0.0.0.0:3017` et est donc joignable sur le réseau local. Au premier
démarrage, l'assistant demande les sources d'énergie et le tarif, puis affiche une seule fois un
jeton d'accès. Conservez-le dans un gestionnaire de mots de passe : il est nécessaire pour connecter
un autre navigateur ou l'application mobile.

Le jeton protège l'API, mais HTTP ne chiffre pas le trafic. Pour un accès depuis Internet, utilisez
un VPN (par exemple Tailscale ou WireGuard) ou un reverse proxy HTTPS avec un certificat valide.
Ne redirigez jamais directement le port `3017` sur la box Internet.

Sous Windows, autorisez si nécessaire Node.js ou le port TCP 3017 dans le pare-feu uniquement pour
le profil **Privé**. Les adresses locales utilisables sont affichées dans Réglages.

## Sonoff/eWeLink

Activez le connecteur pendant l'onboarding ou dans Réglages, puis saisissez le compte eWeLink.
`EWELINK_EMAIL`, `EWELINK_PASSWORD` et `EWELINK_REGION` peuvent aussi être fournis dans `.env`.
Les prises compatibles sont découvertes après redémarrage. Le premier accès cloud récupère des
clés stockées dans `data/elec.db`, puis la collecte LAN peut continuer localement.

## Linky

Activez la collecte horaire dans votre espace Enedis, obtenez un consentement et un jeton auprès
de Conso API, puis activez le connecteur et saisissez le jeton et le PRM. Ces informations restent dans la
base locale. Elles ne doivent jamais être jointes à une issue ou copiées dans Git.

## Application mobile et API distante

L'application mobile devra enregistrer une fois l'URL HTTPS du serveur et le jeton affiché pendant
l'onboarding. Les clients natifs envoient `Authorization: Bearer <jeton>` à chaque appel `/api/*`.
Le dashboard web échange ce jeton contre un cookie `HttpOnly` afin de sécuriser aussi le flux temps
réel. Le jeton peut être renouvelé depuis Réglages ; l'ancien est alors immédiatement révoqué.

## Démarrage automatique sous Windows

Exécutez `install-startup.ps1` pour créer une tâche planifiée à l'ouverture de session. Le script
`uninstall-startup.ps1` la supprime. Vérifiez d'abord qu'une seule instance fonctionne ; deux
connexions simultanées peuvent perturber eWeLink. Les journaux se trouvent dans `data/`.

## Mise à jour

Arrêtez le serveur, sauvegardez `data/` hors du dépôt, puis exécutez :

```bash
git pull --ff-only
npm ci
npm run build
npm start
```
