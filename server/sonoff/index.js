import { EventEmitter } from 'node:events';
import {
  db,
  upsertDevice,
  insertReading,
  addHourlyWh,
  upsertPlugDaily,
  insertPlugDailyIfAbsent,
  addEvent,
  saveDeviceKeys,
  getSetting,
  setSetting,
} from '../db.js';
import { EwelinkCloud } from './cloud.js';
import { SonoffLan } from './lan.js';

export const sonoffEvents = new EventEmitter();
sonoffEvents.setMaxListeners(100);

export const sonoffStatus = {
  configured: false,
  cloudOnline: false,
  lanDevices: 0,
  deviceCount: 0,
  lastError: null,
};

// uiid des modèles avec mesure de puissance (cf. SonoffLAN devices.py)
// 5=POW, 32=POWR2/S31, 126=DualR3, 182=S40, 190=POWR3/S60TPF, 262, 276=S61STPF, 277
const POWER_UIIDS = new Set([5, 32, 126, 182, 190, 262, 276, 277]);
// modèles dont les valeurs sont des entiers ×100
const X100_UIIDS = new Set([126, 190, 276, 277]);

const registry = new Map(); // deviceid → {deviceid, name, apikey, devicekey, uiid, params, online}
const lastReading = new Map(); // deviceid → {ts, watts}

let cloud = null;
let lan = null;
let timers = [];
let lastIngestTs = Date.now(); // dernier moment où des données d'une prise sont arrivées
let watchdogStarted = false;
// login cloud strictement limité : eWeLink bloque le compte si on se connecte
// trop souvent. Le dernier essai est PERSISTÉ en base → le rate-limit tient même
// après un redémarrage complet du processus (sinon chaque relance retenterait).
let cloudConnecting = false;
let loginBackoffMs = 0;
const MIN_LOGIN_INTERVAL = 10 * 60_000; // au plus un login toutes les 10 min
const lastLoginAt = () => Number(getSetting('cloud_last_login') || 0);
const setLastLoginAt = (ts) => setSetting('cloud_last_login', String(ts));

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Retire les caractères invisibles que l'app eWeLink glisse parfois dans les noms. */
function cleanName(s) {
  return String(s || '')
    .replace(/[\u200B-\u200D\u2060\uFEFF\uFFF9-\uFFFC\uFFFD]/g, '')
    .trim();
}

/** Extrait watts/volts/ampères des params selon le modèle. */
function extractPower(uiid, params) {
  let watts = null,
    volts,
    amps = null;
  if (uiid === 126) {
    // DualR3 : 2 canaux, on additionne
    const p0 = num(params.actPow_00),
      p1 = num(params.actPow_01);
    if (p0 !== null || p1 !== null) watts = ((p0 || 0) + (p1 || 0)) / 100;
    volts = num(params.voltage_00) !== null ? num(params.voltage_00) / 100 : null;
    const c0 = num(params.current_00),
      c1 = num(params.current_01);
    if (c0 !== null || c1 !== null) amps = ((c0 || 0) + (c1 || 0)) / 100;
  } else if (uiid === 262) {
    watts = num(params.phase_0_p);
    volts = num(params.phase_0_v);
    amps = num(params.phase_0_c);
  } else if (X100_UIIDS.has(uiid)) {
    watts = num(params.power) !== null ? num(params.power) / 100 : null;
    volts = num(params.voltage) !== null ? num(params.voltage) / 100 : null;
    amps = num(params.current) !== null ? num(params.current) / 100 : null;
  } else {
    watts = num(params.power);
    volts = num(params.voltage);
    amps = num(params.current);
  }
  return { watts, volts, amps };
}

