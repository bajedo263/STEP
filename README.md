# STEP

Application mobile qui aide à atteindre 10 000 pas par jour grâce à des trajets générés sur mesure (Boucle, Destination), un mode Conquête entre amis, des points d'intérêt à collectionner et des statistiques détaillées.

Le cadrage complet (besoins, architecture, plan) est dans le [document de cadrage](https://claude.ai/code/artifact/03f0918a-d647-4753-909d-3e089ea47180).

## Stack

- **App** : React Native + Expo (SDK 57), TypeScript, Expo Router
- **Backend** : Supabase (Auth, Postgres + PostGIS, Edge Functions, Realtime)
- **Carte et itinéraires** : react-native-maps (Apple Plans sur iPhone, Google Maps sur Android), OpenRouteService pour le calcul des boucles

## Démarrer

```bash
npm install
npx expo start
```

L'URL et la clé publique du projet Supabase sont dans `.env`. Pour pointer vers un autre projet (local par exemple), les surcharger dans un `.env.local`, non versionné.

Le podomètre, la localisation en arrière-plan et HealthKit ne fonctionnent pas dans Expo Go : il faudra un *development build* (`npx eas-cli@latest build --profile development`).

## Tester sur téléphone sans ordinateur

Chaque fusion dans `main` est publiée sur Expo par l'action « Publication Expo » (secret `EXPO_TOKEN` requis). Sur le téléphone : installer Expo Go et s'y connecter avec le compte Expo, puis ouvrir le projet sur [expo.dev](https://expo.dev), onglet **Updates**, et ouvrir la dernière mise à jour dans Expo Go.

## Base de données

Les migrations sont dans `supabase/migrations`. Sans outil, on peut coller leur contenu dans l'éditeur SQL du tableau de bord Supabase, dans l'ordre. Avec la [CLI Supabase](https://supabase.com/docs/guides/local-development) :

```bash
npx supabase start          # base locale (Docker requis)
npx supabase db push        # appliquer les migrations au projet distant
```

## Fonctions serveur

`supabase/functions/loop-route` calcule les boucles du mode Boucle `supabase/functions/destination` cherche les lieux et l'itinéraire du mode Destination, et `supabase/functions/pois` trouve les points d'intérêt le long d'un tracé (API Overpass d'OpenStreetMap), avec [OpenRouteService](https://openrouteservice.org). Le workflow GitHub « Fonctions Supabase » les déploie à chaque fusion dans `main`. Il lui faut deux secrets dans les réglages GitHub du dépôt (Settings → Secrets and variables → Actions) :

- `SUPABASE_ACCESS_TOKEN` : jeton personnel créé sur supabase.com → Account → Access Tokens
- `ORS_API_KEY` : clé gratuite créée sur openrouteservice.org (Dashboard → Tokens)

La logique testable est dans `supabase/functions/_shared/`.

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
```

## Structure

```
src/app/          écrans (Expo Router) : connexion, puis onglets accueil, carte, stats, profil
src/providers/    contexte de session (AuthProvider)
src/components/   composants partagés
src/lib/          logique métier (calcul pas → distance, client Supabase)
supabase/         configuration, migrations de la base et fonctions Edge
```

## Feuille de route du MVP

1. ✅ Initialiser le projet (Expo, Supabase, CI, EAS)
2. ✅ Connexion par email et profil (Apple et Google à venir)
3. 🟡 Pas du jour : podomètre du téléphone (fait) ; HealthKit et Health Connect (à venir, version de test dédiée)
4. ✅ Carte et géolocalisation
5. ✅ Mode Boucle via OpenRouteService
6. 🟡 Suivi de trajet et écran de fin : écran ouvert (fait) ; arrière-plan (à venir, version de test dédiée)
7. ✅ Statistiques de base (7 derniers jours, derniers trajets)
8. Bêta fermée (TestFlight, test interne Google Play)

## Après le MVP

- ✅ Mode Destination (recherche de lieu et itinéraire à pied)
- ✅ Points d'intérêt le long du trajet (OpenStreetMap : plaques, monuments, œuvres) ; les détours passent par l'un d'eux
- Publicité, Premium
