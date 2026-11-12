import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { CalculatorService } from '../server/calculator.js';
import { SF, client, reportData, start } from './helpers.js';

const calls = [];
const calc = new CalculatorService({ cxoneHosts: ['checkmarx.net'], gitHosts: ['github.com'], log: () => {} });
// Checkmarx One, as far as these tests need it: a key "eu-key-…" connects to tenant acme.
calc.connectKey = async (userId, input) => {
  calls.push({ userId, apiKey: input.apiKey });
  if (!String(input.apiKey).startsWith('eu-key-')) throw Object.assign(new Error('Checkmarx One refused that API key.'), { status: 400 });
  return { connected: true, tenant: 'acme', baseUrl: 'https://eu.ast.checkmarx.net' };
};

let env;
before(async () => {
  env = await start({ calculatorService: calc });
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('a key kept for an account: sealed, never sent to a browser, used by the team in one click', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const { data } = await se1.post('/api/projections', { name: 'Kept Key Corp' }, h);
  const id = data.customer.id;
  await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: SF });
  // Made up for this run (never a real key, and none kept in the source).
  const secret = `eu-key-${randomBytes(12).toString('hex')}`;
  const r = await se1.post('/api/cc/cxone/connect', { apiKey: secret, remember: true, accountId: id });
  assert.equal(r.data.saved, true);
  // Not in clear on disk, not in any answer.
  const onDisk = fs.readFileSync(path.join(env.dataDir, 'accounts', `${id}.json`), 'utf8');
  assert.ok(!onDisk.includes(secret));
  const answers = [await se1.get(`/api/cc/accounts/${id}`), await se1.get(`/api/projections/${id}`, h), await se1.get('/api/projections', h), await se1.get('/api/accounts')];
  for (const a of answers) {
    assert.ok(!JSON.stringify(a.data).includes(secret));
    assert.ok(!JSON.stringify(a.data).includes('sealedKey'));
  }
  assert.equal((await se1.get(`/api/cc/accounts/${id}`)).data.account.cxone.tenant, 'acme');
  // A draft is its SE's: a teammate cannot use its key until it is published by a report.
  const se2early = await client(env.base, 'se2@t.example');
  assert.equal((await se2early.post(`/api/cc/accounts/${id}/cxone/connect`)).status, 404);
  await se1.post('/api/projections/reports', { customerId: id, data: reportData() }, h);
  // A teammate refreshes with it, without ever seeing it.
  const se2 = await client(env.base, 'se2@t.example');
  calls.length = 0;
  assert.equal((await se2.post(`/api/cc/accounts/${id}/cxone/connect`)).data.tenant, 'acme');
  assert.equal(calls[0].apiKey, secret);
  // Another team cannot.
  const apac = await client(env.base, 'apac@t.example');
  assert.equal((await apac.post(`/api/cc/accounts/${id}/cxone/connect`)).status, 404);
  // Every use is in the audit log, and the key is not.
  const log = fs.readFileSync(path.join(env.dataDir, 'audit.log'), 'utf8');
  assert.match(log, /cxone\.key\.saved/);
  assert.match(log, /cxone\.key\.used/);
  assert.ok(!log.includes(secret));
  // Forgotten: gone.
  await se1.del(`/api/cc/accounts/${id}/cxone`);
  assert.equal((await se2.post(`/api/cc/accounts/${id}/cxone/connect`)).status, 404);
});

test('sales roles: dashboards, accounts and recording sales; not the calculator', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const made = await admin.post('/api/people', { email: 'ae@t.example', name: 'Account Exec', role: 'sales', teamId: env.teams.emea.id, password: 'Sales-person-pass-77' });
  assert.equal(made.status, 200);
  const u = env.app.iam.byEmail('ae@t.example');
  Object.assign(u, { mustChangePassword: false });
  env.app.terms.accept(u.id);
  const ae = await client(env.base, 'ae@t.example', 'Sales-person-pass-77');
  assert.equal((await ae.get('/api/dashboard')).status, 200);
  assert.equal((await ae.get('/api/projections', { 'X-Team': env.teams.emea.id })).status, 403);
  const acct = (await ae.get('/api/accounts')).data.accounts.find((x) => x.name === 'Kept Key Corp');
  assert.ok(acct);
  assert.equal((await ae.post(`/api/cc/accounts/${acct.id}/sales`, { credits: 1000 })).status, 200);
  assert.equal((await ae.put(`/api/cc/accounts/${acct.id}`, { salesforceUrl: SF })).status, 403);
});

