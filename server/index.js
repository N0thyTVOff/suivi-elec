import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import {
  db,
  DATA_DIR,
  allSettings,
  setSetting,
  getSetting,
  purgeOldReadings,
  purgeDemoData,
  recomputeManualDaily,
  addEvent,
  listEvents,
  appEvents,
} from './db.js';
import { startLinky, stopLinky, syncRecent, backfill, linkyStatus, linkyEvents } from './linky.js';
import {
  startSonoff,
  stopSonoff,
  sonoffStatus,
  sonoffEvents,
  listDevices,
  setSwitch,
} from './sonoff/index.js';
import {
  isOmajinDevice,
  omajinEvents,
  omajinStatus,
  setOmajinSwitch,
  startOmajin,
  stopOmajin,
} from './omajin/index.js';
import { generateDemoData, demoTick } from './demo.js';
import * as stats from './stats.js';
import { isIsoDate, rowsToCsv } from './http-utils.js';
import { editableSettings, toPublicSettings } from './public-settings.js';
import {
  authRequired,
  clearAuthCookie,
  isAuthorized,
  issueAccessToken,
  onboardingCompleted,
  requireApiAuth,
  setAuthCookie,
} from './auth.js';
import { supportedTariffs } from './tariffs.js';
import {
  accessTokenFromInput,
  normalizeRemoteServerUrl,
  optionalConnectionToken,
} from './connection-token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT) || 3017;
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
let activePort = DEFAULT_PORT;
let activeHost = DEFAULT_HOST;
let activeServer = null;
const appTimers = new Set();

function normalizePublicUrlSetting(settings) {
  if (!Object.hasOwn(settings, 'public_server_url')) return settings;
  const value = String(settings.public_server_url).trim();
  return { ...settings, public_server_url: value ? normalizeRemoteServerUrl(value) : '' };
}

function accessTokens() {
  const accessToken = issueAccessToken();
  return {
    accessToken,
    connectionToken: optionalConnectionToken(getSetting('public_server_url'), accessToken),
  };
}

function every(callback, delay) {
  const timer = setInterval(callback, delay);
  appTimers.add(timer);
  return timer;
}

const app = express();
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(express.json());
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'trop de requêtes, réessayez dans quelques instants' },
  }),
);
const sensitiveLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'trop de tentatives, réessayez plus tard' },
});

// ---------- API ----------

// Ces trois routes sont les seules accessibles sans jeton. La configuration
// initiale ne peut être exécutée qu'une fois.
app.get('/api/setup/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    onboardingCompleted: onboardingCompleted(),
    authRequired: authRequired(),
    authenticated: onboardingCompleted() && isAuthorized(req),
    tariffs: supportedTariffs(),
  });
});

app.post('/api/setup/complete', sensitiveLimit, async (req, res) => {
  if (onboardingCompleted()) {
    return res.status(409).json({ error: 'la configuration initiale est déjà terminée' });
  }
  let settings;
  try {
    settings = normalizePublicUrlSetting(editableSettings(req.body));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  for (const [key, value] of Object.entries(settings)) setSetting(key, value);
  setSetting('linky_enabled', req.body?.linky_enabled ? '1' : '0');
  setSetting('ewelink_enabled', req.body?.ewelink_enabled ? '1' : '0');
  setSetting('omajin_enabled', req.body?.omajin_enabled ? '1' : '0');
  setSetting('onboarding_completed', '1');
  const tokens = accessTokens();
  setAuthCookie(req, res, tokens.accessToken);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, ...tokens });
  startLinky();
  startSonoff().catch((err) => console.error('[sonoff] démarrage :', err.message));
  startOmajin().catch((err) => console.error('[omajin] démarrage :', err.message));
});

app.post('/api/auth/session', sensitiveLimit, (req, res) => {
  if (!onboardingCompleted()) {
    return res.status(428).json({ error: 'configuration initiale requise' });
  }
  if (!authRequired()) return res.json({ ok: true });
  let token = '';
  try {
    token = accessTokenFromInput(req.body?.token);
  } catch {
    // Le même message est conservé pour ne révéler aucun détail sur le format attendu.
  }
  if (!isAuthorized(req, token)) return res.status(401).json({ error: 'jeton invalide' });
  setAuthCookie(req, res, token);
  res.json({ ok: true });
});