function startOfHour(ts) {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- Historique de conso stocké par eWeLink (décodage transcrit de SonoffLAN) ----

/** hoursKwhData : 3 caractères par heure — [0]=kWh entiers (hex), [1:3]=centièmes (déc). */
function decodeHours(value) {
  const out = [];
  for (let i = 0; i + 3 <= value.length; i += 3) {
    const int = parseInt(value[i], 16);
    const dec = parseInt(value.slice(i + 1, i + 3), 10);
    if (Number.isNaN(int) || Number.isNaN(dec)) break;
    out.push(int + dec * 0.01);
  }
  return out;
}

/** hundredDaysKwhData : 6 caractères par jour — [0:2]=kWh (hex), [3]=dixièmes, [5]=centièmes. */
function decodeDays(value) {
  const out = [];
  for (let i = 0; i + 6 <= value.length; i += 6) {
    const a = parseInt(value.slice(i, i + 2), 16);
    const b = parseInt(value[i + 3], 10);
    const c = parseInt(value[i + 5], 10);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) break;
    out.push(a + b * 0.1 + c * 0.01);
  }
  return out;
}

/** Historique horaire (index 0 = heure courante, en remontant le temps). */
function backfillHours(deviceId, raw) {
  const values = decodeHours(raw);
  if (values.length === 0) return;
  const hour0 = startOfHour(Date.now());
  const tx = db.transaction(() => {
    for (let i = 1; i < values.length; i++) {
      // i=0 (heure en cours) : l'intégration temps réel s'en charge
      const row = {
        device_id: deviceId,
        hour_start: hour0 - i * 3600_000,
        wh: values[i] * 1000,
        source: 'real',
      };
      if (values[i] > 0) {
        db.prepare(
          `INSERT OR REPLACE INTO plug_energy_hourly (device_id, hour_start, wh, source)
                    VALUES (@device_id, @hour_start, @wh, @source)`,
        ).run(row);
      } else {
        // un zéro peut signifier « pas d'historique » : on ne remplace jamais une mesure existante
        db.prepare(
          `INSERT OR IGNORE INTO plug_energy_hourly (device_id, hour_start, wh, source)
                    VALUES (@device_id, @hour_start, @wh, @source)`,
        ).run(row);
      }
    }
  });
  tx();
  console.log(
    `[sonoff] historique horaire reçu : ${values.length} h pour ${registry.get(deviceId)?.name || deviceId}`,
  );
  sonoffEvents.emit('status');
}

/** Historique quotidien (index 0 = aujourd'hui, en remontant le temps). */
function backfillDays(deviceId, raw) {
  const values = decodeDays(raw);
  if (values.length === 0) return;
  const now = new Date();
  const tx = db.transaction(() => {
    for (let i = 1; i < values.length; i++) {
      // i=0 (aujourd'hui) : dayKwh temps réel s'en charge
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const row = { device_id: deviceId, date: localDate(d), wh: values[i] * 1000, source: 'real' };
      if (values[i] > 0) upsertPlugDaily.run(row);
      else insertPlugDailyIfAbsent.run(row);
    }
  });
  tx();
  console.log(
    `[sonoff] historique quotidien reçu : ${values.length} j pour ${registry.get(deviceId)?.name || deviceId}`,
  );
  sonoffEvents.emit('status');
}

/**
 * Compteurs d'énergie tenus par la prise elle-même (dayKwh… ×0,01 kWh) :
 * valeur complète de la journée même si le PC était éteint → prioritaire
 * sur notre intégration dans les stats.
 */
function captureCounters(deviceId, params) {
  const day = num(params.dayKwh);
  if (day !== null && day >= 0) {
    upsertPlugDaily.run({
      device_id: deviceId,
      date: localDate(),
      wh: day * 0.01 * 1000,
      source: 'real',
    });
  }
}

/** Intègre l'énergie (Wh) entre le relevé précédent et celui-ci, découpée par heure. */
function integrateEnergy(deviceId, ts, watts) {
  const last = lastReading.get(deviceId);
  lastReading.set(deviceId, { ts, watts });
  if (!last) return;
  const dtMs = ts - last.ts;
  if (dtMs <= 0 || dtMs > 300_000) return; // trou de collecte → on n'invente pas d'énergie
  let cursor = last.ts;
  while (cursor < ts) {
    const hourStart = startOfHour(cursor);
    const sliceEnd = Math.min(hourStart + 3600_000, ts);
    const wh = (last.watts * (sliceEnd - cursor)) / 3600_000;
    if (wh > 0) addHourlyWh.run({ device_id: deviceId, hour_start: hourStart, wh, source: 'real' });
    cursor = sliceEnd;
  }
}

