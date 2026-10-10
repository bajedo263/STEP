import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';

import { localDay } from '@/lib/daily-progress';
import { supabase } from '@/lib/supabase';
import { forecastUrl, isRainDay, parseForecast, type ForecastHour } from '@/lib/weather';
import { useAuth } from '@/providers/auth-provider';

/** Prévision gardée une heure, partagée par l'accueil et les rappels. */
const FORECAST_TTL_MS = 60 * 60 * 1000;
let cache: { at: number; promise: Promise<ForecastHour[] | null> } | null = null;

/**
 * Prévision des prochaines 48 h à la dernière position connue. Ne demande jamais la
 * localisation : sans autorisation déjà donnée (carte), pas de météo.
 */
function loadForecast(): Promise<ForecastHour[] | null> {
  if (cache && Date.now() - cache.at < FORECAST_TTL_MS) return cache.promise;
  const promise = (async () => {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const last = await Location.getLastKnownPositionAsync();
    if (!last) return null;
    const response = await fetch(forecastUrl(last.coords.latitude, last.coords.longitude));
    if (!response.ok) return null;
    const hours = parseForecast(await response.json());
    return hours.length > 0 ? hours : null;
  })().catch(() => null);
  cache = { at: Date.now(), promise };
  // Un échec ne reste pas en cache : on réessaiera au prochain affichage.
  promise.then((hours) => {
    if (!hours && cache?.promise === promise) cache = null;
  });
  return promise;
}

/** Jours de pluie retenus pour ce compte : l'objectif y est réduit. */
export function useRainDays(): string[] {
  const { session } = useAuth();
  const days: unknown = session?.user.user_metadata?.rain_days;
  return useMemo(
    () => (Array.isArray(days) ? days.filter((day): day is string => typeof day === 'string') : []),
    [days]
  );
}

let recordingDay: string | null = null;

/**
 * Prévision météo du lieu, null tant qu'elle n'est pas chargée ou sans autorisation. Un jour
 * annoncé pluvieux est retenu dans le compte (sans migration) pour réduire l'objectif.
 */
export function useForecast(): ForecastHour[] | null {
  const [hours, setHours] = useState<ForecastHour[] | null>(null);
  const rainDays = useRainDays();
  const { session } = useAuth();
  const signedIn = Boolean(session);

  useEffect(() => {
    let cancelled = false;
    loadForecast().then((result) => {
      if (!cancelled) setHours(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hours || !signedIn || !supabase) return;
    const today = localDay(new Date());
    if (rainDays.includes(today) || recordingDay === today || !isRainDay(hours, today)) return;
    recordingDay = today;
    supabase.auth.updateUser({ data: { rain_days: [...rainDays, today].slice(-60) } }).then(
      ({ error }) => {
        if (error) recordingDay = null;
      },
      () => {
        recordingDay = null;
      }
    );
  }, [hours, rainDays, signedIn]);

  return hours;
}
