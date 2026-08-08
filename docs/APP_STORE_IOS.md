# Publier Wattelier sur l’App Store sans Mac

## Application enregistrée

| Champ                 | Valeur                     |
| --------------------- | -------------------------- |
| Nom                   | Wattelier                  |
| Bundle ID             | `com.n0thytvoff.Wattelier` |
| Apple ID              | `6799259363`               |
| UGS                   | `Wattelier-ios`            |
| App ID Prefix indiqué | `9P86WD9PWT`               |

L’App ID Prefix n’est pas toujours le Team ID. Relevez le **Team ID** dans Apple Developer >
Membership et utilisez cette valeur pour le secret `APPLE_TEAM_ID`.

## 1. Créer une clé App Store Connect d’équipe

Dans App Store Connect > Utilisateurs et accès > Intégrations > API App Store Connect, créez une
clé **d’équipe** avec le rôle Admin, puis téléchargez une seule fois le fichier `.p8`. Une clé
individuelle ne peut pas gérer le provisioning requis par cette chaîne. Le titulaire du compte et
les administrateurs peuvent utiliser la signature Apple gérée dans le cloud sans certificat local.

## 2. Ajouter les secrets GitHub

Dans GitHub > Settings > Environments, créez l’environnement `app-store`. Ajoutez-y :

| Secret                         | Contenu                                   |
| ------------------------------ | ----------------------------------------- |
| `APPLE_TEAM_ID`                | Team ID Apple Developer                   |
| `APP_STORE_CONNECT_API_KEY_ID` | identifiant court de la clé API           |
| `APP_STORE_CONNECT_ISSUER_ID`  | Issuer ID de la clé API                   |
| `APP_STORE_CONNECT_API_KEY_P8` | contenu complet du fichier `AuthKey_….p8` |

La clé est injectée uniquement sur le runner macOS éphémère et n’est jamais ajoutée à l’artefact ni
au dépôt. Aucun certificat `.p12` n’est requis : Xcode utilise la signature Apple gérée dans le cloud.

## 3. Envoyer un build à TestFlight

Dans Actions > **iOS · TestFlight** > Run workflow, saisissez la version et un numéro de build
jamais utilisé. Le workflow :

1. génère le projet avec XcodeGen ;
2. utilise la signature automatique Apple dans le cloud avec la clé API ;
3. archive Wattelier ;
4. signe et transmet directement le build à App Store Connect.

La première exécution peut prendre plusieurs minutes avant que le build apparaisse dans TestFlight.
Apple effectue ensuite son traitement et peut demander de répondre à la question sur le chiffrement ;
l’app déclare ne pas utiliser de chiffrement non exempté.

## 4. Fiche App Store et revue

- URL de confidentialité : utilisez la version publique de `PRIVACY.md` sur le dépôt ou une page
  dédiée stable.
- Accès de revue : indiquez qu’aucun compte n’est requis et que le bouton **Découvrir avec des
  données de démonstration** donne accès à toutes les vues sans serveur privé.
- Accès réseau local : l’autorisation sert uniquement à joindre un serveur Wattelier du même réseau.
- L’accès distant nécessite une adresse HTTPS atteignable, par exemple via Tailscale Serve.
- Les captures doivent être réalisées à partir du mode démonstration, sans données personnelles.

Le workflow prépare TestFlight mais ne soumet pas automatiquement la version à la revue publique :
la fiche, les captures, les déclarations de confidentialité et le bouton **Soumettre pour examen**
restent sous votre contrôle dans App Store Connect.
