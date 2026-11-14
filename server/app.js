/**
 * The FTR Credits Command Center: every Sales Engineer signs in, works out the credits each account needs with the
 * Cx Credits Calculator, and keeps the reports here; leaders see their teams' projections on one dashboard, down to
 * each account, its Salesforce record and the report shared with the customer.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

import { APP_CSP, RateLimit, Router, SECURITY_HEADERS, cookies, readBody, send, serveStatic } from './http.js';
import { AuditLog, Doc, fail } from './store.js';
import { Iam } from './iam.js';
import { need, needTeam, scopeOf } from './rbac.js';
import { Teams } from './teams.js';
import { Accounts, DEFAULT_SALESFORCE_HOSTS, startIndex, viewing } from './accounts.js';
import { Terms } from './terms.js';
import { Sso } from './sso.js';
import { ActivityLog } from './activity.js';
import { CallMemory } from './resilience.js';
import { DEFAULT_SUPPORT_EMAIL, SupportDesk } from './support.js';
import { FusionRates, rateModels } from './fusion-rates.js';
import { DEFAULT_TR } from '../core/public/calculator/model.js';
import { recoverDataDir } from './recover.js';
import { PasswordResets, RESET_POLICIES } from './password-reset.js';
import { MailError, Secrets, mergeSmtp, smtpFingerprint, smtpTransport } from './mailer.js';
import { HttpsManager } from '../core/src/https-manager.js';
import { AcmeService, CHALLENGE_PREFIX, RENEW_DAYS, cleanNames } from '../core/src/acme.js';
import { CALC_FONTS, CalculatorService, DEFAULT_CXONE_HOSTS, DEFAULT_GIT_HOSTS, calculatorPage } from './calculator.js';
import { registerBranding } from './routes/branding.js';
import { registerAuth } from './routes/auth.js';
import { registerProfile } from './routes/profile.js';
import { registerDashboards } from './routes/dashboards.js';
import { registerAccounts } from './routes/accounts.js';
import { registerExports } from './routes/exports.js';
import { registerPeople } from './routes/people.js';
import { registerImpersonate } from './routes/impersonate.js';
import { registerSupport } from './routes/support.js';
import { registerHttps } from './routes/https.js';
import { registerBackups } from './routes/backups.js';
import { registerUpdates } from './routes/updates.js';
import { registerDiagnostics } from './routes/diagnostics.js';
import { registerEmail } from './routes/email.js';
import { registerProjections } from './routes/projections.js';
import { registerEstimate } from './routes/estimate.js';
import { registerRates } from './routes/rates.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
/** The version as people see it, the calculator’s way: CC-01.01.00. */
export const versionLabel = (v = VERSION) => `CC-${String(v).split('.').map((n) => n.padStart(2, '0')).join('.')}`;
const COOKIE = 'cc_session';
const BODY_LIMIT = 256 * 1024;
const CALC_LIMIT = 40 * 1024 * 1024;
// A backup sent back to be looked at or restored (its file, as base64): only from those who manage backups.
const BACKUP_LIMIT = 400 * 1024 * 1024;

