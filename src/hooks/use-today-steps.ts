import { Pedometer } from 'expo-sensors';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { startOfDay } from '@/lib/daily-progress';
import { healthAvailable, healthStepsBetween } from '@/lib/health';
import { mergeTodaySteps, type HealthReading } from '@/lib/step-sources';

/** Intervalle entre deux lectures de Santé (et contrôle du passage à minuit), app ouverte. */
const REFRESH_MS = 60_000;
/** Délai avant d'arrêter le podomètre quand plus aucun écran n'affiche les pas. */
const STOP_DELAY_MS = 30_000;

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

const LOADING: TodaySteps = { status: 'loading' };

// Une seule source pour toute l'app : l'accueil, la carte, les stats, le trajet en cours et la
// Conquête sans trajet lisent le même compte. Avant, chaque écran lançait son propre podomètre :
// sur Android (qui compte depuis l'abonnement), chacun affichait un total différent, et un trajet
// repartait de zéro, ce qui faussait la Conquête et l'objectif franchi en marchant.
let current: TodaySteps = LOADING;
const listeners = new Set<() => void>();
let stopCounting: (() => void) | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function publish(next: TodaySteps) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  stopCounting ??= startCounting();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || stopTimer) return;
    // Un écran qui se remonte aussitôt (changement d'onglet) ne fait pas repartir le compte.
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (listeners.size > 0) return;
      stopCounting?.();
      stopCounting = null;
      current = LOADING;
    }, STOP_DELAY_MS);
  };
}

/** Pas du jour dans Santé, ou null si Santé n'est pas accessible. */
function healthStepsToday(): Promise<number | null> {
  const now = new Date();
  return healthStepsBetween(startOfDay(now), now);
}

/** Lance le podomètre et les lectures de Santé ; renvoie de quoi tout arrêter. */
function startCounting(): () => void {
  let cancelled = false;
  let subscription: { remove: () => void } | null = null;
  let appStateSubscription: { remove: () => void } | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const hasHistory = Platform.OS === 'ios';
  let baseSteps = 0;
  let watchedSteps = 0;
  let baseDay = -1;
  let health: (HealthReading & { day: number }) | null = null;

  const update = () => {
    if (cancelled) return;
    const pedometer = baseSteps + watchedSteps;
    const reading = health?.day === baseDay ? health : null;
    publish({
      status: 'ready',
      steps: mergeTodaySteps(pedometer, reading),
      partial: !hasHistory && !reading,
    });
  };

  const refreshHealth = async () => {
    if (!healthAvailable) return;
    const day = baseDay;
    const steps = await healthStepsToday();
    if (cancelled || steps === null || day !== baseDay) return;
    health = { steps, pedometerAtRead: baseSteps + watchedSteps, day };
    update();
  };

  const onWatch = ({ steps }: { steps: number }) => {
    watchedSteps = steps;
    update();
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
    update();
  };

  // Sans podomètre, Santé peut encore donner le total du jour (sans suivi en direct).
  const withoutPedometer = async (status: 'unavailable' | 'denied') => {
    const steps = healthAvailable ? await healthStepsToday() : null;
    if (cancelled) return;
    publish(steps === null ? { status } : { status: 'ready', steps, partial: false });
  };

  const refreshAll = () =>
    refreshBase()
      .then(refreshHealth)
      .catch(() => {});

  (async () => {
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
      timer = setInterval(() => {
        // App restée ouverte après minuit : le compte repart sur la nouvelle journée.
        if (startOfDay(new Date()).getTime() !== baseDay) refreshAll();
        else refreshHealth().catch(() => {});
      }, REFRESH_MS);
      appStateSubscription = AppState.addEventListener('change', (next) => {
        if (next === 'active') refreshAll();
      });
    } catch {
      if (!cancelled) publish({ status: 'unavailable' });
    }
  })();

  return () => {
    cancelled = true;
    subscription?.remove();
    appStateSubscription?.remove();
    if (timer) clearInterval(timer);
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => LOADING;

/**
 * Pas du jour : Apple Santé ou Health Connect dans la version installée (montre comprise, hors
 * saisies manuelles), complétés en direct par le podomètre du téléphone.
 * Dans Expo Go, podomètre seul : iOS fournit l'historique depuis minuit ; Android seulement les
 * pas comptés pendant que l'app est ouverte.
 */
export function useTodaySteps(): TodaySteps {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
