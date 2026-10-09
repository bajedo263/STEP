import { StyleSheet, Text, View } from 'react-native';
import { Marker, Polyline, type LatLng } from 'react-native-maps';

import { PoiColor, VisitedPoiColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Poi } from '@/lib/pois';

/**
 * Tracé lisible sur n'importe quel fond de carte : un liseré clair sous un trait de couleur.
 * `faded` sert pour le trajet prévu, que le trait du chemin parcouru vient recouvrir.
 */
export function RouteLine({
  coordinates,
  faded = false,
  width = 6,
}: {
  coordinates: LatLng[];
  faded?: boolean;
  width?: number;
}) {
  const theme = useTheme();
  return (
    <>
      <Polyline
        coordinates={coordinates}
        strokeColor={faded ? '#FFFFFF99' : '#FFFFFF'}
        strokeWidth={width + 4}
        lineJoin="round"
        lineCap="round"
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={faded ? `${theme.tint}80` : theme.tint}
        strokeWidth={width}
        lineJoin="round"
        lineCap="round"
      />
    </>
  );
}

/**
 * Repère discret d'un lieu : une pastille orange, verte une fois découvert.
 * Sans suivi des changements de vue, l'appelant met `visited` dans la clé pour recréer le repère.
 */
export function PoiMarker({ poi, visited, onPress }: { poi: Poi; visited: boolean; onPress: () => void }) {
  return (
    <Marker
      coordinate={poi.coords}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      onPress={onPress}>
      <View
        style={styles.hitArea}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${poi.title}${visited ? ', déjà découvert' : ''}`}>
        <View style={[styles.dot, { backgroundColor: visited ? VisitedPoiColor : PoiColor }]}>
          {visited ? <View style={styles.check} /> : <View style={styles.center} />}
        </View>
      </View>
    </Marker>
  );
}

/** Plusieurs lieux trop proches pour l'échelle affichée : une pastille avec leur nombre. */
export function PoiClusterMarker({
  coords,
  count,
  onPress,
}: {
  coords: LatLng;
  count: number;
  onPress: () => void;
}) {
  return (
    <Marker
      coordinate={coords}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      onPress={onPress}>
      <View
        style={styles.hitArea}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${count} lieux, toucher pour rapprocher`}>
        <View style={[styles.cluster, { backgroundColor: PoiColor }]}>
          <Text style={styles.clusterText}>{count}</Text>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  cluster: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  clusterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 800,
  },
  center: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  // Coche dessinée avec deux bords, sans dépendre d'une police d'icônes.
  check: {
    width: 5,
    height: 9,
    marginTop: -2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
});
