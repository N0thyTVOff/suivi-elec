const EDITABLE_KEYS = new Set([
  'price_kwh',
  'price_hp',
  'price_hc',
  'offpeak_share',
  'tempo_blue_hp',
  'tempo_blue_hc',
  'tempo_white_hp',
  'tempo_white_hc',
  'tempo_red_hp',
  'tempo_red_hc',
  'ejp_normal',
  'ejp_peak',
  'subscription_month',
  'kva',
  'supplier_name',
  'offer_name',
  'tariff_type',
  'conso_token',
  'prm',
  'linky_enabled',
  'ewelink_enabled',
  'ewelink_email',
  'ewelink_password',
  'ewelink_region',
  'omajin_enabled',
  'tuya_access_id',
  'tuya_access_secret',
  'tuya_region',
  'tuya_device_ids',
  'demo_mode',
  'raw_retention_days',
  'budget_month_eur',
  'billing_start',
  'billing_end',
  'unmetered_note',
]);

/**
 * Retire les secrets d'un objet de réglages destiné à une réponse HTTP.
 * @param {Record<string, string | null>} settings
 */
export function toPublicSettings(settings) {
  const token = settings.conso_token ?? '';
  const ewelinkPassword = settings.ewelink_password ?? '';
  const tuyaAccessId = settings.tuya_access_id ?? '';
  const tuyaAccessSecret = settings.tuya_access_secret ?? '';
  const safe = { ...settings };
  delete safe.server_token_hash;
  return {
    ...safe,
    conso_token: '',
    conso_token_configured: Boolean(token),
    ewelink_password: '',
    ewelink_password_configured: Boolean(ewelinkPassword || process.env.EWELINK_PASSWORD),
    ewelink_email: '',
    ewelink_email_configured: Boolean(settings.ewelink_email || process.env.EWELINK_EMAIL),
    tuya_access_id: '',
    tuya_access_id_configured: Boolean(tuyaAccessId || process.env.TUYA_ACCESS_ID),
    tuya_access_secret: '',
    tuya_access_secret_configured: Boolean(tuyaAccessSecret || process.env.TUYA_ACCESS_SECRET),
  };
}

/**
 * Filtre une charge utile non fiable et évite qu'un champ secret masqué vide
 * n'efface le jeton déjà enregistré.
 * @param {unknown} body
 */
export function editableSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};

  const source = /** @type {Record<string, unknown>} */ (body);
  /** @type {Record<string, string>} */
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    if (!EDITABLE_KEYS.has(key)) continue;
    if (key === 'conso_token' && value === '' && source.clear_conso_token !== true) continue;
    if (key === 'ewelink_password' && value === '' && source.clear_ewelink_password !== true)
      continue;
    if (key === 'ewelink_email' && value === '' && source.clear_ewelink_email !== true) continue;
    if (key === 'tuya_access_id' && value === '' && source.clear_tuya_access_id !== true) continue;
    if (key === 'tuya_access_secret' && value === '' && source.clear_tuya_access_secret !== true)
      continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = String(value);
    }
  }
  if (source.clear_conso_token === true) output.conso_token = '';
  if (source.clear_ewelink_password === true) output.ewelink_password = '';
  if (source.clear_ewelink_email === true) output.ewelink_email = '';
  if (source.clear_tuya_access_id === true) output.tuya_access_id = '';
  if (source.clear_tuya_access_secret === true) output.tuya_access_secret = '';
  return output;
}
