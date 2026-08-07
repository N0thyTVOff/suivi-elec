import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-smoke-'));
const port = 32_000 + Math.floor(Math.random() * 1_000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' },
  stdio: 'ignore',
});

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error('le serveur de test s’est arrêté');
    try {
      const response = await fetch(`${base}/api/setup/status`);
      if (response.ok) return response.json();
    } catch {
      // Le port n'est pas encore ouvert.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('le serveur de test ne répond pas');
}

try {
  const initial = await waitUntilReady();
  assert.equal(initial.onboardingCompleted, false);
  assert.equal(initial.authRequired, true);

  const insecureSetup = await fetch(`${base}/api/setup/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_server_url: 'http://serveur.example' }),
  });
  assert.equal(insecureSetup.status, 400);

  const setupResponse = await fetch(`${base}/api/setup/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      linky_enabled: false,
      ewelink_enabled: false,
      conso_token: 'conso-secret-test',
      ewelink_email: 'test@example.invalid',
      ewelink_password: 'ewelink-secret-test',
      supplier_name: 'Test',
      offer_name: 'HP/HC',
      tariff_type: 'hphc',
      price_hp: '0.3',
      price_hc: '0.1',
      offpeak_share: '0.5',
      subscription_month: '10',
      kva: '6',
      public_server_url: 'https://pc.maison.ts.net',
    }),
  });
  assert.equal(setupResponse.status, 200);
  const setup = await setupResponse.json();
  assert.match(setup.accessToken, /^se_[A-Za-z0-9_-]{40,}$/);
  assert.match(setup.connectionToken, /^wtl1_/);

  const bundledLogin = await fetch(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: setup.connectionToken }),
  });
  assert.equal(bundledLogin.status, 200);

  const unauthorized = await fetch(`${base}/api/status`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${base}/api/status`, {
    headers: { Authorization: `Bearer ${setup.accessToken}` },
  });
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).server.authEnabled, true);

  const headers = { Authorization: `Bearer ${setup.accessToken}` };
  const publicSettings = await (await fetch(`${base}/api/settings`, { headers })).json();
  assert.equal(publicSettings.conso_token, '');
  assert.equal(publicSettings.conso_token_configured, true);
  assert.equal(publicSettings.ewelink_email, '');
  assert.equal(publicSettings.ewelink_password, '');
  assert.equal('server_token_hash' in publicSettings, false);

  const advanced = await (await fetch(`${base}/api/advanced`, { headers })).json();
  assert.equal(advanced.prices.tariff.type, 'hphc');
  assert.equal(advanced.prices.kwh, 0.2);
  console.log('Smoke test onboarding/auth/réseau : OK');
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
