#!/usr/bin/env node
/** Start the command center: `npm start` (http), or https with TLS_CERT and TLS_KEY. */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

import { loadConfig } from './config.js';
import { createApp } from './app.js';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`The command center needs Node.js 22 or later; this is ${process.version}.`);
  process.exit(1);
}

const config = loadConfig();
const app = createApp(config);
const handler = (req, res) =>
  app.handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500).end();
  });
const server = config.tlsCert && config.tlsKey ? https.createServer({ cert: fs.readFileSync(config.tlsCert), key: fs.readFileSync(config.tlsKey), minVersion: 'TLSv1.2' }, handler) : http.createServer(handler);
server.headersTimeout = 30_000;
server.requestTimeout = 120_000;
server.listen(config.port, config.host, () => {
  console.log(`FTR Credits Command Center on ${config.tlsCert ? 'https' : 'http'}://${config.host}:${config.port} · data in ${config.dataDir}`);
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
