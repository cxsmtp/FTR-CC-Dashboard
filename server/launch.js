#!/usr/bin/env node
/**
 * The launcher (`npm start`, the container's command): runs the version chosen under Settings → Updates (or the
 * built-in one) and keeps it running. Updates never need a restart:
 *
 * - **The launcher holds the port.** It accepts every connection and passes it to the version that answers, so the
 *   port is never closed. A connection that arrives while versions change waits a moment; none is refused.
 * - **A switch is a handover.** The new version is loaded beside the running one. When it is ready to read the data,
 *   the running one answers what it already has, stops writing, and hands over what it holds in memory (each
 *   person's Checkmarx One connection, reads not yet put into their account). Then the new one reads the data and
 *   takes the connections, and the old one leaves.
 * - **On trial, and rolled back by itself.** A new version that does not come up within UPDATE_START_TIMEOUT_SECONDS
 *   (150) is stopped, marked failed (never auto-installed again), and the running one simply carries on. One that
 *   stops within 2 minutes is rolled back to the version before.
 * - **A version changed on disk** since it was installed is not started: the built-in one runs instead.
 * - **A crash** starts it again, with a growing pause; connections wait meanwhile.
 * - **A version from before handovers** (it listens on the port itself) is started the old way.
 */
import { fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.js';
import { SWITCH_EXIT_CODE, VersionStore } from './updates.js';

const builtInDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builtInVersion = JSON.parse(fs.readFileSync(path.join(builtInDir, 'package.json'), 'utf8')).version;
// .env and DATA_DIR are read here, once, from the installed folder: every version gets the same, absolute, data folder.
const config = loadConfig();
process.env.DATA_DIR = config.dataDir;
// Behind a company proxy (HTTPS_PROXY), the server's own calls (updates, Checkmarx One, git, Let's Encrypt) go through it.
const proxied = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
const START_TIMEOUT_MS = Math.max(10, Number(process.env.UPDATE_START_TIMEOUT_SECONDS) || 150) * 1000;
const QUEUE_MAX = 5000;
const QUEUE_WAIT_MS = 120_000;

const store = new VersionStore({ dataDir: config.dataDir, builtInDir, builtInVersion });
const say = (m) => console.log(`[launch] ${m}`);
let stopping = false;
let crashes = 0;

// ---- The port, held here ------------------------------------------------------------------------------
let active = null; // the version answering: { proc, version, ready }
const waiting = []; // connections that came while no version was answering
let front = null;

function pass(sock) {
  if (sock.destroyed) return;
  if (!active?.ready || active.legacy) {
    if (waiting.length >= QUEUE_MAX) return sock.destroy();
    sock.ccSince = Date.now();
    return waiting.push(sock);
  }
  active.proc.send({ type: 'conn' }, sock, { keepOpen: false }, (error) => error && sock.destroy());
}
function flush() {
  while (waiting.length && active?.ready && !active.legacy) {
    const sock = waiting.shift();
    if (Date.now() - sock.ccSince > QUEUE_WAIT_MS) sock.destroy();
    else pass(sock);
  }
}
setInterval(() => {
  for (let i = waiting.length - 1; i >= 0; i--) if (Date.now() - waiting[i].ccSince > QUEUE_WAIT_MS) waiting.splice(i, 1)[0].destroy();
}, 10_000).unref();

function openPort() {
  if (front) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = net.createServer({ pauseOnConnect: true }, (sock) => {
      sock.on('error', () => {});
      pass(sock);
    });
    s.once('error', reject).listen(config.port, config.host, () => {
      front = s;
      say(`Holding port ${config.host}:${config.port}: updates and reloads change versions without closing it.`);
      resolve();
    });
  });
}
function closePort() {
  if (!front) return Promise.resolve();
  const s = front;
  front = null;
  for (const sock of waiting.splice(0)) sock.destroy();
  return new Promise((resolve) => s.close(() => resolve()));
}

// ---- Versions -----------------------------------------------------------------------------------------
/** A version from before handovers listens on the port itself. */
const canHandOver = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, 'server', 'index.js'), 'utf8').includes('CC_LAUNCHER_SOCKETS');
  } catch {
    return false;
  }
};

function rollBack(why) {
  const s = store.reload();
  const failed = s.current?.version;
  say(`CC ${failed} ${why}: rolling back to ${s.previous?.version ?? builtInVersion}.`);
  s.failed = [...new Set([...(s.failed ?? []), failed])];
  s.current = s.previous ?? { version: builtInVersion, source: 'built-in' };
  s.previous = null;
  s.trialUntil = 0;
  store.record({ type: 'rolled-back', version: failed, to: s.current.version, why });
}

/** Start the chosen version's process. It says 'prepared', waits for 'go' with what the version before handed over. */
function spawn(target) {
  const legacy = !canHandOver(target.dir);
  const env = { ...process.env, CC_SUPERVISOR: '1', CC_BUILTIN_VERSION: builtInVersion, ...(legacy ? {} : { CC_LAUNCHER_SOCKETS: '1' }), ...(proxied && !process.env.NODE_USE_ENV_PROXY ? { NODE_USE_ENV_PROXY: '1' } : {}) };
  const proc = fork(path.join(target.dir, 'server', 'index.js'), [], { execArgv: ['--disable-warning=UNDICI-EHPA'], cwd: target.dir, env, stdio: 'inherit', serialization: 'advanced' });
  return { proc, version: target.version, source: target.source, legacy, ready: false, started: Date.now() };
}