app.use('/api', requireApiAuth);

app.post('/api/auth/rotate', (req, res) => {
  const tokens = accessTokens();
  setAuthCookie(req, res, tokens.accessToken);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, ...tokens });
});

app.delete('/api/auth/session', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/summary', (req, res) => res.json(stats.summary()));
app.get('/api/daily', (req, res) => res.json(stats.dailySeries(Number(req.query.days) || 400)));
app.get('/api/day/:date', (req, res) => res.json(stats.dayDetail(req.params.date)));
app.get('/api/breakdown', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start et end requis (YYYY-MM-DD)' });
  res.json(stats.deviceBreakdown(start, end));
});
app.get('/api/heatmap', (req, res) => res.json(stats.heatmap(Number(req.query.days) || 56)));
app.get('/api/readings/recent', (req, res) =>
  res.json(stats.recentReadings(Number(req.query.minutes) || 30)),
);
app.get('/api/devices/daily', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start et end requis (YYYY-MM-DD)' });
  res.json(stats.devicesDaily(start, end));
});
app.get('/api/devices/stats', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start et end requis (YYYY-MM-DD)' });
  res.json(stats.deviceStats(start, end));
});
app.get('/api/profile', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start et end requis (YYYY-MM-DD)' });
  res.json(stats.hourlyProfile(start, end));
});
app.get('/api/advanced', (req, res) => res.json(stats.advanced()));
app.get('/api/devices', (req, res) => res.json(listDevices()));

