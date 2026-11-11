/**
 * Accounts (the calculator's customers) and their projection reports, kept for everyone.
 *
 * Each account is exactly a Cx Credits Calculator customer (vendor/mz/public/calculator/profiles.js: its
 * projections, scope and settings, cleaned by MZ's own cleaners) plus what the command center adds:
 *   teamId          the team (region) it belongs to: everyone in that team may work on it
 *   ownerId         the Sales Engineer accountable for it
 *   salesforceUrl   the Salesforce opportunity or account it is for: required before a report can be made
 *   primaryReportId the report that stands for the account on the dashboards (else its latest)
 *
 * Each report is exactly a calculator report (newReport: its figures, total and bundles worked out again on the
 * server) plus who made it, for which team and Salesforce record, and whether and when it was shared with the
 * customer.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { impactSettings } from '../vendor/mz/public/calculator/model.js';
import { MAX_PROFILES, migrate, newProfile, newReport, patchProfile, reportMeta, summary } from '../vendor/mz/public/calculator/profiles.js';
import { Collection, fail } from './store.js';

const SF_ID = /^(001|006)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
export const DEFAULT_SALESFORCE_HOSTS = ['salesforce.com', 'force.com'];

/**
 * A Salesforce link to an opportunity or an account: https on a Salesforce host (or one the Admin allows), with
 * the record's id in it (001… account, 006… opportunity). Returns { url, kind, recordId } or throws.
 */
