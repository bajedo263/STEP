import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/**
 * Aide affichée seulement si une attente se prolonge : un chargement court reste sobre,
 * un chargement long dit quoi faire.
 */
export function SlowHint({ text, delayMs = 8000 }: { text: string; delayMs?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  if (!shown) return null;
  return (
    <ThemedText
      type="small"
      themeColor="textSecondary"
      accessibilityLiveRegion="polite"
      style={styles.text}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  text: {
    textAlign: 'center',
    maxWidth: 320,
  },
});
