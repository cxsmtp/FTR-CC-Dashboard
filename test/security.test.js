import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Iam } from '../server/iam.js';
import { SMTP_PORTS, mergeSmtp } from '../server/mailer.js';
import { CallMemory } from '../server/resilience.js';

test('guesses sent all at once cannot slip past the lock: at most 5 are checked, the rest refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sec-'));
  try {
    const iam = new Iam(dir);
    const { user, temporary } = await iam.create({ email: 'lock@t.example', name: 'Lock', role: 'se', teamId: 't1' });
    const tries = await Promise.allSettled(Array.from({ length: 20 }, () => iam.signIn('lock@t.example', 'wrong-password-123')));
    const wrong = tries.filter((t) => t.status === 'rejected' && t.reason.status === 401).length;
    const refused = tries.filter((t) => t.status === 'rejected' && t.reason.status === 429).length;
    assert.ok(wrong <= 5, `only 5 checked, got ${wrong}`);
    assert.equal(wrong + refused, 20);
    // Locked now: even the right password waits.
    await assert.rejects(iam.signIn('lock@t.example', temporary), (e) => e.status === 429);
    iam.unlock(user.id);
    assert.equal((await iam.signIn('lock@t.example', temporary)).id, user.id);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the mail server test only knocks on mail ports', () => {
  assert.deepEqual(SMTP_PORTS, [25, 465, 587, 2525, 1025]);
  assert.equal(mergeSmtp({ host: 'smtp.example.com', port: 587 }, { port: 465, secure: true }).port, 465);
  assert.throws(() => mergeSmtp({ host: 'smtp.example.com', port: 587 }, { port: 6379 }), /not a mail port/);
  // A port kept from before stays (nothing an Admin set is changed by an update).
  assert.equal(mergeSmtp({ host: 'smtp.example.com', port: 8025 }, { fromName: 'x' }).port, 8025);
});

test('what the API calls teach is kept under keys that never reach a prototype', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sec-'));
  try {
    const memory = new CallMemory({ dataDir: dir });
    memory.learn('__proto__', '/api/sast-metadata/x', 404);
    memory.learn('constructor', '/api/x', 500);
    assert.equal({}.noSastMeta, undefined);
    assert.equal(Object.prototype.skip, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