export function checkSalesforceUrl(value, hosts = DEFAULT_SALESFORCE_HOSTS) {
  const textValue = String(value ?? '').trim();
  if (!textValue) throw fail(400, 'Give the Salesforce opportunity or account link: it is required for every account.');
  let url;
  try {
    url = new URL(textValue);
  } catch {
    throw fail(400, 'That is not a link: copy it from the address bar of the opportunity or account in Salesforce.');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw fail(400, `Give a https link to Salesforce (${hosts.join(', ')}).`);
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const recordId = parts.find((p) => SF_ID.test(p)) ?? '';
  if (!recordId) throw fail(400, 'That link is not to an opportunity or an account: open the opportunity (006…) or account (001…) in Salesforce and copy its link.');
  const kind = recordId.startsWith('006') ? 'opportunity' : 'account';
  url.hash = '';
  return { url: url.toString().slice(0, 600), kind, recordId };
}

const accountMeta = (a) => ({
  ...summary(migrate(a)),
  teamId: a.teamId ?? null,
  ownerId: a.ownerId ?? null,
  createdById: a.createdById ?? null,
  salesforceUrl: a.salesforceUrl ?? '',
  salesforceKind: a.salesforceKind ?? '',
  salesforceId: a.salesforceId ?? '',
  primaryReportId: a.primaryReportId ?? null,
  impactEnabled: Boolean(a.impactEnabled),
  soldCredits: (a.sales ?? []).reduce((n, x) => n + (Number(x.credits) || 0), 0),
  salesCount: (a.sales ?? []).length,
  lastSaleAt: (a.sales ?? []).map((x) => x.date).sort().at(-1) ?? null,
  impactCurrencyConfirmed: Boolean(a.impactCurrencyConfirmed),
});

const reportIndex = (r) => ({
  ...reportMeta(r),
  teamId: r.teamId ?? null,
  createdById: r.createdById ?? null,
  ownerId: r.ownerId ?? null,
  salesforceUrl: r.salesforceUrl ?? '',
  salesforceKind: r.salesforceKind ?? '',
  sharedAt: r.sharedAt ?? null,
  sharedById: r.sharedById ?? null,
  sharedNote: r.sharedNote ?? '',
});

export class Accounts {
  constructor(dataDir) {
    this.accounts = new Collection(path.join(dataDir, 'accounts'), accountMeta);
    this.reports = new Collection(path.join(dataDir, 'reports'), reportIndex);
  }

  // ---- Accounts ---------------------------------------------------------------------------------

  list(teamIds) {
    return this.accounts.list().filter((a) => teamIds.has(a.teamId));
  }
  /** An account in one of the teams given, or 404 (another team's account is not said to exist). */
  get(id, teamIds) {
    const meta = this.accounts.meta(id);
    if (!meta || !teamIds.has(meta.teamId)) throw fail(404, 'That account no longer exists, or is not in a team you work in.');
    return migrate(this.accounts.get(id));
  }
  create({ name, teamId, user, impact = {} }) {
    if (this.accounts.list().filter((a) => a.teamId === teamId).length >= MAX_PROFILES * 10) throw fail(409, 'This team has too many accounts: delete some first.');
    const profile = newProfile({ name, by: user.name, impact });
    const account = { ...profile, teamId, ownerId: user.id, createdById: user.id, salesforceUrl: '', salesforceKind: '', salesforceId: '', primaryReportId: null };
    return this.accounts.put(account);
  }
  update(id, teamIds, patch, user) {
    const current = this.get(id, teamIds);
    const next = patchProfile(current, patch, user.name);
    return this.accounts.put(next);
  }
  setDetails(id, teamIds, { salesforceUrl, ownerId, teamId, name, impactEnabled, impactCurrency }, hosts) {
    const account = this.get(id, teamIds);
    // Impact (beta): the soft savings in the report, off until the SE turns it on and confirms the currency.
    if (impactCurrency !== undefined) {
      const cur = String(impactCurrency).toUpperCase();
      if (!/^[A-Z]{3}$/.test(cur)) throw fail(400, 'Choose a currency.');
      account.impact = impactSettings({ ...account.impact, currency: cur });
      account.impactCurrencyConfirmed = true;
    }
    if (impactEnabled !== undefined) {
      if (impactEnabled && !account.impactCurrencyConfirmed) throw fail(409, 'Confirm the currency for this account first.');
      account.impactEnabled = Boolean(impactEnabled);
    }
    if (salesforceUrl !== undefined) {
      const sf = checkSalesforceUrl(salesforceUrl, hosts);
      Object.assign(account, { salesforceUrl: sf.url, salesforceKind: sf.kind, salesforceId: sf.recordId });
    }
    if (ownerId !== undefined) account.ownerId = ownerId;
    if (teamId !== undefined) {
      account.teamId = teamId;
      for (const r of this.reports.list().filter((x) => x.customerId === id)) {
        const full = this.reports.get(r.id);
        if (full) this.reports.put({ ...full, teamId });
      }
    }
    if (name !== undefined && String(name).trim()) account.name = String(name).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
    account.updatedAt = new Date().toISOString();
    return this.accounts.put(account);
  }
  remove(id, teamIds) {
    this.get(id, teamIds);
    for (const r of this.reports.list().filter((x) => x.customerId === id)) this.reports.remove(r.id);
    this.accounts.remove(id);
  }

  // ---- Credits sold: one or many sales per account, against its projection --------------------------------------
  addSale(id, teamIds, { credits, date, reference = '', note = '', reportId = null }, user) {
    const account = this.get(id, teamIds);
    const n = Number(credits);
    if (!Number.isFinite(n) || n <= 0 || n > 1e10) throw fail(400, 'Give the credits sold: a number above zero.');
    const day = String(date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) throw fail(400, 'Give the date of the sale.');
    if (Date.parse(day) > Date.now() + 86400e3) throw fail(400, 'A sale cannot be in the future.');
    if (reportId) {
      const r = this.reports.meta(reportId);
      if (!r || r.customerId !== id) throw fail(400, 'That report is not one of this account\u2019s.');
    }
    const plain = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
    const sale = { id: randomUUID(), credits: Math.round(n), date: day, reference: plain(reference, 120), note: plain(note, 300), reportId: reportId || null, byId: user.id, by: user.name, at: new Date().toISOString() };
    account.sales = [...(account.sales ?? []), sale].slice(-500);
    this.accounts.put(account);
    return sale;
  }
  removeSale(id, teamIds, saleId, { user, any }) {
    const account = this.get(id, teamIds);
    const sale = (account.sales ?? []).find((x) => x.id === saleId);
    if (!sale) throw fail(404, 'That sale is no longer recorded.');
    if (!any && sale.byId !== user.id) throw fail(403, 'You can remove only the sales you recorded.');
    account.sales = account.sales.filter((x) => x.id !== saleId);
    this.accounts.put(account);
    return sale;
  }

  // ---- Reports ----------------------------------------------------------------------------------

  reportsOf(teamIds, customerId = '') {
    return this.reports
      .list()
      .filter((r) => teamIds.has(r.teamId) && (!customerId || r.customerId === customerId))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  report(id, teamIds) {
    const meta = this.reports.meta(id);
    if (!meta || !teamIds.has(meta.teamId)) throw fail(404, 'That report no longer exists, or is not in a team you work in.');
    return this.reports.get(id);
  }
  /** A report for an account: refused until the account has its Salesforce link. */
  addReport({ customerId, data, user }, teamIds) {
    const account = this.get(customerId, teamIds);
    if (!account.salesforceUrl) throw fail(409, 'Add the Salesforce opportunity or account link for this account first (at the top of the page): every report must be tied to one.');
    const report = newReport({ customerId: account.id, customer: account.name, by: user.name, data });
    Object.assign(report, { teamId: account.teamId, createdById: user.id, ownerId: account.ownerId, salesforceUrl: account.salesforceUrl, salesforceKind: account.salesforceKind, sharedAt: null, sharedById: null, sharedNote: '' });
    return this.reports.put(report);
  }
  markShared(id, teamIds, { shared, note = '' }, user) {
    const report = this.report(id, teamIds);
    if (shared) Object.assign(report, { sharedAt: new Date().toISOString(), sharedById: user.id, sharedNote: String(note ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300) });
    else Object.assign(report, { sharedAt: null, sharedById: null, sharedNote: '' });
    return this.reports.put(report);
  }
  setPrimary(customerId, reportId, teamIds) {
    const account = this.get(customerId, teamIds);
    if (reportId) {
      const r = this.reports.meta(reportId);
      if (!r || r.customerId !== customerId) throw fail(400, 'That report is not one of this account’s.');
    }
    account.primaryReportId = reportId || null;
    return this.accounts.put(account);
  }
  removeReport(id, teamIds) {
    const report = this.report(id, teamIds);
    this.reports.remove(id);
    const account = this.accounts.get(report.customerId);
    if (account?.primaryReportId === id) this.accounts.put({ ...account, primaryReportId: null });
    return report;
  }

  /** The report standing for an account: the one marked primary, else the latest. */
  primaryOf(accountMeta) {
    const own = this.reports.list().filter((r) => r.customerId === accountMeta.id);
    const marked = accountMeta.primaryReportId ? own.find((r) => r.id === accountMeta.primaryReportId) : null;
    if (marked) return { report: marked, how: 'marked' };
    const latest = own.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    return latest ? { report: latest, how: 'latest' } : { report: null, how: 'none' };
  }
}
