import { describeBackup, isUpdateBackup, listBackups, readBackup, restoreBackup, writeBackupTo } from '../backup.js';
import { fail } from '../store.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Backups: nightly, before every version switch and by hand; download, look inside and restore.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerBackups(d) {
  const {
    accounts, audit, backupDir, backupPassphraseOf, config, log, perm, r, record, recovered, secrets,
    settings, startJobs, stopJobs, userName, VERSION,
  } = d;
  // ---- Backups (the calculator’s way): nightly, before every version switch, by hand; download and restore -------------
  for (const e of recovered) audit.record({ action: e.outcome === 'restored' ? 'recover.restored' : 'recover.setAside', target: e.file, details: e });
  const takeBackup = (reason) => {
    try {
      const b = writeBackupTo(backupDir, { dataDir: config.dataDir, passphrase: backupPassphraseOf(), version: VERSION, reason });
      audit.record({ action: 'backup.written', target: b.name, details: { reason, bytes: b.bytes, sha256: b.sha256, sealed: Boolean(backupPassphraseOf()), dir: backupDir } });
      d.lastBackup = { ok: true, at: new Date().toISOString(), error: '' };
      return b.name;
    } catch (error) {
      d.lastBackup = { ok: false, at: new Date().toISOString(), error: error.message };
      audit.record({ action: 'backup.failed', details: { reason, error: error.message, dir: backupDir } });
      log(`! [backup] Could not write a backup to ${backupDir}: ${error.message}`);
      throw Object.assign(new Error(`The backup could not be written to ${backupDir}: ${error.message}`), { status: 500 });
    }
  };
  const backupPerm = perm('backup.manage');
  // Backups sealed with a passphrase: BACKUP_PASSPHRASE when the server starts, else the one the Admin sets here (kept
  // sealed with this server's key, never shown again). Applies from the next backup, without a restart.
  r('PUT', '/api/backups/seal', backupPerm, (req, ctx, body) => {
    if (config.env?.BACKUP_PASSPHRASE) throw fail(409, 'Backups are sealed with BACKUP_PASSPHRASE, set where the server starts: change it there.');
    const pass = String(body?.passphrase ?? '');
    if (pass && pass.length < 12) throw fail(400, 'A passphrase of at least 12 characters.');
    settings.value.backupSeal = pass ? secrets.seal(pass) : null;
    settings.save();
    record(ctx, req, pass ? 'backup.seal.set' : 'backup.seal.removed', '');
    return { sealed: Boolean(pass) };
  });
  r('GET', '/api/backups', backupPerm, () => ({ backups: listBackups(backupDir), sealed: Boolean(backupPassphraseOf()), sealedBy: config.env?.BACKUP_PASSPHRASE ? 'environment' : settings.value.backupSeal ? 'settings' : '', dir: backupDir, separate: Boolean(config.backupDir), last: d.lastBackup, recovered: audit.recent({ limit: 20, filter: (e) => e.action.startsWith('recover.') }) }));
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
    // The audit log on disk is the backup's now: the chain goes on from its last line, not from the one replaced.
    audit.reload();
    record(ctx, req, 'backup.restore', bundle.at, { ...describeBackup(bundle), before });
    if (d.supervised) {
      // Nothing more is written by this process: the version taking over reads what was restored.
      d.frozen = 'A backup was just restored: the command center is loading it. Try again in a few seconds.';
      setTimeout(() => d.reload('backup restored'), 300).unref?.();
    }
    return { restored: describeBackup(bundle), before, restarting: d.supervised };
  });
  // Accounts started (name and Salesforce link) and left with nothing to calculate for a day: discarded, and said so.
  const sweepStarted = () => {
    try {
      for (const a of accounts.discardStale()) {
        try {
          audit.record({ actor: { id: 'system', name: 'Command Center', email: '' }, action: 'account.discarded', target: a.name, details: { id: a.id, startedAt: a.since, by: userName(a.ownerId), reason: 'no projection within a day' } });
        } catch {}
      }
    } catch (error) {
      log(`[accounts] ${error.message}`);
    }
  };
  startJobs.push(() => {
    sweepStarted();
    const t = setInterval(sweepStarted, 60 * 60 * 1000);
    t.unref?.();
    stopJobs.push(() => clearInterval(t));
  });
  startJobs.push(() => {
    // Nightly: an hour after the last one is a day old.
    const t = setInterval(() => {
      // The newest that is not one taken before an update: those do not stand in for the nightly one.
      const last = listBackups(backupDir).find((b) => !isUpdateBackup(b.name));
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

  return { takeBackup };
}
