import { useEffect, useMemo, useRef, useState } from 'react';

import { useAreaPois } from '@/hooks/use-route-pois';
import { mergePois, visitablePoi, type FixedPosition, type RoutePoi } from '@/lib/pois';
import { supabase } from '@/lib/supabase';

/**
 * Après un refus du serveur (position trop loin, réseau), on retente au plus toutes les 15 s,
 * et 4 fois par lieu : un lieu déjà visité lors d'une marche précédente est aussi refusé.
 */
const RETRY_MS = 15_000;
const MAX_ATTEMPTS = 4;

/**
 * Pendant la marche : le lieu devant lequel on passe, et les lieux découverts depuis le départ.
 * Passer à portée d'un lieu (50 m plus la marge du GPS) l'enregistre comme visité (vérifié côté
 * serveur). On regarde la position GPS brute et la trace lissée : celle-ci est posée sur le
 * trajet prévu, parfois sur le trottoir d'en face.
 */
export function usePoiDiscovery(plannedPois: RoutePoi[], positions: (FixedPosition | null | undefined)[]) {
  const position = positions.find((candidate) => candidate) ?? null;
  const areaPois = useAreaPois(position);
  const all = useMemo(() => mergePois(plannedPois, areaPois), [plannedPois, areaPois]);
  const reached = visitablePoi(all, positions);
  const here = reached?.poi ?? null;
  const [discovered, setDiscovered] = useState<RoutePoi[]>([]);
  const attempts = useRef(new Map<string, { count: number; at: number }>());
  const pending = useRef(new Set<string>());

  useEffect(() => {
    if (!reached || !supabase) return;
    const { poi, from } = reached;
    if (poi.dbId === null || poi.visited || discovered.some((item) => item.id === poi.id)) return;
    if (pending.current.has(poi.id)) return;
    const last = attempts.current.get(poi.id);
    if (last && (last.count >= MAX_ATTEMPTS || Date.now() - last.at < RETRY_MS)) return;
    attempts.current.set(poi.id, { count: (last?.count ?? 0) + 1, at: Date.now() });
    pending.current.add(poi.id);
    supabase
      .rpc('record_poi_visit', {
        p_poi_id: poi.dbId,
        p_latitude: from.latitude,
        p_longitude: from.longitude,
      })
      .then(
        ({ data }) => {
          pending.current.delete(poi.id);
          if (data === true) {
            setDiscovered((current) =>
              current.some((item) => item.id === poi.id) ? current : [...current, { ...poi, visited: true }]
            );
          }
        },
        () => pending.current.delete(poi.id)
      );
    // On réessaie à chaque nouvelle position tant que le lieu est à portée et pas encore enregistré.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here?.id, reached?.from.latitude, reached?.from.longitude]);

  const discoveredIds = new Set(discovered.map((poi) => poi.id));
  return {
    /** Lieux du trajet et des quartiers traversés. */
    all,
    here,
    /** Vrai si le lieu vient d'être découvert pendant cette marche. */
    hereIsNew: here !== null && discoveredIds.has(here.id),
    discovered,
    isVisited: (poi: RoutePoi) => poi.visited || discoveredIds.has(poi.id),
  };
}