function ingestParams(deviceid, params, via) {
  const dev = registry.get(deviceid);
  if (!dev) return;
  lastIngestTs = Date.now();
  Object.assign(dev.params, params);
  if (!dev.online) {
    addEvent('online', `${dev.name} est de retour en ligne`, deviceid);
  }
  dev.online = true;

  // état on/off de la prise (formats switch simple ou switches[] selon modèle)
  const sw = Array.isArray(params.switches) ? params.switches[0]?.switch : params.switch;
  if (sw === 'on' || sw === 'off') {
    db.prepare('UPDATE devices SET switch_state = ? WHERE id = ?').run(sw, deviceid);
  }

  captureCounters(deviceid, params);
  if (typeof params.hoursKwhData === 'string') backfillHours(deviceid, params.hoursKwhData);
  if (typeof params.hundredDaysKwhData === 'string')
    backfillDays(deviceid, params.hundredDaysKwhData);

  const { watts, volts, amps } = extractPower(dev.uiid, params);
  const ts = Date.now();
  upsertDevice.run({
    id: deviceid,
    name: dev.name,
    room: '',
    model: `uiid ${dev.uiid}`,
    online: 1,
    source: 'real',
    last_seen: ts,
  });
  if (watts === null) return;

  // le cache cloud peut dater de plusieurs minutes : il ne sert que si le LAN est muet
  if (via === 'cloud') {
    const last = lastReading.get(deviceid);
    if (last && ts - last.ts < 45_000) return;
  }

  insertReading.run({ device_id: deviceid, ts, watts, volts, amps, source: 'real' });
  integrateEnergy(deviceid, ts, watts);
  sonoffEvents.emit('reading', {
    deviceId: deviceid,
    name: dev.name,
    ts,
    watts,
    volts,
    amps,
    via,
  });
}

/**
 * Demande aux prises leur historique de conso stocké chez eWeLink :
 * - getHoursKwh (30 jours × 24 h) : d'abord en LAN (POW R3 / S60, réponse
 *   chiffrée), sinon via le cloud ;
 * - hundredDaysKwh (100 jours quotidiens) : via le cloud (anciens modèles).
 * Les modèles qui ne connaissent pas la commande l'ignorent simplement.
 */
async function requestHistory() {
  for (const dev of registry.values()) {
    if (!POWER_UIIDS.has(dev.uiid)) continue;
    const params = { getHoursKwh: { start: 0, end: 24 * 30 - 1 } };
    const okLan = await lan.send(dev.deviceid, 'getHoursKwh', params, 5000);
    if (!okLan) cloud.updateDevice(dev, params);
    cloud.updateDevice(dev, { hundredDaysKwh: 'get' });
    await new Promise((r) => setTimeout(r, 800));
  }
}

/**
 * Repli cloud (toutes les 60 s) : relit l'état en cache de toutes les prises en
 * UNE requête REST (indépendante du WebSocket, donc fiable même après des
 * coupures) — puissance, tension, dayKwh… Les valeurs ne remplacent le LAN que
 * s'il est muet. On en profite pour demander les rapports temps réel (uiActive).
 */
let pollingSince = 0; // garde de réentrance avec expiration : un poll gelé ne bloque jamais les suivants
async function cloudPollLoop() {
  if (!cloud?.auth) return;
  if (pollingSince && Date.now() - pollingSince < 180_000) return;
  pollingSince = Date.now();
  try {
    const devices = await cloud.getDevices();
    for (const d of devices) {
      const dev = registry.get(d.deviceid);
      if (!dev || !POWER_UIIDS.has(dev.uiid)) continue;
      dev.online = Boolean(d.online);
      if (d.online && d.params) {
        ingestParams(d.deviceid, d.params, 'cloud');
      } else if (!d.online) {
        db.prepare('UPDATE devices SET online = 0 WHERE id = ?').run(d.deviceid);
      }
    }
    for (const dev of registry.values()) {
      if (POWER_UIIDS.has(dev.uiid) && dev.online) cloud.updateDevice(dev, { uiActive: 60 });
    }
    sonoffStatus.cloudOnline = true;
  } catch {
    sonoffStatus.cloudOnline = false;
    // token invalidé/expiré → on programme un ré-login RESPECTANT le rate-limit
    // (jamais de login immédiat en boucle : c'est ce qui faisait bloquer le compte)
    cloud.auth = null;
    connectCloud();
  } finally {
    pollingSince = 0;
  }
}

