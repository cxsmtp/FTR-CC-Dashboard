import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { DEFAULT_FUSION_RATES, engineKey, rateModels, withRates } from '../server/fusion-rates.js';
import { client, start } from './helpers.js';

let env;
before(async () => {
  env = await start();
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('an engine is the same however it is written', () => {
  assert.equal(engineKey('Opus 5.5'), engineKey('claude-opus-5-5'));
  assert.equal(engineKey('Claude Opus 5.5'), engineKey('opus-5.5'));
  assert.notEqual(engineKey('Opus 5.5'), engineKey('Opus 4.7'));
});

test('the starting rates: Opus 5.5 2, Opus 4.7 2.5, Haiku 4.5 1.5; Opus 5.5 the default', () => {
  const rate = (n) => DEFAULT_FUSION_RATES.models.find((m) => m.name === n).creditsPer10k;
  assert.equal(rate('Opus 5.5'), 2);
  assert.equal(rate('Opus 4.7'), 2.5);
  assert.equal(rate('Haiku 4.5'), 1.5);
  assert.equal(DEFAULT_FUSION_RATES.defaultModel, 'Opus 5.5');
});

test('the calculator gets the rates: engines read take theirs, none read gives the rated list with the default first', () => {
  const eff = { models: DEFAULT_FUSION_RATES.models, defaultModel: 'Haiku 4.5' };
  const read = rateModels([{ id: 'tenant-claude-opus-4-7', name: 'claude-opus-4-7', creditsPer10k: null, source: 'tenant' }, { id: 'tenant-new', name: 'Brand New 1', creditsPer10k: null, source: 'tenant' }], eff);
  assert.equal(read.find((m) => m.name === 'claude-opus-4-7').creditsPer10k, 2.5);
  assert.equal(read.find((m) => m.name === 'Brand New 1').creditsPer10k, null);
  const none = rateModels([], eff);
  assert.deepEqual(none.map((m) => m.name), ['Haiku 4.5', 'Opus 5.5', 'Opus 4.7']);
  // A projection with no engines yet gets the list and its default; a rate typed in the calculator is kept.
  const opened = withRates({ id: 'a', fusion: { models: [] } }, eff);
  assert.equal(opened.fusion.models.length, 3);
  assert.equal(opened.fusion.models.find((m) => m.id === opened.fusion.defaultModel).name, 'Haiku 4.5');
  // the calculator’s own list (names, no rates) takes the rates by name.
  const mz = withRates({ id: 'a', fusion: { models: [{ id: 'catalog-opus-5-5', name: 'opus-5.5', creditsPer10k: null }, { id: 'catalog-mythos', name: 'mythos-5.1', creditsPer10k: null }] } }, eff);
  assert.equal(mz.fusion.models.find((m) => m.name === 'opus-5.5').creditsPer10k, 2);
  assert.equal(mz.fusion.models.find((m) => m.name === 'mythos-5.1').creditsPer10k, null);
  const typed = withRates({ id: 'a', fusion: { models: [{ id: 'x', name: 'Opus 5.5', creditsPer10k: 9 }, { id: 'y', name: 'Haiku 4.5', creditsPer10k: null }] } }, eff);
  assert.equal(typed.fusion.models[0].creditsPer10k, 9);
  assert.equal(typed.fusion.models[1].creditsPer10k, 1.5);
});

test('the Admin sets the rates, for everyone; no team has its own', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const vp = await client(env.base, 'vp@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const se = await client(env.base, 'se1@t.example');
  let r = await admin.put('/api/fusion-rates', { models: [{ name: 'Opus 5.5', creditsPer10k: 2 }, { name: 'Haiku 4.5', creditsPer10k: '1.5' }, { name: 'Sonnet 5', creditsPer10k: '' }], defaultModel: 'Opus 5.5' });
  assert.equal(r.status, 200);
  assert.equal(r.data.admin.models.find((m) => m.name === 'Sonnet 5').creditsPer10k, null);
  assert.equal((await admin.put('/api/fusion-rates', { models: [{ name: 'Opus 5.5', creditsPer10k: -1 }] })).status, 400);
  assert.equal((await admin.put('/api/fusion-rates', { models: [{ name: 'Opus 5.5', creditsPer10k: 2 }], defaultModel: 'Nope' })).status, 400);
  assert.equal((await lead.put('/api/fusion-rates', { models: [] })).status, 403);
  // One set of rates for everyone: a team has none of its own (leaders included).
  assert.equal((await vp.put(`/api/fusion-rates/teams/${env.teams.global.id}`, { rates: { 'Opus 5.5': 2.2 } })).status, 410);
  assert.equal((await lead.put(`/api/fusion-rates/teams/${env.teams.emea.id}`, { rates: { 'Opus 5.5': 2.4 } })).status, 410);
  r = await lead.get('/api/fusion-rates');
  assert.deepEqual(r.data.teams, []);
  assert.equal(r.data.canTeams, false);
  assert.equal(r.data.effective.models.find((m) => m.name === 'Opus 5.5').creditsPer10k, 2);
  // A new account in the calculator starts with the Admin's rated engines and default engine.
  const created = await se.post('/api/projections', { name: 'Rated Co' }, { 'X-Team': env.teams.emea.id });
  const f = created.data.customer.fusion;
  assert.equal(engineKey(f.models.find((m) => m.id === f.defaultModel).name), engineKey('Opus 5.5'));
  assert.equal(f.models.find((m) => engineKey(m.name) === engineKey('Opus 5.5')).creditsPer10k, 2);
  // Engines seen without a rate are listed until one is set; everything is in the audit log.
  env.app.calc.rates.detected(env.users.se1.id, ['Gemini 9 Ultra'], 'acme');
  r = await admin.get('/api/fusion-rates');
  assert.ok(r.data.detected.some((d) => d.name === 'Gemini 9 Ultra'));
  await admin.put('/api/fusion-rates', { models: [...r.data.admin.models, { name: 'Gemini 9 Ultra', creditsPer10k: 4 }], defaultModel: 'Opus 5.5' });
  assert.ok(!(await admin.get('/api/fusion-rates')).data.detected.some((d) => d.name === 'Gemini 9 Ultra'));
  const audit = (await admin.get('/api/audit?limit=200')).data;
  const actions = JSON.stringify(audit);
  assert.match(actions, /fusion\.rates/);
});

test('Customer Success works out projections for an SE they choose: no report until one is accountable', async () => {
  const { reportData, SF } = await import('./helpers.js');
  const csUser = (await env.app.iam.create({ email: 'cs@t.example', name: 'Casey Success', role: 'cs', teamId: env.teams.emea.id })).user;
  const { hashPassword } = await import('../server/iam.js');
  Object.assign(csUser, { passwordHash: await hashPassword('Test-Password-For-Tests-1'), mustChangePassword: false, guideSeenAt: new Date().toISOString() });
  env.app.iam.save();
  env.app.terms.accept(csUser.id);
  const cs = await client(env.base, 'cs@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const made = await cs.post('/api/projections', { name: 'CS Account' }, h);
  assert.equal(made.status, 200);
  const id = made.data.customer.id;
  assert.equal((await cs.put(`/api/cc/accounts/${id}`, { salesforceUrl: SF })).status, 200);
  const refused = await cs.post('/api/projections/reports', { customerId: id, data: reportData() }, h);
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /accountable Sales Engineer/);
  // The SE list never offers Customer Success; with an SE chosen, the report is made.
  const detail = await cs.get(`/api/cc/accounts/${id}`);
  assert.ok(!detail.data.members.some((m) => m.id === csUser.id));
  assert.equal((await cs.put(`/api/cc/accounts/${id}`, { ownerId: env.users.se1.id })).status, 200);
  assert.equal((await cs.post('/api/projections/reports', { customerId: id, data: reportData() }, h)).status, 200);
});

test('triage and remediation credits: the Admin’s, in every projection, whatever the page sends', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const se = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  assert.equal((await lead.put('/api/tr-rates', { triageCost: { Critical: 9 } })).status, 403);
  assert.equal((await admin.put('/api/tr-rates', { triageCost: { Critical: -1 } })).status, 400);
  const r = await admin.put('/api/tr-rates', { triageCost: { Critical: 2 }, remediationCost: { Low: 4 } });
  assert.equal(r.status, 200);
  assert.equal(r.data.trRates.triageCost.Critical, 2);
  assert.equal(r.data.trRates.triageCost.High, 1);
  const made = await se.post('/api/projections', { name: 'Fixed Rates Co' }, h);
  const id = made.data.customer.id;
  assert.equal(made.data.customer.tr.triageCost.Critical, 2);
  assert.equal(made.data.customer.tr.remediationCost.Low, 4);
  // The page sends its own: the Admin's are kept.
  const tr = { ...made.data.customer.tr, triageCost: { Critical: 50, High: 50, Medium: 50, Low: 50 } };
  assert.equal((await se.put(`/api/projections/${id}`, { tr }, h)).status, 200);
  const again = await se.get(`/api/projections/${id}`, h);
  assert.equal(again.data.customer.tr.triageCost.Critical, 2);
  assert.equal(again.data.customer.tr.triageCost.High, 1);
  assert.match(JSON.stringify((await admin.get('/api/audit?limit=50')).data), /tr\.rates/);
  await admin.put('/api/tr-rates', { triageCost: { Critical: 1 }, remediationCost: { Low: 3 } });
});

test('a leader changes the accountable SE of a projection someone else made; that SE records what was shared', async () => {
  const { reportData, SF } = await import('./helpers.js');
  const lead = await client(env.base, 'emea.lead@t.example');
  const se1 = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const viewer = await client(env.base, 'viewer@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const made = await se1.post('/api/projections', { name: 'Handover Co' }, h);
  const id = made.data.customer.id;
  await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: SF });
  assert.equal((await viewer.put(`/api/cc/accounts/${id}`, { ownerId: env.users.se2.id })).status, 403);
  assert.equal((await lead.put(`/api/cc/accounts/${id}`, { ownerId: env.users.se2.id })).status, 200);
  const detail = await se2.get(`/api/cc/accounts/${id}`);
  assert.equal(detail.data.account.ownerId, env.users.se2.id);
  assert.equal(detail.data.can.share, true);
  const rep = (await se2.post('/api/projections/reports', { customerId: id, data: reportData() }, h)).data.report.id;
  const shared = await se2.post(`/api/cc/reports/${rep}/shared`, { shared: true, sharedWith: 'cfo@customer.example' });
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.data.reports.find((r) => r.id === rep).sharedWith, ['cfo@customer.example']);
  assert.equal((await viewer.post(`/api/cc/reports/${rep}/shared`, { shared: false })).status, 403);
});

