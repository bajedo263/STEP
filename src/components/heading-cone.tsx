import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';

/** Taille du cône : son centre est posé sur la position. */
const SIZE = 120;
const CENTER = SIZE / 2;
const RADIUS = 56;
/** Demi-ouverture du faisceau, en degrés. */
const HALF_ANGLE = 32;

const rad = (deg: number) => (deg * Math.PI) / 180;
const edgeX = (deg: number) => CENTER + RADIUS * Math.sin(rad(deg));
const edgeY = (deg: number) => CENTER - RADIUS * Math.cos(rad(deg));
const BEAM = [
  `M ${CENTER} ${CENTER}`,
  `L ${edgeX(-HALF_ANGLE)} ${edgeY(-HALF_ANGLE)}`,
  `A ${RADIUS} ${RADIUS} 0 0 1 ${edgeX(HALF_ANGLE)} ${edgeY(HALF_ANGLE)}`,
  'Z',
].join(' ');

/**
 * Faisceau de direction, comme dans les applis de cartes : un éventail qui part du point bleu
 * vers l'avant du téléphone et s'estompe vers l'extérieur. `rotation` en degrés, 0 = haut de l'écran.
 */
export function HeadingCone({ color, rotation }: { color: string; rotation: number }) {
  return (
    <View style={[styles.box, { transform: [{ rotate: `${rotation}deg` }] }]} pointerEvents="none">
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <RadialGradient
            id="beam"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fx={CENTER}
            fy={CENTER}
            gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity={0.6} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={BEAM} fill="url(#beam)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
  },
});
