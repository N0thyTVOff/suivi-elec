import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  db,
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
import { startLinky, syncRecent, backfill, linkyStatus, linkyEvents } from './linky.js';
import { startSonoff, sonoffStatus, sonoffEvents, listDevices, setSwitch } from './sonoff/index.js';
import { generateDemoData, demoTick } from './demo.js';
import * as stats from './stats.js';
import { isIsoDate, rowsToCsv } from './http-utils.js';
import { editableSettings, toPublicSettings } from './public-settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3017;

const app = express();
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

// ---------- API ----------

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
    const state = await setSwitch(req.params.id, Boolean(req.body.on));
    res.json({ ok: true, state });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// journal d'événements (le flux temps réel, lui, vit sur /api/events en SSE)
// ---------- Mensualisation EDF (échéancier + régularisation) ----------

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
    .map((i) => `http://${i.address}:${PORT}`);
  res.json({
    linky: linkyStatus,
    sonoff: sonoffStatus,
    demo: getSetting('demo_mode') === '1',
    urls,
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

  for (const [key, value] of Object.entries(editableSettings(req.body))) {
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

// battement de cœur : permet au navigateur de détecter un flux mort (connexion
// « à moitié ouverte » après une veille) et de se reconnecter tout seul
setInterval(() => broadcast('hb', { t: Date.now() }), 20_000);

sonoffEvents.on('reading', (r) => broadcast('reading', r));
sonoffEvents.on('status', () => broadcast('status', { sonoff: sonoffStatus }));
linkyEvents.on('updated', () => broadcast('linky', { at: Date.now() }));
appEvents.on('event', (ev) => broadcast('notice', ev));

// surveillance de la puissance totale vs abonnement (alerte au-delà de 90 %)
setInterval(() => {
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
}, 60_000);

// battement démo : simule le temps réel quand le mode démo est actif
setInterval(() => {
  if (getSetting('demo_mode') === '1') {
    for (const r of demoTick()) broadcast('reading', r);
  }
}, 10_000);

// ---------- Frontend statique (build Vite) ----------

const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));

// ---------- Démarrage ----------

const server = app.listen(PORT, () => {
  console.log(`Suivi élec démarré → http://localhost:${PORT}`);
  recomputeManualDaily(); // ré-attribue les relevés manuels si la règle de calcul a évolué
  startLinky();
  startSonoff();
  purgeOldReadings();
  setInterval(purgeOldReadings, 12 * 3600_000);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // deux instances simultanées se sabotent mutuellement auprès d'eWeLink :
    // celle-ci s'efface proprement
    console.error(`Le port ${PORT} est déjà pris : une autre instance tourne. Celle-ci s'arrête.`);
    process.exit(0);
  }
  console.error('Erreur serveur :', err.message);
  process.exit(1);
});