test('an Executive mutes an account from the forecast: the dashboards leave it out, the list keeps it', async () => {
  const { reportData, SF } = await import('./helpers.js');
  const exec = (await env.app.iam.create({ email: 'exec@t.example', name: 'Eve Exec', role: 'executive', teamId: env.teams.global.id })).user;
  const { hashPassword } = await import('../server/iam.js');
  Object.assign(exec, { passwordHash: await hashPassword('Test-Password-For-Tests-1'), mustChangePassword: false, guideSeenAt: new Date().toISOString() });
  env.app.iam.save();
  env.app.terms.accept(exec.id);
  const ex = await client(env.base, 'exec@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const se = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const id = (await se.post('/api/projections', { name: 'Mute Me Co' }, h)).data.customer.id;
  await se.put(`/api/cc/accounts/${id}`, { salesforceUrl: SF });
  await se.post('/api/projections/reports', { customerId: id, data: reportData(70000, 30000) }, h);
  const before = (await ex.get('/api/dashboard')).data.totals;
  assert.equal((await lead.post(`/api/cc/accounts/${id}/mute`, { muted: true })).status, 403);
  assert.equal((await ex.post(`/api/cc/accounts/${id}/mute`, { muted: true })).status, 200);
  const after = (await ex.get('/api/dashboard')).data.totals;
  assert.equal(after.accounts, before.accounts - 1);
  assert.ok(after.credits < before.credits);
  const listed = (await ex.get('/api/accounts')).data.accounts.find((a) => a.id === id);
  assert.equal(listed.muted, true);
  assert.equal(listed.mutedBy, 'Eve Exec');
  assert.equal((await ex.post(`/api/cc/accounts/${id}/mute`, { muted: false })).status, 200);
  assert.equal((await ex.get('/api/dashboard')).data.totals.accounts, before.accounts);
  assert.match(JSON.stringify((await ex.get('/api/audit?limit=50')).data), /account\.mute/);
});

test('an Admin signs in as someone: their view, recorded as the Admin acting as them; their own things stay theirs', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  const se = (await admin.get('/api/people')).data.people.find((u) => u.email === 'se1@t.example');
  // Only the Admin may, and never as themself.
  assert.equal((await lead.post(`/api/people/${se.id}/impersonate`)).status, 403);
  assert.equal((await admin.post(`/api/people/${admin.me.user.id}/impersonate`)).status, 400);
  const r = await admin.post(`/api/people/${se.id}/impersonate`);
  assert.equal(r.status, 200);
  let me = (await admin.get('/api/me')).data;
  assert.equal(me.user.email, 'se1@t.example');
  assert.equal(me.impersonating.by.email, 'admin@t.example');
  assert.ok(!me.permissions.includes('users.manage'));
  // No chains, and the person's password, profile, sessions and terms stay theirs.
  assert.equal((await admin.post(`/api/people/${se.id}/impersonate`)).status, 403);
  assert.equal((await admin.post('/api/me/password', { current: 'x', next: 'y' })).status, 403);
  assert.equal((await admin.put('/api/me/profile', { name: 'Changed' })).status, 403);
  assert.equal((await admin.post('/api/me/signout-others')).status, 403);
  // Back to their own account.
  assert.equal((await admin.post('/api/auth/impersonate/stop')).status, 200);
  me = (await admin.get('/api/me')).data;
  assert.equal(me.user.email, 'admin@t.example');
  assert.equal(me.impersonating, null);
  const { events } = (await admin.get('/api/audit')).data;
  const start = events.find((e) => e.action === 'auth.impersonate.start');
  assert.equal(start.actor.email, 'admin@t.example');
  assert.equal(start.target, 'se1@t.example');
  assert.ok(events.some((e) => e.action === 'auth.impersonate.stop'));
  const refused = events.find((e) => e.action.startsWith('refused') && e.actor?.as?.email === 'se1@t.example');
  assert.ok(refused, 'what was done while signed in as them is recorded as the Admin acting as them');
});

