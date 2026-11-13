import { clean } from '../iam.js';
import { fail } from '../store.js';
import { KINDS as SUPPORT_KINDS, STATUSES as SUPPORT_STATUSES, supportEmail } from '../support.js';

/**
 * Get help (support cases and enhancement requests), and Settings: general settings, teams and roles.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerSupport(d) {
  const {
    ACCENTS, accounts, config, hosts, iam, linkBase, perm, r, record, sendMail, settings, signedIn,
    supportChannel, supportDesk, syncHosts, teams, versionLabel,
  } = d;
  // ---- Get help: everyone raises and follows their own; the support team sees them all, answers, moves them on ----
  const supportTeam = () => iam.users().filter((u) => u.active !== false && u.email && iam.permissionsOf(u).has('support.manage'));
  const seesRequest = (ctx, t) => t.requester.id === ctx.user.id || ctx.permissions.has('support.manage');
  const requestView = (ctx, t, { full = false } = {}) => {
    const view = { id: t.id, kind: t.kind, subject: t.subject, status: t.status, priority: t.priority, requester: { name: t.requester.name, email: t.requester.email }, mine: t.requester.id === ctx.user.id, createdAt: t.createdAt, updatedAt: t.updatedAt, messages: t.messages.length };
    if (!full) return view;
    return { ...view, page: t.page, version: t.version, conversation: t.messages.map((m) => ({ at: m.at, name: m.by.name || m.by.email, team: m.team, mine: m.by.id === ctx.user.id, text: m.text })), history: t.history.map((h) => ({ at: h.at, name: h.by.name || h.by.email, status: h.status })) };
  };
  /**
   * Email about a request. The person who raised it hears of every answer and status change; the support address
   * (and the support team) of every new request and every answer from that person. Never fails the request: the
   * answer says what could not be sent.
   */
  const mailSupport = async (ctx, t, event, { fromTeam = false, message = null } = {}) => {
    const appName = settings.value.branding?.appName ? `${settings.value.branding.appName} ${settings.value.branding.tagline ?? ''}`.trim() : 'FTR Credits Command Center';
    const url = linkBase();
    const self = String(ctx.user.email ?? '').toLowerCase();
    const jobs = [];
    if ((event !== 'message' || fromTeam) && t.requester.email && (event === 'created' || t.requester.email.toLowerCase() !== self)) jobs.push(['requester', [t.requester.email]]);
    if (!fromTeam && event !== 'status') {
      const team = [...new Set([supportChannel().email, ...supportTeam().map((u) => u.email)].map((e) => String(e).toLowerCase()).filter((e) => e && e !== self))];
      if (team.length) jobs.push(['team', team]);
    }
    const result = { sent: 0, error: '' };
    for (const [to, addresses] of jobs) {
      try {
        // The support address answers by replying: the reply goes to the person who asked.
        await sendMail(addresses.join(', '), { ...supportEmail(t, { event, to, appName, url, message }), ...(to === 'team' && t.requester.email ? { replyTo: t.requester.email } : {}) });
        result.sent += addresses.length;
      } catch (error) {
        result.error = error.message;
      }
    }
    return result;
  };
  r('GET', '/api/support', signedIn, (req, ctx) => ({ team: ctx.permissions.has('support.manage'), statuses: SUPPORT_STATUSES, channel: supportChannel(), requests: supportDesk.list().filter((t) => seesRequest(ctx, t)).map((t) => requestView(ctx, t)) }));
  r('GET', '/api/support/:id', signedIn, (req, ctx, body, res, url, params) => {
    const t = supportDesk.get(params.id);
    if (!t || !seesRequest(ctx, t)) throw fail(404, 'No such request, or it is not yours to see.');
    return { team: ctx.permissions.has('support.manage'), request: requestView(ctx, t, { full: true }) };
  });
  r('POST', '/api/support', signedIn, async (req, ctx, body) => {
    if (!SUPPORT_KINDS[body?.kind]) throw fail(400, 'Choose a support case or an enhancement.');
    if (supportDesk.raisedSince(ctx.user.id, new Date(Date.now() - 3_600_000).toISOString()) >= 20) throw fail(429, 'You raised 20 requests in the last hour. Add to one of them instead, or try again later.');
    const t = supportDesk.create({ kind: body.kind, subject: body?.subject, text: body?.text, priority: body?.priority, page: body?.page, version: versionLabel(), requester: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email } });
    record(ctx, req, t.kind === 'case' ? 'support.case' : 'support.enhancement', `${t.id} ${t.subject}`, { id: t.id, priority: t.priority });
    const emailed = await mailSupport(ctx, t, 'created');
    return { request: requestView(ctx, t, { full: true }), emailed };
  });
  // Answers go by email (each request is sent from the person's own address as reply-to): there is no conversation here.
  for (const p of ['/api/support/:id/messages', '/api/support/:id/status'])
    r('POST', p, signedIn, () => {
      throw fail(410, 'Requests are answered by email.');
    });
  // Settings → Get help: the portal or email, and the address requests go to.
  r('PUT', '/api/settings/support', perm('settings.manage'), (req, ctx, body) => {
    const before = supportChannel();
    const mode = body?.mode === undefined ? before.mode : body.mode === 'email' ? 'email' : 'portal';
    const email = body?.email === undefined ? before.email : String(body.email).trim().toLowerCase();
    if (!/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email)) throw fail(400, 'Give the email address requests go to.');
    settings.value.support = { mode, email };
    settings.save();
    record(ctx, req, 'settings.support', `${mode} · ${email}`, { mode, email, before });
    return supportChannel();
  });

  // Teams are managed within the manager's own scope: the team, where it sits, and its leaders (people of teams in scope).
  const teamInScope = (ctx, id) => {
    if (!id) {
      if (!ctx.permissions.has('scope.all')) throw fail(403, 'Only someone who sees every team can add a team at the top.');
      return;
    }
    if (!ctx.scope.has(String(id))) throw fail(403, 'That team is outside the teams you manage.');
  };
  const validLeaders = (ctx, ids) => {
    if (!Array.isArray(ids)) return [];
    const people = ids.map(String).map((id) => iam.byId(id)).filter(Boolean);
    if (people.some((u) => !ctx.permissions.has('scope.all') && !ctx.scope.has(u.teamId))) throw fail(403, 'A leader must be someone from the teams you manage.');
    return people.map((u) => u.id);
  };
  r('POST', '/api/teams', perm('teams.manage'), (req, ctx, body) => {
    teamInScope(ctx, body?.parentId || null);
    const team = teams.create({ name: body?.name, region: body?.region, parentId: body?.parentId || null, leaderIds: validLeaders(ctx, body?.leaderIds) });
    record(ctx, req, 'team.create', team.name);
    return { team };
  });
  r('PUT', '/api/teams/:id', perm('teams.manage'), (req, ctx, body, res, url, params) => {
    teamInScope(ctx, params.id);
    if (body?.parentId !== undefined) teamInScope(ctx, body.parentId || null);
    const team = teams.update(params.id, { name: body?.name, region: body?.region, parentId: body?.parentId === undefined ? undefined : body.parentId || null, leaderIds: body?.leaderIds === undefined ? undefined : validLeaders(ctx, body.leaderIds) });
    record(ctx, req, 'team.update', team.name, { changed: Object.keys(body ?? {}) });
    return { team };
  });
  r('DELETE', '/api/teams/:id', perm('teams.manage'), (req, ctx, body, res, url, params) => {
    teamInScope(ctx, params.id);
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

  r('GET', '/api/settings', perm('settings.manage'), () => ({ ...settings.value, trustProxyEnv: Boolean(config.trustProxy), effective: hosts(), fromEnvironment: { salesforce: Boolean(config.salesforceHosts), cxone: Boolean(config.cxoneHosts), git: Boolean(config.gitHosts) }, dataDir: config.dataDir }));
  const hostList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/)).map((h) => String(h).trim().toLowerCase().replace(/^\*\./, '')).filter((h) => /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)).slice(0, 50);
  r('PUT', '/api/settings', perm('settings.manage'), (req, ctx, body) => {
    if (body?.organisationName !== undefined) settings.value.organisationName = clean(body.organisationName, 120) || settings.value.organisationName;
    if (body?.features !== undefined) settings.value.features = { ...(settings.value.features ?? {}), exports: body.features?.exports === true };
    if (body?.trustProxy !== undefined) settings.value.trustProxy = body.trustProxy === true;
    if (body?.theme !== undefined) {
      const mode = ['light', 'dark', 'system'].includes(body.theme?.mode) ? body.theme.mode : 'light';
      const accent = ACCENTS.includes(body.theme?.accent) ? body.theme.accent : 'aurora';
      settings.value.theme = { mode, accent };
      // "Apply to everyone now": everyone's own choice gives way to the organisation's.
      if (body.theme?.applyToAll === true) {
        let n = 0;
        for (const u of iam.users()) {
          if (u.prefs?.mode !== undefined || u.prefs?.accent !== undefined) {
            const { mode: m, accent: a, ...rest } = u.prefs;
            void m;
            void a;
            u.prefs = rest;
            n++;
          }
        }
        iam.save();
        record(ctx, req, 'settings.theme.everyone', `${accent} · ${mode}`, { replaced: n });
      }
    }
    for (const k of ['salesforceHosts', 'cxoneHosts', 'gitHosts']) if (body?.[k] !== undefined) settings.value[k] = hostList(body[k]);
    settings.save();
    syncHosts();
    record(ctx, req, 'settings.update', '', { changed: Object.keys(body ?? {}) });
    return { ...settings.value, trustProxyEnv: Boolean(config.trustProxy), effective: hosts() };
  });
}
