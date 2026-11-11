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
/** The three letters Salesforce adds to a 15-character id (its case, in code): an 18-character id must end in them. */
export function sfChecksum(id15) {
  const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  let out = '';
  for (let block = 0; block < 3; block++) {
    let n = 0;
    for (let i = 0; i < 5; i++) if (/[A-Z]/.test(id15[block * 5 + i])) n |= 1 << i;
    out += map[n];
  }
  return out;
}
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
  // What the link is to: the object in a Lightning link (/lightning/r/Opportunity/006…/view) and the record's prefix
  // (006 an opportunity, 001 an account) must agree; a contact, lead or anything else is not taken.
  const parts = url.pathname.split('/').filter(Boolean);
  const recordId = parts.find((p) => SF_ID.test(p)) ?? '';
  const object = (parts[parts.indexOf('r') + 1] ?? '').toLowerCase();
  const byPrefix = recordId.startsWith('006') ? 'opportunity' : recordId.startsWith('001') ? 'account' : '';
  const byObject = parts.includes('r') ? ({ opportunity: 'opportunity', account: 'account' })[object] ?? 'other' : '';
  if (recordId.length === 18 && sfChecksum(recordId.slice(0, 15)) !== recordId.slice(15)) throw fail(400, `The record id in that link (${recordId}) is not a whole Salesforce id: copy the link again from the address bar.`);
  if (!recordId || !byPrefix || (byObject && byObject !== byPrefix)) throw fail(400, 'That link is not to an opportunity or an account: open the opportunity (006\u2026) or the account (001\u2026) in Salesforce and copy its link from the address bar.');
  const kind = byPrefix;
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
  cxone: a.cxone ? { tenant: a.cxone.tenant, baseUrl: a.cxone.baseUrl, savedBy: a.cxone.savedBy, savedAt: a.cxone.savedAt, lastReadAt: a.cxone.lastReadAt ?? null } : null,
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
  source: r.source ?? 'calculator',
  sentTotal: r.sentTotal ?? null,
  changes: r.changes ?? [],
  customerNote: r.customerNote ?? '',
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
  setDetails(id, teamIds, { salesforceUrl, ownerId, teamId, name, impactEnabled, impactCurrency }, hosts, { impactBase = null } = {}) {
    const account = this.get(id, teamIds);
    // Impact (beta): the soft savings in the report, off until the SE turns it on and confirms the currency.
    if (impactCurrency !== undefined) {
      const cur = String(impactCurrency).toUpperCase();
      if (!/^[A-Z]{3}$/.test(cur)) throw fail(400, 'Choose a currency.');
      // The first time: what the account does not say yet comes from the SE's own figures (Your profile).
      // Before it was ever confirmed the account holds only defaults: the SE's own figures (Your profile) replace them.
      const own = !account.impactCurrencyConfirmed && impactBase ? Object.fromEntries(Object.entries(impactBase).filter(([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'currency')) : {};
      account.impact = impactSettings({ ...account.impact, ...own, currency: cur });
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

  // ---- The account's Checkmarx One key, kept sealed so its projection can be refreshed in one click -------------------
  saveCxone(id, teamIds, { sealedKey, connection, user }) {
    const account = this.get(id, teamIds);
    account.cxone = { sealedKey, tenant: connection.tenant, baseUrl: connection.baseUrl, iamUrl: connection.iamUrl, savedBy: user.name, savedById: user.id, savedAt: new Date().toISOString(), lastReadAt: account.cxone?.lastReadAt ?? null };
    return this.accounts.put(account);
  }
  /** The sealed key and where it connects: for the server only, never a browser. */
  cxoneOf(id, teamIds) {
    return this.get(id, teamIds).cxone ?? null;
  }
  forgetCxone(id, teamIds) {
    const account = this.get(id, teamIds);
    delete account.cxone;
    return this.accounts.put(account);
  }
  markRead(id) {
    const account = this.accounts.get(id);
    if (account?.cxone) this.accounts.put({ ...account, cxone: { ...account.cxone, lastReadAt: new Date().toISOString() } });
  }

  /** A report with the customer's own numbers, recorded as theirs. */
  addCustomerReport({ customerId, data, user, note, sentTotal, changes }, teamIds) {
    const report = this.addReport({ customerId, data, user }, teamIds);
    const full = this.reports.get(report.id);
    return this.reports.put({ ...full, source: 'customer', customerNote: String(note ?? '').slice(0, 300), sentTotal: Number.isFinite(sentTotal) ? sentTotal : null, changes: (changes ?? []).slice(0, 60).map((c) => String(c).slice(0, 200)) });
  }

  // ---- Credits sold: one or many sales per account, against its projection --------------------------------------
  addSale(id, teamIds, { credits, date, reference = '', note = '', reportId = null, opportunityUrl = '' }, user, hosts) {
    const account = this.get(id, teamIds);
    // A sale is against an opportunity: the one given, else the account's own link when it is an opportunity.
    const given = String(opportunityUrl ?? '').trim();
    if (!given && account.salesforceKind !== 'opportunity') throw fail(400, 'Give the Salesforce opportunity link of this sale: the account\u2019s own link is to the account, not an opportunity.');
    const opp = checkSalesforceUrl(given || account.salesforceUrl, hosts);
    if (opp.kind !== 'opportunity') throw fail(400, 'That is a link to an account: a sale needs the opportunity (006\u2026) it was won on.');
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
    const sale = { id: randomUUID(), credits: Math.round(n), date: day, opportunityUrl: opp.url, opportunityId: opp.recordId, reference: plain(reference, 120), note: plain(note, 300), reportId: reportId || null, byId: user.id, by: user.name, at: new Date().toISOString() };
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
