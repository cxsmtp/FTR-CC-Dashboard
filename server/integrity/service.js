/**
 * Software integrity: is the code running here exactly what this repository's release workflow built?
 * CxMissionZero's src/integrity/service.js, on this command center's release file list (MANIFEST.json).
 *
 *  - Files: every file of the running version against MANIFEST.json, the list the release build wrote
 *    (scripts/make-release.mjs); a changed, missing or added file is found at once, with no network.
 *  - Origin: GitHub's build attestation of that very file (signed by .github/workflows/release.yml with Sigstore,
 *    recorded in its public log) is fetched from api.github.com and checked here (sigstore.js, CxMissionZero's).
 *    Once confirmed for a file list, the answer is kept in the data folder, so a server without internet still
 *    knows after a reload.
 *
 * Checked a few seconds after start, every 6 hours (INTEGRITY_CHECK_HOURS), and with Check now. States: genuine,
 * tampered (files differ), not-genuine (no valid signature for the file list), unconfirmed (the files match; GitHub
 * could not be asked yet), unsigned (no file list: built from the source, such as a `podman build` of the repository).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { verifyBundle } from './sigstore.js';

const TRUSTED_ROOT = JSON.parse(fs.readFileSync(new URL('./trusted-root.json', import.meta.url), 'utf8'));
export const WORKFLOW = '.github/workflows/release.yml';
const FIRST = 20;
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** MANIFEST.json beside the running code, with the SHA-256 of its exact bytes; null when there is none. */
export function readManifest(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, 'MANIFEST.json'));
  } catch {
    return null;
  }
  try {
    const manifest = JSON.parse(text.toString('utf8'));
    if (!manifest?.files || typeof manifest.files !== 'object') return { error: 'The file list is not in a known format.', digest: sha256(text) };
    return { manifest, digest: sha256(text) };
  } catch {
    return { error: 'The file list cannot be read.', digest: sha256(text) };
  }
}

