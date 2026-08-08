const PREFIX = 'wtl1_';
const ACCESS_TOKEN_PATTERN = /^se_[A-Za-z0-9_-]{43}$/;

/** @param {unknown} value */
export function normalizeRemoteServerUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error('adresse du serveur invalide');
  }
  if (url.protocol !== 'https:') throw new Error('une adresse HTTPS est obligatoire');
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('adresse du serveur invalide');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error("l'adresse doit pointer vers la racine du serveur");
  }
  url.pathname = '/';
  return url.href.replace(/\/$/, '');
}

/** @param {unknown} serverUrl @param {unknown} accessToken */
export function createConnectionToken(serverUrl, accessToken) {
  const endpoint = normalizeRemoteServerUrl(serverUrl);
  const token = String(accessToken).trim();
  if (!ACCESS_TOKEN_PATTERN.test(token)) throw new Error("jeton d'accès invalide");
  const payload = Buffer.from(JSON.stringify({ v: 1, u: endpoint, t: token })).toString(
    'base64url',
  );
  return `${PREFIX}${payload}`;
}

/** @param {unknown} value */
export function parseConnectionToken(value) {
  const encoded = String(value).trim();
  if (!encoded.startsWith(PREFIX) || encoded.length > 2048) {
    throw new Error('jeton de connexion invalide');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded.slice(PREFIX.length), 'base64url').toString('utf8'));
  } catch {
    throw new Error('jeton de connexion invalide');
  }
  if (!payload || payload.v !== 1 || !ACCESS_TOKEN_PATTERN.test(String(payload.t || ''))) {
    throw new Error('jeton de connexion invalide');
  }
  return { serverUrl: normalizeRemoteServerUrl(payload.u), accessToken: String(payload.t) };
}

/** @param {unknown} value @param {unknown} serverUrl */
export function connectionTokenFromInput(value, serverUrl = '') {
  const token = String(value).trim();
  if (token.startsWith(PREFIX)) {
    const connection = parseConnectionToken(token);
    return createConnectionToken(connection.serverUrl, connection.accessToken);
  }
  return createConnectionToken(serverUrl, token);
}

/** @param {unknown} serverUrl @param {unknown} accessToken */
export function optionalConnectionToken(serverUrl, accessToken) {
  if (!String(serverUrl || '').trim()) return null;
  return createConnectionToken(serverUrl, accessToken);
}

/** @param {unknown} value */
export function accessTokenFromInput(value) {
  const token = String(value).trim();
  if (ACCESS_TOKEN_PATTERN.test(token)) return token;
  return parseConnectionToken(token).accessToken;
}
