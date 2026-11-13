import { checkSalesforceUrl, viewing } from '../accounts.js';
import { impactSettings } from '../calculator.js';
import { withRates } from '../fusion-rates.js';
import { teamPath } from '../rbac.js';
import { explainCall } from '../resilience.js';
import { fail } from '../store.js';
import { INDUSTRIES } from '../estimate.js';

/**
 * The calculator's API (/api/projections…) per team, the status lights, the Checkmarx One activity log, and the rule that a Salesforce link belongs to one account.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerProjections(d) {
  const {
    accounts, activity, brandingView, calc, calcTeam, deleteReport, hosts, iam, integrity, mailReady, perm,
    r, ratesFor, ready2, record, settings, smtpNow, teams, updates, userName, versionLabel, withTrRates,
  } = d;
  // ---- Salesforce links are unique: one account per opportunity or account ------------------------------------
  /** The account a link is already on, as the one asking may see it: opened only when it is theirs to open. */
  function takenView(meta, ctx) {
    if (!meta || !ctx?.user) return null;
    const canOpen = Boolean(ctx.scope?.has(meta.teamId)) && !viewing.run({ id: ctx.user.id, admin: ctx.user.role === 'admin', calc: false }, () => accounts.hiddenFrom(meta));
    return { id: meta.id, name: meta.name, team: teams.get(meta.teamId)?.name ?? '', owner: userName(meta.ownerId), salesforceId: meta.salesforceId ?? '', canOpen, teamId: canOpen ? meta.teamId : null, calculator: canOpen && ctx.permissions.has('calculator.use'), starting: Boolean(meta.pendingSince) };
  }
  r('GET', '/api/cc/salesforce-taken', ready2, (req, ctx, body, res, url) => {
    let sf;
    try {
      sf = checkSalesforceUrl(url.searchParams.get('url') ?? '', hosts().salesforce);
    } catch (error) {
      return { taken: null, error: error.message };
    }
    return { taken: takenView(accounts.usingSalesforce(sf.recordId, String(url.searchParams.get('except') ?? '')), ctx), kind: sf.kind, recordId: sf.recordId };
  });

  // ---- The calculator's API (/api/projections…), per team -----------------------------------------------------
  r('GET', '/api/projections', calcTeam, (req, ctx) => ({ customers: accounts.list(ctx.teamSet).map((a) => ({ ...a })).sort((a, b) => String(a.name).localeCompare(String(b.name))), organisationName: settings.value.organisationName, impactDefaults: impactSettings({}) }));
  r('POST', '/api/projections', calcTeam, (req, ctx, body) => {
    // An account is made only with its Salesforce link, and kept for its maker alone until it has a projection.
    if (!String(body?.salesforceUrl ?? '').trim()) throw fail(409, 'Give the account\u2019s Salesforce opportunity or account link with its name: an account is made only with both.');
    const salesforce = checkSalesforceUrl(body.salesforceUrl, hosts().salesforce);
    const a = accounts.start({ name: body?.name, teamId: ctx.team, user: ctx.user, salesforce });
    record(ctx, req, 'account.start', a.name, { id: a.id, team: teams.get(ctx.team)?.name, salesforce: salesforce.recordId });
    return { customer: withTrRates(withRates(a, ratesFor(ctx.user.id))) };
  });
  r('GET', '/api/projections/report-runtime', calcTeam, async () => (await import('../core/src/calculator-bundle.js')).reportRuntime());
  r('GET', '/api/projections/reports', calcTeam, (req, ctx, body, res, url) => ({ reports: accounts.reportsOf(ctx.teamSet, String(url.searchParams.get('customer') ?? '')) }));
  r('POST', '/api/projections/reports', calcTeam, (req, ctx, body) => {
    {
      const meta = accounts.accounts.meta(String(body?.customerId ?? ''));
      const owner = meta ? iam.byId(meta.ownerId) : null;
      if (meta && (!owner || owner.role === 'cs' || owner.active === false)) throw fail(409, 'Choose the accountable Sales Engineer for this account first (at the top of the calculator): a projection is always for an SE.');
    }
    const rep = accounts.addReport({ customerId: String(body?.customerId ?? ''), data: body?.data, user: ctx.user }, ctx.teamSet);
    record(ctx, req, 'report.create', rep.customer, { id: rep.id, totalCredits: rep.totalCredits, team: teams.get(rep.teamId)?.name });
    const repMeta = accounts.accounts.meta(String(body?.customerId ?? ''));
    activity.add({ kind: 'report', user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, teamId: ctx.user.teamId }, account: repMeta ? { id: repMeta.id, name: repMeta.name, teamId: repMeta.teamId } : null, tenant: calc.status(ctx.user.id).tenant || '', ok: true, detail: `${Math.round(rep.totalCredits ?? 0).toLocaleString('en')} credits` });
    const { data, ...meta } = rep;
    void data;
    return { report: meta };
  });
  r('GET', '/api/projections/reports/:id', calcTeam, (req, ctx, body, res, url, params) => ({ report: accounts.report(params.id, ctx.teamSet) }));
  r('DELETE', '/api/projections/reports/:id', calcTeam, (req, ctx, body, res, url, params) => {
    deleteReport(req, ctx, params.id, ctx.teamSet);
    return { ok: true };
  });
  r('POST', '/api/projections/reports/:id/email', calcTeam, () => {
    throw fail(409, 'Download the report and send it to the customer yourself, then mark it shared on the account page.');
  });
  r('POST', '/api/projections/read', calcTeam, (req, ctx, body) => {
    // Which account it is for, so the dashboard can say so and the calculator puts it there when the person comes back.
    const id = String(req.headers['x-account'] ?? '');
    const meta = id && accounts.accounts.meta(id);
    const account = meta && ctx.teamSet.has(meta.teamId) ? { id: meta.id, name: meta.name, teamId: meta.teamId } : null;
    if (meta && !meta.salesforceUrl) throw fail(409, 'Save the account\u2019s Salesforce opportunity or account link first: nothing is read or generated without it.');
    // Each account is another customer: Checkmarx One is read only for the account the connection was made for.
    if (!account) throw fail(409, 'Open the account first: Checkmarx One is read for an account.');
    const bound = calc.connectedFor(ctx.user.id);
    if (bound && bound.id !== account.id) {
      record(ctx, req, 'cxone.read.refused', account.name, { connectedFor: bound.name, tenant: calc.status(ctx.user.id).tenant });
      throw fail(409, `You are connected to Checkmarx One for ${bound.name}, not for ${account.name}. Paste ${account.name}\u2019s own API key (Data from, at the top) and read again: one customer\u2019s data is never read into another\u2019s account.`);
    }
    const kept = accounts.accounts.meta(account.id)?.cxone?.tenant;
    const tenantNow = calc.status(ctx.user.id).tenant;
    if (kept && tenantNow && kept !== tenantNow) throw fail(409, `${account.name} is kept with the Checkmarx One tenant ${kept}, and you are connected to ${tenantNow}. Connect with ${account.name}\u2019s key, or forget the key kept for it first.`);
    const view = calc.startRead(ctx.user.id, body, account);
    // Kept on disk until its result is in its account: a restart meanwhile starts it again.
    d.pendingReads.value.reads[ctx.user.id] = { account, input: { branches: body?.branches, maxProjects: body?.maxProjects }, startedAt: new Date().toISOString() };
    d.pendingReads.save();
    return view;
  });
  r('GET', '/api/cc/work', perm('calculator.use'), (req, ctx) => calc.work(ctx.user.id));
  /** The top bar's lights: this person's Checkmarx One connection, email, git, and (for Admins) a newer version. */
  r('GET', '/api/status', ready2, (req, ctx) => {
    const cx = calc.status(ctx.user.id);
    const work = calc.work(ctx.user.id).read;
    // Asked on every page: what the last check found, never the installed versions' files.
    const newer = ctx.permissions.has('system.update') ? updates.newer?.() : null;
    return {
      cxone: { on: cx.connected, tenant: cx.tenant, reading: work?.state === 'running' },
      email: { on: mailReady(), configured: Boolean(smtpNow().host) },
      git: { on: hosts().git.length > 0, hosts: hosts().git.length },
      update: newer ? { version: newer.version } : null,
      integrity: ctx.permissions.has('system.update') ? (integrity.last?.state ?? null) : null,
    };
  });
  /**
   * Checkmarx One activity, for everyone: their own, and that of the teams they see (an SE their team; a leader every
   * team below; Executives and Admins all). Filter by people, tenant, kind, account, outcome and dates.
   */
  r('GET', '/api/activity', ready2, (req, ctx, body, res, url) => {
    const sp = url.searchParams;
    const list = (k) => sp.getAll(k).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
    const who = new Set(list('who').map((x) => (x === 'me' ? ctx.user.id : x)));
    const tenants = new Set(list('tenant'));
    const kinds = new Set(list('kind'));
    const accountIds = new Set(list('account'));
    const outcome = sp.get('outcome') ?? '';
    const verdictOf = (e) => (e.kind === 'call' ? explainCall(e).verdict : 'failed');
    const from = sp.get('from') ? Date.parse(sp.get('from')) : null;
    const to = sp.get('to') ? Date.parse(sp.get('to')) + 86_400_000 : null;
    const before = sp.get('before') ?? '';
    const limit = Math.min(500, Math.max(1, Number(sp.get('limit')) || 200));
    const visible = (e) => e.user?.id === ctx.user.id || ctx.scope.has(e.user?.teamId) || (e.account && ctx.scope.has(e.account.teamId));
    const matches = (e) => {
      if (!visible(e)) return false;
      if (before && e.at >= before) return false;
      const t = Date.parse(e.at);
      if (from && t < from) return false;
      if (to && t >= to) return false;
      if (who.size && !who.has(e.user?.id)) return false;
      if (tenants.size && !tenants.has(e.tenant)) return false;
      if (kinds.size && !kinds.has(e.kind)) return false;
      if (accountIds.size && !accountIds.has(e.account?.id)) return false;
      if (outcome === 'ok' && e.ok === false) return false;
      if (outcome === 'failed' && e.ok !== false) return false;
      if (outcome === 'attention' && (e.ok !== false || verdictOf(e) !== 'failed')) return false;
      if (outcome === 'recovered' && (e.ok !== false || verdictOf(e) === 'failed')) return false;
      return true;
    };
    const events = activity.recent({ limit: limit + 1, filter: matches });
    // The filters, and a summary of the last 30 days, from what this person may see.
    const since = Date.now() - 30 * 86_400_000;
    const seen = activity.recent({ limit: 20000, filter: (e) => visible(e) && Date.parse(e.at) >= since });
    const people = new Map();
    const tenantSet = new Set();
    const accountsSeen = new Map();
    const summary = { calls: 0, failed: 0, attention: 0, recovered: 0, reads: 0, reports: 0, connects: 0, tenants: 0, ms: 0 };
    // Every call that did not succeed, grouped by what it was and why: the reason, what was done, the lesson.
    const groups = new Map();
    // The person looking is always one of the people to pick ("Only me" is kept however little they did).
    people.set(ctx.user.id, { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email, email: ctx.user.email ?? '' });
    for (const e of seen) {
      if (e.user?.id) people.set(e.user.id, { id: e.user.id, name: e.user.name ?? e.user.email ?? e.user.id, email: e.user.email ?? '' });
      if (e.tenant) tenantSet.add(e.tenant);
      if (e.account?.id) accountsSeen.set(e.account.id, { id: e.account.id, name: e.account.name });
    }
    // The figures above the list follow the filters chosen (the choices themselves offer everything seen).
    for (const e of seen.filter((x) => !before && matches(x))) {
      if (e.kind === 'call') {
        summary.calls++;
        summary.ms += e.ms ?? 0;
        if (e.ok === false) {
          summary.failed++;
          const x = explainCall(e);
          if (x.verdict === 'failed') summary.attention++;
          else summary.recovered++;
          const key = `${e.method} ${e.path} ${e.status}`;
          const g = groups.get(key) ?? { method: e.method, path: e.path, status: e.status, ...x, count: 0, tenants: new Set(), last: e.at, first: e.at };
          g.count++;
          if (e.tenant) g.tenants.add(e.tenant);
          if (e.at > g.last) g.last = e.at;
          if (e.at < g.first) g.first = e.at;
          groups.set(key, g);
        }
      }
      if (e.kind === 'read' && e.detail?.startsWith('finished')) summary.reads++;
      if (e.kind === 'report') summary.reports++;
      if (e.kind === 'connect' && e.ok) summary.connects++;
    }
    summary.tenants = new Set(seen.filter((x) => !before && matches(x)).map((x) => x.tenant).filter(Boolean)).size;
    summary.avgMs = summary.calls ? Math.round(summary.ms / summary.calls) : 0;
    const learned = calc.memory.summary(tenantSet);
    summary.avoided = learned.reduce((n, t) => n + t.avoided, 0);
    // Those that need someone first, then the most frequent.
    const analysis = [...groups.values()].map((g) => ({ ...g, tenants: [...g.tenants] })).sort((a, b) => (b.verdict === 'failed') - (a.verdict === 'failed') || b.count - a.count);
    const explained = events.slice(0, limit).map((e) => (e.kind === 'call' && e.ok === false ? { ...e, explain: explainCall(e) } : e));
    return { events: explained, analysis, learned, more: events.length > limit, me: ctx.user.id, people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), tenants: [...tenantSet].sort(), accounts: [...accountsSeen.values()].sort((a, b) => a.name.localeCompare(b.name)), summary };
  });
  /** The calculator page's settings for this person (the page itself is the same for everyone). */
  r('GET', '/api/cc/calc-config', perm('calculator.use'), (req, ctx) => ({
    csrf: ctx.session.csrf,
    user: { id: ctx.user.id, name: ctx.user.name },
    impersonating: ctx.impersonator ? { by: { name: ctx.impersonator.name, email: ctx.impersonator.email } } : null,
    roleName: iam.roles()[ctx.user.role]?.name ?? '',
    role: ctx.user.role,
    permissions: [...ctx.permissions],
    teams: ctx.teams.filter((t) => ctx.scope.has(t.id)).map((t) => ({ id: t.id, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › ') })).sort((a, b) => a.path.localeCompare(b.path)),
    ownTeamId: ctx.user.teamId,
    organisationName: settings.value.organisationName,
    exportsEnabled: settings.value.features?.exports === true,
    // The indicative triage & remediation estimate for code only counted (beta, turned on by an Admin).
    estimate: { ...d.estimateBeta(), industries: INDUSTRIES },
    // The menu and the look, as on the dashboard.
    teamName: teams.get(ctx.user.teamId)?.name ?? '',
    versionLabel: versionLabel(),
    stage: updates.stage ?? '',
    prefs: { mode: ctx.user.prefs?.mode, accent: ctx.user.prefs?.accent, ops: ctx.user.prefs?.ops },
    theme: { mode: settings.value.theme?.mode ?? 'light', accent: settings.value.theme?.accent ?? 'aurora' },
    branding: brandingView(),
  }));
  r('GET', '/api/projections/read', calcTeam, (req, ctx, body, res, url) => calc.readView(ctx.user.id, url.searchParams.get('since')));
  r('POST', '/api/projections/series', calcTeam, (req, ctx, body) => calc.series(ctx.user.id, body, String(req.headers['x-account'] ?? '') || null));
  r('GET', '/api/projections/git/connections', calcTeam, () => calc.gitConnections());
  r('POST', '/api/projections/git/organizations', calcTeam, (req, ctx, body) => calc.gitOrganizations(body));
  r('POST', '/api/projections/git/repositories', calcTeam, (req, ctx, body) => calc.gitRepositories(body));
  r('POST', '/api/projections/git/count', calcTeam, async (req, ctx, body) => {
    const job = await calc.gitCount(ctx.user.id, body);
    record(ctx, req, 'git.count', '', { repositories: job.repositories?.length ?? 0 });
    return job;
  });
  r('GET', '/api/projections/git/count', calcTeam, (req, ctx, body, res, url) => calc.gitCountView(ctx.user.id, url.searchParams.get('id'), url.searchParams.get('after')));
  r('GET', '/api/projections/git/cloc-fusion', calcTeam, () => calc.clocFusion());
  /** An account for the calculator: never with its kept Checkmarx One key, sealed or not. */
  const forBrowser = ({ cxone, estimate, ...a }) => ({ ...a, estimate: estimate && d.estimateBeta().calculator ? { ...estimate, include: estimate.include === true && d.estimateBeta().report } : null, cxone: cxone ? { tenant: cxone.tenant, savedBy: cxone.savedBy, savedAt: cxone.savedAt, lastReadAt: cxone.lastReadAt ?? null } : null });

  return { forBrowser, takenView };
}
