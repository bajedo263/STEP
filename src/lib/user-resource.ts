/**
 * Donnée du compte connecté, chargée une fois et partagée par tous les écrans : chacun l'affiche
 * aussitôt depuis la mémoire, et elle n'est relue que si elle a vieilli ou vient d'être modifiée.
 * Avant, chaque écran la redemandait au serveur à chaque retour dessus.
 */
export type UserResource<T> = {
  /** Dernière valeur connue pour ce compte, ou null. */
  get: (userId: string) => T | null;
  /** Relit la valeur si elle a vieilli (ou toujours avec `force`) ; faux si la lecture a échoué. */
  refresh: (userId: string, force?: boolean) => Promise<boolean>;
  /** À appeler après une écriture : la valeur est relue tout de suite si un écran l'affiche. */
  invalidate: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createUserResource<T>(
  load: (userId: string) => Promise<T | null>,
  freshMs: number,
  now: () => number = Date.now
): UserResource<T> {
  let owner: string | null = null;
  let value: T | null = null;
  let loadedAt = -Infinity;
  let generation = 0;
  let inflight: { generation: number; promise: Promise<boolean> } | null = null;
  const listeners = new Set<() => void>();

  const refresh = (userId: string, force = false): Promise<boolean> => {
    if (owner !== userId) {
      // Autre compte : rien de l'ancien ne doit s'afficher.
      owner = userId;
      value = null;
      loadedAt = -Infinity;
      generation += 1;
      inflight = null;
    }
    if (inflight && inflight.generation === generation) return inflight.promise;
    if (!force && now() - loadedAt < freshMs) return Promise.resolve(true);

    const started = generation;
    const promise = load(userId)
      .catch(() => null)
      .then((loaded) => {
        // Compte changé ou valeur modifiée pendant la lecture : ce résultat est périmé.
        if (started !== generation) return inflight ? inflight.promise : refresh(userId, true);
        inflight = null;
        if (loaded === null) return false;
        loadedAt = now();
        // Valeur identique : on garde le même objet, les écrans ne se redessinent pas.
        if (JSON.stringify(loaded) !== JSON.stringify(value)) {
          value = loaded;
          listeners.forEach((listener) => listener());
        }
        return true;
      });
    inflight = { generation: started, promise };
    return promise;
  };

  return {
    get: (userId) => (owner === userId ? value : null),
    refresh,
    invalidate: () => {
      loadedAt = -Infinity;
      generation += 1;
      inflight = null;
      if (owner && listeners.size > 0) refresh(owner, true);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
