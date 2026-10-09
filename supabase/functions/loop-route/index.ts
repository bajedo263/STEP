// Calcule une boucle à pied qui part et revient au point donné, via OpenRouteService (ou le
// service de secours d'OpenStreetMap s'il ne répond pas).
// Appelée par l'app (écran Carte) avec la session de l'utilisateur connecté.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { ROUTE_DETOUR_FACTOR } from '../_shared/destination.ts';
import {
  closestRoute,
  isCloseEnough,
  MAX_LOOP_ATTEMPTS,
  nextRequestedLength,
  parseLoopRequest,
  seedBearing,
  triangleWaypoints,
  type LatLng,
  type LoopRoute,
} from '../_shared/loop.ts';
import { bestPoiNear, type Poi } from '../_shared/pois.ts';
import { orsRoundTrip, routeThrough } from '../_shared/routing.ts';
import { fetchWikipediaPoisNear } from '../_shared/wikipedia.ts';

/** Écart accepté pour une boucle par des points d'intérêt avant de se rabattre sur une boucle libre. */
const POI_LOOP_TOLERANCE = 0.2;

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
    console.error('loop-route', error);
    return json({ error: 'Le calcul de boucle ne répond pas. Réessayez dans un instant.' }, 502);
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
  if (!apiKey) return json({ error: 'Le calcul de boucle n’est pas encore configuré.' }, 503);

  const parsed = parseLoopRequest(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { start, distanceM, seed } = parsed.value;

  // 1. Une boucle départ → lieu A → lieu B → départ, pour que le trajet ait des choses à voir.
  const poiLoop = await loopThroughPois(apiKey, start, distanceM, seed);
  if (poiLoop && Math.abs(poiLoop.distanceM - distanceM) <= distanceM * POI_LOOP_TOLERANCE) {
    return json({ ...poiLoop, targetM: distanceM, seed });
  }

  // 2. Sinon, une boucle libre : celle d'OpenRouteService, ou un triangle s'il ne répond pas.
  const routes: (LoopRoute & { via: Poi[] })[] = poiLoop ? [poiLoop] : [];
  let requested = distanceM;
  for (let attempt = 0; attempt < MAX_LOOP_ATTEMPTS; attempt++) {
    const route =
      (await orsRoundTrip(start, requested, seed, apiKey)) ??
      (await routeThrough(
        [start, ...triangleWaypoints(start, requested / ROUTE_DETOUR_FACTOR, seedBearing(seed)), start],
        apiKey
      ));
    if (!route) break;
    routes.push({ ...route, via: [] });
    if (isCloseEnough(distanceM, route.distanceM)) break;
    requested = nextRequestedLength(distanceM, requested, route.distanceM);
  }

  const best = closestRoute(distanceM, routes);
  if (!best) return json({ error: 'Aucune boucle trouvée depuis ce point.' }, 422);
  return json({ ...best, targetM: distanceM, seed });
}

/**
 * Boucle triangulaire dont les deux sommets sont « aimantés » sur les lieux les plus intéressants
 * proches des sommets idéaux. Corrigée jusqu'à 3 fois pour tomber sur la bonne distance.
 * Renvoie null s'il n'y a aucun lieu remarquable dans le coin.
 */
async function loopThroughPois(
  apiKey: string,
  start: LatLng,
  targetM: number,
  seed: number
): Promise<(LoopRoute & { via: Poi[] }) | null> {
  const bearing = seedBearing(seed);
  let requested = targetM / ROUTE_DETOUR_FACTOR;
  const radiusM = Math.min(800, Math.max(150, (requested / 3) * 0.35));
  const candidates = await fetchWikipediaPoisNear(
    triangleWaypoints(start, requested, bearing),
    radiusM * 1.5
  );
  if (candidates.length === 0) return null;

  const routes: (LoopRoute & { via: Poi[] })[] = [];
  for (let attempt = 0; attempt < MAX_LOOP_ATTEMPTS; attempt++) {
    const [a, b] = triangleWaypoints(start, requested, bearing);
    const viaA = bestPoiNear(candidates, a, radiusM);
    const viaB = bestPoiNear(
      candidates.filter((poi) => poi.id !== viaA?.id),
      b,
      radiusM
    );
    if (!viaA && !viaB) break;

    const route = await routeThrough([start, viaA?.coords ?? a, viaB?.coords ?? b, start], apiKey);
    if (!route) break;
    routes.push({ ...route, via: [viaA, viaB].filter((poi): poi is Poi => poi !== null) });
    if (isCloseEnough(targetM, route.distanceM)) break;
    requested = nextRequestedLength(targetM, requested, route.distanceM);
  }
  return closestRoute(targetM, routes);
}
