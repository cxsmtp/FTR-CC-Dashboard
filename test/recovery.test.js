import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { recoverDataDir } from '../server/recover.js';
import { writeBackupTo } from '../server/backup.js';
import { createApp } from '../server/app.js';
import { ROOT, sfLink, client, reportData, start } from './helpers.js';
import { CalculatorService } from '../server/calculator.js';

const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-rec-'));

test('a damaged data file is restored from the newest backup that has a good copy', () => {
  const dataDir = fresh();
  const backupDir = fresh();
  fs.mkdirSync(path.join(dataDir, 'accounts'));
  fs.writeFileSync(path.join(dataDir, 'iam.json'), '{"users":[{"id":"u1"}]}');
  fs.writeFileSync(path.join(dataDir, 'accounts', 'a1.json'), '{"id":"a1","name":"Kept"}');
  writeBackupTo(backupDir, { dataDir, passphrase: 'pp' });
  // Damage both.
  fs.writeFileSync(path.join(dataDir, 'iam.json'), '{"users":[{"id":');
  fs.writeFileSync(path.join(dataDir, 'accounts', 'a1.json'), '\u0000\u0000');
  const events = recoverDataDir({ dataDir, backupDir, passphrase: 'pp', log: () => {} });
  assert.deepEqual(events.map((e) => [e.file, e.outcome]).sort(), [['accounts/a1.json', 'restored'], ['iam.json', 'restored']]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'iam.json'), 'utf8')).users[0].id, 'u1');
  assert.ok(fs.readdirSync(dataDir).some((f) => f.startsWith('iam.json.damaged-')), 'the damaged file is kept');
});

test('no good copy: an account is set aside and the server starts; people and teams stop the start', () => {
  const dataDir = fresh();
  const backupDir = fresh();
  fs.mkdirSync(path.join(dataDir, 'accounts'));
  fs.writeFileSync(path.join(dataDir, 'accounts', 'a2.json'), '{broken');
  const events = recoverDataDir({ dataDir, backupDir, log: () => {} });
  assert.equal(events[0].outcome, 'set aside');
  assert.ok(!fs.existsSync(path.join(dataDir, 'accounts', 'a2.json')));
  fs.writeFileSync(path.join(dataDir, 'teams.json'), '{broken');
  assert.throws(() => recoverDataDir({ dataDir, backupDir, log: () => {} }), /cannot be read and no backup/);
  assert.equal(fs.readFileSync(path.join(dataDir, 'teams.json'), 'utf8'), '{broken', 'left as it was for an Admin');
});

