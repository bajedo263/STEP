import { PoiCard } from '@/components/poi-sheet';
import { PoiColor, VisitedPoiColor } from '@/constants/theme';
import { POI_KIND_LABELS, type RoutePoi } from '@/lib/pois';

/**
 * Le lieu devant lequel on passe, en bas de l'écran pendant le trajet. Glisser vers le haut
 * déplie la fiche pour lire l'introduction de l'article ; vers le bas, la replie puis la ferme.
 */
export function PoiBanner({
  poi,
  status,
  onClose,
}: {
  poi: RoutePoi;
  status: 'new' | 'visited' | 'here';
  onClose: () => void;
}) {
  const heading = {
    new: 'Nouveau lieu découvert !',
    visited: 'Déjà découvert',
    here: 'À voir ici',
  }[status];
  return (
    <PoiCard
      poi={poi}
      label={`${heading} · ${POI_KIND_LABELS[poi.kind]}`}
      color={status === 'here' ? PoiColor : VisitedPoiColor}
      placement="bottom"
      onClose={onClose}
    />
  );
}
