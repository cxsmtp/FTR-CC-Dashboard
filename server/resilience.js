/**
 * Calls to Checkmarx One that did not succeed: why, what was done about it, and what is done differently next time.
 *
 * The client (core/src/cxone/client.js) already signs in again on a 401, and waits and tries again on 429, 502,
 * 503, 504 and a dropped connection; what reaches the log has been through that. Here:
 *   - explainCall(): the reason in plain words, what was done (the read goes on: a fallback, or the item left out),
 *     and the lesson; and a verdict: "expected" (an optional API this tenant does not offer), "recovered" (the read got
 *     what it needed another way), or "failed" (something someone should look at).
 *   - CallMemory: what each tenant taught. A scan with no SAST metadata is not asked for it again (its lines of code
 *     come from the scan itself); an optional API a tenant does not offer, or refuses to this key, is not asked again
 *     for a week; a tenant that asked to slow down is noted. Avoided calls are counted, never made, never failures.
 *     Kept in DATA_DIR/cxone-learned.json, and handed over with a new version (it is on disk).
 */
import fs from 'node:fs';
import path from 'node:path';

const WEEK = 7 * 86_400_000;
/** Calls at once to a tenant that asked to slow down (the client's own limit is 24). */
export const SLOW_AT_ONCE = 6;
/** The optional APIs a read tries (core/src/projections.js FUSION_MODEL_PATHS, CREDIT_BALANCE_PATHS). */
const OPTIONAL = /^\/api\/(fusion\/models|fusion\/config|scan-config\/fusion\/models|fusion\/credits|credits\/balance|credits\/info|configuration\/tenant)$/;
const SAST_META = /^\/api\/sast-metadata\/([^/?]+)$/;

