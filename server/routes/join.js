import { clean, passwordProblem, publicUser } from '../iam.js';
import { systemEmail } from '../mailer.js';
import { resetAllowed } from '../password-reset.js';
import { ADMIN_ONLY, teamPath } from '../rbac.js';
import { fail } from '../store.js';

/**
 * Joining by oneself: someone with a work address (checkmarx.com by default) who has no password, or forgot it, asks
 * from the sign-in page. The answer on the page is always the same; the email says the rest:
 *   - they already have access: a link to choose a new password (the password itself is never kept, so never sent);
 *   - their access is turned off, or may not be reset by email: ask an Admin;
 *   - they are new: a one-time link (30 minutes) proving the address is theirs, to give their name, choose their
 *     team from the structure and their role from the roles open to joining, and a password. They are signed in.
 * Whoever manages people then reviews those who joined (People: their team and role, Approve or turn off).
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers).
 */
export const JOIN_ASKED = 'Check your inbox. If the address may join, an email is on its way: a link to finish joining, or, if you already have access, a link to choose a new password. It works once, for 30 minutes. Nothing arrived? Check spam, or ask an Admin.';
const JOIN_DEAD = 'This link no longer works: it was used, a newer one was sent, or it is more than 30 minutes old. Ask for a new one.';
/** Roles that can never be chosen when joining: they manage people, roles, teams, or see every team. */
const NEVER = ['users.manage', 'roles.manage', 'teams.manage', 'scope.all', ...ADMIN_ONLY];

