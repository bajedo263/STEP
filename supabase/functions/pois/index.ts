// Points d'intérêt le long d'un tracé (boucle ou itinéraire), via OpenStreetMap.
// Appelée par l'app avec la session de l'utilisateur connecté.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { parsePoint } from '../_shared/destination.ts';
import { fetchOverpassPois } from '../_shared/overpass.ts';
import { overpassQuery, poisAlongPath, ROUTE_CORRIDOR_M, samplePath } from '../_shared/pois.ts';
import type { LatLng } from '../_shared/loop.ts';

const MAX_PATH_POINTS = 5_000;

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

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: auth, error: authError } = token
    ? await supabase.auth.getUser(token)
    : { data: { user: null }, error: null };
  if (authError || !auth.user) return json({ error: 'Connexion requise.' }, 401);

  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  const raw = Array.isArray(body?.path) ? body.path.slice(0, MAX_PATH_POINTS) : [];
  const path = raw.map(parsePoint).filter((point): point is LatLng => point !== null);
  if (path.length < 2) return json({ error: 'Tracé invalide.' }, 400);

  const sampled = samplePath(path);
  const pois = await fetchOverpassPois(overpassQuery(sampled, ROUTE_CORRIDOR_M));
  return json({ pois: poisAlongPath(pois, path) });
});