let tickleCount = 0;
let tickling = false;
async function tickleLoop() {
  if (tickling) return; // un tour lent (prises injoignables) ne doit pas s'empiler
  tickling = true;
  tickleCount++;
  try {
    // Les prises n'émettent leurs mesures que si on les « réveille » régulièrement :
    // on renvoie leur propre réglage de LED (sans le changer), ce qui déclenche
    // une annonce mDNS avec les données de puissance (astuce SonoffLAN).
    for (const dev of registry.values()) {
      if (!POWER_UIIDS.has(dev.uiid)) continue;
      if (dev.uiid === 126) {
        await lan.send(dev.deviceid, 'statistics', {});
      } else {
        const led = dev.params.sledOnline || 'on';
        await lan.send(dev.deviceid, 'sledonline', { sledOnline: led });
      }
      // toutes les ~30 s : getState direct — sa réponse HTTP contient l'état complet,
      // ce qui fournit les mesures même si la réception multicast (mDNS) est cassée
      if (tickleCount % 3 === 0) await lan.send(dev.deviceid, 'getState', {});
      await new Promise((r) => setTimeout(r, 200)); // étale la charge
    }
  } finally {
    tickling = false;
  }
}

async function availabilityLoop() {
  const now = Date.now();
  for (const dev of registry.values()) {
    const seen = db
      .prepare('SELECT last_seen FROM devices WHERE id = ?')
      .get(dev.deviceid)?.last_seen;
    if (seen && now - seen > 300_000 && dev.online) {
      dev.online = false;
      db.prepare('UPDATE devices SET online = 0 WHERE id = ?').run(dev.deviceid);
      addEvent('offline', `${dev.name} ne répond plus (ni LAN ni cloud)`, dev.deviceid);
      sonoffEvents.emit('status');
    }
  }
  sonoffStatus.lanDevices = lan ? lan.activeCount() : 0;
}

/** Recharge le registre (clés incluses) depuis la base — permet au LAN de tourner sans cloud. */
function loadRegistryFromDb() {
  const rows = db
    .prepare('SELECT id, name, devicekey, apikey, uiid FROM devices WHERE devicekey IS NOT NULL')
    .all();
  for (const r of rows) {
    registry.set(r.id, {
      deviceid: r.id,
      name: r.name,
      apikey: r.apikey,
      devicekey: r.devicekey,
      uiid: r.uiid,
      params: {},
      online: false,
    });
  }
  sonoffStatus.deviceCount = [...registry.values()].filter((d) => POWER_UIIDS.has(d.uiid)).length;
  return rows.length;
}

