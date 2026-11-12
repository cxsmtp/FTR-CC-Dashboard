/**
 * Updates without downtime or data loss, the calculator’s way (docs/updating.md there), from this repository's GitHub
 * Releases instead of a container registry.
 *
 * - **Only what was released is installed.** A release carries `ftr-cc-dashboard-<version>.tar.gz` and `SHA256SUMS`.
 *   The archive must match its SHA-256 in SHA256SUMS; inside, `MANIFEST.json` lists every file with its SHA-256, and
 *   every file unpacked must be listed and match. Anything else is refused, with the reason. Before switching to an
 *   installed version its files are checked again, so a version changed on disk is never started.
 * - **Versions side by side** in DATA_DIR/app/versions/<version>, next to the one the server was installed with
 *   (built-in). The data folder is shared, and a backup is taken before every switch.
 * - **Switch and roll back.** The launcher (server/launch.js) starts the chosen version. A version that does not come
 *   up within 150 s, or stops within 2 minutes of a switch, is rolled back by itself and never auto-installed again.
 *   Any installed version, or the built-in one, can be switched to by hand.
 * - **Checked every few minutes** (15 unless an Admin sets another number, 5 to 1440), whether or not auto-update is
 *   on, and a minute after start, so Settings → Updates always says what is new.
 * - **Always on the newest version**: a newer release is installed and switched to as soon as it is found, without a
 *   restart. A rollback by hand holds back the version it left (and older ones) until a release newer than it comes.
 * - **Trusted checksums.** The first time a release is seen, its archive's SHA-256 and the SHA-256 of its SHA256SUMS
 *   are kept in DATA_DIR/app/state.json (trust on first use). A release whose checksums later differ from what was kept
 *   (re-published or changed) is never installed, by hand or by itself, and is shown as such. Installed versions are
 *   checked against their manifest on every check, and a change is recorded.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

import { TarParser, stripTop } from '../core/src/cloc-fusion/tar.js';
import { Doc, fail } from './store.js';

export const SWITCH_EXIT_CODE = 75;
export const ASSET = (v) => `ftr-cc-dashboard-${v}.tar.gz`;
const RELEASE_HOSTS = ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'codeload.github.com'];
const MAX_ARCHIVE = 150 * 1024 * 1024;
const MAX_FILE = 64 * 1024 * 1024;
const VERSION = /^\d+\.\d+\.\d+$/;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const compareVersions = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/** A relative path inside a version folder, or null for anything that could leave it. */
export function safeRelative(p) {
  const rel = String(p).replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel) || rel.split('/').some((s) => s === '..' || s === '') || rel.includes('\0')) return null;
  return rel;
}

/** Check a version folder against its MANIFEST.json: every listed file present and matching, nothing else. */
export function verifyFolder(dir) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8'));
  } catch {
    return { ok: false, reason: 'it has no readable MANIFEST.json' };
  }
  const listed = manifest?.files && typeof manifest.files === 'object' ? manifest.files : null;
  if (!listed || !VERSION.test(String(manifest.version ?? ''))) return { ok: false, reason: 'its MANIFEST.json is not a release manifest' };
  for (const [rel, hash] of Object.entries(listed)) {
    const safe = safeRelative(rel);
    if (!safe) return { ok: false, reason: `its manifest names a path outside the folder (${rel})` };
    let buf;
    try {
      buf = fs.readFileSync(path.join(dir, safe));
    } catch {
      return { ok: false, reason: `${rel} is missing` };
    }
    if (sha256(buf) !== hash) return { ok: false, reason: `${rel} changed since it was released` };
  }
  const walk = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]));
  const extra = walk(dir).filter((f) => f !== 'MANIFEST.json' && !(f in listed));
  if (extra.length) return { ok: false, reason: `it holds files the release did not (${extra.slice(0, 3).join(', ')})` };
  return { ok: true, version: manifest.version, files: Object.keys(listed).length };
}

