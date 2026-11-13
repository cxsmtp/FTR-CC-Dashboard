import { teamPath } from '../rbac.js';

/**
 * CSV exports of accounts and reports.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerExports(d) {
  const {
    perm, r, record, rows, userName,
  } = d;
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

  return { csv };
}
