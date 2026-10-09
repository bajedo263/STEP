import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Vibrations des moments forts ; rien sur le web, et une erreur n'interrompt jamais l'app. */
export const feedback = {
  success() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  tap() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
};
