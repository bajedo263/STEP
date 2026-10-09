import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  avatarFrame,
  leagueTrophy,
  seasonTrophies,
  type SeasonResult,
  type Trophy,
  type TrophyLevel,
} from '@/lib/season-rewards';
import { supabase } from '@/lib/supabase';

export type Trophies = { trophies: Trophy[]; frame: TrophyLevel | null };

/** Trophées de fin de saison et de ligue, et le cadre d'avatar qu'ils donnent. */
export function useTrophies(): Trophies | null {
  const [state, setState] = useState<Trophies | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!supabase) return;
      const client = supabase;
      let cancelled = false;
      Promise.all([
        client
          .from('conquest_season_results')
          .select('season_start, cells, rank, conquest_seasons(players)')
          .returns<
            {
              season_start: string;
              cells: number;
              rank: number;
              conquest_seasons: { players: number } | null;
            }[]
          >(),
        client
          .from('league_members')
          .select('tier')
          .order('tier', { ascending: false })
          .limit(1)
          .returns<{ tier: number }[]>(),
      ])
        .then(([seasons, league]) => {
          if (cancelled) return;
          const results: SeasonResult[] = seasons.error
            ? []
            : (seasons.data ?? []).map((row) => ({
                season_start: row.season_start,
                cells: row.cells,
                rank: row.rank,
                players: row.conquest_seasons?.players ?? row.rank,
              }));
          const bestTier = league.error ? null : (league.data?.[0]?.tier ?? null);
          const fromLeague = leagueTrophy(bestTier);
          setState({
            trophies: [...seasonTrophies(results), ...(fromLeague ? [fromLeague] : [])],
            frame: avatarFrame(results),
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return state;
}
