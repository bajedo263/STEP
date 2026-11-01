import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { firstWalkDoneKey, useGiftDays, useHasWalked } from '@/hooks/use-comeback';
import { useDailyGoal } from '@/hooks/use-daily-goal';
import { setLocalFlag } from '@/hooks/use-local-flag';
import type { PlannedWalk } from '@/hooks/use-planned-walk';
import { usePoiDiscovery } from '@/hooks/use-poi-discovery';
import { useProfile } from '@/hooks/use-profile';
import { useRoutePois } from '@/hooks/use-route-pois';
import { useStepHistory } from '@/hooks/use-step-history';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { useWalkTracker } from '@/hooks/use-walk-tracker';
import { capturedCells, conquestUnlocked } from '@/lib/conquest';
import { feedback } from '@/lib/feedback';
import type { LatLng } from '@/lib/loop';
import { mergePois, type RoutePoi } from '@/lib/pois';
import { strideLengthMeters } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { protectedStreak } from '@/lib/streak';
import { hasArrived, orientedPath, pathLength, progressAlongPath, type Track } from '@/lib/track';
import {
  goalReachedDuringWalk,
  nearArrival,
  nextOffRoute,
  onRoute,
  type OffRoute,
} from '@/lib/walk-guidance';
import { MIN_WALK_M, summarizeWalk, walkRow, type WalkSummary } from '@/lib/walk-summary';
import { useAuth } from '@/providers/auth-provider';

export type SaveState = 'saving' | 'saved' | 'error' | 'too-short';

/** Le trajet en cours, suivi même quand on consulte un autre écran de l'app. */
export type ActiveWalk = {
  planned: PlannedWalk;
  tracker: ReturnType<typeof useWalkTracker>;
  plannedPois: RoutePoi[];
  discovery: ReturnType<typeof usePoiDiscovery>;
  estimatedSteps: number;
  conquering: boolean;
  /** Bilan une fois le trajet terminé. */
  summary: WalkSummary | null;
  saveState: SaveState;
  cellCount: number;
  /** Arrivé au bout du trajet prévu : on attend « Terminer » ou « Continuer ». */
  arrivalPending: boolean;
  /** Écart au tracé prévu ; `off` une fois l'écart confirmé. Null en marche libre. */
  offRoute: OffRoute | null;
  /** Objectif du jour franchi pendant ce trajet. */
  goalReached: boolean;
  /** La journée au moment du bilan : pas, objectif et série. */
  day: { steps: number | null; goal: number; streak: number | null };
  finish: () => void;
  keepWalking: () => void;
  retrySave: () => void;
};

let request: { id: number; planned: PlannedWalk } | null = null;
let active: ActiveWalk | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Lance le suivi d'un trajet ; il continue tant qu'on ne l'a pas terminé puis fermé. */
export function startWalk(planned: PlannedWalk) {
  request = { id: Date.now(), planned };
  active = null;
  emit();
}

/** Oublie le trajet (après le bilan, ou si le suivi n'a pas pu démarrer). */
export function endWalk() {
  request = null;
  active = null;
  emit();
}

export function useActiveWalk(): ActiveWalk | null {
  return useSyncExternalStore(subscribe, () => active, () => null);
}

/** Vrai entre le lancement d'un trajet et la première position de suivi publiée. */
export function useWalkStarting(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => request !== null && active === null,
    () => false
  );
}

/** Vrai tant qu'un trajet est commencé et pas encore terminé. */
export function walkInProgress(): boolean {
  return request !== null && active?.summary == null;
}

/** À monter une fois, sous l'authentification : fait tourner le trajet en cours. */
export function WalkHost() {
  const current = useSyncExternalStore(subscribe, () => request, () => null);
  // À la déconnexion, le trajet s'arrête avec l'hôte.
  useEffect(() => endWalk, []);
  return current ? <WalkSession key={current.id} planned={current.planned} /> : null;
}

