import { StyleSheet, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WalkPath } from '@/hooks/use-walk-paths';
import { projectPaths } from '@/lib/walk-art';

const WIDTH = 320;
const HEIGHT = 320;

/** Sur le web, pas de carte : les trajets dessinés seuls. */
export function WalkPathsMap({ paths }: { paths: WalkPath[] }) {
  const theme = useTheme();
  const lines = projectPaths(
    paths.map((path) => path.points),
    WIDTH,
    HEIGHT,
    16
  );
  return (
    <View style={[styles.frame, { backgroundColor: theme.backgroundElement }]}>
      <Svg width={WIDTH} height={HEIGHT}>
        {lines.map((points, index) => (
          <Polyline key={index} points={points} fill="none" stroke={theme.tint} strokeWidth={2} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', borderRadius: Radius.tile, overflow: 'hidden' },
});
