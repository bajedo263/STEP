import { useEffect, useMemo, useState } from 'react';

import { useAreaPois } from '@/hooks/use-route-pois';
import type { LatLng } from '@/lib/loop';
import { mergePois, nearbyPoi, type RoutePoi } from '@/lib/pois';
import { supabase } from '@/lib/supabase';

/**
 * Pendant la marche : le lieu devant lequel on passe, et les lieux découverts depuis le départ.
 * Passer à moins de 50 m d'un lieu l'enregistre comme visité (vérifié côté serveur).
 */
export function usePoiDiscovery(plannedPois: RoutePoi[], position: LatLng | null | undefined) {
  const areaPois = useAreaPois(position);
  const all = useMemo(() => mergePois(plannedPois, areaPois), [plannedPois, areaPois]);
  const here = nearbyPoi(all, position);
  const [discovered, setDiscovered] = useState<RoutePoi[]>([]);

  const hereId = here?.id;
  useEffect(() => {
    if (!here || here.dbId === null || here.visited || !position || !supabase) return;
    if (discovered.some((poi) => poi.id === here.id)) return;
    let cancelled = false;
    supabase
      .rpc('record_poi_visit', {
        p_poi_id: here.dbId,
        p_latitude: position.latitude,
        p_longitude: position.longitude,
      })
      .then(({ data }) => {
        if (!cancelled && data === true) {
          setDiscovered((current) =>
            current.some((poi) => poi.id === here.id) ? current : [...current, { ...here, visited: true }]
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // On n'enregistre qu'une fois par lieu, quand on arrive à sa hauteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereId]);

  const discoveredIds = new Set(discovered.map((poi) => poi.id));
  return {
    here,
    /** Vrai si le lieu vient d'être découvert pendant cette marche. */
    hereIsNew: here !== null && discoveredIds.has(here.id),
    discovered,
    isVisited: (poi: RoutePoi) => poi.visited || discoveredIds.has(poi.id),
  };
}
