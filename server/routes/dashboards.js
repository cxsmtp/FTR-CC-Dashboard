import { needTeam, peopleInScope, subtree, teamPath } from '../rbac.js';

/**
 * The Overview and the Accounts list: what each person may see, rolled up by team.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerDashboards(d) {
  const {
    accounts, iam, perm, r, teams,
  } = d;
  // ---- Dashboards ---------------------------------------------------------------------------------------
  const userName = (id) => iam.byId(id)?.name ?? 'Former member';

  /** Every account in scope with its primary report, owner, team and counts: the rows every dashboard is built from. */
  function rows(ctx, focusTeam = '') {
    const teamIds = focusTeam ? new Set([...subtree(ctx.teams, focusTeam)].filter((id) => ctx.scope.has(id))) : ctx.scope;
    const reports = accounts.reportsOf(teamIds);
    const byAccount = new Map();
    for (const rep of reports) {
      if (!byAccount.has(rep.customerId)) byAccount.set(rep.customerId, []);
      byAccount.get(rep.customerId).push(rep);
    }
    const out = accounts.list(teamIds).map((a) => {
      const own = byAccount.get(a.id) ?? [];
      // Its reports are newest first already: the one marked primary, else the latest.
      const marked = a.primaryReportId ? own.find((r) => r.id === a.primaryReportId) : null;
      const p = marked ?? own[0] ?? null;
      const how = marked ? 'marked' : p ? 'latest' : 'none';
      return {
        id: a.id,
        name: a.name,
        teamId: a.teamId,
        team: teams.get(a.teamId)?.name ?? '',
        teamPath: teamPath(ctx.teams, a.teamId).map((x) => x.name).join(' › '),
        ownerId: a.ownerId,
        owner: userName(a.ownerId),
        salesforceUrl: a.salesforceUrl,
        industry: a.industry ?? '',
        salesforceKind: a.salesforceKind,
        salesforceId: a.salesforceId,
        updatedAt: a.updatedAt,
        reportCount: own.length,
        muted: Boolean(a.muted),
        mutedAt: a.mutedAt ?? null,
        mutedBy: a.mutedById ? userName(a.mutedById) : '',
        sharedCount: own.filter((x) => x.sharedAt).length,
        draft: Boolean(a.draft),
        lastReportAt: own[0]?.createdAt ?? null,
        sold: a.soldCredits ?? 0,
        salesCount: a.salesCount ?? 0,
        lastSaleAt: a.lastSaleAt ?? null,
        remaining: p ? Math.max(0, Math.round((Number(p.totalCredits) || 0) - (a.soldCredits ?? 0))) : null,
        primary: p ? { id: p.id, how, createdAt: p.createdAt, createdBy: p.createdBy, createdById: p.createdById, trCredits: p.trCredits, fusionCredits: p.fusionCredits, extraPercent: p.extraPercent ?? 0, totalCredits: p.totalCredits, bundles: p.bundles, sharedAt: p.sharedAt, sharedWith: p.sharedWith ?? [] } : null,
      };
    });
    return { teamIds, accounts: out, reports };
  }

  r('GET', '/api/dashboard', perm('dashboard.view'), (req, ctx, body, res, url) => {
    const focus = url.searchParams.get('team') || '';
    if (focus) needTeam(ctx.scope, focus);
    const all = rows(ctx, focus);
    const teamIds = all.teamIds;
    // Accounts muted from the forecast (by an Executive) are left out of every figure here, their reports too.
    const muted = new Set(all.accounts.filter((a) => a.muted).map((a) => a.id));
    const list = all.accounts.filter((a) => !muted.has(a.id));
    const reports = all.reports.filter((x) => !muted.has(x.customerId));
    const sum = (xs) => xs.reduce((n, a) => n + (Number(a.primary?.totalCredits) || 0), 0);
    const sumOf = (xs, k) => xs.reduce((n, a) => n + (Number(a.primary?.[k]) || 0), 0);
    const totals = {
      accounts: list.length,
      withReport: list.filter((a) => a.primary).length,
      missingSalesforce: list.filter((a) => !a.salesforceUrl).length,
      reports: reports.length,
      sharedReports: reports.filter((x) => x.sharedAt).length,
      accountsShared: list.filter((a) => a.sharedCount > 0).length,
      primaryMarked: list.filter((a) => a.primary?.how === 'marked').length,
      credits: sum(list),
      sold: list.reduce((n, a) => n + (a.sold || 0), 0),
      remaining: list.reduce((n, a) => n + (a.remaining || 0), 0),
      accountsWithSales: list.filter((a) => a.sold > 0).length,
      trCredits: sumOf(list, 'trCredits'),
      fusionCredits: sumOf(list, 'fusionCredits'),
    };
    // Each team in view, its own figures and those of every team below it rolled up.
    const inView = ctx.teams.filter((t) => teamIds.has(t.id));
    const teamRows = inView.map((t) => {
      const below = subtree(ctx.teams, t.id);
      const mine = list.filter((a) => below.has(a.teamId));
      const people = iam.users().filter((u) => below.has(u.teamId) && u.active !== false);
      return { id: t.id, name: t.name, region: t.region, parentId: teamIds.has(t.parentId) ? t.parentId : null, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › '), leaders: (t.leaderIds ?? []).map(userName), people: people.length, accounts: mine.length, withReport: mine.filter((a) => a.primary).length, shared: mine.filter((a) => a.sharedCount > 0).length, missingSalesforce: mine.filter((a) => !a.salesforceUrl).length, credits: sum(mine), sold: mine.reduce((n, a) => n + (a.sold || 0), 0), remaining: mine.reduce((n, a) => n + (a.remaining || 0), 0) };
    });
    // Each person in view: what they own and what they made.
    const people = peopleInScope(ctx.user, teamIds, iam.users()).filter((u) => u.active !== false && teamIds.has(u.teamId)).map((u) => {
      const owned = list.filter((a) => a.ownerId === u.id);
      const made = reports.filter((x) => x.createdById === u.id);
      return { id: u.id, name: u.name, title: u.title, role: iam.roles()[u.role]?.name ?? u.role, team: teams.get(u.teamId)?.name ?? '', teamId: u.teamId, accounts: owned.length, withReport: owned.filter((a) => a.primary).length, reports: made.length, shared: owned.filter((a) => a.sharedCount > 0).length, sharesMade: made.filter((x) => x.sharedAt).length, missingSalesforce: owned.filter((a) => !a.salesforceUrl).length, credits: sum(owned), sold: owned.reduce((n, a) => n + (a.sold || 0), 0), remaining: owned.reduce((n, a) => n + (a.remaining || 0), 0), lastReportAt: made[0]?.createdAt ?? null };
    });
    // Reports a month, the last 12 months.
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = d.toISOString().slice(0, 7);
      const inMonth = reports.filter((x) => String(x.createdAt).startsWith(key));
      months.push({ month: key, reports: inMonth.length, shared: reports.filter((x) => String(x.sharedAt ?? '').startsWith(key)).length });
    }
    const recent = reports.slice(0, 15).map((x) => ({ id: x.id, customerId: x.customerId, customer: x.customer, createdAt: x.createdAt, createdBy: x.createdBy, totalCredits: x.totalCredits, sharedAt: x.sharedAt, team: teams.get(x.teamId)?.name ?? '' }));
    const top = [...list].filter((a) => a.primary).sort((a, b) => b.primary.totalCredits - a.primary.totalCredits).slice(0, 10);
    return { totals, teams: teamRows, people, months, recent, top, focus };
  });

  return { rows, userName };
}