export function registerJoin(d) {
  const { audit, cookie, iam, idleMs, ipOf, joinLinks, linkBase, log, managesPeople, passwordResets, perm, r, record, resetPolicy, sendMail, settings, teams, utc } = d;

  /** May this role be chosen by someone joining? Never one that manages people or sees everything. */
  const openable = (id) => {
    const role = iam.roles()[id];
    return Boolean(role) && id !== 'admin' && !NEVER.some((p) => (role.permissions ?? []).includes(p));
  };
  /** The Admin's choice (Settings → People → Sign-in), or the defaults where nothing is set yet. */
  const rules = () => {
    const v = settings.value.selfJoin ?? {};
    const domains = Array.isArray(v.domains) && v.domains.length ? v.domains : ['checkmarx.com'];
    const chosen = Array.isArray(v.roles) ? v.roles : Object.keys(iam.roles());
    return { enabled: v.enabled !== false, domains, roles: chosen.filter(openable) };
  };
  const ready = () => {
    const missing = [];
    const k = rules();
    if (!k.enabled) missing.push('Turned off in Settings → People → Sign-in.');
    if (!d.mailReady()) missing.push('The email server is not set up and tested (Settings → Email server).');
    if (!linkBase()) missing.push('PUBLIC_URL is not set to the https address people use.');
    if (!k.roles.length) missing.push('No role is open to joining.');
    return { ready: !missing.length, missing };
  };
  const domainOf = (email) => String(email).split('@')[1] ?? '';
  const allowedDomain = (email) => rules().domains.includes(domainOf(email));
  const linkKey = (email) => `join:${email}`;
  const rolesView = () => rules().roles.map((id) => ({ id, name: iam.roles()[id].name, description: iam.roles()[id].description ?? '' }));
  const teamsView = () => {
    const all = teams.list();
    return all.map((t) => ({ id: t.id, path: teamPath(all, t.id).map((x) => x.name).join(' › ') })).sort((a, b) => a.path.localeCompare(b.path));
  };

  r('GET', '/api/auth/join', () => ({ available: ready().ready, domains: rules().domains }));

  /** What is emailed: by whether the address has access. Sent after the answer, so the timing says nothing either. */
  async function answer(email, ip) {
    const user = iam.byEmail(email);
    const say = (subject, lines, button = null) => sendMail(email, systemEmail({ subject, lines, button, footer: 'You get this because someone asked to join the FTR Credits Command Center with this address from the sign-in page. Did not ask? Ignore it: nothing changes.' }));
    if (user) {
      if (user.active === false) {
        audit.record({ action: 'join.asked', target: email, ip, details: { outcome: 'access turned off' } });
        return say('Your access to the FTR Credits Command Center', [`You already have an account (${email}), but its access is turned off.`, 'Ask an Admin to turn it on again.']);
      }
      if (!resetAllowed(resetPolicy(), { isAdmin: managesPeople(user) }) || !passwordResets.maySend(user.id)) {
        audit.record({ action: 'join.asked', target: email, ip, details: { outcome: 'has access: no link (by email not allowed, or asked too often)' } });
        return say('Your access to the FTR Credits Command Center', [`You already have an account (${email}).`, 'Sign in with your password, or with single sign-on if your organisation uses it. Forgotten? Ask an Admin for a new one-time password.']);
      }
      const { token, exp } = passwordResets.issue(user);
      audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'join.asked', ip, details: { outcome: 'has access: link to a new password', until: utc(exp) } });
      return say('You already have access: choose a new password', [`You already have an account on the FTR Credits Command Center (${email}).`, 'Passwords are never kept in a form anyone can read, so it cannot be sent to you. Choose a new one with this link: it works once, for 30 minutes.'], { label: 'Choose a new password', url: `${linkBase()}/#/reset?token=${token}` });
    }
    if (!joinLinks.maySend(linkKey(email))) return audit.record({ action: 'join.asked', target: email, ip, details: { outcome: 'new: asked too often' } });
    const { token, exp } = joinLinks.issue({ id: linkKey(email), passwordHash: 'join' });
    audit.record({ action: 'join.asked', target: email, ip, details: { outcome: 'new: link to join', until: utc(exp) } });
    return say('Finish joining the FTR Credits Command Center', [`Welcome. To finish joining with ${email}, open this link: give your name, choose your team and your role, and a password.`, 'It works once, for 30 minutes. An Admin reviews everyone who joins.'], { label: 'Finish joining', url: `${linkBase()}/#/join?token=${token}` });
  }

  r('POST', '/api/auth/join', (req, ctx, body) => {
    const ip = ipOf(req);
    if (!ready().ready) throw fail(409, 'Joining by yourself is not available on this server yet: ask an Admin to add you.');
    if (joinLinks.ipBlocked(ip)) throw fail(429, 'Too many requests from this address. Wait a quarter of an hour.');
    joinLinks.noteIp(ip);
    const email = clean(body?.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter your work email address.');
    // Which domains may join is no secret: said on the page, so a personal address gets a plain answer.
    if (!allowedDomain(email)) throw fail(400, `Use your ${rules().domains.map((x) => `@${x}`).join(' or ')} address.`);
    setImmediate(() => answer(email, ip).catch((error) => log(`[join] ${error.message}`)));
    return { message: JOIN_ASKED };
  });

  /** The link's address, while it works and nobody has joined with it meanwhile. */
  const liveLink = (req, token) => {
    const ip = ipOf(req);
    if (joinLinks.ipBlocked(ip)) throw fail(429, 'Too many requests from this address. Wait a quarter of an hour.');
    const hit = joinLinks.check(token, (id) => ({ id, passwordHash: 'join' }));
    const email = hit ? String(hit.id).slice('join:'.length) : '';
    if (!hit || !allowedDomain(email) || !ready().ready) {
      joinLinks.noteIp(ip);
      throw fail(400, JOIN_DEAD);
    }
    if (iam.byEmail(email)) throw fail(409, 'This address has joined already: sign in, or use "Forgot your password?".');
    return email;
  };
  r('POST', '/api/auth/join/check', (req, ctx, body) => {
    const email = liveLink(req, body?.token);
    return { email, name: email.split('@')[0].split(/[._-]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), teams: teamsView(), roles: rolesView() };
  });
  r('POST', '/api/auth/join/confirm', async (req, ctx, body, res) => {
    const token = String(body?.token ?? '');
    const email = liveLink(req, token);
    const name = clean(body?.name, 120);
    if (!name) throw fail(400, 'Give your name.');
    const teamId = String(body?.teamId ?? '');
    if (!teams.get(teamId)) throw fail(400, 'Choose your team.');
    const role = String(body?.role ?? '');
    if (!rules().roles.includes(role)) throw fail(400, 'Choose your role from the list.');
    const problem = passwordProblem(String(body?.password ?? ''), email);
    if (problem) throw fail(400, problem);
    // The link is spent first: a second press of the button cannot make a second person.
    joinLinks.consume(token);
    const { user } = await iam.create({ email, name, title: clean(body?.title, 120), role, teamId, password: String(body.password) });
    const at = new Date().toISOString();
    // Their own password: no first change asked. Joined, and waiting for someone who manages people to review it.
    Object.assign(user, { mustChangePassword: false, passwordChangedAt: at, joined: { at, teamId, role, reviewedAt: null, reviewedBy: null } });
    user.lastSignInAt = at;
    user.lastSignInMethod = 'password';
    iam.save();
    const ip = ipOf(req);
    audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'user.join', target: user.email, ip, details: { team: teams.get(teamId)?.name, role: iam.roles()[role]?.name } });
    const { token: session } = iam.openSession(user.id, { idleMs, ip, agent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', cookie(session, Math.floor(idleMs / 1000), req));
    return { ok: true };
  });

  // ---- Reviewing those who joined (People) and the rules (Settings → People → Sign-in) ------------------------------
  /** Approved: their team and role are right (changed first on People, as for anyone, where they were not). */
  r('POST', '/api/people/:id/approve', perm('users.manage'), (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !d.canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    if (!target.joined) throw fail(400, 'Only someone who joined by themselves is approved.');
    target.joined = { ...target.joined, reviewedAt: new Date().toISOString(), reviewedBy: ctx.user.name };
    iam.save();
    record(ctx, req, 'user.join.approve', target.email, { team: teams.get(target.teamId)?.name, role: iam.roles()[target.role]?.name, asked: { team: teams.get(target.joined.teamId)?.name, role: iam.roles()[target.joined.role]?.name } });
    return { user: publicUser(target) };
  });
  r('GET', '/api/settings/join', perm('users.manage'), (req, ctx) => {
    const k = rules();
    return { ...k, ready: ready(), canChange: ctx.permissions.has('settings.manage'), allRoles: Object.entries(iam.roles()).map(([id, role]) => ({ id, name: role.name, open: openable(id) })) };
  });
  r('PUT', '/api/settings/join', perm('settings.manage'), (req, ctx, body) => {
    const next = { ...rules() };
    if (body?.enabled !== undefined) next.enabled = body.enabled === true;
    if (body?.domains !== undefined) {
      const list = (Array.isArray(body.domains) ? body.domains : String(body.domains).split(/[\s,;]+/)).map((x) => String(x).trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
      if (!list.length || list.some((x) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x))) throw fail(400, 'Give one or more email domains, such as checkmarx.com.');
      next.domains = [...new Set(list)].slice(0, 10);
    }
    if (body?.roles !== undefined) {
      const list = (Array.isArray(body.roles) ? body.roles : []).map(String);
      const refused = list.filter((id) => !openable(id));
      if (refused.length) throw fail(400, 'A role that manages people, roles or teams, or sees every team, cannot be chosen when joining.');
      next.roles = list;
    }
    settings.value.selfJoin = next;
    settings.save();
    record(ctx, req, 'settings.join', next.enabled ? 'on' : 'off', { domains: next.domains, roles: next.roles.map((id) => iam.roles()[id]?.name ?? id) });
    return { ok: true };
  });
}