export async function startSonoff() {
  stopSonoff(); // idempotent : nettoie toute incarnation précédente (timers, sockets)
  if (getSetting('ewelink_enabled') !== '1') {
    sonoffStatus.configured = false;
    sonoffStatus.lastError = null;
    console.log('[sonoff] connecteur eWeLink désactivé');
    return;
  }
  const email = getSetting('ewelink_email') || process.env.EWELINK_EMAIL;
  const password = getSetting('ewelink_password') || process.env.EWELINK_PASSWORD;
  const region = getSetting('ewelink_region') || process.env.EWELINK_REGION || 'eu';
  sonoffStatus.configured = Boolean(email && password);
  if (!sonoffStatus.configured) {
    console.log('[sonoff] EWELINK_EMAIL / EWELINK_PASSWORD absents du .env — module inactif');
    return;
  }

  // 1) LAN EN PREMIER, avec les clés persistées : la collecte locale démarre
  //    immédiatement, sans dépendre d'un login cloud (qui peut être bloqué).
  const known = loadRegistryFromDb();
  console.log(
    `[sonoff] ${known} prise(s) chargée(s) depuis la base — collecte LAN active sans attendre le cloud`,
  );

  lan = new SonoffLan(
    (id) => registry.get(id)?.devicekey,
    (id, params) => ingestParams(id, params, 'lan'),
    (id, host) => db.prepare('UPDATE devices SET host = ? WHERE id = ?').run(host, id),
  );
  lan.setHosts(
    db
      .prepare('SELECT id, host FROM devices WHERE host IS NOT NULL')
      .all()
      .map((r) => [r.id, r.host]),
  );
  lan.start();

  cloud = new EwelinkCloud({ email, password, region });
  cloud.onUpdate = ({ deviceid, params }) => ingestParams(deviceid, params, 'cloud');
  cloud.onOnline = (deviceid, online) => {
    const dev = registry.get(deviceid);
    if (dev) dev.online = online;
    db.prepare('UPDATE devices SET online = ? WHERE id = ?').run(online ? 1 : 0, deviceid);
    sonoffEvents.emit('status');
  };

  // 2) Boucles démarrées TOUT DE SUITE (le LAN fonctionne sans cloud)
  timers.push(setInterval(tickleLoop, 10_000));
  timers.push(setInterval(availabilityLoop, 30_000));
  timers.push(setInterval(cloudPollLoop, 60_000));
  timers.push(setInterval(requestHistory, 6 * 3600_000));
  timers.push(setTimeout(requestHistory, 20_000));
  startWatchdog();

  // 3) Cloud EN ARRIÈRE-PLAN, non bloquant et rate-limité (voir connectCloud)
  connectCloud();
}

/**
 * Établit/rétablit la connexion cloud eWeLink SANS jamais marteler le login :
 * au plus une tentative toutes les 10 min (backoff en cas d'échec). Le cloud
 * n'est qu'un complément — il rafraîchit les clés, fournit le repli et le
 * pilotage. Son indisponibilité n'empêche jamais la collecte LAN.
 */
async function connectCloud() {
  if (cloudConnecting || !cloud) return;
  if (cloud.auth && cloud.wsOnline) return; // déjà connecté
  const prev = lastLoginAt();
  const since = Date.now() - prev;
  const wait = Math.max(MIN_LOGIN_INTERVAL, loginBackoffMs) - since;
  if (prev && wait > 0) {
    // trop tôt pour retenter (rate-limit persistant) — on reprogramme une fois
    timers.push(setTimeout(connectCloud, Math.min(wait + 1000, MIN_LOGIN_INTERVAL)));
    return;
  }

  cloudConnecting = true;
  setLastLoginAt(Date.now());
  try {
    await cloud.login();
    const devices = await cloud.getDevices();

    for (const row of db.prepare('SELECT id, name FROM devices').all()) {
      const c = cleanName(row.name);
      if (c !== row.name)
        db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(c || row.id, row.id);
    }
    for (const d of devices) {
      const uiid = d.extra?.uiid;
      const name = cleanName(d.name) || d.deviceid;
      const existing = registry.get(d.deviceid) || {};
      registry.set(d.deviceid, {
        ...existing,
        deviceid: d.deviceid,
        name,
        apikey: d.apikey,
        devicekey: d.devicekey,
        uiid,
        params: { ...(existing.params || {}), ...(d.params || {}) },
        online: Boolean(d.online),
      });
      upsertDevice.run({
        id: d.deviceid,
        name,
        room: '',
        model: `uiid ${uiid}`,
        online: d.online ? 1 : 0,
        source: 'real',
        last_seen: d.online ? Date.now() : null,
      });
      // les clés en base : c'est ce qui permet au LAN de survivre sans le cloud
      saveDeviceKeys.run({ id: d.deviceid, name, apikey: d.apikey, devicekey: d.devicekey, uiid });
      if (d.params && POWER_UIIDS.has(uiid)) captureCounters(d.deviceid, d.params);
    }
    sonoffStatus.deviceCount = [...registry.values()].filter((d) => POWER_UIIDS.has(d.uiid)).length;

    await cloud.connectWs();
    sonoffStatus.cloudOnline = true;
    sonoffStatus.lastError = null;
    loginBackoffMs = 0;
    console.log('[sonoff] cloud connecté, clés des prises rafraîchies en base');
  } catch (err) {
    sonoffStatus.cloudOnline = false;
    sonoffStatus.lastError = err.message;
    // backoff exponentiel plafonné à 60 min — on ne réessaie JAMAIS agressivement
    loginBackoffMs = Math.min(
      loginBackoffMs ? loginBackoffMs * 2 : MIN_LOGIN_INTERVAL,
      60 * 60_000,
    );
    console.error(
      `[sonoff] cloud indisponible (${err.message}) — nouvelle tentative dans ${Math.round(loginBackoffMs / 60000)} min ; le LAN continue`,
    );
    timers.push(setTimeout(connectCloud, loginBackoffMs + 1000));
  } finally {
    cloudConnecting = false;
  }
}

