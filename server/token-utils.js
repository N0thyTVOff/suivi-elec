import { createHash, timingSafeEqual } from 'node:crypto';

/** @param {string} token */
export function hashAccessToken(token) {
  return createHash('sha256').update(String(token)).digest();
}

/**
 * @param {string} token
 * @param {string} expectedHex
 */
export function matchesAccessToken(token, expectedHex) {
  if (!token || !/^[a-f0-9]{64}$/i.test(String(expectedHex))) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = hashAccessToken(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