/** What an API path is about, for a person: "SAST scan metadata", "a project's branches"… */
function areaOf(p) {
  if (SAST_META.test(p) || p.startsWith('/api/sast-metadata')) return 'SAST scan metadata';
  if (/\/branches/.test(p)) return 'a project’s branches';
  if (p.startsWith('/api/scans')) return 'scans';
  if (p.startsWith('/api/projects')) return 'projects';
  if (p.startsWith('/api/applications')) return 'applications';
  if (/results|scan-summary|summary/.test(p)) return 'scan results';
  if (OPTIONAL.test(p)) return 'Fusion engines and credits';
  return p.replace(/^\/api\//, '').split('/')[0] || 'this API';
}

/**
 * Why a logged call did not succeed, what was done, and what happens next time. `e` is an activity event
 * (kind "call", ok false, status, path as shortPath gives it, method).
 */
export function explainCall(e) {
  const p = String(e.path ?? '');
  const s = Number(e.status) || 0;
  const area = areaOf(p);
  if (s === 404 && p.startsWith('/api/sast-metadata')) {
    return { verdict: 'recovered', why: 'This scan has no SAST metadata: SAST did not run in it, or its results were removed.', done: 'Its lines of code were taken from the scan’s own details instead (GET /api/scans/:id).', next: 'Learned: these scans are not asked for SAST metadata again on this tenant.' };
  }
  if ((s === 404 || s === 403 || s === 400) && OPTIONAL.test(p)) {
    return { verdict: 'expected', why: `This tenant does not offer this optional API (${s}).`, done: 'Skipped: the engines and their rates come from Fusion engines & rates.', next: 'Learned: not asked again on this tenant for a week.' };
  }
  if (s === 404) {
    return { verdict: 'recovered', why: `It was gone when asked: removed or moved in Checkmarx One between being listed and being read (${area}).`, done: 'Left out of this read; everything else went on.', next: 'Nothing to do: the next read lists only what is there.' };
  }
  if (s === 401) {
    return { verdict: 'failed', why: 'Checkmarx One no longer accepts the API key (the access token was refused even after signing in again).', done: 'Signed in again from the API key and tried once more; it was still refused.', next: 'If it keeps happening the key was revoked or expired: paste a new one (and tick Remember for the account).' };
  }
  if (s === 403) {
    return { verdict: OPTIONAL.test(p) ? 'expected' : 'failed', why: `The API key’s role may not read ${area}.`, done: 'Skipped; the read went on without it.', next: `Learned: not asked again on this tenant for a week. To include it, give the key’s client a role that reads ${area}.` };
  }
  if (s === 429) {
    return { verdict: 'failed', why: 'Checkmarx One asked to slow down (too many requests at once) and still refused after waiting as it asked, three times.', done: 'Left out of this read; everything else went on.', next: `Learned: this tenant is read with at most ${SLOW_AT_ONCE} calls at once from now on.` };
  }
  if (s === 400) {
    return { verdict: 'failed', why: `Checkmarx One did not accept the request for ${area} (400): its API may have changed.`, done: 'Left out of this read; everything else went on.', next: 'Send the troubleshooting report to whoever looks after the command center.' };
  }
  if (s >= 500 || s === 0) {
    const reach = s === 502 && /reach/i.test(String(e.detail ?? ''));
    return { verdict: 'failed', why: reach ? 'Checkmarx One could not be reached: the network dropped, or the answer took too long.' : `Checkmarx One had a problem answering (${s}).`, done: 'Waited and tried again, up to three times, with a longer pause each time.', next: 'Usually passes by itself; if many calls fail together, Checkmarx One or the network was down at that time.' };
  }
  return { verdict: 'failed', why: `Checkmarx One answered ${s || 'nothing'}.`, done: 'Left out of this read; everything else went on.', next: 'Look at the troubleshooting report if it repeats.' };
}

/** A key from a tenant name or a request path: never one that reaches an object's prototype. */
const safeKey = (v) => {
  const k = String(v ?? '');
  return k === '__proto__' || k === 'constructor' || k === 'prototype' ? `_${k}` : k;
};

export class CallMemory {
  constructor({ dataDir }) {
    this.file = path.join(dataDir, 'cxone-learned.json');
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.data = { tenants: {} };
    }
    this.timer = null;
  }
  #tenant(t) {
    const key = safeKey(t || '-');
    if (Object.getPrototypeOf(this.data.tenants) !== null) this.data.tenants = Object.assign(Object.create(null), this.data.tenants);
    this.data.tenants[key] ??= { noSastMeta: [], skip: Object.create(null), slow: null, avoided: 0, learnedAt: null };
    const t2 = this.data.tenants[key];
    if (Object.getPrototypeOf(t2.skip ?? {}) !== null) t2.skip = Object.assign(Object.create(null), t2.skip);
    return t2;
  }
  #save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fs.writeFileSync(this.file, JSON.stringify(this.toJSON()), { mode: 0o600 });
      } catch {}
    }, 1000);
    this.timer.unref?.();
  }
  /** Should this call be made? false when this tenant taught it fails; counted as avoided. `raw` is the real path. */
  allows(tenant, raw) {
    const t = this.data.tenants[String(tenant || '-')];
    if (!t) return true;
    const p = String(raw).split('?')[0];
    const meta = SAST_META.exec(p);
    let skip = false;
    if (meta && (t.noSastSet ??= new Set(t.noSastMeta)).has(decodeURIComponent(meta[1]))) skip = true;
    const until = t.skip?.[p];
    if (until && Date.parse(until) > Date.now()) skip = true;
    if (skip) {
      t.avoided = (t.avoided ?? 0) + 1;
      this.#save();
    }
    return !skip;
  }
  /** What a call that did not succeed teaches. */
  learn(tenant, raw, status) {
    const t = this.#tenant(tenant);
    const p = String(raw).split('?')[0];
    const meta = SAST_META.exec(p);
    if (meta && status === 404) {
      const id = decodeURIComponent(meta[1]);
      t.noSastSet ??= new Set(t.noSastMeta);
      if (!t.noSastSet.has(id)) {
        t.noSastSet.add(id);
        t.noSastMeta.push(id);
        if (t.noSastMeta.length > 50_000) t.noSastMeta.splice(0, t.noSastMeta.length - 50_000);
      }
    } else if (OPTIONAL.test(p) && [400, 403, 404].includes(status)) {
      t.skip[p] = new Date(Date.now() + WEEK).toISOString();
    } else if (status === 403) {
      t.skip[p] = new Date(Date.now() + WEEK).toISOString();
    } else if (status === 429) {
      t.slow = new Date().toISOString();
    } else return;
    t.learnedAt = new Date().toISOString();
    this.#save();
  }
  /** Did this tenant ask to slow down (in the last 30 days)? */
  isSlow(tenant) {
    const t = this.data.tenants[String(tenant || '-')];
    return Boolean(t?.slow && Date.parse(t.slow) > Date.now() - 30 * 86_400_000);
  }
  /** What each tenant taught, for the CxOne API audit page. */
  summary(tenants = null) {
    return Object.entries(this.data.tenants)
      .filter(([k]) => !tenants || tenants.has(k))
      .map(([tenant, t]) => ({ tenant, noSastMeta: t.noSastMeta.length, skipped: Object.entries(t.skip ?? {}).filter(([, u]) => Date.parse(u) > Date.now()).map(([p, until]) => ({ path: p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id'), until })), slow: t.slow, avoided: t.avoided ?? 0, learnedAt: t.learnedAt }));
  }
  /** Back to knowing nothing about a tenant (the Admin's choice). */
  forget(tenant) {
    delete this.data.tenants[String(tenant)];
    this.#save();
  }
  toJSON() {
    return { tenants: Object.fromEntries(Object.entries(this.data.tenants).map(([k, t]) => [k, { ...t, noSastSet: undefined }])) };
  }
}
