import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import type { Place } from '../../supabase/functions/_shared/destination.ts';
import type { LatLng, LoopRoute } from '@/lib/loop';
import { supabase } from '@/lib/supabase';

export type { Place };

const GENERIC_ERROR = 'Le mode Destination ne répond pas. Réessayez dans un instant.';
const MIN_QUERY = 3;

async function errorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (typeof body?.error === 'string') return body.error;
  }
  return GENERIC_ERROR;
}

type SearchResult = { query: string; places: Place[] } | { query: string; error: string };

/** Lieux correspondant à la saisie, cherchés autour de l'utilisateur après une courte pause. */
export function usePlaceSearch(query: string, near: LatLng | null) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_QUERY || !supabase) return;
    const client = supabase;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await client.functions.invoke<{ places: Place[] }>('destination', {
        body: { action: 'search', query: trimmed, near },
      });
      if (cancelled) return;
      if (error || !data) setResult({ query: trimmed, error: await errorMessage(error) });
      else setResult({ query: trimmed, places: data.places });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // La position bouge peu : on ne relance pas la recherche pour elle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  if (trimmed.length < MIN_QUERY) return { status: 'idle' as const };
  if (!result || result.query !== trimmed) return { status: 'loading' as const };
  if ('error' in result) return { status: 'error' as const, message: result.error };
  return { status: 'ready' as const, places: result.places };
}

export type DestinationRouteState =
  | { status: 'idle' }
  | { status: 'loading'; place: Place }
  | { status: 'error'; place: Place; message: string }
  | { status: 'ready'; place: Place; route: LoopRoute };

/** Itinéraire à pied de la position actuelle vers le lieu choisi. */
export function useDestinationRoute() {
  const [state, setState] = useState<DestinationRouteState>({ status: 'idle' });

  const choose = useCallback(async (start: LatLng, place: Place) => {
    if (!supabase) {
      setState({ status: 'error', place, message: 'Le serveur n’est pas configuré.' });
      return;
    }
    setState({ status: 'loading', place });
    const { data, error } = await supabase.functions.invoke<LoopRoute>('destination', {
      body: { action: 'route', start, end: place.coords },
    });
    if (error || !data) {
      setState({ status: 'error', place, message: await errorMessage(error) });
      return;
    }
    setState({ status: 'ready', place, route: data });
  }, []);

  const clear = useCallback(() => setState({ status: 'idle' }), []);

  return { ...state, choose, clear };
}
