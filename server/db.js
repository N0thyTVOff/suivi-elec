import Database from 'better-sqlite3';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Émet 'event' à chaque nouvel événement du journal (relayé en SSE). */
export const appEvents = new EventEmitter();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'elec.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS devices (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  room      TEXT NOT NULL DEFAULT '',
  model     TEXT NOT NULL DEFAULT '',
  online    INTEGER NOT NULL DEFAULT 0,
  source    TEXT NOT NULL DEFAULT 'real',
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS plug_readings (
  device_id TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  watts     REAL NOT NULL,
  volts     REAL,
  amps      REAL,
  source    TEXT NOT NULL DEFAULT 'real',
  PRIMARY KEY (device_id, ts)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS plug_energy_hourly (
  device_id  TEXT NOT NULL,
  hour_start INTEGER NOT NULL,
  wh         REAL NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'real',
  PRIMARY KEY (device_id, hour_start)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS plug_energy_daily (
  device_id TEXT NOT NULL,
  date      TEXT NOT NULL,
  wh        REAL NOT NULL,
  source    TEXT NOT NULL DEFAULT 'real',
  PRIMARY KEY (device_id, date)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS linky_daily (
  date   TEXT PRIMARY KEY,
  wh     REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'real'
);

-- Relevés manuels de l'index du compteur (en attendant les données Enedis)
CREATE TABLE IF NOT EXISTS meter_index (
  date      TEXT PRIMARY KEY,
  index_kwh REAL NOT NULL,
  created   INTEGER
);

-- Échéancier de mensualisation (montants fixes prélevés, hors régularisation)
CREATE TABLE IF NOT EXISTS installments (
  date   TEXT PRIMARY KEY,
  amount REAL NOT NULL
);

-- Journal d'événements (prise hors ligne, surcharge, données Enedis reçues…)
CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  type      TEXT NOT NULL,
  device_id TEXT,
  message   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS linky_load_curve (
  ts           INTEGER PRIMARY KEY,
  watts        REAL NOT NULL,
  interval_min INTEGER NOT NULL DEFAULT 30,
  source       TEXT NOT NULL DEFAULT 'real'
);

CREATE TABLE IF NOT EXISTS linky_max_power (
  date   TEXT PRIMARY KEY,
  va     REAL NOT NULL,
  ts     INTEGER,
  source TEXT NOT NULL DEFAULT 'real'
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_readings_ts ON plug_readings (ts);
CREATE INDEX IF NOT EXISTS idx_hourly_start ON plug_energy_hourly (hour_start);
`);

const hadExistingSettings = db.prepare('SELECT COUNT(*) AS n FROM settings').get().n > 0;

// Valeurs par défaut. Une installation existante conserve son comportement :
// l'onboarding et l'authentification ne lui sont pas imposés brutalement.
const DEFAULT_SETTINGS = {
  price_kwh: '0.2016', // €/kWh TTC
  subscription_month: '13.09', // € TTC / mois (abonnement)
  kva: '6', // puissance souscrite
  supplier_name: 'EDF',
  offer_name: 'Tarif Bleu',
  tariff_type: 'base', // base, hphc, tempo, ejp ou custom
  price_hp: '0.2146',
  price_hc: '0.1696',
  offpeak_share: '0.40',
  tempo_blue_hp: '0.1609',
  tempo_blue_hc: '0.1296',
  tempo_white_hp: '0.1894',
  tempo_white_hc: '0.1486',
  tempo_red_hp: '0.7562',
  tempo_red_hc: '0.1568',
  ejp_normal: '0.1758',
  ejp_peak: '1.5197',
  conso_token: '', // token Conso API (conso.boris.sh)
  prm: '', // numéro PRM / PDL (14 chiffres)
  linky_enabled: hadExistingSettings ? '1' : '0',
  ewelink_enabled:
    hadExistingSettings && process.env.EWELINK_EMAIL && process.env.EWELINK_PASSWORD ? '1' : '0',
  ewelink_email: '',
  ewelink_password: '',
  ewelink_region: process.env.EWELINK_REGION || 'eu',
  onboarding_completed: hadExistingSettings ? '1' : '0',
  server_auth_enabled: hadExistingSettings ? '0' : '1',
  server_token_hash: '',
  demo_mode: '0',
  raw_retention_days: '30',
  budget_month_eur: '', // objectif de facture mensuelle (vide = désactivé)
  // Période de facturation (mensualisation) : bornes de la régularisation
  billing_start: new Date().toISOString().slice(0, 10), // à adapter au contrat
  billing_end: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
    .toISOString()
    .slice(0, 10),
  // Composition du « reste non mesuré » (Linky − prises) propre au logement
  unmetered_note: 'Appareils et circuits non reliés à une prise connectée.',
};

// migrations : colonnes ajoutées après coup sur les appareils existants
const deviceCols = db
  .prepare('PRAGMA table_info(devices)')
  .all()
  .map((c) => c.name);
if (!deviceCols.includes('host')) db.exec('ALTER TABLE devices ADD COLUMN host TEXT');
if (!deviceCols.includes('switch_state'))
  db.exec('ALTER TABLE devices ADD COLUMN switch_state TEXT');
// clés de déchiffrement LAN persistées → le local fonctionne sans login cloud
if (!deviceCols.includes('apikey')) db.exec('ALTER TABLE devices ADD COLUMN apikey TEXT');
if (!deviceCols.includes('devicekey')) db.exec('ALTER TABLE devices ADD COLUMN devicekey TEXT');
if (!deviceCols.includes('uiid')) db.exec('ALTER TABLE devices ADD COLUMN uiid INTEGER');

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
);

export function getSetting(key) {
  const row = getSettingStmt.get(key);
  return row ? row.value : null;
}
export function setSetting(key, value) {
  setSettingStmt.run(key, String(value));
}
export function allSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

export const upsertDevice = db.prepare(`
  INSERT INTO devices (id, name, room, model, online, source, last_seen)
  VALUES (@id, @name, @room, @model, @online, @source, @last_seen)
  ON CONFLICT(id) DO UPDATE SET
    model = excluded.model, online = excluded.online, last_seen = excluded.last_seen
`);

/** Persiste les clés (apikey/devicekey/uiid) pour un fonctionnement LAN sans cloud. */
export const saveDeviceKeys = db.prepare(`
  UPDATE devices SET apikey = @apikey, devicekey = @devicekey, uiid = @uiid, name = @name
  WHERE id = @id
`);

export const insertReading = db.prepare(`
  INSERT OR REPLACE INTO plug_readings (device_id, ts, watts, volts, amps, source)
  VALUES (@device_id, @ts, @watts, @volts, @amps, @source)
`);

export const addHourlyWh = db.prepare(`
  INSERT INTO plug_energy_hourly (device_id, hour_start, wh, source)
  VALUES (@device_id, @hour_start, @wh, @source)
  ON CONFLICT(device_id, hour_start) DO UPDATE SET wh = wh + excluded.wh
`);

export const upsertPlugDaily = db.prepare(`
  INSERT OR REPLACE INTO plug_energy_daily (device_id, date, wh, source)
  VALUES (@device_id, @date, @wh, @source)
`);
export const insertPlugDailyIfAbsent = db.prepare(`
  INSERT OR IGNORE INTO plug_energy_daily (device_id, date, wh, source)
  VALUES (@device_id, @date, @wh, @source)
`);

export const upsertLinkyDaily = db.prepare(`
  INSERT OR REPLACE INTO linky_daily (date, wh, source) VALUES (@date, @wh, @source)
`);
export const upsertLoadCurve = db.prepare(`
  INSERT OR REPLACE INTO linky_load_curve (ts, watts, interval_min, source)
  VALUES (@ts, @watts, @interval_min, @source)
`);
export const upsertMaxPower = db.prepare(`
  INSERT OR REPLACE INTO linky_max_power (date, va, ts, source) VALUES (@date, @va, @ts, @source)
`);

/**
 * Ajoute un événement au journal (avec anti-doublon : même type + même appareil
 * dans la fenêtre `dedupMin` → ignoré). Retourne true si l'événement est inséré.
 */
export function addEvent(type, message, deviceId = null, dedupMin = 10) {
  const recent = db
    .prepare(
      `
    SELECT 1 FROM events
    WHERE type = ? AND IFNULL(device_id, '') = IFNULL(?, '') AND ts > ?
  `,
    )
    .get(type, deviceId, Date.now() - dedupMin * 60_000);
  if (recent) return false;
  db.prepare('INSERT INTO events (ts, type, device_id, message) VALUES (?, ?, ?, ?)').run(
    Date.now(),
    type,
    deviceId,
    message,
  );
  db.prepare(
    'DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY ts DESC LIMIT 300)',
  ).run();
  appEvents.emit('event', { ts: Date.now(), type, deviceId, message });
  return true;
}

export function listEvents(limit = 50) {
  return db
    .prepare('SELECT ts, type, device_id, message FROM events ORDER BY ts DESC LIMIT ?')
    .all(limit);
}

/** Purge des relevés bruts au-delà de la rétention (les agrégats horaires sont conservés). */
export function purgeOldReadings() {
  const days = Number(getSetting('raw_retention_days')) || 30;
  const cutoff = Date.now() - days * 86400_000;
  db.prepare('DELETE FROM plug_readings WHERE ts < ?').run(cutoff);
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Recalcule les conso quotidiennes « manuelles » à partir des relevés d'index
 * du compteur. La différence entre deux relevés est attribuée au(x) jour(s)
 * se TERMINANT au second relevé : 7096 hier → 7101 aujourd'hui = 5 kWh
 * comptés AUJOURD'HUI. Un trou de plusieurs jours est réparti uniformément.
 * Les journées déjà couvertes par de vraies données Enedis ne sont jamais
 * écrasées (Enedis est prioritaire).
 */
export function recomputeManualDaily() {
  const entries = db.prepare('SELECT date, index_kwh FROM meter_index ORDER BY date').all();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM linky_daily WHERE source = 'manual'").run();
    const ins = db.prepare(`
      INSERT INTO linky_daily (date, wh, source) VALUES (?, ?, 'manual')
      ON CONFLICT(date) DO UPDATE SET wh = excluded.wh, source = 'manual'
      WHERE linky_daily.source != 'real'
    `);
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1];
      const b = entries[i];
      const diffKwh = b.index_kwh - a.index_kwh;
      if (diffKwh < 0) continue; // index décroissant = erreur de saisie, ignorée
      const d1 = new Date(a.date + 'T12:00:00');
      const d2 = new Date(b.date + 'T12:00:00');
      const days = Math.round((d2 - d1) / 86400_000);
      if (days <= 0) continue;
      const whPerDay = (diffKwh * 1000) / days;
      for (let j = 1; j <= days; j++) {
        const d = new Date(d1);
        d.setDate(d1.getDate() + j);
        ins.run(localDateStr(d), whPerDay);
      }
    }
  });
  tx();
}

/** Supprime toutes les données de démonstration. */
export function purgeDemoData() {
  const tx = db.transaction(() => {
    for (const t of [
      'plug_readings',
      'plug_energy_hourly',
      'linky_daily',
      'linky_load_curve',
      'linky_max_power',
      'devices',
    ]) {
      db.prepare(`DELETE FROM ${t} WHERE source = 'demo'`).run();
    }
  });
  tx();
}
