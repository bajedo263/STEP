import { Pedometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { startOfDay } from '@/lib/daily-progress';

export type TodaySteps =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'denied' }
  | {
      status: 'ready';
      steps: number;
      /** Vrai sur Android : seuls les pas faits app ouverte sont comptés (pas d'historique). */
      partial: boolean;
    };

/**
 * Pas du jour lus depuis le podomètre du téléphone.
 * iOS fournit l'historique depuis minuit ; Android seulement les pas comptés pendant
 * que l'app est ouverte, en attendant Health Connect.
 */
export function useTodaySteps(): TodaySteps {
  const [state, setState] = useState<TodaySteps>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    let appStateSubscription: { remove: () => void } | null = null;
    const hasHistory = Platform.OS === 'ios';
    let baseSteps = 0;
    let watchedSteps = 0;
    let baseDay = -1;

    const publish = () => {
      if (!cancelled) {
        setState({ status: 'ready', steps: baseSteps + watchedSteps, partial: !hasHistory });
      }
    };

    const onWatch = ({ steps }: { steps: number }) => {
      watchedSteps = steps;
      publish();
    };

    // watchStepCount compte les pas depuis l'abonnement : on le relance à chaque nouvelle base.
    const restartWatch = () => {
      subscription?.remove();
      watchedSteps = 0;
      subscription = Pedometer.watchStepCount(onWatch);
    };

    // iOS : relit le total depuis minuit. Android : repart de zéro quand le jour change.
    const refreshBase = async () => {
      const now = new Date();
      const today = startOfDay(now).getTime();
      if (hasHistory) {
        const { steps } = await Pedometer.getStepCountAsync(new Date(today), now);
        if (cancelled) return;
        baseSteps = steps;
        restartWatch();
      } else if (today !== baseDay) {
        baseSteps = 0;
        restartWatch();
      }
      baseDay = today;
      publish();
    };

    async function start() {
      try {
        if (!(await Pedometer.isAvailableAsync())) {
          if (!cancelled) setState({ status: 'unavailable' });
          return;
        }
        const permission = await Pedometer.requestPermissionsAsync();
        if (!permission.granted) {
          if (!cancelled) setState({ status: 'denied' });
          return;
        }
        if (cancelled) return;
        await refreshBase();
        appStateSubscription = AppState.addEventListener('change', (next) => {
          if (next === 'active') refreshBase().catch(() => {});
        });
      } catch {
        if (!cancelled) setState({ status: 'unavailable' });
      }
    }

    start();

    return () => {
      cancelled = true;
      subscription?.remove();
      appStateSubscription?.remove();
    };
  }, []);

  return state;
}
