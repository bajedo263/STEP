import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Vibrations des moments forts ; rien sur le web, et une erreur n'interrompt jamais l'app. */
export const feedback = {
  success() {
    if (Platform.OS !== 'web')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** On s'écarte du tracé : vibration d'avertissement, distincte de celle des réussites. */
  warning() {
    if (Platform.OS !== 'web')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  /** Repère de parcours (arrivée proche) : un coup franc. */
  nudge() {
    if (Platform.OS !== 'web')
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  tap() {
    if (Platform.OS !== 'web')
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
};
