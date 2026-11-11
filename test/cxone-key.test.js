import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CalculatorService } from '../server/calculator.js';
import { SF, client, start } from './helpers.js';

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
  const secret = 'eu-key-SECRET-1234567890';
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
