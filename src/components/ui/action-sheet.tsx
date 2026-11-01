import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean };

/**
 * Liste d'actions en bas d'écran, identique sur iOS, Android et web : `Alert.alert` ne garde
 * que 3 boutons sur Android et n'en affiche aucun sur le web.
 */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <ThemedView style={[styles.sheet, { paddingBottom: Spacing.three + insets.bottom }]}>
        {title ? (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
            {title}
          </ThemedText>
        ) : null}
        <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
          {actions.map((action, index) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.backgroundSelected },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText style={[styles.label, action.destructive && { color: theme.danger }]}>
                {action.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.group,
            styles.row,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
          ]}>
          <ThemedText style={[styles.label, styles.cancel]}>Annuler</ThemedText>
        </Pressable>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  title: {
    textAlign: 'center',
  },
  group: {
    borderRadius: Radius.tile,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  label: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
  },
  cancel: {
    fontWeight: 700,
  },
});