/** The files on disk against the list: changed, missing (listed, not there) and added (there, not listed). */
export async function compareFiles(root, manifest, { atOnce = 8 } = {}) {
  const listed = Object.entries(manifest.files ?? {});
  const changed = [];
  const missing = [];
  let next = 0;
  const worker = async () => {
    while (next < listed.length) {
      const [file, hash] = listed[next++];
      if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
        changed.push(file);
        continue;
      }
      let data;
      try {
        data = await fs.promises.readFile(path.join(root, file));
      } catch {
        missing.push(file);
        continue;
      }
      if (sha256(data) !== hash) changed.push(file);
    }
  };
  await Promise.all(Array.from({ length: atOnce }, worker));
  const walk = (dir, base = '') => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {}
    return entries.flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${base}${e.name}/`) : e.isFile() ? [`${base}${e.name}`] : []));
  };
  const known = new Set(listed.map(([f]) => f));
  const extra = walk(root).filter((f) => f !== 'MANIFEST.json' && !known.has(f));
  changed.sort();
  missing.sort();
  return { ok: !changed.length && !missing.length && !extra.length, checked: listed.length, changed: changed.slice(0, FIRST), missing: missing.slice(0, FIRST), extra: extra.slice(0, FIRST), counts: { changed: changed.length, missing: missing.length, extra: extra.length } };
}

export class IntegrityService {
  #cacheFile;
  #timer = null;
  #last = null;
  #running = null;

  constructor({ appDir, dataDir, repository, fetch = globalThis.fetch, token = '', record = () => {}, trustedRoot = TRUSTED_ROOT, api = 'https://api.github.com', timeoutMs = 15_000 }) {
    this.appDir = appDir;
    this.repository = repository;
    this.fetch = fetch;
    this.token = token;
    this.record = record;
    this.trustedRoot = trustedRoot;
    this.api = api;
    this.timeoutMs = timeoutMs;
    this.#cacheFile = path.join(dataDir, 'integrity-origin.json');
  }

  get last() {
    return this.#last;
  }

  /** GitHub's attestations of a file list (by its SHA-256), each checked; the first good one wins. */
  async verifyOrigin(digest) {
    const cached = this.#cached(digest);
    if (cached) return { ...cached, cached: true };
    let response;
    try {
      response = await this.fetch(`${this.api}/repos/${this.repository}/attestations/sha256:${digest}`, {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ftr-cc-dashboard-integrity', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return { ok: false, reachable: false, reason: `GitHub could not be reached (${error.cause?.code ?? error.message})` };
    }
    if (response.status === 404) return { ok: false, reachable: true, reason: 'GitHub has no build attestation for this file list' };
    if (!response.ok) return { ok: false, reachable: false, reason: `GitHub answered ${response.status}` };
    const body = await response.json().catch(() => ({}));
    let firstReason = '';
    for (const item of body.attestations ?? []) {
      let bundle = item.bundle;
      if (!bundle && typeof item.bundle_url === 'string' && /^https:\/\/[a-z0-9.-]+\.(github\.com|githubusercontent\.com)\//i.test(item.bundle_url)) {
        try {
          const r = await this.fetch(item.bundle_url, { headers: { 'User-Agent': 'ftr-cc-dashboard-integrity' }, signal: AbortSignal.timeout(this.timeoutMs) });
          bundle = r.ok ? await r.json() : null;
        } catch {
          bundle = null;
        }
      }
      if (!bundle) continue;
      const result = verifyBundle(bundle, { digest, trustedRoot: this.trustedRoot, repository: this.repository, workflow: WORKFLOW });
      if (result.ok) {
        this.#remember(digest, bundle);
        return result;
      }
      firstReason ||= result.reason;
    }
    return { ok: false, reachable: true, reason: firstReason || 'GitHub has no build attestation for this file list' };
  }

  /**
   * The signed bundle fetched before, verified again here (offline: its signature, certificate chain to the trusted
   * root and Sigstore log entry). The file only saves asking GitHub again; what it holds is never trusted as it is.
   */
  #cached(digest) {
    try {
      const all = JSON.parse(fs.readFileSync(this.#cacheFile, 'utf8'));
      const bundle = all?.[digest]?.bundle;
      if (!bundle) return null;
      const result = verifyBundle(bundle, { digest, trustedRoot: this.trustedRoot, repository: this.repository, workflow: WORKFLOW });
      return result.ok ? result : null;
    } catch {
      return null;
    }
  }

  #remember(digest, bundle) {
    let all = {};
    try {
      all = JSON.parse(fs.readFileSync(this.#cacheFile, 'utf8')) ?? {};
    } catch {}
    all[digest] = { bundle };
    try {
      fs.writeFileSync(this.#cacheFile, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-20))), { mode: 0o600 });
    } catch {}
  }

  /** Files and origin of the running version. One check at a time; callers share it. */
  check({ reason = 'scheduled' } = {}) {
    this.#running ??= this.#check(reason).finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #check(reason) {
    const at = new Date().toISOString();
    const read = readManifest(this.appDir);
    let result;
    if (!read) {
      result = { at, state: 'unsigned', summary: 'No signed file list: this copy was built from the source (for example a podman build of the repository), not installed from a release. The next update installs a signed release.' };
    } else if (read.error) {
      result = { at, state: 'tampered', digest: read.digest, summary: read.error };
    } else {
      const files = await compareFiles(this.appDir, read.manifest);
      const origin = await this.verifyOrigin(read.digest);
      const base = { at, version: read.manifest.version, commit: read.manifest.commit ?? '', built: read.manifest.built ?? '', digest: read.digest, files, origin };
      if (!files.ok) {
        const n = files.counts.changed + files.counts.missing + files.counts.extra;
        result = { ...base, state: 'tampered', summary: `${n === 1 ? '1 file differs' : `${n} files differ`} from what the release workflow built (${files.counts.changed} changed, ${files.counts.missing} missing, ${files.counts.extra} added).` };
      } else if (origin.ok) {
        result = { ...base, state: 'genuine', summary: `Genuine: all ${files.checked} files are exactly what ${origin.repository}’s release workflow built from ${origin.ref.replace(/^refs\/(heads|tags)\//, '')} (commit ${origin.commit.slice(0, 12)}), signed ${origin.signedAt.slice(0, 16).replace('T', ' ')} UTC and recorded in Sigstore’s public log.` };
      } else if (origin.reachable === false) {
        result = { ...base, state: 'unconfirmed', summary: `All ${files.checked} files match their list; who built it is not confirmed yet: ${origin.reason}.` };
      } else {
        result = { ...base, state: 'not-genuine', summary: `The files match their list, but the list is not signed by ${this.repository}’s release workflow: ${origin.reason}.` };
      }
    }
    const before = this.#last?.state;
    this.#last = { ...result, reason };
    if (result.state !== before) this.record(result);
    return this.#last;
  }

  start(hours = Number(process.env.INTEGRITY_CHECK_HOURS) || 6) {
    setTimeout(() => this.check({ reason: 'start' }).catch(() => {}), 5_000).unref?.();
    this.#timer = setInterval(() => this.check().catch(() => {}), Math.max(0.1, hours) * 3_600_000);
    this.#timer.unref?.();
  }

  stop() {
    clearInterval(this.#timer);
  }
}
