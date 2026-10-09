// Mode Destination : recherche de lieux et itinéraire à pied, via OpenRouteService (ou les
// services de secours d'OpenStreetMap s'il ne répond pas).
// Appelée par l'app (écran Carte) avec la session de l'utilisateur connecté.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  detourWaypoint,
  MAX_DESTINATION_M,
  parseDestinationRequest,
  ROUTE_DETOUR_FACTOR,
} from '../_shared/destination.ts';
import {
  closestRoute,
  isCloseEnough,
  LOOP_TOLERANCE,
  MAX_LOOP_ATTEMPTS,
  nextRequestedLength,
  type LoopRoute,
} from '../_shared/loop.ts';
import { bestPoiNear, type Poi } from '../_shared/pois.ts';
import { routeThrough, searchPlaces } from '../_shared/routing.ts';
import { fetchWikipediaPoisNear } from '../_shared/wikipedia.ts';

const NOT_FOUND = 'Aucun itinéraire à pied trouvé vers ce lieu.';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Une panne imprévue renvoie quand même un message lisible par l'app.
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    console.error('destination', error);
    return json({ error: 'Le calcul d’itinéraire ne répond pas. Réessayez dans un instant.' }, 502);
  }
});

async function handle(req: Request): Promise<Response> {
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
  if (!apiKey) return json({ error: 'Le mode Destination n’est pas encore configuré.' }, 503);

  const parsed = parseDestinationRequest(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const request = parsed.value;

  if (request.action === 'search') {
    const places = await searchPlaces(request.query, request.near, apiKey);
    if (!places) return json({ error: 'La recherche de lieux ne répond pas.' }, 502);
    return json({ places });
  }

  const { start, end, targetM, seed } = request;
  const direct = await routeThrough([start, end], apiKey);
  if (!direct) return json({ error: NOT_FOUND }, 422);
  if (direct.distanceM > MAX_DESTINATION_M) {
    return json({ error: 'Ce lieu est trop loin pour y aller à pied (plus de 25 km).' }, 422);
  }

  // Le chemin direct suffit (ou dépasse) les pas à faire : on le garde.
  if (!targetM || direct.distanceM >= targetM * (1 - LOOP_TOLERANCE)) {
    return json({ ...direct, lengthened: false, via: null });
  }

  // Sinon on rallonge par un point de passage sur le côté, corrigé jusqu'à 3 fois.
  // Le point de passage est déplacé sur un lieu remarquable proche quand il y en a un :
  // le détour a alors une raison d'être.
  const side = seed % 2 === 0 ? 1 : -1;
  let requested = targetM / ROUTE_DETOUR_FACTOR;
  const snapRadiusM = Math.min(600, Math.max(200, requested * 0.1));
  const candidates = await fetchWikipediaPoisNear(
    [detourWaypoint(start, end, requested, side)],
    snapRadiusM * 1.5
  );

  const routes: (LoopRoute & { via: Poi | null })[] = [];
  for (let attempt = 0; attempt < MAX_LOOP_ATTEMPTS; attempt++) {
    const target = detourWaypoint(start, end, requested, side);
    const via = bestPoiNear(candidates, target, snapRadiusM);
    const route = await routeThrough([start, via?.coords ?? target, end], apiKey);
    if (!route) break;
    routes.push({ ...route, via });
    if (isCloseEnough(targetM, route.distanceM)) break;
    requested = nextRequestedLength(targetM, requested, route.distanceM);
  }

  const best = closestRoute(targetM, routes);
  if (!best || Math.abs(best.distanceM - targetM) >= Math.abs(direct.distanceM - targetM)) {
    return json({ ...direct, lengthened: false, via: null });
  }
  return json({ ...best, lengthened: true });
}
