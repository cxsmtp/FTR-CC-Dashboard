import { summary } from '../calculator.js';
import { suggestCurrency } from '../currency.js';
import { needTeam, teamPath } from '../rbac.js';
import { fail } from '../store.js';
import { cleanIndustry } from '../estimate.js';

/**
 * Accounts: their details, accountable SE and team, contacts, reports, sales and sharing.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerAccounts(d) {
  const {
    accounts, hosts, iam, perm, r, ready2, record, rows, teams, userName,
  } = d;
  // ---- Accounts follow their accountable SE: an account is in the team its SE is in ---------------------------------
  const everyTeam = () => new Set(teams.list().map((t) => t.id));
  const teamName = (id) => teams.get(id)?.name ?? id;
  /** The accounts whose accountable SE is in another team than the account (the SE still has access). */
  const outOfStep = () => accounts.accounts.list().map((a) => ({ a, owner: iam.byId(a.ownerId) })).filter(({ a, owner }) => owner && owner.active !== false && teams.get(owner.teamId) && owner.teamId !== a.teamId);
  /** Move these accounts (and their reports) to their SE's team; recorded one by one. */
  const followOwner = (ctx, req, list, why) => {
    const all = everyTeam();
    const moved = [];
    for (const { a, owner } of list) {
      accounts.setDetails(a.id, all, { teamId: owner.teamId }, hosts().salesforce);
      record(ctx, req, 'account.follow', a.name, { id: a.id, owner: owner.email, fromTeam: teamName(a.teamId), toTeam: teamName(owner.teamId), why });
      moved.push({ id: a.id, name: a.name, from: teamName(a.teamId), to: teamName(owner.teamId) });
    }
    return moved;
  };
  /** Accounts in the teams this person works in that are not in their SE's team: to look at, and to move. */
  const outOfStepFor = (ctx) => outOfStep().filter(({ a, owner }) => !a.pendingSince && ctx.scope.has(a.teamId) && (ctx.permissions.has('scope.all') || ctx.scope.has(owner.teamId)));
  r('GET', '/api/cc/accounts-out-of-step', perm('users.manage'), (req, ctx) => ({ accounts: outOfStepFor(ctx).map(({ a, owner }) => ({ id: a.id, name: a.name, owner: owner.name, from: teamName(a.teamId), to: teamName(owner.teamId) })) }));
  r('POST', '/api/cc/accounts-follow', perm('users.manage'), (req, ctx, body) => {
    const wanted = Array.isArray(body?.ids) ? new Set(body.ids.map(String)) : null;
    const moved = followOwner(ctx, req, outOfStepFor(ctx).filter(({ a }) => !wanted || wanted.has(a.id)), 'moved to the SE’s team from the Accounts page');
    return { moved };
  });

  r('GET', '/api/accounts', perm('dashboard.view'), (req, ctx, body, res, url) => {
    const focus = url.searchParams.get('team') || '';
    if (focus) needTeam(ctx.scope, focus);
    return { accounts: rows(ctx, focus).accounts };
  });

  const mayContacts = (ctx, a) => ctx.permissions.has('calculator.use') || ctx.permissions.has('users.manage') || ctx.permissions.has('reports.share') || a.ownerId === ctx.user.id;
  const accountDetail = (ctx, id) => {
    const a = accounts.get(id, ctx.scope);
    const meta = accounts.accounts.meta(id);
    const reps = accounts.reportsOf(ctx.scope, id).map((x) => ({ ...x, createdByName: userName(x.createdById), sharedByName: x.sharedById ? userName(x.sharedById) : '' }));
    const { report: p, how } = accounts.primaryOf(meta);
    // Who can be accountable: the team's people who work out projections themselves (Customer Success never is).
    const members = iam.users().filter((u) => u.active !== false && u.teamId === a.teamId && u.role !== 'cs').map((u) => ({ id: u.id, name: u.name, role: u.role }));
    if (a.ownerId && !members.some((m) => m.id === a.ownerId) && iam.byId(a.ownerId)?.role !== 'cs') members.push({ id: a.ownerId, name: userName(a.ownerId) });
    return {
      account: { ...summary(a), teamId: a.teamId, team: teams.get(a.teamId)?.name ?? '', teamPath: teamPath(ctx.teams, a.teamId).map((x) => x.name).join(' › '), ownerId: a.ownerId, owner: userName(a.ownerId), createdById: a.createdById, salesforceUrl: a.salesforceUrl, salesforceKind: a.salesforceKind, salesforceId: a.salesforceId, primaryReportId: a.primaryReportId, cxone: a.cxone ? { tenant: a.cxone.tenant, savedBy: a.cxone.savedBy, savedAt: a.cxone.savedAt, lastReadAt: a.cxone.lastReadAt ?? null } : null, sold: (a.sales ?? []).reduce((n, x) => n + x.credits, 0), remaining: p ? Math.max(0, Math.round(p.totalCredits - (a.sales ?? []).reduce((n, x) => n + x.credits, 0))) : null, impactEnabled: Boolean(a.impactEnabled), impactCurrencyConfirmed: Boolean(a.impactCurrencyConfirmed), impactCurrency: a.impact?.currency ?? 'USD', reportCount: reps.length, sharedCount: reps.filter((x) => x.sharedAt).length, primary: p ? { ...p, how } : null },
      reports: reps,
      // The account's team and contacts as kept, and the addresses its reports were shared with (read from the reports).
      contacts: a.contacts ?? [],
      draft: accounts.isDraft(a.id),
      pending: Boolean(accounts.accounts.meta(a.id)?.pendingSince),
      usedEmails: [...reps.reduce((m, x) => {
        for (const e of x.sharedWith ?? []) if (!m.has(e) || String(x.sharedAt) > m.get(e)) m.set(e, x.sharedAt ?? '');
        return m;
      }, new Map())].map(([email, at]) => ({ email, at })),
      sales: [...(a.sales ?? [])].sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.at).localeCompare(String(x.at))),
      members,
      can: { deleteReports: ctx.permissions.has('reports.delete'), me: ctx.user.id, contacts: mayContacts(ctx, a), edit: ctx.permissions.has('calculator.use'), assign: ctx.permissions.has('calculator.use') || ctx.permissions.has('users.manage'), share: ctx.permissions.has('reports.share') || a.ownerId === ctx.user.id, deleteAccount: ctx.permissions.has('accounts.delete'), sell: ctx.permissions.has('sales.record'), removeAnySale: ctx.permissions.has('reports.delete'), me: ctx.user.id },
    };
  };
  r('GET', '/api/cc/accounts/:id', ready2, (req, ctx, body, res, url, params) => accountDetail(ctx, params.id));
  /** A currency to suggest for the account's impact, for the SE to confirm. */
  r('GET', '/api/cc/accounts/:id/currency', perm('calculator.use'), (req, ctx, body, res, url, params) => {
    const a = accounts.get(params.id, ctx.scope);
    return suggestCurrency({ accountName: a.name, teamNames: teamPath(ctx.teams, a.teamId).reverse().flatMap((t) => [t.name, t.region].filter(Boolean)), timeZone: String(url.searchParams.get('tz') ?? '').slice(0, 64) });
  });
  r('PUT', '/api/cc/accounts/:id', ready2, (req, ctx, body, res, url, params) => {
    const before = accounts.get(params.id, ctx.scope);
    // The calculator's people change an account; leaders and above may change its accountable SE, whoever made it.
    const onlyOwner = body && Object.keys(body).every((k) => k === 'ownerId');
    // The account's team and contacts: also its accountable SE, and those who share reports or manage people.
    const onlyContacts = body && Object.keys(body).every((k) => k === 'contacts');
    if (!ctx.permissions.has('calculator.use') && !(onlyOwner && ctx.permissions.has('users.manage')) && !(onlyContacts && mayContacts(ctx, before))) throw fail(403, 'You may not change this account.');
    const patch = {};
    if (body?.salesforceUrl !== undefined) patch.salesforceUrl = body.salesforceUrl;
    if (body?.name !== undefined) patch.name = body.name;
    if (body?.ownerId !== undefined) {
      const owner = iam.byId(String(body.ownerId));
      if (!owner || owner.active === false || !ctx.scope.has(owner.teamId)) throw fail(400, 'Choose someone in a team you work in.');
      patch.ownerId = owner.id;
      // The account follows its accountable SE: it goes to their team.
      if (body?.teamId === undefined && owner.teamId !== before.teamId && teams.get(owner.teamId)) patch.teamId = owner.teamId;
    }
    if (body?.teamId !== undefined) {
      needTeam(ctx.scope, String(body.teamId));
      patch.teamId = String(body.teamId);
    }
    if (body?.impactCurrency !== undefined) patch.impactCurrency = body.impactCurrency;
    if (body?.impactEnabled !== undefined) patch.impactEnabled = body.impactEnabled === true;
    if (body?.contacts !== undefined) patch.contacts = body.contacts;
    // Its industry (for the estimate): one of the list, or none.
    if (body?.industry !== undefined) patch.industry = cleanIndustry(body.industry);
    const had = new Set((before.contacts ?? []).map((c) => c.email));
    const after = accounts.setDetails(params.id, ctx.scope, patch, hosts().salesforce, { impactBase: ctx.user.prefs?.impact ?? null });
    // Moved with its SE to a team this person does not work in: said, as the account is no longer theirs to see.
    if (!ctx.scope.has(after.teamId)) {
      record(ctx, req, 'account.update', after.name, { id: after.id, changed: Object.keys(patch), fromTeam: before.teamId, toTeam: after.teamId });
      return { moved: true, account: { id: after.id, name: after.name }, team: teamName(after.teamId) };
    }
    const now = new Set((after.contacts ?? []).map((c) => c.email));
    const contactsChanged = patch.contacts !== undefined ? { contactsAdded: [...now].filter((e) => !had.has(e)), contactsRemoved: [...had].filter((e) => !now.has(e)), contacts: now.size } : {};
    record(ctx, req, 'account.update', after.name, { id: after.id, changed: Object.keys(patch), ...contactsChanged, ...(patch.teamId && patch.teamId !== before.teamId ? { fromTeam: before.teamId, toTeam: patch.teamId } : {}) });
    return accountDetail(ctx, params.id);
  });
  r('DELETE', '/api/cc/accounts/:id', perm('accounts.delete'), (req, ctx, body, res, url, params) => {
    const a = accounts.get(params.id, ctx.scope);
    accounts.remove(params.id, ctx.scope);
    record(ctx, req, 'account.delete', a.name, { id: a.id });
    return { ok: true };
  });
  r('POST', '/api/cc/accounts/:id/sales', perm('sales.record'), (req, ctx, body, res, url, params) => {
    const sale = accounts.addSale(params.id, ctx.scope, { credits: body?.credits, date: body?.date, reference: body?.reference, note: body?.note, reportId: body?.reportId, opportunityUrl: body?.opportunityUrl }, ctx.user, hosts().salesforce);
    const a = accounts.accounts.meta(params.id);
    record(ctx, req, 'sale.record', a.name, { id: sale.id, credits: sale.credits, date: sale.date, opportunity: sale.opportunityId, reference: sale.reference, reportId: sale.reportId });
    return accountDetail(ctx, params.id);
  });
  r('DELETE', '/api/cc/accounts/:id/sales/:sale', perm('sales.record'), (req, ctx, body, res, url, params) => {
    const sale = accounts.removeSale(params.id, ctx.scope, params.sale, { user: ctx.user, any: ctx.permissions.has('reports.delete') });
    record(ctx, req, 'sale.remove', accounts.accounts.meta(params.id)?.name ?? '', { id: sale.id, credits: sale.credits, date: sale.date });
    return accountDetail(ctx, params.id);
  });
  r('POST', '/api/cc/accounts/:id/mute', perm('forecast.mute'), (req, ctx, body, res, url, params) => {
    const a = accounts.setMuted(params.id, ctx.scope, body?.muted !== false, ctx.user);
    record(ctx, req, a.muted ? 'account.mute' : 'account.unmute', a.name, { id: a.id });
    return { ok: true, muted: Boolean(a.muted) };
  });
  r('POST', '/api/cc/reports/:id/primary', perm('reports.share'), (req, ctx, body, res, url, params) => {
    const rep = accounts.report(params.id, ctx.scope);
    accounts.setPrimary(rep.customerId, body?.primary === false ? null : rep.id, ctx.scope);
    record(ctx, req, body?.primary === false ? 'report.unprimary' : 'report.primary', rep.customer, { id: rep.id, totalCredits: rep.totalCredits });
    return accountDetail(ctx, rep.customerId);
  });
  r('POST', '/api/cc/reports/:id/shared', ready2, (req, ctx, body, res, url, params) => {
    {
      const r0 = accounts.report(params.id, ctx.scope);
      const owner = accounts.accounts.meta(r0.customerId)?.ownerId;
      if (!ctx.permissions.has('reports.share') && owner !== ctx.user.id) throw fail(403, 'Only the accountable SE, or someone who may share reports, records what was shared.');
    }
    const rep = accounts.markShared(params.id, ctx.scope, { shared: body?.shared !== false, note: body?.note, sharedWith: body?.sharedWith }, ctx.user);
    record(ctx, req, rep.sharedAt ? 'report.shared' : 'report.unshared', rep.customer, { id: rep.id, sharedWith: rep.sharedWith, note: rep.sharedNote });
    return accountDetail(ctx, rep.customerId);
  });
  const deleteReport = (req, ctx, id, teamIds) => {
    const rep = accounts.report(id, teamIds);
    const own = rep.createdById === ctx.user.id && !rep.sharedAt;
    if (!ctx.permissions.has('reports.delete') && !own) throw fail(403, 'You can delete only your own reports not yet shared with the customer.');
    accounts.removeReport(id, teamIds);
    record(ctx, req, 'report.delete', rep.customer, { id: rep.id, totalCredits: rep.totalCredits });
    return rep;
  };
  // The report's file, as the calculator downloads it, for the account's page.
  r('GET', '/api/cc/reports/:id/file', ready2, async (req, ctx, body, res, url, params) => {
    const rep = accounts.report(params.id, ctx.scope);
    if (!rep?.data) throw fail(409, 'This report has no saved figures to make a file from.');
    const { reportFile } = await import('./report-file.js');
    const file = await reportFile(rep, { accent: url.searchParams.get('accent') === 'command' ? 'command' : 'aurora', theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light', ops: String(url.searchParams.get('ops') ?? 'green').replace(/[^a-z]/g, '').slice(0, 12) || 'green' });
    record(ctx, req, 'report.download', rep.customer, { id: rep.id, totalCredits: rep.totalCredits });
    return file;
  });
  r('DELETE', '/api/cc/reports/:id', ready2, (req, ctx, body, res, url, params) => {
    const rep = deleteReport(req, ctx, params.id, ctx.scope);
    return accountDetail(ctx, rep.customerId);
  });

  return { accountDetail, deleteReport, everyTeam, followOwner, outOfStep };
}
