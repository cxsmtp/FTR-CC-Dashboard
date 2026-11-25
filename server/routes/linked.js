import { send } from '../http.js';
import { cleanPartnerUrl, makePass, movePage, newLinkKey, readPass, safePath } from '../link.js';
import { fail } from '../store.js';

/**
 * Linked apps: one sign-in for the FTR Credits Command Center and Kendra (the POV command center).
 *
 * Someone signed in to one opens the other already signed in, as the same person (their email): from the link in the
 * menu, or by opening it directly (its sign-in page asks the other app once, which answers at once when they are
 * signed in there). Each hop carries a pass (server/link.js, the same file in both apps) signed with a key the
 * Admins set on both sides, for one app, good for a minute and used once. Nobody is created by it: the person must
 * already have an account here, turned on.
 *
 * Settings → Linked apps keeps Kendra's address and the key (sealed in the settings, never sent back).
 *
 *   /link/kendra?to=          this app's menu: go to Kendra, signed in
 *   /link/kendra/authorize    Kendra asks who is signed in here (one hop through a page of this site first, so the
 *                             SameSite=Strict cookie is sent), then answers with a pass or "nobody"
 *   /link/kendra/in?pass=     Kendra vouches for someone signed in there: a session here
 *   /link/kendra/none         nobody is signed in to Kendra: this app's own sign-in page, without asking again
 */
