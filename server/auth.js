import { randomBytes } from 'node:crypto';
import { getSetting, setSetting } from './db.js';
import { hashAccessToken, matchesAccessToken } from './token-utils.js';

const COOKIE_NAME = 'wattelier_token';
const LEGACY_COOKIE_NAME = 'suivi_elec_token';

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

function requestToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return readCookie(req, COOKIE_NAME) || readCookie(req, LEGACY_COOKIE_NAME);
}

export function authRequired() {
  return getSetting('server_auth_enabled') === '1';
}

export function onboardingCompleted() {
  return getSetting('onboarding_completed') === '1';
}

export function isAuthorized(req, token = requestToken(req)) {
  if (!authRequired()) return true;
  const expectedHex = getSetting('server_token_hash') || '';
  return matchesAccessToken(token, expectedHex);
}

export function requireApiAuth(req, res, next) {
  if (!onboardingCompleted()) {
    return res.status(428).json({ error: 'configuration initiale requise' });
  }
  if (!isAuthorized(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="Wattelier"');
    return res.status(401).json({ error: "jeton d'accès requis" });
  }
  next();
}

export function issueAccessToken() {
  const token = `se_${randomBytes(32).toString('base64url')}`;
  setSetting('server_token_hash', hashAccessToken(token).toString('hex'));
  setSetting('server_auth_enabled', '1');
  return token;
}

export function setAuthCookie(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secure ? '; Secure' : ''}`,
  );
}

export function clearAuthCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.append('Set-Cookie', `${LEGACY_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}