test('roles are changed only by their own id; teams are managed only within the manager’s own teams', async () => {
  const admin = await client(env.base, 'admin@t.example');
  for (const id of ['__proto__', 'constructor', 'toString', 'made-up'])
    assert.equal((await admin.put(`/api/roles/${id}`, { name: 'x', permissions: [] })).status, 404, id);
  assert.equal(Object.prototype.permissions, undefined);
  // A role that manages teams, given to the EMEA leader: EMEA (and below) only.
  const made = await admin.put('/api/roles/new', { name: 'Team keeper', permissions: ['teams.manage', 'calculator.use', 'dashboard.view', 'users.manage'] });
  assert.equal(made.status, 200);
  const lead = env.users.emeaLead;
  assert.equal((await admin.put(`/api/people/${lead.id}`, { role: made.data.role.id })).status, 200);
  const keeper = await client(env.base, 'emea.lead@t.example');
  assert.equal((await keeper.put(`/api/teams/${env.teams.emea.id}`, { region: 'Europe' })).status, 200);
  assert.equal((await keeper.put(`/api/teams/${env.teams.apac.id}`, { leaderIds: [lead.id] })).status, 403);
  assert.equal((await keeper.put(`/api/teams/${env.teams.emea.id}`, { leaderIds: [env.users.apacSe.id] })).status, 403);
  assert.equal((await keeper.put(`/api/teams/${env.teams.emea.id}`, { parentId: null })).status, 403);
  assert.equal((await keeper.post('/api/teams', { name: 'Rogue', parentId: env.teams.apac.id })).status, 403);
  assert.equal((await keeper.del(`/api/teams/${env.teams.apac.id}`)).status, 403);
  // Back as it was.
  assert.equal((await admin.put(`/api/people/${lead.id}`, { role: 'leader' })).status, 200);
});