app.get('/api/devices/hourly', (req, res) => {
  const { date } = req.query;
  if (!isIsoDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  res.json(stats.devicesHourly(date));
});

app.post('/api/devices/:id/switch', async (req, res) => {
  try {
    const state = isOmajinDevice(req.params.id)
      ? await setOmajinSwitch(req.params.id, Boolean(req.body.on))
      : await setSwitch(req.params.id, Boolean(req.body.on));
    res.json({ ok: true, state });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// journal d'événements (le flux temps réel, lui, vit sur /api/events en SSE)
// ---------- Facturation (échéancier + régularisation) ----------

app.get('/api/billing', (req, res) => res.json(stats.billing()));

app.post('/api/installments', (req, res) => {
  const { date, amount } = req.body;
  const amt = Number(amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return res.status(400).json({ error: 'date invalide (YYYY-MM-DD attendu)' });
  }
  if (!Number.isFinite(amt) || amt < 0) {
    return res.status(400).json({ error: 'montant invalide' });
  }
  db.prepare('INSERT OR REPLACE INTO installments (date, amount) VALUES (?, ?)').run(date, amt);
  res.json(stats.billing());
});

app.delete('/api/installments/:date', (req, res) => {
  db.prepare('DELETE FROM installments WHERE date = ?').run(req.params.date);
  res.json(stats.billing());
});

app.get('/api/journal', (req, res) => res.json(listEvents(Number(req.query.limit) || 50)));

app.get('/api/status', (req, res) => {
  // adresses locales pour ouvrir le dashboard depuis un téléphone sur le même réseau
  const urls = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${activePort}`);
  res.json({
    linky: linkyStatus,
    sonoff: sonoffStatus,
    omajin: omajinStatus,
    connectors: {
      linky: getSetting('linky_enabled') === '1',
      ewelink: getSetting('ewelink_enabled') === '1',
      omajin: getSetting('omajin_enabled') === '1',
    },
    demo: getSetting('demo_mode') === '1',
    urls,
    server: { host: activeHost, port: activePort, authEnabled: authRequired() },
  });
});

app.get('/api/settings', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(toPublicSettings(allSettings()));
});

app.post('/api/settings', async (req, res) => {
  const prevDemo = getSetting('demo_mode');
  const prevToken = getSetting('conso_token');
  const prevPrm = getSetting('prm');
  const prevLinkyEnabled = getSetting('linky_enabled');
  const prevEwelink = [
    getSetting('ewelink_enabled'),
    getSetting('ewelink_email'),
    getSetting('ewelink_password'),
    getSetting('ewelink_region'),
  ].join('\0');
  const prevOmajin = [
    getSetting('omajin_enabled'),
    getSetting('tuya_access_id'),
    getSetting('tuya_access_secret'),
    getSetting('tuya_region'),
    getSetting('tuya_device_ids'),
  ].join('\0');

  let nextSettings;
  try {
    nextSettings = normalizePublicUrlSetting(editableSettings(req.body));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  for (const [key, value] of Object.entries(nextSettings)) {
    setSetting(key, value);
  }

  if (getSetting('demo_mode') !== prevDemo) {
    if (getSetting('demo_mode') === '1') generateDemoData();
    else purgeDemoData();
  }
  if (getSetting('conso_token') !== prevToken || getSetting('prm') !== prevPrm) {
    setSetting('linky_backfill_done', '0');
    syncRecent().then(() => backfill()); // en arrière-plan
  }
  if (getSetting('linky_enabled') !== prevLinkyEnabled) {
    stopLinky();
    startLinky();
  }
  const nextEwelink = [
    getSetting('ewelink_enabled'),
    getSetting('ewelink_email'),
    getSetting('ewelink_password'),
    getSetting('ewelink_region'),
  ].join('\0');
  if (nextEwelink !== prevEwelink) {
    stopSonoff();
    startSonoff().catch((err) => console.error('[sonoff] reconfiguration :', err.message));
  }
  const nextOmajin = [
    getSetting('omajin_enabled'),
    getSetting('tuya_access_id'),
    getSetting('tuya_access_secret'),
    getSetting('tuya_region'),
    getSetting('tuya_device_ids'),
  ].join('\0');
  if (nextOmajin !== prevOmajin) {
    stopOmajin();
    startOmajin().catch((err) => console.error('[omajin] reconfiguration :', err.message));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(toPublicSettings(allSettings()));
});

app.post('/api/devices/:id', (req, res) => {
  const { name, room } = req.body;
  const dev = db.prepare('SELECT id FROM devices WHERE id = ?').get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'appareil inconnu' });
  if (name) db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(String(name), req.params.id);
  if (room !== undefined)
    db.prepare('UPDATE devices SET room = ? WHERE id = ?').run(String(room), req.params.id);
  res.json(listDevices());
});

// ---------- Relevés manuels de l'index du compteur ----------

function meterIndexList() {
  return {
    entries: db.prepare('SELECT date, index_kwh FROM meter_index ORDER BY date').all(),
    // journées calculées à partir des relevés (celles couvertes par Enedis sont exclues d'office)
    manualDays: db
      .prepare("SELECT date, wh FROM linky_daily WHERE source = 'manual' ORDER BY date")
      .all(),
  };
}

app.get('/api/meter-index', (req, res) => res.json(meterIndexList()));

app.post('/api/meter-index', (req, res) => {
  const { date, index_kwh } = req.body;
  const idx = Number(index_kwh);
  if (!isIsoDate(date)) {
    return res.status(400).json({ error: 'date invalide (YYYY-MM-DD attendu)' });
  }
  if (!Number.isFinite(idx) || idx < 0) {
    return res
      .status(400)
      .json({ error: 'index invalide : reportez le nombre de kWh affiché par le compteur' });
  }
  db.prepare('INSERT OR REPLACE INTO meter_index (date, index_kwh, created) VALUES (?, ?, ?)').run(
    date,
    idx,
    Date.now(),
  );
  recomputeManualDaily();
  res.json(meterIndexList());
});

app.delete('/api/meter-index/:date', (req, res) => {
  db.prepare('DELETE FROM meter_index WHERE date = ?').run(req.params.date);
  recomputeManualDaily();
  res.json(meterIndexList());
});

app.get('/api/export.csv', (req, res) => {
  const what = req.query.what || 'daily';
  const queries = {
    daily: 'SELECT date, wh/1000.0 AS kwh, source FROM linky_daily ORDER BY date',
    loadcurve:
      "SELECT datetime(ts/1000,'unixepoch','localtime') AS horodatage, watts, source FROM linky_load_curve ORDER BY ts",
    hourly: `SELECT datetime(hour_start/1000,'unixepoch','localtime') AS heure, d.name AS appareil, ROUND(e.wh, 1) AS wh, e.source
             FROM plug_energy_hourly e JOIN devices d ON d.id = e.device_id ORDER BY hour_start`,
    readings: `SELECT datetime(ts/1000,'unixepoch','localtime') AS horodatage, d.name AS appareil, watts, volts, amps, r.source
               FROM plug_readings r JOIN devices d ON d.id = r.device_id ORDER BY ts`,
  };
  const sql = queries[what];
  if (!sql) return res.status(400).send('what invalide');
  const rows = db.prepare(sql).all();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="elec-${what}.csv"`);
  res.send(rowsToCsv(rows));
});

// ---------- SSE temps réel ----------

const sseClients = new Set();
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

sonoffEvents.on('reading', (r) => broadcast('reading', r));
sonoffEvents.on('status', () => broadcast('status', { sonoff: sonoffStatus }));
omajinEvents.on('reading', (r) => broadcast('reading', r));
omajinEvents.on('status', () => broadcast('status', { omajin: omajinStatus }));
linkyEvents.on('updated', () => broadcast('linky', { at: Date.now() }));
appEvents.on('event', (ev) => broadcast('notice', ev));

// Surveillance de la puissance totale vs abonnement (alerte au-delà de 90 %).
function checkOverload() {
  try {
    const s = stats.summary();
    const limitW = (Number(getSetting('kva')) || 6) * 1000;
    if (s.nowW > limitW * 0.9) {
      addEvent(
        'overload',
        `Puissance des prises élevée : ${Math.round(s.nowW)} W, soit ${Math.round((s.nowW / limitW) * 100)} % des ${limitW / 1000} kVA souscrits — risque de disjonction`,
        null,
        60,
      );
    }
  } catch {
    /* base occupée : prochain tour */
  }
}

// Battement démo : simule le temps réel quand le mode démo est actif.
function tickDemo() {
  if (getSetting('demo_mode') === '1') {
    for (const r of demoTick()) broadcast('reading', r);
  }
}

function startBackgroundTimers() {
  // Le heartbeat permet au navigateur de détecter un flux SSE mort après une veille.
  every(() => broadcast('hb', { t: Date.now() }), 20_000);
  every(checkOverload, 60_000);
  every(tickDemo, 10_000);
  every(purgeOldReadings, 12 * 3600_000);
}

// ---------- Frontend statique (build Vite) ----------

const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));

// ---------- Démarrage ----------

export async function startServer({ host = DEFAULT_HOST, port = DEFAULT_PORT, dataDir } = {}) {
  if (activeServer) {
    return { server: activeServer, host: activeHost, port: activePort, dataDir: DATA_DIR };
  }
  if (dataDir && path.resolve(dataDir) !== DATA_DIR) {
    throw new Error('DATA_DIR doit être défini avant le chargement du serveur');
  }
  activeHost = host;
  activePort = Number(port);

  activeServer = await new Promise((resolve, reject) => {
    const server = app.listen(activePort, activeHost, () => resolve(server));
    server.once('error', reject);
  });
  const address = activeServer.address();
  if (address && typeof address === 'object') activePort = address.port;

  console.log(`Wattelier démarré → http://localhost:${activePort} (écoute ${activeHost})`);
  recomputeManualDaily();
  startLinky();
  startSonoff().catch((error) => console.error('[sonoff] démarrage :', error.message));
  startOmajin().catch((error) => console.error('[omajin] démarrage :', error.message));
  purgeOldReadings();
  startBackgroundTimers();
  return { server: activeServer, host: activeHost, port: activePort, dataDir: DATA_DIR };
}

export async function stopServer() {
  stopLinky();
  stopSonoff();
  stopOmajin();
  for (const timer of appTimers) clearInterval(timer);
  appTimers.clear();
  for (const client of sseClients) client.end();
  sseClients.clear();
  if (!activeServer) return;
  const server = activeServer;
  activeServer = null;
  await new Promise((resolve) => server.close(resolve));
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  startServer().catch((error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Le port ${DEFAULT_PORT} est déjà pris : une autre instance tourne.`);
      process.exitCode = 0;
      return;
    }
    console.error('Erreur serveur :', error.message);
    process.exitCode = 1;
  });
}
