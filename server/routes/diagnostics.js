import { listBackups } from '../backup.js';
import fs from 'node:fs';

/**
 * The troubleshooting report, the audit log and the Checkmarx One activity log.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerDiagnostics(d) {
  const {
    accounts, audit, backupDir, backupPassphraseOf, config, csv, httpsManager, iam, mailReady, perm, r,
    recentErrors, record, resetReady, sso, supervised, teams, VERSION, versionLabel, versionStore,
  } = d;
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
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      uptimeMinutes: Math.round((Date.now() - startedAt) / 60000),
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      disk,
      https: httpsManager.describe(),
      sso: { ready: sso.ready() },
      email: { ready: mailReady(), resetReady: resetReady().ready },
      updates: { running: VERSION, supervised, auto: versionStore.state.auto, lastCheck: versionStore.state.lastCheck, failed: versionStore.state.failed, events: (versionStore.state.events ?? []).slice(0, 10) },
      backups: { dir: backupDir, separate: Boolean(config.backupDir), count: listBackups(backupDir).length, last: listBackups(backupDir)[0] ?? null, lastAttempt: d.lastBackup, sealed: Boolean(backupPassphraseOf()) },
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
  r('GET', '/api/audit/export.csv', perm('audit.view'), (req, ctx, body, res, url) => {
    const events = audit.recent({ limit: 100000, filter: d.auditFilter(url.searchParams) });
    record(ctx, req, 'audit.export', '', { rows: events.length, filters: Object.fromEntries(url.searchParams) });
    return { csv: csv(['When', 'Who', 'Email', 'Action', 'On', 'Details', 'Address'], events.map((e) => [e.at, e.actor?.name ?? '', e.actor?.email ?? '', e.action, e.target, JSON.stringify(e.details ?? {}), e.ip])), name: 'audit.csv' };
  });
}
