/**
 * The FTR Credits Command Center: every Sales Engineer signs in, works out the credits each account needs with the
 * Cx Credits Calculator, and keeps the reports here; leaders see their teams' projections on one dashboard, down to
 * each account, its Salesforce record and the report shared with the customer.
 */
import fs from 'node:fs';
import path from 'node:path';

import { APP_CSP, RateLimit, Router, SECURITY_HEADERS, cookies, readBody, send, serveStatic } from './http.js';
import { AuditLog, Doc, fail } from './store.js';
import { Iam, clean, publicUser } from './iam.js';
import { PERMISSIONS, need, needTeam, peopleInScope, scopeOf, subtree, teamPath } from './rbac.js';
import { Teams } from './teams.js';
import { Accounts, DEFAULT_SALESFORCE_HOSTS } from './accounts.js';
import { Terms } from './terms.js';
import { CalculatorService, DEFAULT_CXONE_HOSTS, DEFAULT_GIT_HOSTS, MZ_SOURCE, impactSettings, pageFor, summary } from './calculator.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const COOKIE = 'cc_session';
const BODY_LIMIT = 256 * 1024;
const CALC_LIMIT = 40 * 1024 * 1024;

export function createApp(config, { log = console.log, calculatorService = null } = {}) {
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const iam = new Iam(config.dataDir);
  const teams = new Teams(config.dataDir);
  const accounts = new Accounts(config.dataDir);
  const audit = new AuditLog(path.join(config.dataDir, 'audit.log'));
  const terms = new Terms({ dataDir: config.dataDir, textFile: path.join(config.root, 'TERMS.md') });
  const settings = new Doc(path.join(config.dataDir, 'settings.json'), () => ({ organisationName: 'Checkmarx', salesforceHosts: [], cxoneHosts: [], gitHosts: [] }));
  const hosts = () => ({
    salesforce: config.salesforceHosts ?? (settings.value.salesforceHosts?.length ? settings.value.salesforceHosts : DEFAULT_SALESFORCE_HOSTS),
    cxone: config.cxoneHosts ?? (settings.value.cxoneHosts?.length ? settings.value.cxoneHosts : DEFAULT_CXONE_HOSTS),
    git: config.gitHosts ?? (settings.value.gitHosts?.length ? settings.value.gitHosts : DEFAULT_GIT_HOSTS),
  });
  const calc = calculatorService ?? new CalculatorService({ cxoneHosts: hosts().cxone, gitHosts: hosts().git, log });
  const syncHosts = () => Object.assign(calc, { cxoneHosts: hosts().cxone, gitHosts: hosts().git });
  const idleMs = config.sessionIdleHours * 3600 * 1000;
  // Sign-in attempts: per address and email (a guess at one account), and per address overall (many accounts);
  // the per-account lock in iam.js stops slow guessing. Behind a proxy, set TRUST_PROXY so each person has their address.
  const signInPerAccount = new RateLimit({ max: 10, windowMs: 60_000 });
  const signInPerAddress = new RateLimit({ max: config.signInPerMinute ?? 60, windowMs: 60_000 });

  // ---- First start: an Admin and a top team ---------------------------------------------------------
  const ready = (async () => {
    if (!teams.list().length) teams.create({ name: 'Global Sales Engineering', region: 'Global' });
    if (!iam.users().length) {
      const email = config.adminEmail || 'admin@example.com';
      const { user, temporary } = await iam.create({ email, name: config.adminName, role: 'admin', teamId: teams.list()[0].id });
      teams.update(teams.list()[0].id, { leaderIds: [user.id] });
      const file = path.join(config.dataDir, 'initial-admin-password.txt');
      fs.writeFileSync(file, `Sign in as ${email} with this one-time password, then choose your own:\n${temporary}\n`, { mode: 0o600 });
      log(`First start: the Admin ${email} was created. Their one-time password is in ${file} (deleted once they choose their own).`);
      audit.record({ action: 'setup.admin', target: email });
    }
  })();

  // ---- Who is asking ----------------------------------------------------------------------------------
  const ipOf = (req) => (config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';
  function context(req) {
    const token = cookies(req)[COOKIE];
    const session = iam.session(token);
    if (!session) return null;
    const user = iam.byId(session.userId);
    if (!user || user.active === false) return null;
    const permissions = iam.permissionsOf(user);
    const allTeams = teams.list();
    const scope = scopeOf(user, permissions, allTeams);
    return { token, session, user, permissions, scope, teams: allTeams };
  }
  const actorOf = (ctx) => (ctx ? { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name } : null);
  const record = (ctx, req, action, target = '', details = {}) => audit.record({ actor: actorOf(ctx), action, target, details, ip: ipOf(req) });

  const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${config.secureCookies ? '; Secure' : ''}; Max-Age=${maxAge}`;

  // Guards: signed in; then (for everything but the first-sign-in steps) a password of their own and the terms.
  const signedIn = (req, ctx) => {
    if (!ctx) throw fail(401, 'Sign in first.');
  };
  const ready2 = (req, ctx) => {
    signedIn(req, ctx);
    if (ctx.user.mustChangePassword) throw fail(403, 'Choose your own password first.');
    if (!terms.acceptedBy(ctx.user.id)) throw fail(403, 'Accept the terms of use first.');
  };
  const perm = (id) => (req, ctx) => {
    ready2(req, ctx);
    need(ctx.permissions, id);
  };
  /** The team the calculator works in (X-Team), one in scope. */
  const calcTeam = (req, ctx) => {
    ready2(req, ctx);
    need(ctx.permissions, 'calculator.use');
    const team = String(req.headers['x-team'] ?? '');
    needTeam(ctx.scope, team);
    ctx.team = team;
    ctx.teamSet = new Set([team]);
  };

  const router = new Router();
  const r = (method, pattern, ...handlers) => router.add(method, pattern, ...handlers);

  // ---- Health and sign-in ------------------------------------------------------------------------------
  r('GET', '/healthz', () => ({ ok: true, version: VERSION, mz: MZ_SOURCE.label }));

  r('POST', '/api/auth/signin', async (req, ctx, body, res) => {
    const ip = ipOf(req);
    if (!signInPerAddress.hit(ip) || !signInPerAccount.hit(`${ip}\u0000${clean(body?.email, 254).toLowerCase()}`)) throw fail(429, 'Too many attempts from here: wait a minute.');
    const user = await iam.signIn(body?.email, body?.password).catch((error) => {
      audit.record({ action: 'auth.failed', target: clean(body?.email, 254).toLowerCase(), ip, details: { status: error.status } });
      throw error;
    });
    const { token } = iam.openSession(user.id, { idleMs, ip, agent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', cookie(token, Math.floor(idleMs / 1000)));
    audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'auth.signin', ip });
    return { ok: true };
  });
  r('POST', '/api/auth/signout', (req, ctx, body, res) => {
    if (ctx) {
      iam.endSession(ctx.token);
      if (!iam.sessions.value || !Object.values(iam.sessions.value.sessions).some((s) => s.userId === ctx.user.id)) calc.forget(ctx.user.id);
      record(ctx, req, 'auth.signout');
    }
    res.setHeader('Set-Cookie', cookie('', 0));
    return { ok: true };
  });

  r('GET', '/api/me', signedIn, (req, ctx) => {
    const team = teams.get(ctx.user.teamId);
    const scopeTeams = ctx.teams.filter((t) => ctx.scope.has(t.id)).map((t) => ({ id: t.id, name: t.name, region: t.region, parentId: t.parentId, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › '), leaderIds: t.leaderIds }));
    return {
      user: publicUser(ctx.user),
      csrf: ctx.session.csrf,
      role: { id: ctx.user.role, name: iam.roles()[ctx.user.role]?.name ?? ctx.user.role },
      permissions: [...ctx.permissions],
      team: team ? { id: team.id, name: team.name, path: teamPath(ctx.teams, team.id).map((x) => x.name).join(' › ') } : null,
      leads: ctx.teams.filter((t) => t.leaderIds?.includes(ctx.user.id)).map((t) => t.id),
      scopeTeams,
      terms: { accepted: terms.acceptedBy(ctx.user.id), version: terms.version },
      guideSeen: Boolean(ctx.user.guideSeenAt),
      organisationName: settings.value.organisationName,
      version: VERSION,
      mz: MZ_SOURCE.label,
    };
  });
  r('POST', '/api/me/password', signedIn, async (req, ctx, body) => {
    await iam.setPassword(ctx.user.id, body?.current, body?.next);
    iam.endSessionsOf(ctx.user.id, { except: ctx.session.id });
    record(ctx, req, 'auth.password');
    const file = path.join(config.dataDir, 'initial-admin-password.txt');
    if (fs.existsSync(file) && ctx.user.role === 'admin') fs.rmSync(file, { force: true });
    return { ok: true };
  });
  r('GET', '/api/terms', () => ({ version: terms.version, text: terms.text }));
  r('POST', '/api/terms/accept', signedIn, (req, ctx) => {
    if (ctx.user.mustChangePassword) throw fail(403, 'Choose your own password first.');
    terms.accept(ctx.user.id, ipOf(req));
    record(ctx, req, 'terms.accept', '', { version: terms.version, hash: terms.hash });
    return { ok: true };
  });
  r('POST', '/api/me/guide', ready2, (req, ctx) => {
    iam.markGuideSeen(ctx.user.id);
    return { ok: true };
  });

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
      const { report: p, how } = accounts.primaryOf(a);
      return {
        id: a.id,
        name: a.name,
        teamId: a.teamId,
        team: teams.get(a.teamId)?.name ?? '',
        teamPath: teamPath(ctx.teams, a.teamId).map((x) => x.name).join(' › '),
        ownerId: a.ownerId,
        owner: userName(a.ownerId),
        salesforceUrl: a.salesforceUrl,
        salesforceKind: a.salesforceKind,
        salesforceId: a.salesforceId,
        updatedAt: a.updatedAt,
        reportCount: own.length,
        sharedCount: own.filter((x) => x.sharedAt).length,
        lastReportAt: own[0]?.createdAt ?? null,
        primary: p ? { id: p.id, how, createdAt: p.createdAt, createdBy: p.createdBy, createdById: p.createdById, trCredits: p.trCredits, fusionCredits: p.fusionCredits, totalCredits: p.totalCredits, bundles: p.bundles, sharedAt: p.sharedAt } : null,
      };
    });
    return { teamIds, accounts: out, reports };
  }

  r('GET', '/api/dashboard', perm('dashboard.view'), (req, ctx, body, res, url) => {
    const focus = url.searchParams.get('team') || '';
    if (focus) needTeam(ctx.scope, focus);
    const { teamIds, accounts: list, reports } = rows(ctx, focus);
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
      trCredits: sumOf(list, 'trCredits'),
      fusionCredits: sumOf(list, 'fusionCredits'),
    };
    // Each team in view, its own figures and those of every team below it rolled up.
    const inView = ctx.teams.filter((t) => teamIds.has(t.id));
    const teamRows = inView.map((t) => {
      const below = subtree(ctx.teams, t.id);
      const mine = list.filter((a) => below.has(a.teamId));
      const people = iam.users().filter((u) => below.has(u.teamId) && u.active !== false);
      return { id: t.id, name: t.name, region: t.region, parentId: teamIds.has(t.parentId) ? t.parentId : null, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › '), leaders: (t.leaderIds ?? []).map(userName), people: people.length, accounts: mine.length, withReport: mine.filter((a) => a.primary).length, shared: mine.filter((a) => a.sharedCount > 0).length, missingSalesforce: mine.filter((a) => !a.salesforceUrl).length, credits: sum(mine) };
    });
    // Each person in view: what they own and what they made.
    const people = peopleInScope(ctx.user, teamIds, iam.users()).filter((u) => u.active !== false && teamIds.has(u.teamId)).map((u) => {
      const owned = list.filter((a) => a.ownerId === u.id);
      const made = reports.filter((x) => x.createdById === u.id);
      return { id: u.id, name: u.name, title: u.title, role: iam.roles()[u.role]?.name ?? u.role, team: teams.get(u.teamId)?.name ?? '', teamId: u.teamId, accounts: owned.length, withReport: owned.filter((a) => a.primary).length, reports: made.length, shared: made.filter((x) => x.sharedAt).length, missingSalesforce: owned.filter((a) => !a.salesforceUrl).length, credits: sum(owned), lastReportAt: made[0]?.createdAt ?? null };
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

  r('GET', '/api/accounts', perm('dashboard.view'), (req, ctx, body, res, url) => {
    const focus = url.searchParams.get('team') || '';
    if (focus) needTeam(ctx.scope, focus);
    return { accounts: rows(ctx, focus).accounts };
  });

  const accountDetail = (ctx, id) => {
    const a = accounts.get(id, ctx.scope);
    const meta = accounts.accounts.meta(id);
    const reps = accounts.reportsOf(ctx.scope, id).map((x) => ({ ...x, createdByName: userName(x.createdById), sharedByName: x.sharedById ? userName(x.sharedById) : '' }));
    const { report: p, how } = accounts.primaryOf(meta);
    const members = iam.users().filter((u) => u.active !== false && u.teamId === a.teamId).map((u) => ({ id: u.id, name: u.name }));
    if (a.ownerId && !members.some((m) => m.id === a.ownerId)) members.push({ id: a.ownerId, name: userName(a.ownerId) });
    return {
      account: { ...summary(a), teamId: a.teamId, team: teams.get(a.teamId)?.name ?? '', teamPath: teamPath(ctx.teams, a.teamId).map((x) => x.name).join(' › '), ownerId: a.ownerId, owner: userName(a.ownerId), createdById: a.createdById, salesforceUrl: a.salesforceUrl, salesforceKind: a.salesforceKind, salesforceId: a.salesforceId, primaryReportId: a.primaryReportId, reportCount: reps.length, sharedCount: reps.filter((x) => x.sharedAt).length, primary: p ? { ...p, how } : null },
      reports: reps,
      members,
      can: { edit: ctx.permissions.has('calculator.use'), share: ctx.permissions.has('reports.share'), deleteAccount: ctx.permissions.has('accounts.delete') },
    };
  };
  r('GET', '/api/cc/accounts/:id', ready2, (req, ctx, body, res, url, params) => accountDetail(ctx, params.id));
  r('PUT', '/api/cc/accounts/:id', perm('calculator.use'), (req, ctx, body, res, url, params) => {
    const before = accounts.get(params.id, ctx.scope);
    const patch = {};
    if (body?.salesforceUrl !== undefined) patch.salesforceUrl = body.salesforceUrl;
    if (body?.name !== undefined) patch.name = body.name;
    if (body?.ownerId !== undefined) {
      const owner = iam.byId(String(body.ownerId));
      if (!owner || owner.active === false || !ctx.scope.has(owner.teamId)) throw fail(400, 'Choose someone in a team you work in.');
      patch.ownerId = owner.id;
    }
    if (body?.teamId !== undefined) {
      needTeam(ctx.scope, String(body.teamId));
      patch.teamId = String(body.teamId);
    }
    const after = accounts.setDetails(params.id, ctx.scope, patch, hosts().salesforce);
    record(ctx, req, 'account.update', after.name, { id: after.id, changed: Object.keys(patch), ...(patch.teamId && patch.teamId !== before.teamId ? { fromTeam: before.teamId, toTeam: patch.teamId } : {}) });
    return accountDetail(ctx, params.id);
  });
  r('DELETE', '/api/cc/accounts/:id', perm('accounts.delete'), (req, ctx, body, res, url, params) => {
    const a = accounts.get(params.id, ctx.scope);
    accounts.remove(params.id, ctx.scope);
    record(ctx, req, 'account.delete', a.name, { id: a.id });
    return { ok: true };
  });
  r('POST', '/api/cc/reports/:id/primary', perm('reports.share'), (req, ctx, body, res, url, params) => {
    const rep = accounts.report(params.id, ctx.scope);
    accounts.setPrimary(rep.customerId, body?.primary === false ? null : rep.id, ctx.scope);
    record(ctx, req, body?.primary === false ? 'report.unprimary' : 'report.primary', rep.customer, { id: rep.id, totalCredits: rep.totalCredits });
    return accountDetail(ctx, rep.customerId);
  });
  r('POST', '/api/cc/reports/:id/shared', perm('reports.share'), (req, ctx, body, res, url, params) => {
    const rep = accounts.markShared(params.id, ctx.scope, { shared: body?.shared !== false, note: body?.note }, ctx.user);
    record(ctx, req, rep.sharedAt ? 'report.shared' : 'report.unshared', rep.customer, { id: rep.id, note: rep.sharedNote });
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
  r('DELETE', '/api/cc/reports/:id', ready2, (req, ctx, body, res, url, params) => {
    const rep = deleteReport(req, ctx, params.id, ctx.scope);
    return accountDetail(ctx, rep.customerId);
  });

  // ---- CSV exports -----------------------------------------------------------------------------------
  const csvCell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    // A cell a spreadsheet would run as a formula is written as text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = (header, lines) => `﻿${[header, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`;
  r('GET', '/api/export/accounts.csv', perm('dashboard.export'), (req, ctx, body, res) => {
    const { accounts: list } = rows(ctx);
    record(ctx, req, 'export.accounts', '', { rows: list.length });
    return { csv: csv(['Account', 'Team', 'Accountable SE', 'Salesforce', 'Salesforce record', 'Primary report', 'Primary is', 'T&R credits', 'Fusion credits', 'Total credits', 'Bundles', 'Reports', 'Shared with customer', 'Last report'], list.map((a) => [a.name, a.teamPath, a.owner, a.salesforceUrl, a.salesforceId, a.primary?.createdAt ?? '', a.primary?.how ?? '', a.primary?.trCredits ?? '', a.primary?.fusionCredits ?? '', a.primary?.totalCredits ?? '', a.primary?.bundles ?? '', a.reportCount, a.sharedCount, a.lastReportAt ?? ''])), name: 'accounts.csv' };
  });
  r('GET', '/api/export/reports.csv', perm('dashboard.export'), (req, ctx) => {
    const { reports } = rows(ctx);
    record(ctx, req, 'export.reports', '', { rows: reports.length });
    return { csv: csv(['Report', 'Account', 'Team', 'Made by', 'Made at', 'T&R credits', 'Fusion credits', 'Extra %', 'Total credits', 'Bundles', 'Salesforce', 'Shared at', 'Shared by', 'Note'], reports.map((x) => [x.id, x.customer, teamPath(ctx.teams, x.teamId).map((t) => t.name).join(' › '), x.createdBy, x.createdAt, x.trCredits ?? '', x.fusionCredits ?? '', x.extraPercent ?? '', x.totalCredits, x.bundles ?? '', x.salesforceUrl, x.sharedAt ?? '', x.sharedById ? userName(x.sharedById) : '', x.sharedNote])), name: 'reports.csv' };
  });

  // ---- People, teams, roles, settings, audit ---------------------------------------------------------------
  const visiblePeople = (ctx) => (ctx.permissions.has('scope.all') ? iam.users() : peopleInScope(ctx.user, ctx.scope, iam.users()));
  r('GET', '/api/people', ready2, (req, ctx) => ({
    people: visiblePeople(ctx).map((u) => ({ ...publicUser(u), roleName: iam.roles()[u.role]?.name ?? u.role, team: teams.get(u.teamId)?.name ?? '', teamPath: teamPath(ctx.teams, u.teamId).map((t) => t.name).join(' › '), leads: ctx.teams.filter((t) => t.leaderIds?.includes(u.id)).map((t) => t.name) })),
    roles: Object.entries(iam.roles()).map(([id, role]) => ({ id, ...role, grantable: iam.canGrant(id, ctx.permissions) })),
    teams: ctx.teams.filter((t) => ctx.scope.has(t.id) || ctx.permissions.has('teams.manage')).map((t) => ({ ...t, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › '), leaders: (t.leaderIds ?? []).map((id) => ({ id, name: userName(id) })), members: iam.users().filter((u) => u.teamId === t.id).length })),
    permissions: PERMISSIONS,
  }));
  /** May this person change `target`: in their scope, and holding the role they hold. */
  const canManage = (ctx, target) => ctx.permissions.has('users.manage') && (ctx.permissions.has('scope.all') || ctx.scope.has(target.teamId)) && iam.canGrant(target.role, ctx.permissions);
  r('POST', '/api/people', perm('users.manage'), async (req, ctx, body) => {
    const role = String(body?.role ?? 'se');
    if (!iam.canGrant(role, ctx.permissions)) throw fail(403, 'You cannot give a role with permissions you do not hold.');
    const teamId = String(body?.teamId ?? '');
    if (!teams.get(teamId)) throw fail(400, 'Choose their team.');
    if (!ctx.permissions.has('scope.all')) needTeam(ctx.scope, teamId);
    const { user, temporary } = await iam.create({ email: body?.email, name: body?.name, title: body?.title, role, teamId });
    record(ctx, req, 'user.create', user.email, { role, team: teams.get(teamId)?.name });
    return { user: publicUser(user), temporary };
  });
  r('PUT', '/api/people/:id', perm('users.manage'), (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    if (target.id === ctx.user.id && (body?.role !== undefined || body?.active === false)) throw fail(400, 'Ask another Admin to change your own role or access.');
    if (body?.role !== undefined && !iam.canGrant(String(body.role), ctx.permissions)) throw fail(403, 'You cannot give a role with permissions you do not hold.');
    if (body?.teamId !== undefined) {
      if (!teams.get(String(body.teamId))) throw fail(400, 'Choose their team.');
      if (!ctx.permissions.has('scope.all')) needTeam(ctx.scope, String(body.teamId));
    }
    const user = iam.update(target.id, { name: body?.name, title: body?.title, role: body?.role, teamId: body?.teamId, active: body?.active });
    if (user.active === false) calc.forget(user.id);
    record(ctx, req, 'user.update', user.email, { changed: Object.keys(body ?? {}) });
    return { user: publicUser(user) };
  });
  r('POST', '/api/people/:id/reset', perm('users.manage'), async (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    const temporary = await iam.resetPassword(target.id);
    calc.forget(target.id);
    record(ctx, req, 'user.reset', target.email);
    return { temporary };
  });
  r('DELETE', '/api/people/:id', perm('users.manage'), (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    if (target.id === ctx.user.id) throw fail(400, 'You cannot remove yourself.');
    iam.remove(target.id);
    teams.forget(target.id);
    calc.forget(target.id);
    record(ctx, req, 'user.remove', target.email);
    return { ok: true };
  });

  r('POST', '/api/teams', perm('teams.manage'), (req, ctx, body) => {
    const team = teams.create({ name: body?.name, region: body?.region, parentId: body?.parentId || null, leaderIds: validLeaders(body?.leaderIds) });
    record(ctx, req, 'team.create', team.name);
    return { team };
  });
  const validLeaders = (ids) => (Array.isArray(ids) ? ids.map(String).filter((id) => iam.byId(id)) : []);
  r('PUT', '/api/teams/:id', perm('teams.manage'), (req, ctx, body, res, url, params) => {
    const team = teams.update(params.id, { name: body?.name, region: body?.region, parentId: body?.parentId === undefined ? undefined : body.parentId || null, leaderIds: body?.leaderIds === undefined ? undefined : validLeaders(body.leaderIds) });
    record(ctx, req, 'team.update', team.name, { changed: Object.keys(body ?? {}) });
    return { team };
  });
  r('DELETE', '/api/teams/:id', perm('teams.manage'), (req, ctx, body, res, url, params) => {
    const team = teams.get(params.id);
    teams.remove(params.id, { hasMembers: iam.users().some((u) => u.teamId === params.id), hasAccounts: accounts.accounts.list().some((a) => a.teamId === params.id) });
    record(ctx, req, 'team.remove', team?.name ?? params.id);
    return { ok: true };
  });

  r('PUT', '/api/roles/:id', perm('roles.manage'), (req, ctx, body, res, url, params) => {
    const role = iam.saveRole(params.id === 'new' ? null : params.id, body ?? {}, ctx.permissions);
    record(ctx, req, 'role.save', role.name, { permissions: role.permissions });
    return { role };
  });
  r('DELETE', '/api/roles/:id', perm('roles.manage'), (req, ctx, body, res, url, params) => {
    iam.removeRole(params.id);
    record(ctx, req, 'role.remove', params.id);
    return { ok: true };
  });

  r('GET', '/api/settings', perm('settings.manage'), () => ({ ...settings.value, effective: hosts(), fromEnvironment: { salesforce: Boolean(config.salesforceHosts), cxone: Boolean(config.cxoneHosts), git: Boolean(config.gitHosts) }, dataDir: config.dataDir }));
  const hostList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/)).map((h) => String(h).trim().toLowerCase().replace(/^\*\./, '')).filter((h) => /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)).slice(0, 50);
  r('PUT', '/api/settings', perm('settings.manage'), (req, ctx, body) => {
    if (body?.organisationName !== undefined) settings.value.organisationName = clean(body.organisationName, 120) || settings.value.organisationName;
    for (const k of ['salesforceHosts', 'cxoneHosts', 'gitHosts']) if (body?.[k] !== undefined) settings.value[k] = hostList(body[k]);
    settings.save();
    syncHosts();
    record(ctx, req, 'settings.update', '', { changed: Object.keys(body ?? {}) });
    return { ...settings.value, effective: hosts() };
  });
  r('GET', '/api/audit', perm('audit.view'), (req, ctx, body, res, url) => {
    const q = String(url.searchParams.get('q') ?? '').toLowerCase().slice(0, 100);
    return { events: audit.recent({ limit: 500, filter: (e) => !q || JSON.stringify(e).toLowerCase().includes(q) }) };
  });
  r('GET', '/api/backup', perm('settings.manage'), (req, ctx) => {
    record(ctx, req, 'backup.download');
    const all = (col) => col.list().map((m) => col.get(m.id)).filter(Boolean);
    return { kind: 'ftr-cc-dashboard-backup', version: VERSION, at: new Date().toISOString(), iam: { roles: iam.roles(), users: iam.users() }, teams: teams.list(), settings: settings.value, terms: terms.doc.value, accounts: all(accounts.accounts), reports: all(accounts.reports) };
  });

  // ---- The calculator's API (/api/projections…), per team -----------------------------------------------------
  r('GET', '/api/projections', calcTeam, (req, ctx) => ({ customers: accounts.list(ctx.teamSet).map((a) => ({ ...a })).sort((a, b) => String(a.name).localeCompare(String(b.name))), organisationName: settings.value.organisationName, impactDefaults: impactSettings({}) }));
  r('POST', '/api/projections', calcTeam, (req, ctx, body) => {
    const a = accounts.create({ name: body?.name, teamId: ctx.team, user: ctx.user });
    record(ctx, req, 'account.create', a.name, { id: a.id, team: teams.get(ctx.team)?.name });
    return { customer: a };
  });
  r('GET', '/api/projections/report-runtime', calcTeam, async () => (await import('../vendor/mz/src/standalone-calculator.js')).reportRuntime());
  r('GET', '/api/projections/reports', calcTeam, (req, ctx, body, res, url) => ({ reports: accounts.reportsOf(ctx.teamSet, String(url.searchParams.get('customer') ?? '')) }));
  r('POST', '/api/projections/reports', calcTeam, (req, ctx, body) => {
    const rep = accounts.addReport({ customerId: String(body?.customerId ?? ''), data: body?.data, user: ctx.user }, ctx.teamSet);
    record(ctx, req, 'report.create', rep.customer, { id: rep.id, totalCredits: rep.totalCredits, team: teams.get(rep.teamId)?.name });
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
  r('POST', '/api/projections/read', calcTeam, (req, ctx, body) => calc.startRead(ctx.user.id, body));
  r('GET', '/api/projections/read', calcTeam, (req, ctx, body, res, url) => calc.readView(ctx.user.id, url.searchParams.get('since')));
  r('POST', '/api/projections/series', calcTeam, (req, ctx, body) => calc.series(ctx.user.id, body));
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
  r('GET', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => ({ customer: accounts.get(params.id, ctx.teamSet) }));
  r('PUT', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => {
    const patch = {};
    for (const key of ['name', 'tr', 'fusion', 'fusionNew', 'totals', 'scope', 'impact']) if (body?.[key] !== undefined) patch[key] = body[key];
    return { customer: summary(accounts.update(params.id, ctx.teamSet, patch, ctx.user)) };
  });
  r('DELETE', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => {
    need(ctx.permissions, 'accounts.delete');
    const a = accounts.get(params.id, ctx.teamSet);
    accounts.remove(params.id, ctx.teamSet);
    record(ctx, req, 'account.delete', a.name, { id: a.id });
    return { ok: true };
  });

  r('POST', '/api/cc/cxone/connect', perm('calculator.use'), async (req, ctx, body) => {
    const state = await calc.connectKey(ctx.user.id, body);
    record(ctx, req, 'cxone.connect', state.tenant, { baseUrl: state.baseUrl });
    return state;
  });
  r('POST', '/api/cc/cxone/disconnect', perm('calculator.use'), (req, ctx) => calc.disconnect(ctx.user.id));
  r('GET', '/api/cc/cxone/status', perm('calculator.use'), (req, ctx) => calc.status(ctx.user.id));

  // ---- The requests ---------------------------------------------------------------------------------------------
  const PUBLIC_DIR = path.join(config.root, 'public');
  const SAMPLES = path.join(config.root, 'vendor', 'mz', 'public', 'calculator', 'samples');
  const LEGAL = { '/legal/terms': 'TERMS.md', '/legal/license': 'LICENSE', '/legal/guide': 'docs/USER-GUIDE.md' };

  async function handle(req, res) {
    await ready;
    const url = new URL(req.url, 'http://local');
    const pathname = url.pathname;
    const method = req.method === 'HEAD' ? 'GET' : req.method;

    if (method === 'GET' && LEGAL[pathname]) {
      return send(res, 200, fs.readFileSync(path.join(config.root, LEGAL[pathname]), 'utf8'), { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (method === 'GET' && pathname.startsWith('/calc-assets/samples/')) {
      const ctx = context(req);
      if (!ctx) return send(res, 401, { error: 'Sign in first.' });
      if (serveStatic(SAMPLES, req, res, pathname.slice('/calc-assets/samples/'.length))) return;
      return send(res, 404, { error: 'Not found.' });
    }
    if (method === 'GET' && (pathname === '/calculator' || pathname === '/calculator/')) {
      const ctx = context(req);
      if (!ctx) return send(res, 302, '', { Location: '/#/login?next=%2Fcalculator' });
      if (ctx.user.mustChangePassword || !terms.acceptedBy(ctx.user.id)) return send(res, 302, '', { Location: '/#/welcome' });
      if (!ctx.permissions.has('calculator.use')) return send(res, 302, '', { Location: '/#/overview' });
      const scopeTeams = ctx.teams.filter((t) => ctx.scope.has(t.id)).map((t) => ({ id: t.id, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › ') })).sort((a, b) => a.path.localeCompare(b.path));
      const { html, csp } = pageFor({ csrf: ctx.session.csrf, user: { id: ctx.user.id, name: ctx.user.name }, roleName: iam.roles()[ctx.user.role]?.name ?? '', permissions: [...ctx.permissions], teams: scopeTeams, ownTeamId: ctx.user.teamId, organisationName: settings.value.organisationName }, { productCode: config.productCode });
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp });
    }

    const match = router.match(method, pathname);
    if (!match) {
      if (method === 'GET' && !pathname.startsWith('/api/')) {
        if (pathname === '/' || pathname === '/index.html') return serveStatic(PUBLIC_DIR, req, res, 'index.html') || send(res, 404, 'Not found');
        if (serveStatic(PUBLIC_DIR, req, res, pathname)) return;
      }
      return send(res, 404, { error: 'Not found.' });
    }

    const ctx = context(req);
    try {
      let body = null;
      if (method !== 'GET') {
        // Changes come only from this site's own pages: the session's CSRF token, and the browser's Origin when it says one.
        if (pathname !== '/api/auth/signin') {
          if (!ctx || req.headers['x-csrf-token'] !== ctx.session.csrf) throw fail(ctx ? 403 : 401, ctx ? 'Reload the page: the request did not come from it.' : 'Sign in first.');
        }
        const origin = req.headers.origin;
        if (origin && config.publicUrl && origin !== new URL(config.publicUrl).origin) throw fail(403, 'That request came from another site.');
        if (origin && !config.publicUrl && new URL(origin).host !== req.headers.host) throw fail(403, 'That request came from another site.');
        body = await readBody(req, pathname.startsWith('/api/projections') ? CALC_LIMIT : BODY_LIMIT);
      }
      let result;
      for (const h of match.handlers) result = await h(req, ctx, body, res, url, match.params);
      if (result?.csv !== undefined) return send(res, 200, result.csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${result.name}"` });
      if (pathname === '/healthz') return send(res, 200, result);
      return send(res, 200, result ?? { ok: true });
    } catch (error) {
      if (error.status) return send(res, error.status, { error: error.message });
      log(`[error] ${req.method} ${pathname}: ${error.stack ?? error.message}`);
      return send(res, 500, { error: 'Something went wrong on the server: an Admin can find it in the server log.' });
    }
  }

  return { handle, ready, iam, teams, accounts, audit, terms, settings, calc, SECURITY_HEADERS, APP_CSP };
}