function WalkSession({ planned }: { planned: PlannedWalk }) {
  const [summary, setSummary] = useState<WalkSummary | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saving');
  // La Conquête s'active dès 10 000 pas dans la journée, y compris en cours de trajet. La toute
  // première marche fait exception : elle rapporte ses premières cases, pour goûter au jeu.
  const today = useTodaySteps();
  const hasWalked = useHasWalked();
  const conquering =
    conquestUnlocked(today.status === 'ready' ? today.steps : null) || hasWalked === false;
  const [conquered, setConquered] = useState(false);
  const { session } = useAuth();
  const profile = useProfile();
  const tracker = useWalkTracker(planned.mode === 'free' ? null : planned.route.coordinates);
  // Si l'on est parti avant que les lieux du trajet soient arrivés sur la carte, on les charge ici.
  const routePois = useRoutePois(planned.mode === 'free' ? null : planned.route.coordinates);
  const plannedPois = useMemo(
    () => (planned.mode === 'free' ? [] : mergePois(routePois, planned.pois)),
    [planned, routePois]
  );
  const discovery = usePoiDiscovery(
    plannedPois,
    summary ? [] : [tracker.position, tracker.track.points.at(-1)]
  );
  const strideM = strideLengthMeters(profile?.height_cm ?? 170, profile?.sex ?? 'unspecified');

  const save = async (walk: WalkSummary, conquers: boolean) => {
    if (walk.distanceM < MIN_WALK_M) {
      setSaveState('too-short');
      return;
    }
    const userId = session?.user.id;
    if (!supabase || !userId) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    const row = walkRow(userId, walk, conquers);
    let { error } = await supabase.from('walks').insert(row);
    if (error?.code === 'PGRST204') {
      // Base pas encore migrée (colonne conquers absente) : on enregistre sans.
      const { conquers: _ignored, ...legacyRow } = row;
      ({ error } = await supabase.from('walks').insert(legacyRow));
    }
    setSaveState(error ? 'error' : 'saved');
    if (!error) setLocalFlag(firstWalkDoneKey(userId), '1');
  };

  const finish = () => finishAt(new Date());
  const finishAt = (endedAt: Date) => {
    if (summary) return;
    tracker.stop();
    const walk = summarizeWalk({
      mode: planned.mode,
      track: tracker.track,
      pedometerSteps: tracker.steps,
      strideM,
      weightKg: profile?.weight_kg ?? 70,
      startedAt: tracker.startedAt,
      endedAt,
    });
    setSummary(walk);
    setConquered(conquering);
    save(walk, conquering);
  };

  const path = planned.mode === 'free' ? null : planned.route.coordinates;

  // Arrivé au bout du trajet prévu : une vibration, puis « Terminer » ou « Continuer ». Sans
  // réponse au bout de 10 minutes (téléphone resté en poche), le trajet se termine tout seul.
  const [keptWalking, setKeptWalking] = useState(false);
  const arrived = !summary && path !== null && hasArrived(path, tracker.track);
  const arrivalPending = arrived && !keptWalking;
  useEffect(() => {
    if (!arrivalPending) return;
    feedback.success();
    // Le trajet se clôt à l'heure d'arrivée, pas dix minutes plus tard.
    const arrivedAt = new Date();
    const timer = setTimeout(() => finishAt(arrivedAt), ARRIVAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // `finishAt` change à chaque rendu ; seule l'arrivée compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalPending]);

  // Trop loin du tracé : une vibration d'avertissement, et un bandeau tant qu'on n'y est pas revenu.
  const offRoute = useOffRoute(summary || keptWalking ? null : path, tracker.track.filter);
  const isOff = offRoute?.off === true;
  useEffect(() => {
    if (isOff) feedback.warning();
  }, [isOff]);

  // À 500 m de l'arrivée, un coup de vibration : on peut ranger le téléphone jusque-là.
  const route = path ? orientedPath(path, tracker.track) : null;
  const near =
    !summary &&
    route !== null &&
    nearArrival(pathLength(route), pathLength(route) - progressAlongPath(route, tracker.track));
  const nudged = useRef(false);
  useEffect(() => {
    if (!near || nudged.current) return;
    nudged.current = true;
    feedback.nudge();
  }, [near]);

  // L'objectif du jour franchi en marchant se sent aussi, téléphone en poche.
  const history = useStepHistory();
  const todaySteps = today.status === 'ready' ? today.steps : null;
  const { goal, rule } = useDailyGoal(profile, history, todaySteps);
  const [stepsAtStart, setStepsAtStart] = useState<number | null>(null);
  if (stepsAtStart === null && todaySteps !== null) setStepsAtStart(todaySteps);
  const walkSteps = tracker.steps ?? tracker.track.distanceM / strideM;
  const goalReached = !summary && goalReachedDuringWalk(stepsAtStart, todaySteps, goal, walkSteps);
  useEffect(() => {
    if (goalReached) feedback.success();
  }, [goalReached]);
  const gifts = useGiftDays();
  const streak = useMemo(
    () => (history ? protectedStreak(history, new Date(), todaySteps, rule, gifts).current : null),
    [history, todaySteps, rule, gifts]
  );

  // Une vibration à chaque nouveau lieu découvert, même téléphone en poche.
  const newPlaceId = discovery.hereIsNew ? discovery.here?.id : undefined;
  useEffect(() => {
    if (newPlaceId) feedback.success();
  }, [newPlaceId]);

  const snapshot: ActiveWalk = {
    planned,
    tracker,
    plannedPois,
    discovery,
    estimatedSteps: walkSteps,
    conquering,
    summary,
    saveState,
    cellCount: summary && conquered ? capturedCells(tracker.track.points).length : 0,
    arrivalPending,
    offRoute,
    goalReached,
    day: { steps: todaySteps, goal, streak },
    finish,
    keepWalking: () => setKeptWalking(true),
    retrySave: () => {
      if (summary) save(summary, conquered);
    },
  };
  useEffect(() => {
    active = snapshot;
    emit();
  });

  return summary || tracker.background ? null : <KeepAwake />;
}

const ARRIVAL_TIMEOUT_MS = 10 * 60_000;

/**
 * Écart au tracé prévu, recalculé à chaque nouvelle position lissée (avant qu'elle soit posée
 * sur le tracé, sinon elle ne s'en éloignerait jamais).
 */
function useOffRoute(path: LatLng[] | null, filter: Track['filter']): OffRoute | null {
  const [state, setState] = useState<{
    filter: Track['filter'];
    value: OffRoute;
  }>(() => ({
    filter: null,
    value: onRoute(),
  }));
  if (path && filter && filter !== state.filter) {
    const position = { ...filter, accuracy: Math.sqrt(filter.variance) };
    setState({
      filter,
      value: nextOffRoute(state.value, path, position, filter.timestamp),
    });
  }
  return path ? state.value : null;
}

/** Sans suivi en arrière-plan (Expo Go), l'écran reste allumé pendant la marche. */
function KeepAwake() {
  useKeepAwake();
  return null;
}
