import { supabase } from '@/lib/supabase';

export type MissingPlace = { id: number; name: string; latitude: number; longitude: number };

/** Lieux d'un quartier pas encore découverts ; null si la lecture échoue. */
export async function fetchMissingPlaces(x: number, y: number): Promise<MissingPlace[] | null> {
  if (!supabase) return null;
  const [places, visits] = await Promise.all([
    supabase
      .from('pois')
      .select('id, name, latitude, longitude')
      .eq('zone_x', x)
      .eq('zone_y', y)
      .not('latitude', 'is', null)
      .returns<MissingPlace[]>(),
    supabase.from('poi_visits').select('poi_id').returns<{ poi_id: number }[]>(),
  ]);
  if (places.error || visits.error) return null;
  const seen = new Set((visits.data ?? []).map((visit) => visit.poi_id));
  return (places.data ?? []).filter((place) => !seen.has(place.id));
}
