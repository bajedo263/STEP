// Calcule une boucle à pied qui part et revient au point donné, via OpenRouteService.
// Appelée par l'app (écran Carte) avec la session de l'utilisateur connecté.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  closestRoute,
  isCloseEnough,
  MAX_LOOP_ATTEMPTS,
  nextRequestedLength,
  orsRoundTripBody,
  parseLoopRequest,
  parseOrsResponse,
  type LoopRoute,
} from '../_shared/loop.ts';

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  // Seuls les utilisateurs connectés peuvent consommer le quota OpenRouteService.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: auth, error: authError } = token
    ? await supabase.auth.getUser(token)
    : { data: { user: null }, error: null };
  if (authError || !auth.user) return json({ error: 'Connexion requise.' }, 401);

  const apiKey = Deno.env.get('ORS_API_KEY');
  if (!apiKey) return json({ error: 'Le calcul de boucle n’est pas encore configuré.' }, 503);

  const parsed = parseLoopRequest(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { start, distanceM, seed } = parsed.value;

  const routes: LoopRoute[] = [];
  let requested = distanceM;
  for (let attempt = 0; attempt < MAX_LOOP_ATTEMPTS; attempt++) {
    const response = await fetch(ORS_URL, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(orsRoundTripBody(start, requested, seed)),
    });
    if (!response.ok) {
      console.error('OpenRouteService', response.status, await response.text());
      // Une erreur sur une tentative de correction ne doit pas faire perdre une boucle déjà trouvée.
      if (routes.length > 0) break;
      const status = response.status === 404 ? 422 : 502;
      return json({ error: 'Aucune boucle trouvée depuis ce point.' }, status);
    }

    const route = parseOrsResponse(await response.json());
    if (!route) break;
    routes.push(route);
    if (isCloseEnough(distanceM, route.distanceM)) break;
    requested = nextRequestedLength(distanceM, requested, route.distanceM);
  }

  const best = closestRoute(distanceM, routes);
  if (!best) return json({ error: 'Aucune boucle trouvée depuis ce point.' }, 422);
  return json({ ...best, targetM: distanceM, seed });
});
