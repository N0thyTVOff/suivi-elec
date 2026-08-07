# Connecter une prise Omajin OSP-FR-01

L’OSP-FR-01 utilise la plateforme Tuya Smart Life. Wattelier passe par l’OpenAPI officielle Tuya
pour lire la puissance, la tension et le courant, puis pour commander la prise. La collecte se fait
toutes les 60 secondes et nécessite une connexion Internet. L’énergie horaire est calculée à partir
des mesures reçues ; Wattelier n’invente aucune consommation pendant une interruption de collecte.

## 1. Associer la prise à Smart Life

Un projet Tuya personnel ne peut pas prendre le contrôle du compte de l’application Omajin. Pour
autoriser Wattelier, réinitialisez la prise selon sa notice puis associez-la à l’application **Smart
Life** avec le même réseau Wi-Fi 2,4 GHz. Cette opération retire généralement la prise de
l’application Omajin.

## 2. Créer le projet Tuya

1. Créez un compte sur [Tuya Developer Platform](https://platform.tuya.com/).
2. Dans **Cloud > Development**, créez un projet de type **Smart Home** dans le centre de données
   **Central Europe** pour un compte français.
3. Autorisez au minimum les services **IoT Core**, **Authorization Token Management** et les API de
   contrôle d’appareils proposées par l’assistant du projet.
4. Dans **Devices > Link Tuya App Account**, affichez le QR code puis scannez-le depuis Smart Life.
   Accordez au projet les droits de lecture et d’écriture.
5. Dans **All Devices**, copiez le **Device ID** de la prise. Ce n’est ni le numéro de série imprimé
   sur la prise, ni son adresse MAC.
6. Dans l’onglet **Overview** du projet, copiez l’**Access ID** et l’**Access Secret**.

Tuya documente officiellement la
[liaison d’un compte Smart Life](https://developer.tuya.com/en/docs/iot/link-devices) et les
[centres de données](https://developer.tuya.com/en/docs/iot/api-request). Selon les conditions du
compte Tuya, l’accès Cloud peut être soumis à une période d’essai ou à un abonnement Tuya.

## 3. Configurer Wattelier

Dans **Réglages > Prises Omajin OSP-FR-01 (Tuya)** :

1. activez le connecteur ;
2. collez l’Access ID et l’Access Secret ;
3. conservez **Europe centrale (France)** sauf si le projet indique un autre centre ;
4. ajoutez un Device ID par ligne. Vous pouvez choisir un nom avec la forme
   `deviceId=Prise du salon` ;
5. enregistrez puis consultez **État des connexions**.

Les deux clés sont stockées uniquement dans la base SQLite locale et sont masquées dans toutes les
réponses HTTP. Ne les publiez jamais dans une issue, un journal ou une capture d’écran.

## Dépannage

- **Permission denied** : le compte Smart Life n’est pas lié au projet avec les droits d’écriture,
  ou les services API requis ne sont pas autorisés.
- **Device not found** : le Device ID ou le centre de données ne correspond pas au projet.
- **Aucune puissance** : vérifiez dans Tuya que la prise expose `cur_power`. Wattelier lit aussi
  `cur_voltage`, `cur_current`, `add_ele` et découvre automatiquement leur facteur d’échelle.
- **Commande non disponible** : le produit doit exposer `switch_1`, `switch` ou `switch_led` dans
  son jeu d’instructions Tuya.
