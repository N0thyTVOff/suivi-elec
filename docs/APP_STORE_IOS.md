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
clé **d’équipe** avec le rôle App Manager, puis téléchargez une seule fois le fichier `.p8`. Une clé
individuelle ne peut pas gérer le provisioning requis par cette chaîne.

## 2. Ajouter les secrets GitHub

Dans GitHub > Settings > Environments, créez l’environnement `app-store`. Ajoutez-y :

| Secret                                    | Contenu                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `APPLE_TEAM_ID`                           | Team ID Apple Developer                                |
| `APP_STORE_CONNECT_API_KEY_ID`            | identifiant court de la clé API                        |
| `APP_STORE_CONNECT_ISSUER_ID`             | Issuer ID de la clé API                                |
| `APP_STORE_CONNECT_API_KEY_P8`            | contenu complet du fichier `AuthKey_….p8`              |
| `APPLE_DISTRIBUTION_CERTIFICATE_P12`      | certificat Apple Distribution `.p12`, encodé en Base64 |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | mot de passe du `.p12`                                 |

Sous PowerShell, encodez le certificat sans afficher son contenu :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('AppleDistribution.p12')) | Set-Clipboard
```

Le certificat doit inclure sa clé privée. Les secrets sont injectés uniquement sur le runner macOS
éphémère et ne sont jamais ajoutés à l’artefact ni au dépôt.

## 3. Envoyer un build à TestFlight

Dans Actions > **iOS · TestFlight** > Run workflow, saisissez la version et un numéro de build
jamais utilisé. Le workflow :

1. génère le projet avec XcodeGen ;
2. utilise la signature automatique Apple avec le certificat et la clé API ;
3. archive et exporte `Wattelier.ipa` ;
4. transmet l’IPA à App Store Connect ;
5. conserve l’IPA signée 14 jours comme artefact privé de l’action.

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