test('a Checkmarx One connection is for one account: never read into another, and what was read never serves another', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const make = async (name) => {
    const id = (await se1.post('/api/projections', { name }, h)).data.customer.id;
    await se1.put(`/api/cc/accounts/${id}`, { salesforceUrl: SF });
    return { id, name, teamId: env.teams.emea.id };
  };
  const [first, second] = [await make('First Customer'), await make('Second Customer')];
  // Connected for First Customer, with a read of it finished (as a version handing over would leave it).
  calc.adopt({ people: [{ userId: env.users.se1.id, connection: { tenant: 'first-tenant', baseUrl: 'https://eu.ast.checkmarx.net', iamUrl: 'https://eu.iam.checkmarx.net', apiKey: 'x' }, account: first, boundTo: first, readFor: first, job: { id: 'j', state: 'done', account: first, applied: true, result: { projects: [] } }, read: { readAt: new Date().toISOString(), weeks: ['2026-10-01'], series: {} } }] });
  assert.deepEqual((await se1.get('/api/cc/cxone/status')).data.account, { id: first.id, name: first.name });
  // Read asked for Second Customer: refused, saying whose connection it is, and recorded.
  const r = await se1.post('/api/projections/read', {}, { ...h, 'X-Account': second.id });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /connected to Checkmarx One for First Customer, not for Second Customer/);
  // No account named: refused too.
  assert.equal((await se1.post('/api/projections/read', {}, h)).status, 409);
  // The read that finished says whose it is, and its figures are refused to the other account.
  assert.deepEqual((await se1.get('/api/projections/read', h)).data.account, { id: first.id, name: first.name });
  const s = await se1.post('/api/projections/series', { projectIds: [] }, { ...h, 'X-Account': second.id });
  assert.equal(s.status, 409);
  assert.match(s.data.error, /last read for First Customer/);
  assert.notEqual((await se1.post('/api/projections/series', { projectIds: [] }, { ...h, 'X-Account': first.id })).status, 409);
  assert.match(fs.readFileSync(path.join(env.dataDir, 'audit.log'), 'utf8'), /cxone\.read\.refused/);
  calc.forget(env.users.se1.id);
});

test('what was read from Checkmarx One can be taken out of an account: its backlog and read projects go, the rest stays', async () => {
  const se1 = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const id = (await se1.post('/api/projections', { name: 'Wrong Data Corp' }, h)).data.customer.id;
  const weeks = ['2026-09-01', '2026-10-01'];
  const sev = { Critical: [5, 6], High: [7, 8], Medium: [1, 1], Low: [0, 0] };
  const put = await se1.put(`/api/projections/${id}`, {
    tr: { fpPercent: { Critical: 25, High: 25, Medium: 25, Low: 25 }, totals: { weeks, bySeverity: sev, meta: { source: 'cxone' } }, fixed: { weeks, bySeverity: sev } },
    fusion: { projects: [{ id: 'p1', name: 'someone-elses/project', loc: 120000, frequency: 'month', source: 'scan' }, { id: 'm1', name: 'typed by hand', loc: 5000, source: 'manual' }] },
  }, h);
  assert.equal(put.status, 200);
  let got = (await se1.get(`/api/projections/${id}`, h)).data.customer;
  assert.ok(got.tr.totals);
  assert.equal(got.fusion.projects.length, 2);
  const r = await se1.post(`/api/cc/accounts/${id}/cxone/clear`, {});
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.projects, r.data.backlog], [1, true]);
  got = (await se1.get(`/api/projections/${id}`, h)).data.customer;
  assert.ok(!got.tr?.totals && !got.tr?.fixed);
  assert.equal(got.tr.fpPercent.Critical, 25);
  assert.deepEqual(got.fusion.projects.map((p) => p.name), ['typed by hand']);
  // Nothing left to clear: said so. And it is in the audit log.
  assert.equal((await se1.post(`/api/cc/accounts/${id}/cxone/clear`, {})).status, 409);
  assert.match(fs.readFileSync(path.join(env.dataDir, 'audit.log'), 'utf8'), /account\.cxone\.cleared/);
});
