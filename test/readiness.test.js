import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Accounts, startIndex } from '../server/accounts.js';
import { readiness } from '../server/readiness.js';
import { recoverDataDir } from '../server/recover.js';
import { sureParts } from '../public/js/links.js';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const facts = (over = {}) => ({
  backups: [{ name: 'b', at: '2026-11-14T02:00:00Z' }],
  backupSeparate: true,
  backupSealed: true,
  restores: 1,
  audit: { ok: true, events: 10 },
  https: { mode: 'https', selfSigned: false },
  supervised: true,
  auto: { stage: 'production', window: { from: '01:00', to: '04:00' } },
  mailReady: true,
  disk: { freeMB: 9000, totalMB: 20000 },
  users: [
    { id: 'a1', role: 'admin', active: true, createdAt: '2026-01-01T00:00:00Z', lastSignInAt: '2026-11-13T00:00:00Z' },
    { id: 'a2', role: 'admin', active: true, createdAt: '2026-01-01T00:00:00Z', lastSignInAt: '2026-11-13T00:00:00Z' },
    { id: 's1', role: 'se', active: true, createdAt: '2026-01-01T00:00:00Z', lastSignInAt: '2026-11-13T00:00:00Z' },
  ],
  roles: { admin: { name: 'Admin', permissions: ['settings.manage', 'scope.all'] }, se: { name: 'Sales Engineer', permissions: ['calculator.use'] } },
  teams: [{ id: 't', name: 'Global', leaderIds: ['a1'] }],
  unrated: [],
  recentErrors: [],
  ...over,
});

test('Ready for production: nothing to do when everything is in place', () => {
  const r = readiness(facts(), NOW);
  assert.equal(r.todo, 0);
  assert.equal(r.notes, 0);
  assert.ok(r.checks.every((c) => c.state === 'ok'));
});

test('Ready for production: each gap is said, with where it is put right', () => {
  const r = readiness(facts({
    backups: [{ name: 'b', at: '2026-11-10T02:00:00Z' }],
    backupSealed: false,
    restores: 0,
    https: { mode: 'https', selfSigned: true },
    auto: {},
    users: [
      { id: 'a1', role: 'admin', active: true, createdAt: '2026-01-01T00:00:00Z', lastSignInAt: '2026-11-13T00:00:00Z' },
      { id: 'old', role: 'se', active: true, mustChangePassword: true, createdAt: '2026-10-01T00:00:00Z', lastSignInAt: null },
      { id: 'new', role: 'se', active: true, mustChangePassword: true, createdAt: '2026-11-12T00:00:00Z', lastSignInAt: null },
      { id: 'x', role: 'tester', active: true, createdAt: '2026-01-01T00:00:00Z', lastSignInAt: '2026-11-13T00:00:00Z' },
    ],
    roles: { admin: { name: 'Admin', permissions: ['scope.all'] }, se: { name: 'SE', permissions: [] }, tester: { name: 'Tester', permissions: ['scope.all'] }, unused: { name: 'Unused', permissions: ['scope.all', 'settings.manage'] } },
    teams: [{ id: 't', name: 'Global', leaderIds: ['a1'] }, { id: 'u', name: 'APAC', leaderIds: ['gone'] }, { id: 'v', name: 'EMEA' }],
    unrated: ['Mythos 5.1'],
    recentErrors: [{ at: '2026-11-14T11:00:00Z', line: 'error: x' }, { at: '2026-11-01T11:00:00Z', line: 'old' }],
  }), NOW);
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  for (const id of ['backup.recent', 'backup.sealed', 'https.trusted', 'people.admins', 'people.invites', 'teams.leaders', 'rates.engines']) assert.equal(by[id].state, 'todo', id);
  for (const id of ['backup.restored', 'updates.stage', 'roles.wide', 'errors.recent']) assert.equal(by[id].state, 'note', id);
  assert.match(by['people.invites'].detail, /^1 person/); // the one invited two days ago is not stale
  assert.match(by['teams.leaders'].detail, /APAC, EMEA/);
  assert.match(by['roles.wide'].detail, /Tester/);
  assert.doesNotMatch(by['roles.wide'].detail, /Unused/); // a role nobody holds is not a way in
  assert.equal(by['roles.broad'].state, 'ok');
  assert.match(by['errors.recent'].detail, /^1 line/);
  assert.ok(r.checks.filter((c) => c.state !== 'ok').every((c) => c.where.startsWith('/')));
});

test('The start reads each account and report once, and still loads what recovery put back', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-start-'));
  new Accounts(dataDir); // makes the folders
  fs.writeFileSync(path.join(dataDir, 'accounts', 'one.json'), JSON.stringify({ id: 'one', name: 'One', teamId: 't' }));
  fs.writeFileSync(path.join(dataDir, 'accounts', 'two.json'), JSON.stringify({ id: 'two', name: 'Two', teamId: 't' }));
  fs.writeFileSync(path.join(dataDir, 'accounts', 'noid.json'), JSON.stringify({ name: 'no id' }));
  const plain = new Accounts(dataDir);
  const { known, seen } = startIndex();
  assert.deepEqual(recoverDataDir({ dataDir, backupDir: path.join(dataDir, 'backups'), log: () => {}, seen }), []);
  assert.equal(known.accounts.size, 3);
  // A file that appears after the check (put back from a backup) is read as before.
  fs.writeFileSync(path.join(dataDir, 'accounts', 'three.json'), JSON.stringify({ id: 'three', name: 'Three', teamId: 't' }));
  const fast = new Accounts(dataDir, known);
  assert.deepEqual(fast.accounts.list().map((x) => x.id).sort(), ['one', 'three', 'two']);
  assert.deepEqual(fast.accounts.meta('one'), plain.accounts.meta('one'));
});

test('"Are you sure?": the question, the small print, and red for what cannot be taken back', () => {
  assert.deepEqual(sureParts('Delete this report? This cannot be undone.'), { question: 'Delete this report? This cannot be undone.', rest: [], danger: true, verb: 'Delete' });
  const p = sureParts('Give 3 people the role Leader?');
  assert.equal(p.danger, false);
  assert.equal(p.verb, 'Confirm');
  const q = sureParts('Restore the backup of today?\n\nEverything here is replaced.');
  assert.deepEqual([q.verb, q.danger, q.rest.length], ['Restore', true, 1]);
});
