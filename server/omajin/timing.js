export const OMAJIN_POLL_INTERVAL_MS = 10_000;
export const OMAJIN_COMMAND_REFRESH_DELAYS_MS = [2_000, 5_000];

/**
 * Relit plusieurs fois après une commande : certains firmwares publient encore
 * l'ancienne puissance pendant quelques secondes après le changement du relais.
 * @param {() => void|Promise<void>} refresh
 * @param {(callback: () => void|Promise<void>, delay: number) => {unref?: () => void}} [schedule]
 */
export function scheduleOmajinCommandRefresh(refresh, schedule = setTimeout) {
  return OMAJIN_COMMAND_REFRESH_DELAYS_MS.map((delay) => {
    const timer = schedule(refresh, delay);
    timer.unref?.();
    return timer;
  });
}
