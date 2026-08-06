import { EventEmitter } from 'node:events';
import {
  db,
  getSetting,
  setSetting,
  upsertLinkyDaily,
  upsertLoadCurve,
  upsertMaxPower,
  addEvent,
} from './db.js';

const API_BASE = 'https://conso.boris.sh/api';
const USER_AGENT = 'Wattelier (application locale de suivi de consommation)';

export const linkyEvents = new EventEmitter();

export const linkyStatus = {
  configured: false,
  lastSync: null, // epoch ms de la dernière synchro réussie
  lastError: null, // message d'erreur lisible
  daysInDb: 0,
  waitingForData: false, // true si le compteur ne renvoie encore rien (Linky récent)
};

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
// Enedis renvoie des dates locales "YYYY-MM-DD HH:mm:ss" → Date locale
function parseLocal(s) {
  const [datePart, timePart = '00:00:00'] = s.split(' ');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, se] = timePart.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, se);
}
function parseIntervalMin(s) {
  const m = /PT(\d+)M/.exec(s || '');
  return m ? Number(m[1]) : 30;
}

async function apiCall(type, start, end) {
  const token = getSetting('conso_token');
  const prm = getSetting('prm');
  const url = `${API_BASE}/${type}?prm=${encodeURIComponent(prm)}&start=${start}&end=${end}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401)
    throw Object.assign(new Error('Token Conso API invalide ou PRM non autorisé'), { code: 401 });
  if (res.status === 404) return null; // pas de données sur cette période
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Enedis renvoie souvent une erreur quand il n'y a aucune donnée sur la période
    if (/no.*data|aucune donnée|not found/i.test(body)) return null;
    throw Object.assign(new Error(`Conso API ${type} → HTTP ${res.status} ${body.slice(0, 200)}`), {
      code: res.status,
    });
  }
  return res.json();
}

function readings(json) {
  return json && Array.isArray(json.interval_reading) ? json.interval_reading : [];
}

/** Erreur Enedis « période antérieure à l'activation du compteur » (Linky récent). */
function isAnteriorError(err) {
  return err.code === 400 && /anterior|activation/i.test(err.message);
}

/**
 * Exécute fetchFn(start, end) en avançant start par dichotomie si Enedis répond
 * que la période précède l'activation du compteur : permet de récupérer les
 * quelques jours disponibles d'un Linky posé récemment sans connaître sa date
 * d'activation. Retourne 0 si aucune journée complète n'est encore disponible.
 */
async function withAdaptiveStart(fetchFn, start, end) {
  let s = start;
  for (let i = 0; i < 8; i++) {
    try {
      return await fetchFn(s, end);
    } catch (err) {
      if (!isAnteriorError(err)) throw err;
      const spanMs = end.getTime() - s.getTime();
      if (spanMs <= 1.5 * 86400_000) return 0;
      s = new Date(end.getTime() - spanMs / 2);
    }
  }
  return 0;
}

/** Récupère la conso quotidienne sur [start, end) et l'enregistre. Retourne le nb de jours reçus. */
async function fetchDaily(start, end) {
  const json = await apiCall('daily_consumption', fmtDate(start), fmtDate(end));
  let n = 0;
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      upsertLinkyDaily.run({ date: r.date.split(' ')[0], wh: Number(r.value), source: 'real' });
      n++;
    }
  });
  tx(readings(json));
  return n;
}

/** Courbe de charge 30 min sur [start, end) — max ~7 jours par appel côté Enedis. */
async function fetchLoadCurve(start, end) {
  const json = await apiCall('consumption_load_curve', fmtDate(start), fmtDate(end));
  const rows = readings(json);
  const tx = db.transaction((items) => {
    for (const r of items) {
      const intervalMin = parseIntervalMin(r.interval_length);
      // La date Enedis marque la FIN de l'intervalle → on stocke le début
      const ts = parseLocal(r.date).getTime() - intervalMin * 60_000;
      upsertLoadCurve.run({
        ts,
        watts: Number(r.value),
        interval_min: intervalMin,
        source: 'real',
      });
    }
  });
  tx(rows);
  return rows.length;
}

/** Puissance max quotidienne (VA) sur [start, end). */
async function fetchMaxPower(start, end) {
  const json = await apiCall('consumption_max_power', fmtDate(start), fmtDate(end));
  const rows = readings(json);
  const tx = db.transaction((items) => {
    for (const r of items) {
      upsertMaxPower.run({
        date: r.date.split(' ')[0],
        va: Number(r.value),
        ts: r.date.includes(' ') ? parseLocal(r.date).getTime() : null,
        source: 'real',
      });
    }
  });
  tx(rows);
  return rows.length;
}

function refreshCounters() {
  const prev = linkyStatus.daysInDb;
  linkyStatus.daysInDb = db
    .prepare("SELECT COUNT(*) AS n FROM linky_daily WHERE source = 'real'")
    .get().n;
  if (prev === 0 && linkyStatus.daysInDb > 0) {
    addEvent(
      'linky',
      `🎉 Premières données Enedis reçues (${linkyStatus.daysInDb} jour(s) d'historique)`,
    );
  }
}

