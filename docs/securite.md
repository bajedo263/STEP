# Sécurité de STEP

Repères pour les audits réguliers. Règle d'or : la clé publiable est dans l'app, donc **tout ce
que la base autorise au rôle `authenticated` est accessible à n'importe quel utilisateur**, pas
seulement ce que l'app affiche.

## À vérifier à chaque audit

- Chaque table de `public` a la RLS activée, et chaque politique filtre sur `auth.uid()`.
- Un `revoke` sur une colonne ne sert à rien si le droit est accordé sur la table : retirer le
  droit de table puis accorder colonne par colonne (voir `profiles`).
- Les fonctions `security definer` ont `set search_path = ''`, n'acceptent pas d'identifiant
  d'utilisateur qui permettrait de lire les données d'un autre, et sont retirées à `public, anon`
  (et à `authenticated` si elles sont internes). Supabase rend toute nouvelle fonction appelable
  par `anon` et `authenticated`.
- Les RPC ne renvoient d'un autre utilisateur que son pseudo et ce qui est montré dans l'app
  (pas l'email, pas les tracés, pas la taille ni le poids).
- Les Edge Functions vérifient la session ; la clé `service_role` ne sert que côté serveur, avec
  l'identifiant tiré du jeton, jamais du corps de la requête.
- Aucun secret dans `.env`, `app.json` ou le code : seules l'URL et la clé publiable y sont.

## Limites connues (triche, pas fuite de données)

Les pas (`daily_steps`), les trajets (`walks`, dont `conquers`), les défis réussis et la position
envoyée à `record_poi_visit` viennent de l'app : un utilisateur qui appelle l'API lui-même peut
les inventer et fausser ligues, duels, badges et Conquête. Il ne peut pas toucher aux données des
autres. Les gels offerts (`user_metadata.gift_freezes`) sont modifiables par l'utilisateur.
Y remédier demandera une vérification côté serveur (HealthKit / Health Connect, plausibilité des
tracés).

## Réglages du tableau de bord Supabase (Authentication)

- Confirmation d'email activée.
- Mot de passe de 8 caractères au moins, et protection contre les mots de passe divulgués.