export function createApp(config, { log: baseLog = console.log, calculatorService = null, mailTransport = smtpTransport, updateService = null } = {}) {
  // What the parts of the app that live in their own files (server/routes/) read from it: each thing by name, looked
  // up when it is used (so one made further down is found too), and set where a part changes it.
  const d = {
    get ACCENTS() { return ACCENTS; },
    get accountDetail() { return accountDetail; },
    get accounts() { return accounts; },
    get estimateBeta() { return estimateBeta; },
    get acme() { return acme; },
    get activity() { return activity; },
    get audit() { return audit; },
    get auditFilter() { return auditFilter; },
    get backupDir() { return backupDir; },
    get backupPassphraseOf() { return backupPassphraseOf; },
    get brandingView() { return brandingView; },
    get calc() { return calc; },
    get calcTeam() { return calcTeam; },
    get canManage() { return canManage; },
    get config() { return config; },
    get cookie() { return cookie; },
    get csv() { return csv; },
    get deleteReport() { return deleteReport; },
    get endActAs() { return endActAs; },
    get everyTeam() { return everyTeam; },
    get followOwner() { return followOwner; },
    get forBrowser() { return forBrowser; },
    get forgetPending() { return forgetPending; },
    get frozen() { return frozen; },
    set frozen(v) { frozen = v; },
    get fusionRates() { return fusionRates; },
    get hosts() { return hosts; },
    get httpsManager() { return httpsManager; },
    get iam() { return iam; },
    get idleMs() { return idleMs; },
    get IMPERSONATE_MS() { return IMPERSONATE_MS; },
    get integrity() { return integrity; },
    get ipOf() { return ipOf; },
    get isAdminUser() { return isAdminUser; },
    get lastBackup() { return lastBackup; },
    set lastBackup(v) { lastBackup = v; },
    get LETSENCRYPT_DOMAIN() { return LETSENCRYPT_DOMAIN; },
    get linkBase() { return linkBase; },
    get log() { return log; },
    get mailReady() { return mailReady; },
    get mailTransport() { return mailTransport; },
    get managesPeople() { return managesPeople; },
    get outOfStep() { return outOfStep; },
    get ownSelf() { return ownSelf; },
    get passwordResets() { return passwordResets; },
    get pendingReads() { return pendingReads; },
    get perm() { return perm; },
    get PUBLIC_DIR() { return PUBLIC_DIR; },
    get r() { return r; },
    get ratesFor() { return ratesFor; },
    get ready2() { return ready2; },
    get recentErrors() { return recentErrors; },
    get record() { return record; },
    get recovered() { return recovered; },
    get reload() { return reload; },
    get RESET_ASKED() { return RESET_ASKED; },
    get RESET_DEAD() { return RESET_DEAD; },
    get resetPolicy() { return resetPolicy; },
    get resetReady() { return resetReady; },
    get resetsInFlight() { return resetsInFlight; },
    get rows() { return rows; },
    get secrets() { return secrets; },
    get sendMail() { return sendMail; },
    get settings() { return settings; },
    get SEVS() { return SEVS; },
    get signedIn() { return signedIn; },
    get signInPerAccount() { return signInPerAccount; },
    get signInPerAddress() { return signInPerAddress; },
    get smtpNow() { return smtpNow; },
    get sso() { return sso; },
    get startJobs() { return startJobs; },
    get stopJobs() { return stopJobs; },
    get supervised() { return supervised; },
    get supportChannel() { return supportChannel; },
    get supportDesk() { return supportDesk; },
    get syncHosts() { return syncHosts; },
    get takeBackup() { return takeBackup; },
    get teams() { return teams; },
    get terms() { return terms; },
    get THEME_MODES() { return THEME_MODES; },
    get trRates() { return trRates; },
    get updates() { return updates; },
    get updateService() { return updateService; },
    get userName() { return userName; },
    get utc() { return utc; },
    get VERSION() { return VERSION; },
    get versionLabel() { return versionLabel; },
    get versionStore() { return versionStore; },
    get withTrRates() { return withTrRates; },
  };
  // What several parts of the app read and change (they live in server/routes/ and reach these through `d`):
  // why nothing is written for a moment (an update or a restore under way), and how the last backup went.
  let frozen = null;
  let lastBackup = { ok: true, at: null, error: '' };
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
  // The passphrase that seals backups now: the environment's, else the Admin's (Settings → Backups), else none.
  const backupPassphraseOf = () => backupPassphrase || (settings?.value?.backupSeal ? secrets.open(settings.value.backupSeal) : '');
  const atStart = startIndex(); // each account and report is read once: as it is checked
  const recovered = recoverDataDir({ dataDir: config.dataDir, backupDir, passphrase: backupPassphrase, log, seen: atStart.seen });
  const iam = new Iam(config.dataDir);
  const teams = new Teams(config.dataDir);
  const accounts = new Accounts(config.dataDir, atStart.known);
  const audit = new AuditLog(path.join(config.dataDir, 'audit.log'));
  const terms = new Terms({ dataDir: config.dataDir, textFile: path.join(config.root, 'TERMS.md') });
  const settings = new Doc(path.join(config.dataDir, 'settings.json'), () => ({ organisationName: 'Checkmarx', salesforceHosts: [], cxoneHosts: [], gitHosts: [] }));
  const hosts = () => ({
    salesforce: config.salesforceHosts ?? (settings.value.salesforceHosts?.length ? settings.value.salesforceHosts : DEFAULT_SALESFORCE_HOSTS),
    cxone: config.cxoneHosts ?? (settings.value.cxoneHosts?.length ? settings.value.cxoneHosts : DEFAULT_CXONE_HOSTS),
    git: config.gitHosts ?? (settings.value.gitHosts?.length ? settings.value.gitHosts : DEFAULT_GIT_HOSTS),
  });
  const calc = calculatorService ?? new CalculatorService({ cxoneHosts: hosts().cxone, gitHosts: hosts().git, log });
  // Fusion's engines and their rates (Fusion rates page): what applies to a person is their team's, else a team above, else the Admin's.
  const fusionRates = new FusionRates(settings);
  // One set of rates for everyone, the Admin's: a quote is the same whichever team makes it. (Rates a team set for
  // itself before CC-01.57 are still in settings.json, and no longer applied.)
  const ratesFor = () => fusionRates.effective([]);
  // Triage & remediation credits per finding: one figure per severity for everyone, set by the Admin only.
  const SEVS = ['Critical', 'High', 'Medium', 'Low'];
  const trRates = () => {
    const v = settings.value.trRates ?? {};
    const one = (k) => Object.fromEntries(SEVS.map((sv) => [sv, Number.isFinite(Number(v[k]?.[sv])) ? Number(v[k][sv]) : DEFAULT_TR[k][sv]]));
    return { triageCost: one('triageCost'), remediationCost: one('remediationCost') };
  };
  /** A projection with the Admin's triage and remediation credits, whatever it held. */
  const withTrRates = (projection) => (projection?.tr && typeof projection.tr === 'object' ? { ...projection, tr: { ...projection.tr, ...trRates() } } : projection);
  calc.rates = {
    rate: (userId, models) => rateModels(models ?? [], ratesFor(userId)),
    detected: (userId, names, tenant) => fusionRates.noteDetected(names, { by: iam.byId(userId)?.name ?? '', tenant }),
  };
  // Checkmarx One activity (server/activity.js): every call to a customer's tenant, per person and account.
  const activity = new ActivityLog({ dataDir: config.dataDir });
  calc.activity = activity;
  calc.memory = new CallMemory({ dataDir: config.dataDir });
  calc.describe = (userId, accountId) => {
    const u = iam.byId(userId);
    const meta = accountId ? accounts.accounts.meta(accountId) : null;
    return { user: u ? { id: u.id, name: u.name, email: u.email, teamId: u.teamId } : { id: userId }, account: meta ? { id: meta.id, name: meta.name, teamId: meta.teamId } : null };
  };
  const syncHosts = () => Object.assign(calc, { cxoneHosts: hosts().cxone, gitHosts: hosts().git });
  const idleMs = config.sessionIdleHours * 3600 * 1000;
  const startJobs = [];
  const stopJobs = [];

  // ---- Single sign-on (SAML) --------------------------------------------------------------------------------------
  const sso = new Sso({ settings: () => settings.value.sso, publicUrl: config.publicUrl });
  const isAdminUser = (user) => user.role === 'admin' || iam.permissionsOf({ ...user, active: true }).has('users.manage');

  // ---- HTTPS (the calculator’s HttpsManager and Let's Encrypt client, as they are) ------------------------------------
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

  // ---- Email (Settings → Email server) and forgotten passwords, as the calculator does them ---------------------
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
    return mailTransport.send(smtpNow(), { to, subject: message.subject, text: message.text, html: message.html, ...(message.replyTo ? { replyTo: message.replyTo } : {}) });
  };
  // ---- Get help: support cases and enhancement requests (server/support.js) ----
  const supportDesk = new SupportDesk({ dataDir: config.dataDir });
  /** Where requests go: the portal here (with emails to the support address), or each person's email app. */
  const supportChannel = () => {
    const v = settings.value.support ?? {};
    return { mode: v.mode === 'email' ? 'email' : 'portal', email: String(v.email || DEFAULT_SUPPORT_EMAIL) };
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
  // Behind a reverse proxy (set when the server starts, or by the Admin in Settings → General, at once): the address the
  // proxy says the person came from, and whether they came over HTTPS. Otherwise the connection's own.
  const behindProxy = () => Boolean(config.trustProxy || settings.value.trustProxy);
  /**
   * Who is asking. Behind a trusted proxy: the address the proxy saw, which is the last entry of X-Forwarded-For (a
   * proxy appends; anything before it was sent by the client and can be made up, to dodge the sign-in limits or to
   * put a false address in the audit log).
   */
  const ipOf = (req) => (behindProxy() ? String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean).pop() ?? '' : '') || req.socket.remoteAddress || '';
  function context(req) {
    const token = cookies(req)[COOKIE];
    const session = iam.session(token);
    if (!session) return null;
    const real = iam.byId(session.userId);
    if (!real || real.active === false) return null;
    // An Admin signed in as someone else (Sign in as): the person's view and permissions, the Admin's name in the audit.
    let user = real;
    let impersonator = null;
    if (session.actAs) {
      const target = iam.byId(session.actAs.userId);
      if (target && target.active !== false && target.id !== real.id && Date.now() < session.actAs.until && iam.permissionsOf(real).has('users.impersonate')) {
        user = target;
        impersonator = real;
      } else endActAs(session);
    }
    const permissions = iam.permissionsOf(user);
    const allTeams = teams.list();
    const scope = scopeOf(user, permissions, allTeams);
    return { token, session, user, permissions, scope, teams: allTeams, impersonator };
  }
  /** Sign in as: back to the Admin's own account (the session stays theirs). */
  function endActAs(session) {
    if (!session?.actAs) return;
    delete session.actAs;
    iam.sessions.save();
  }
  const IMPERSONATE_MS = 60 * 60 * 1000;
  const actorOf = (ctx) => {
    if (!ctx) return null;
    // Who really acted: the Admin, as the person they signed in as.
    if (ctx.impersonator) return { id: ctx.impersonator.id, email: ctx.impersonator.email, name: `${ctx.impersonator.name || ctx.impersonator.email} as ${ctx.user.name || ctx.user.email}`, as: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name } };
    return { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name };
  };
  const record = (ctx, req, action, target = '', details = {}) => {
    if (req) req.ccAudited = true;
    audit.record({ actor: actorOf(ctx), action, target, details, ip: ipOf(req) });
  };
  // ---- Every action in the audit log: what a route does not record itself is recorded here, by the router --------
  /** Asked for often while someone works, and change nothing: not recorded. */
  const QUIET = new Set(['/api/projections/series', '/api/auth/reset/check', '/api/https/inspect', '/api/backups/inspect', '/api/https/browser-check', '/api/me/guide']);
  /** Downloads and what is opened that matters: recorded as they are read. */
  const READS = new Map([['/api/projections/reports/:id', 'report.open'], ['/api/projections/git/cloc-fusion', 'cloc-fusion.download']]);
  const lastSeen = new Map();
  const actionOf = (method, pattern) => {
    const segs = pattern.replace(/^\/api\//, '').split('/');
    const endsInParam = segs.at(-1).startsWith(':');
    const name = segs.filter((x) => !x.startsWith(':')).join('.').replace(/^cc\./, '').replace(/^projections\b/, 'calculator');
    if (method === 'GET') return `${name}.export`;
    if (method === 'DELETE') return `${name}.delete`;
    if (method === 'PUT') return `${name}.update`;
    return endsInParam || segs.length === 1 ? `${name}.create` : name;
  };
  function auditRequest(req, ctx, method, pathname, match, outcome) {
    if (req.ccAudited || !match) return;
    const { pattern, params } = match;
    // Sign-in, forgotten password and SSO record themselves, with more than the router knows.
    if (PUBLIC_POSTS.has(pattern) || pattern.startsWith('/api/auth/')) return;
    if (QUIET.has(pattern)) return;
    let action = READS.get(pattern) ?? actionOf(method, pattern);
    if (outcome.status >= 400) {
      // Refused: by someone signed in, or a sign-in step (those record their own). Not anonymous noise.
      if (!ctx) return;
      action = `refused: ${action}`;
    }
    const target = params.id ? (accounts.accounts.meta?.(params.id)?.name ?? iam.byId?.(params.id)?.email ?? teams.get?.(params.id)?.name ?? params.id) : '';
    // An autosave, a report opened again: once a minute per person is enough.
    const key = `${ctx?.user?.id}|${action}|${target}`;
    if (outcome.status < 400 && (method === 'PUT' || method === 'GET') && Date.now() - (lastSeen.get(key) ?? 0) < 60_000) return;
    lastSeen.set(key, Date.now());
    if (lastSeen.size > 5000) lastSeen.clear();
    audit.record({ actor: actorOf(ctx), action, target: String(target), details: { method, path: pathname, ...(outcome.status >= 400 ? { status: outcome.status, error: String(outcome.error ?? '').slice(0, 200) } : {}) }, ip: ipOf(req) });
  }

  const cookie = (value, maxAge, req) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${config.secureCookies || req?.socket?.encrypted || httpsManager.mode === 'https' || (behindProxy() && String(req?.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https') ? '; Secure' : ''}; Max-Age=${maxAge}`;

  // Guards: signed in; then (for everything but the first-sign-in steps) a password of their own and the terms.
  const signedIn = (req, ctx) => {
    if (!ctx) throw fail(401, 'Sign in first.');
  };
  /** Their password, profile, sessions and terms stay the person's own: not changed by an Admin signed in as them. */
  const ownSelf = (req, ctx) => {
    signedIn(req, ctx);
    if (ctx.impersonator) throw fail(403, `This stays ${ctx.user.name || ctx.user.email}'s own: go back to your own account first.`);
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
  r('GET', '/healthz', () => ({ ok: true, version: VERSION }));
  // ---- Branding (Settings → Branding, server/branding.js): what every page shows, even before signing in ------------
  const { brandingView } = registerBranding(d);

  // ---- Forgot your password? A one-time link to the account's own email (server/password-reset.js) ------------------
  const { ACCENTS, samlAcs, THEME_MODES } = registerAuth(d);
  // ---- Your profile: your name, picture, time zone and Impact figures ----------------------------------------------
  registerProfile(d);

  // ---- Dashboards ---------------------------------------------------------------------------------------
  const { rows, userName } = registerDashboards(d);

  // ---- Accounts follow their accountable SE: an account is in the team its SE is in ---------------------------------
  const { accountDetail, deleteReport, everyTeam, followOwner, outOfStep } = registerAccounts(d);

  // ---- CSV exports -----------------------------------------------------------------------------------
  const { csv } = registerExports(d);

  // ---- People, teams, roles, settings, audit ---------------------------------------------------------------
  const { canManage } = registerPeople(d);
  // ---- Sign in as: an Admin sees and works as another person, recorded as the Admin acting as them ----
  registerImpersonate(d);

  // ---- Get help: everyone raises and follows their own; the support team sees them all, answers, moves them on ----
  registerSupport(d);
  // ---- HTTPS (Settings → HTTPS), as the calculator runs it ----------------------------------------------------------------
  const { hostOf } = registerHttps(d);

  // ---- Backups (the calculator’s way): nightly, before every version switch, by hand; download and restore -------------
  const { takeBackup } = registerBackups(d);

  // ---- Updates and rollback (server/updates.js, server/launch.js) ------------------------------------------------------
  const { integrity, reload, supervised, updates, versionStore } = registerUpdates(d);

  // ---- Troubleshooting report: versions, health and settings in force, no secrets ----------------------------------
  registerDiagnostics(d);

  // ---- Email server (SMTP) --------------------------------------------------------------------------------------
  const { auditFilter } = registerEmail(d);

  // ---- Salesforce links are unique: one account per opportunity or account ------------------------------------
  const { forBrowser, takenView } = registerProjections(d);
  // ---- Fusion rates: the Admin's engines and default engine, each team's own, and engines seen without a rate ----
  registerRates(d);
  // ---- The vulnerability estimate, for Admins (server/estimate.js) ---------------------------------------
  const { estimateBeta } = registerEstimate(d);

  // ---- The requests ---------------------------------------------------------------------------------------------
  const PUBLIC_DIR = path.join(config.root, 'public');
  /**
   * The dashboard's page: its styles and scripts at this version's own address (/v/<version>/…), each kept by the
   * browser until the next version, and every module named up front so they are fetched together, not one after another.
   * Over a slow link this is the difference between a round trip per file on every page and none.
   */
  let indexCache = null;
  const sendIndex = (req, res) => {
    const file = path.join(PUBLIC_DIR, 'index.html');
    const stat = fs.statSync(file);
    if (!indexCache || indexCache.mtime !== stat.mtimeMs) {
      const v = `/v/${VERSION}`;
      const modules = fs.readdirSync(path.join(PUBLIC_DIR, 'js')).filter((f) => f.endsWith('.js')).sort();
      const html = fs.readFileSync(file, 'utf8')
        // Who is signed in and the branding: asked for with the page itself, not one round trip after it.
        .replace('<link rel="stylesheet" href="/app.css" />', `<link rel="preload" href="/api/me" as="fetch" crossorigin />\n<link rel="preload" href="/api/branding" as="fetch" crossorigin />\n<link rel="stylesheet" href="/app.css" />`)
        .replace('href="/app.css"', `href="${v}/app.css"`)
        .replace('href="/standard.css"', `href="${v}/standard.css"`)
        .replace('<script src="/xlsx-lite.js"></script>', `<script src="${v}/xlsx-lite.js" defer></script>`)
        .replace('<script type="module" src="/js/main.js"></script>', `${modules.map((m) => `<link rel="modulepreload" href="${v}/js/${m}" />`).join('\n')}\n<script type="module" src="${v}/js/main.js"></script>`);
      const etag = `"${createHash('sha256').update(html).digest('hex').slice(0, 20)}"`;
      indexCache = { mtime: stat.mtimeMs, html, gz: zlib.gzipSync(html), etag };
    }
    const headers = { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: indexCache.etag, Vary: 'Accept-Encoding', 'Content-Security-Policy': APP_CSP };
    if (req.headers['if-none-match'] === indexCache.etag) return void res.writeHead(304, headers).end();
    const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    res.writeHead(200, { ...headers, ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(gz ? indexCache.gz : indexCache.html);
  };
  const SAMPLES = path.join(config.root, 'core', 'public', 'calculator', 'samples');
  const LEGAL = { '/legal/terms': 'TERMS.md', '/legal/license': 'LICENSE', '/legal/guide': 'docs/USER-GUIDE.md', '/legal/changelog': 'CHANGELOG.md' };

  const PUBLIC_POSTS = new Set(['/api/auth/signin', '/api/auth/forgot', '/api/auth/reset/check', '/api/auth/reset/confirm']);

  const sameSite = (origin, req) => {
    let o;
    try {
      o = new URL(origin);
    } catch {
      return false;
    }
    if (config.publicUrl && o.origin === new URL(config.publicUrl).origin) return true;
    return o.host === req.headers.host;
  };
  async function handle(req, res) {
    await ready;
    const url = new URL(req.url, 'http://local');
    const pathname = url.pathname;
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (frozen && method !== 'GET') return send(res, 503, { error: frozen }, { 'Retry-After': '5' });
    if (method === 'GET' && pathname.startsWith(CHALLENGE_PREFIX)) return acmeChallenge(req, res);
    if (method === 'POST' && pathname === '/saml/acs') return samlAcs(req, res);
    if (req.socket.encrypted) {
      const hsts = httpsManager.hstsHeader();
      if (hsts) res.setHeader('Strict-Transport-Security', hsts);
    } else if (behindProxy() && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https') {
      // HTTPS ends at the proxy: the browser still came over HTTPS, so it is told to keep to it.
      res.setHeader('Strict-Transport-Security', httpsManager.hstsHeader() || 'max-age=31536000');
    }

    if (method === 'GET' && LEGAL[pathname]) {
      return send(res, 200, fs.readFileSync(path.join(config.root, LEGAL[pathname]), 'utf8'), { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    // the calculator’s .xlsx reader (from the calculator), for reading sheets people upload in the dashboard.
    // Also at this version's own address (/v/<version>/xlsx-lite.js), kept by the browser until the next version.
    if (method === 'GET' && pathname === `/v/${VERSION}/xlsx-lite.js`) return serveStatic(path.join(config.root, 'core', 'public', 'calculator', 'vendor'), req, res, 'xlsx-lite.js', { cache: 'public, max-age=31536000, immutable' }) || send(res, 404, 'Not found');
    if (method === 'GET' && pathname === '/xlsx-lite.js') return serveStatic(path.join(config.root, 'core', 'public', 'calculator', 'vendor'), req, res, 'xlsx-lite.js') || send(res, 404, 'Not found');
    // The calculator's fonts: public, named by their content (?h=), kept by the browser for a year.
    if (method === 'GET' && /^\/calc-fonts\/[a-z0-9-]+\.woff2$/.test(pathname)) return serveStatic(CALC_FONTS, req, res, pathname.slice('/calc-fonts/'.length), { cache: 'public, max-age=31536000, immutable' }) || send(res, 404, 'Not found');
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
      const page = calculatorPage();
      const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': page.csp, 'Cache-Control': 'private, no-cache', ETag: page.etag, Vary: 'Accept-Encoding' };
      if (req.headers['if-none-match'] === page.etag) return send(res, 304, '', headers);
      if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) return send(res, 200, page.gz, { ...headers, 'Content-Encoding': 'gzip' });
      return send(res, 200, page.html, headers);
    }

    const match = router.match(method, pathname);
    if (!match) {
      if (method === 'GET' && !pathname.startsWith('/api/')) {
        if (pathname === '/' || pathname === '/index.html') return sendIndex(req, res);
        // This version's own files: the browser keeps them until the next version (a new address), asking nothing meanwhile.
        const versioned = /^\/v\/([^/]+)(\/.+)$/.exec(pathname);
        if (versioned) return serveStatic(PUBLIC_DIR, req, res, versioned[2], { cache: versioned[1] === VERSION ? 'public, max-age=31536000, immutable' : 'no-cache' }) || send(res, 404, 'Not found');
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
        // The page's own address (whatever name or IP it was opened by), or PUBLIC_URL (behind a proxy that changes Host).
        if (origin && !sameSite(origin, req)) throw fail(403, 'That request came from another site.');
        const backupUpload = (pathname === '/api/backups/restore' || pathname === '/api/backups/inspect') && ctx?.permissions?.has('backup.manage');
        body = await readBody(req, backupUpload ? BACKUP_LIMIT : pathname.startsWith('/api/projections') || pathname.endsWith('/customer-version') || pathname.endsWith('/previous-report') ? CALC_LIMIT : pathname === '/api/settings/branding' || pathname === '/api/me/profile' ? 512 * 1024 : BODY_LIMIT);
      }
      // Who is looking goes with the request: a draft account is its SE's (and an Admin's) until its first report.
      const handle = async () => {
        let out;
        for (const h of match.handlers) out = await h(req, ctx, body, res, url, match.params);
        return out;
      };
      const result = ctx?.user ? await viewing.run({ id: ctx.user.id, admin: ctx.user.role === 'admin', calc: pathname.startsWith('/api/projections') }, handle) : await handle();
      const exported = result?.download !== undefined || result?.csv !== undefined;
      if (method !== 'GET' || exported || READS.has(match.pattern)) auditRequest(req, ctx, method, pathname, match, { status: 200 });
      if (result?.download !== undefined) return send(res, 200, result.download, { 'Content-Type': `${result.type ?? 'application/octet-stream'}`, 'Content-Disposition': `attachment; filename="${result.name}"` });
      if (result?.csv !== undefined) return send(res, 200, result.csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${result.name}"` });
      if (pathname === '/healthz') return send(res, 200, result);
      return send(res, 200, result ?? { ok: true });
    } catch (error) {
      // Refused changes, and anything refused for lack of permission, are in the audit log too.
      if (error.status && (method !== 'GET' || error.status === 403)) {
        try {
          auditRequest(req, ctx, method, pathname, match, { status: error.status, error: error.message });
        } catch {}
      }
      if (error.status) return send(res, error.status, { error: error.message, ...(error.taken ? { taken: takenView(error.taken, ctx) } : {}) });
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
    // Plain text for Let's Encrypt; the same protective headers as every other answer (nothing to run, no framing).
    res.writeHead(value ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' });
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
      // Handed over by the version before, still connected: nothing to start again.
      if (calc.work(userId).read) continue;
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
  stopJobs.push(() => acme.stop(), () => httpsManager.stop(), () => activity.flush());
  const stop = () => stopJobs.forEach((j) => j());
  /** An update without a restart: this process stops writing and gives what it holds in memory to the next. */
  const handoff = () => {
    stop();
    frozen = frozen ?? 'The command center is moving to its new version: try again in a moment.';
    // Everything held only in memory goes to the next version (CLAUDE.md): the Checkmarx One connections and git
    // counts, password-reset links, single sign-ons under way, and what the Admins are shown of the last backup.
    return { calc: calc.handoff(), resets: passwordResets.handoff(), sso: sso.handoff(), lastBackup, recentErrors: recentErrors.slice(-50) };
  };
  /** The next version did not come up: carry on as before. */
  const resume = () => {
    frozen = null;
    for (const job of startJobs) job();
    acme.startRenewal();
    httpsManager.watch();
  };
  const adopt = (state) => {
    if (!state) return;
    if (state.calc) calc.adopt(state.calc);
    if (state.resets) passwordResets.adopt(state.resets);
    if (state.sso) sso.adopt(state.sso);
    if (state.lastBackup?.at) lastBackup = state.lastBackup;
    if (Array.isArray(state.recentErrors)) recentErrors.unshift(...state.recentErrors.filter((e) => e?.at && e?.line));
  };

  return { handle, httpsOnly, started, stop, activity, handoff, resume, adopt, release: () => calc.release(), https: httpsManager, acme, version: VERSION, versionLabel: versionLabel(), ready, iam, teams, accounts, audit, terms, settings, calc, SECURITY_HEADERS, APP_CSP };
}
