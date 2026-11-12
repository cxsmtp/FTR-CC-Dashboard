/**
 * The Cx Credits Calculator, hosted for everyone: its page and code live in core/ and are this product's own (changed
 * here, not copied from anywhere). Around it:
 *
 *  - customers and reports are kept on this server, per team (src: ./accounts.js), not in one browser;
 *  - each person connects their own Checkmarx One tenant with an API key; the key is checked once and held in this
 *    server's memory for their session only: never written to disk, logged, or sent back;
 *  - Fusion for a prospect who is not a Checkmarx One customer: count their code from git with a read-only token
 *    (held only while the count runs), or import the report they make themselves with cloc-fusion (the page hands
 *    out cloc-fusion's one-file page); either way no Checkmarx One tenant is needed;
 *  - Checkmarx One and git are only called on the hosts allowed (CXONE_ALLOWED_HOSTS, GIT_ALLOWED_HOSTS), never on
 *    a private, link-local or metadata address, so a key or token cannot make the server call inside the network.
 */
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { CxClient } from '../core/src/cxone/client.js';
import { recorded } from './activity.js';
import { deriveConnection } from '../core/src/cxone/endpoints.js';
import { branchScopeOf } from '../core/src/cxone/branches.js';
import { DEFAULT_ENGINES, cleanEngines } from '../core/src/engines.js';
import { TenantReadStore, readFusionOffer, readJobView, readProgressOf, readTenant, seriesFor } from '../core/src/projections.js';
import { CLOC_FUSION, GIT_COUNT_LIMITS, clocFusionPage, createGitCounter, gitSource, listOrganizations, listRepositories, sweepLeftovers } from '../core/src/fusion-git.js';
import { MAX_PROJECTS, cleanOrigins, impactSettings, readLimit } from '../core/public/calculator/model.js';
import { summary } from '../core/public/calculator/profiles.js';
import { calculatorMarkup, reportRuntime, standaloneMarkup, wrapModule } from '../core/src/standalone-calculator.js';
import { licenceGateScript } from '../core/src/licence-gate.js';
import { fail } from './store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MZ_PUBLIC = path.join(ROOT, 'core', 'public');

// ---- Hosts the server may call -------------------------------------------------------------------

export const DEFAULT_CXONE_HOSTS = ['checkmarx.net', 'checkmarx.com'];
export const DEFAULT_GIT_HOSTS = ['github.com', 'api.github.com', 'codeload.github.com', 'gitlab.com', 'bitbucket.org', 'api.bitbucket.org', 'dev.azure.com', 'visualstudio.com', 'vssps.dev.azure.com'];

/** An address inside a network (private, loopback, link-local, carrier NAT, unique local), never called. */
export function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return privateAddress(mapped[1]);
    return /^(fc|fd|fe[89ab])/.test(v);
  }
  return true;
}

export const hostAllowed = (hostname, list) => {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  if (!host || net.isIP(host)) return false;
  return list.some((h) => host === h || host.endsWith(`.${h}`));
};

/** A host on the list whose every address is public: checked before a key or token is sent there. */
export async function checkHost(hostname, list, what) {
  if (!hostAllowed(hostname, list)) throw fail(400, `${hostname} is not a ${what} host this server calls (allowed: ${list.join(', ')}). An Admin can add it.`);
  let addresses = [];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw fail(400, `${hostname} could not be found.`);
  }
  if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw fail(400, `${hostname} points inside a network: this server does not call it.`);
}

// ---- The page ------------------------------------------------------------------------------------

