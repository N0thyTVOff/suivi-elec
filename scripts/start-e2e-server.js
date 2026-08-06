import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-e2e-'));
process.env.DATA_DIR = dataDirectory;
process.env.HOST = '127.0.0.1';
process.env.PORT = '4318';

const { startServer, stopServer } = await import('../server/index.js');
await startServer({
  host: process.env.HOST,
  port: Number(process.env.PORT),
  dataDir: dataDirectory,
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await stopServer();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
