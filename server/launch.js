#!/usr/bin/env node
/**
 * The launcher (`npm start`, the container's command): starts the version chosen under Settings → Updates (or the
 * built-in one), and keeps it running. CxMissionZero's src/launch.js, for releases instead of images:
 *
 * - A switch (the server exits with 75) starts the newly chosen version on trial.
 * - A version on trial that does not say it is up within UPDATE_START_TIMEOUT_SECONDS (150), or stops within
 *   2 minutes, is rolled back to the version that ran before, and marked failed (never auto-installed again).
 * - A version that changed on disk since it was installed is not started: the built-in one runs instead.
 * - A crash outside a trial restarts it, with a growing pause.
 */
import { fork } from 'node:child_process';
import fs from 'node:fs';
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

const store = new VersionStore({ dataDir: config.dataDir, builtInDir, builtInVersion });
const say = (m) => console.log(`[launch] ${m}`);
let child = null;
let stopping = false;
let crashes = 0;

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

function start() {
  const s = store.reload();
  const target = store.target();
  if (target.reason) {
    say(target.reason);
    store.record({ type: 'refused', version: s.current?.version, why: target.reason });
  }
  const trial = s.trialUntil > Date.now() && target.source === 'installed';
  say(`Starting CC ${target.version} (${target.source}${trial ? ', on trial' : ''}).`);
  const started = Date.now();
  let ready = false;
  child = fork(path.join(target.dir, 'server', 'index.js'), [], { execArgv: ['--disable-warning=UNDICI-EHPA'], cwd: target.dir, env: { ...process.env, CC_SUPERVISOR: '1', CC_BUILTIN_VERSION: builtInVersion, ...(proxied && !process.env.NODE_USE_ENV_PROXY ? { NODE_USE_ENV_PROXY: '1' } : {}) }, stdio: 'inherit' });
  const timer = setTimeout(() => {
    if (ready || stopping) return;
    if (trial) {
      rollBack(`did not come up within ${START_TIMEOUT_MS / 1000} s`);
      child.kill('SIGTERM');
    }
  }, START_TIMEOUT_MS);
  child.on('message', (m) => {
    if (m?.type !== 'ready') return;
    ready = true;
    clearTimeout(timer);
    crashes = 0;
    if (trial) store.record({ type: 'started', version: target.version, ms: Date.now() - started });
  });
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    child = null;
    if (stopping) return process.exit(0);
    if (code === SWITCH_EXIT_CODE) return start();
    const st = store.reload();
    if (st.trialUntil > Date.now() && st.current?.source === 'installed' && Date.now() - started < 2 * 60_000) {
      rollBack(`stopped ${ready ? 'soon after starting' : 'before it was up'} (${signal ?? `exit ${code}`})`);
      return start();
    }
    crashes += 1;
    const wait = Math.min(60_000, 1000 * 2 ** Math.min(crashes, 6));
    say(`CC ${target.version} stopped (${signal ?? `exit ${code}`}); starting it again in ${wait / 1000} s.`);
    setTimeout(start, wait);
  });
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    stopping = true;
    if (child) child.kill(sig);
    else process.exit(0);
  });
}
start();
