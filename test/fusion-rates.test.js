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
  // MZ's own list (names, no rates) takes the rates by name.
  const mz = withRates({ id: 'a', fusion: { models: [{ id: 'catalog-opus-5-5', name: 'opus-5.5', creditsPer10k: null }, { id: 'catalog-mythos', name: 'mythos-5.1', creditsPer10k: null }] } }, eff);
  assert.equal(mz.fusion.models.find((m) => m.name === 'opus-5.5').creditsPer10k, 2);
  assert.equal(mz.fusion.models.find((m) => m.name === 'mythos-5.1').creditsPer10k, null);
  const typed = withRates({ id: 'a', fusion: { models: [{ id: 'x', name: 'Opus 5.5', creditsPer10k: 9 }, { id: 'y', name: 'Haiku 4.5', creditsPer10k: null }] } }, eff);
  assert.equal(typed.fusion.models[0].creditsPer10k, 9);
  assert.equal(typed.fusion.models[1].creditsPer10k, 1.5);
});

test('Admin sets the rates; a leader sets the team’s own, used below it; back to the Admin’s; an SE may not', async () => {
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
  assert.equal((await se.put(`/api/fusion-rates/teams/${env.teams.emea.id}`, { rates: { 'Opus 5.5': 3 } })).status, 403);
  // The VP sets Global's own rate: EMEA takes it; the EMEA leader sets EMEA's own, then goes back.
  assert.equal((await vp.put(`/api/fusion-rates/teams/${env.teams.global.id}`, { rates: { 'Opus 5.5': 2.2 }, defaultModel: 'Haiku 4.5' })).status, 200);
  r = await lead.get('/api/fusion-rates');
  const emea = () => r.data.teams.find((t) => t.id === env.teams.emea.id).effective;
  assert.equal(emea().models.find((m) => m.name === 'Opus 5.5').creditsPer10k, 2.2);
  assert.equal(emea().defaultModel, 'Haiku 4.5');
  r = await lead.put(`/api/fusion-rates/teams/${env.teams.emea.id}`, { rates: { 'Opus 5.5': 2.4 } });
  assert.equal(emea().models.find((m) => m.name === 'Opus 5.5').creditsPer10k, 2.4);
  assert.equal((await lead.put(`/api/fusion-rates/teams/${env.teams.apac.id}`, { rates: { 'Opus 5.5': 9 } })).status, 403);
  r = await lead.put(`/api/fusion-rates/teams/${env.teams.emea.id}`, { rates: { 'Opus 5.5': null } });
  assert.equal(emea().models.find((m) => m.name === 'Opus 5.5').creditsPer10k, 2.2);
  // A new account in the calculator starts with the rated engines and the team's default engine.
  const created = await se.post('/api/projections', { name: 'Rated Co' }, { 'X-Team': env.teams.emea.id });
  const f = created.data.customer.fusion;
  assert.equal(engineKey(f.models.find((m) => m.id === f.defaultModel).name), engineKey('Haiku 4.5'));
  assert.equal(f.models.find((m) => engineKey(m.name) === engineKey('Opus 5.5')).creditsPer10k, 2.2);
  // Engines seen without a rate are listed until one is set; everything is in the audit log.
  env.app.calc.rates.detected(env.users.se1.id, ['Gemini 9 Ultra'], 'acme');
  r = await admin.get('/api/fusion-rates');
  assert.ok(r.data.detected.some((d) => d.name === 'Gemini 9 Ultra'));
  await admin.put('/api/fusion-rates', { models: [...r.data.admin.models, { name: 'Gemini 9 Ultra', creditsPer10k: 4 }], defaultModel: 'Opus 5.5' });
  assert.ok(!(await admin.get('/api/fusion-rates')).data.detected.some((d) => d.name === 'Gemini 9 Ultra'));
  const audit = (await admin.get('/api/audit?limit=200')).data;
  const actions = JSON.stringify(audit);
  assert.match(actions, /fusion\.rates\.team/);
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
