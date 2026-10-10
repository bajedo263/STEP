import { useCallback, useEffect, useImperativeHandle, useMemo, useState, type Ref } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';
import type { LatLng } from 'react-native-maps';

type Point = { x: number; y: number };

/** Zone tactile autour de chaque poignée, bien plus large que le rond. */
const HIT_SIZE = 96;
/** En dessous de ce déplacement, le doigt a juste touché la poignée : rien ne change. */
const MIN_DRAG = 8;

export type LoopHandlesOverlayHandle = {
  /** Replace les poignées après un mouvement de la carte. */
  update: () => void;
};

/**
 * Poignées de boucle posées au-dessus de la carte plutôt que dans la carte : on les attrape
 * et on les glisse d'un seul geste, sans appui long (le glisser natif des marqueurs l'impose
 * sur iPhone). Au lâcher, la position à l'écran est convertie en coordonnées.
 */
export function LoopHandlesOverlay({
  ref,
  mapRef,
  handles,
  disabled,
  color,
  onDrop,
}: {
  ref: Ref<LoopHandlesOverlayHandle>;
  mapRef: React.RefObject<MapView | null>;
  handles: LatLng[];
  disabled: boolean;
  color: string;
  onDrop: (index: number, coordinate: LatLng) => void;
}) {
  const [points, setPoints] = useState<Point[] | null>(null);

  const update = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    Promise.all(handles.map((handle) => map.pointForCoordinate(handle)))
      .then(setPoints)
      .catch(() => {});
  }, [mapRef, handles]);

  useImperativeHandle(ref, () => ({ update }), [update]);
  useEffect(update, [update]);

  const drop = useCallback(
    (index: number, point: Point) => {
      mapRef.current
        ?.coordinateForPoint(point)
        .then((coordinate) => onDrop(index, coordinate))
        .catch(() => update());
    },
    [mapRef, onDrop, update]
  );

  if (!points || points.length !== handles.length) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {points.map((point, index) => (
        <DraggableHandle
          key={index}
          index={index}
          point={point}
          disabled={disabled}
          color={color}
          onDrop={drop}
        />
      ))}
    </View>
  );
}

function DraggableHandle({
  index,
  point,
  disabled,
  color,
  onDrop,
}: {
  index: number;
  point: Point;
  disabled: boolean;
  color: string;
  onDrop: (index: number, point: Point) => void;
}) {
  const [offset] = useState(() => new Animated.ValueXY());

  // La poignée revient à sa place quand sa position (ou la carte) change.
  useEffect(() => {
    offset.setValue({ x: 0, y: 0 });
  }, [offset, point.x, point.y]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        // La carte ne reprend pas le geste en cours de route.
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gesture) => offset.setValue({ x: gesture.dx, y: gesture.dy }),
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < MIN_DRAG) {
            offset.setValue({ x: 0, y: 0 });
            return;
          }
          onDrop(index, { x: point.x + gesture.dx, y: point.y + gesture.dy });
        },
        onPanResponderTerminate: () => offset.setValue({ x: 0, y: 0 }),
      }),
    [disabled, offset, onDrop, index, point.x, point.y]
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      accessible
      accessibilityLabel="Point de passage : faites-le glisser vers la rue où vous voulez passer"
      style={[
        styles.hitArea,
        {
          left: point.x - HIT_SIZE / 2,
          top: point.y - HIT_SIZE / 2,
          opacity: disabled ? 0.5 : 1,
          transform: offset.getTranslateTransform(),
        },
      ]}>
      <View style={[styles.handle, { borderColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    position: 'absolute',
    width: HIT_SIZE,
    height: HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // Fond presque invisible : une vue entièrement transparente peut ne pas capter le doigt.
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  handle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 4,
    backgroundColor: '#FFFFFF',
  },
});
