import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { firstWalkDoneKey, useHasWalked } from '@/hooks/use-comeback';
import { setLocalFlag } from '@/hooks/use-local-flag';
import type { PlannedWalk } from '@/hooks/use-planned-walk';
import { usePoiDiscovery } from '@/hooks/use-poi-discovery';
import { useProfile } from '@/hooks/use-profile';
import { useRoutePois } from '@/hooks/use-route-pois';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { useWalkTracker } from '@/hooks/use-walk-tracker';
import { capturedCells, conquestUnlocked } from '@/lib/conquest';
import { feedback } from '@/lib/feedback';
import { mergePois, type RoutePoi } from '@/lib/pois';
import { strideLengthMeters } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { hasArrived } from '@/lib/track';
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
  finish: () => void;
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
  return useSyncExternalStore(subscribe, () => active);
}

/** Vrai entre le lancement d'un trajet et la première position de suivi publiée. */
export function useWalkStarting(): boolean {
  return useSyncExternalStore(subscribe, () => request !== null && active === null);
}

/** Vrai tant qu'un trajet est commencé et pas encore terminé. */
export function walkInProgress(): boolean {
  return request !== null && active?.summary == null;
}

/** À monter une fois, sous l'authentification : fait tourner le trajet en cours. */
export function WalkHost() {
  const current = useSyncExternalStore(subscribe, () => request);
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
  const discovery = usePoiDiscovery(plannedPois, summary ? null : tracker.track.points.at(-1));
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

  const finish = () => {
    if (summary) return;
    tracker.stop();
    const walk = summarizeWalk({
      mode: planned.mode,
      track: tracker.track,
      pedometerSteps: tracker.steps,
      strideM,
      weightKg: profile?.weight_kg ?? 70,
      startedAt: tracker.startedAt,
      endedAt: new Date(),
    });
    setSummary(walk);
    setConquered(conquering);
    save(walk, conquering);
  };

  // Arrivé au bout du trajet prévu : on termine tout seul, même depuis un autre écran.
  const arrived =
    !summary && planned.mode !== 'free' && hasArrived(planned.route.coordinates, tracker.track);
  useEffect(() => {
    if (!arrived) return;
    const timer = setTimeout(finish, 0);
    return () => clearTimeout(timer);
    // `finish` change à chaque rendu ; seule l'arrivée compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

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
    estimatedSteps: tracker.steps ?? tracker.track.distanceM / strideM,
    conquering,
    summary,
    saveState,
    cellCount: summary && conquered ? capturedCells(tracker.track.points).length : 0,
    finish,
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

/** Sans suivi en arrière-plan (Expo Go), l'écran reste allumé pendant la marche. */
function KeepAwake() {
  useKeepAwake();
  return null;
}
