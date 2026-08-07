import { EventEmitter } from 'node:events';
import { addEvent, addHourlyWh, db, getSetting, insertReading, upsertDevice } from '../db.js';
import { TuyaCloudClient } from './client.js';
import { normalizeOmajinStatus, parseOmajinDevices } from './model.js';

const POLL_INTERVAL_MS = 60_000;
const MAX_INTEGRATION_GAP_MS = 5 * 60_000;
const DEVICE_PREFIX = 'tuya:';

export const omajinEvents = new EventEmitter();
omajinEvents.setMaxListeners(100);

export const omajinStatus = {
  configured: false,
  cloudOnline: false,
  deviceCount: 0,
  lastError: null,
  lastSync: null,
};

let client = null;
let pollTimer = null;
let polling = false;
const registry = new Map();
const lastReading = new Map();

function dbId(rawId) {
  return `${DEVICE_PREFIX}${rawId}`;
}

function startOfHour(timestamp) {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

function integrateEnergy(deviceId, timestamp, watts) {
  const previous = lastReading.get(deviceId);
  lastReading.set(deviceId, { timestamp, watts });
  if (!previous) return;
  const duration = timestamp - previous.timestamp;
  if (duration <= 0 || duration > MAX_INTEGRATION_GAP_MS) return;
  let cursor = previous.timestamp;
  while (cursor < timestamp) {
    const hourStart = startOfHour(cursor);
    const end = Math.min(hourStart + 3_600_000, timestamp);
    const wh = (previous.watts * (end - cursor)) / 3_600_000;
    if (wh > 0) {
      addHourlyWh.run({
        device_id: deviceId,
        hour_start: hourStart,
        wh,
        source: 'real',
      });
    }
    cursor = end;
  }
}

function saveReading(device, normalized) {
  const timestamp = Date.now();
  const deviceId = dbId(device.id);
  const existing = db.prepare('SELECT name FROM devices WHERE id = ?').get(deviceId);
  upsertDevice.run({
    id: deviceId,
    name: existing?.name || device.name,
    room: '',
    model: 'Omajin OSP-FR-01 · Tuya',
    online: 1,
    source: 'real',
    last_seen: timestamp,
  });
  if (normalized.switchState) {
    db.prepare('UPDATE devices SET switch_state = ? WHERE id = ?').run(
      normalized.switchState,
      deviceId,
    );
  }
  if (normalized.watts === null) return;
  insertReading.run({
    device_id: deviceId,
    ts: timestamp,
    watts: normalized.watts,
    volts: normalized.volts,
    amps: normalized.amps,
    source: 'real',
  });
  integrateEnergy(deviceId, timestamp, normalized.watts);
  omajinEvents.emit('reading', {
    deviceId,
    name: device.name,
    ts: timestamp,
    watts: normalized.watts,
    volts: normalized.volts,
    amps: normalized.amps,
    via: 'tuya-cloud',
  });
}

async function loadDevice({ id, label }) {
  const [details, specification] = await Promise.all([
    client.getDevice(id),
    client.getSpecification(id),
  ]);
  const name = label || details?.name || `Omajin ${id.slice(-6)}`;
  const device = {
    id,
    name,
    specification,
    switchCode:
      specification?.functions?.find((item) =>
        ['switch_1', 'switch', 'switch_led'].includes(item.code),
      )?.code || null,
  };
  registry.set(dbId(id), device);
  upsertDevice.run({
    id: dbId(id),
    name,
    room: '',
    model: 'Omajin OSP-FR-01 · Tuya',
    online: details?.online === false ? 0 : 1,
    source: 'real',
    last_seen: details?.online === false ? null : Date.now(),
  });
  return device;
}

export async function pollOmajin() {
  if (!client || polling) return;
  polling = true;
  try {
    let successes = 0;
    for (const device of registry.values()) {
      try {
        const status = await client.getStatus(device.id);
        const normalized = normalizeOmajinStatus(status, device.specification);
        if (!device.switchCode && normalized.switchCode) device.switchCode = normalized.switchCode;
        saveReading(device, normalized);
        successes += 1;
      } catch (error) {
        db.prepare('UPDATE devices SET online = 0 WHERE id = ?').run(dbId(device.id));
        omajinStatus.lastError = error.message;
      }
    }
    omajinStatus.cloudOnline = successes > 0;
    omajinStatus.lastSync = successes > 0 ? Date.now() : omajinStatus.lastSync;
    if (successes === registry.size && successes > 0) omajinStatus.lastError = null;
    omajinEvents.emit('status');
  } finally {
    polling = false;
  }
}

export async function startOmajin() {
  stopOmajin();
  omajinStatus.deviceCount = 0;
  omajinStatus.lastSync = null;
  if (getSetting('omajin_enabled') !== '1') {
    omajinStatus.configured = false;
    omajinStatus.lastError = null;
    return;
  }

  const accessId = getSetting('tuya_access_id') || process.env.TUYA_ACCESS_ID;
  const accessSecret = getSetting('tuya_access_secret') || process.env.TUYA_ACCESS_SECRET;
  const region = getSetting('tuya_region') || process.env.TUYA_REGION || 'eu';
  let devices;
  try {
    devices = parseOmajinDevices(getSetting('tuya_device_ids') || process.env.TUYA_DEVICE_IDS);
  } catch (error) {
    omajinStatus.configured = false;
    omajinStatus.lastError = error.message;
    return;
  }

  omajinStatus.configured = Boolean(accessId && accessSecret && devices.length);
  omajinStatus.deviceCount = devices.length;
  if (!omajinStatus.configured) {
    omajinStatus.lastError = null;
    return;
  }

  client = new TuyaCloudClient({ accessId, accessSecret, region });
  try {
    for (const device of devices) await loadDevice(device);
    omajinStatus.deviceCount = registry.size;
    await pollOmajin();
    pollTimer = setInterval(pollOmajin, POLL_INTERVAL_MS);
    pollTimer.unref?.();
  } catch (error) {
    omajinStatus.cloudOnline = false;
    omajinStatus.lastError = error.message;
    omajinEvents.emit('status');
  }
}

export function isOmajinDevice(deviceId) {
  return String(deviceId).startsWith(DEVICE_PREFIX);
}

export async function setOmajinSwitch(deviceId, on) {
  const device = registry.get(deviceId);
  if (!device || !client) throw new Error('prise Omajin inconnue ou connecteur désactivé');
  if (!device.switchCode)
    throw new Error("cette prise Omajin n'expose pas de commande marche/arrêt");
  await client.sendCommands(device.id, [{ code: device.switchCode, value: Boolean(on) }]);
  const state = on ? 'on' : 'off';
  db.prepare('UPDATE devices SET switch_state = ?, online = 1 WHERE id = ?').run(state, deviceId);
  addEvent(
    'switch',
    `${device.name} ${on ? 'allumée' : 'éteinte'} depuis le dashboard`,
    deviceId,
    0,
  );
  setTimeout(pollOmajin, 2_000).unref?.();
  return state;
}

export function stopOmajin() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  client = null;
  polling = false;
  registry.clear();
  lastReading.clear();
  omajinStatus.cloudOnline = false;
}