test('the server starts on damaged data and says so in the audit log; backups can go to their own place', async () => {
  const env = await start();
  const admin = await client(env.base, 'admin@t.example');
  const se1 = await client(env.base, 'se1@t.example');
  const { data } = await se1.post('/api/projections', { name: 'Survivor', salesforceUrl: sfLink() }, { 'X-Team': env.teams.emea.id });
  await se1.put(`/api/cc/accounts/${data.customer.id}`, { salesforceUrl: sfLink() });
  await se1.post('/api/projections/reports', { customerId: data.customer.id, data: reportData() }, { 'X-Team': env.teams.emea.id });
  assert.equal((await admin.post('/api/backups')).status, 200);
  await env.close();
  // The disk damages the account; the server starts again on the same folder.
  fs.writeFileSync(path.join(env.dataDir, 'accounts', `${data.customer.id}.json`), '{"id":');
  const backupDir = fresh();
  const config = { root: ROOT, dataDir: env.dataDir, backupDir, adminEmail: 'admin@t.example', sessionIdleHours: 8, signInPerMinute: 10000, signInPerAccountPerMinute: 10000, secureCookies: false, trustProxy: false, publicUrl: '', productCode: '', salesforceHosts: null, cxoneHosts: null, gitHosts: null };
  // The backups were in the data folder: copy them to BACKUP_DIR, as an Admin moving them would.
  for (const f of fs.readdirSync(path.join(env.dataDir, 'backups'))) fs.copyFileSync(path.join(env.dataDir, 'backups', f), path.join(backupDir, f));
  const app = createApp(config, { log: () => {} });
  await app.ready;
  assert.equal(app.accounts.accounts.meta(data.customer.id)?.name, 'Survivor');
  assert.ok(app.audit.recent({ filter: (e) => e.action === 'recover.restored' }).length);
  app.stop();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('a read cut off by a restart starts again with the account’s kept key', async () => {
  const calc = new CalculatorService({ cxoneHosts: ['checkmarx.net'], gitHosts: ['github.com'], log: () => {} });
  calc.connectKey = async () => ({ connected: true, tenant: 'acme', baseUrl: 'https://eu.ast.checkmarx.net' });
  const started = [];
  calc.startRead = (userId, input, account) => (started.push({ userId, account }), { state: 'running' });
  const env = await start({ calculatorService: calc });
  const se1 = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const { data } = await se1.post('/api/projections', { name: 'Resume Co', salesforceUrl: sfLink() }, h);
  // Nothing is read for an account until it is tied to Salesforce.
  await se1.put(`/api/cc/accounts/${data.customer.id}`, { salesforceUrl: sfLink() }, h);
  await se1.post('/api/cc/cxone/connect', { apiKey: 'eu-key-x', remember: true, accountId: data.customer.id });
  await se1.post('/api/projections/read', {}, { ...h, 'X-Account': data.customer.id });
  const pending = JSON.parse(fs.readFileSync(path.join(env.dataDir, 'reads.json'), 'utf8')).reads;
  assert.equal(pending[env.users.se1.id].account.id, data.customer.id);
  await env.close();
  // A new server on the same data: the read is started again.
  started.length = 0;
  const app = createApp({ root: ROOT, dataDir: env.dataDir, adminEmail: 'admin@t.example', sessionIdleHours: 8, secureCookies: false, trustProxy: false, publicUrl: '', productCode: '', salesforceHosts: null, cxoneHosts: null, gitHosts: null }, { log: () => {}, calculatorService: calc });
  await app.started();
  assert.equal(started[0]?.account?.id, data.customer.id);
  assert.ok(app.audit.recent({ filter: (e) => e.action === 'cxone.read.resumed' }).length);
  app.stop();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('the Admin seals backups with a passphrase from Settings, at once: the next backup needs it to be read', async () => {
  const env = await start();
  const admin = await client(env.base, 'admin@t.example');
  assert.equal((await admin.put('/api/backups/seal', { passphrase: 'short' })).status, 400);
  assert.equal((await admin.put('/api/backups/seal', { passphrase: 'a-long-enough-passphrase' })).status, 200);
  assert.equal((await admin.get('/api/backups')).data.sealed, true);
  assert.equal((await admin.post('/api/backups', {})).status, 200);
  const newest = (await admin.get('/api/backups')).data.backups[0];
  const file = fs.readFileSync(path.join(env.dataDir, 'backups', newest.name));
  const data = file.toString('base64');
  assert.equal((await admin.post('/api/backups/inspect', { data })).status, 400);
  assert.equal((await admin.post('/api/backups/inspect', { data, passphrase: 'a-long-enough-passphrase' })).status, 200);
  const se = await client(env.base, 'se1@t.example');
  assert.equal((await se.put('/api/backups/seal', { passphrase: 'a-long-enough-passphrase' })).status, 403);
  assert.equal((await admin.put('/api/backups/seal', { passphrase: '' })).status, 200);
  assert.equal((await admin.get('/api/backups')).data.sealed, false);
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('a backup of real size is restored from the page, and the audit log still checks out after it', async () => {
  const env = await start();
  try {
    const admin = await client(env.base, 'admin@t.example');
    const se1 = await client(env.base, 'se1@t.example');
    const h = { 'X-Team': env.teams.emea.id };
    // An account with enough in it that its backup is well over the usual 256 KB a request may carry.
    const { data } = await se1.post('/api/projections', { name: 'Big Corp', salesforceUrl: sfLink() }, h);
    const id = data.customer.id;
    const projects = Array.from({ length: 12000 }, (_, i) => ({ id: `p${i}`, name: `project-${i}-${randomBytes(40).toString('hex')}`, lines: 1000 + i, included: true, source: 'manual' }));
    assert.equal((await se1.put(`/api/projections/${id}`, { fusion: { projects } }, h)).status, 200);
    const made = await admin.post('/api/backups', {});
    assert.equal(made.status, 200);
    const file = await fetch(`${env.base}/api/backups/${made.data.name}`, { headers: { Cookie: admin.cookie } });
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.ok(bytes.length > 300 * 1024, `the backup is ${bytes.length} bytes`);
    // Changed after the backup: the restore brings the earlier name back.
    await se1.put(`/api/cc/accounts/${id}`, { name: 'Renamed Corp' });
    // Made after the backup: gone after the restore (the data is the backup's, not a mix).
    const later = (await se1.post('/api/projections', { name: 'Made Later Corp', salesforceUrl: sfLink() }, h)).data.customer.id;
    assert.ok(fs.existsSync(path.join(env.dataDir, 'accounts', `${later}.json`)));
    const body = { data: bytes.toString('base64') };
    assert.equal((await admin.post('/api/backups/inspect', body)).status, 200);
    assert.equal((await admin.post('/api/backups/restore', body)).status, 409);
    const restored = await admin.post('/api/backups/restore', { ...body, confirm: true });
    assert.equal(restored.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(env.dataDir, 'accounts', `${id}.json`), 'utf8')).name, 'Big Corp');
    assert.equal(fs.existsSync(path.join(env.dataDir, 'accounts', `${later}.json`)), false);
    // The chain goes on from the restored log's last line.
    const check = await admin.get('/api/audit/verify');
    assert.equal(check.data.ok, true, JSON.stringify(check.data));
    // Someone who does not manage backups is not given the large allowance.
    assert.equal((await se1.post('/api/backups/restore', body)).status, 413);
  } finally {
    await env.close();
  }
});
