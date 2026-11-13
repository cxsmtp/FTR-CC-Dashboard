import { IntegrityService } from '../integrity/service.js';
import { fail } from '../store.js';
import { UpdateService, VersionStore } from '../updates.js';

/**
 * Updates and rollback: releases, installing, switching versions, software integrity.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerUpdates(d) {
  const {
    audit, config, log, perm, r, record, startJobs, stopJobs, takeBackup, updateService, VERSION,
  } = d;
  // ---- Updates and rollback (server/updates.js, server/launch.js) ------------------------------------------------------
  const supervised = process.env.CC_SUPERVISOR === '1';
  /** Load a version (this one again, or another): the launcher starts it beside this one and hands it the traffic, with no restart. */
  const reload = (reason) => {
    if (process.env.CC_LAUNCHER_SOCKETS === '1' && process.send) process.send({ type: 'reload', reason });
    else process.exit(75);
  };
  const versionStore = new VersionStore({ dataDir: config.dataDir, builtInDir: process.env.CC_BUILTIN_DIR || config.root, builtInVersion: process.env.CC_BUILTIN_VERSION || VERSION });
  const updates = updateService ?? new UpdateService({ store: versionStore, runningVersion: VERSION, repo: String(config.env?.UPDATE_REPO || 'cxsmtp/FTR-CC-Dashboard'), token: String(config.env?.UPDATE_GITHUB_TOKEN ?? ''), backup: async (reason) => takeBackup(reason), log, supervised, exit: (code) => (code === 75 ? reload('update') : process.exit(code)) });
  const updPerm = perm('system.update');
  // Software integrity (server/integrity): the running files against the release's signed file list.
  const integrity = new IntegrityService({
    appDir: config.root,
    dataDir: config.dataDir,
    repository: String(config.env?.UPDATE_REPO || 'cxsmtp/FTR-CC-Dashboard'),
    token: String(config.env?.UPDATE_GITHUB_TOKEN ?? ''),
    record: (r) => audit.record({ action: r.state === 'genuine' ? 'integrity.genuine' : r.state === 'unsigned' ? 'integrity.unsigned' : `integrity.${r.state}`, target: r.version ?? VERSION, details: { summary: r.summary, digest: r.digest ?? '' } }),
  });
  r('GET', '/api/integrity', updPerm, () => integrity.last ?? { state: 'checking', summary: 'Checking\u2026' });
  r('POST', '/api/integrity/check', updPerm, async (req, ctx) => {
    const result = await integrity.check({ reason: 'by hand' });
    record(ctx, req, 'integrity.check', result.state);
    return result;
  });
  r('GET', '/api/updates', updPerm, () => updates.status());
  r('POST', '/api/updates/check', updPerm, async (req, ctx) => {
    await updates.check();
    record(ctx, req, 'updates.check');
    // A newer release: installed and switched to now, not at the next check.
    const tick = await updates.autoTick().catch((error) => ({ error: error.message }));
    return { ...updates.status(), ...(tick?.switching ? { switching: true, to: tick.to } : {}), ...(tick?.error ? { installError: tick.error } : {}) };
  });
  r('POST', '/api/updates/install', updPerm, async (req, ctx, body) => {
    const done = await updates.install(String(body?.version ?? ''), { by: ctx.user.email });
    record(ctx, req, 'updates.install', done.version, { sha256: done.sha256, files: done.files });
    if (body?.switch === true) {
      await updates.switchTo(done.version, { by: ctx.user.email, reason: body?.rollback === true ? 'rollback by hand' : 'by hand' });
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
    const auto = updates.setAuto({ everyMinutes: body?.everyMinutes, stage: body?.stage, window: body?.window }, { by: ctx.user.email });
    record(ctx, req, 'updates.auto', `every ${auto.everyMinutes ?? 15} minutes`, { stage: auto.stage ?? '', window: auto.window ?? null });
    return updates.status();
  });
  r('POST', '/api/system/restart', updPerm, (req, ctx) => {
    if (!supervised) throw fail(409, 'This server was not started by the launcher: restart it where it runs.');
    record(ctx, req, 'system.restart');
    setTimeout(() => reload('reload by hand'), 300).unref?.();
    return { restarting: true };
  });
  startJobs.push(() => {
    updates.start();
    integrity.start();
    stopJobs.push(() => integrity.stop());
    stopJobs.push(() => updates.stop());
  });

  return { integrity, reload, supervised, updates, versionStore };
}
