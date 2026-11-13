import { homeOf } from '../rbac.js';
import { fail } from '../store.js';

/**
 * Sign in as (an Admin sees and works as another person, recorded as the Admin acting as them), and removing a person.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerImpersonate(d) {
  const {
    calc, canManage, endActAs, iam, IMPERSONATE_MS, passwordResets, perm, r, record, signedIn, teams,
  } = d;
  // ---- Sign in as: an Admin sees and works as another person, recorded as the Admin acting as them ----
  r('POST', '/api/people/:id/impersonate', perm('users.impersonate'), (req, ctx, body, res, url, params) => {
    if (ctx.impersonator) throw fail(409, 'Go back to your own account first.');
    const target = iam.byId(params.id);
    if (!target) throw fail(404, 'That person no longer has access.');
    if (target.id === ctx.user.id) throw fail(400, 'That is you.');
    if (target.active === false) throw fail(409, 'Their access is turned off: turn it on first.');
    ctx.session.actAs = { userId: target.id, at: Date.now(), until: Date.now() + IMPERSONATE_MS };
    iam.sessions.save();
    record(ctx, req, 'auth.impersonate.start', target.email, { id: target.id, role: target.role, minutes: IMPERSONATE_MS / 60_000 });
    return { ok: true, home: homeOf(target.role, iam.roles()[target.role]) };
  });
  r('POST', '/api/auth/impersonate/stop', signedIn, (req, ctx) => {
    if (!ctx.impersonator) return { ok: true };
    record(ctx, req, 'auth.impersonate.stop', ctx.user.email, { id: ctx.user.id, minutes: Math.round((Date.now() - ctx.session.actAs.at) / 60_000) });
    endActAs(ctx.session);
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
}
