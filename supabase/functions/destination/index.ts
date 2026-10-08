// Mode Destination : recherche de lieux et itinéraire à pied, via OpenRouteService.
// Appelée par l'app (écran Carte) avec la session de l'utilisateur connecté.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  MAX_DESTINATION_M,
  orsAutocompleteParams,
  orsDirectionsBody,
  parseDestinationRequest,
  parseOrsPlaces,
} from '../_shared/destination.ts';
import { parseOrsResponse } from '../_shared/loop.ts';

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

  const response = await fetch(`${ORS}/v2/directions/foot-walking/geojson`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(orsDirectionsBody(request.start, request.end)),
  });
  if (!response.ok) {
    console.error('OpenRouteService directions', response.status, await response.text());
    return json({ error: NOT_FOUND }, response.status === 404 ? 422 : 502);
  }
  const route = parseOrsResponse(await response.json());
  if (!route) return json({ error: NOT_FOUND }, 422);
  if (route.distanceM > MAX_DESTINATION_M) {
    return json({ error: 'Ce lieu est trop loin pour y aller à pied (plus de 25 km).' }, 422);
  }
  return json(route);
});
