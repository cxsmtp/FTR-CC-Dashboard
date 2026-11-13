import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CalculatorService } from '../server/calculator.js';

// An update without a restart: what one version holds in memory goes to the next (server/launch.js).
const service = () => new CalculatorService({ cxoneHosts: ['checkmarx.net'], gitHosts: ['github.com'], log: () => {}, connect: (connection) => ({ connection, request: async () => ({}) }) });

test('Checkmarx One connections and reads not yet put into their account move to the next version', () => {
  const before = service();
  before.adopt({
    people: [{ userId: 'u1', connection: { tenant: 'acme', baseUrl: 'https://eu.ast.checkmarx.net', apiKey: 'k' }, job: { id: 'j', state: 'done', applied: false, account: { id: 'a1', name: 'Acme' }, result: { projects: [1, 2] }, startedAt: 'x' }, read: { readAt: '2026-11-11', weeks: ['2026-W45'], series: { p1: { scans: 3, t: 2, f: 1 } } } }],
    interrupted: [['u2', { account: { id: 'a2' }, at: 'y' }]],
  });
  const state = before.handoff();
  // Over the launcher's channel, as a copy.
  const after = service();
  after.adopt(structuredClone(state));
  assert.deepEqual(after.status('u1'), { connected: true, tenant: 'acme', baseUrl: 'https://eu.ast.checkmarx.net', account: null });
  const w = after.work('u1');
  assert.equal(w.read.state, 'done');
  assert.equal(w.read.applied, false);
  assert.equal(w.read.projects, 2);
  assert.equal(after.work('u2').read.state, 'interrupted');
  assert.equal(after.markApplied('u1', 'a1'), true);
  // The version before lets go: nothing it still finishes changes anything.
  before.release();
  assert.equal(before.status('u1').connected, false);
});

test('password-reset links sent before an update still work after it', async () => {
  const { PasswordResets } = await import('../core/src/password-reset.js');
  const user = { id: 'u1', passwordHash: 'scrypt$abc$def' };
  const before = new PasswordResets();
  const { token } = before.issue(user);
  const after = new PasswordResets();
  after.adopt(structuredClone(before.handoff()));
  assert.equal(after.check(token, () => user)?.id, 'u1');
  // The count of links sent goes too: three an hour, a minute apart, whichever version sent them.
  assert.equal(after.maySend('u1'), false);
  assert.equal(new PasswordResets().check(token, () => user), null);
});

test('git counts move to the next version; one still running is ended and says so', async () => {
  const { createGitCounter } = await import('../core/src/fusion-git.js');
  const before = createGitCounter();
  // As a count stands in memory: one repository counted, one still waiting.
  before.adopt([{ id: 'job-1', owner: 'u1', state: 'done', engine: 'git', startedAt: new Date(Date.now() - 60_000).toISOString(), finishedAt: new Date().toISOString(), host: 'github.com', seq: 3, people: ['p1', 'p2'], repositories: [{ i: 0, name: 'api', state: 'done', lines: 1200, seq: 2 }, { i: 1, name: 'web', state: 'failed', error: 'x', seq: 3 }] }]);
  const after = createGitCounter();
  after.adopt(structuredClone(before.handoff()));
  const seen = after.view('u1', 'job-1');
  assert.equal(seen.state, 'done');
  assert.equal(seen.summary.measured, 1);
  assert.equal(seen.summary.lines, 1200);
  assert.equal(seen.summary.developers, 2);
  // Only its owner's.
  assert.throws(() => after.view('u2', 'job-1'), /no longer here/);
});

test('an earlier report that is malformed or hostile is read in time that grows with its size, not its square', async () => {
  const { readOldReport } = await import('../server/old-report.js');
  for (const piece of ['<table', '<', '<style', '<tr><td', '<svg']) {
    const page = piece.repeat(Math.round(3_000_000 / piece.length));
    const start = performance.now();
    try {
      readOldReport(page, { force: true });
    } catch {}
    assert.ok(performance.now() - start < 3000, `${piece} took too long`);
  }
});