const once = (proc, type, ms) =>
  new Promise((resolve, reject) => {
    const timer = ms ? setTimeout(() => done(new Error(`no "${type}" within ${ms / 1000} s`)), ms) : null;
    const onMsg = (m) => m?.type === type && done(null, m);
    const onExit = (code, signal) => done(new Error(`it stopped (${signal ?? `exit ${code}`})`));
    function done(error, m) {
      clearTimeout(timer);
      proc.off('message', onMsg);
      proc.off('exit', onExit);
      error ? reject(error) : resolve(m);
    }
    proc.on('message', onMsg);
    proc.once('exit', onExit);
  });

/** What happens when the answering version stops by itself. */
function watch(v) {
  v.proc.on('message', (m) => {
    if (m?.type === 'reload' && v === active) handover(m.reason ?? 'reload').catch((error) => say(`Handover failed: ${error.message}`));
  });
  v.proc.on('exit', (code, signal) => {
    if (v !== active) return;
    active = null;
    if (stopping) return process.exit(0);
    if (code === SWITCH_EXIT_CODE) return coldStart();
    const st = store.reload();
    if (st.trialUntil > Date.now() && st.current?.source === 'installed' && st.current.version === v.version && Date.now() - v.started < 2 * 60_000) {
      rollBack(`stopped ${v.ready ? 'soon after starting' : 'before it was up'} (${signal ?? `exit ${code}`})`);
      return coldStart();
    }
    crashes += 1;
    const wait = Math.min(60_000, 1000 * 2 ** Math.min(crashes, 6));
    say(`CC ${v.version} stopped (${signal ?? `exit ${code}`}); starting it again in ${wait / 1000} s. Connections wait meanwhile.`);
    setTimeout(coldStart, wait);
  });
}

/** Nothing answering (first start, or after a crash): start the chosen version; connections wait until it is up. */
async function coldStart() {
  if (stopping) return;
  const s = store.reload();
  const target = store.target();
  if (target.reason) {
    say(target.reason);
    store.record({ type: 'refused', version: s.current?.version, why: target.reason });
  }
  const trial = s.trialUntil > Date.now() && target.source === 'installed';
  const v = spawn(target);
  say(`Starting CC ${target.version} (${target.source}${trial ? ', on trial' : ''}${v.legacy ? ', listening on the port itself' : ''}).`);
  active = v;
  watch(v);
  try {
    if (v.legacy) await closePort();
    else {
      await openPort();
      await once(v.proc, 'prepared', START_TIMEOUT_MS);
      v.proc.send({ type: 'go', state: null });
    }
    await once(v.proc, 'ready', START_TIMEOUT_MS);
    v.ready = true;
    crashes = 0;
    if (trial) store.record({ type: 'started', version: v.version, ms: Date.now() - v.started });
    flush();
  } catch (error) {
    if (v !== active) return;
    if (trial) {
      rollBack(`did not come up (${error.message})`);
      v.proc.kill('SIGTERM');
    }
  }
}

/**
 * The answering version asked for a reload (a switch, a restored backup, Reload): the chosen version is loaded beside
 * it and takes over without the port closing. If it does not come up, the old one carries on.
 */
let handing = false;
async function handover(reason) {
  if (handing || stopping) return;
  const old = active;
  const s = store.reload();
  const target = store.target();
  if (target.reason) {
    say(target.reason);
    store.record({ type: 'refused', version: s.current?.version, why: target.reason });
  }
  const trial = s.trialUntil > Date.now() && target.source === 'installed';
  if (old.legacy || !canHandOver(target.dir)) {
    // A version from before handovers on either side: the old way, stopping the one and starting the other.
    say(`Moving to CC ${target.version} (${reason}) by restarting: one side predates handovers.`);
    old.proc.kill('SIGTERM');
    active = null;
    await new Promise((r) => old.proc.once('exit', r));
    return coldStart();
  }
  handing = true;
  const next = spawn(target);
  say(`Loading CC ${target.version} beside CC ${old.version} (${reason}${trial ? ', on trial' : ''}): no restart.`);
  try {
    await once(next.proc, 'prepared', START_TIMEOUT_MS);
    // From here new connections wait while the running version finishes what it is answering.
    old.ready = false;
    old.proc.send({ type: 'drain' });
    const { state } = await once(old.proc, 'drained', 60_000);
    next.proc.send({ type: 'go', state });
    await once(next.proc, 'ready', START_TIMEOUT_MS);
    next.ready = true;
    active = next;
    watch(next);
    flush();
    old.proc.send({ type: 'exit' });
    setTimeout(() => old.proc.kill('SIGTERM'), 5000).unref();
    if (trial) store.record({ type: 'started', version: next.version, ms: Date.now() - next.started });
    say(`CC ${next.version} took over from CC ${old.version} in ${((Date.now() - next.started) / 1000).toFixed(1)} s, with the port open throughout.`);
  } catch (error) {
    next.proc.kill('SIGTERM');
    if (trial) rollBack(`did not come up (${error.message})`);
    else say(`CC ${target.version} did not come up (${error.message}): CC ${old.version} carries on.`);
    if (old.proc.exitCode === null && old.proc.signalCode === null) {
      old.proc.send({ type: 'resume' });
      try {
        await once(old.proc, 'ready', 60_000);
        old.ready = true;
        flush();
      } catch {
        old.proc.kill('SIGTERM');
      }
    }
  } finally {
    handing = false;
  }
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    stopping = true;
    closePort();
    if (active) active.proc.kill(sig);
    else process.exit(0);
  });
}
coldStart();