export function registerLinked(d) {
  const { audit, cookie, iam, idleMs, ipOf, perm, r, record, settings, teams } = d;
  const used = new Map();
  const view = () => {
    const l = settings.value.link ?? {};
    return { kendraUrl: l.kendraUrl ?? '', key: l.key ? d.secrets.open(l.key) : '', at: l.at ?? null, by: l.by ?? '' };
  };
  const ready = () => {
    const l = view();
    return Boolean(l.kendraUrl && l.key);
  };
  const html = (res, body, headers = {}) => send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers });
  const passFor = (user) => encodeURIComponent(makePass({ key: view().key, from: 'ftr', to: 'kendra', email: user.email, name: user.name }));
  const actor = (u) => ({ id: u.id, email: u.email, name: u.name });
  /** May this address be added on its first arrival from Kendra? The domains open to joining (checkmarx.com by default). */
  const mayJoin = (email) => {
    const v = settings.value.selfJoin ?? {};
    const domains = Array.isArray(v.domains) && v.domains.length ? v.domains : ['checkmarx.com'];
    return v.enabled !== false && domains.includes(String(email).split('@')[1] ?? '');
  };

  // Where Kendra is, for the menu and the sign-in page (an address only; nothing secret).
  r('GET', '/api/auth/linked', () => ({ kendra: ready() ? view().kendraUrl : null }));

  r('GET', '/api/settings/link', perm('settings.manage'), () => {
    const l = view();
    return { kendraUrl: l.kendraUrl, hasKey: Boolean(l.key), at: l.at, by: l.by, ready: ready() };
  });
  r('PUT', '/api/settings/link', perm('settings.manage'), (req, ctx, body) => {
    const prev = settings.value.link ?? {};
    if (body?.remove) {
      settings.value.link = null;
      settings.save();
      record(ctx, req, 'settings.link', 'off');
      return { kendraUrl: '', hasKey: false, ready: false, key: null };
    }
    const kendraUrl = body && 'kendraUrl' in body ? cleanPartnerUrl(body.kendraUrl) : prev.kendraUrl ?? '';
    let key = prev.key ?? '';
    let shown = null;
    if (body?.newKey) {
      shown = newLinkKey();
      key = d.secrets.seal(shown);
    } else if (body?.key) {
      const k = String(body.key).trim();
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(k)) throw fail(400, 'The shared key is the 43 letters and digits the other app shows when it makes one.');
      key = d.secrets.seal(k);
    }
    settings.value.link = { kendraUrl, key, at: new Date().toISOString(), by: ctx.user.name || ctx.user.email };
    settings.save();
    record(ctx, req, 'settings.link', kendraUrl, { key: shown ? 'new' : body?.key ? 'pasted' : 'kept' });
    return { kendraUrl, hasKey: Boolean(key), ready: Boolean(kendraUrl && key), key: shown };
  });

  const notLinked = (res) => html(res, movePage('/#/', 'Not linked', 'This command center is not linked to Kendra: an Admin links them in Settings → Linked apps.'));

  // This app's menu: Kendra, signed in.
  r('GET', '/link/kendra', (req, ctx, body, res, url) => {
    if (!ready()) return notLinked(res);
    if (!ctx) return send(res, 302, '', { Location: '/#/login' });
    const to = safePath(url.searchParams.get('to') || '/');
    record(ctx, req, 'auth.linked.out', 'Kendra');
    return send(res, 302, '', { Location: `${view().kendraUrl}/link/ftr/in?pass=${passFor(ctx.user)}&to=${encodeURIComponent(to)}` });
  });
  // Kendra asks who is here. A redirect from another site carries no SameSite=Strict cookie: one hop through a page
  // of this site, and the cookie comes with it.
  r('GET', '/link/kendra/authorize', (req, ctx, body, res, url) => {
    if (!ready()) return notLinked(res);
    return html(res, movePage(`/link/kendra/authorize2?to=${encodeURIComponent(safePath(url.searchParams.get('to') || '/'))}`, 'Checking your FTR command center sign-in…'));
  });
  r('GET', '/link/kendra/authorize2', (req, ctx, body, res, url) => {
    if (!ready()) return notLinked(res);
    const base = view().kendraUrl;
    // Signed in as someone else by an Admin (Sign in as) does not carry over: only one's own account.
    if (!ctx || ctx.impersonator) return send(res, 302, '', { Location: `${base}/link/ftr/none` });
    record(ctx, req, 'auth.linked.out', 'Kendra');
    return send(res, 302, '', { Location: `${base}/link/ftr/in?pass=${passFor(ctx.user)}&to=${encodeURIComponent(safePath(url.searchParams.get('to') || '/'))}` });
  });
  // Kendra vouches for someone signed in there.
  r('GET', '/link/kendra/in', async (req, ctx, body, res, url) => {
    if (!ready()) return notLinked(res);
    const ip = ipOf(req);
    req.ccAudited = true;
    const to = safePath(url.searchParams.get('to') || '/');
    let who;
    try {
      who = readPass(url.searchParams.get('pass'), { key: view().key, me: 'ftr', from: 'kendra', used });
    } catch (error) {
      audit.record({ action: 'auth.linked.refused', ip, details: { error: error.message } });
      return html(res, movePage('/#/login?linked=none', 'Could not sign you in', error.message));
    }
    let user = iam.byEmail(who.email);
    // New here, with a work address of a domain that may join (Settings → People → Sign-in): added on arrival, as a
    // Sales Engineer in the top team, and listed on People for whoever manages people to review (team and role).
    if (!user && mayJoin(who.email)) {
      try {
        const role = iam.roles().se ? 'se' : Object.keys(iam.roles()).find((id) => id !== 'admin' && !(iam.roles()[id].permissions ?? []).some((p) => ['users.manage', 'roles.manage', 'teams.manage', 'scope.all'].includes(p)));
        const top = teams.list().find((t) => !t.parentId) ?? null;
        ({ user } = await iam.create({ email: who.email, name: who.name || who.email.split('@')[0], role, teamId: top?.id ?? null }));
        const at = new Date().toISOString();
        Object.assign(user, { mustChangePassword: false, joined: { at, teamId: top?.id ?? null, role, reviewedAt: null, reviewedBy: null, via: 'kendra' } });
        iam.save();
        audit.record({ actor: actor(user), action: 'user.create.linked', target: user.email, ip, details: { role, team: top?.name ?? '' } });
      } catch (error) {
        audit.record({ action: 'auth.linked.refused', target: who.email, ip, details: { error: error.message } });
      }
    }
    if (!user || user.active === false) {
      audit.record({ action: 'auth.linked.refused', target: who.email, ip, details: { why: user ? 'access turned off' : 'no access' } });
      return html(res, movePage('/#/login?linked=none', 'No access yet', user ? 'Your access to the FTR command center is turned off: ask an Admin.' : 'You are signed in to Kendra, but you have no access to the FTR command center yet: ask an Admin to add you with the same email.'));
    }
    // Signed in by Kendra, as with single sign-on: a password of their own is not needed for this.
    if (user.mustChangePassword) user.mustChangePassword = false;
    user.lastSignInAt = new Date().toISOString();
    user.lastSignInMethod = 'kendra';
    iam.save();
    const { token } = iam.openSession(user.id, { idleMs, ip, agent: req.headers['user-agent'] });
    audit.record({ actor: actor(user), action: 'auth.linked.signin', target: 'Kendra', ip });
    // A page of this site moves on, so the browser sends the new (SameSite=Strict) cookie with the next request.
    return html(res, movePage(to === '/' ? '/#/' : to, 'Signed in'), { 'Set-Cookie': cookie(token, Math.floor(idleMs / 1000), req) });
  });
  // Kendra reads the team structure (teams, leaders, people), asking with a pass made for this alone.
  r('GET', '/link/kendra/directory', (req, ctx, body, res) => {
    if (!ready()) return send(res, 404, { error: 'Not linked.' });
    try {
      readPass(String(req.headers['x-link-pass'] ?? ''), { key: view().key, me: 'ftr', from: 'kendra', used, purpose: 'directory' });
    } catch (error) {
      audit.record({ action: 'link.directory.refused', ip: ipOf(req), details: { error: error.message } });
      return send(res, 403, { error: error.message });
    }
    req.ccAudited = true;
    const all = teams.list();
    const people = iam.users().filter((u) => u.active !== false).map((u) => ({ email: u.email, name: u.name, title: u.title ?? '', role: u.role, roleName: iam.roles()[u.role]?.name ?? u.role, teamId: u.teamId ?? null }));
    audit.record({ action: 'link.directory', target: 'Kendra', ip: ipOf(req), details: { teams: all.length, people: people.length } });
    return send(res, 200, { at: new Date().toISOString(), teams: all.map((t) => ({ id: t.id, name: t.name, region: t.region ?? '', parentId: t.parentId ?? null, leaderIds: t.leaderIds ?? [] })), people: people.map((p) => ({ ...p, id: iam.byEmail(p.email)?.id })) });
  });
  r('GET', '/link/kendra/none', (req, ctx, body, res) => html(res, movePage('/#/login?linked=none', 'Sign in')));

  return {
    linkedView: () => (ready() ? { kendra: view().kendraUrl } : null),
    // The passes used in the last minute go to the next version (CLAUDE.md: nothing held in memory is lost).
    linkedHandoff: () => [...used],
    linkedAdopt: (list) => {
      for (const [n, exp] of Array.isArray(list) ? list : []) if (exp > Date.now()) used.set(n, exp);
    },
  };
}