/**
 * verifyFolder without holding up the server: files are read and hashed one at a time, asynchronously, so pages are
 * answered meanwhile. Gives the same answer.
 */
export async function verifyFolderAsync(dir) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.promises.readFile(path.join(dir, 'MANIFEST.json'), 'utf8'));
  } catch {
    return { ok: false, reason: 'it has no readable MANIFEST.json' };
  }
  const listed = manifest?.files && typeof manifest.files === 'object' ? manifest.files : null;
  if (!listed || !VERSION.test(String(manifest.version ?? ''))) return { ok: false, reason: 'its MANIFEST.json is not a release manifest' };
  for (const [rel, hash] of Object.entries(listed)) {
    const safe = safeRelative(rel);
    if (!safe) return { ok: false, reason: `its manifest names a path outside the folder (${rel})` };
    let buf;
    try {
      buf = await fs.promises.readFile(path.join(dir, safe));
    } catch {
      return { ok: false, reason: `${rel} is missing` };
    }
    if (sha256(buf) !== hash) return { ok: false, reason: `${rel} changed since it was released` };
  }
  const walk = async (d, base = '') => (await Promise.all((await fs.promises.readdir(d, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${base}${e.name}/`) : [`${base}${e.name}`])))).flat();
  const extra = (await walk(dir)).filter((f) => f !== 'MANIFEST.json' && !(f in listed));
  if (extra.length) return { ok: false, reason: `it holds files the release did not (${extra.slice(0, 3).join(', ')})` };
  return { ok: true, version: manifest.version, files: Object.keys(listed).length };
}

/** The versions kept, what runs, what failed, the events, and the auto-update choice: DATA_DIR/app/state.json. */
export class VersionStore {
  constructor({ dataDir, builtInDir, builtInVersion }) {
    this.root = path.join(dataDir, 'app');
    this.versionsDir = path.join(this.root, 'versions');
    fs.mkdirSync(this.versionsDir, { recursive: true, mode: 0o700 });
    this.builtInDir = builtInDir;
    this.builtInVersion = builtInVersion;
    this.doc = new Doc(path.join(this.root, 'state.json'), () => ({ current: null, previous: null, trialUntil: 0, failed: [], events: [], auto: { enabled: true, everyMinutes: 15 }, trusted: {}, lastCheck: null }));
    // Before CC 1.8 auto-update was off by default and only ran at an hour: on, as soon as found, unless an Admin chose otherwise.
    const st = this.doc.value;
    // Before CC 1.8 auto-update was off by default and ran at an hour; before 1.15 it could wait for an hour. Now it
    // checks every few minutes and installs as soon as it finds a release: on, unless an Admin turned it off.
    if (!st.auto?.everyMinutes) {
      st.auto = { enabled: true, everyMinutes: 15 };
      st.trusted ??= {};
      this.doc.save();
    }
    st.trusted ??= {};
  }
  get state() {
    return this.doc.value;
  }
  reload() {
    this.doc = new Doc(this.doc.file, () => this.doc.value);
    return this.state;
  }
  save() {
    this.doc.save();
  }
  dirOf(version) {
    if (!VERSION.test(String(version))) return null;
    return path.join(this.versionsDir, version);
  }
  installed() {
    return fs
      .readdirSync(this.versionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && VERSION.test(e.name))
      .map((e) => e.name)
      .sort(compareVersions)
      .reverse();
  }
  record(event) {
    this.state.events = [{ at: new Date().toISOString(), ...event }, ...(this.state.events ?? [])].slice(0, 100);
    this.save();
  }
  /** What the launcher starts: the chosen installed version when its files check out, else the built-in one. */
  target() {
    const cur = this.state.current;
    if (cur?.source === 'installed') {
      const dir = this.dirOf(cur.version);
      const check = dir && fs.existsSync(dir) ? verifyFolder(dir) : { ok: false, reason: 'it is not installed' };
      if (check.ok) return { version: cur.version, dir, source: 'installed' };
      return { version: this.builtInVersion, dir: this.builtInDir, source: 'built-in', reason: `CC ${cur.version} was not started: ${check.reason}. The built-in version runs instead.` };
    }
    return { version: this.builtInVersion, dir: this.builtInDir, source: 'built-in' };
  }
}

export class UpdateService {
  #timer = null;
  constructor({ store, runningVersion, repo, token = '', fetchImpl = globalThis.fetch, backup = async () => null, log = console.log, supervised = false, exit = (code) => process.exit(code) }) {
    this.store = store;
    this.running = runningVersion;
    this.repo = repo;
    this.token = token;
    this.fetch = fetchImpl;
    this.backup = backup;
    this.log = log;
    this.supervised = supervised;
    this.exit = exit;
    // The releases last seen, kept with the update state: a version taking over shows them at once, not after the next check.
    this.cache = Array.isArray(store.state?.releases) ? store.state.releases : null;
    this.busy = null;
  }

  async #get(url, { binary = false, limit = MAX_ARCHIVE } = {}) {
    let target = new URL(url);
    for (let hop = 0; hop < 5; hop++) {
      if (target.protocol !== 'https:' || !RELEASE_HOSTS.includes(target.hostname)) throw fail(400, `${target.hostname} is not a host updates come from.`);
      const headers = { 'User-Agent': 'ftr-cc-dashboard-updater', Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json' };
      // The token goes only to GitHub's API, never to the download hosts it redirects to.
      if (this.token && target.hostname === 'api.github.com') headers.Authorization = `Bearer ${this.token}`;
      const res = await this.fetch(target, { headers, redirect: 'manual', signal: AbortSignal.timeout(120_000) });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        target = new URL(res.headers.get('location'), target);
        continue;
      }
      if (!res.ok) {
        // GitHub's limit for servers that do not sign in (60 calls an hour): say so, and when it lifts.
        if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
          const at = Number(res.headers.get('x-ratelimit-reset')) * 1000;
          throw fail(503, `GitHub\u2019s hourly limit for servers that do not sign in is used up${Number.isFinite(at) && at ? `; it lifts at ${new Date(at).toISOString().slice(11, 16)} UTC, and the next check after that goes ahead by itself` : ''}. Set UPDATE_GITHUB_TOKEN to a GitHub token (read-only) to lift it.`);
        }
        throw fail(502, `GitHub answered ${res.status} for ${target.pathname}.`);
      }
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > limit) throw fail(413, 'That download is larger than a release can be.');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > limit) throw fail(413, 'That download is larger than a release can be.');
      return binary ? buf : JSON.parse(buf.toString('utf8'));
    }
    throw fail(502, 'Too many redirects.');
  }

  /** Every published release, newest first: what is installed, running, failed. */
  async check() {
    const releases = await this.#get(`https://api.github.com/repos/${this.repo}/releases?per_page=50`);
    const list = (Array.isArray(releases) ? releases : [])
      .filter((r) => !r.draft && VERSION.test(String(r.tag_name ?? '').replace(/^v/, '')))
      .map((r) => {
        const version = r.tag_name.replace(/^v/, '');
        const archive = r.assets?.find((a) => a.name === ASSET(version));
        const sums = r.assets?.find((a) => a.name === 'SHA256SUMS');
        return { version, name: r.name || r.tag_name, publishedAt: r.published_at, prerelease: Boolean(r.prerelease), notes: String(r.body ?? '').slice(0, 4000), url: r.html_url, // The files themselves from github.com's download links (not the API: those do not count against its hourly limit).
        archiveUrl: archive?.browser_download_url || archive?.url || '', sumsUrl: sums?.browser_download_url || sums?.url || '', size: archive?.size ?? 0, installable: Boolean(archive && sums) };
      })
      .sort((a, b) => compareVersions(b.version, a.version));
    // The checksums of the newest releases, kept the first time they are seen and compared every time after.
    for (const r of list.filter((x) => x.installable).slice(0, 5)) {
      try {
        await this.#pin(r);
      } catch (error) {
        r.pinError = error.message;
      }
    }
    for (const r of list) {
      const t = this.store.state.trusted?.[r.version];
      r.sha256 = t?.archive ?? '';
      r.tampered = Boolean(t?.tampered);
    }
    this.cache = list;
    this.store.state.releases = list.slice(0, 20).map((r) => ({ ...r, notes: r.notes.slice(0, 1500) }));
    this.store.state.lastCheck = { at: new Date().toISOString(), newest: list.find((r) => !r.prerelease)?.version ?? null };
    this.store.save();
    return list;
  }

  /** The release's SHA256SUMS and the archive's SHA-256 in it: kept the first time, and must not change after. */
  async #pin(release) {
    const text = (await this.#get(release.sumsUrl, { binary: true, limit: 64 * 1024 })).toString('utf8');
    const expected = text.split(/\r?\n/).map((l) => l.trim().split(/\s+\*?/)).find(([, name]) => name === ASSET(release.version))?.[0]?.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw fail(422, `SHA256SUMS of ${release.version} does not list ${ASSET(release.version)}: not installed.`);
    const sums = sha256(Buffer.from(text, 'utf8'));
    const trusted = (this.store.state.trusted ??= {});
    const kept = trusted[release.version];
    if (!kept) {
      trusted[release.version] = { archive: expected, sums, firstSeen: new Date().toISOString() };
      this.store.record({ type: 'trusted', version: release.version, sha256: expected });
    } else if (kept.archive !== expected || kept.sums !== sums) {
      if (!kept.tampered) {
        kept.tampered = { at: new Date().toISOString(), archive: expected, sums };
        this.store.record({ type: 'checksum-changed', version: release.version, why: `its SHA256SUMS changed since ${kept.firstSeen.slice(0, 10)} (kept ${kept.archive.slice(0, 12)}…, now ${expected.slice(0, 12)}…)` });
        this.log(`[updates] Release ${release.version} changed after it was published: it will not be installed.`);
      }
      throw fail(422, `Release ${release.version} changed after it was first seen (its checksums differ from those kept): not installed.`);
    }
    this.store.save();
    return expected;
  }

  /**
   * Installed versions whose files changed on disk: recorded once each. Checked in the background, one version after
   * another (never all at once on the server's own time), and remembered: `status()` shows the last answer.
   */
  #verified = new Map(); // version -> { ok, at }
  #verifying = null;
  #verifyInstalled() {
    if (this.#verifying) return this.#verifying;
    this.#verifying = (async () => {
      const s = this.store.state;
      s.changedOnDisk ??= [];
      for (const v of this.store.installed()) {
        const check = await verifyFolderAsync(this.store.dirOf(v)).catch((error) => ({ ok: false, reason: error.message }));
        this.#verified.set(v, { ok: check.ok, at: Date.now() });
        if (!check.ok && !s.changedOnDisk.includes(v)) {
          s.changedOnDisk.push(v);
          this.store.record({ type: 'changed-on-disk', version: v, why: check.reason });
        }
      }
    })().finally(() => (this.#verifying = null));
    return this.#verifying;
  }
  /** The newest release that would be offered (from the last check): no files read. */
  newer() {
    return (this.cache ?? []).find((r) => !r.prerelease && r.installable && !r.tampered && compareVersions(r.version, this.running) > 0) ?? null;
  }
  status() {
    const s = this.store.state;
    if (this.store.installed().some((v) => !this.#verified.has(v))) this.#verifyInstalled().catch(() => {});
    const installed = this.store.installed();
    return {
      running: this.running,
      builtIn: this.store.builtInVersion,
      source: s.current?.source ?? 'built-in',
      supervised: this.supervised,
      repo: this.repo,
      // As last checked in the background (null until the first check of that version has finished).
      installed: installed.map((v) => ({ version: v, verified: this.#verified.get(v)?.ok ?? null })),
      failed: s.failed ?? [],
      previous: s.previous,
      auto: s.auto,
      lastCheck: s.lastCheck,
      checkEveryMinutes: s.auto?.everyMinutes ?? 15,
      heldUpTo: s.heldUpTo ?? null,
      trusted: Object.entries(s.trusted ?? {}).map(([version, t]) => ({ version, sha256: t.archive, sums: t.sums, firstSeen: t.firstSeen, tampered: Boolean(t.tampered) })).sort((a, b) => compareVersions(b.version, a.version)),
      events: (s.events ?? []).slice(0, 30),
      releases: (this.cache ?? []).map((r) => ({ ...r, installed: installed.includes(r.version), runningNow: r.version === this.running, failed: (s.failed ?? []).includes(r.version) })),
      busy: this.busy,
    };
  }

  /** Download, check against SHA256SUMS and the manifest, and keep a release (it does not start it). */
  async install(version, { by = '' } = {}) {
    if (!VERSION.test(String(version))) throw fail(400, 'Choose a released version.');
    if (this.busy) throw fail(409, `Busy: ${this.busy}.`);
    this.busy = `installing ${version}`;
    const dir = this.store.dirOf(version);
    const temp = `${dir}.part`;
    try {
      const release = (this.cache ?? (await this.check())).find((r) => r.version === version) ?? (await this.check()).find((r) => r.version === version);
      if (!release?.installable) throw fail(404, `Release ${version} has no ${ASSET(version)} and SHA256SUMS to install from.`);
      if (this.store.state.trusted?.[version]?.tampered) throw fail(422, `Release ${version} changed after it was first seen (its checksums differ from those kept): not installed.`);
      const expected = await this.#pin(release);
      const archive = await this.#get(release.archiveUrl, { binary: true });
      const actual = sha256(archive);
      if (actual !== expected) throw fail(422, `The download of ${version} does not match its SHA-256 (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…): not installed.`);
      const files = this.#unpack(zlib.gunzipSync(archive, { maxOutputLength: 4 * MAX_ARCHIVE }));
      fs.rmSync(temp, { recursive: true, force: true });
      for (const [rel, bytes] of files) {
        const out = path.join(temp, rel);
        if (!out.startsWith(temp + path.sep)) throw fail(422, `The archive of ${version} holds a path outside its folder: not installed.`);
        fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
        fs.writeFileSync(out, bytes, { mode: 0o600 });
      }
      const check = verifyFolder(temp);
      if (!check.ok) throw fail(422, `${version} was not installed: ${check.reason}.`);
      if (check.version !== version) throw fail(422, `The archive says it is ${check.version}, not ${version}: not installed.`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(temp, dir);
      this.store.record({ type: 'installed', version, by, sha256: actual, files: check.files });
      return { version, sha256: actual, files: check.files };
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      this.store.record({ type: 'install-failed', version, by, error: error.message });
      throw error;
    } finally {
      this.busy = null;
    }
  }

  #unpack(tar) {
    const files = new Map();
    const parser = new TarParser({
      maxFileBytes: MAX_FILE,
      onEntry: ({ path: p }) => Boolean(safeRelative(stripTop(p))),
      onFile: (entry, bytes) => files.set(safeRelative(stripTop(entry.path)), Buffer.from(bytes)),
    });
    parser.push(new Uint8Array(tar));
    if (!files.size) throw fail(422, 'The archive is empty.');
    return files;
  }

  /** Make `version` ('built-in' or an installed one) the one that runs: a backup first, then the launcher restarts. */
  async switchTo(version, { by = '', reason = 'by hand' } = {}) {
    const s = this.store.state;
    const builtIn = version === 'built-in' || version === this.store.builtInVersion;
    if (!builtIn) {
      const dir = this.store.dirOf(version);
      if (!dir || !fs.existsSync(dir)) throw fail(404, `${version} is not installed.`);
      const check = verifyFolder(dir);
      if (!check.ok) throw fail(422, `${version} is not switched to: ${check.reason}.`);
    }
    if (!this.supervised) throw fail(409, 'This server was not started by the launcher (npm start, or node server/launch.js), so it cannot switch versions by itself.');
    const backup = await this.backup(`before switching to ${builtIn ? `the built-in ${this.store.builtInVersion}` : version}`);
    s.previous = s.current ?? { version: this.running, source: 'built-in' };
    s.current = builtIn ? { version: this.store.builtInVersion, source: 'built-in' } : { version, source: 'installed' };
    s.trialUntil = Date.now() + 2 * 60_000;
    s.failed = (s.failed ?? []).filter((v) => v !== s.current.version);
    // A rollback by hand: what it left is not installed again by itself, until something newer comes. Moving forward
    // by hand (or by itself) lifts that.
    if (reason === 'rollback by hand' && compareVersions(this.running, s.current.version) > 0) s.heldUpTo = this.running;
    else if (s.heldUpTo && compareVersions(s.current.version, s.heldUpTo) >= 0) s.heldUpTo = null;
    this.store.record({ type: 'switch', from: this.running, to: s.current.version, by, reason, backup });
    this.log(`[updates] Switching from ${this.running} to ${s.current.version} (${reason}).`);
    setTimeout(() => this.exit(SWITCH_EXIT_CODE), 300).unref?.();
    return { switching: true, to: s.current.version };
  }

  setAuto({ everyMinutes }, { by = '' } = {}) {
    const auto = { ...this.store.state.auto, enabled: true };
    if (everyMinutes !== undefined) {
      const m = Number(everyMinutes);
      if (!(Number.isInteger(m) && m >= 5 && m <= 1440)) throw fail(400, 'Check every 5 to 1,440 minutes.');
      auto.everyMinutes = m;
      this.#schedule();
    }
    this.store.state.auto = auto;
    this.store.record({ type: 'auto', by, ...auto });
    return auto;
  }

  /** A minute after start, then every few minutes (as the Admin set). */
  start() {
    this.#started = true;
    this.#schedule(60_000);
  }
  #started = false;
  #schedule(first) {
    clearTimeout(this.#timer);
    if (!this.#started) return;
    const every = Math.max(5, Number(this.store.state.auto?.everyMinutes) || 15) * 60_000;
    this.#timer = setTimeout(async () => {
      await this.autoTick().catch((error) => this.log(`[updates] ${error.message}`));
      this.#schedule();
    }, first ?? every);
    this.#timer.unref?.();
  }
  stop() {
    this.#started = false;
    clearTimeout(this.#timer);
  }
  /** Every 15 minutes: look for releases (always), check what is installed, and auto-update when it is on. */
  async autoTick(now = new Date()) {
    if (this.busy) return null;
    let releases;
    try {
      releases = await this.check();
    } catch (error) {
      this.store.state.lastCheck = { ...(this.store.state.lastCheck ?? {}), failedAt: now.toISOString(), error: error.message };
      this.store.save();
      throw error;
    }
    this.#verifyInstalled().catch(() => {});
    const { failed = [], heldUpTo = null } = this.store.state;
    const newest = releases.find((r) => !r.prerelease && r.installable && !r.tampered && !r.pinError && !failed.includes(r.version));
    if (!newest || compareVersions(newest.version, this.running) <= 0) return null;
    // Rolled back by hand: not back to that version, only to a newer one.
    if (heldUpTo && compareVersions(newest.version, heldUpTo) <= 0) return { held: newest.version };
    if (!this.supervised) return { available: newest.version };
    if (!this.store.installed().includes(newest.version)) await this.install(newest.version, { by: 'auto-update' });
    return this.switchTo(newest.version, { by: 'auto-update', reason: 'auto-update' });
  }
}
