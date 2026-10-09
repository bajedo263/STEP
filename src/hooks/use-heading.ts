import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { angleDelta, bestHeading } from '@/lib/heading';

/** Variation minimale du cap avant de redessiner, pour ne pas rafraîchir à chaque frémissement. */
const MIN_CHANGE_DEG = 4;

/** Cap du téléphone (boussole), en degrés depuis le nord ; null tant qu'il n'est pas connu. */
export function useHeading(enabled = true): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    Location.watchHeadingAsync((reading) => {
      const next = bestHeading(reading);
      if (next === null) return;
      setHeading((current) =>
        current === null || angleDelta(current, next) >= MIN_CHANGE_DEG ? next : current
      );
    })
      .then((sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      })
      // Pas de boussole sur cet appareil : on garde la carte orientée au nord.
      .catch(() => {});

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return heading;
}
