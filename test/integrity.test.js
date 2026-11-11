import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { IntegrityService } from '../server/integrity/service.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
/** A release folder: two files and their list. */
function release() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-int-'));
  fs.mkdirSync(path.join(dir, 'server'));
  fs.writeFileSync(path.join(dir, 'server', 'app.js'), 'console.log(1)\n');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"9.9.9"}\n');
  const manifest = { version: '9.9.9', commit: 'abc', repository: 'x/y', files: { 'server/app.js': sha('console.log(1)\n'), 'package.json': sha('{"version":"9.9.9"}\n') } };
  fs.writeFileSync(path.join(dir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  return dir;
}
const noAttestation = async () => new Response('{}', { status: 404 });
const offline = async () => {
  throw Object.assign(new Error('offline'), { cause: { code: 'ENOTFOUND' } });
};

test('a copy built from the source has no signed file list', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-int-'));
  const svc = new IntegrityService({ appDir: dir, dataDir: dir, repository: 'x/y', fetch: noAttestation });
  assert.equal((await svc.check()).state, 'unsigned');
});

test('files that match, with no signature for their list, are not genuine; offline, unconfirmed', async () => {
  const dir = release();
  assert.equal((await new IntegrityService({ appDir: dir, dataDir: dir, repository: 'x/y', fetch: noAttestation }).check()).state, 'not-genuine');
  const off = await new IntegrityService({ appDir: dir, dataDir: dir, repository: 'x/y', fetch: offline }).check();
  assert.equal(off.state, 'unconfirmed');
  assert.equal(off.files.checked, 2);
});

test('a changed, missing or added file is found, with no network', async () => {
  const dir = release();
  fs.appendFileSync(path.join(dir, 'server', 'app.js'), '// changed\n');
  fs.writeFileSync(path.join(dir, 'server', 'extra.js'), 'x');
  const r = await new IntegrityService({ appDir: dir, dataDir: dir, repository: 'x/y', fetch: offline }).check();
  assert.equal(r.state, 'tampered');
  assert.deepEqual(r.files.changed, ['server/app.js']);
  assert.deepEqual(r.files.extra, ['server/extra.js']);
  const events = [];
  const svc = new IntegrityService({ appDir: dir, dataDir: dir, repository: 'x/y', fetch: offline, record: (e) => events.push(e.state) });
  await svc.check();
  await svc.check();
  assert.deepEqual(events, ['tampered'], 'recorded once, when it changes');
});
