import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { sfLink, client, reportData, start } from './helpers.js';

let env;
before(async () => {
  env = await start();
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

const team = (id) => ({ 'X-Team': id });

test('sign-in: wrong passwords are refused alike, and locked after 5', async () => {
  const bad = await fetch(`${env.base}/api/auth/signin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@t.example', password: 'x' }) });
  assert.equal(bad.status, 401);
  for (let i = 0; i < 5; i++) await fetch(`${env.base}/api/auth/signin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'viewer@t.example', password: 'wrong-password-xx' }) });
  const locked = await fetch(`${env.base}/api/auth/signin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'viewer@t.example', password: 'Test-Password-For-Tests-1' }) });
  assert.equal(locked.status, 429);
  env.app.iam.byEmail('viewer@t.example').lockedUntil = 0;
});

test('the session cookie is httpOnly and SameSite=Strict, and every page carries security headers', async () => {
  const res = await fetch(`${env.base}/api/auth/signin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'se1@t.example', password: 'Test-Password-For-Tests-1' }) });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const page = await fetch(`${env.base}/`);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
});

test('changes need the CSRF token', async () => {
  const se = await client(env.base, 'se1@t.example');
  const r = await fetch(`${env.base}/api/projections`, { method: 'POST', headers: { cookie: se.cookie, 'Content-Type': 'application/json', 'X-Team': env.teams.emea.id }, body: '{"name":"x"}' });
  assert.equal(r.status, 403);
});

test('an account is its SE’s until its first report; then the team shares it, and other teams never see it', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const admin = await client(env.base, 'admin@t.example');
  const apac = await client(env.base, 'apac@t.example');
  const made = await se1.post('/api/projections', { name: 'Shared Corp', salesforceUrl: sfLink() }, team(env.teams.emea.id));
  assert.equal(made.status, 200);
  const id = made.data.customer.id;
  // Started (name and link) with nothing to calculate yet: only in its maker's calculator, nowhere else, not even for an Admin.
  assert.ok((await se1.get('/api/projections', team(env.teams.emea.id))).data.customers.some((c) => c.id === id));
  assert.ok(!(await se1.get('/api/accounts')).data.accounts.some((a) => a.id === id));
  assert.ok(!(await admin.get('/api/accounts')).data.accounts.some((a) => a.id === id));
  assert.equal((await se1.get(`/api/cc/accounts/${id}`)).data.pending, true);
  // Its first projection makes it: a draft, its SE's and the Admin's.
  assert.equal((await se1.put(`/api/projections/${id}`, { fusion: { projects: [{ id: 'p', name: 'payments', loc: 50000, frequency: 'month', source: 'scan' }] } }, team(env.teams.emea.id))).status, 200);
  assert.equal((await se1.get(`/api/cc/accounts/${id}`)).data.pending, false);
  // A draft: its SE and the Admin see it; a teammate and the leader do not, anywhere.
  assert.equal((await se2.get(`/api/projections/${id}`, team(env.teams.emea.id))).status, 404);
  assert.ok(!(await se2.get('/api/projections', team(env.teams.emea.id))).data.customers.some((c) => c.id === id));
  assert.equal((await lead.get(`/api/cc/accounts/${id}`)).status, 404);
  assert.ok(!(await lead.get('/api/accounts')).data.accounts.some((a) => a.id === id));
  assert.equal((await lead.put(`/api/cc/accounts/${id}`, { ownerId: env.users.se2.id })).status, 404);
  const own = (await se1.get('/api/accounts')).data.accounts.find((a) => a.id === id);
  assert.equal(own.draft, true);
  assert.equal((await admin.get(`/api/cc/accounts/${id}`)).data.draft, true);
  // Published by its first report: the team sees it.
  await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: sfLink() });
  assert.equal((await se1.post('/api/projections/reports', { customerId: id, data: reportData() }, team(env.teams.emea.id))).status, 200);
  assert.equal((await se1.get(`/api/cc/accounts/${id}`)).data.draft, false);
  // A teammate opens it, changes it and lists it.
  assert.equal((await se2.get(`/api/projections/${id}`, team(env.teams.emea.id))).status, 200);
  assert.ok((await se2.get('/api/projections', team(env.teams.emea.id))).data.customers.some((c) => c.id === id));
  // Another team: not its team, not its account.
  assert.equal((await apac.get('/api/projections', team(env.teams.emea.id))).status, 403);
  assert.equal((await apac.get(`/api/projections/${id}`, team(env.teams.apac.id))).status, 404);
  assert.equal((await apac.get(`/api/cc/accounts/${id}`)).status, 404);
  assert.ok(!(await apac.get('/api/accounts')).status || !(await apac.get('/api/accounts')).data.accounts.some((a) => a.id === id));
});

