export async function api(path, options) {
  const res = await fetch(`/api/${path}`, { credentials: 'same-origin', ...options });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const error = new Error(payload.error || `API ${path} → ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export const post = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * Abonnement SSE auto-réparant — handlers: {reading, linky, status, notice}.
 * Le serveur émet un battement de cœur toutes les 20 s ; sans aucun événement
 * pendant 65 s (connexion morte après une veille, un changement de réseau…),
 * le flux est recréé et `onReconnect` est appelé pour recharger les données.
 * Le retour sur l'onglet (déverrouillage du téléphone, changement d'onglet)
 * déclenche aussi une vérification immédiate + rechargement.
 */
export function subscribe(handlers, onReconnect) {
  let es = null;
  let lastActivity = Date.now();
  let closed = false;

  const open = () => {
    try {
      es?.close();
    } catch {
      /* déjà fermé */
    }
    es = new EventSource('/api/events');
    es.onopen = () => {
      lastActivity = Date.now();
    };
    es.addEventListener('hb', () => {
      lastActivity = Date.now();
    });
    for (const [event, fn] of Object.entries(handlers)) {
      es.addEventListener(event, (e) => {
        lastActivity = Date.now();
        try {
          fn(JSON.parse(e.data));
        } catch {
          /* données illisibles */
        }
      });
    }
  };
  open();

  const check = (force = false) => {
    if (closed) return;
    if (force || Date.now() - lastActivity > 65_000) {
      open();
      onReconnect?.();
    }
  };
  const timer = setInterval(() => check(), 10_000);
  const onVis = () => {
    if (document.visibilityState === 'visible') check(Date.now() - lastActivity > 30_000);
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    closed = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    try {
      es?.close();
    } catch {
      /* déjà fermé */
    }
  };
}

export const fmtKwh = (v) =>
  v == null ? '—' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 2 : 1 })} kWh`;
export const fmtEur = (v) =>
  v == null ? '—' : v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export const fmtW = (v) => (v == null ? '—' : `${Math.round(v).toLocaleString('fr-FR')} W`);
export const fmtDate = (iso) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function daysAgo(n) {
  return localDate(new Date(Date.now() - n * 86400_000));
}