test('accounts follow their accountable SE: moved with them, with a new SE, and caught up in one click', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const se = await client(env.base, 'se2@t.example');
  const made = await se.post('/api/projections', { name: 'Follower Co' }, { 'X-Team': env.teams.emea.id });
  const id = made.data.customer.id;
  const teamOf = async () => (await admin.get('/api/accounts')).data.accounts.find((a) => a.id === id).teamId;
  assert.equal(await teamOf(), env.teams.emea.id);
  // The SE moves to APAC: the account goes with them.
  let r = await admin.put(`/api/people/${env.users.se2.id}`, { teamId: env.teams.apac.id });
  assert.equal(r.status, 200);
  assert.ok(r.data.accountsMoved >= 1);
  assert.equal(await teamOf(), env.teams.apac.id);
  // A new accountable SE in another team: the account goes to their team.
  r = await admin.put(`/api/cc/accounts/${id}`, { ownerId: env.users.se1.id });
  assert.equal(r.status, 200);
  assert.equal(await teamOf(), env.teams.emea.id);
  // One left behind before this was the rule (the SE's team changed without the account): listed, then moved.
  Object.assign(env.app.iam.byId(env.users.se1.id), { teamId: env.teams.apac.id });
  env.app.iam.save();
  const list = (await admin.get('/api/cc/accounts-out-of-step')).data.accounts;
  assert.ok(list.some((a) => a.id === id && a.to === 'APAC'));
  assert.equal((await se.get('/api/cc/accounts-out-of-step')).status, 403);
  const moved = (await admin.post('/api/cc/accounts-follow', { ids: [id] })).data.moved;
  assert.equal(moved.length, 1);
  assert.equal(await teamOf(), env.teams.apac.id);
  assert.ok(!(await admin.get('/api/cc/accounts-out-of-step')).data.accounts.some((a) => a.id === id));
  const { events } = (await admin.get('/api/audit?limit=200')).data;
  assert.ok(events.filter((e) => e.action === 'account.follow' && e.target === 'Follower Co').length >= 2);
  // Back as it was, for the tests after this one.
  for (const [u, t] of [[env.users.se1, env.teams.emea], [env.users.se2, env.teams.emea]]) assert.equal((await admin.put(`/api/people/${u.id}`, { teamId: t.id })).status, 200);
});

