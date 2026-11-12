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
