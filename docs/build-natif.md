# Version installée (TestFlight)

Expo Go reste utilisable comme avant : l'app y garde le podomètre seul, le suivi écran allumé et
la connexion par email. Ce qui suit ne s'active que dans la version installée.

| Fonction | Expo Go | Version installée |
| --- | --- | --- |
| Pas du jour | Podomètre du téléphone | Apple Santé / Health Connect (montre comprise, sans doublon, saisies manuelles exclues) + podomètre en direct |
| Suivi d'un trajet | Écran allumé | Téléphone en poche (indicateur bleu sur iPhone, notification sur Android) |
| Connexion Apple | Non | Oui, une fois activée (voir plus bas) |
| Connexion Google | Oui, une fois activée | Oui, une fois activée |

## Première bêta iPhone, depuis le téléphone

Une fois le compte Apple Developer actif :

1. **App Store Connect › Apps › +** : nouvelle app « STEP », identifiant de bundle
   `com.bajedo263.step`, langue principale français.
2. **App Store Connect › Utilisateurs et accès › Intégrations › Clés d'API** : générer une clé
   (accès « Admin »), télécharger le fichier `.p8` (une seule fois possible) et noter l'ID de la
   clé et l'ID de l'émetteur.
3. **GitHub › Settings › Secrets and variables › Actions**, ajouter :
   - `ASC_API_KEY_P8` : le contenu du fichier `.p8`, en entier ;
   - `ASC_KEY_ID` et `ASC_ISSUER_ID` ;
   - `APPLE_TEAM_ID` : l'ID d'équipe (developer.apple.com › Membership).
4. **GitHub › Actions › Build bêta › Run workflow**, plateforme `ios`, envoi coché. EAS crée les
   certificats, construit l'app et l'envoie sur TestFlight. Le suivi est sur expo.dev.
5. **TestFlight** : s'ajouter comme testeur interne, puis installer STEP depuis l'app TestFlight.

Si EAS refuse de créer les certificats sans ordinateur, il faudra lancer une fois
`npx eas-cli@latest build -p ios` depuis un Mac ou un PC ; les builds suivants repartent du
workflow.

## Activer la connexion Apple

1. Supabase › Authentication › Sign In / Providers › **Apple** : activer, et mettre
   `com.bajedo263.step` dans « Client IDs ». Aucune clé secrète n'est nécessaire pour la
   connexion native.
2. Dans `.env`, ajouter `EXPO_PUBLIC_AUTH_APPLE=1` (Claude peut le faire), puis publier.

## Activer la connexion Google

1. Google Cloud Console › API et services › Identifiants : créer un « ID client OAuth »
   de type **Application Web**, avec comme URI de redirection autorisée
   `https://nkrkxmieqdkugtpsoufc.supabase.co/auth/v1/callback`.
2. Supabase › Authentication › Sign In / Providers › **Google** : activer, coller l'ID client et
   le code secret.
3. Supabase › Authentication › URL Configuration › Redirect URLs : ajouter `step://**` (version
   installée) et `exp://**` (Expo Go).
4. Dans `.env`, ajouter `EXPO_PUBLIC_AUTH_GOOGLE=1`, puis publier. Cela marche aussi dans Expo Go.

## À savoir

- **Mises à jour EAS Update** : elles arrivent sur la version installée tant que ses modules
  natifs n'ont pas changé. Après l'ajout d'un module natif, augmenter `version` dans `app.json`
  et refaire un build : sinon une mise à jour pourrait appeler du code absent de l'app installée.
- **Android** : un APK peut déjà être construit sans compte Apple (workflow, plateforme
  `android`). Les pas viennent de Health Connect s'il est installé.
- **Restent à faire** : le widget (il demande un « App Group », donc le compte Apple) et la
  suppression de compte dans l'app, exigée par Apple avant une sortie publique sur l'App Store.
