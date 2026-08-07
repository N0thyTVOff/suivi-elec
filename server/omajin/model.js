/** @param {unknown} value @returns {number|null} */
function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {{values?:string}|undefined} definition @returns {Record<string, unknown>} */
function parsedValues(definition) {
  try {
    return JSON.parse(definition?.values || '{}');
  } catch {
    return {};
  }
}

/**
 * @param {{status?:Array<{code:string, values?:string}>}} specification
 * @param {string} code
 * @param {number} fallback
 */
function scaleFor(specification, code, fallback) {
  const definition = specification?.status?.find((item) => item.code === code);
  const scale = numeric(parsedValues(definition).scale);
  return scale === null ? fallback : scale;
}

/** @param {unknown} value @param {number} scale */
function scaled(value, scale) {
  const number = numeric(value);
  return number === null ? null : number / 10 ** scale;
}

/** Normalise les points de données des prises Tuya avec les échelles annoncées par le modèle. */
/**
 * @param {Array<{code:string, value:unknown}>} status
 * @param {{status?:Array<{code:string, values?:string}>}} [specification]
 */
export function normalizeOmajinStatus(status, specification = {}) {
  const values = new Map((status || []).map((item) => [item.code, item.value]));
  const switchCode = ['switch_1', 'switch', 'switch_led'].find((code) => values.has(code));
  const watts = values.has('cur_power')
    ? scaled(values.get('cur_power'), scaleFor(specification, 'cur_power', 1))
    : null;
  const volts = values.has('cur_voltage')
    ? scaled(values.get('cur_voltage'), scaleFor(specification, 'cur_voltage', 1))
    : null;
  const milliamps = values.has('cur_current')
    ? scaled(values.get('cur_current'), scaleFor(specification, 'cur_current', 0))
    : null;
  const energyKwh = values.has('add_ele')
    ? scaled(values.get('add_ele'), scaleFor(specification, 'add_ele', 3))
    : null;
  return {
    switchCode,
    switchState: switchCode ? (values.get(switchCode) ? 'on' : 'off') : null,
    watts,
    volts,
    amps: milliamps === null ? null : milliamps / 1000,
    energyKwh,
  };
}

/** Une ligne par appareil : `id` ou `id=Nom affiché`. */
/** @param {unknown} value */
export function parseOmajinDevices(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('=');
      const id = (separator < 0 ? entry : entry.slice(0, separator)).trim();
      const label = (separator < 0 ? '' : entry.slice(separator + 1)).trim();
      if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
        throw new Error(`identifiant d'appareil Tuya invalide : ${id || 'vide'}`);
      }
      return { id, label };
    })
    .filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}
