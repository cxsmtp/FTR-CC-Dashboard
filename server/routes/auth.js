import { send } from '../http.js';
import { clean, publicUser } from '../iam.js';
import { systemEmail } from '../mailer.js';
import { maskEmail, RESET_TTL_MS, resetAllowed } from '../password-reset.js';
import { homeOf, teamPath } from '../rbac.js';
import { mergeSso } from '../sso.js';
import { fail } from '../store.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Single sign-on, who you are (/api/me), the first steps (terms, own password) and forgotten passwords.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerAuth(d) {
  const {
    audit, brandingView, calc, config, cookie, iam, idleMs, ipOf, linkBase, log, managesPeople, ownSelf,
    passwordResets, perm, r, record, RESET_ASKED, RESET_DEAD, resetPolicy, resetReady, resetsInFlight,
    sendMail, settings, signedIn, sso, supportChannel, teams, terms, utc, VERSION, versionLabel,
  } = d;
  // ---- Forgot your password? A one-time link to the account's own email (server/password-reset.js) ------------------
  r('GET', '/api/auth/reset', () => ({ available: resetReady().ready }));
  r('GET', '/api/auth/sso', () => ({ enabled: sso.ready(), label: sso.config().label, passwordsForAdminsOnly: sso.ready() && sso.config().passwordSignIn === 'admins' }));
  r('GET', '/saml/login', async (req, ctx, body, res) => send(res, 302, '', { Location: await sso.loginUrl() }));
  r('GET', '/saml/metadata', (req, ctx, body, res) => send(res, 200, sso.metadata(), { 'Content-Type': 'application/samlmetadata+xml; charset=utf-8' }));
  r('GET', '/api/settings/sso', perm('security.sso'), () => ({ ...sso.view(), roles: Object.entries(iam.roles()).filter(([id, role]) => id !== 'admin' && !role.permissions.includes('users.manage')).map(([id, role]) => ({ id, name: role.name })), teams: teams.list().map((t) => ({ id: t.id, path: teamPath(teams.list(), t.id).map((x) => x.name).join(' › ') })) }));
  r('PUT', '/api/settings/sso', perm('security.sso'), (req, ctx, body) => {
    settings.value.sso = mergeSso(settings.value.sso ?? {}, body ?? {}, { roles: iam.roles(), teams: teams.list() });
    settings.save();
    record(ctx, req, 'settings.sso', settings.value.sso.enabled ? 'on' : 'off', { changed: Object.keys(body ?? {}) });
    return r2sso();
  });
  const r2sso = () => sso.view();

  /** The identity provider's answer (a form POST from its site): checked, then the person is signed in. */
  async function samlAcs(req, res) {
    const ip = ipOf(req);
    let text = '';
    try {
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) throw fail(413, 'Too large.');
        text += chunk;
      }
    } catch (error) {
      return send(res, error.status ?? 400, 'Bad request', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const page = (title, message, target = '/#/login') =>
      send(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${message ? 5 : 0};url=${target}"><title>${title}</title><link rel="stylesheet" href="/app.css"></head><body><div class="wizard"><div class="panel"><h1 class="serif">${title}</h1><p class="muted">${message ? message.replace(/[&<>"']/g, '') : 'Signing you in…'}</p><p><a href="${target}">Continue</a></p></div></div></body></html>`, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
    let who;
    try {
      who = await sso.verify(new URLSearchParams(text).get('SAMLResponse'));
    } catch (error) {
      audit.record({ action: 'auth.sso.refused', ip, details: { error: error.message } });
      return page('Single sign-on failed', `${error.message} Ask an Admin, or sign in with your password if you have one.`);
    }
    let user = iam.byEmail(who.email);
    if (!user && sso.config().jit) {
      const c = sso.config();
      try {
        ({ user } = await iam.create({ email: who.email, name: who.name || who.email.split('@')[0], role: c.jitRole, teamId: c.jitTeamId }));
        Object.assign(user, { mustChangePassword: false, ssoCreated: true });
        iam.save();
        audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'user.create.sso', ip, details: { role: c.jitRole, team: teams.get(c.jitTeamId)?.name } });
      } catch (error) {
        return page('Single sign-on failed', error.message);
      }
    }
    if (!user || user.active === false) {
      audit.record({ action: 'auth.sso.refused', target: who.email, ip, details: { why: user ? 'access turned off' : 'no access' } });
      return page('No access yet', 'You signed in with the identity provider, but you do not have access to the command center. Ask an Admin to invite you.');
    }
    // A password chosen through SSO is not needed: someone made by an Admin and signing in with SSO need not set one.
    if (user.mustChangePassword) {
      user.mustChangePassword = false;
      iam.save();
    }
    user.lastSignInAt = new Date().toISOString();
    user.lastSignInMethod = 'sso';
    iam.save();
    const { token } = iam.openSession(user.id, { idleMs, ip, agent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', cookie(token, Math.floor(idleMs / 1000), req));
    audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'auth.sso.signin', ip });
    // A page of this site moves on, so the browser sends the new (SameSite=Strict) cookie with the next request.
    return page('Signed in', '', '/#/');
  }
  async function sendResetLink(email, ip) {
    const user = iam.byEmail(email);
    const why = !user ? 'no account has that address' : user.active === false ? 'the account is turned off' : !resetAllowed(resetPolicy(), { isAdmin: managesPeople(user) }) ? 'resetting by email is not allowed for this account' : !resetReady().ready ? 'email or PUBLIC_URL is not set up' : !passwordResets.maySend(user.id) ? 'too many links for this account in the last hour' : '';
    if (why) return audit.record({ action: 'auth.reset.refused', target: user ? user.email : '', details: { why }, ip });
    const { token, exp } = passwordResets.issue(user);
    // The secret travels after #: browsers never send that part to a server, nor in a Referer.
    const link = `${linkBase()}/#/reset?token=${token}`;
    try {
      await sendMail(user.email, systemEmail({ subject: 'Reset your FTR Credits Command Center password', lines: [`Someone, hopefully you, asked to reset the password of ${user.email} on the FTR Credits Command Center.`, 'To choose a new password, open the link below. It works once, for 30 minutes.'], facts: [['Asked from', ip || 'unknown'], ['Asked at', utc(Date.now())], ['Link works until', utc(exp)]], button: { label: 'Choose a new password', url: link }, footer: 'Did not ask for this? Ignore this email: your password stays as it is and the link stops working by itself. If it keeps happening, tell an Admin.' }));
      audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'auth.reset.sent', ip, details: { until: utc(exp) } });
    } catch (error) {
      passwordResets.revokeUser(user.id);
      audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'auth.reset.failed', ip, details: { error: error.message } });
    }
  }
  r('POST', '/api/auth/forgot', (req, ctx, body) => {
    const ip = ipOf(req);
    if (passwordResets.ipBlocked(ip)) throw fail(429, 'Too many requests from this address. Wait a quarter of an hour.');
    passwordResets.noteIp(ip);
    const email = clean(body?.email, 254).toLowerCase();
    if (!email) throw fail(400, 'Enter the email address you sign in with.');
    // Always the same answer, and the work after it, so neither the words nor the timing say whether the address has an account.
    setImmediate(() => sendResetLink(email, ip).catch((error) => log(`[password reset] ${error.message}`)));
    return { message: RESET_ASKED };
  });
  const liveLink = (req, token) => {
    const ip = ipOf(req);
    if (passwordResets.ipBlocked(ip)) throw fail(429, 'Too many requests from this address. Wait a quarter of an hour.');
    const user = passwordResets.check(token, (id) => {
      const u = iam.byId(id);
      return u && { ...u, disabled: u.active === false };
    });
    if (!user || !resetAllowed(resetPolicy(), { isAdmin: managesPeople(user) })) {
      passwordResets.noteIp(ip);
      throw fail(400, RESET_DEAD);
    }
    return user;
  };
  r('POST', '/api/auth/reset/check', (req, ctx, body) => {
    const user = liveLink(req, body?.token);
    return { email: maskEmail(user.email), minutes: Math.round(RESET_TTL_MS / 60_000) };
  });
  r('POST', '/api/auth/reset/confirm', async (req, ctx, body) => {
    const token = String(body?.token ?? '');
    const user = liveLink(req, token);
    if (resetsInFlight.has(user.id)) throw fail(409, 'This link is already being used. Wait a moment.');
    resetsInFlight.add(user.id);
    try {
      await iam.setPasswordFromLink(user.id, body?.password);
      passwordResets.consume(token);
      passwordResets.revokeUser(user.id);
      iam.endSessionsOf(user.id);
      calc.forget(user.id);
      audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'auth.reset.done', ip: ipOf(req) });
      sendMail(user.email, systemEmail({ subject: 'Your FTR Credits Command Center password was changed', lines: [`The password of ${user.email} was just changed with a reset link sent to this address, and every place it was signed in was signed out.`], facts: [['Changed from', ipOf(req) || 'unknown'], ['Changed at', utc(Date.now())]], footer: 'Was this not you? Tell an Admin at once: they can turn the account off and set a new password.' })).catch((error) => log(`[password reset] confirmation not sent: ${error.message}`));
      return { email: user.email };
    } finally {
      resetsInFlight.delete(user.id);
    }
  });

  r('GET', '/api/me', signedIn, (req, ctx) => {
    const team = teams.get(ctx.user.teamId);
    const scopeTeams = ctx.teams.filter((t) => ctx.scope.has(t.id)).map((t) => ({ id: t.id, name: t.name, region: t.region, parentId: t.parentId, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › '), leaderIds: t.leaderIds }));
    return {
      // Only what the page uses about the person signed in (#11): not their lock, status or record dates.
      user: (({ id, name, email, title, role, teamId, mustChangePassword, lastSignInAt, signIn }) => ({ id, name, email, title, role, teamId, mustChangePassword, lastSignInAt, signIn }))(publicUser(ctx.user)),
      csrf: ctx.session.csrf,
      role: { id: ctx.user.role, name: iam.roles()[ctx.user.role]?.name ?? ctx.user.role, home: homeOf(ctx.user.role, iam.roles()[ctx.user.role]) },
      permissions: [...ctx.permissions],
      team: team ? { id: team.id, name: team.name, path: teamPath(ctx.teams, team.id).map((x) => x.name).join(' › ') } : null,
      leads: ctx.teams.filter((t) => t.leaderIds?.includes(ctx.user.id)).map((t) => t.id),
      scopeTeams,
      terms: { accepted: terms.acceptedBy(ctx.user.id), version: terms.version, at: terms.doc?.value?.users?.[ctx.user.id]?.at ?? null },
      guideSeen: Boolean(ctx.user.guideSeenAt),
      organisationName: settings.value.organisationName,
      version: VERSION,
      versionLabel: versionLabel(),
      // What this installation is marked as (Settings → Updates): 'staging' shows on every page.
      stage: d.updates.stage ?? '',
      prefs: ctx.user.prefs ?? {},
      theme: { mode: settings.value.theme?.mode ?? 'light', accent: settings.value.theme?.accent ?? 'aurora' },
      branding: brandingView(),
      support: supportChannel(),
      picture: ctx.user.picture ? `/api/people/${ctx.user.id}/picture?v=${encodeURIComponent(ctx.user.picture.at)}` : null,
      sessions: iam.sessionsOf(ctx.user.id),
      impersonating: ctx.impersonator ? { by: { name: ctx.impersonator.name, email: ctx.impersonator.email }, until: new Date(ctx.session.actAs.until).toISOString() } : null,
    };
  });
  r('POST', '/api/me/password', ownSelf, async (req, ctx, body) => {
    await iam.setPassword(ctx.user.id, body?.current, body?.next);
    passwordResets.revokeUser(ctx.user.id);
    iam.endSessionsOf(ctx.user.id, { except: ctx.session.id });
    record(ctx, req, 'auth.password');
    const file = path.join(config.dataDir, 'initial-admin-password.txt');
    if (fs.existsSync(file) && ctx.user.role === 'admin') fs.rmSync(file, { force: true });
    return { ok: true };
  });
  r('GET', '/api/terms', () => ({ version: terms.version, text: terms.text }));
  r('POST', '/api/terms/accept', ownSelf, (req, ctx) => {
    if (ctx.user.mustChangePassword) throw fail(403, 'Choose your own password first.');
    terms.accept(ctx.user.id, ipOf(req));
    record(ctx, req, 'terms.accept', '', { version: terms.version, hash: terms.hash });
    return { ok: true };
  });
  // Themes: each person's own look (kept with them, on every device), else the organisation's.
  const THEME_MODES = ['light', 'dark', 'system'];
  const ACCENTS = ['aurora', 'command'];

  return { ACCENTS, samlAcs, THEME_MODES };
}
