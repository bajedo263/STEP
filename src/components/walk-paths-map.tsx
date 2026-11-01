import { StyleSheet } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WalkPath } from '@/hooks/use-walk-paths';
import { regionForCoordinates } from '@/lib/loop';
import { focusPaths } from '@/lib/walk-art';

/** Carte de tous ses trajets, superposés. */
export function WalkPathsMap({ paths }: { paths: WalkPath[] }) {
  const theme = useTheme();
  // Cadrée sur le cœur de ses trajets : un trajet de vacances ne fait pas partir de toute la France.
  const region = regionForCoordinates(
    focusPaths(paths.map((path) => path.points)).flat(),
    1.2
  );
  if (!region) return null;
  return (
    <MapView
      style={styles.map}
      accessibilityLabel={`Carte de vos ${paths.length} trajet${paths.length > 1 ? 's' : ''}`}
      initialRegion={region}
      pitchEnabled={false}
      rotateEnabled={false}
      toolbarEnabled={false}>
      {paths.map((path) => (
        <Polyline
          key={path.id}
          coordinates={path.points}
          strokeColor={theme.tint}
          strokeWidth={3}
          lineCap="round"
          lineJoin="round"
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 320,
    borderRadius: Radius.tile,
    overflow: 'hidden',
  },
});
