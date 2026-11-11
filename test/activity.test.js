import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ActivityLog, recorded, shortPath } from '../server/activity.js';
import { client, start } from './helpers.js';

let env;
before(async () => {
  env = await start();
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('every Checkmarx One call is recorded for the person and account, without ids, queries or keys', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-act-'));
  const log = new ActivityLog({ dataDir: dir });
  const fake = { request: async (p) => { if (p.includes('scans')) throw Object.assign(new Error('Forbidden'), { status: 403 }); return { ok: true }; } };
  const c = recorded(fake, { log, tenant: 'acme', who: () => ({ user: { id: 'u1', name: 'SE One', teamId: 't1' }, account: { id: 'a1', name: 'Acme', teamId: 't1' } }) });
  await c.request('/api/projects/0b6f9c1e-3a7d-4f0e-9a6b-2f1d8c7e5a4b/branches?apiKey=secret', { query: { limit: 1 } });
  await assert.rejects(c.request('/api/scans'));
  const events = log.recent();
  assert.equal(events.length, 2);
  assert.equal(events[1].path, '/api/projects/:id/branches');
  assert.equal(events[1].status, 200);
  assert.equal(events[0].ok, false);
  assert.equal(events[0].status, 403);
  assert.equal(events[0].account.name, 'Acme');
  assert.doesNotMatch(fs.readFileSync(log.file, 'utf8'), /secret/);
  assert.equal(shortPath('/api/results?scan-id=1'), '/api/results');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('everyone sees their own activity and their teams’, not other teams’; filters by person', async () => {
  const { users, teams, app } = env;
  const ev = (u, team, extra = {}) => app.activity.add({ kind: 'call', user: { id: u.id, name: u.name, email: u.email, teamId: team.id }, tenant: 'acme', account: { id: `acc-${u.id}`, name: `Account of ${u.name}`, teamId: team.id }, method: 'GET', path: '/api/projects', status: 200, ok: true, ms: 12, ...extra });
  ev(users.se1, teams.emea);
  ev(users.se2, teams.emea);
  ev(users.apacSe, teams.apac, { ok: false, status: 500 });
  app.activity.add({ kind: 'report', user: { id: users.se1.id, name: users.se1.name, teamId: teams.emea.id }, account: { id: 'acc-x', name: 'Report Corp', teamId: teams.emea.id }, tenant: 'acme', ok: true, detail: '1,000 credits' });
  const se1 = await client(env.base, 'se1@t.example');
  const mine = (await se1.get('/api/activity?who=me')).data;
  assert.ok(mine.events.length >= 2 && mine.events.every((e) => e.user.id === users.se1.id));
  const team = (await se1.get('/api/activity')).data;
  assert.ok(team.events.some((e) => e.user.id === users.se2.id), 'a teammate');
  assert.ok(!team.events.some((e) => e.user.id === users.apacSe.id), 'not another team');
  assert.ok(team.people.some((p) => p.id === users.se2.id));
  assert.equal(team.summary.reports >= 1, true);
  const vp = await client(env.base, 'vp@t.example');
  const all = (await vp.get('/api/activity?outcome=failed')).data;
  assert.ok(all.events.length && all.events.every((e) => e.ok === false));
  assert.ok(all.events.some((e) => e.user.id === users.apacSe.id), 'a leader sees every team below');
  const two = (await vp.get(`/api/activity?who=${users.se1.id},${users.se2.id}&kind=call`)).data.events;
  assert.ok(two.length >= 2 && two.every((e) => [users.se1.id, users.se2.id].includes(e.user.id) && e.kind === 'call'));
});
