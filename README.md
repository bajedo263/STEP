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
supabase/         configuration et migrations de la base
```

## Feuille de route du MVP

1. ✅ Initialiser le projet (Expo, Supabase, CI, EAS)
2. ✅ Connexion par email et profil (Apple et Google à venir)
3. Pas du jour via HealthKit et Health Connect
4. Carte Mapbox et géolocalisation
5. Mode Boucle via OpenRouteService
6. Suivi de trajet en arrière-plan et écran de fin
7. Statistiques de base
8. Bêta fermée (TestFlight, test interne Google Play)
