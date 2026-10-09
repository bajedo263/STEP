// Points d'intérêt le long d'un tracé (boucle, itinéraire) ou autour d'une position (marche),
// issus des articles Wikipédia géolocalisés. Chaque quartier est chargé une seule fois puis gardé en base, avec
// son nombre de lieux : c'est ce total qui sert aux statistiques « vus sur le total ».
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { parsePoint } from '../_shared/destination.ts';
import type { LatLng } from '../_shared/loop.ts';
import {
  poisAlongPath,
  wikipediaBboxParams,
  zoneBbox,
  zoneKey,
  zoneOf,
  zonesAlongPath,
  zonesAround,
  type Poi,
  type PoiKind,
  type Zone,
} from '../_shared/pois.ts';
import { fetchWikipediaPoisOrNull } from '../_shared/wikipedia.ts';

const MAX_PATH_POINTS = 5_000;
/** Quartiers chargés en même temps auprès de Wikipédia. */
const PARALLEL_ZONES = 6;
const MAX_ZONES = 60;

type StoredPoi = Poi & { dbId: number | null; visited: boolean };

type PoiRow = {
  id: number;
  osm_id: string;
  name: string;
  category: PoiKind;
  description: string | null;
  wikipedia_url: string | null;
  score: number;
  latitude: number;
  longitude: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const zonesFilter = (zones: Zone[]) => zones.map(({ x, y }) => `and(x.eq.${x},y.eq.${y})`).join(',');
const poiZonesFilter = (zones: Zone[]) =>
  zones.map(({ x, y }) => `and(zone_x.eq.${x},zone_y.eq.${y})`).join(',');

function polygonWkt(zone: Zone): string {
  const { south, west, north, east } = zoneBbox(zone);
  return `SRID=4326;POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

/** Lieux d'un quartier, gardés seulement s'ils sont bien dedans ; null si Wikipédia n'a pas répondu. */
async function fetchZone(zone: Zone): Promise<Poi[] | null> {
  const found = await fetchWikipediaPoisOrNull(wikipediaBboxParams(zoneBbox(zone)));
  return found && found.filter((poi) => zoneKey(zoneOf(poi.coords)) === zoneKey(zone));
}

/** Charge depuis Wikipédia les quartiers pas encore en base. */
async function ensureZones(admin: SupabaseClient, zones: Zone[]): Promise<void> {
  const { data: known, error } = await admin.from('poi_zones').select('x, y').or(zonesFilter(zones));
  if (error) throw error;
  const knownKeys = new Set((known ?? []).map(zoneKey));
  const missing = zones.filter((zone) => !knownKeys.has(zoneKey(zone)));

  for (let i = 0; i < missing.length; i += PARALLEL_ZONES) {
    const chunk = missing.slice(i, i + PARALLEL_ZONES);
    const results = await Promise.all(chunk.map(fetchZone));
    // Un quartier sans réponse sera réessayé la prochaine fois plutôt qu'enregistré vide.
    const loaded = chunk.flatMap((zone, index) => {
      const pois = results[index];
      return pois ? [{ zone, pois }] : [];
    });
    if (loaded.length === 0) continue;

    const rows = loaded.flatMap(({ zone, pois }) =>
      pois.map((poi) => ({
        osm_id: poi.id,
        name: poi.title,
        category: poi.kind,
        description: poi.description,
        wikipedia_url: poi.wikipediaUrl,
        score: poi.score,
        latitude: poi.coords.latitude,
        longitude: poi.coords.longitude,
        zone_x: zone.x,
        zone_y: zone.y,
        location: `SRID=4326;POINT(${poi.coords.longitude} ${poi.coords.latitude})`,
      }))
    );
    if (rows.length > 0) {
      const { error: poisError } = await admin.from('pois').upsert(rows, { onConflict: 'osm_id' });
      if (poisError) throw poisError;
    }
    const { error: zonesError } = await admin.from('poi_zones').upsert(
      loaded.map(({ zone, pois }) => ({
        x: zone.x,
        y: zone.y,
        poi_count: pois.length,
        bbox: polygonWkt(zone),
      })),
      { onConflict: 'x,y' }
    );
    if (zonesError) throw zonesError;
  }
}

/** Lieux en base des quartiers donnés, avec ceux que l'utilisateur a déjà visités. */
async function storedPois(admin: SupabaseClient, zones: Zone[], userId: string): Promise<StoredPoi[]> {
  const { data, error } = await admin
    .from('pois')
    .select('id, osm_id, name, category, description, wikipedia_url, score, latitude, longitude')
    .or(poiZonesFilter(zones))
    .returns<PoiRow[]>();
  if (error) throw error;
  const rows = data ?? [];

  const visited = new Set<number>();
  if (rows.length > 0) {
    const { data: visits, error: visitsError } = await admin
      .from('poi_visits')
      .select('poi_id')
      .eq('user_id', userId)
      .in(
        'poi_id',
        rows.map((row) => row.id)
      );
    if (visitsError) throw visitsError;
    for (const visit of visits ?? []) visited.add(visit.poi_id);
  }

  return rows.map((row) => ({
    id: row.osm_id,
    dbId: row.id,
    kind: row.category,
    title: row.name,
    description: row.description,
    coords: { latitude: row.latitude, longitude: row.longitude },
    wikipediaUrl: row.wikipedia_url,
    score: row.score,
    visited: visited.has(row.id),
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: auth, error: authError } = token
    ? await supabase.auth.getUser(token)
    : { data: { user: null }, error: null };
  if (authError || !auth.user) return json({ error: 'Connexion requise.' }, 401);
  const userId = auth.user.id;

  const body = (await req.json().catch(() => null)) as { path?: unknown; around?: unknown } | null;
  const around = parsePoint(body?.around);
  const raw = Array.isArray(body?.path) ? body.path.slice(0, MAX_PATH_POINTS) : [];
  const path = raw.map(parsePoint).filter((point): point is LatLng => point !== null);
  if (!around && path.length < 2) return json({ error: 'Tracé ou position manquant.' }, 400);

  const zones = (around ? zonesAround(around) : zonesAlongPath(path)).slice(0, MAX_ZONES);
  const pick = (pois: StoredPoi[]) => (around ? pois : poisAlongPath(pois, path));

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    await ensureZones(admin, zones);
    return json({ pois: pick(await storedPois(admin, zones, userId)) });
  } catch (error) {
    // Base indisponible : lieux en direct, sans visites.
    console.error('Cache des points d’intérêt', error);
    const live = (await Promise.all(zones.map(fetchZone))).flatMap((pois) => pois ?? []);
    return json({ pois: pick(live.map((poi) => ({ ...poi, dbId: null, visited: false }))) });
  }
});
