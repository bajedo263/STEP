import { Polygon, Polyline } from 'react-native-maps';

import { withAlpha } from '@/constants/theme';
import { type Territory } from '@/lib/conquest';
import { type LatLng } from '@/lib/loop';

/** Clé stable tirée du contenu : un bloc qui change de forme est recréé, pas réutilisé. */
export function territoryKey(owner: string, territory: Territory): string {
  const [first] = territory.outline;
  return `${owner}-${first?.latitude}-${first?.longitude}-${territory.outline.length}-${territory.cellCount}`;
}

/**
 * Un bloc de cases : remplissage par un polygone sans trait, contour par des lignes fermées
 * par-dessus. Apple Maps omettait certains côtés du trait d'un polygone (tout le bord bas d'un
 * bloc en escalier, par exemple), alors qu'une ligne les dessine tous.
 */
export function TerritoryShape({
  territory,
  color,
  fill,
  dashed = false,
}: {
  territory: Territory;
  color: string;
  fill: number;
  dashed?: boolean;
}) {
  const rings = [territory.outline, ...territory.holes];
  return (
    <>
      {/* Couleurs toujours explicites en rgba() : en hexadécimal, Apple Maps dessinait du noir. */}
      <Polygon
        coordinates={territory.outline}
        holes={territory.holes}
        fillColor={withAlpha(color, fill)}
        strokeColor="rgba(0, 0, 0, 0)"
        strokeWidth={0}
      />
      {rings.map((ring, index) => (
        <Polyline
          key={index}
          coordinates={closed(ring)}
          strokeColor={withAlpha(color, 1)}
          strokeWidth={2}
          lineJoin="miter"
          // Les rivaux en pointillés : lisibles sans distinguer les couleurs.
          lineDashPattern={dashed ? [4, 4] : undefined}
        />
      ))}
    </>
  );
}

function closed(ring: LatLng[]): LatLng[] {
  return ring.length > 0 ? [...ring, ring[0]] : ring;
}
