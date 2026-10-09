import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { useDailyGoal } from '@/hooks/use-daily-goal';
import { localFlag, setLocalFlag, useLocalFlag } from '@/hooks/use-local-flag';
import { useProfile } from '@/hooks/use-profile';
import { useStepHistory } from '@/hooks/use-step-history';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { DEFAULT_REMINDER_HOUR, planReminders, reminderKey } from '@/lib/reminders';
import { strideLengthMeters } from '@/lib/steps';
import { protectedStreak } from '@/lib/streak';
import { weeklyReviewReminder } from '@/lib/weekly-review';

/** Réglage des rappels sur ce téléphone : une heure (« 18 ») ou « off ». */
export const REMINDER_HOUR_KEY = 'step.reminder-hour';
const ASKED_KEY = 'step.reminder-permission-asked';
const CHANNEL_ID = 'rappels';

/** Heure du rappel du jour, ou null s'ils sont coupés. */
export function useReminderHour(): number | null {
  const value = useLocalFlag(REMINDER_HOUR_KEY);
  if (value === 'off') return null;
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : DEFAULT_REMINDER_HOUR;
}

export function setReminderHour(hour: number | null) {
  setLocalFlag(REMINDER_HOUR_KEY, hour === null ? 'off' : String(hour));
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Autorisation des notifications, demandée une seule fois ; vrai si accordée. */
async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Sur Android 13, la demande n'apparaît qu'une fois un canal créé.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rappels',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain || localFlag(ASKED_KEY)) return false;
  setLocalFlag(ASKED_KEY, '1');
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Programme les rappels du jour et des jours suivants à partir des pas, de l'objectif et de
 * la série, et ouvre l'écran voulu quand on appuie sur un rappel.
 */
export function useDailyReminders() {
  const today = useTodaySteps();
  const profile = useProfile();
  const history = useStepHistory();
  const hour = useReminderHour();

  const steps = today.status === 'ready' ? today.steps : null;
  const { goal, rule } = useDailyGoal(profile, history, steps);
  const reminders = useMemo(() => {
    if (steps === null || !history) return null;
    const streak = protectedStreak(history, new Date(), steps, rule);
    const now = new Date();
    const daily = planReminders({
      now,
      hour,
      // Arrondi à 500 pas : on ne reprogramme pas à chaque pas.
      todaySteps: Math.floor(steps / 500) * 500,
      goal,
      streak: streak.current,
      strideM: strideLengthMeters(profile?.height_cm ?? 170, profile?.sex ?? 'unspecified'),
      reliable: today.status === 'ready' && !today.partial,
    });
    // Le bilan de la semaine s'annonce le lundi matin, sauf si les rappels sont coupés.
    return hour === null ? daily : [...daily, weeklyReviewReminder(now)];
  }, [steps, history, goal, rule, hour, profile, today]);
  const key = reminders ? reminderKey(reminders) : null;

  useEffect(() => {
    if (Platform.OS === 'web' || !reminders) return;
    let cancelled = false;
    (async () => {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (reminders.length === 0 || cancelled || !(await ensurePermission()) || cancelled) return;
      for (const reminder of reminders) {
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.id,
          content: { title: reminder.title, body: reminder.body, data: { url: reminder.url } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminder.date,
            channelId: CHANNEL_ID,
          },
        });
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // La clé décrit entièrement les rappels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Appui sur un rappel, y compris celui qui a lancé l'app.
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url !== 'string' || !url.startsWith('/')) return;
    // Traité une fois : on ne rouvre pas l'écran à chaque retour sur les onglets.
    Notifications.clearLastNotificationResponse();
    router.push(url as never);
  }, [response]);
}