test('an account keeps its team and contacts: added, cleaned, refused when wrong, and audited', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const made = await admin.post('/api/projections', { name: 'Contacts Co' }, { 'X-Team': env.teams.emea.id });
  const id = made.data.customer.id;
  let r = await admin.get(`/api/cc/accounts/${id}`);
  assert.deepEqual(r.data.contacts, []);
  assert.deepEqual(r.data.usedEmails, []);
  r = await admin.put(`/api/cc/accounts/${id}`, { contacts: [{ email: 'CISO@Customer.example', role: 'CISO' }, { email: 'ciso@customer.example' }, { email: 'ae@t.example', name: 'Ana', role: 'AE', side: 'us' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.contacts, [{ email: 'ciso@customer.example', name: '', role: 'CISO', side: 'customer' }, { email: 'ae@t.example', name: 'Ana', role: 'AE', side: 'us' }]);
  assert.equal((await admin.put(`/api/cc/accounts/${id}`, { contacts: [{ email: 'not an address' }] })).status, 400);
  assert.equal((await admin.get(`/api/cc/accounts/${id}`)).data.contacts.length, 2);
  const { events } = (await admin.get('/api/audit?limit=50')).data;
  assert.ok(events.some((e) => e.action === 'account.update' && e.target === 'Contacts Co' && e.details?.contactsAdded?.length === 2));
});
