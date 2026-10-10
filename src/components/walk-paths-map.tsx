import { StyleSheet } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WalkPath } from '@/hooks/use-walk-paths';
import { regionForCoordinates } from '@/lib/loop';

/** Carte de tous ses trajets, superposés. */
export function WalkPathsMap({ paths }: { paths: WalkPath[] }) {
  const theme = useTheme();
  const region = regionForCoordinates(
    paths.flatMap((path) => path.points),
    1.2
  );
  if (!region) return null;
  return (
    <MapView
      style={styles.map}
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
