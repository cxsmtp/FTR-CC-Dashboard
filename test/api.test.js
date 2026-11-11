import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SF, client, reportData, start } from './helpers.js';

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

test('team members share their team’s accounts; other teams cannot see them', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const apac = await client(env.base, 'apac@t.example');
  const made = await se1.post('/api/projections', { name: 'Shared Corp' }, team(env.teams.emea.id));
  assert.equal(made.status, 200);
  const id = made.data.customer.id;
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
  const { data } = await se1.post('/api/projections', { name: 'Needs SF' }, h);
  const id = data.customer.id;
  const refused = await se1.post('/api/projections/reports', { customerId: id, data: reportData() }, h);
  assert.equal(refused.status, 409);
  assert.equal((await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: 'https://evil.example/006AB000001xYzQAAQ' })).status, 400);
  assert.equal((await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: SF })).status, 200);
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
  // Shared with the customer, with a note.
  const shared = await se1.post(`/api/cc/reports/${r1.data.report.id}/shared`, { shared: true, note: 'Emailed to the CISO' });
  assert.equal(shared.data.reports.find((r) => r.id === r1.data.report.id).sharedNote, 'Emailed to the CISO');
});

test('deleting reports: your own unshared ones, or with the permission', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const h = team(env.teams.emea.id);
  const { data } = await se1.post('/api/projections', { name: 'Delete Co' }, h);
  await se1.put(`/api/cc/accounts/${data.customer.id}`, { salesforceUrl: SF });
  const mine = (await se1.post('/api/projections/reports', { customerId: data.customer.id, data: reportData() }, h)).data.report.id;
  const other = (await se1.post('/api/projections/reports', { customerId: data.customer.id, data: reportData() }, h)).data.report.id;
  assert.equal((await se2.del(`/api/cc/reports/${mine}`)).status, 403);
  await se1.post(`/api/cc/reports/${other}/shared`, { shared: true });
  assert.equal((await se1.del(`/api/cc/reports/${other}`)).status, 403);
  assert.equal((await se1.del(`/api/cc/reports/${mine}`)).status, 200);
  assert.equal((await lead.del(`/api/cc/reports/${other}`)).status, 200);
  // An SE cannot delete an account; the leader can.
  assert.equal((await se1.del(`/api/cc/accounts/${data.customer.id}`)).status, 403);
  assert.equal((await lead.del(`/api/cc/accounts/${data.customer.id}`)).status, 200);
});

test('dashboards roll up: leaders see their teams below, the VP sees every team, SEs only theirs', async () => {
  const apac = await client(env.base, 'apac@t.example');
  const h = team(env.teams.apac.id);
  const { data } = await apac.post('/api/projections', { name: 'APAC Co' }, h);
  await apac.put(`/api/cc/accounts/${data.customer.id}`, { salesforceUrl: SF });
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
  await se1.post('/api/projections', { name: '=HYPERLINK("http://evil.example")' }, team(env.teams.emea.id));
  const vp = await client(env.base, 'vp@t.example');
  const csv = (await vp.get('/api/export/accounts.csv')).data;
  assert.match(csv, /'=HYPERLINK/);
});

test('the hosted calculator page: its own scripts only, and the person’s settings escaped', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const res = await fetch(`${env.base}/calculator`, { headers: { cookie: se1.cookie } });
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src 'sha256-/);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  const html = await res.text();
  assert.ok(html.includes('id="cx-hosted"'));
  assert.ok(!html.includes('"__HOSTED__"'));
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
  const { data } = await se1.post('/api/projections', { name: 'Helios Energie GmbH' }, h);
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
  const page = async () => (await (await fetch(`${env.base}/calculator`, { headers: { cookie: se1.cookie } })).text()).match(/"exportsEnabled":(true|false)/)?.[1];
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
  const { data } = await se1.post('/api/projections', { name: 'Sold Corp' }, h);
  const id = data.customer.id;
  await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: SF });
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