test('a report needs the Salesforce link; the latest is primary until one is marked', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const h = team(env.teams.emea.id);
  // No account without its Salesforce link, nor with one that is not Salesforce's.
  const refused = await se1.post('/api/projections', { name: 'Needs SF' }, h);
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /Salesforce/);
  assert.equal((await se1.post('/api/projections', { name: 'Needs SF', salesforceUrl: 'https://evil.example/006AB000001xYzQYAU' }, h)).status, 400);
  const link = sfLink();
  const { data } = await se1.post('/api/projections', { name: 'Needs SF', salesforceUrl: link }, h);
  const id = data.customer.id;
  assert.equal((await se1.get(`/api/cc/accounts/${id}`)).data.account.salesforceUrl, link);
  const r1 = await se1.post('/api/projections/reports', { customerId: id, data: reportData(1000, 500) }, h);
  assert.equal(r1.status, 200);
  assert.equal(r1.data.report.totalCredits, 1650);
  const r2 = await se1.post('/api/projections/reports', { customerId: id, data: reportData(2000, 1000) }, h);
  let acct = (await se1.get(`/api/cc/accounts/${id}`)).data.account;
  assert.equal(acct.primary.id, r2.data.report.id);
  assert.equal(acct.primary.how, 'latest');
  await se1.post(`/api/cc/reports/${r1.data.report.id}/primary`, { primary: true });
  acct = (await se1.get(`/api/cc/accounts/${id}`)).data.account;
  assert.equal(acct.primary.id, r1.data.report.id);
  assert.equal(acct.primary.how, 'marked');
  // Shared with the customer: with whom, as email addresses (required, each checked).
  assert.equal((await se1.post(`/api/cc/reports/${r1.data.report.id}/shared`, { shared: true })).status, 400);
  assert.equal((await se1.post(`/api/cc/reports/${r1.data.report.id}/shared`, { shared: true, sharedWith: 'the ciso' })).status, 400);
  const shared = await se1.post(`/api/cc/reports/${r1.data.report.id}/shared`, { shared: true, sharedWith: 'CISO@Customer.example, cto@customer.example' });
  assert.deepEqual(shared.data.reports.find((r) => r.id === r1.data.report.id).sharedWith, ['ciso@customer.example', 'cto@customer.example']);
});

test('deleting reports: your own unshared ones, or with the permission', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const h = team(env.teams.emea.id);
  const { data } = await se1.post('/api/projections', { name: 'Delete Co', salesforceUrl: sfLink() }, h);
  await se1.put(`/api/cc/accounts/${data.customer.id}`, { salesforceUrl: sfLink() });
  const mine = (await se1.post('/api/projections/reports', { customerId: data.customer.id, data: reportData() }, h)).data.report.id;
  const other = (await se1.post('/api/projections/reports', { customerId: data.customer.id, data: reportData() }, h)).data.report.id;
  assert.equal((await se2.del(`/api/cc/reports/${mine}`)).status, 403);
  await se1.post(`/api/cc/reports/${other}/shared`, { shared: true, sharedWith: 'buyer@customer.example' });
  assert.equal((await se1.del(`/api/cc/reports/${other}`)).status, 403);
  assert.equal((await se1.del(`/api/cc/reports/${mine}`)).status, 200);
  assert.equal((await lead.del(`/api/cc/reports/${other}`)).status, 200);
  // Published once, it stays so with its reports deleted. An SE cannot delete an account; the leader can.
  assert.equal((await se1.del(`/api/cc/accounts/${data.customer.id}`)).status, 403);
  assert.equal((await lead.del(`/api/cc/accounts/${data.customer.id}`)).status, 200);
});

test('dashboards roll up: leaders see their teams below, the VP sees every team, SEs only theirs', async () => {
  const apac = await client(env.base, 'apac@t.example');
  const h = team(env.teams.apac.id);
  const { data } = await apac.post('/api/projections', { name: 'APAC Co', salesforceUrl: sfLink() }, h);
  await apac.put(`/api/cc/accounts/${data.customer.id}`, { salesforceUrl: sfLink() });
  await apac.post('/api/projections/reports', { customerId: data.customer.id, data: reportData(10000, 0) }, h);
  const vp = await client(env.base, 'vp@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const se1 = await client(env.base, 'se1@t.example');
  const names = async (c) => (await c.get('/api/accounts')).data.accounts.map((a) => a.name);
  assert.ok((await names(vp)).includes('APAC Co'));
  assert.ok((await names(vp)).includes('Shared Corp'));
  assert.ok(!(await names(lead)).includes('APAC Co'));
  assert.ok((await names(lead)).includes('Shared Corp'));
  assert.ok(!(await names(se1)).includes('APAC Co'));
  const dash = (await vp.get('/api/dashboard')).data;
  const global = dash.teams.find((t) => t.id === env.teams.global.id);
  assert.ok(global.credits >= 11000);
  assert.equal((await lead.get(`/api/dashboard?team=${env.teams.apac.id}`)).status, 403);
});

test('viewers see dashboards but cannot use the calculator', async () => {
  const viewer = await client(env.base, 'viewer@t.example');
  assert.equal((await viewer.get('/api/dashboard')).status, 200);
  assert.equal((await viewer.get('/api/projections', team(env.teams.emea.id))).status, 403);
  const page = await fetch(`${env.base}/calculator`, { headers: { cookie: viewer.cookie }, redirect: 'manual' });
  assert.equal(page.status, 302);
});

test('people: nobody gives what they do not hold; a new person must choose a password and accept the terms', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const made = await admin.post('/api/people', { email: 'new@t.example', name: 'New', role: 'se', teamId: env.teams.emea.id });
  assert.equal(made.status, 200);
  const fresh = await client(env.base, 'new@t.example', made.data.temporary);
  assert.equal((await fresh.get('/api/dashboard')).status, 403);
  assert.equal((await fresh.post('/api/terms/accept')).status, 403);
  assert.equal((await fresh.post('/api/me/password', { current: made.data.temporary, next: 'short' })).status, 400);
  assert.equal((await fresh.post('/api/me/password', { current: made.data.temporary, next: 'A-much-better-password-9' })).status, 200);
  assert.equal((await fresh.get('/api/dashboard')).status, 403);
  assert.equal((await fresh.post('/api/terms/accept')).status, 200);
  assert.equal((await fresh.get('/api/dashboard')).status, 200);
  // A leader given "Manage people" by a custom role cannot make Admins.
  const role = await admin.put('/api/roles/new', { name: 'People lead', permissions: ['users.manage', 'dashboard.view', 'calculator.use'] });
  await admin.put(`/api/people/${env.users.emeaLead.id}`, { role: role.data.role.id });
  const lead = await client(env.base, 'emea.lead@t.example');
  assert.equal((await lead.post('/api/people', { email: 'x@t.example', name: 'X', role: 'admin', teamId: env.teams.emea.id })).status, 403);
  assert.equal((await lead.post('/api/people', { email: 'x@t.example', name: 'X', role: 'se', teamId: env.teams.apac.id })).status, 403);
  assert.equal((await lead.put(`/api/people/${env.users.admin.id}`, { name: 'Hacked' })).status, 404);
  await admin.put(`/api/people/${env.users.emeaLead.id}`, { role: 'leader' });
});