/** Synchro courante : les derniers jours (appelée toutes les heures). */
export async function syncRecent() {
  if (getSetting('linky_enabled') !== '1') {
    linkyStatus.configured = false;
    linkyStatus.lastError = null;
    return;
  }
  const token = getSetting('conso_token');
  const prm = getSetting('prm');
  linkyStatus.configured = Boolean(token && prm);
  if (!linkyStatus.configured) return;

  const today = new Date();
  try {
    // Enedis exige end ≤ aujourd'hui (end est exclusif → couvre jusqu'à hier,
    // les données du jour ne sont de toute façon publiées que le lendemain)
    const nDaily = await withAdaptiveStart(fetchDaily, addDays(today, -8), today);
    await withAdaptiveStart(fetchMaxPower, addDays(today, -8), today);
    const nCurve = await withAdaptiveStart(fetchLoadCurve, addDays(today, -4), today);
    linkyStatus.lastSync = Date.now();
    linkyStatus.lastError = null;
    linkyStatus.waitingForData = nDaily === 0 && nCurve === 0;
    refreshCounters();
    linkyEvents.emit('updated');
  } catch (err) {
    // Un Linky tout juste activé fait répondre « technical_error » (500) à Enedis
    // tant que la collecte n'a pas démarré : c'est une attente normale, pas une panne
    if (err.code === 500 && linkyStatus.daysInDb === 0) {
      linkyStatus.lastError = null;
      linkyStatus.waitingForData = true;
      console.log(
        '[linky] Enedis répond 500 sans aucune donnée en base — compteur récent, on retentera',
      );
    } else {
      linkyStatus.lastError = err.message;
      console.error('[linky] sync :', err.message);
    }
  }
}

/**
 * Rattrapage de l'historique : remonte le temps par tranches tant qu'Enedis renvoie
 * des données (12 mois max). Sans effet si déjà fait ou si le compteur est trop récent.
 */
export async function backfill() {
  if (getSetting('linky_enabled') !== '1') return;
  const token = getSetting('conso_token');
  const prm = getSetting('prm');
  if (!token || !prm) return;
  if (getSetting('linky_backfill_done') === '1') return;

  try {
    const today = new Date();
    // Conso quotidienne : par tranches de 120 jours, 12 mois en arrière max.
    // Si une tranche précède l'activation du compteur, on récupère ce qui existe
    // (dichotomie) puis on arrête de remonter le temps.
    let gotAny = false;
    for (let i = 0; i < 3; i++) {
      const end = addDays(today, -120 * i);
      const start = addDays(end, -120);
      let n;
      let hitActivation = false;
      try {
        n = await fetchDaily(start, end);
      } catch (err) {
        if (!isAnteriorError(err)) throw err;
        n = await withAdaptiveStart(fetchDaily, start, end);
        hitActivation = true;
      }
      if (n > 0) gotAny = true;
      if (hitActivation || (n === 0 && i > 0)) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
    // Courbe de charge : 4 semaines en arrière, par tranches de 6 jours
    for (let i = 0; i < 5; i++) {
      const end = addDays(today, -6 * i);
      const start = addDays(end, -6);
      let n;
      let hitActivation = false;
      try {
        n = await fetchLoadCurve(start, end);
      } catch (err) {
        if (!isAnteriorError(err)) throw err;
        await withAdaptiveStart(fetchLoadCurve, start, end);
        hitActivation = true;
      }
      if (hitActivation || (n === 0 && i > 0)) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
    await withAdaptiveStart(fetchMaxPower, addDays(today, -120), today);

    if (gotAny) {
      // On ne marque le rattrapage comme terminé qu'une fois de vraies données reçues
      setSetting('linky_backfill_done', '1');
    }
    refreshCounters();
    linkyEvents.emit('updated');
  } catch (err) {
    if (err.code === 500 && linkyStatus.daysInDb === 0) {
      linkyStatus.waitingForData = true;
      console.log(
        '[linky] backfill : Enedis répond 500 sans aucune donnée — compteur récent, on retentera',
      );
    } else {
      linkyStatus.lastError = err.message;
      console.error('[linky] backfill :', err.message);
    }
  }
}

let timer = null;
export function startLinky() {
  stopLinky();
  refreshCounters();
  if (getSetting('linky_enabled') !== '1') {
    linkyStatus.configured = false;
    linkyStatus.lastError = null;
    linkyStatus.waitingForData = false;
    return;
  }
  // Au démarrage : synchro + rattrapage, puis synchro toutes les heures
  (async () => {
    await syncRecent();
    await backfill();
  })();
  timer = setInterval(syncRecent, 3600_000);
}
export function stopLinky() {
  if (timer) clearInterval(timer);
  timer = null;
}
