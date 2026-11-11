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
import { suggestCurrency } from './currency.js';
import { changesOf, customerFigures, preferencesPatch, readCustomerVersion } from './customer-version.js';
import { Sso, mergeSso } from './sso.js';
import { UpdateService, VersionStore } from './updates.js';
import { describeBackup, listBackups, readBackup, restoreBackup, writeBackupTo } from './backup.js';
import { recoverDataDir } from './recover.js';
import { PasswordResets, RESET_POLICIES, RESET_TTL_MS, maskEmail, resetAllowed } from './password-reset.js';
import { MailError, Secrets, mergeSmtp, publicSmtp, smtpFingerprint, smtpTransport, systemEmail } from './mailer.js';
import { HSTS_AGES, HttpsManager } from '../vendor/mz/src/https-manager.js';
import { AcmeService, CHALLENGE_PREFIX, RENEW_DAYS, cleanNames, validName } from '../vendor/mz/src/acme.js';
import { CalculatorService, DEFAULT_CXONE_HOSTS, DEFAULT_GIT_HOSTS, MZ_SOURCE, calculatorPage, impactSettings, summary } from './calculator.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
/** The version as people see it, MZ's way: CC-01.01.00. */
export const versionLabel = (v = VERSION) => `CC-${String(v).split('.').map((n) => n.padStart(2, '0')).join('.')}`;
const COOKIE = 'cc_session';
const BODY_LIMIT = 256 * 1024;
const CALC_LIMIT = 40 * 1024 * 1024;