test('there is always an active Admin', async () => {
  const admin = await client(env.base, 'admin@t.example');
  assert.equal((await admin.put(`/api/people/${env.users.admin.id}`, { role: 'se' })).status, 400);
});

test('CSV exports cannot carry spreadsheet formulas', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const made = await se1.post('/api/projections', { name: '=HYPERLINK("http://evil.example")', salesforceUrl: sfLink() }, team(env.teams.emea.id));
  await se1.put(`/api/cc/accounts/${made.data.customer.id}`, { salesforceUrl: sfLink() });
  await se1.post('/api/projections/reports', { customerId: made.data.customer.id, data: reportData() }, team(env.teams.emea.id));
  const vp = await client(env.base, 'vp@t.example');
  const csv = (await vp.get('/api/export/accounts.csv')).data;
  assert.match(csv, /'=HYPERLINK/);
});

test('the hosted calculator page: its own scripts only, the same for everyone (cached), settings from the API', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const res = await fetch(`${env.base}/calculator`, { headers: { cookie: se1.cookie, 'Accept-Encoding': 'gzip' } });
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src 'sha256-/);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const html = await res.text();
  assert.ok(!html.includes(se1.me.csrf), 'no one\u2019s settings in the shared page');
  assert.equal((await fetch(`${env.base}/calculator`, { headers: { cookie: se1.cookie, 'If-None-Match': etag } })).status, 304);
  const cfg = (await se1.get('/api/cc/calc-config')).data;
  assert.equal(cfg.csrf, se1.me.csrf);
  assert.equal(cfg.teams[0].id, env.teams.emea.id);
  const viewer = await client(env.base, 'viewer@t.example');
  assert.equal((await viewer.get('/api/cc/calc-config')).status, 403);
});

test('the audit log records reports and sign-ins, and nothing in data holds a session token', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const { events } = (await admin.get('/api/audit')).data;
  assert.ok(events.some((e) => e.action === 'report.create'));
  assert.ok(events.some((e) => e.action === 'auth.signin'));
  const sessions = fs.readFileSync(path.join(env.dataDir, 'sessions.json'), 'utf8');
  assert.ok(!sessions.includes(admin.cookie.split('=')[1]));
});

test('Impact (beta): off by default, on only after the SE confirms a currency, kept per account', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const h = team(env.teams.emea.id);
  const { data } = await se1.post('/api/projections', { name: 'Helios Energie GmbH', salesforceUrl: sfLink() }, h);
  const id = data.customer.id;
  let a = (await se1.get(`/api/cc/accounts/${id}`)).data.account;
  assert.equal(a.impactEnabled, false);
  const hint = (await se1.get(`/api/cc/accounts/${id}/currency?tz=America/New_York`)).data;
  assert.equal(hint.currency, 'EUR');
  assert.equal((await se1.put(`/api/cc/accounts/${id}`, { impactEnabled: true })).status, 409);
  assert.equal((await se1.put(`/api/cc/accounts/${id}`, { impactCurrency: 'xx1' })).status, 400);
  a = (await se1.put(`/api/cc/accounts/${id}`, { impactCurrency: 'EUR', impactEnabled: true })).data.account;
  assert.equal(a.impactEnabled, true);
  assert.equal(a.impactCurrency, 'EUR');
  assert.equal((await se1.get(`/api/projections/${id}`, h)).data.customer.impact.currency, 'EUR');
  // Another team cannot ask.
  const apac = await client(env.base, 'apac@t.example');
  assert.equal((await apac.get(`/api/cc/accounts/${id}/currency`)).status, 404);
});

test('Admin-only settings: no other role can hold them, not even a leader’s', async () => {
  const admin = await client(env.base, 'admin@t.example');
  for (const p of ['security.https', 'security.sso', 'system.update', 'backup.manage', 'settings.manage']) {
    assert.equal((await admin.put('/api/roles/new', { name: `x-${p}`, permissions: [p, 'dashboard.view'] })).status, 403, p);
  }
  const lead = await client(env.base, 'vp@t.example');
  for (const path of ['/api/https', '/api/settings/sso', '/api/updates', '/api/backups', '/api/settings', '/api/settings/smtp']) assert.equal((await lead.get(path)).status, 403, path);
});

