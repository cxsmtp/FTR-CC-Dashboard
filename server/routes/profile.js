import { imageFromUpload, imageHeaders } from '../branding.js';
import { send } from '../http.js';
import { clean, publicUser } from '../iam.js';
import { fail } from '../store.js';

/**
 * Your profile: your name, picture, look and Impact figures; the quick guide seen; signing out elsewhere.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerProfile(d) {
  const {
    ACCENTS, iam, ownSelf, r, ready2, record, signedIn, THEME_MODES,
  } = d;
  // ---- Your profile: your name, picture, time zone and Impact figures ----------------------------------------------
  r('PUT', '/api/me/profile', ownSelf, (req, ctx, body) => {
    const u = ctx.user;
    const changed = [];
    if (body?.name !== undefined) {
      const name = clean(body.name, 120);
      if (!name) throw fail(400, 'Give your name.');
      u.name = name;
      changed.push('name');
    }
    if (body?.timeZone !== undefined) {
      const tz = String(body.timeZone ?? '');
      if (tz) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
        } catch {
          throw fail(400, 'That is not a time zone.');
        }
      }
      u.prefs = { ...(u.prefs ?? {}), timeZone: tz.slice(0, 64) };
      changed.push('time zone');
    }
    if (body?.impact !== undefined) {
      const i = body.impact ?? {};
      const num = (v, max) => (v === '' || v === null || v === undefined ? undefined : Math.max(0, Math.min(max, Number(v) || 0)));
      const currency = i.currency ? String(i.currency).toUpperCase() : '';
      if (currency && !/^[A-Z]{3}$/.test(currency)) throw fail(400, 'Choose a currency.');
      u.prefs = { ...(u.prefs ?? {}), impact: { currency: currency || undefined, hourlyRate: num(i.hourlyRate, 100000), triageMinutes: num(i.triageMinutes, 600), fixMinutes: num(i.fixMinutes, 6000) } };
      changed.push('impact figures');
    }
    if (body?.picture !== undefined) {
      if (body.picture === null) iam.setPicture(u, null);
      else {
        const img = imageFromUpload(body.picture, 'Your picture');
        if (img.type === 'image/svg+xml') throw fail(415, 'Your picture: a PNG, JPEG or WebP image.');
        iam.setPicture(u, img);
      }
      changed.push('picture');
    }
    iam.save();
    record(ctx, req, 'me.profile', u.email, { changed });
    return { user: publicUser(u), prefs: u.prefs ?? {}, picture: u.picture ? `/api/people/${u.id}/picture?v=${encodeURIComponent(u.picture.at)}` : null };
  });
  /** A person's picture, for whoever is signed in. */
  r('GET', '/api/people/:id/picture', signedIn, (req, ctx, body, res, url, params) => {
    const u = iam.byId(params.id);
    const picture = iam.pictureOf(u);
    if (!picture) return send(res, 404, { error: 'No picture.' });
    return send(res, 200, picture.bytes, { ...imageHeaders(picture), 'Cache-Control': 'private, max-age=86400' });
  });
  /** Sign out everywhere else (this browser stays signed in). */
  r('POST', '/api/me/signout-others', ownSelf, (req, ctx) => {
    iam.endSessionsOf(ctx.user.id, { except: ctx.session.id });
    record(ctx, req, 'me.signout.others', ctx.user.email);
    return { ok: true };
  });
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
    // Command Center's phosphor colour.
    if (body?.ops !== undefined) {
      if (!['green', 'cyan', 'blue', 'amber', 'red', 'violet'].includes(body.ops)) throw fail(400, 'Choose one of the colours.');
      prefs.ops = body.ops;
    }
    if (body?.seenVersion !== undefined) prefs.seenVersion = String(body.seenVersion).slice(0, 20);
    // The Overview cards this person chose to see (Cards ▾).
    if (body?.cards !== undefined) {
      if (!Array.isArray(body.cards)) throw fail(400, 'Choose the cards as a list.');
      prefs.cards = [...new Set(body.cards.map(String).filter((c) => /^[a-z]{2,20}$/.test(c)))].slice(0, 20);
    }
    ctx.user.prefs = prefs;
    iam.save();
    return { prefs };
  });
  r('POST', '/api/me/guide', ready2, (req, ctx) => {
    iam.markGuideSeen(ctx.user.id);
    return { ok: true };
  });
}
