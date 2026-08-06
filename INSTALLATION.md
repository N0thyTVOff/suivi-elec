# Installation de Wattelier

## Choisir une édition Windows

La page [Releases](https://github.com/N0thyTVOff/wattelier/releases) contient deux éditions x64.

### Installateur

Exécutez `Wattelier-Setup-vX.Y.Z-x64.exe`, choisissez le dossier d’installation, puis lancez
Wattelier depuis le menu Démarrer ou le raccourci du Bureau.

- les données sont stockées dans `%APPDATA%\Wattelier\app-data` ;
- le démarrage à l’ouverture de session est activé par défaut avec une fenêtre cachée ;
- l’option peut être désactivée dans **Réglages → Application Windows** ;
- fermer la fenêtre masque Wattelier dans la zone de notification sans arrêter la collecte ;
- **Quitter Wattelier** dans la zone de notification arrête réellement le serveur.

La désinstallation retire le programme et les raccourcis, mais ne supprime jamais les données. Vous
pouvez supprimer manuellement `%APPDATA%\Wattelier` seulement après avoir sauvegardé ce que vous
souhaitez conserver.

### Portable

Placez `Wattelier-Portable-vX.Y.Z-x64.exe` dans un dossier où vous avez le droit d’écrire, puis
exécutez-le. Wattelier crée `Wattelier-data` dans ce même dossier. Déplacez toujours l’exécutable et
ce dossier ensemble.

Le démarrage automatique est volontairement indisponible en mode portable. Ne lancez pas deux
copies de Wattelier avec les mêmes appareils : l’application bloque une seconde instance sur le PC.

## Vérifier le téléchargement

Téléchargez aussi `SHA256SUMS.txt`, puis utilisez PowerShell :

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Wattelier-Setup-v2.0.0-x64.exe
```

La valeur doit être identique à la ligne correspondante du fichier de sommes. Si aucun certificat
de signature n’est configuré pour la première release, SmartScreen peut afficher « Windows a
protégé votre ordinateur ». Après avoir vérifié la source GitHub et le SHA-256, utilisez
**Informations complémentaires → Exécuter quand même**. Les futures releases pourront être
signées sans changer le format de données.

## Premier lancement et migration

Lorsqu’aucune base n’existe, Wattelier propose avant le démarrage du serveur :

1. une nouvelle installation ;
2. l’import du fichier `data\elec.db` d’une ancienne installation ;
3. l’annulation.

L’import vérifie l’intégrité SQLite et copie la base dans le nouvel emplacement sans modifier la
source. Conservez tout de même une sauvegarde de l’ancien dossier.

L’onboarding demande ensuite les connecteurs, le contrat et le tarif. Le jeton d’accès affiché à la
fin ne l’est qu’une fois : conservez-le dans un gestionnaire de mots de passe.

## Réseau local et accès distant

Wattelier écoute sur `0.0.0.0:3017`. Si Windows le demande, autorisez Wattelier dans le pare-feu
uniquement sur le profil **Privé**. Les adresses utilisables par un autre appareil sont affichées
dans **Réglages → Accès depuis un autre appareil**.

Le jeton protège l’API, mais HTTP ne chiffre pas le trafic. Pour un accès depuis Internet, utilisez
un VPN comme Tailscale ou WireGuard, ou un reverse proxy HTTPS avec un certificat valide. Ne
redirigez jamais directement le port `3017` de votre box vers Wattelier.

Les clients natifs envoient `Authorization: Bearer <jeton>` à chaque appel `/api/*`. Le dashboard
web échange le jeton contre un cookie `HttpOnly`. Un renouvellement depuis Réglages révoque
immédiatement l’ancienne valeur.

## Configurer les sources

### Sonoff/eWeLink

Activez eWeLink pendant l’onboarding ou dans Réglages, puis renseignez un compte idéalement dédié.
Le premier accès cloud récupère les clés nécessaires ; Wattelier privilégie ensuite la collecte LAN
lorsqu’elle est disponible.

### Linky

Activez la collecte horaire dans votre espace Enedis, obtenez un consentement et un jeton auprès de
Conso API, puis renseignez ce jeton et le PRM. Ces informations restent dans la base locale et ne
doivent jamais être jointes à une issue GitHub.

## Installation depuis les sources

Sur Windows, macOS ou Linux avec Node.js 22 et npm 10 :

```bash
npm ci
npm run build
npm start
```

Le stockage par défaut est `data/elec.db`. Les scripts PowerShell historiques restent disponibles
pour démarrer cette édition Node à l’ouverture de session ; ils ne sont pas nécessaires avec
l’installateur Electron.

Pour mettre à jour l’édition source, arrêtez le serveur, sauvegardez `data/`, puis exécutez :

```bash
git pull --ff-only
npm ci
npm run build
npm start
```
