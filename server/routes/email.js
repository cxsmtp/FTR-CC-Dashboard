import { clean } from '../iam.js';
import { mergeSmtp, publicSmtp, smtpFingerprint, systemEmail } from '../mailer.js';
import { RESET_POLICIES } from '../password-reset.js';
import { fail } from '../store.js';

/**
 * The email server (SMTP), how people sign in (Settings → People → Sign-in), and the audit log's list.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerEmail(d) {
  const {
    audit, config, linkBase, mailReady, mailTransport, perm, r, record, resetPolicy, resetReady, secrets,
    sendMail, settings, smtpNow, sso,
  } = d;
  // ---- Email server (SMTP) --------------------------------------------------------------------------------------
  const smtpView = () => ({ smtp: publicSmtp(smtpNow()), verified: mailReady(), verifiedAt: settings.value.smtpVerifiedAt ?? null, passwordReset: resetPolicy(), reset: resetReady(), publicUrl: linkBase() });
  r('GET', '/api/settings/smtp', perm('settings.manage'), () => smtpView());
  // The sign-in rules (People → Sign-in): who may reset a forgotten password by email, and whether email works.
  r('GET', '/api/people/signin', perm('users.manage'), (req, ctx) => ({ canChange: ctx.permissions.has('settings.manage'), passwordReset: resetPolicy(), reset: resetReady(), sso: { ready: sso.ready(), passwordSignIn: sso.config().passwordSignIn, label: sso.config().label }, idleHours: config.sessionIdleHours }));
  r('PUT', '/api/settings/smtp', perm('settings.manage'), async (req, ctx, body) => {
    const before = settings.value.smtp ? { ...settings.value.smtp } : null;
    if (body?.smtp) {
      const next = mergeSmtp(smtpNow(), body.smtp);
      settings.value.smtp = { ...next, password: secrets.seal(next.password) };
    }
    // Saved as typed, then tested at once: settings that do not work give way to the last ones that did.
    if (body?.test === true && body?.smtp && smtpNow().host) {
      try {
        await mailTransport.verify(smtpNow());
        settings.value.smtpVerified = smtpFingerprint(smtpNow());
        settings.value.smtpVerifiedAt = new Date().toISOString();
        settings.value.smtpGood = { ...settings.value.smtp };
      } catch (error) {
        const good = settings.value.smtpGood ?? null;
        if (good && JSON.stringify(good) !== JSON.stringify(settings.value.smtp)) {
          settings.value.smtp = { ...good };
          settings.value.smtpVerified = smtpFingerprint(smtpNow());
          settings.save();
          record(ctx, req, 'settings.smtp.rollback', good.host, { error: error.message });
          throw fail(409, `${error.message} The last email settings that worked are back.`);
        }
        settings.save();
        record(ctx, req, 'settings.smtp', smtpNow().host, { tested: false, error: error.message });
        throw fail(400, `Saved, but the test failed: ${error.message}`);
      }
    }
    void before;
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
    settings.value.smtpGood = { ...settings.value.smtp };
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

  /**
   * The audit log, newest first, 200 at a time: search, who, what (an action or its group, such as "people"), when,
   * and whether it was refused. `before` (the time of the last one shown) pages back.
   */
  const auditFilter = (sp) => {
    const q = String(sp.get('q') ?? '').toLowerCase().slice(0, 100);
    const who = String(sp.get('who') ?? '').toLowerCase().slice(0, 200);
    const what = String(sp.get('what') ?? '').slice(0, 100);
    const outcome = String(sp.get('outcome') ?? '');
    const from = sp.get('from') ? Date.parse(sp.get('from')) : null;
    const to = sp.get('to') ? Date.parse(sp.get('to')) + 24 * 3600 * 1000 : null;
    const before = sp.get('before') ?? '';
    const base = (a) => String(a).replace(/^refused: /, '');
    const filter = (e) => {
      if (before && e.at >= before) return false;
      const t = Date.parse(e.at);
      if (from && t < from) return false;
      if (to && t >= to) return false;
      if (who && String(e.actor?.email ?? '').toLowerCase() !== who) return false;
      if (what && base(e.action) !== what && !base(e.action).startsWith(`${what}.`)) return false;
      // Refused: what the router refused, a failed sign-in, and every action recorded as refused or failed.
      const refused = /^refused: /.test(String(e.action)) || /\.(refused|failed)$/.test(base(e.action)) || base(e.action) === 'auth.failed';
      if (outcome === 'refused' && !refused) return false;
      if (outcome === 'done' && refused) return false;
      return !q || JSON.stringify(e).toLowerCase().includes(q);
    };
    return filter;
  };
  const auditBase = (a) => String(a).replace(/^refused: /, '');
  r('GET', '/api/audit', perm('audit.view'), (req, ctx, body, res, url) => {
    const sp = url.searchParams;
    const limit = Math.min(500, Math.max(1, Number(sp.get('limit')) || 200));
    const filter = auditFilter(sp);
    const base = auditBase;
    const events = audit.recent({ limit: limit + 1, filter });
    // For the filters: who and what appear in the log (the newest 5,000 events).
    const seen = audit.recent({ limit: 5000 });
    const people = [...new Map(seen.filter((e) => e.actor?.email).map((e) => [e.actor.email, { email: e.actor.email, name: e.actor.name ?? e.actor.email }])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const actions = [...new Set(seen.map((e) => base(e.action)))].sort();
    return { events: events.slice(0, limit), more: events.length > limit, people, actions };
  });

  return { auditFilter };
}
