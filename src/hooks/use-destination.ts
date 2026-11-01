import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FAR_PLACE_M, type Place } from '../../supabase/functions/_shared/destination.ts';
import type { Poi } from '@/lib/pois';
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
  | {
      status: 'ready';
      place: Place;
      route: DestinationRoute;
      /** Chemin direct demandé par l'utilisateur (sans objectif à atteindre). */
      direct: boolean;
      /** Détour proposé juste avant pour ce lieu, pour y revenir après « Chemin direct ». */
      detour: DestinationRoute | null;
    };

/**
 * Itinéraire renvoyé par le serveur ; `lengthened` s'il a été rallongé par un détour,
 * `via` le lieu remarquable par lequel passe ce détour.
 */
export type DestinationRoute = LoopRoute & { lengthened: boolean; via: Poi | null };

/**
 * Itinéraire à pied de la position actuelle vers le lieu choisi, rallongé par un détour
 * jusqu'à `targetM` quand le chemin direct est trop court (null : chemin direct).
 */
export function useDestinationRoute() {
  const [state, setState] = useState<DestinationRouteState>({ status: 'idle' });
  // Dernier détour proposé pour le lieu choisi : « Chemin direct » ne le perd pas.
  const lastDetour = useRef<{ placeId: string; route: DestinationRoute } | null>(null);

  const choose = useCallback(async (start: LatLng, place: Place, targetM: number | null) => {
    if (!supabase) {
      setState({ status: 'error', place, message: 'Le serveur n’est pas configuré.' });
      return;
    }
    if (lastDetour.current?.placeId !== place.id) lastDetour.current = null;
    setState({ status: 'loading', place });
    const { data, error } = await supabase.functions.invoke<DestinationRoute>('destination', {
      body: {
        action: 'route',
        start,
        end: place.coords,
        targetM,
        seed: Math.floor(Math.random() * 1_000_000),
      },
    });
    if (error || !data) {
      setState({ status: 'error', place, message: await errorMessage(error) });
      return;
    }
    if (data.lengthened) lastDetour.current = { placeId: place.id, route: data };
    const direct = targetM === null;
    const detour = direct ? (lastDetour.current?.route ?? null) : null;
    setState({ status: 'ready', place, route: data, direct, detour });
  }, []);

  /** Revient au détour proposé avant « Chemin direct », sans nouveau calcul. */
  const restoreDetour = useCallback(() => {
    setState((s) =>
      s.status === 'ready' && s.detour
        ? { status: 'ready', place: s.place, route: s.detour, direct: false, detour: null }
        : s
    );
  }, []);

  const clear = useCallback(() => {
    lastDetour.current = null;
    setState({ status: 'idle' });
  }, []);

  return { ...state, choose, restoreDetour, clear };
}

/** Distance au-delà de laquelle un résultat de recherche est jugé lointain. */
export { FAR_PLACE_M };
