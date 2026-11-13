import { leverData } from '../../core/public/calculator/levers.js';
import { newProfile } from '../../core/public/calculator/profiles.js';
import { nameKey, tidyName } from '../accounts.js';
import { summary } from '../calculator.js';
import { changesOf, customerFigures, profileFromData, profileFromReport, readCustomerVersion } from '../customer-version.js';
import { engineKey, withRates } from '../fusion-rates.js';
import { isOldReport, readOldReport } from '../old-report.js';
import { need, teamPath } from '../rbac.js';
import { fail } from '../store.js';

/**
 * Fusion and triage & remediation rates, saving a projection, an account's Checkmarx One data, and the Admin's clean-up actions (reset, reload from reports, tidy names).
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerRates(d) {
  const {
    accountDetail, accounts, calc, calcTeam, everyTeam, forBrowser, fusionRates, hosts, perm, r, ratesFor,
    ready2, record, secrets, settings, SEVS, signedIn, teams, trRates, userName, withTrRates,
  } = d;
  // ---- Fusion rates: the Admin's engines and default engine, each team's own, and engines seen without a rate ----
  const ratesView = (ctx) => {
    const admin = ctx.permissions.has('settings.manage');
    return {
      admin: fusionRates.admin,
      detected: fusionRates.detected,
      canAdmin: admin,
      canTeams: false,
      teams: [],
      effective: fusionRates.effective([]),
      myTeamId: ctx.user.teamId,
      trRates: trRates(),
    };
  };
  r('GET', '/api/fusion-rates', ready2, (req, ctx) => ratesView(ctx));
  r('PUT', '/api/fusion-rates', perm('settings.manage'), (req, ctx, body) => {
    const { before, after } = fusionRates.setAdmin({ models: body?.models, defaultModel: body?.defaultModel });
    const was = new Map(before.models.map((m) => [engineKey(m.name), m.creditsPer10k]));
    const changes = after.models.filter((m) => was.get(engineKey(m.name)) !== m.creditsPer10k).map((m) => `${m.name} ${was.has(engineKey(m.name)) ? `${was.get(engineKey(m.name)) ?? '—'} → ` : 'added at '}${m.creditsPer10k ?? '—'}`);
    for (const m of before.models) if (!after.models.some((x) => engineKey(x.name) === engineKey(m.name))) changes.push(`${m.name} removed`);
    if (before.defaultModel !== after.defaultModel) changes.push(`default engine ${before.defaultModel || '—'} → ${after.defaultModel || '—'}`);
    record(ctx, req, 'fusion.rates', changes.join('; ') || 'no change', { models: after.models, defaultModel: after.defaultModel });
    return ratesView(ctx);
  });
  r('PUT', '/api/tr-rates', perm('settings.manage'), (req, ctx, body) => {
    const before = trRates();
    const next = {};
    for (const k of ['triageCost', 'remediationCost']) {
      next[k] = {};
      for (const sv of SEVS) {
        const raw = body?.[k]?.[sv] ?? before[k][sv];
        const n = Number(String(raw).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 1000) throw fail(400, `${sv}: credits are a number from 0 to 1000.`);
        next[k][sv] = Math.round(n * 1000) / 1000;
      }
    }
    settings.value.trRates = next;
    settings.save();
    const changes = [];
    for (const k of ['triageCost', 'remediationCost']) for (const sv of SEVS) if (before[k][sv] !== next[k][sv]) changes.push(`${sv} ${k === 'triageCost' ? 'triage' : 'remediation'} ${before[k][sv]} → ${next[k][sv]}`);
    record(ctx, req, 'tr.rates', changes.join('; ') || 'no change', next);
    return ratesView(ctx);
  });
  r('PUT', '/api/fusion-rates/teams/:teamId', signedIn, () => {
    throw fail(410, 'Rates are set by the Admin for everyone: a team no longer has its own.');
  });
  r('GET', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => ({ customer: forBrowser(withTrRates(withRates(accounts.get(params.id, ctx.teamSet), ratesFor(ctx.user.id)))) }));
  r('PUT', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => {
    // A Checkmarx One read goes into the account it was made for, and no other: refused here whatever the page sends.
    for (const at of [body?.tr?.totals?.meta?.source === 'cxone' ? body.tr.totals.meta.readAt : null, body?.fusion?.readAt]) {
      const owner = calc.readOwner(at);
      if (owner && owner.id !== params.id) {
        const target = accounts.accounts.meta(params.id);
        record(ctx, req, 'cxone.read.misplaced', target?.name ?? params.id, { readFor: owner.name, readAt: at });
        throw fail(409, `That Checkmarx One read was made for ${owner.name}, not for ${target?.name ?? 'this account'}: it is not saved here. Open ${owner.name} to see it, or read this account with its own key.`);
      }
    }
    const patch = {};
    for (const key of ['name', 'tr', 'fusion', 'fusionNew', 'totals', 'scope', 'impact']) if (body?.[key] !== undefined) patch[key] = body[key];
    // The triage and remediation credits are the Admin's, whatever the page sent.
    if (patch.tr && typeof patch.tr === 'object') patch.tr = { ...patch.tr, ...trRates() };
    const saved = summary(accounts.update(params.id, ctx.teamSet, patch, ctx.user));
    if ((patch.tr !== undefined || patch.fusion !== undefined) && calc.markApplied(ctx.user.id, params.id)) {
      accounts.markRead(params.id);
      d.forgetPending(ctx.user.id);
    }
    return { customer: saved };
  });
  r('DELETE', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => {
    need(ctx.permissions, 'accounts.delete');
    const a = accounts.get(params.id, ctx.teamSet);
    accounts.remove(params.id, ctx.teamSet);
    record(ctx, req, 'account.delete', a.name, { id: a.id });
    return { ok: true };
  });

  r('POST', '/api/cc/cxone/connect', perm('calculator.use'), async (req, ctx, body) => {
    const forAccount = body?.accountId ? accounts.accounts.meta(String(body.accountId)) : null;
    // Nothing is read for an account until it is tied to Salesforce.
    if (!forAccount || !ctx.scope.has(forAccount.teamId)) throw fail(409, 'Open the account first: Checkmarx One is read for an account.');
    if (!forAccount.salesforceUrl) throw fail(409, 'Save the account\u2019s Salesforce opportunity or account link first: nothing is read or generated without it.');
    calc.workingOn(ctx.user.id, { id: forAccount.id, name: forAccount.name, teamId: forAccount.teamId });
    const connectedState = await calc.connectKey(ctx.user.id, body);
    calc.boundTo(ctx.user.id, { id: forAccount.id, name: forAccount.name, teamId: forAccount.teamId });
    const state = { ...connectedState, account: calc.status(ctx.user.id).account };
    record(ctx, req, 'cxone.connect', state.tenant, { baseUrl: state.baseUrl, account: forAccount.name });
    // "Remember this key for the account": sealed on this server, used again by the team for one-click refreshes.
    if (body?.remember === true && body?.accountId) {
      const a = accounts.saveCxone(String(body.accountId), ctx.scope, { sealedKey: secrets.seal(JSON.stringify({ apiKey: String(body.apiKey ?? ''), baseUrl: String(body.baseUrl ?? ''), iamUrl: String(body.iamUrl ?? ''), tenant: String(body.tenant ?? '') })), connection: { tenant: state.tenant, baseUrl: state.baseUrl, iamUrl: '' }, user: ctx.user });
      record(ctx, req, 'cxone.key.saved', a.name, { tenant: state.tenant });
      return { ...state, saved: true };
    }
    return state;
  });
  /** Connect with the key kept for the account: the browser never sees it. */
  r('POST', '/api/cc/accounts/:id/cxone/connect', perm('calculator.use'), async (req, ctx, body, res, url, params) => {
    const kept = accounts.cxoneOf(params.id, ctx.scope);
    if (!kept?.sealedKey) throw fail(404, 'No Checkmarx One key is kept for this account.');
    const key = JSON.parse(secrets.open(kept.sealedKey) || 'null');
    if (!key?.apiKey) throw fail(409, 'The key kept for this account could not be opened (was the data folder moved without secret.key?). Paste it again.');
    let state;
    const meta = accounts.accounts.meta(params.id);
    if (meta) calc.workingOn(ctx.user.id, { id: meta.id, name: meta.name, teamId: meta.teamId });
    try {
      state = await calc.connectKey(ctx.user.id, { ...key, kept: true });
    } catch (error) {
      record(ctx, req, 'cxone.key.failed', accounts.accounts.meta(params.id)?.name ?? '', { error: error.message });
      throw fail(error.status ?? 400, `${error.message} The kept key may have expired: paste a new one and tick "Remember".`);
    }
    if (meta) calc.boundTo(ctx.user.id, { id: meta.id, name: meta.name, teamId: meta.teamId });
    record(ctx, req, 'cxone.key.used', accounts.accounts.meta(params.id)?.name ?? '', { tenant: state.tenant });
    return { ...state, account: calc.status(ctx.user.id).account };
  });
  /**
   * Take what was read from Checkmarx One out of an account: the backlog and its trend, and the projects read (those
   * typed by hand stay, with the plan's settings, the code counted from git or cloc-fusion, and every report made).
   * For an account that holds a read that was never its own.
   */
  r('POST', '/api/cc/accounts/:id/cxone/clear', perm('calculator.use'), (req, ctx, body, res, url, params) => {
    const a = accounts.get(params.id, ctx.scope);
    const projects = a.fusion?.projects ?? [];
    const kept = projects.filter((p) => p.source === 'manual');
    const { totals, fixed, activeCount, activeOf, excluded, selected, ...plan } = a.tr ?? {};
    void activeCount, activeOf, excluded, selected;
    const hadBacklog = Boolean(totals || fixed);
    if (!hadBacklog && kept.length === projects.length) throw fail(409, 'Nothing read from Checkmarx One is kept in this account.');
    accounts.update(a.id, ctx.scope, { tr: a.tr ? plan : null, ...(a.fusion ? { fusion: { ...a.fusion, projects: kept, readAt: null } } : {}), scope: {} }, ctx.user);
    record(ctx, req, 'account.cxone.cleared', a.name, { id: a.id, projects: projects.length - kept.length, backlog: hadBacklog });
    return { ok: true, projects: projects.length - kept.length, backlog: hadBacklog };
  });
  /**
   * The Admin cleanses an account: every calculation goes (the backlog read or uploaded, Fusion's projects, the code
   * counted, the scope, the totals), and its reports too when asked. The account, its Salesforce link, SE, team,
   * contacts and sales stay. Admin only.
   */
  r('POST', '/api/cc/accounts/:id/reset', ready2, (req, ctx, body, res, url, params) => {
    if (ctx.user.role !== 'admin') throw fail(403, 'Only an Admin can remove every calculation from an account.');
    const a = accounts.get(params.id, ctx.scope);
    const fresh = newProfile({ name: a.name, by: ctx.user.name });
    accounts.update(a.id, ctx.scope, { tr: fresh.tr, fusion: fresh.fusion, fusionNew: fresh.fusionNew, totals: fresh.totals, scope: fresh.scope }, ctx.user);
    let removed = 0;
    if (body?.reports === true) {
      for (const rep of accounts.reportsOf(ctx.scope, a.id)) {
        accounts.removeReport(rep.id, ctx.scope);
        removed += 1;
      }
      // Nothing of it left: a draft again, its SE's and the Admins' until a new report.
      accounts.unpublish(a.id);
    }
    record(ctx, req, 'account.reset', a.name, { id: a.id, reportsRemoved: removed });
    return { ok: true, reportsRemoved: removed };
  });
  /**
   * The Admin reloads accounts from the reports brought into them (a previous quote, or a customer's version): each
   * account's calculator rebuilt from that report's own figures, as an upload does (CC-01.81.00). For accounts whose
   * live figures cannot be trusted. Listed first (GET), then reloaded for the ones ticked (POST).
   */
  /**
   * A report file brought in: its "Try other numbers" figures, else (an earlier version, or a copy whose figures are
   * empty) what its page shows. `loadable`: whether anything in it can fill the calculator.
   */
  const readReportFile = (html) => {
    const text = String(html ?? '');
    const hasFigures = (l) => Boolean(l?.inputs?.tr || l?.inputs?.fusion || l?.sentInputs?.tr || l?.sentInputs?.fusion);
    if (isOldReport(text)) return { live: readOldReport(text), old: true, loadable: true };
    const live = readCustomerVersion(text);
    if (hasFigures(live)) return { live, old: false, loadable: true };
    try {
      const fromPage = readOldReport(text, { force: true });
      if (hasFigures(fromPage)) return { live: { ...fromPage, base: { ...fromPage.base, generatedAt: live.base?.generatedAt ?? fromPage.base.generatedAt } }, old: true, loadable: true };
    } catch {}
    return { live, old: false, loadable: false };
  };
  const uploadedReportOf = (a) => {
    const own = accounts.reports.list().filter((x) => x.customerId === a.id && (x.source === 'previous' || x.source === 'customer'));
    if (!own.length) return null;
    return own.find((x) => x.id === a.primaryReportId) ?? own.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
  };
  r('GET', '/api/cc/reload-candidates', ready2, (req, ctx) => {
    if (ctx.user.role !== 'admin') throw fail(403, 'Only an Admin reloads accounts from their reports.');
    const out = [];
    for (const meta of accounts.accounts.list()) {
      const rep = uploadedReportOf(meta);
      if (!rep) continue;
      const a = accounts.accounts.get(meta.id);
      const full = accounts.reports.get(rep.id);
      const loadable = Boolean(full?.data?.levers?.tr || full?.data?.levers?.fusion || profileFromData(full?.data));
      // Reloaded from this report already, and nothing changed in the calculator since: nothing to do.
      const upToDate = Boolean(a?.loadedFrom && a.loadedFrom.reportId === rep.id && a.loadedFrom.at === a.updatedAt);
      out.push({
        upToDate,
        id: meta.id,
        name: meta.name,
        team: teamPath(ctx.teams, meta.teamId).map((x) => x.name).join(' › '),
        owner: userName(meta.ownerId),
        report: { id: rep.id, source: rep.source, createdAt: rep.createdAt, total: rep.totalCredits, projects: full?.data?.fusion?.totals?.projects ?? null, loadable },
        now: { projects: a?.fusion?.projects?.filter((p) => p.source !== 'manual').length ?? 0, backlog: Boolean(a?.tr?.totals), from: a?.tr?.totals?.meta?.layout === 'report' ? 'report' : a?.tr?.totals?.meta?.source ?? null, readAt: a?.tr?.totals?.meta?.readAt ?? a?.fusion?.readAt ?? null },
      });
    }
    return { accounts: out.sort((x, y) => x.name.localeCompare(y.name)) };
  });
  /** Accounts of the same name, however it is typed (in any team): said before another is made. */
  r('GET', '/api/cc/accounts-similar', perm('calculator.use'), (req, ctx, body, res, url) => {
    const key = nameKey(url.searchParams.get('name'));
    if (!key) return { similar: [] };
    const similar = accounts.accounts.list().filter((m) => !m.pendingSince && nameKey(m.name) === key).map((m) => ({ name: m.name, team: teamPath(ctx.teams, m.teamId).map((x) => x.name).join(' › ') || teams.get(m.teamId)?.name || '', owner: userName(m.ownerId), salesforceId: ctx.scope.has(m.teamId) ? m.salesforceId : '' }));
    return { similar };
  });
  /** The Admin's look at every account's name: those that would read better tidied, and those that look like one account twice. */
  r('GET', '/api/cc/name-tidy', ready2, (req, ctx) => {
    if (ctx.user.role !== 'admin') throw fail(403, 'Only an Admin tidies account names.');
    const all = accounts.accounts.list().filter((m) => !m.pendingSince);
    const where = (m) => ({ id: m.id, name: m.name, team: teamPath(ctx.teams, m.teamId).map((x) => x.name).join(' › '), owner: userName(m.ownerId), salesforceId: m.salesforceId });
    const renames = all.filter((m) => tidyName(m.name) && tidyName(m.name) !== m.name).map((m) => ({ ...where(m), tidy: tidyName(m.name) }));
    const groups = new Map();
    for (const m of all) groups.set(nameKey(m.name), [...(groups.get(nameKey(m.name)) ?? []), where(m)]);
    return { renames, duplicates: [...groups.values()].filter((g) => g.length > 1) };
  });
  r('POST', '/api/cc/name-tidy', ready2, (req, ctx, body) => {
    if (ctx.user.role !== 'admin') throw fail(403, 'Only an Admin tidies account names.');
    const ids = new Set(Array.isArray(body?.ids) ? body.ids.map(String) : []);
    const done = [];
    for (const m of accounts.accounts.list().filter((x) => ids.has(x.id))) {
      const tidy = tidyName(m.name);
      if (!tidy || tidy === m.name) continue;
      accounts.setDetails(m.id, everyTeam(), { name: tidy }, hosts().salesforce);
      record(ctx, req, 'account.renamed', tidy, { id: m.id, from: m.name, why: 'names tidied by the Admin' });
      done.push({ from: m.name, to: tidy });
    }
    return { renamed: done };
  });
  r('POST', '/api/cc/reload-from-reports', ready2, (req, ctx, body) => {
    if (ctx.user.role !== 'admin') throw fail(403, 'Only an Admin reloads accounts from their reports.');
    const ids = new Set(Array.isArray(body?.ids) ? body.ids.map(String) : []);
    const done = [];
    const skipped = [];
    for (const meta of accounts.accounts.list().filter((m) => ids.has(m.id))) {
      const rep = uploadedReportOf(meta);
      const data = rep ? accounts.reports.get(rep.id)?.data : null;
      const patch = data?.levers?.tr || data?.levers?.fusion ? profileFromReport({ inputs: data.levers, base: { ...data, generatedAt: rep.createdAt } }) : profileFromData(data);
      if (!patch) {
        skipped.push({ name: meta.name, why: 'its report keeps only its totals: upload the original report file again under A previous report' });
        continue;
      }
      try {
        const after = accounts.update(meta.id, ctx.scope, { ...patch, scope: {} }, ctx.user);
        accounts.markLoaded(meta.id, rep.id, after.updatedAt);
        record(ctx, req, 'account.reloaded', meta.name, { id: meta.id, report: rep.id, source: rep.source, reportMadeAt: rep.createdAt, total: rep.totalCredits });
        done.push(meta.name);
      } catch (error) {
        skipped.push({ name: meta.name, why: error.message });
      }
    }
    return { reloaded: done, skipped };
  });
  r('DELETE', '/api/cc/accounts/:id/cxone', perm('calculator.use'), (req, ctx, body, res, url, params) => {
    const a = accounts.forgetCxone(params.id, ctx.scope);
    record(ctx, req, 'cxone.key.forgotten', a.name);
    return { ok: true };
  });

  /**
   * The customer's own version of a report ("Download my version"): only its figures are read, worked out again here,
   * and recorded as a report of theirs; their choices can become the account's settings and the report its primary.
   */
  r('POST', '/api/cc/accounts/:id/customer-version', perm('calculator.use'), (req, ctx, body, res, url, params) => {
    const account = accounts.get(params.id, ctx.scope);
    // A customer's version made from an earlier report (figures on its page only): read from its page, in full.
    const { live, loadable: cvLoadable } = readReportFile(body?.html);
    const figures = customerFigures(live);
    const changes = changesOf(live.sentInputs ?? {}, live.inputs);
    const sameName = figures.customer.trim().toLowerCase() === account.name.trim().toLowerCase();
    const preview = { customer: figures.customer, sameName, sentTotal: figures.sentTotal, total: figures.total, changes, loadable: cvLoadable };
    if (body?.dryRun !== false) return { dryRun: true, ...preview };
    if (!sameName && body?.confirm !== true) throw fail(409, `This report was made for "${figures.customer}", not ${account.name}. Confirm to record it here anyway.`);
    const rep = accounts.addCustomerReport({ customerId: account.id, data: figures.data, user: ctx.user, note: body?.note, sentTotal: figures.sentTotal, changes }, ctx.scope);
    // The customer's own version came from them: shared by nature, and so was the report they had been sent.
    accounts.markShared(rep.id, ctx.scope, { shared: true, fromCustomer: true, note: 'The customer’s own version, sent back by them' }, ctx.user);
    const sent = accounts.reportsOf(ctx.scope, account.id).find((r) => r.source !== 'customer' && r.id !== rep.id && Number.isFinite(figures.sentTotal) && Math.round(r.totalCredits) === Math.round(figures.sentTotal));
    if (sent && !sent.sharedAt) accounts.markShared(sent.id, ctx.scope, { shared: true, fromCustomer: true, note: 'The customer sent back their version of it' }, ctx.user);
    if (body?.makePrimary !== false) accounts.setPrimary(account.id, rep.id, ctx.scope);
    // Their numbers in the calculator from now on: its backlog, plan, Fusion projects and counted code, as their report has them.
    if (body?.applyPreferences !== false && cvLoadable) {
      const after = accounts.update(account.id, ctx.scope, { ...profileFromReport(live), scope: {} }, ctx.user);
      accounts.markLoaded(account.id, rep.id, after.updatedAt);
    }
    record(ctx, req, 'report.customerVersion', account.name, { id: rep.id, total: rep.totalCredits, sentTotal: figures.sentTotal, changes: changes.length, primary: body?.makePrimary !== false, preferences: body?.applyPreferences !== false });
    return { ...preview, report: { id: rep.id, totalCredits: rep.totalCredits }, ...accountDetail(ctx, account.id) };
  });
  /**
   * A report generated earlier for this account (a quote already given): read from its file, kept as it was, with its
   * own date; optionally marked shared with whom it was given to. The account's settings are not changed.
   */
  r('POST', '/api/cc/accounts/:id/previous-report', perm('calculator.use'), (req, ctx, body, res, url, params) => {
    const account = accounts.get(params.id, ctx.scope);
    if (!account.salesforceUrl) throw fail(409, 'Save the account\u2019s Salesforce opportunity or account link first.');
    // A report from an earlier version (figures on the page only): read from its page and made again with today's model.
    const { live, old, loadable } = readReportFile(body?.html);
    const figures = customerFigures(live);
    const madeAt = live.base?.generatedAt ?? null;
    const sameName = figures.customer.trim().toLowerCase() === account.name.trim().toLowerCase();
    const preview = { customer: figures.customer, sameName, total: figures.sentTotal ?? figures.total, madeAt, old, loadable, worked: Math.round(figures.total) };
    if (body?.dryRun !== false) return { dryRun: true, ...preview };
    if (!sameName && body?.confirm !== true) throw fail(409, `This report was made for "${figures.customer}", not ${account.name}. Confirm to keep it here anyway.`);
    // The quote as it was given: the report's own figures, before anyone moved a lever.
    const data = live.sentInputs ? { ...leverData(live.base, live.sentInputs), levers: live.sentInputs } : figures.data;
    let rep = accounts.addPreviousReport({ customerId: account.id, data, user: ctx.user, madeAt, note: body?.note }, ctx.scope);
    // Loaded into the calculator (unless asked not to): its backlog, plan, Fusion projects and counted code, as the quote had them.
    const loaded = body?.load !== false && loadable;
    if (loaded) {
      const after = accounts.update(account.id, ctx.scope, { ...profileFromReport(live, { useSent: true }), scope: {} }, ctx.user);
      accounts.markLoaded(account.id, rep.id, after.updatedAt);
    }
    if (String(body?.sharedWith ?? '').trim()) rep = accounts.markShared(rep.id, ctx.scope, { shared: true, sharedWith: body.sharedWith, note: 'A quote given before, brought in' }, ctx.user);
    record(ctx, req, 'report.previous', account.name, { id: rep.id, total: rep.totalCredits, madeAt, sharedWith: rep.sharedWith ?? [], loaded });
    return { ...preview, report: { id: rep.id, totalCredits: rep.totalCredits }, ...accountDetail(ctx, account.id) };
  });
  r('POST', '/api/cc/cxone/disconnect', perm('calculator.use'), (req, ctx) => calc.disconnect(ctx.user.id));
  r('GET', '/api/cc/cxone/status', perm('calculator.use'), (req, ctx) => calc.status(ctx.user.id));
}
