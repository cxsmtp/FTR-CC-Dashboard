import { clean, publicUser } from '../iam.js';
import { systemEmail } from '../mailer.js';
import { homeOf, needTeam, peopleInScope, PERMISSIONS, scopeOf, teamPath } from '../rbac.js';
import { fail } from '../store.js';

/**
 * People, teams and roles: adding, importing, changing and removing them.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerPeople(d) {
  const {
    calc, followOwner, iam, linkBase, log, outOfStep, passwordResets, perm, r, ready2, record, resetReady,
    sendMail, teams, userName,
  } = d;
  // ---- People, teams, roles, settings, audit ---------------------------------------------------------------
  const visiblePeople = (ctx) => (ctx.permissions.has('scope.all') ? iam.users() : peopleInScope(ctx.user, ctx.scope, iam.users()));
  r('GET', '/api/people', ready2, (req, ctx) => ({
    people: visiblePeople(ctx).map((u) => ({ ...publicUser(u), picture: u.picture ? `/api/people/${u.id}/picture?v=${encodeURIComponent(u.picture.at)}` : null, roleName: iam.roles()[u.role]?.name ?? u.role, team: teams.get(u.teamId)?.name ?? '', teamPath: teamPath(ctx.teams, u.teamId).map((t) => t.name).join(' › '), leads: ctx.teams.filter((t) => t.leaderIds?.includes(u.id)).map((t) => t.name), manager: u.managerId ? userName(u.managerId) : '', reports: iam.users().filter((x) => x.managerId === u.id).map((x) => ({ id: x.id, name: x.name })), manageable: canManage(ctx, u) && u.id !== ctx.user.id, sessions: canManage(ctx, u) ? iam.sessionsOf(u.id) : undefined })),
    roles: Object.entries(iam.roles()).map(([id, role]) => ({ id, ...role, home: homeOf(id, role), grantable: iam.canGrant(id, ctx.permissions), holders: iam.users().filter((u) => u.role === id).length })),
    teams: ctx.teams.filter((t) => ctx.scope.has(t.id) || ctx.permissions.has('teams.manage')).map((t) => ({ ...t, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › '), leaders: (t.leaderIds ?? []).map((id) => ({ id, name: userName(id) })), members: iam.users().filter((u) => u.teamId === t.id).length })),
    permissions: PERMISSIONS,
    // Who someone can report to: anyone with access, whatever their team (for those who manage people).
    managers: ctx.permissions.has('users.manage') ? iam.users().filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name, title: u.title ?? '' })).sort((a, b) => a.name.localeCompare(b.name)) : [],
    mail: resetReady().ready,
  }));
  /** May this person change `target`: in their scope, and holding the role they hold. */
  const canManage = (ctx, target) => ctx.permissions.has('users.manage') && (ctx.permissions.has('scope.all') || ctx.scope.has(target.teamId)) && iam.canGrant(target.role, ctx.permissions);
  r('POST', '/api/people', perm('users.manage'), async (req, ctx, body) => {
    const role = String(body?.role ?? 'se');
    if (!iam.canGrant(role, ctx.permissions)) throw fail(403, 'You cannot give a role with permissions you do not hold.');
    const teamId = String(body?.teamId ?? '');
    if (!teams.get(teamId)) throw fail(400, 'Choose their team.');
    if (!ctx.permissions.has('scope.all')) needTeam(ctx.scope, teamId);
    const { user, temporary } = await iam.create({ email: body?.email, name: body?.name, title: body?.title, role, teamId, password: String(body?.password ?? '') });
    record(ctx, req, 'user.create', user.email, { role, team: teams.get(teamId)?.name });
    // A welcome email when the server can send one: where to sign in, and how to set a password with
    // "Forgot your password?". The one-time password itself is never emailed.
    let welcomed = false;
    if (body?.sendWelcome && resetReady().ready) {
      try {
        await sendMail(user.email, systemEmail({ subject: 'You have access to the FTR Credits Command Center', lines: [`${ctx.user.name} gave you access to the FTR Credits Command Center as ${iam.roles()[role]?.name ?? role} in ${teams.get(teamId)?.name ?? 'your team'}.`, 'To set your password, open the link below, choose "Forgot your password?" and enter this address: a link to choose your password follows. Or sign in with the one-time password your Admin gives you.'], button: { label: 'Open the command center', url: `${linkBase()}/#/forgot?email=${encodeURIComponent(user.email)}` }, footer: 'The command center is for internal use only. You will be asked to accept its terms of use when you first sign in.' }));
        welcomed = true;
        record(ctx, req, 'user.welcome', user.email);
      } catch (error) {
        log(`[welcome] not sent to a new person: ${error.message}`);
      }
    }
    return { user: publicUser(user), temporary, welcomed };
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
    const teamBefore = target.teamId;
    const managerBefore = target.managerId ?? null;
    if (body?.managerId) {
      const boss = iam.byId(String(body.managerId));
      if (!boss || boss.active === false) throw fail(400, 'Choose someone who has access as the one they report to.');
    }
    const user = iam.update(target.id, { name: body?.name, title: body?.title, role: body?.role, teamId: body?.teamId, active: body?.active, managerId: body?.managerId });
    // Accounts follow their accountable SE: moved to another team, theirs go with them.
    const followed = user.teamId !== teamBefore && user.active !== false ? followOwner(ctx, req, outOfStep().filter(({ owner }) => owner.id === user.id), 'their accountable SE changed team') : [];
    if (user.active === false) {
      calc.forget(user.id);
      passwordResets.revokeUser(user.id);
    }
    record(ctx, req, 'user.update', user.email, { changed: Object.keys(body ?? {}), ...(followed.length ? { accountsMoved: followed.length } : {}), ...((user.managerId ?? null) !== managerBefore ? { reportsTo: iam.byId(user.managerId)?.email ?? null, reportedTo: iam.byId(managerBefore)?.email ?? null } : {}) });
    return { user: publicUser(user), accountsMoved: followed.length };
  });
  r('POST', '/api/people/:id/reset', perm('users.manage'), async (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    const temporary = await iam.resetPassword(target.id);
    passwordResets.revokeUser(target.id);
    calc.forget(target.id);
    record(ctx, req, 'user.reset', target.email);
    return { temporary };
  });
  /**
   * Bulk onboarding: people and the team structure from one sheet (rows of email, name, title, role, team path, leads).
   * `dryRun` checks every row and says what would happen; otherwise the rows that check out are created, teams in their
   * paths made where missing (Executives and Admins), leaders set, and each new person's temporary password returned
   * once, for the sheet the browser makes. Nothing about the passwords is kept or emailed.
   */
  r('POST', '/api/people/import', perm('users.manage'), async (req, ctx, body) => {
    const input = Array.isArray(body?.rows) ? body.rows.slice(0, 1001) : [];
    if (!input.length) throw fail(400, 'The sheet has no people in it.');
    if (input.length > 1000) throw fail(413, 'At most 1,000 people at a time.');
    const dryRun = body?.dryRun !== false;
    const canTeams = ctx.permissions.has('teams.manage');
    const roleByKey = new Map();
    for (const [id, role] of Object.entries(iam.roles())) {
      roleByKey.set(id.toLowerCase(), id);
      roleByKey.set(role.name.toLowerCase(), id);
    }
    roleByKey.set('sales engineer', 'se');
    roleByKey.set('se', 'se');
    const all = () => teams.list();
    const split = (pathText) => String(pathText ?? '').split(/\s*(?:>|›|\/|\\)\s*/).map((x) => clean(x, 80)).filter(Boolean).slice(0, 8);
    /** The team at the end of a path: each step a team of that name below the one before (or a top team). */
    const resolve = (parts, planned) => {
      let parentId = null;
      const missing = [];
      let id = null;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i].toLowerCase();
        const found = all().find((t) => (t.parentId ?? null) === parentId && t.name.toLowerCase() === name) ?? (planned.get(`${parentId}\u0000${name}`) ? { id: planned.get(`${parentId}\u0000${name}`) } : null);
        if (!found) {
          missing.push(parts.slice(i));
          return { id: null, missing: parts.slice(i), parentId };
        }
        parentId = found.id;
        id = found.id;
      }
      return { id, missing, parentId };
    };
    const yes = (v) => /^(y|yes|true|1|x|leader|leads)$/i.test(String(v ?? '').trim());
    const seen = new Set();
    const planned = new Map(); // `${parentId}\0${name}` -> new team id (on commit) or a placeholder (dry run)
    const results = [];
    const createdTeams = [];
    for (let i = 0; i < input.length; i++) {
      const row = input[i] ?? {};
      const email = clean(row.email, 254).toLowerCase();
      const out = { row: i + 2, email, name: clean(row.name, 120), title: clean(row.title, 120), team: '', role: '', leads: yes(row.leads), status: 'create', message: '', newTeams: [] };
      results.push(out);
      const err = (m) => Object.assign(out, { status: 'error', message: m });
      if (!/^(?=[^]{3,254}$)[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) {
        err('Not an email address.');
        continue;
      }
      if (seen.has(email)) {
        err('This email is in the sheet twice.');
        continue;
      }
      seen.add(email);
      if (iam.byEmail(email)) {
        Object.assign(out, { status: 'exists', message: 'Already has access: left as they are.' });
        continue;
      }
      const roleId = roleByKey.get(String(row.role ?? '').trim().toLowerCase() || 'se');
      if (!roleId) {
        err(`No role called "${clean(row.role, 60)}".`);
        continue;
      }
      out.role = iam.roles()[roleId].name;
      if (!iam.canGrant(roleId, ctx.permissions)) {
        err(`You cannot give the ${out.role} role.`);
        continue;
      }
      const parts = split(row.team);
      if (!parts.length) {
        err('Give their team, e.g. Global SE > EMEA SE.');
        continue;
      }
      out.team = parts.join(' › ');
      let { id: teamId, missing, parentId } = resolve(parts, planned);
      if (missing.length) {
        if (!canTeams) {
          err(`No team "${missing[0]}" there: an Executive or Admin can create teams.`);
          continue;
        }
        // Made only where this person may make teams: under a team they work in (a top-level team: all teams).
        if (!ctx.permissions.has('scope.all') && !(parentId && (String(parentId).startsWith('new:') || ctx.scope.has(parentId)))) {
          err(`No team "${missing[0]}" there, and it would be outside the teams you work in: an Admin can create it.`);
          continue;
        }
        for (const name of missing) {
          const key = `${parentId}\u0000${name.toLowerCase()}`;
          if (dryRun) {
            planned.set(key, `new:${key}`);
            parentId = `new:${key}`;
          } else {
            const t = teams.create({ name, parentId });
            createdTeams.push(teamPath(teams.list(), t.id).map((x) => x.name).join(' › '));
            planned.set(key, t.id);
            parentId = t.id;
          }
          out.newTeams.push(name);
        }
        teamId = parentId;
      }
      if (!dryRun && !ctx.permissions.has('scope.all') && !scopeOf(ctx.user, ctx.permissions, teams.list()).has(teamId)) {
        err('That team is not one you work in.');
        continue;
      }
      if (dryRun && !String(teamId).startsWith('new:') && !ctx.permissions.has('scope.all') && !ctx.scope.has(teamId)) {
        err('That team is not one you work in.');
        continue;
      }
      if (out.leads && !canTeams) {
        err('Only Executives and Admins choose team leaders.');
        continue;
      }
      if (dryRun) continue;
      try {
        const { user, temporary } = await iam.create({ email, name: out.name, title: out.title, role: roleId, teamId });
        if (out.leads) {
          const t = teams.get(teamId);
          teams.update(teamId, { leaderIds: [...new Set([...(t.leaderIds ?? []), user.id])] });
        }
        Object.assign(out, { status: 'created', temporary, id: user.id });
      } catch (error) {
        err(error.message);
      }
    }
    const count = (st) => results.filter((x) => x.status === st).length;
    const summary = { create: count('create'), created: count('created'), exists: count('exists'), errors: count('error'), newTeams: dryRun ? [...new Set(results.flatMap((x) => x.newTeams.length ? [x.team] : []))] : createdTeams };
    if (!dryRun) record(ctx, req, 'user.import', '', { created: summary.created, exists: summary.exists, errors: summary.errors, teams: createdTeams.length });
    return { dryRun, summary, rows: results, signInAt: linkBase() || '' };
  });
  /** A welcome email to someone just added (bulk import asks for it per person, after creating them). */
  r('POST', '/api/people/:id/welcome', perm('users.manage'), async (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    if (!resetReady().ready) throw fail(409, 'The email server is not set up and tested yet.');
    await sendMail(target.email, systemEmail({ subject: 'You have access to the FTR Credits Command Center', lines: [`${ctx.user.name} gave you access to the FTR Credits Command Center as ${iam.roles()[target.role]?.name ?? target.role} in ${teams.get(target.teamId)?.name ?? 'your team'}.`, 'To set your password, open the link below, choose "Forgot your password?" and enter this address. Or sign in with the temporary password you were given.'], button: { label: 'Open the command center', url: `${linkBase()}/#/forgot?email=${encodeURIComponent(target.email)}` }, footer: 'The command center is for internal use only. You will be asked to accept its terms of use when you first sign in.' }));
    record(ctx, req, 'user.welcome', target.email);
    return { ok: true };
  });

  return { canManage };
}
