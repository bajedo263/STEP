import { Pedometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { startOfDay } from '@/lib/daily-progress';
import { healthAvailable, healthStepsBetween } from '@/lib/health';
import { mergeTodaySteps, type HealthReading } from '@/lib/step-sources';

/** Intervalle entre deux lectures de Santé, app ouverte. */
const HEALTH_REFRESH_MS = 60_000;

let lastHealth: { day: number; at: number; steps: Promise<number | null> } | null = null;

/** Pas du jour dans Santé ; une lecture récente est partagée par tous les écrans. */
function healthStepsToday(): Promise<number | null> {
  const now = new Date();
  const day = startOfDay(now).getTime();
  if (!lastHealth || lastHealth.day !== day || Date.now() - lastHealth.at > HEALTH_REFRESH_MS / 2) {
    lastHealth = { day, at: Date.now(), steps: healthStepsBetween(new Date(day), now) };
  }
  return lastHealth.steps;
}

export type TodaySteps =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'denied' }
  | {
      status: 'ready';
      steps: number;
      /** Vrai sur Android sans Health Connect : seuls les pas faits app ouverte sont comptés. */
      partial: boolean;
    };

/**
 * Pas du jour : Apple Santé ou Health Connect dans la version installée (montre comprise, hors
 * saisies manuelles), complétés en direct par le podomètre du téléphone.
 * Dans Expo Go, podomètre seul : iOS fournit l'historique depuis minuit ; Android seulement les
 * pas comptés pendant que l'app est ouverte.
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
    let health: (HealthReading & { day: number }) | null = null;
    let healthTimer: ReturnType<typeof setInterval> | null = null;

    const publish = () => {
      if (cancelled) return;
      const pedometer = baseSteps + watchedSteps;
      const reading = health?.day === baseDay ? health : null;
      setState({
        status: 'ready',
        steps: mergeTodaySteps(pedometer, reading),
        partial: !hasHistory && !reading,
      });
    };

    const refreshHealth = async () => {
      if (!healthAvailable) return;
      const steps = await healthStepsToday();
      if (cancelled || steps === null) return;
      health = { steps, pedometerAtRead: baseSteps + watchedSteps, day: baseDay };
      publish();
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

    // Sans podomètre, Santé peut encore donner le total du jour (sans suivi en direct).
    const withoutPedometer = async (status: 'unavailable' | 'denied') => {
      const steps = healthAvailable ? await healthStepsToday() : null;
      if (cancelled) return;
      setState(steps === null ? { status } : { status: 'ready', steps, partial: false });
    };

    async function start() {
      try {
        if (!(await Pedometer.isAvailableAsync())) {
          await withoutPedometer('unavailable');
          return;
        }
        const permission = await Pedometer.requestPermissionsAsync();
        if (!permission.granted) {
          await withoutPedometer('denied');
          return;
        }
        if (cancelled) return;
        await refreshBase();
        refreshHealth().catch(() => {});
        healthTimer = healthAvailable
          ? setInterval(() => refreshHealth().catch(() => {}), HEALTH_REFRESH_MS)
          : null;
        appStateSubscription = AppState.addEventListener('change', (next) => {
          if (next !== 'active') return;
          refreshBase()
            .then(refreshHealth)
            .catch(() => {});
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
      if (healthTimer) clearInterval(healthTimer);
    };
  }, []);

  return state;
}
