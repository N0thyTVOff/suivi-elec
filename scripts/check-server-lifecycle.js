import fs from 'node:fs';
import path from 'node:path';

const dataDirectory = path.resolve(process.argv[2]);
fs.mkdirSync(dataDirectory, { recursive: true });
process.env.DATA_DIR = dataDirectory;
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';

const serverModule = await import('../server/index.js');
const first = await serverModule.startServer({
  host: '127.0.0.1',
  port: 0,
  dataDir: dataDirectory,
});
const firstResponse = await fetch(`http://127.0.0.1:${first.port}/api/setup/status`);
await serverModule.stopServer();
const second = await serverModule.startServer({
  host: '127.0.0.1',
  port: 0,
  dataDir: dataDirectory,
});
const secondResponse = await fetch(`http://127.0.0.1:${second.port}/api/setup/status`);
await serverModule.stopServer();

const { db } = await import('../server/db.js');
db.close();

if (!firstResponse.ok || !secondResponse.ok) process.exitCode = 1;
else console.log(JSON.stringify({ first: firstResponse.status, second: secondResponse.status }));
