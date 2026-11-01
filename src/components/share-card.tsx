import * as Sharing from 'expo-sharing';
import { type ComponentRef, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Polyline, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useWalkPaths } from '@/hooks/use-walk-paths';
import { focusPaths, projectPaths } from '@/lib/walk-art';

export type ShareStat = { value: string; label: string };

/** Taille de la carte à l'écran ; l'image partagée fait 1080 × 1350 (format portrait Instagram). */
const CARD_WIDTH = 320;
const CARD_HEIGHT = 400;
const ART_HEIGHT = 210;
/** Couleurs fixes : l'image est la même en mode clair et sombre. */
const INK = '#F5F5FA';
const INK_SOFT = '#B9B6E8';
const LINE = '#8F88FF';

/** Image de partage : ses trajets dessinés et quelques chiffres, aux couleurs de STEP. */
export function ShareCard({
  title,
  subtitle,
  stats,
  paths,
}: {
  title: string;
  subtitle: string;
  stats: ShareStat[];
  paths: { latitude: number; longitude: number }[][];
}) {
  // Les trajets loin de chez soi rétréciraient tout le dessin en un point.
  const lines = projectPaths(focusPaths(paths), CARD_WIDTH - 2 * Spacing.four, ART_HEIGHT, 8);
  return (
    <View style={styles.card} collapsable={false}>
      <Svg style={StyleSheet.absoluteFill} width={CARD_WIDTH} height={CARD_HEIGHT}>
        <Defs>
          <LinearGradient id="fond" x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor="#2A21B8" />
            <Stop offset="1" stopColor="#0E0C2C" />
          </LinearGradient>
        </Defs>
        <Rect width={CARD_WIDTH} height={CARD_HEIGHT} fill="url(#fond)" />
      </Svg>
      <Text style={styles.brand}>STEP</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.art}>
        {lines.length > 0 ? (
          <Svg width={CARD_WIDTH - 2 * Spacing.four} height={ART_HEIGHT}>
            {lines.map((points, index) => (
              <Polyline
                key={`halo-${index}`}
                points={points}
                fill="none"
                stroke={LINE}
                strokeOpacity={0.3}
                strokeWidth={9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {lines.map((points, index) => (
              <Polyline
                key={index}
                points={points}
                fill="none"
                stroke={INK}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        ) : (
          <Text style={styles.empty}>Vos trajets se dessineront ici.</Text>
        )}
      </View>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type SheetContent = { onClose: () => void; title: string; subtitle: string; stats: ShareStat[] };

/**
 * Fenêtre d'aperçu puis partage de l'image (Instagram, WhatsApp…). Les tracés depuis `since`
 * ne sont chargés qu'à l'ouverture ; `paths` les fournit directement (le trajet qu'on vient de finir).
 */
export function ShareSheet({
  visible,
  since = null,
  paths,
  ...content
}: SheetContent & {
  visible: boolean;
  /** Début de la période dessinée, ou null pour tous les trajets. */
  since?: string | null;
  paths?: { latitude: number; longitude: number }[][];
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={content.onClose}>
      {!visible ? null : paths ? (
        <ShareSheetContent {...content} paths={paths} />
      ) : (
        <SavedPathsShareSheet {...content} since={since} />
      )}
    </Modal>
  );
}

function SavedPathsShareSheet({ since, ...content }: SheetContent & { since: string | null }) {
  const paths = useWalkPaths(since);
  return (
    <ShareSheetContent
      {...content}
      paths={
        paths === null ? null : paths === 'unavailable' ? [] : paths.map((path) => path.points)
      }
    />
  );
}

function ShareSheetContent({
  onClose,
  title,
  subtitle,
  stats,
  paths,
}: SheetContent & {
  /** Null pendant le chargement. */
  paths: { latitude: number; longitude: number }[][] | null;
}) {
  const card = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setSharing(true);
    setError(null);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setError('Le partage n’est pas disponible sur cet appareil.');
        return;
      }
      // JPEG : quelques centaines de Ko au lieu d'un PNG de plus de 10 Mo, et un nom lisible.
      const uri = await captureRef(card, {
        format: 'jpg',
        quality: 0.9,
        width: 1080,
        height: 1350,
        result: 'tmpfile',
        fileName: shareFileName(title),
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
        dialogTitle: title,
      });
    } catch {
      setError('L’image n’a pas pu être créée. Réessayez.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.backdrop}>
      <ThemedView style={styles.sheet}>
        <ThemedText type="smallBold">Partager</ThemedText>
        {paths === null ? (
          <View style={styles.placeholder}>
            <ActivityIndicator />
          </View>
        ) : paths.length === 0 ? (
          // Pas d'image vide à partager : on dit quand elle sera prête.
          <ThemedText themeColor="textSecondary">
            Votre image sera prête dès votre premier trajet enregistré sur cette période : vos
            tracés s’y dessineront.
          </ThemedText>
        ) : (
          <View ref={card} collapsable={false} style={styles.capture}>
            <ShareCard title={title} subtitle={subtitle} stats={stats} paths={paths} />
          </View>
        )}
        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        ) : null}
        {Platform.OS !== 'web' && paths?.length !== 0 ? (
          <Button
            title="Partager l’image"
            loading={sharing}
            disabled={paths === null}
            onPress={share}
          />
        ) : null}
        <Button title="Fermer" variant="secondary" onPress={onClose} />
      </ThemedView>
    </View>
  );
}

/** « STEP-mon-mois-de-novembre » : le nom que verra la personne qui reçoit l'image. */
function shareFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `STEP-${slug || 'partage'}`;
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    padding: Spacing.four,
    overflow: 'hidden',
  },
  brand: { color: INK_SOFT, fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  title: { color: INK, fontSize: 26, fontWeight: '800', marginTop: Spacing.two },
  subtitle: { color: INK_SOFT, fontSize: 14, marginTop: Spacing.half },
  art: {
    height: ART_HEIGHT,
    marginTop: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { color: INK_SOFT, fontSize: 14 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  stat: { alignItems: 'flex-start', flexShrink: 1 },
  statValue: { color: INK, fontSize: 18, fontWeight: '800' },
  statLabel: { color: INK_SOFT, fontSize: 12 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    alignItems: 'stretch',
  },
  capture: { alignSelf: 'center' },
  placeholder: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
