// Mode Destination : recherche de lieux et itinéraire à pied, via OpenRouteService.
// Appelée par l'app (écran Carte) avec la session de l'utilisateur connecté.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  detourWaypoint,
  MAX_DESTINATION_M,
  orsAutocompleteParams,
  orsDirectionsBody,
  orsViaBody,
  parseDestinationRequest,
  parseOrsPlaces,
  ROUTE_DETOUR_FACTOR,
} from '../_shared/destination.ts';
import {
  closestRoute,
  isCloseEnough,
  LOOP_TOLERANCE,
  MAX_LOOP_ATTEMPTS,
  nextRequestedLength,
  parseOrsResponse,
  type LoopRoute,
} from '../_shared/loop.ts';
import { fetchOverpassPois } from '../_shared/overpass.ts';
import { bestPoiNear, overpassQuery, type Poi } from '../_shared/pois.ts';

const ORS = 'https://api.openrouteservice.org';
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
  if (!apiKey) return json({ error: 'Le mode Destination n’est pas encore configuré.' }, 503);

  const parsed = parseDestinationRequest(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const request = parsed.value;

  if (request.action === 'search') {
    const params = orsAutocompleteParams(request.query, request.near);
    const response = await fetch(`${ORS}/geocode/autocomplete?${params}`, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) {
      console.error('OpenRouteService geocode', response.status, await response.text());
      return json({ error: 'La recherche de lieux ne répond pas.' }, 502);
    }
    return json({ places: parseOrsPlaces(await response.json()) });
  }

  const directions = async (body: unknown): Promise<LoopRoute | null> => {
    const response = await fetch(`${ORS}/v2/directions/foot-walking/geojson`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error('OpenRouteService directions', response.status, await response.text());
      return null;
    }
    return parseOrsResponse(await response.json());
  };

  const { start, end, targetM, seed } = request;
  const direct = await directions(orsDirectionsBody(start, end));
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
  const candidates = await fetchOverpassPois(
    overpassQuery([detourWaypoint(start, end, requested, side)], snapRadiusM * 1.5)
  );

  const routes: (LoopRoute & { via: Poi | null })[] = [];
  for (let attempt = 0; attempt < MAX_LOOP_ATTEMPTS; attempt++) {
    const target = detourWaypoint(start, end, requested, side);
    const via = bestPoiNear(candidates, target, snapRadiusM);
    const route = await directions(orsViaBody(start, via?.coords ?? target, end));
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
});
