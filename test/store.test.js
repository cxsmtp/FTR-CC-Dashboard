import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AuditLog, LogLines } from '../server/store.js';

const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-store-'));

test('a log is read whole once, then only what was added; a line still being written waits; a replaced file is read again', () => {
  const file = path.join(fresh(), 'log.jsonl');
  const lines = new LogLines(file);
  assert.deepEqual(lines.entries(), []);
  fs.writeFileSync(file, '{"n":1}\n{"n":2}\n');
  assert.deepEqual(lines.entries().map((e) => e.n), [1, 2]);
  // Appended, the last line not finished yet.
  fs.appendFileSync(file, '{"n":3}\n{"n":');
  assert.deepEqual(lines.entries().map((e) => e.n), [1, 2, 3]);
  fs.appendFileSync(file, '4}\n');
  assert.deepEqual(lines.entries().map((e) => e.n), [1, 2, 3, 4]);
  // A line that is not JSON is passed over, as before.
  fs.appendFileSync(file, 'not json\n{"n":5}\n');
  assert.deepEqual(lines.entries().map((e) => e.n), [1, 2, 3, 4, 5]);
  // Replaced by a shorter file (rotated, or a backup restored).
  fs.writeFileSync(file, '{"n":9}\n');
  assert.deepEqual(lines.entries().map((e) => e.n), [9]);
});

test('the audit log lists what was just recorded, newest first, and still checks out', () => {
  const log = new AuditLog(path.join(fresh(), 'audit.log'));
  for (let i = 0; i < 50; i++) log.record({ action: 'test.event', target: `t${i}` });
  assert.equal(log.recent({ limit: 3 }).map((e) => e.target).join(','), 't49,t48,t47');
  log.record({ action: 'test.other', target: 'last' });
  assert.equal(log.recent({ limit: 1 })[0].target, 'last');
  assert.equal(log.recent({ limit: 100, filter: (e) => e.action === 'test.other' }).length, 1);
  assert.equal(log.recent({ limit: 10 })[0].hash, undefined);
  assert.equal(log.verify().ok, true);
});
