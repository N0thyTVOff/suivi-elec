import crypto from 'node:crypto';

export const TUYA_ENDPOINTS = Object.freeze({
  eu: 'https://openapi.tuyaeu.com',
  'eu-west': 'https://openapi-weaz.tuyaeu.com',
  us: 'https://openapi.tuyaus.com',
  'us-east': 'https://openapi-ueaz.tuyaus.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
  sg: 'https://openapi-sg.iotbing.com',
});

/** @param {string} value */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Construit la signature OpenAPI Tuya sans jamais exposer le secret. */
/**
 * @param {{clientId:string, secret:string, accessToken?:string, method:string, path:string, body?:string, t:string}} input
 */
export function signTuyaRequest({
  clientId,
  secret,
  accessToken = '',
  method,
  path,
  body = '',
  t,
}) {
  const stringToSign = `${method.toUpperCase()}\n${sha256(body)}\n\n${path}`;
  return crypto
    .createHmac('sha256', secret)
    .update(`${clientId}${accessToken}${t}${stringToSign}`)
    .digest('hex')
    .toUpperCase();
}

/** @param {unknown} payload @param {number} status */
function tuyaError(payload, status) {
  const result = /** @type {{code?: string|number, msg?: string}} */ (payload || {});
  const code = result.code ? ` (${result.code})` : '';
  const detail = result.msg || `HTTP ${status}`;
  return new Error(`Tuya a refusé la requête${code} : ${detail}`);
}

export class TuyaCloudClient {
  /**
   * @param {{accessId:string, accessSecret:string, region?:string, fetchImpl?:typeof fetch, now?:()=>number}} options
   */
  constructor({ accessId, accessSecret, region = 'eu', fetchImpl = fetch, now = Date.now }) {
    const endpoint = /** @type {Record<string, string>} */ (TUYA_ENDPOINTS)[region];
    if (!endpoint) throw new Error('centre de données Tuya inconnu');
    this.accessId = accessId;
    this.accessSecret = accessSecret;
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.token = '';
    this.tokenExpiresAt = 0;
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {{body?: unknown, authenticated?: boolean, retry?: boolean}} [options]
   * @returns {Promise<any>}
   */
  async request(method, path, { body, authenticated = true, retry = true } = {}) {
    const accessToken = authenticated ? await this.getAccessToken() : '';
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const t = String(this.now());
    /** @type {Record<string, string>} */
    const headers = {
      client_id: this.accessId,
      sign_method: 'HMAC-SHA256',
      t,
      sign: signTuyaRequest({
        clientId: this.accessId,
        secret: this.accessSecret,
        accessToken,
        method,
        path,
        body: bodyText,
        t,
      }),
    };
    if (accessToken) headers.access_token = accessToken;
    if (body !== undefined) headers['content-type'] = 'application/json';

    let response;
    try {
      response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : bodyText,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`cloud Tuya injoignable : ${message}`, { cause: error });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`réponse Tuya illisible (HTTP ${response.status})`);
    }

    if (!response.ok || payload.success !== true) {
      if (
        authenticated &&
        retry &&
        ['1010', '1011'].includes(String(/** @type {{code?: unknown}} */ (payload).code))
      ) {
        this.token = '';
        this.tokenExpiresAt = 0;
        return this.request(method, path, { body, authenticated, retry: false });
      }
      throw tuyaError(payload, response.status);
    }
    return payload.result;
  }

  async getAccessToken() {
    if (this.token && this.now() < this.tokenExpiresAt) return this.token;
    const result = await this.request('GET', '/v1.0/token?grant_type=1', {
      authenticated: false,
    });
    if (!result?.access_token) throw new Error("Tuya n'a pas renvoyé de jeton d'accès");
    this.token = result.access_token;
    this.tokenExpiresAt = this.now() + Math.max(60, Number(result.expire_time) - 60) * 1000;
    return this.token;
  }

  /** @param {string} deviceId */
  getDevice(deviceId) {
    return this.request('GET', `/v1.0/devices/${encodeURIComponent(deviceId)}`);
  }

  /** @param {string} deviceId */
  getSpecification(deviceId) {
    return this.request(
      'GET',
      `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/specification`,
    );
  }

  /** @param {string} deviceId */
  getStatus(deviceId) {
    return this.request('GET', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/status`);
  }

  /** @param {string} deviceId @param {Array<{code:string, value:unknown}>} commands */
  sendCommands(deviceId, commands) {
    return this.request('POST', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/commands`, {
      body: { commands },
    });
  }
}
