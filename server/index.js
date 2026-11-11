#!/usr/bin/env node
/**
 * Start the command center. HTTP and HTTPS are answered on the same port (MZ's HttpsManager: each connection's first
 * byte tells a TLS handshake from plain http), so moving from http to HTTPS only is done in Settings → HTTPS without
 * changing the port. Under the launcher (server/launch.js) it tells the launcher when it is up, for rollbacks.
 *
 * Under the launcher (CC_LAUNCHER_SOCKETS=1), updates need no restart: the launcher holds the port and passes each
 * connection here. A new version is loaded beside the running one and waits for "go"; the running one finishes what it
 * is answering, stops writing, and hands over what it holds in memory; then the new one takes the connections.
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
const handover = process.env.CC_LAUNCHER_SOCKETS === '1' && typeof process.send === 'function';
const tell = (m) => process.send?.(m);

// Under the launcher, the data is read only once the version before has stopped writing it.
let state = null;
if (handover) {
  state = await new Promise((resolve) => {
    const onGo = (m) => {
      if (m?.type !== 'go') return;
      process.off('message', onGo);
      resolve(m.state ?? null);
    };
    process.on('message', onGo);
    tell({ type: 'prepared' });
  });
}

const app = createApp(config);
let draining = false;
const handler = (req, res) => {
  // Moving to the next version: each connection ends cleanly after its answer, and the client opens a new one there.
  if (draining) res.setHeader('Connection', 'close');
  return app.handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500).end();
  });
};
const httpsOnly = (req, res) =>
  app.httpsOnly(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500).end();
  });

const port = handover ? 0 : config.port;
const host = handover ? '127.0.0.1' : config.host;
let server;
const listen = (ready) => (server = app.https.listen({ app: handler, httpsOnly, port, host }, ready));
listen(async () => {
  const mode = app.https.mode;
  const where = `${config.host}:${config.port}`;
  console.log(`FTR Credits Command Center ${app.versionLabel} on ${mode === 'http' ? `http://${where}` : mode === 'https' ? `https://${where} (plain http on the same port is redirected)` : `http://${where} and https://${where}`} · data in ${config.dataDir}`);
  const options = mode === 'http' ? null : app.https.contextOptions();
  if (options) {
    const { selfSigned, source } = app.https.describe();
    console.log(`[https] ${selfSigned ? 'Self-signed certificate (browsers warn until it is trusted: upload yours under Settings → HTTPS, or get one from Let’s Encrypt there)' : `Certificate (${source})`}: ${describeCertificate(options)}`);
  }
  app.https.watch();
  if (state) app.adopt(state);
  await app.started();
  if (process.env.CC_SUPERVISOR === '1') tell({ type: 'ready', version: app.version });
});

if (handover) {
  /** Answer requests already here, closing each connection as it falls idle; give up waiting after `ms`. */
  const sockets = new Set();
  const drain = async (ms = 20_000) => {
    draining = true;
    const start = Date.now();
    while (Date.now() - start < ms && sockets.size > 0) {
      // Busy connections close themselves after their answer; ones left idle are closed after a short grace.
      if (Date.now() - start > 1500) server.closeIdleConnections();
      await new Promise((r) => setTimeout(r, 25));
    }
    for (const s of sockets) s.destroy();
    server.close();
  };
  process.on('message', async (m, socket) => {
    if (m?.type === 'conn' && socket) {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      return server.front.emit('connection', socket);
    }
    if (m?.type === 'drain') {
      await drain();
      return tell({ type: 'drained', state: app.handoff() });
    }
    if (m?.type === 'resume') {
      draining = false;
      app.resume();
      return listen(() => tell({ type: 'ready', version: app.version, resumed: true }));
    }
    if (m?.type === 'exit') {
      app.release();
      app.stop();
      setTimeout(() => process.exit(0), 100).unref();
    }
  });
}
const stop = () => {
  server.close();
  app.stop();
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
