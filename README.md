# STEP

Application mobile qui aide à atteindre 10 000 pas par jour grâce à des trajets générés sur mesure (Boucle, Destination), un mode Conquête entre amis, des points d'intérêt à collectionner et des statistiques détaillées.

Le cadrage complet (besoins, architecture, plan) est dans le [document de cadrage](https://claude.ai/code/artifact/03f0918a-d647-4753-909d-3e089ea47180).

## Stack

- **App** : React Native + Expo (SDK 57), TypeScript, Expo Router
- **Backend** : Supabase (Auth, Postgres + PostGIS, Edge Functions, Realtime)
- **Carte et itinéraires** : Mapbox, OpenRouteService (à venir)

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner l'URL et la clé du projet Supabase
npx expo start
```

Le podomètre, la localisation en arrière-plan et HealthKit ne fonctionnent pas dans Expo Go : il faudra un *development build* (`npx eas-cli@latest build --profile development`).

## Base de données

Les migrations sont dans `supabase/migrations`. Avec la [CLI Supabase](https://supabase.com/docs/guides/local-development) :

```bash
npx supabase start          # base locale (Docker requis)
npx supabase db push        # appliquer les migrations au projet distant
```

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
```

## Structure

```
src/app/          écrans (Expo Router) : accueil, carte, stats, profil
src/components/   composants partagés
src/lib/          logique métier (calcul pas → distance, client Supabase)
supabase/         configuration et migrations de la base
```

## Feuille de route du MVP

1. ✅ Initialiser le projet (Expo, Supabase, CI, EAS)
2. Authentification : email, Apple, Google ; profil
3. Pas du jour via HealthKit et Health Connect
4. Carte Mapbox et géolocalisation
5. Mode Boucle via OpenRouteService
6. Suivi de trajet en arrière-plan et écran de fin
7. Statistiques de base
8. Bêta fermée (TestFlight, test interne Google Play)