export function createApp(config, { log: baseLog = console.log, calculatorService = null, mailTransport = smtpTransport, updateService = null } = {}) {
  // Errors kept for the troubleshooting report (the last 50, without request bodies).
  const recentErrors = [];
  const log = (line) => {
    if (/error|\!|failed/i.test(String(line))) recentErrors.push({ at: new Date().toISOString(), line: String(line).slice(0, 300) }), recentErrors.splice(0, Math.max(0, recentErrors.length - 50));
    baseLog(line);
  };
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  // Self-healing start: a data file that cannot be read is brought back from the newest backup that has it.
  const backupDir = config.backupDir || path.join(config.dataDir, 'backups');
  const backupPassphrase = String(config.env?.BACKUP_PASSPHRASE ?? '');
  const recovered = recoverDataDir({ dataDir: config.dataDir, backupDir, passphrase: backupPassphrase, log });
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
  const startJobs = [];
  const stopJobs = [];

  // ---- Single sign-on (SAML) --------------------------------------------------------------------------------------
  const sso = new Sso({ settings: () => settings.value.sso, publicUrl: config.publicUrl });
  const isAdminUser = (user) => user.role === 'admin' || iam.permissionsOf({ ...user, active: true }).has('users.manage');

  // ---- HTTPS (CxMissionZero's HttpsManager and Let's Encrypt client, as they are) ------------------------------------
  const httpsManager = new HttpsManager({ dataDir: config.dataDir, env: config.env ?? process.env, log: { log, warn: log } });
  const ACME_DIRECTORY = String(config.env?.ACME_DIRECTORY_URL ?? '').trim();
  const acme = new AcmeService({ dataDir: config.dataDir, https: httpsManager, log: { log, warn: log }, ...(ACME_DIRECTORY ? { directories: { production: ACME_DIRECTORY, staging: ACME_DIRECTORY } } : {}) });
  const LETSENCRYPT_DOMAIN = String(config.env?.LETSENCRYPT_DOMAIN ?? '').trim();
  acme.onEvent((event) => {
    const names = event.names.join(', ');
    if (event.kind === 'issued') {
      audit.record({ action: 'https.letsencrypt.issued', target: names, details: { staging: event.staging, validTo: event.validTo } });
      try {
        if (event.by === 'LETSENCRYPT_DOMAIN' && !event.staging) httpsManager.setMode('https', { system: true, by: "Let's Encrypt" });
        else if (httpsManager.mode === 'http') httpsManager.setMode('both', { by: "Let's Encrypt" });
      } catch (error) {
        log(`! [https] ${error.message}`);
      }
    } else audit.record({ action: 'https.letsencrypt.failed', target: names, details: { error: event.error } });
  });

  // ---- Email (Settings → Email server) and forgotten passwords, as CxMissionZero does them ---------------------
  const secrets = new Secrets(config.dataDir);
  if (!settings.value.smtp && config.smtp?.host) {
    // First start with SMTP_* in the environment: those settings, still to be tested by an Admin.
    settings.value.smtp = { ...mergeSmtp({}, config.smtp), password: secrets.seal(config.smtp.password ?? '') };
    settings.save();
  }
  const smtpNow = () => {
    const kept = settings.value.smtp ?? {};
    return { ...mergeSmtp({}, { ...kept, password: undefined }), password: secrets.open(kept.password) };
  };
  const mailReady = () => {
    const smtp = smtpNow();
    return Boolean(smtp.host) && settings.value.smtpVerified === smtpFingerprint(smtp);
  };
  const resetPolicy = () => (RESET_POLICIES.includes(settings.value.passwordReset) ? settings.value.passwordReset : 'everyone');
  /** Reset links point only at the address set for this server, never at the one a request came in on. */
  const linkBase = () => {
    try {
      const u = new URL(config.publicUrl);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) return u.origin;
    } catch {}
    return '';
  };
  const resetReady = () => {
    const missing = [];
    if (resetPolicy() === 'off') missing.push('Turned off in Settings → Email server.');
    if (!mailReady()) missing.push('The email server is not set up and tested (Settings → Email server).');
    if (!linkBase()) missing.push('PUBLIC_URL is not set to the https address people use.');
    return { ready: !missing.length, policy: resetPolicy(), missing };
  };
  const sendMail = async (to, message) => {
    if (!mailReady()) throw new MailError('The email server is not set up and tested yet (Settings → Email server).', 409);
    return mailTransport.send(smtpNow(), { to, subject: message.subject, text: message.text, html: message.html });
  };
  const passwordResets = new PasswordResets();
  const resetsInFlight = new Set();
  const RESET_ASKED = 'If that address has an account that may reset its password here, a link to choose a new one is on its way. It works once, for 30 minutes. Nothing arrived? Check spam, or ask an Admin.';
  const RESET_DEAD = 'This link no longer works: it was used, a newer one was sent, it is more than 30 minutes old, or the password has changed since. Ask for a new one.';
  const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const managesPeople = (user) => iam.permissionsOf({ ...user, active: true }).has('users.manage');
  // Sign-in attempts: per address and email (a guess at one account), and per address overall (many accounts);
  // the per-account lock in iam.js stops slow guessing. Behind a proxy, set TRUST_PROXY so each person has their address.
  const signInPerAccount = new RateLimit({ max: config.signInPerAccountPerMinute ?? 10, windowMs: 60_000 });
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

  const cookie = (value, maxAge, req) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${config.secureCookies || req?.socket?.encrypted || httpsManager.mode === 'https' ? '; Secure' : ''}; Max-Age=${maxAge}`;

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
    if (sso.ready() && sso.config().passwordSignIn === 'admins' && !isAdminUser(user)) {
      audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'auth.password.refused', ip, details: { why: 'single sign-on only' } });
      throw fail(403, `Use ${sso.config().label}: passwords are kept for Admins.`);
    }
    user.lastSignInMethod = 'password';
    iam.save();
    const { token } = iam.openSession(user.id, { idleMs, ip, agent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', cookie(token, Math.floor(idleMs / 1000), req));
    audit.record({ actor: { id: user.id, email: user.email, name: user.name }, action: 'auth.signin', ip });
    return { ok: true };
  });
  r('POST', '/api/auth/signout', (req, ctx, body, res) => {
    if (ctx) {
      iam.endSession(ctx.token);
      if (!iam.sessions.value || !Object.values(iam.sessions.value.sessions).some((s) => s.userId === ctx.user.id)) calc.forget(ctx.user.id);
      record(ctx, req, 'auth.signout');
    }
    res.setHeader('Set-Cookie', cookie('', 0, req));
    return { ok: true };
  });

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
      versionLabel: versionLabel(),
      prefs: ctx.user.prefs ?? {},
      theme: { mode: settings.value.theme?.mode ?? 'light', accent: settings.value.theme?.accent ?? 'aurora' },
      mz: MZ_SOURCE.label,
    };
  });
  r('POST', '/api/me/password', signedIn, async (req, ctx, body) => {
    await iam.setPassword(ctx.user.id, body?.current, body?.next);
    passwordResets.revokeUser(ctx.user.id);
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
  // Themes: each person's own look (kept with them, on every device), else the organisation's.
  const THEME_MODES = ['light', 'dark', 'system'];
  const ACCENTS = ['aurora', 'ocean', 'emerald', 'sunset', 'royal', 'graphite'];
  r('PUT', '/api/me/prefs', signedIn, (req, ctx, body) => {
    const prefs = { ...(ctx.user.prefs ?? {}) };
    if (body?.mode !== undefined) {
      if (!THEME_MODES.includes(body.mode)) throw fail(400, 'Choose light, dark or system.');
      prefs.mode = body.mode;
    }
    if (body?.accent !== undefined) {
      if (!ACCENTS.includes(body.accent)) throw fail(400, 'Choose one of the themes.');
      prefs.accent = body.accent;
    }
    if (body?.seenVersion !== undefined) prefs.seenVersion = String(body.seenVersion).slice(0, 20);
    ctx.user.prefs = prefs;
    iam.save();
    return { prefs };
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
        salesforceKind: a.salesforceKind,
        salesforceId: a.salesforceId,
        updatedAt: a.updatedAt,
        reportCount: own.length,
        sharedCount: own.filter((x) => x.sharedAt).length,
        lastReportAt: own[0]?.createdAt ?? null,
        sold: a.soldCredits ?? 0,
        salesCount: a.salesCount ?? 0,
        lastSaleAt: a.lastSaleAt ?? null,
        remaining: p ? Math.max(0, Math.round((Number(p.totalCredits) || 0) - (a.soldCredits ?? 0))) : null,
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
      return { id: u.id, name: u.name, title: u.title, role: iam.roles()[u.role]?.name ?? u.role, team: teams.get(u.teamId)?.name ?? '', teamId: u.teamId, accounts: owned.length, withReport: owned.filter((a) => a.primary).length, reports: made.length, shared: made.filter((x) => x.sharedAt).length, missingSalesforce: owned.filter((a) => !a.salesforceUrl).length, credits: sum(owned), sold: owned.reduce((n, a) => n + (a.sold || 0), 0), remaining: owned.reduce((n, a) => n + (a.remaining || 0), 0), lastReportAt: made[0]?.createdAt ?? null };
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
      account: { ...summary(a), teamId: a.teamId, team: teams.get(a.teamId)?.name ?? '', teamPath: teamPath(ctx.teams, a.teamId).map((x) => x.name).join(' › '), ownerId: a.ownerId, owner: userName(a.ownerId), createdById: a.createdById, salesforceUrl: a.salesforceUrl, salesforceKind: a.salesforceKind, salesforceId: a.salesforceId, primaryReportId: a.primaryReportId, cxone: a.cxone ? { tenant: a.cxone.tenant, savedBy: a.cxone.savedBy, savedAt: a.cxone.savedAt, lastReadAt: a.cxone.lastReadAt ?? null } : null, sold: (a.sales ?? []).reduce((n, x) => n + x.credits, 0), remaining: p ? Math.max(0, Math.round(p.totalCredits - (a.sales ?? []).reduce((n, x) => n + x.credits, 0))) : null, impactEnabled: Boolean(a.impactEnabled), impactCurrencyConfirmed: Boolean(a.impactCurrencyConfirmed), impactCurrency: a.impact?.currency ?? 'USD', reportCount: reps.length, sharedCount: reps.filter((x) => x.sharedAt).length, primary: p ? { ...p, how } : null },
      reports: reps,
      sales: [...(a.sales ?? [])].sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.at).localeCompare(String(x.at))),
      members,
      can: { edit: ctx.permissions.has('calculator.use'), share: ctx.permissions.has('reports.share'), deleteAccount: ctx.permissions.has('accounts.delete'), sell: ctx.permissions.has('sales.record'), removeAnySale: ctx.permissions.has('reports.delete'), me: ctx.user.id },
    };
  };
  r('GET', '/api/cc/accounts/:id', ready2, (req, ctx, body, res, url, params) => accountDetail(ctx, params.id));
  /** A currency to suggest for the account's impact, for the SE to confirm. */
  r('GET', '/api/cc/accounts/:id/currency', perm('calculator.use'), (req, ctx, body, res, url, params) => {
    const a = accounts.get(params.id, ctx.scope);
    return suggestCurrency({ accountName: a.name, teamNames: teamPath(ctx.teams, a.teamId).reverse().flatMap((t) => [t.name, t.region].filter(Boolean)), timeZone: String(url.searchParams.get('tz') ?? '').slice(0, 64) });
  });
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
    if (body?.impactCurrency !== undefined) patch.impactCurrency = body.impactCurrency;
    if (body?.impactEnabled !== undefined) patch.impactEnabled = body.impactEnabled === true;
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
  r('POST', '/api/cc/accounts/:id/sales', perm('sales.record'), (req, ctx, body, res, url, params) => {
    const sale = accounts.addSale(params.id, ctx.scope, { credits: body?.credits, date: body?.date, reference: body?.reference, note: body?.note, reportId: body?.reportId }, ctx.user);
    const a = accounts.accounts.meta(params.id);
    record(ctx, req, 'sale.record', a.name, { id: sale.id, credits: sale.credits, date: sale.date, reference: sale.reference, reportId: sale.reportId });
    return accountDetail(ctx, params.id);
  });
  r('DELETE', '/api/cc/accounts/:id/sales/:sale', perm('sales.record'), (req, ctx, body, res, url, params) => {
    const sale = accounts.removeSale(params.id, ctx.scope, params.sale, { user: ctx.user, any: ctx.permissions.has('reports.delete') });
    record(ctx, req, 'sale.remove', accounts.accounts.meta(params.id)?.name ?? '', { id: sale.id, credits: sale.credits, date: sale.date });
    return accountDetail(ctx, params.id);
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
    return { csv: csv(['Account', 'Team', 'Accountable SE', 'Salesforce', 'Salesforce record', 'Primary report', 'Primary is', 'T&R credits', 'Fusion credits', 'Total credits', 'Bundles', 'Credits sold', 'Still needed', 'Sales', 'Last sale', 'Reports', 'Shared with customer', 'Last report'], list.map((a) => [a.name, a.teamPath, a.owner, a.salesforceUrl, a.salesforceId, a.primary?.createdAt ?? '', a.primary?.how ?? '', a.primary?.trCredits ?? '', a.primary?.fusionCredits ?? '', a.primary?.totalCredits ?? '', a.primary?.bundles ?? '', a.sold, a.remaining ?? '', a.salesCount, a.lastSaleAt ?? '', a.reportCount, a.sharedCount, a.lastReportAt ?? ''])), name: 'accounts.csv' };
  });
  r('GET', '/api/export/reports.csv', perm('dashboard.export'), (req, ctx) => {
    const { reports } = rows(ctx);
    record(ctx, req, 'export.reports', '', { rows: reports.length });
    return { csv: csv(['Report', 'Account', 'Team', 'Made by', 'Made at', 'T&R credits', 'Fusion credits', 'Extra %', 'Total credits', 'Bundles', 'Salesforce', 'Shared at', 'Shared by', 'Note'], reports.map((x) => [x.id, x.customer, teamPath(ctx.teams, x.teamId).map((t) => t.name).join(' › '), x.createdBy, x.createdAt, x.trCredits ?? '', x.fusionCredits ?? '', x.extraPercent ?? '', x.totalCredits, x.bundles ?? '', x.salesforceUrl, x.sharedAt ?? '', x.sharedById ? userName(x.sharedById) : '', x.sharedNote])), name: 'reports.csv' };
  });

  // ---- People, teams, roles, settings, audit ---------------------------------------------------------------
  const visiblePeople = (ctx) => (ctx.permissions.has('scope.all') ? iam.users() : peopleInScope(ctx.user, ctx.scope, iam.users()));
  r('GET', '/api/people', ready2, (req, ctx) => ({
    people: visiblePeople(ctx).map((u) => ({ ...publicUser(u), roleName: iam.roles()[u.role]?.name ?? u.role, team: teams.get(u.teamId)?.name ?? '', teamPath: teamPath(ctx.teams, u.teamId).map((t) => t.name).join(' › '), leads: ctx.teams.filter((t) => t.leaderIds?.includes(u.id)).map((t) => t.name), manageable: canManage(ctx, u) && u.id !== ctx.user.id, sessions: canManage(ctx, u) ? iam.sessionsOf(u.id) : undefined })),
    roles: Object.entries(iam.roles()).map(([id, role]) => ({ id, ...role, grantable: iam.canGrant(id, ctx.permissions), holders: iam.users().filter((u) => u.role === id).length })),
    teams: ctx.teams.filter((t) => ctx.scope.has(t.id) || ctx.permissions.has('teams.manage')).map((t) => ({ ...t, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › '), leaders: (t.leaderIds ?? []).map((id) => ({ id, name: userName(id) })), members: iam.users().filter((u) => u.teamId === t.id).length })),
    permissions: PERMISSIONS,
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
    const user = iam.update(target.id, { name: body?.name, title: body?.title, role: body?.role, teamId: body?.teamId, active: body?.active });
    if (user.active === false) {
      calc.forget(user.id);
      passwordResets.revokeUser(user.id);
    }
    record(ctx, req, 'user.update', user.email, { changed: Object.keys(body ?? {}) });
    return { user: publicUser(user) };
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
  r('POST', '/api/people/:id/unlock', perm('users.manage'), (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    iam.unlock(target.id);
    record(ctx, req, 'user.unlock', target.email);
    return { ok: true };
  });
  r('POST', '/api/people/:id/signout', perm('users.manage'), (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    iam.endSessionsOf(target.id, { except: target.id === ctx.user.id ? ctx.session.id : null });
    calc.forget(target.id);
    record(ctx, req, 'user.signout', target.email);
    return { ok: true };
  });
  r('DELETE', '/api/people/:id', perm('users.manage'), (req, ctx, body, res, url, params) => {
    const target = iam.byId(params.id);
    if (!target || !canManage(ctx, target)) throw fail(404, 'That person is not one you can change.');
    if (target.id === ctx.user.id) throw fail(400, 'You cannot remove yourself.');
    iam.remove(target.id);
    passwordResets.revokeUser(target.id);
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
    if (body?.features !== undefined) settings.value.features = { ...(settings.value.features ?? {}), exports: body.features?.exports === true };
    if (body?.theme !== undefined) {
      const mode = ['light', 'dark', 'system'].includes(body.theme?.mode) ? body.theme.mode : 'light';
      const accent = ['aurora', 'ocean', 'emerald', 'sunset', 'royal', 'graphite'].includes(body.theme?.accent) ? body.theme.accent : 'aurora';
      settings.value.theme = { mode, accent };
    }
    for (const k of ['salesforceHosts', 'cxoneHosts', 'gitHosts']) if (body?.[k] !== undefined) settings.value[k] = hostList(body[k]);
    settings.save();
    syncHosts();
    record(ctx, req, 'settings.update', '', { changed: Object.keys(body ?? {}) });
    return { ...settings.value, effective: hosts() };
  });
  // ---- HTTPS (Settings → HTTPS), as CxMissionZero runs it ----------------------------------------------------------------
  const hostOf = (req) => String(req.headers.host ?? '').trim().toLowerCase();
  function httpsHosts(req, extra = []) {
    const hosts = new Set();
    const add = (value) => {
      const host = String(value ?? '').trim().toLowerCase().replace(/^\[(.*)\](:\d+)?$/, '$1').replace(/^([^:]+):\d+$/, '$1');
      if (host && host.length < 254 && /^[a-z0-9.:*-]+$/.test(host)) hosts.add(host);
    };
    add(hostOf(req));
    try {
      add(new URL(config.publicUrl).hostname);
    } catch {}
    for (const host of Array.isArray(extra) ? extra.slice(0, 10) : []) add(host);
    return [...hosts];
  }
  const acmeView = (req) => ({ ...acme.status(), suggested: httpsHosts(req).filter(validName), fromEnvironment: LETSENCRYPT_DOMAIN });
  const httpsStatus = async (req) => {
    const host = hostOf(req) || `localhost:${config.port}`;
    return { ...(await httpsManager.status(httpsHosts(req))), viewing: { secure: Boolean(req.socket.encrypted), host, httpUrl: `http://${host}`, httpsUrl: `https://${host}` }, hstsAges: HSTS_AGES, acme: acmeView(req), publicUrl: config.publicUrl };
  };
  const tlsPerm = perm('security.https');
  r('GET', '/api/https', tlsPerm, (req) => httpsStatus(req));
  r('POST', '/api/https/inspect', tlsPerm, (req, ctx, body) => httpsManager.inspect({ files: body?.files, passphrase: String(body?.passphrase ?? ''), hosts: httpsHosts(req, body?.hosts) }));
  r('POST', '/api/https/certificate', tlsPerm, async (req, ctx, body) => {
    const report = await httpsManager.install({ files: body?.files, passphrase: String(body?.passphrase ?? ''), hosts: httpsHosts(req, body?.hosts), confirm: Boolean(body?.confirm), by: ctx.user.email });
    record(ctx, req, 'https.certificate', report.summary.subject, { names: report.summary.names, issuer: report.summary.issuer, validTo: report.summary.validTo, fingerprint: report.summary.fingerprint });
    return { report, status: await httpsStatus(req) };
  });
  r('POST', '/api/https/certificate/previous', tlsPerm, async (req, ctx) => {
    httpsManager.restorePrevious({ by: ctx.user.email });
    record(ctx, req, 'https.certificate.previous');
    return httpsStatus(req);
  });
  r('DELETE', '/api/https/certificate', tlsPerm, async (req, ctx, body, res, url) => {
    const fallback = httpsManager.removeUploaded({ confirm: url.searchParams.get('confirm') === '1', by: ctx.user.email });
    record(ctx, req, 'https.certificate.remove', '', { fallback });
    return httpsStatus(req);
  });
  r('POST', '/api/https/self-signed', tlsPerm, async (req, ctx, body) => {
    httpsManager.selfSign({ names: Array.isArray(body?.names) ? body.names : [], by: ctx.user.email });
    record(ctx, req, 'https.selfSigned', '', { names: body?.names });
    return httpsStatus(req);
  });
  r('POST', '/api/https/request', tlsPerm, async (req, ctx, body) => {
    const csr = httpsManager.createRequest({ names: Array.isArray(body?.names) ? body.names : httpsHosts(req), organization: body?.organization ?? '', by: ctx.user.email });
    record(ctx, req, 'https.request', '', { names: body?.names });
    return { csr, status: await httpsStatus(req) };
  });
  r('GET', '/api/https/request.csr', tlsPerm, () => {
    const csr = httpsManager.requestCsr();
    if (!csr) throw fail(404, 'No certificate request has been made here.');
    return { download: csr, name: 'command-center.csr', type: 'application/pkcs10' };
  });
  r('POST', '/api/https/mode', tlsPerm, async (req, ctx, body) => {
    const from = httpsManager.mode;
    httpsManager.setMode(String(body?.mode ?? ''), { secure: Boolean(req.socket.encrypted), confirm: Boolean(body?.confirm), by: ctx.user.email });
    record(ctx, req, 'https.mode', `${from} → ${httpsManager.mode}`);
    return httpsStatus(req);
  });
  r('POST', '/api/https/hardening', tlsPerm, async (req, ctx, body) => {
    httpsManager.setHardening({ ...(body?.hsts ? { hsts: body.hsts } : {}), ...(body?.minVersion ? { minVersion: body.minVersion } : {}) }, { by: ctx.user.email });
    record(ctx, req, 'https.hardening', '', { hsts: body?.hsts, minVersion: body?.minVersion });
    return httpsStatus(req);
  });
  r('POST', '/api/https/browser-check', tlsPerm, async (req, ctx, body) => {
    httpsManager.recordBrowserCheck({ ok: body?.ok, url: body?.url, by: ctx.user.email });
    return { ok: true };
  });
  r('GET', '/api/https/acme', tlsPerm, (req) => acmeView(req));
  r('POST', '/api/https/acme', tlsPerm, (req, ctx, body) => {
    acme.start({ names: body?.names, email: body?.email, staging: body?.staging === true, agree: body?.agree === true, skipPrecheck: body?.skipPrecheck === true, by: ctx.user.email });
    record(ctx, req, 'https.letsencrypt.request', acme.status().last?.names?.join(', ') ?? '', { staging: body?.staging === true });
    return acmeView(req);
  });
  r('POST', '/api/https/acme/renew', tlsPerm, (req, ctx) => {
    acme.renew({ by: ctx.user.email });
    record(ctx, req, 'https.letsencrypt.renew');
    return acmeView(req);
  });
  r('DELETE', '/api/https/acme', tlsPerm, (req, ctx) => {
    acme.disable();
    record(ctx, req, 'https.letsencrypt.off');
    return acmeView(req);
  });

  // ---- Backups (CxMissionZero's way): nightly, before every version switch, by hand; download and restore -------------
  for (const e of recovered) audit.record({ action: e.outcome === 'restored' ? 'recover.restored' : 'recover.setAside', target: e.file, details: e });
  let lastBackup = { ok: true, at: null, error: '' };
  const takeBackup = (reason) => {
    try {
      const b = writeBackupTo(backupDir, { dataDir: config.dataDir, passphrase: backupPassphrase, version: VERSION, reason });
      audit.record({ action: 'backup.written', target: b.name, details: { reason, bytes: b.bytes, sha256: b.sha256, sealed: Boolean(backupPassphrase), dir: backupDir } });
      lastBackup = { ok: true, at: new Date().toISOString(), error: '' };
      return b.name;
    } catch (error) {
      lastBackup = { ok: false, at: new Date().toISOString(), error: error.message };
      audit.record({ action: 'backup.failed', details: { reason, error: error.message, dir: backupDir } });
      log(`! [backup] Could not write a backup to ${backupDir}: ${error.message}`);
      throw Object.assign(new Error(`The backup could not be written to ${backupDir}: ${error.message}`), { status: 500 });
    }
  };
  const backupPerm = perm('backup.manage');
  r('GET', '/api/backups', backupPerm, () => ({ backups: listBackups(backupDir), sealed: Boolean(backupPassphrase), dir: backupDir, separate: Boolean(config.backupDir), last: lastBackup, recovered: audit.recent({ limit: 20, filter: (e) => e.action.startsWith('recover.') }) }));
  r('POST', '/api/backups', backupPerm, (req, ctx) => ({ name: takeBackup(`by ${ctx.user.email}`), backups: listBackups(backupDir) }));
  r('GET', '/api/backups/:name', backupPerm, (req, ctx, body, res, url, params) => {
    const item = listBackups(backupDir).find((b) => b.name === params.name);
    if (!item) throw fail(404, 'That backup no longer exists.');
    record(ctx, req, 'backup.download', item.name);
    return { download: fs.readFileSync(path.join(backupDir, item.name)), name: item.name, type: 'application/octet-stream' };
  });
  r('POST', '/api/backups/inspect', backupPerm, (req, ctx, body) => describeBackup(readBackup(Buffer.from(String(body?.data ?? ''), 'base64'), { passphrase: String(body?.passphrase ?? '') })));
  r('POST', '/api/backups/restore', backupPerm, (req, ctx, body) => {
    const bundle = readBackup(Buffer.from(String(body?.data ?? ''), 'base64'), { passphrase: String(body?.passphrase ?? '') });
    if (body?.confirm !== true) throw fail(409, 'Confirm: everything here is replaced by the backup (a backup of what is here now is taken first).');
    const before = takeBackup(`before restoring a backup from ${bundle.at}`);
    restoreBackup(bundle, { dataDir: config.dataDir });
    record(ctx, req, 'backup.restore', bundle.at, { ...describeBackup(bundle), before });
    if (supervised) setTimeout(() => process.exit(75), 300).unref?.();
    return { restored: describeBackup(bundle), before, restarting: supervised };
  });
  startJobs.push(() => {
    // Nightly: an hour after the last one is a day old.
    const t = setInterval(() => {
      const last = listBackups(backupDir)[0];
      if (!last || Date.now() - Date.parse(last.at) > 24 * 3600 * 1000) {
        try {
          takeBackup('nightly');
        } catch (error) {
          log(`[backup] ${error.message}`);
        }
      }
    }, 60 * 60 * 1000);
    t.unref?.();
    stopJobs.push(() => clearInterval(t));
  });

  // ---- Updates and rollback (server/updates.js, server/launch.js) ------------------------------------------------------
  const supervised = process.env.CC_SUPERVISOR === '1';
  const versionStore = new VersionStore({ dataDir: config.dataDir, builtInDir: process.env.CC_BUILTIN_DIR || config.root, builtInVersion: process.env.CC_BUILTIN_VERSION || VERSION });
  const updates = updateService ?? new UpdateService({ store: versionStore, runningVersion: VERSION, repo: String(config.env?.UPDATE_REPO || 'cxsmtp/FTR-CC-Dashboard'), token: String(config.env?.UPDATE_GITHUB_TOKEN ?? ''), backup: async (reason) => takeBackup(reason), log, supervised });
  const updPerm = perm('system.update');
  r('GET', '/api/updates', updPerm, () => updates.status());
  r('POST', '/api/updates/check', updPerm, async (req, ctx) => {
    await updates.check();
    record(ctx, req, 'updates.check');
    return updates.status();
  });
  r('POST', '/api/updates/install', updPerm, async (req, ctx, body) => {
    const done = await updates.install(String(body?.version ?? ''), { by: ctx.user.email });
    record(ctx, req, 'updates.install', done.version, { sha256: done.sha256, files: done.files });
    if (body?.switch === true) {
      await updates.switchTo(done.version, { by: ctx.user.email });
      record(ctx, req, 'updates.switch', done.version);
    }
    return updates.status();
  });
  r('POST', '/api/updates/switch', updPerm, async (req, ctx, body) => {
    const out = await updates.switchTo(String(body?.version ?? ''), { by: ctx.user.email, reason: body?.reason === 'rollback' ? 'rollback by hand' : 'by hand' });
    record(ctx, req, 'updates.switch', out.to, { from: VERSION });
    return { ...updates.status(), ...out };
  });
  r('PUT', '/api/updates/auto', updPerm, (req, ctx, body) => {
    const auto = updates.setAuto({ enabled: body?.enabled, hour: body?.hour, mode: body?.mode }, { by: ctx.user.email });
    record(ctx, req, 'updates.auto', auto.enabled ? `on at ${auto.hour}:00` : 'off');
    return updates.status();
  });
  r('POST', '/api/system/restart', updPerm, (req, ctx) => {
    if (!supervised) throw fail(409, 'This server was not started by the launcher: restart it where it runs.');
    record(ctx, req, 'system.restart');
    setTimeout(() => process.exit(75), 300).unref?.();
    return { restarting: true };
  });
  startJobs.push(() => {
    updates.start();
    stopJobs.push(() => updates.stop());
  });

  // ---- Troubleshooting report: versions, health and settings in force, no secrets ----------------------------------
  const startedAt = Date.now();
  r('GET', '/api/system/diagnostics', perm('settings.manage'), async (req, ctx) => {
    let disk = null;
    try {
      const st = fs.statfsSync(config.dataDir);
      disk = { freeMB: Math.round((st.bavail * st.bsize) / 1048576), totalMB: Math.round((st.blocks * st.bsize) / 1048576) };
    } catch {}
    record(ctx, req, 'system.diagnostics');
    const report = {
      generatedAt: new Date().toISOString(),
      version: versionLabel(),
      mz: MZ_SOURCE.label,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      uptimeMinutes: Math.round((Date.now() - startedAt) / 60000),
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      disk,
      https: httpsManager.describe(),
      sso: { ready: sso.ready() },
      email: { ready: mailReady(), resetReady: resetReady().ready },
      updates: { running: VERSION, supervised, auto: versionStore.state.auto, lastCheck: versionStore.state.lastCheck, failed: versionStore.state.failed, events: (versionStore.state.events ?? []).slice(0, 10) },
      backups: { dir: backupDir, separate: Boolean(config.backupDir), count: listBackups(backupDir).length, last: listBackups(backupDir)[0] ?? null, lastAttempt: lastBackup, sealed: Boolean(backupPassphrase) },
      recovered: audit.recent({ limit: 20, filter: (e) => e.action.startsWith('recover.') }),
      counts: { people: iam.users().length, teams: teams.list().length, accounts: accounts.accounts.size, reports: accounts.reports.size },
      audit: audit.verify(),
      recentErrors: recentErrors.slice(-20),
    };
    return { download: JSON.stringify(report, null, 2), name: `cc-troubleshooting-${report.generatedAt.slice(0, 10)}.json`, type: 'application/json' };
  });
  r('GET', '/api/audit/verify', perm('audit.view'), (req, ctx) => {
    const result = audit.verify();
    record(ctx, req, 'audit.verify', result.ok ? 'intact' : 'broken', result);
    return result;
  });
  r('GET', '/api/audit/export.csv', perm('audit.view'), (req, ctx) => {
    const events = audit.recent({ limit: 100000 });
    record(ctx, req, 'audit.export', '', { rows: events.length });
    return { csv: csv(['When', 'Who', 'Email', 'Action', 'On', 'Details', 'Address'], events.map((e) => [e.at, e.actor?.name ?? '', e.actor?.email ?? '', e.action, e.target, JSON.stringify(e.details ?? {}), e.ip])), name: 'audit.csv' };
  });

  // ---- Email server (SMTP) --------------------------------------------------------------------------------------
  const smtpView = () => ({ smtp: publicSmtp(smtpNow()), verified: mailReady(), verifiedAt: settings.value.smtpVerifiedAt ?? null, passwordReset: resetPolicy(), reset: resetReady(), publicUrl: linkBase() });
  r('GET', '/api/settings/smtp', perm('settings.manage'), () => smtpView());
  // The sign-in rules (People → Sign-in): who may reset a forgotten password by email, and whether email works.
  r('GET', '/api/people/signin', perm('users.manage'), (req, ctx) => ({ canChange: ctx.permissions.has('settings.manage'), passwordReset: resetPolicy(), reset: resetReady(), sso: { ready: sso.ready(), passwordSignIn: sso.config().passwordSignIn, label: sso.config().label }, idleHours: config.sessionIdleHours }));
  r('PUT', '/api/settings/smtp', perm('settings.manage'), (req, ctx, body) => {
    if (body?.smtp) {
      const next = mergeSmtp(smtpNow(), body.smtp);
      settings.value.smtp = { ...next, password: secrets.seal(next.password) };
    }
    if (body?.passwordReset !== undefined) {
      if (!RESET_POLICIES.includes(body.passwordReset)) throw fail(400, 'Choose who may reset a forgotten password by email.');
      settings.value.passwordReset = body.passwordReset;
    }
    settings.save();
    record(ctx, req, 'settings.smtp', smtpNow().host, { changed: [...Object.keys(body?.smtp ?? {}).filter((k) => k !== 'password'), ...(body?.smtp?.password ? ['password'] : []), ...(body?.passwordReset ? ['passwordReset'] : [])] });
    return smtpView();
  });
  r('POST', '/api/settings/smtp/test', perm('settings.manage'), async (req, ctx) => {
    const smtp = smtpNow();
    try {
      await mailTransport.verify(smtp);
    } catch (error) {
      record(ctx, req, 'settings.smtp.test', smtp.host, { ok: false, error: error.message });
      throw fail(400, error.message);
    }
    settings.value.smtpVerified = smtpFingerprint(smtp);
    settings.value.smtpVerifiedAt = new Date().toISOString();
    settings.save();
    record(ctx, req, 'settings.smtp.test', smtp.host, { ok: true });
    return { ...smtpView(), message: `Connected to ${smtp.host}:${smtp.port}${smtp.requireAuth ? ' and signed in' : ''}. Email can be sent.` };
  });
  r('POST', '/api/settings/smtp/send-test', perm('settings.manage'), async (req, ctx, body) => {
    const to = clean(body?.to, 254).toLowerCase() || ctx.user.email;
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(to)) throw fail(400, 'That is not an email address.');
    try {
      await sendMail(to, systemEmail({ subject: 'FTR Credits Command Center: test message', lines: ['This is a test message from the FTR Credits Command Center.', 'The email server is working: forgotten-password links and welcome emails can be sent.'] }));
    } catch (error) {
      throw fail(error.status ?? 400, error.message);
    }
    record(ctx, req, 'settings.smtp.sendTest', to);
    return { message: `A test message went to ${to}.` };
  });

  r('GET', '/api/audit', perm('audit.view'), (req, ctx, body, res, url) => {
    const q = String(url.searchParams.get('q') ?? '').toLowerCase().slice(0, 100);
    return { events: audit.recent({ limit: 500, filter: (e) => !q || JSON.stringify(e).toLowerCase().includes(q) }) };
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
  r('POST', '/api/projections/read', calcTeam, (req, ctx, body) => {
    // Which account it is for, so the dashboard can say so and the calculator puts it there when the person comes back.
    const id = String(req.headers['x-account'] ?? '');
    const meta = id && accounts.accounts.meta(id);
    const account = meta && ctx.teamSet.has(meta.teamId) ? { id: meta.id, name: meta.name, teamId: meta.teamId } : null;
    const view = calc.startRead(ctx.user.id, body, account);
    // Kept on disk until its result is in its account: a restart meanwhile starts it again.
    pendingReads.value.reads[ctx.user.id] = { account, input: { branches: body?.branches, maxProjects: body?.maxProjects }, startedAt: new Date().toISOString() };
    pendingReads.save();
    return view;
  });
  r('GET', '/api/cc/work', perm('calculator.use'), (req, ctx) => calc.work(ctx.user.id));
  /** The calculator page's settings for this person (the page itself is the same for everyone). */
  r('GET', '/api/cc/calc-config', perm('calculator.use'), (req, ctx) => ({
    csrf: ctx.session.csrf,
    user: { id: ctx.user.id, name: ctx.user.name },
    roleName: iam.roles()[ctx.user.role]?.name ?? '',
    permissions: [...ctx.permissions],
    teams: ctx.teams.filter((t) => ctx.scope.has(t.id)).map((t) => ({ id: t.id, path: teamPath(ctx.teams, t.id).map((x) => x.name).join(' › ') })).sort((a, b) => a.path.localeCompare(b.path)),
    ownTeamId: ctx.user.teamId,
    organisationName: settings.value.organisationName,
    exportsEnabled: settings.value.features?.exports === true,
    // The menu and the look, as on the dashboard.
    teamName: teams.get(ctx.user.teamId)?.name ?? '',
    versionLabel: versionLabel(),
    prefs: { mode: ctx.user.prefs?.mode, accent: ctx.user.prefs?.accent },
    theme: { mode: settings.value.theme?.mode ?? 'light', accent: settings.value.theme?.accent ?? 'aurora' },
  }));
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
  /** An account for the calculator: never with its kept Checkmarx One key, sealed or not. */
  const forBrowser = ({ cxone, ...a }) => ({ ...a, cxone: cxone ? { tenant: cxone.tenant, savedBy: cxone.savedBy, savedAt: cxone.savedAt, lastReadAt: cxone.lastReadAt ?? null } : null });
  r('GET', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => ({ customer: forBrowser(accounts.get(params.id, ctx.teamSet)) }));
  r('PUT', '/api/projections/:id', calcTeam, (req, ctx, body, res, url, params) => {
    const patch = {};
    for (const key of ['name', 'tr', 'fusion', 'fusionNew', 'totals', 'scope', 'impact']) if (body?.[key] !== undefined) patch[key] = body[key];
    const saved = summary(accounts.update(params.id, ctx.teamSet, patch, ctx.user));
    if ((patch.tr !== undefined || patch.fusion !== undefined) && calc.markApplied(ctx.user.id, params.id)) {
      accounts.markRead(params.id);
      forgetPending(ctx.user.id);
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
    const state = await calc.connectKey(ctx.user.id, body);
    record(ctx, req, 'cxone.connect', state.tenant, { baseUrl: state.baseUrl });
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
    try {
      state = await calc.connectKey(ctx.user.id, key);
    } catch (error) {
      record(ctx, req, 'cxone.key.failed', accounts.accounts.meta(params.id)?.name ?? '', { error: error.message });
      throw fail(error.status ?? 400, `${error.message} The kept key may have expired: paste a new one and tick "Remember".`);
    }
    record(ctx, req, 'cxone.key.used', accounts.accounts.meta(params.id)?.name ?? '', { tenant: state.tenant });
    return state;
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
    const live = readCustomerVersion(body?.html);
    const figures = customerFigures(live);
    const changes = changesOf(live.sentInputs ?? {}, live.inputs);
    const sameName = figures.customer.trim().toLowerCase() === account.name.trim().toLowerCase();
    const preview = { customer: figures.customer, sameName, sentTotal: figures.sentTotal, total: figures.total, changes };
    if (body?.dryRun !== false) return { dryRun: true, ...preview };
    if (!sameName && body?.confirm !== true) throw fail(409, `This report was made for "${figures.customer}", not ${account.name}. Confirm to record it here anyway.`);
    const rep = accounts.addCustomerReport({ customerId: account.id, data: figures.data, user: ctx.user, note: body?.note, sentTotal: figures.sentTotal, changes }, ctx.scope);
    if (body?.makePrimary !== false) accounts.setPrimary(account.id, rep.id, ctx.scope);
    if (body?.applyPreferences !== false) accounts.update(account.id, ctx.scope, preferencesPatch(account, live.inputs), ctx.user);
    record(ctx, req, 'report.customerVersion', account.name, { id: rep.id, total: rep.totalCredits, sentTotal: figures.sentTotal, changes: changes.length, primary: body?.makePrimary !== false, preferences: body?.applyPreferences !== false });
    return { ...preview, report: { id: rep.id, totalCredits: rep.totalCredits }, ...accountDetail(ctx, account.id) };
  });
  r('POST', '/api/cc/cxone/disconnect', perm('calculator.use'), (req, ctx) => calc.disconnect(ctx.user.id));
  r('GET', '/api/cc/cxone/status', perm('calculator.use'), (req, ctx) => calc.status(ctx.user.id));

  // ---- The requests ---------------------------------------------------------------------------------------------
  const PUBLIC_DIR = path.join(config.root, 'public');
  const SAMPLES = path.join(config.root, 'vendor', 'mz', 'public', 'calculator', 'samples');
  const LEGAL = { '/legal/terms': 'TERMS.md', '/legal/license': 'LICENSE', '/legal/guide': 'docs/USER-GUIDE.md', '/legal/changelog': 'CHANGELOG.md' };

  const PUBLIC_POSTS = new Set(['/api/auth/signin', '/api/auth/forgot', '/api/auth/reset/check', '/api/auth/reset/confirm']);

  async function handle(req, res) {
    await ready;
    const url = new URL(req.url, 'http://local');
    const pathname = url.pathname;
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (method === 'GET' && pathname.startsWith(CHALLENGE_PREFIX)) return acmeChallenge(req, res);
    if (method === 'POST' && pathname === '/saml/acs') return samlAcs(req, res);
    if (req.socket.encrypted) {
      const hsts = httpsManager.hstsHeader();
      if (hsts) res.setHeader('Strict-Transport-Security', hsts);
    }

    if (method === 'GET' && LEGAL[pathname]) {
      return send(res, 200, fs.readFileSync(path.join(config.root, LEGAL[pathname]), 'utf8'), { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    // MZ's .xlsx reader (from the calculator), for reading sheets people upload in the dashboard.
    if (method === 'GET' && pathname === '/xlsx-lite.js') return serveStatic(path.join(config.root, 'vendor', 'mz', 'public', 'calculator', 'vendor'), req, res, 'xlsx-lite.js') || send(res, 404, 'Not found');
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
      const page = calculatorPage({ productCode: config.productCode });
      const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': page.csp, 'Cache-Control': 'private, no-cache', ETag: page.etag, Vary: 'Accept-Encoding' };
      if (req.headers['if-none-match'] === page.etag) return send(res, 304, '', headers);
      if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) return send(res, 200, page.gz, { ...headers, 'Content-Encoding': 'gzip' });
      return send(res, 200, page.html, headers);
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
        if (!PUBLIC_POSTS.has(pathname)) {
          if (!ctx || req.headers['x-csrf-token'] !== ctx.session.csrf) throw fail(ctx ? 403 : 401, ctx ? 'Reload the page: the request did not come from it.' : 'Sign in first.');
        }
        const origin = req.headers.origin;
        if (origin && config.publicUrl && origin !== new URL(config.publicUrl).origin) throw fail(403, 'That request came from another site.');
        if (origin && !config.publicUrl && new URL(origin).host !== req.headers.host) throw fail(403, 'That request came from another site.');
        body = await readBody(req, pathname.startsWith('/api/projections') || pathname.endsWith('/customer-version') ? CALC_LIMIT : BODY_LIMIT);
      }
      let result;
      for (const h of match.handlers) result = await h(req, ctx, body, res, url, match.params);
      if (result?.download !== undefined) return send(res, 200, result.download, { 'Content-Type': `${result.type ?? 'application/octet-stream'}`, 'Content-Disposition': `attachment; filename="${result.name}"` });
      if (result?.csv !== undefined) return send(res, 200, result.csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${result.name}"` });
      if (pathname === '/healthz') return send(res, 200, result);
      return send(res, 200, result ?? { ok: true });
    } catch (error) {
      if (error.status) return send(res, error.status, { error: error.message });
      log(`[error] ${req.method} ${pathname}: ${error.stack ?? error.message}`);
      return send(res, 500, { error: 'Something went wrong on the server: an Admin can find it in the server log.' });
    }
  }

  /** Let's Encrypt's HTTP-01 check, answered over plain http in every mode. */
  function acmeChallenge(req, res) {
    let token = '';
    try {
      token = decodeURIComponent(String(req.url ?? '').slice(CHALLENGE_PREFIX.length).split('?')[0]);
    } catch {}
    const value = acme.challenge(token);
    res.writeHead(value ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(value ?? 'Not found');
  }
  /** The https:// address for a request that came over plain http while the server is HTTPS only. */
  function httpsOrigin(req) {
    try {
      const configured = new URL(config.publicUrl);
      if (configured.protocol === 'https:') return configured.origin;
    } catch {}
    const header = hostOf(req);
    const hostname = header.replace(/^\[(.*)\](:\d+)?$/, '$1').replace(/^([^:]+):\d+$/, '$1');
    const served = httpsManager.servedNames();
    const covered = (name) => served.some((n) => n === name || (n.startsWith('*.') && name.endsWith(n.slice(1)) && !name.slice(0, -n.length + 1).includes('.')));
    const local = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    // A request's Host header never chooses another site for the redirect, unless the certificate covers it.
    const host = header && (local || httpsManager.selfSigned || covered(hostname)) ? header : served.find((n) => !n.startsWith('*.')) || 'localhost';
    return `https://${host}`;
  }
  async function httpsOnly(req, res) {
    if (req.method === 'GET' && req.url?.startsWith(CHALLENGE_PREFIX)) return acmeChallenge(req, res);
    const origin = httpsOrigin(req);
    const target = req.url?.startsWith('/') ? req.url : '/';
    if (target.startsWith('/api/')) return send(res, 426, { error: `The command center uses HTTPS only: ${origin}`, movedTo: origin });
    return send(res, 308, '', { Location: `${origin}${target}` });
  }
  // ---- Reads that a restart cut off: started again with the account's kept key, or the person told to read again --------
  const pendingReads = new Doc(path.join(config.dataDir, 'reads.json'), () => ({ reads: {} }));
  pendingReads.value.reads ??= {};
  const forgetPending = (userId) => {
    if (pendingReads.value.reads[userId]) {
      delete pendingReads.value.reads[userId];
      pendingReads.save();
    }
  };
  calc.onFinish = (userId, job) => {
    if (job.state === 'failed') forgetPending(userId);
  };
  async function resumeReads() {
    for (const [userId, p] of Object.entries(pendingReads.value.reads)) {
      const user = iam.byId(userId);
      if (!user || user.active === false || Date.now() - Date.parse(p.startedAt) > 24 * 3600 * 1000) {
        forgetPending(userId);
        continue;
      }
      const meta = p.account && accounts.accounts.meta(p.account.id);
      const kept = meta && accounts.accounts.get(meta.id)?.cxone;
      const key = kept?.sealedKey ? JSON.parse(secrets.open(kept.sealedKey) || 'null') : null;
      if (key?.apiKey) {
        try {
          await calc.connectKey(userId, key);
          calc.startRead(userId, p.input, p.account);
          audit.record({ action: 'cxone.read.resumed', target: p.account.name, details: { user: user.email, startedAt: p.startedAt } });
          log(`[recover] The read for ${p.account.name} cut off by the restart was started again (the account's kept key).`);
          continue;
        } catch (error) {
          log(`! [recover] The read for ${p.account.name} could not be started again: ${error.message}`);
        }
      }
      calc.interrupted.set(userId, { account: p.account, at: p.startedAt });
      audit.record({ action: 'cxone.read.interrupted', target: p.account?.name ?? '', details: { user: user.email } });
      forgetPending(userId);
    }
  }

  /** After the server listens: Let's Encrypt from LETSENCRYPT_DOMAIN, renewals, scheduled jobs. */
  async function started() {
    await ready;
    if (LETSENCRYPT_DOMAIN) {
      try {
        const names = cleanNames(LETSENCRYPT_DOMAIN);
        const st = acme.status();
        const current = st.issued && !st.issued.staging && names.every((n) => st.issued.names.includes(n)) && st.daysLeft > RENEW_DAYS;
        if (!current) acme.start({ names, email: config.env?.LETSENCRYPT_EMAIL ?? '', staging: /^(1|true|yes|on)$/i.test(config.env?.LETSENCRYPT_STAGING ?? ''), agree: true, by: 'LETSENCRYPT_DOMAIN' });
      } catch (error) {
        log(`! [https] LETSENCRYPT_DOMAIN: ${error.message}`);
      }
    }
    acme.startRenewal();
    for (const job of startJobs) job();
    await resumeReads().catch((error) => log(`! [recover] ${error.message}`));
  }
  stopJobs.push(() => acme.stop(), () => httpsManager.stop());
  const stop = () => stopJobs.forEach((j) => j());

  return { handle, httpsOnly, started, stop, https: httpsManager, acme, version: VERSION, versionLabel: versionLabel(), ready, iam, teams, accounts, audit, terms, settings, calc, SECURITY_HEADERS, APP_CSP };
}
