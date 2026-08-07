# Sécurité

## Signaler une vulnérabilité

Utilisez exclusivement le
[signalement privé GitHub](https://github.com/N0thyTVOff/wattelier/security/advisories/new). Ne
publiez aucune faille, clé ou donnée personnelle dans une issue. Indiquez la version, l'impact, une
reproduction minimale anonymisée et une piste de correction. Un accusé de réception est visé sous
sept jours, sans garantie de délai de correction.

Seule la dernière version publiée est prise en charge.

## Modèle de sécurité

Wattelier est une application auto-hébergée sans comptes multi-utilisateurs. Les nouvelles
installations protègent toute l'API avec un jeton aléatoire ; seule son empreinte est stockée. Une
installation mise à niveau doit activer cette protection depuis Réglages avant tout accès distant.

Le jeton assure l'authentification, pas le chiffrement. L'application doit rester derrière un
pare-feu et ne doit pas être publiée directement en HTTP sur Internet : utilisez un VPN ou un
reverse proxy HTTPS. La base
`data/elec.db` et `.env` sont sensibles : ils peuvent contenir identifiants eWeLink, jeton et PRM
Linky, clés Sonoff, Access ID/Secret Tuya, identifiants d’appareils, habitudes de consommation et
noms d'appareils.

Utilisez si possible un compte eWeLink dédié et un projet Tuya limité aux appareils nécessaires,
protégez les sauvegardes, limitez les permissions du compte système et renouvelez tout secret
suspecté compromis. Les réponses API masquent les clés, les mots de passe et les jetons externes,
mais toute personne ayant accès à la machine peut lire les fichiers locaux. Le jeton serveur est
affiché uniquement à sa création ou à son renouvellement.