const MIME = { '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const inlined = (css, root) =>
  css.replace(/url\(([^)'"]+)\)/g, (whole, ref) => {
    const mime = MIME[path.extname(ref)];
    const file = path.join(root, ref);
    if (!mime || ref.includes('..') || !fs.existsSync(file)) return whole;
    return `url(data:${mime};base64,${fs.readFileSync(file).toString('base64')})`;
  });
const scriptText = (s) => s.replace(/\r\n?/g, '\n').replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const contentHash = (t) => `'sha256-${createHash('sha256').update(t, 'utf8').digest('base64')}'`;
/** the calculator’s own bundle order (src/standalone-calculator.js), with this server's entry in place of its standalone.js. */
const MODULES = (() => {
  const text = fs.readFileSync(path.join(ROOT, 'core', 'src', 'standalone-calculator.js'), 'utf8');
  const list = JSON.parse((/^const MODULES = (\[[^\]]*\]);/m.exec(text)?.[1] ?? '[]').replace(/'/g, '"'));
  if (!list.includes('calculator/standalone.js')) throw new Error('core: the calculator bundle no longer ends with calculator/standalone.js; check scripts/sync-mz.mjs');
  return list.map((f) => (f === 'calculator/standalone.js' ? 'calculator/hosted.js' : f));
})();

let built = null;

/**
 * The hosted page, built once per start: the calculator’s calculator markup and modules bundled as the standalone calculator
 * is, with client/calculator-hosted.js in place of the calculator’s standalone.js. Its content security policy allows only its
 * own scripts (by hash) and calls to this server. The per-request settings go in a JSON element no script hash
 * depends on.
 */
export function calculatorPage({ productCode = '' } = {}) {
  if (built?.productCode === productCode) return built;
  const read = (file) => fs.readFileSync(path.join(MZ_PUBLIC, file), 'utf8');
  const index = new Map(MODULES.map((file, i) => [file, i]));
  const source = (file) => (file === 'calculator/hosted.js' ? fs.readFileSync(path.join(ROOT, 'client', 'calculator-hosted.js'), 'utf8') : read(file));
  const bundle = MODULES.map((file) => wrapModule(file, source(file), index)).join('\n\n');
  const gate = `\n${scriptText(licenceGateScript())}\n`;
  // An activation code given to the server (MZ_PRODUCT_CODE) is offered to the gate, so nobody has to type it.
  const seed = productCode ? `\n${scriptText(`try { if (!localStorage.getItem('mz-product-code')) localStorage.setItem('mz-product-code', ${JSON.stringify(productCode)}); } catch {}`)}\n` : '';
  const vendorScripts = ['calculator/vendor/xlsx-lite.js', 'calculator/vendor/parse.js'].map((file) => `\n${scriptText(read(file))}\n`);
  const main = `\n${scriptText(`const __m = [];\n${bundle}\nlet __started = false;\nwindow.__mzStart = () => {\n  if (__started) return;\n  __started = true;\n  __m[${index.get('calculator/hosted.js')}].startHosted();\n};\nif (!window.__mzBlocked) window.__mzStart();`)}\n`;
  const css = `\n${`${inlined(read('styles.css'), MZ_PUBLIC)}\n${inlined(read('nextgen.css'), MZ_PUBLIC)}\n${fs.readFileSync(path.join(ROOT, 'client', 'calculator-hosted.css'), 'utf8')}\n${fs.readFileSync(path.join(ROOT, 'public', 'standard.css'), 'utf8')}`.replace(/\r\n?/g, '\n')}\n`;
  const scripts = [...(seed ? [seed] : []), gate, ...vendorScripts, main];
  const csp = `default-src 'none'; script-src ${scripts.map(contentHash).join(' ')}; script-src-attr 'none'; style-src 'unsafe-inline'; style-src-elem ${contentHash(css)}; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src 'self'; worker-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const markup = standaloneMarkup(calculatorMarkup(read('index.html')), { launcher: true });
  const head = fs.readFileSync(path.join(ROOT, 'client', 'calculator-hosted.html'), 'utf8');
  const html = head
    .replace('<!--CSS-->', `<style>${css}</style>`)
    .replace('<!--CALCULATOR-->', markup)
    .replace('<!--SCRIPTS-->', `${seed ? `<script>${seed}</script>\n` : ''}<script>${gate}</script>\n<script type="application/json" id="cx-report-runtime">${JSON.stringify(reportRuntime({ root: MZ_PUBLIC })).replace(/</g, '\\u003c')}</script>\n${vendorScripts.map((t) => `<script>${t}</script>`).join('\n')}\n<script type="module">${main}</script>`);
  // The same page for everyone (each person's settings come from /api/cc/calc-config): compressed once, cached by ETag.
  const gz = zlib.gzipSync(html, { level: 9 });
  const etag = `"cc-${createHash('sha256').update(html).digest('hex').slice(0, 20)}"`;
  built = { productCode, html, csp, gz, etag };
  return built;
}

// ---- Each person's Checkmarx One connection and git counts ------------------------------------------

export class CalculatorService {
  #links = new Map(); // userId -> { client, connection, job, read }
  /** Reads a restart cut off, with no kept key to start them again: userId -> { account, at }. */
  interrupted = new Map();
  /** Told when a read ends (done or failed), to forget what was saved for resuming it. */
  onFinish = () => {};
  /** Checkmarx One activity (server/activity.js), and who a person and an account are, for it. */
  activity = null;
  /** What each tenant taught about calls that fail (server/resilience.js). */
  memory = null;
  describe = () => ({});
  #who(userId) {
    const l = this.#links.get(userId);
    return this.describe(userId, l?.account?.id ?? null) ?? {};
  }
  #note(userId, event) {
    this.activity?.add({ ...this.#who(userId), ...event });
  }
  /** A client whose every call is recorded for this person and the account they work on. */
  #client(userId, connection) {
    const client = this.connect(connection);
    return this.activity && typeof client?.request === 'function' ? recorded(client, { log: this.activity, tenant: connection.tenant, who: () => this.#who(userId), memory: this.memory }) : client;
  }
  /** The account a person works on (for the activity log): set when they connect for it or read for it. */
  workingOn(userId, account) {
    if (account) this.#link(userId).account = account;
  }
  /**
   * A connection to Checkmarx One is for one account: the one it was made for. Each account is another customer, so
   * a key given for one is never read into another, and what was read for one never serves another.
   */
  boundTo(userId, account) {
    if (account) this.#link(userId).boundTo = account;
  }
  /** The account this person's connection is for (the one they last read for, for a connection made before this was kept). */
  connectedFor(userId) {
    const l = this.#links.get(userId);
    return l?.client ? l.boundTo ?? l.account ?? null : null;
  }
  /** The account the last finished read was for: its figures are that account's alone. */
  readFor(userId) {
    const l = this.#links.get(userId);
    return l?.readFor ?? (l?.job?.state === 'done' ? l.job.account ?? null : null);
  }
  constructor({ cxoneHosts, gitHosts, log = console.log, connect = (c) => new CxClient(c) }) {
    this.cxoneHosts = cxoneHosts;
    this.gitHosts = gitHosts;
    this.connect = connect;
    this.log = log;
    this.counter = createGitCounter({ allowHost: (h) => hostAllowed(h, this.gitHosts), maxRunning: 2, log: (line) => log(`[git] ${line}`) });
    sweepLeftovers();
  }

  #link(userId) {
    if (!this.#links.has(userId)) this.#links.set(userId, { client: null, connection: null, job: null, read: new TenantReadStore({ file: null }) });
    return this.#links.get(userId);
  }

  /**
   * An update without a restart (server/launch.js): what this server holds in memory only, for the version taking over.
   * Each person's Checkmarx One connection (with its key: it goes from this process to the next over the launcher's
   * private channel, never to disk), a finished read not yet put into its account, the read the scope is worked out
   * from, and reads still running (started again there with the same connection).
   */
  handoff() {
    const people = [];
    for (const [userId, l] of this.#links) {
      if (!l.connection) continue;
      const job = l.job ? { ...l.job, live: null } : null;
      people.push({ userId, connection: l.connection, account: l.account ?? null, boundTo: l.boundTo ?? null, readFor: l.readFor ?? null, job: job?.state === 'running' ? null : job, rerun: job?.state === 'running' ? { input: job.input, account: job.account } : null, read: l.read.get() });
    }
    return { people, interrupted: [...this.interrupted] };
  }
  /** After handing over: this process lets go, so reads still finishing here change nothing. */
  release() {
    this.onFinish = () => {};
    this.#links.clear();
    this.interrupted.clear();
  }
  /** The other half of handoff(), in the version taking over. */
  adopt(state) {
    for (const p of state?.people ?? []) {
      try {
        const link = this.#link(p.userId);
        Object.assign(link, { client: this.#client(p.userId, p.connection), connection: p.connection, job: p.job ?? null, account: p.account ?? null, boundTo: p.boundTo ?? null, readFor: p.readFor ?? null });
        if (p.read?.weeks) link.read.save({ readAt: p.read.readAt, weeks: p.read.weeks, byProject: Object.entries(p.read.series ?? {}) });
        if (p.rerun) this.startRead(p.userId, p.rerun.input, p.rerun.account);
      } catch (error) {
        this.log(`! [handover] ${error.message}`);
      }
    }
    for (const [userId, cut] of state?.interrupted ?? []) this.interrupted.set(userId, cut);
  }

  /** Signed out, deactivated or removed: their key and what was read go. */
  forget(userId) {
    this.#links.delete(userId);
  }

  status(userId) {
    const l = this.#links.get(userId);
    const account = this.connectedFor(userId);
    return { connected: Boolean(l?.client), tenant: l?.connection?.tenant ?? '', baseUrl: l?.connection?.baseUrl ?? '', account: account ? { id: account.id, name: account.name } : null };
  }

  async connectKey(userId, input) {
    let connection;
    try {
      connection = deriveConnection(String(input?.apiKey ?? ''), { baseUrl: String(input?.baseUrl ?? '').trim(), iamUrl: String(input?.iamUrl ?? '').trim(), tenant: String(input?.tenant ?? '').trim() });
    } catch (error) {
      throw fail(400, error.message);
    }
    for (const u of [connection.iamUrl, connection.baseUrl]) await checkHost(new URL(u).hostname, this.cxoneHosts, 'Checkmarx One');
    const client = this.#client(userId, connection);
    const started = Date.now();
    try {
      await client.request('/api/projects', { query: { limit: 1, offset: 0 }, retries: 1 });
    } catch (error) {
      this.#note(userId, { kind: 'connect', tenant: connection.tenant, ok: false, status: error.status || 0, ms: Date.now() - started, detail: error.status === 401 || error.status === 403 ? 'API key refused' : String(error.message ?? '').slice(0, 160) });
      throw fail(400, error.status === 401 || error.status === 403 ? 'Checkmarx One refused that API key: check it has not expired and may read projects and scans.' : `Checkmarx One could not be reached: ${error.message}`);
    }
    Object.assign(this.#link(userId), { client, connection, job: null, read: new TenantReadStore({ file: null }) });
    this.#note(userId, { kind: 'connect', tenant: connection.tenant, ok: true, ms: Date.now() - started, detail: input?.kept ? 'with the account\u2019s kept key' : '' });
    return this.status(userId);
  }

  disconnect(userId) {
    const tenant = this.#links.get(userId)?.connection?.tenant;
    if (tenant) this.#note(userId, { kind: 'disconnect', tenant, ok: true });
    Object.assign(this.#link(userId), { client: null, connection: null, job: null, boundTo: null, readFor: null, read: new TenantReadStore({ file: null }) });
    return this.status(userId);
  }

  startRead(userId, input, account = null) {
    const state = this.#link(userId);
    if (!state.client) throw fail(409, 'Connect to Checkmarx One first: paste the customer\u2019s API key at the top. For a prospect who is not on Checkmarx One, use Fusion · from Git or Fusion · cloc-fusion.');
    if (state.job?.state === 'running') return readJobView(state.job);
    // The read runs here, on the server: the person can leave the calculator; it is followed again when they come back.
    const job = { id: randomUUID(), state: 'running', step: 'projects', done: 0, total: 0, read: 0, found: 0, startedAt: new Date().toISOString(), live: {}, account, applied: false, input: { branches: input?.branches, maxProjects: input?.maxProjects } };
    state.job = job;
    if (account) state.account = account;
    const client = state.client;
    const readStarted = Date.now();
    this.#note(userId, { kind: 'read', tenant: state.connection?.tenant, ok: true, detail: 'started' });
    Promise.all([
      readTenant(client, { branches: branchScopeOf(input?.branches), maxProjects: readLimit(input?.maxProjects), onProgress: readProgressOf(job), live: job.live }),
      readFusionOffer(client)
        .catch(() => ({ models: [], remainingCredits: null }))
        .then((offer) => {
          // Each engine with the rate that applies (Fusion rates); one with none is noted for a rate to be set.
          const rated = this.rates ? { ...offer, models: this.rates.rate(userId, offer.models) } : offer;
          const unrated = rated.models.filter((m) => !(Number(m.creditsPer10k) > 0)).map((m) => m.name);
          if (this.rates && unrated.length) this.rates.detected(userId, unrated, state.connection?.tenant ?? '');
          Object.assign(job.live ?? {}, { offer: rated });
          return rated;
        }),
    ])
      .then(([{ perProject, ...tenant }, offer]) => {
        state.read.save(perProject);
        state.readFor = job.account ?? null;
        Object.assign(job, { state: 'done', result: { ...tenant, ...offer }, finishedAt: new Date().toISOString(), live: null });
        this.#note(userId, { kind: 'read', tenant: state.connection?.tenant, ok: true, ms: Date.now() - readStarted, detail: `finished: ${tenant.projects?.length ?? 0} projects` });
        this.onFinish(userId, job);
      })
      .catch((error) => {
        Object.assign(job, { state: 'failed', error: error.status === 401 || error.status === 403 ? 'Checkmarx One refused the read: check the API key may read projects and scans.' : `Checkmarx One could not be read: ${error.message}`, finishedAt: new Date().toISOString(), live: null });
        this.#note(userId, { kind: 'read', tenant: state.connection?.tenant, ok: false, status: error.status || 0, ms: Date.now() - readStarted, detail: job.error.slice(0, 160) });
        this.onFinish(userId, job);
      });
    this.interrupted.delete(userId);
    return readJobView(job);
  }

  /**
   * The read as the calculator follows it. A finished read not yet put into its account stays "just finished", so the
   * calculator applies it when its account is opened again, however long the person was away.
   */
  readView(userId, since) {
    const job = this.#links.get(userId)?.job;
    // Which account the read is for goes with it: the calculator puts it nowhere else.
    const view = { ...readJobView(job, { since }), account: job?.account ? { id: job.account.id, name: job.account.name } : null };
    if (job?.state === 'done' && !job.applied) return { ...view, finishedAt: new Date().toISOString() };
    return view;
  }

  /** The account's projection was saved after its read finished: it is in. */
  markApplied(userId, accountId) {
    const job = this.#links.get(userId)?.job;
    if (job?.state === 'done' && !job.applied && (!job.account || job.account.id === accountId)) {
      job.applied = true;
      return true;
    }
    return false;
  }

  /** What runs for this person in the background, for the dashboard: the read, and the git count. */
  work(userId) {
    const job = this.#links.get(userId)?.job;
    const cut = this.interrupted.get(userId);
    if (!job && cut) return { read: { state: 'interrupted', account: cut.account, startedAt: cut.at, applied: false }, connected: false };
    return {
      read: job ? { state: job.state, step: job.step, done: job.done, total: job.total, startedAt: job.startedAt, finishedAt: job.finishedAt ?? null, error: job.error ?? null, account: job.account, applied: Boolean(job.applied), projects: job.result?.projects?.length ?? null } : null,
      connected: Boolean(this.#links.get(userId)?.client),
    };
  }

  series(userId, input, accountId = null) {
    // What was read is one account's: asked for another, it is refused (the figures would be another customer's).
    const mine = this.readFor(userId);
    if (accountId && mine && mine.id !== accountId) throw fail(409, `Checkmarx One was last read for ${mine.name}: connect with this account's own key and read it, before changing what is counted here.`);
    const read = this.#links.get(userId)?.read.get();
    if (!read?.weeks?.length) throw fail(409, 'Read Checkmarx One first: the scope is worked out from the last read.');
    const ids = Array.isArray(input?.projectIds) ? input.projectIds.slice(0, MAX_PROJECTS).map((id) => String(id).slice(0, 100)) : [];
    return seriesFor(read, ids, cleanEngines(input?.engines).length ? cleanEngines(input.engines) : DEFAULT_ENGINES, cleanOrigins(input?.origins));
  }

  // Fusion · from Git: a read-only token typed for one run, on a git host allowed, held only while it runs.
  async #source(input) {
    const typed = input?.token && typeof input.token === 'object' ? input.token : null;
    if (!typed) throw fail(400, 'Give the git host, its address and a token.');
    const source = gitSource({ provider: String(typed.provider ?? ''), address: String(typed.address ?? ''), token: String(typed.token ?? ''), key: 'token' });
    await checkHost(new URL(source.apiUrl).hostname, this.gitHosts, 'git');
    return source;
  }
  #ask(input) {
    return { orgs: (Array.isArray(input?.token?.orgs) ? input.token.orgs : input?.owner !== undefined ? [input.owner] : []).map(String).filter(Boolean).slice(0, 200), everything: input?.token?.everything === true };
  }
  gitConnections() {
    return { connections: [], limits: { repositories: GIT_COUNT_LIMITS.repositories, windowDays: GIT_COUNT_LIMITS.windowDays }, clocFusion: { version: CLOC_FUSION.version, sha256: CLOC_FUSION.sha256 } };
  }
  async gitOrganizations(input) {
    return { sources: [await listOrganizations(await this.#source(input), { allowHost: (h) => hostAllowed(h, this.gitHosts) })] };
  }
  async gitRepositories(input) {
    return listRepositories(await this.#source(input), this.#ask(input), { allowHost: (h) => hostAllowed(h, this.gitHosts) });
  }
  async gitCount(userId, input) {
    const source = await this.#source(input);
    return this.counter.start(userId, { source, repositories: input?.repositories, engine: String(input?.engine ?? 'auto') });
  }
  gitCountView(userId, id, after) {
    return this.counter.view(userId, id, { after });
  }
  clocFusion() {
    return clocFusionPage();
  }
}

export { impactSettings, summary };
