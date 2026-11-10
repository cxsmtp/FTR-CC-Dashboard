#!/usr/bin/env node
/**
 * Start the command center. HTTP and HTTPS are answered on the same port (MZ's HttpsManager: each connection's first
 * byte tells a TLS handshake from plain http), so moving from http to HTTPS only is done in Settings → HTTPS without
 * changing the port. Under the launcher (server/launch.js) it tells the launcher when it is up, for rollbacks.
 */
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { describeCertificate } from '../vendor/mz/src/tls.js';

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
const httpsOnly = (req, res) =>
  app.httpsOnly(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500).end();
  });

const server = app.https.listen({ app: handler, httpsOnly, port: config.port, host: config.host }, async () => {
  const mode = app.https.mode;
  const where = `${config.host}:${config.port}`;
  console.log(`FTR Credits Command Center ${app.versionLabel} on ${mode === 'http' ? `http://${where}` : mode === 'https' ? `https://${where} (plain http on the same port is redirected)` : `http://${where} and https://${where}`} · data in ${config.dataDir}`);
  const options = mode === 'http' ? null : app.https.contextOptions();
  if (options) {
    const { selfSigned, source } = app.https.describe();
    console.log(`[https] ${selfSigned ? 'Self-signed certificate (browsers warn until it is trusted: upload yours under Settings → HTTPS, or get one from Let’s Encrypt there)' : `Certificate (${source})`}: ${describeCertificate(options)}`);
  }
  app.https.watch();
  await app.started();
  if (process.env.CC_SUPERVISOR === '1') process.send?.({ type: 'ready', version: app.version });
});
const stop = () => {
  server.close();
  app.stop();
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