/**
 * Chien de garde : si plus aucune donnée de prise n'arrive alors que tout est
 * configuré, on répare tout seul — redémarrage interne du module à 5 min de
 * silence, redémarrage complet du processus à 15 min (le lanceur le relance).
 */
function startWatchdog() {
  if (watchdogStarted) return;
  watchdogStarted = true;
  setInterval(async () => {
    if (!sonoffStatus.configured || registry.size === 0) return;
    const silence = Date.now() - lastIngestTs;
    // Escalade ultime : process relancé par le lanceur. Sans effet néfaste car
    // le login cloud reste rate-limité (horodatage persisté en base).
    if (silence > 20 * 60_000) {
      console.error('[watchdog] aucune donnée depuis 20 min — redémarrage complet du processus');
      process.exit(1);
    }
    // Relance interne du LAN (re-découverte mDNS) : peut débloquer un souci réseau.
    // N'impacte pas le cloud grâce au rate-limit du login.
    if (silence > 6 * 60_000) {
      console.warn('[watchdog] aucune donnée depuis 6 min — relance interne (LAN + mDNS)');
      lastIngestTs = Date.now() - 12 * 60_000; // laisse ~8 min avant l'escalade process
      try {
        stopSonoff();
        registry.clear();
        lastReading.clear();
        pollingSince = 0;
        tickling = false;
        await startSonoff();
      } catch (err) {
        console.error('[watchdog] échec de la relance interne :', err.message);
      }
    }
  }, 60_000).unref();
}

export function listDevices() {
  // Les clés LAN (apikey/devicekey) restent exclusivement dans la base locale.
  return db
    .prepare(
      `
    SELECT id, name, room, model, online, source, last_seen, host, switch_state, uiid
    FROM devices
    ORDER BY name
  `,
    )
    .all();
}

/**
 * Allume ou éteint une prise : tentative LAN d'abord (immédiate), sinon via
 * l'API REST cloud. Lève une erreur si aucune voie n'aboutit.
 */
export async function setSwitch(deviceid, on) {
  const dev = registry.get(deviceid);
  if (!dev) throw new Error('appareil inconnu du compte eWeLink');
  const state = on ? 'on' : 'off';
  const useArray = Array.isArray(dev.params.switches);
  const params = useArray ? { switches: [{ switch: state, outlet: 0 }] } : { switch: state };

  const okLan = await lan?.send(deviceid, useArray ? 'switches' : 'switch', params);
  if (!okLan) {
    await cloud.setDeviceStatus(dev, params); // lève en cas d'échec
  }
  db.prepare('UPDATE devices SET switch_state = ? WHERE id = ?').run(state, deviceid);
  addEvent('switch', `${dev.name} ${on ? 'allumée' : 'éteinte'} depuis le dashboard`, deviceid, 0);
  // rafraîchit l'état réel peu après (la prise confirme par LAN/cloud)
  setTimeout(() => {
    try {
      cloud.queryDevice(dev);
    } catch {
      /* WS fermé */
    }
  }, 2_000);
  return state;
}

export function stopSonoff() {
  for (const h of timers) clearInterval(h);
  timers = [];
  try {
    cloud?.stop();
  } catch {
    /* déjà arrêté */
  }
  try {
    lan?.stop();
  } catch {
    /* déjà arrêté */
  }
  cloud = null;
  lan = null;
  sonoffStatus.cloudOnline = false;
  sonoffStatus.lanDevices = 0;
}
