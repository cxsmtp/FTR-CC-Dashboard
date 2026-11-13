import { cleanColour, DEFAULT_BRANDING, imageFromUpload, imageFromUrl, imageHeaders, LOOKS, publicBranding } from '../branding.js';
import { send } from '../http.js';
import { clean } from '../iam.js';
import { fail } from '../store.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Branding (Settings → Branding: the name, logo, icon and look every page shows), and signing in and out.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerBranding(d) {
  const {
    audit, calc, config, cookie, iam, idleMs, ipOf, isAdminUser, perm, r, record, settings, signInPerAccount,
    signInPerAddress, sso,
  } = d;
  // ---- Branding (Settings → Branding, server/branding.js): what every page shows, even before signing in ------------
  const branding = () => ({ ...DEFAULT_BRANDING, ...(settings.value.branding ?? {}) });
  const brandingView = () => {
    const v = publicBranding(branding(), settings.value.theme);
    // With no logo of the organisation's, the default one (when the build carries it).
    if (!v.logo && fs.existsSync(path.join(config.root, 'public', 'brand', 'default-logo.png'))) v.logo = '/brand/logo?v=default';
    if (!v.icon && fs.existsSync(path.join(config.root, 'public', 'brand', 'default-logo.png'))) v.icon = '/brand/logo?v=default'; // the same picture: fetched once
    return v;
  };
  r('GET', '/api/branding', () => brandingView());
  // The command center's own logo and icon when Branding sets none: public/brand/default-logo.png, when it is there.
  const DEFAULT_LOGO = path.join(config.root, 'public', 'brand', 'default-logo.png');
  const hasDefaultLogo = () => fs.existsSync(DEFAULT_LOGO);
  let defaultLogo = null;
  /** Read once: the file does not change while this version runs. */
  const defaultLogoBytes = () => (defaultLogo ??= fs.readFileSync(DEFAULT_LOGO));
  const brandImage = (key, fallback) => (req, ctx, body, res) => {
    const img = branding()[key];
    if (img?.data) return send(res, 200, Buffer.from(img.data, 'base64'), imageHeaders(img));
    // Asked for by its versioned address (?v=…), it never changes: kept by the browser for a day, not asked again.
    const keep = new URL(req.url, 'http://x').searchParams.has('v') ? 'public, max-age=86400' : 'public, max-age=3600';
    if (hasDefaultLogo()) return send(res, 200, defaultLogoBytes(), { 'Content-Type': 'image/png', 'Cache-Control': keep });
    if (fallback) return send(res, 200, fs.readFileSync(path.join(d.PUBLIC_DIR, fallback)), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
    return send(res, 404, { error: 'No logo is set.' });
  };
  r('GET', '/brand/logo', brandImage('logo'));
  r('GET', '/brand/icon', brandImage('icon', 'favicon.svg'));
  /** Saved as it changes. Everything is checked first, so a refused change leaves what was there (the last good one). */
  r('PUT', '/api/settings/branding', perm('settings.manage'), async (req, ctx, body) => {
    const next = branding();
    const theme = { ...(settings.value.theme ?? { mode: 'light', accent: 'aurora' }) };
    const changed = [];
    if (body?.appName !== undefined) {
      next.appName = clean(body.appName, 40) || DEFAULT_BRANDING.appName;
      changed.push('app name');
    }
    if (body?.tagline !== undefined) {
      next.tagline = clean(body.tagline, 40);
      changed.push('tagline');
    }
    if (body?.organisationName !== undefined) {
      const org = clean(body.organisationName, 120);
      if (!org) throw fail(400, 'Give the company name: it is on every report.');
      settings.value.organisationName = org;
      changed.push('company name');
    }
    if (body?.accent !== undefined) {
      next.accent = cleanColour(body.accent);
      changed.push('accent colour');
    }
    if (body?.look !== undefined) {
      if (!LOOKS.includes(body.look)) throw fail(400, 'Choose one of the looks.');
      theme.accent = body.look;
      changed.push('look');
    }
    if (body?.mode !== undefined) {
      if (!['light', 'dark', 'system'].includes(body.mode)) throw fail(400, 'Choose light, dark or system.');
      theme.mode = body.mode;
      changed.push('mode');
    }
    if (body?.letChoose !== undefined) {
      next.letChoose = body.letChoose === true;
      changed.push('let people choose');
    }
    if (body?.menu !== undefined) {
      if (!['left', 'top'].includes(body.menu)) throw fail(400, 'Put the menu down the left side or across the top.');
      next.menu = body.menu;
      changed.push('menu');
    }
    for (const [key, what] of [['logo', 'The logo'], ['icon', 'The browser icon']]) {
      const v = body?.[key];
      if (v === undefined) continue;
      if (v === null) next[key] = null;
      else if (typeof v?.upload === 'string') next[key] = imageFromUpload(v.upload, what);
      else if (typeof v?.url === 'string' && v.url.trim()) next[key] = await imageFromUrl(v.url.trim(), what);
      else throw fail(400, `${what}: upload one, or give an https address.`);
      changed.push(key);
    }
    settings.value.branding = next;
    settings.value.theme = theme;
    settings.save();
    record(ctx, req, 'settings.branding', changed.join(', '), { changed });
    return { ...brandingView(), organisationName: settings.value.organisationName, logoFrom: next.logo?.from ?? '', iconFrom: next.icon?.from ?? '', logoBytes: next.logo?.bytes ?? 0, iconBytes: next.icon?.bytes ?? 0 };
  });

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
      // The calculator's memory is the one of whoever signed in (an Admin signed in as someone leaves theirs alone).
      const own = ctx.session.userId;
      if (!iam.sessions.value || !Object.values(iam.sessions.value.sessions).some((s) => s.userId === own)) calc.forget(own);
      record(ctx, req, 'auth.signout');
    }
    res.setHeader('Set-Cookie', cookie('', 0, req));
    return { ok: true };
  });

  return { brandingView };
}
