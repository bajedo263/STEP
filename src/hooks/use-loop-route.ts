import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCallback, useState } from 'react';

import type { LatLng, LoopRoute } from '@/lib/loop';
import type { Poi } from '@/lib/pois';
import { supabase } from '@/lib/supabase';

export type LoopState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; route: LoopResult };

/** Boucle renvoyée par le serveur, avec les lieux remarquables par lesquels elle passe. */
export type LoopResult = LoopRoute & { via: Poi[] };

const GENERIC_ERROR = 'Impossible de calculer une boucle pour le moment. Réessayez dans un instant.';

async function errorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (typeof body?.error === 'string') return body.error;
  }
  return GENERIC_ERROR;
}

/** Demande au serveur une boucle à pied ; chaque nouvel appel propose un tracé différent. */
export function useLoopRoute() {
  const [state, setState] = useState<LoopState>({ status: 'idle' });

  const generate = useCallback(async (start: LatLng, distanceM: number) => {
    if (!supabase) {
      setState({ status: 'error', message: 'Le serveur n’est pas configuré.' });
      return;
    }
    setState({ status: 'loading' });

    const { data, error } = await supabase.functions.invoke<LoopResult>('loop-route', {
      body: { start, distanceM, seed: Math.floor(Math.random() * 1_000_000) },
    });
    if (error || !data) {
      setState({ status: 'error', message: await errorMessage(error) });
      return;
    }
    setState({ status: 'ready', route: { ...data, via: data.via ?? [] } });
  }, []);

  /** Boucle qui part de `start`, passe par `through` dans l'ordre et revient au départ. */
  const generateThrough = useCallback(async (start: LatLng, through: LatLng[]) => {
    if (!supabase) {
      setState({ status: 'error', message: 'Le serveur n’est pas configuré.' });
      return;
    }
    setState({ status: 'loading' });

    const { data, error } = await supabase.functions.invoke<LoopResult>('loop-route', {
      // La distance est imposée par les points de passage ; le serveur l'exige quand même.
      body: { start, through, distanceM: 5_000, seed: 0 },
    });
    if (error || !data) {
      setState({ status: 'error', message: await errorMessage(error) });
      return;
    }
    setState({ status: 'ready', route: { ...data, via: data.via ?? [] } });
  }, []);

  const clear = useCallback(() => setState({ status: 'idle' }), []);

  return { ...state, generate, generateThrough, clear };
}