test('people management, as MZ: leaders manage their teams, executives everyone; unlock, sign out, statuses', async () => {
  const lead = await client(env.base, 'emea.lead@t.example');
  const vp = await client(env.base, 'vp@t.example');
  // The leader adds an SE to their own team with a typed temporary password; not to another team, not as Admin.
  const added = await lead.post('/api/people', { email: 'lead.added@t.example', name: 'Lead Added', role: 'se', teamId: env.teams.emea.id, password: 'Typed-temporary-pass-1' });
  assert.equal(added.status, 200);
  assert.equal(added.data.temporary, 'Typed-temporary-pass-1');
  assert.equal((await lead.post('/api/people', { email: 'x2@t.example', name: 'X', role: 'se', teamId: env.teams.apac.id })).status, 403);
  assert.equal((await lead.post('/api/people', { email: 'x3@t.example', name: 'X', role: 'admin', teamId: env.teams.emea.id })).status, 403);
  assert.equal((await lead.post('/api/people', { email: 'x4@t.example', name: 'X', role: 'se', teamId: env.teams.emea.id, password: 'short' })).status, 400);
  const people = (await lead.get('/api/people')).data.people;
  const row = people.find((p) => p.email === 'lead.added@t.example');
  assert.equal(row.status, 'pending');
  assert.equal(row.manageable, true);
  assert.equal(people.find((p) => p.email === 'apac@t.example'), undefined);
  // Locked after wrong passwords; the leader unlocks.
  for (let i = 0; i < 5; i++) await fetch(`${env.base}/api/auth/signin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'se2@t.example', password: 'wrong-wrong-wrong' }) });
  assert.equal((await lead.get('/api/people')).data.people.find((p) => p.email === 'se2@t.example').status, 'locked');
  assert.equal((await lead.post(`/api/people/${env.users.se2.id}/unlock`)).status, 200);
  const se2 = await client(env.base, 'se2@t.example');
  // Sign out everywhere ends their session.
  assert.equal((await lead.post(`/api/people/${env.users.se2.id}/signout`)).status, 200);
  assert.equal((await se2.get('/api/me')).status, 401);
  // The leader cannot touch APAC; the VP-as-leader leads Global, so can.
  assert.equal((await lead.post(`/api/people/${env.users.apacSe.id}/unlock`)).status, 404);
  assert.equal((await vp.post(`/api/people/${env.users.apacSe.id}/unlock`)).status, 200);
  // Leaders do not change roles; Executives and Admins do (never with Admin-only permissions).
  assert.equal((await lead.put('/api/roles/viewer', { name: 'Viewer', permissions: ['dashboard.view'] })).status, 403);
});

test('the two Checkmarx One exports are off until an Admin turns them on', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const page = async () => String((await se1.get('/api/cc/calc-config')).data.exportsEnabled);
  assert.equal(await page(), 'false');
  const admin = await client(env.base, 'admin@t.example');
  await admin.put('/api/settings', { features: { exports: true } });
  assert.equal(await page(), 'true');
  await admin.put('/api/settings', { features: { exports: false } });
});

test('background work: what runs for this person, for the dashboard', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const w = await se1.get('/api/cc/work');
  assert.equal(w.status, 200);
  assert.equal(w.data.read, null);
  const viewer = await client(env.base, 'viewer@t.example');
  assert.equal((await viewer.get('/api/cc/work')).status, 403);
});

test('credits sold: one or many sales per account, against its projection, rolled up', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const h = team(env.teams.emea.id);
  const { data } = await se1.post('/api/projections', { name: 'Sold Corp', salesforceUrl: sfLink() }, h);
  const id = data.customer.id;
  await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: sfLink() });
  const rep = (await se1.post('/api/projections/reports', { customerId: id, data: reportData(80000, 20000) }, h)).data.report;
  assert.equal(rep.totalCredits, 110000);
  assert.equal((await se1.post(`/api/cc/accounts/${id}/sales`, { credits: 0 })).status, 400);
  assert.equal((await se1.post(`/api/cc/accounts/${id}/sales`, { credits: 10, date: '2999-01-01' })).status, 400);
  let a = (await se1.post(`/api/cc/accounts/${id}/sales`, { credits: 50000, date: '2026-10-01', reference: '006AB000001xYzQ', reportId: rep.id })).data;
  assert.equal(a.account.sold, 50000);
  assert.equal(a.account.remaining, 60000);
  // A teammate records the second sale; they cannot remove the first, which is not theirs.
  a = (await se2.post(`/api/cc/accounts/${id}/sales`, { credits: 25000, note: 'Expansion' })).data;
  assert.equal(a.account.sold, 75000);
  assert.equal(a.sales.length, 2);
  const first = a.sales.find((x) => x.credits === 50000);
  assert.equal((await se2.del(`/api/cc/accounts/${id}/sales/${first.id}`)).status, 403);
  const listed = (await se1.get('/api/accounts')).data.accounts.find((x) => x.id === id);
  assert.equal(listed.sold, 75000);
  assert.equal(listed.remaining, 35000);
  const vp = await client(env.base, 'vp@t.example');
  const dash = (await vp.get('/api/dashboard')).data;
  assert.ok(dash.totals.sold >= 75000);
  assert.ok(dash.teams.find((t) => t.id === env.teams.emea.id).sold >= 75000);
  assert.match((await vp.get('/api/export/accounts.csv')).data, /Credits sold,Still needed/);
  // Another team cannot see or record.
  const apac = await client(env.base, 'apac@t.example');
  assert.equal((await apac.post(`/api/cc/accounts/${id}/sales`, { credits: 1 })).status, 404);
  // The leader (Delete any report) can remove anyone's; viewers cannot record.
  const lead = await client(env.base, 'emea.lead@t.example');
  assert.equal((await lead.del(`/api/cc/accounts/${id}/sales/${first.id}`)).status, 200);
  const viewer = await client(env.base, 'viewer@t.example');
  assert.equal((await viewer.post(`/api/cc/accounts/${id}/sales`, { credits: 1 })).status, 403);
});

test('bulk import: the team structure and people from one sheet, with temporary passwords back once', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const rows = [
    { email: 'nina.north@t.example', name: 'Nina North', title: 'SE Director', role: 'Leader', team: 'Global Sales Engineering > EMEA > EMEA North', leads: 'yes' },
    { email: 'olaf.north@t.example', name: 'Olaf North', role: 'Sales Engineer', team: 'Global Sales Engineering > EMEA > EMEA North' },
    { email: 'se1@t.example', name: 'Already here', team: 'Global Sales Engineering > EMEA' },
    { email: 'not-an-email', name: 'Bad' },
    { email: 'olaf.north@t.example', name: 'Twice', team: 'Global Sales Engineering > EMEA' },
    { email: 'zed@t.example', name: 'Zed', role: 'No such role', team: 'Global Sales Engineering' },
  ];
  const before = env.app.teams.list().length;
  const preview = (await admin.post('/api/people/import', { rows, dryRun: true })).data;
  assert.deepEqual([preview.summary.create, preview.summary.exists, preview.summary.errors], [2, 1, 3]);
  assert.deepEqual(preview.rows[0].newTeams, ['EMEA North']);
  assert.equal(env.app.teams.list().length, before, 'a preview changes nothing');
  assert.equal(env.app.iam.byEmail('nina.north@t.example'), null);
  const done = (await admin.post('/api/people/import', { rows, dryRun: false })).data;
  assert.equal(done.summary.created, 2);
  const nina = done.rows.find((x) => x.email === 'nina.north@t.example');
  assert.match(nina.temporary, /^[\w]{5}(-[\w]{5}){3}$/);
  const north = env.app.teams.list().find((t) => t.name === 'EMEA North');
  assert.equal(north.parentId, env.teams.emea.id);
  assert.ok(north.leaderIds.includes(nina.id));
  assert.equal(env.app.iam.byEmail('olaf.north@t.example').teamId, north.id);
  // They sign in with the temporary password and must choose their own.
  const fresh = await client(env.base, 'olaf.north@t.example', done.rows.find((x) => x.email === 'olaf.north@t.example').temporary);
  assert.equal(fresh.me.user.mustChangePassword, true);
  // Nothing of the passwords is kept in the audit log.
  const log = fs.readFileSync(path.join(env.dataDir, 'audit.log'), 'utf8');
  assert.ok(!log.includes(nina.temporary));
});

test('bulk import by a leader: only into their teams, no new teams, no leaders, no higher roles', async () => {
  const lead = await client(env.base, 'emea.lead@t.example');
  const res = (await lead.post('/api/people/import', { dryRun: true, rows: [
    { email: 'l1@t.example', name: 'L1', team: 'Global Sales Engineering > EMEA' },
    { email: 'l2@t.example', name: 'L2', team: 'Global Sales Engineering > APAC' },
    { email: 'l3@t.example', name: 'L3', team: 'Global Sales Engineering > EMEA > Brand New' },
    { email: 'l4@t.example', name: 'L4', team: 'Global Sales Engineering > EMEA', leads: 'yes' },
    { email: 'l5@t.example', name: 'L5', role: 'Admin', team: 'Global Sales Engineering > EMEA' },
  ] })).data;
  assert.deepEqual(res.rows.map((r) => r.status), ['create', 'error', 'error', 'error', 'error']);
  const se = await client(env.base, 'se1@t.example');
  assert.equal((await se.post('/api/people/import', { rows: [{ email: 'x@t.example' }] })).status, 403);
});

test('audit log: every change is recorded, refused attempts too, and it can be filtered', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const se = await client(env.base, 'se1@t.example');
  // A change no route records by itself: the person's own theme.
  assert.equal((await se.put('/api/me/prefs', { mode: 'dark' })).status, 200);
  // Refused: an SE may not change settings.
  assert.equal((await se.put('/api/settings', { organisationName: 'X' })).status, 403);
  const all = (await admin.get('/api/audit?who=se1@t.example')).data;
  assert.ok(all.events.some((e) => e.action === 'me.prefs.update'), JSON.stringify(all.events.map((e) => e.action)));
  const refused = all.events.find((e) => e.action.startsWith('refused: '));
  assert.ok(refused && refused.details.status === 403);
  assert.ok(all.people.some((p) => p.email === 'se1@t.example'));
  const onlyRefused = (await admin.get('/api/audit?outcome=refused&who=se1@t.example')).data.events;
  assert.ok(onlyRefused.length && onlyRefused.every((e) => e.action.startsWith('refused: ')));
  const csv = await admin.get('/api/audit/export.csv?outcome=refused');
  assert.match(String(csv.data), /refused: /);
  assert.equal((await se.get('/api/audit')).status, 403);
});

test('roles can be renamed, built-in ones and Admin too; Admin keeps every permission', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const before = (await admin.get('/api/people')).data.roles;
  const se = before.find((r) => r.id === 'se');
  const renamed = await admin.put('/api/roles/se', { name: 'Solutions Engineer', description: se.description, permissions: se.permissions });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.role.name, 'Solutions Engineer');
  assert.deepEqual(renamed.data.role.permissions, se.permissions);
  const adm = await admin.put('/api/roles/admin', { name: 'Platform Admin', permissions: [] });
  assert.equal(adm.status, 200);
  assert.equal(adm.data.role.name, 'Platform Admin');
  assert.equal(env.app.iam.roles().admin.permissions.length, before.find((r) => r.id === 'admin').permissions.length);
  // Someone with the renamed role still has what it allowed.
  const se1 = await client(env.base, 'se1@t.example');
  assert.equal(se1.me.role.name, 'Solutions Engineer');
  assert.equal((await se1.get('/api/dashboard')).status, 200);
});

test('branding: name, look and logo for everyone; an SVG runs nothing; bad images and private addresses refused', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const r = await admin.put('/api/settings/branding', { appName: 'Mission Control', tagline: 'EMEA', look: 'command', letChoose: false, menu: 'top', accent: '#1d4ed8', logo: { upload: `data:image/png;base64,${png.toString('base64')}` } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.appName, 'Mission Control');
  assert.equal(r.data.look, 'command');
  assert.equal(r.data.letChoose, false);
  assert.match(r.data.logo, /^\/brand\/logo\?v=/);
  // Before signing in, too: the sign-in page shows it.
  const pub = await (await fetch(`${env.base}/api/branding`)).json();
  assert.equal(pub.appName, 'Mission Control');
  const logo = await fetch(`${env.base}/brand/logo`);
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await logo.arrayBuffer()), png);
  // An SVG is kept, and served so that nothing in it runs.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>';
  assert.equal((await admin.put('/api/settings/branding', { icon: { upload: Buffer.from(svg).toString('base64') } })).status, 200);
  const icon = await fetch(`${env.base}/brand/icon`);
  assert.equal(icon.headers.get('content-type'), 'image/svg+xml');
  assert.match(icon.headers.get('content-security-policy'), /sandbox/);
  // Refused, and the last good setting stays.
  assert.equal((await admin.put('/api/settings/branding', { logo: { upload: Buffer.alloc(210 * 1024).toString('base64') } })).status, 413);
  assert.equal((await admin.put('/api/settings/branding', { logo: { upload: Buffer.from('<html>hi</html>').toString('base64') } })).status, 415);
  assert.equal((await admin.put('/api/settings/branding', { logo: { url: 'http://example.com/logo.png' } })).status, 400);
  assert.equal((await admin.put('/api/settings/branding', { logo: { url: 'https://169.254.169.254/latest' } })).status, 400);
  assert.equal((await admin.put('/api/settings/branding', { accent: 'blue' })).status, 400);
  assert.deepEqual(Buffer.from(await (await fetch(`${env.base}/brand/logo`)).arrayBuffer()), png);
  // Only Admins brand.
  const se = await client(env.base, 'se1@t.example');
  assert.equal((await se.put('/api/settings/branding', { appName: 'Mine' })).status, 403);
  assert.equal(se.me.branding.letChoose, false);
  // Back to the defaults for the other tests.
  await admin.put('/api/settings/branding', { appName: 'FTR Credits', tagline: 'Command Center', look: 'aurora', letChoose: true, menu: 'left', accent: '', logo: null, icon: null });
});

test('your profile: name, time zone, picture, Impact figures that start an account’s Impact, sign out elsewhere', async () => {
  const se = await client(env.base, 'se2@t.example');
  const r = await se.put('/api/me/profile', { name: 'SE Two-Renamed', timeZone: 'Asia/Dubai', impact: { currency: 'AED', hourlyRate: 250, triageMinutes: 20, fixMinutes: 90 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.name, 'SE Two-Renamed');
  assert.equal(r.data.prefs.timeZone, 'Asia/Dubai');
  assert.equal((await se.put('/api/me/profile', { timeZone: 'Mars/Olympus' })).status, 400);
  // A picture: kept, served to people signed in; an SVG is refused.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 2)]);
  const pic = await se.put('/api/me/profile', { picture: png.toString('base64') });
  assert.match(pic.data.picture, /^\/api\/people\/.+\/picture/);
  assert.equal((await se.get(pic.data.picture)).status, 200);
  assert.equal((await fetch(`${env.base}${pic.data.picture}`)).status, 401);
  assert.equal((await se.put('/api/me/profile', { picture: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') })).status, 415);
  // Turning Impact on for an account starts from the SE's own figures.
  const h = { 'X-Team': env.teams.emea.id };
  const { data } = await se.post('/api/projections', { name: 'Profile Impact Corp', salesforceUrl: sfLink() }, h);
  const set = await se.put(`/api/cc/accounts/${data.customer.id}`, { impactCurrency: 'AED' }, h);
  assert.equal(set.status, 200, JSON.stringify(set.data));
  const acc = env.app.accounts.accounts.get(data.customer.id);
  assert.equal(acc.impact.hourlyRate, 250);
  assert.equal(acc.impact.triageMinutes, 20);
  assert.equal(acc.impact.currency, 'AED');
  // Sign out everywhere else: another browser's session ends, this one stays.
  const other = await client(env.base, 'se2@t.example');
  assert.equal((await se.post('/api/me/signout-others', {})).status, 200);
  assert.equal((await other.get('/api/me')).status, 401);
  assert.equal((await se.get('/api/me')).status, 200);
});

test('nothing is read without the Salesforce link; a sale needs an opportunity link', async () => {
  const se = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  // No account is made without the link, so nothing can be read for one.
  const refused = await se.post('/api/projections', { name: 'No Link Yet Ltd' }, h);
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /Salesforce/);
  const { data } = await se.post('/api/projections', { name: 'No Link Yet Ltd', salesforceUrl: sfLink() }, h);
  const id = data.customer.id;
  // An account link: a sale must say its opportunity.
  await se.put(`/api/cc/accounts/${id}`, { salesforceUrl: 'https://checkmarx.lightning.force.com/lightning/r/Account/0013z00002NbBI1AAN/view' }, h);
  const noOpp = await se.post(`/api/cc/accounts/${id}/sales`, { credits: 1000, date: '2026-11-01' }, h);
  assert.equal(noOpp.status, 400);
  assert.match(noOpp.data.error, /opportunity/);
  const accLink = await se.post(`/api/cc/accounts/${id}/sales`, { credits: 1000, date: '2026-11-01', opportunityUrl: 'https://checkmarx.lightning.force.com/lightning/r/Account/0013z00002NbBI1AAN/view' }, h);
  assert.equal(accLink.status, 400);
  const ok = await se.post(`/api/cc/accounts/${id}/sales`, { credits: 1000, date: '2026-11-01', opportunityUrl: 'https://checkmarx.lightning.force.com/lightning/r/Opportunity/006Tl00000aAXPOIA4/view' }, h);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.sales.at(-1).opportunityId, '006Tl00000aAXPOIA4');
});

test('the Admin removes every calculation from an account; with its reports, it is a draft again', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const admin = await client(env.base, 'admin@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const h = team(env.teams.emea.id);
  const id = (await se1.post('/api/projections', { name: 'Cleanse Co', salesforceUrl: sfLink() }, h)).data.customer.id;
  await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: sfLink(), contacts: [{ email: 'ciso@cleanse.example' }] });
  const weeks = ['2026-09-01', '2026-10-01'];
  const sev = { Critical: [5, 6], High: [1, 1], Medium: [0, 0], Low: [0, 0] };
  await se1.put(`/api/projections/${id}`, { tr: { totals: { weeks, bySeverity: sev, meta: { source: 'cxone' } }, fixed: { weeks, bySeverity: sev } }, fusion: { projects: [{ id: 'p', name: 'x', loc: 50000, frequency: 'month', source: 'scan' }] } }, h);
  await se1.post('/api/projections/reports', { customerId: id, data: reportData() }, h);
  // Only an Admin.
  assert.equal((await se1.post(`/api/cc/accounts/${id}/reset`, { reports: true })).status, 403);
  assert.equal((await lead.post(`/api/cc/accounts/${id}/reset`, { reports: true })).status, 403);
  // Calculations only: reports stay, still published.
  let r = await admin.post(`/api/cc/accounts/${id}/reset`, {});
  assert.equal(r.status, 200);
  let c = (await se1.get(`/api/projections/${id}`, h)).data.customer;
  assert.ok(!c.tr?.totals);
  assert.equal(c.fusion.projects.length, 0);
  assert.equal((await lead.get(`/api/cc/accounts/${id}`)).status, 200);
  // With its reports: gone, and a draft again. The account, its link and contacts stay.
  r = await admin.post(`/api/cc/accounts/${id}/reset`, { reports: true });
  assert.equal(r.data.reportsRemoved, 1);
  const d = (await admin.get(`/api/cc/accounts/${id}`)).data;
  assert.equal(d.reports.length, 0);
  assert.equal(d.draft, true);
  assert.match(d.account.salesforceUrl, /lightning\/r\/Opportunity\/006/);
  assert.equal(d.contacts[0].email, 'ciso@cleanse.example');
  assert.equal((await lead.get(`/api/cc/accounts/${id}`)).status, 404);
  assert.match(fs.readFileSync(path.join(env.dataDir, 'audit.log'), 'utf8'), /account\.reset/);
});

test('an account started and left with nothing to calculate is discarded after a day; one with a projection stays', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const h = team(env.teams.emea.id);
  const left = (await se1.post('/api/projections', { name: 'Left Behind Ltd', salesforceUrl: sfLink() }, h)).data.customer.id;
  const kept = (await se1.post('/api/projections', { name: 'Worked On Ltd', salesforceUrl: sfLink() }, h)).data.customer.id;
  await se1.put(`/api/projections/${kept}`, { fusion: { projects: [{ id: 'p', name: 'web', loc: 20000, frequency: 'month', source: 'scan' }] } }, h);
  // Not a day yet: both kept.
  const { Accounts } = await import('../server/accounts.js');
  const accounts = new Accounts(env.dataDir);
  assert.deepEqual(accounts.discardStale(Date.now()).map((a) => a.id), []);
  // A day and a minute later: the one with nothing goes, the other stays.
  const gone = accounts.discardStale(Date.now() + 24 * 3600 * 1000 + 60000).map((a) => a.id);
  assert.ok(gone.includes(left));
  assert.ok(!gone.includes(kept));
});

test('account names are tidied as they are entered, and the same name in another account is said', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const h = team(env.teams.emea.id);
  const made = await se1.post('/api/projections', { name: '  tata   motors ltd ', salesforceUrl: sfLink() }, h);
  assert.equal(made.data.customer.name, 'Tata Motors Ltd');
  const id = made.data.customer.id;
  await se1.put(`/api/projections/${id}`, { name: 'hdfc bank' }, h);
  assert.equal((await se1.get(`/api/projections/${id}`, h)).data.customer.name, 'HDFC Bank');
  await se1.put(`/api/projections/${id}`, { name: 'ENBD', fusion: { projects: [{ id: 'p', name: 'x', loc: 1000, frequency: 'month', source: 'scan' }] } }, h);
  assert.equal((await se1.get(`/api/projections/${id}`, h)).data.customer.name, 'ENBD');
  const similar = (await se1.get('/api/cc/accounts-similar?name=e.n.b.d')).data.similar;
  assert.ok(similar.some((x) => x.name === 'ENBD'));
  const admin = await client(env.base, 'admin@t.example');
  assert.equal((await se1.get('/api/cc/name-tidy')).status, 403);
  assert.ok(Array.isArray((await admin.get('/api/cc/name-tidy')).data.renames));
});

test('a role that only looks changes nothing on an account, whatever it sends', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const viewer = await client(env.base, 'viewer@t.example');
  const h = team(env.teams.emea.id);
  const id = (await se1.post('/api/projections', { name: 'Look Only Co', salesforceUrl: sfLink() }, h)).data.customer.id;
  await se1.put(`/api/projections/${id}`, { fusion: { projects: [{ id: 'p', name: 'x', loc: 1000, frequency: 'month', source: 'scan' }] } }, h);
  const rep = (await se1.post('/api/projections/reports', { customerId: id, data: reportData() }, h)).data.report.id;
  const d = (await viewer.get(`/api/cc/accounts/${id}`)).data;
  assert.equal(d.can.edit, false);
  assert.equal(d.can.deleteReports, false);
  for (const [m, p, b] of [
    ['put', `/api/cc/accounts/${id}`, { salesforceUrl: sfLink() }],
    ['put', `/api/cc/accounts/${id}`, { contacts: [{ email: 'a@b.example' }] }],
    ['put', `/api/cc/accounts/${id}`, { ownerId: env.users.se2.id }],
    ['post', `/api/cc/accounts/${id}/customer-version`, { html: '<html></html>' }],
    ['post', `/api/cc/accounts/${id}/previous-report`, { html: '<html></html>' }],
    ['post', `/api/cc/reports/${rep}/shared`, { shared: false }],
    ['post', `/api/cc/reports/${rep}/primary`, { primary: true }],
    ['del', `/api/cc/reports/${rep}`],
    ['del', `/api/cc/accounts/${id}`],
    ['post', `/api/cc/accounts/${id}/reset`, {}],
    ['post', `/api/cc/accounts/${id}/cxone/clear`, {}],
  ]) {
    const r = await viewer[m](p, b);
    assert.ok([403, 404].includes(r.status), `${m} ${p}: ${r.status}`);
  }
});

test('a Salesforce link belongs to one account: a second use is refused and names the account', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const apac = await client(env.base, 'apac@t.example');
  const h = team(env.teams.emea.id);
  const link = sfLink();
  const made = await se1.post('/api/projections', { name: 'Unique Corp', salesforceUrl: link }, h);
  assert.equal(made.status, 200);
  const id = made.data.customer.id;
  // Asked before saving: the account it is on, and whether it may be opened.
  const asked = (await se1.get(`/api/cc/salesforce-taken?url=${encodeURIComponent(link)}`)).data;
  assert.equal(asked.taken.id, id);
  assert.equal(asked.taken.canOpen, true);
  assert.equal((await se1.get(`/api/cc/salesforce-taken?url=${encodeURIComponent(link)}&except=${id}`)).data.taken, null);
  // The 15-character form of the same record is the same record.
  const short = link.replace(/(006AB\d{10})/, (m) => m.slice(0, 15));
  assert.equal((await se1.get(`/api/cc/salesforce-taken?url=${encodeURIComponent(short)}`)).data.taken?.id, id);
  // Another account with it: refused, naming the account.
  const again = await se1.post('/api/projections', { name: 'Unique Corp again', salesforceUrl: link }, h);
  assert.equal(again.status, 409);
  assert.equal(again.data.taken.name, 'Unique Corp');
  // Someone who cannot open it (another SE's account still being started) is told whose it is, not given it.
  const theirs = await se2.get(`/api/cc/salesforce-taken?url=${encodeURIComponent(link)}`);
  assert.equal(theirs.data.taken.canOpen, false);
  assert.equal(theirs.data.taken.teamId, null);
  const other = await apac.post('/api/projections', { name: 'Elsewhere', salesforceUrl: link }, team(env.teams.apac.id));
  assert.equal(other.status, 409);
  // Saving it on another account is refused too; the account's own link saves again as it is.
  const second = await se1.post('/api/projections', { name: 'Second Corp', salesforceUrl: sfLink() }, h);
  assert.equal((await se1.put(`/api/cc/accounts/${second.data.customer.id}`, { salesforceUrl: link })).status, 409);
  assert.equal((await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: link })).status, 200);
});
