import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CallMemory, explainCall } from '../server/resilience.js';
import { recorded } from '../server/activity.js';

test('a call that did not succeed is explained: why, what was done, next time, and a verdict', () => {
  const meta = explainCall({ kind: 'call', method: 'GET', path: '/api/sast-metadata/:id', status: 404 });
  assert.equal(meta.verdict, 'recovered');
  assert.match(meta.why, /no SAST metadata/);
  assert.match(meta.done, /scan’s own details/);
  assert.equal(explainCall({ path: '/api/fusion/models', status: 404 }).verdict, 'expected');
  assert.equal(explainCall({ path: '/api/projects/:id/branches', status: 404 }).verdict, 'recovered');
  assert.equal(explainCall({ path: '/api/projects', status: 401 }).verdict, 'failed');
  assert.equal(explainCall({ path: '/api/projects', status: 429 }).verdict, 'failed');
  assert.match(explainCall({ path: '/api/projects', status: 429 }).next, /at most 6 calls at once/);
  assert.equal(explainCall({ path: '/api/scans', status: 503 }).verdict, 'failed');
});

test('what a tenant teaches: the same failing call is not made again, its fallback runs, and it is remembered', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-resil-'));
  const log = { events: [], add(e) { this.events.push(e); } };
  let asked = 0;
  const fake = {
    async request(p) {
      asked++;
      if (p.startsWith('/api/sast-metadata/')) throw Object.assign(new Error('404 Not Found'), { status: 404 });
      if (p === '/api/fusion/models') throw Object.assign(new Error('404 Not Found'), { status: 404 });
      return { ok: true };
    },
  };
  const memory = new CallMemory({ dataDir });
  const client = recorded(fake, { log, who: () => ({}), tenant: 'acme', memory });
  await assert.rejects(client.request('/api/sast-metadata/scan-1'), { status: 404 });
  await assert.rejects(client.request('/api/fusion/models'), { status: 404 });
  assert.equal(asked, 2);
  assert.equal(log.events.filter((e) => e.ok === false).length, 2);
  // Next time: not asked, nothing logged as a failure, counted as avoided; a different scan is still asked.
  await assert.rejects(client.request('/api/sast-metadata/scan-1'), { avoided: true });
  await assert.rejects(client.request('/api/fusion/models'), { avoided: true });
  await assert.rejects(client.request('/api/sast-metadata/scan-2'), { status: 404 });
  assert.equal(asked, 3);
  assert.equal(log.events.filter((e) => e.ok === false).length, 3);
  assert.deepEqual(await client.request('/api/projects'), { ok: true });
  const s = memory.summary()[0];
  assert.equal(s.noSastMeta, 2);
  assert.equal(s.avoided, 2);
  assert.equal(s.skipped.length, 1);
  // Kept on disk: a new version (or a restart) knows it too.
  await new Promise((r) => setTimeout(r, 1200));
  const again = new CallMemory({ dataDir });
  assert.equal(again.allows('acme', '/api/sast-metadata/scan-1'), false);
  assert.equal(again.allows('acme', '/api/sast-metadata/scan-3'), true);
  assert.equal(again.allows('other', '/api/sast-metadata/scan-1'), true);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a tenant that asked to slow down is read with at most 6 calls at once from then on', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-slow-'));
  const memory = new CallMemory({ dataDir });
  let now = 0;
  let most = 0;
  const fake = {
    async request(p) {
      if (p === '/api/busy') throw Object.assign(new Error('429'), { status: 429 });
      now++;
      most = Math.max(most, now);
      await new Promise((r) => setTimeout(r, 15));
      now--;
      return {};
    },
  };
  const client = recorded(fake, { log: { add() {} }, who: () => ({}), tenant: 'busy-co', memory });
  await Promise.all(Array.from({ length: 20 }, () => client.request('/api/projects')));
  assert.equal(most, 20);
  await assert.rejects(client.request('/api/busy'));
  most = 0;
  await Promise.all(Array.from({ length: 20 }, () => client.request('/api/projects')));
  assert.equal(most, 6);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
