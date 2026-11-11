import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { UpdateService, VersionStore, safeRelative, verifyFolder } from '../server/updates.js';
import { createBackup, readBackup } from '../server/backup.js';
import { AuditLog } from '../server/store.js';
import { ROOT } from './helpers.js';

let tmp;
let release;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-upd-'));
  // A real release of this tree, as 9.9.9.
  const src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  for (const f of ['server', 'core', 'public', 'client', 'scripts', 'package.json', 'LICENSE', 'TERMS.md']) fs.cpSync(path.join(ROOT, f), path.join(src, f), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ ...pkg, version: '9.9.9' }));
  execFileSync(process.execPath, [path.join(src, 'scripts', 'make-release.mjs'), path.join(tmp, 'dist')]);
  release = { archive: fs.readFileSync(path.join(tmp, 'dist', 'ftr-cc-dashboard-9.9.9.tar.gz')), sums: fs.readFileSync(path.join(tmp, 'dist', 'SHA256SUMS')) };
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** GitHub, as far as the updater sees it. */
const downloadsThroughApi = [];
const fakeGithub = (assets) => async (url) => {
  const u = String(url);
  const body = u.includes('/releases?') ? JSON.stringify([{ tag_name: 'v9.9.9', name: 'CC v9.9.9', published_at: '2026-11-10T00:00:00Z', body: 'Notes', assets: [{ name: 'ftr-cc-dashboard-9.9.9.tar.gz', url: 'https://api.github.com/a/1', browser_download_url: 'https://github.com/x/y/releases/download/v9.9.9/ftr-cc-dashboard-9.9.9.tar.gz', size: assets.archive.length }, { name: 'SHA256SUMS', url: 'https://api.github.com/a/2', browser_download_url: 'https://github.com/x/y/releases/download/v9.9.9/SHA256SUMS' }] }]) : u.endsWith('/a/1') || u.endsWith('.tar.gz') ? assets.archive : u.endsWith('/a/2') || u.endsWith('/SHA256SUMS') ? assets.sums : null;
  // The files come from github.com's download links, never the API (its hourly limit).
  if (/api\.github\.com\/a\//.test(u)) downloadsThroughApi.push(u);
  return body === null ? new Response('no', { status: 404 }) : new Response(body, { status: 200 });
};
const service = (assets, extra = {}) => {
  const dataDir = fs.mkdtempSync(path.join(tmp, 'data-'));
  const store = new VersionStore({ dataDir, builtInDir: ROOT, builtInVersion: '1.0.0' });
  return { store, svc: new UpdateService({ store, runningVersion: '1.0.0', repo: 'x/y', fetchImpl: fakeGithub(assets), log: () => {}, ...extra }) };
};

test('a release is installed only when it matches SHA256SUMS and its manifest', async () => {
  const { store, svc } = service(release);
  const list = await svc.check();
  assert.equal(list[0].version, '9.9.9');
  assert.equal(list[0].installable, true);
  const done = await svc.install('9.9.9');
  assert.ok(done.files > 100);
  assert.equal(verifyFolder(store.dirOf('9.9.9')).ok, true);
  // A file changed after install: the launcher would not start it.
  fs.appendFileSync(path.join(store.dirOf('9.9.9'), 'server', 'app.js'), '\n// changed');
  assert.match(verifyFolder(store.dirOf('9.9.9')).reason, /changed since it was released/);
  assert.equal(store.target().source, 'built-in');
});

test('a download that does not match its checksum is refused', async () => {
  const bad = { ...release, archive: Buffer.concat([release.archive, Buffer.from('x')]) };
  const { store, svc } = service(bad);
  await assert.rejects(svc.install('9.9.9'), /does not match its SHA-256/);
  assert.deepEqual(store.installed(), []);
});

test('an archive with a file its manifest does not list is refused', async () => {
  const tar = zlib.gunzipSync(release.archive);
  // Append one more entry before the end-of-archive blocks.
  const h = Buffer.alloc(512);
  h.write('ftr-cc-dashboard-9.9.9/server/evil.js', 0);
  h.write('0000644\0', 100);
  h.write(`${(5).toString(8).padStart(11, '0')}\0`, 124);
  h.write('        ', 148);
  h.write('0', 156);
  h.write('ustar\0', 257);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  const body = Buffer.concat([tar.subarray(0, tar.length - 1024), h, Buffer.from('evil!'), Buffer.alloc(507), Buffer.alloc(1024)]);
  const archive = zlib.gzipSync(body);
  const sums = Buffer.from(`${createHash('sha256').update(archive).digest('hex')}  ftr-cc-dashboard-9.9.9.tar.gz\n`);
  const { svc } = service({ archive, sums });
  await assert.rejects(svc.install('9.9.9'), /files the release did not/);
});

test('switching needs the launcher, takes a backup, and records where to roll back to', async () => {
  const { store, svc } = service(release);
  await svc.install('9.9.9');
  await assert.rejects(svc.switchTo('9.9.9'), /launcher/);
  let exited = null;
  const backups = [];
  const s2 = new UpdateService({ store, runningVersion: '1.0.0', repo: 'x/y', fetchImpl: fakeGithub(release), log: () => {}, supervised: true, exit: (c) => (exited = c), backup: async (r) => backups.push(r) && 'b.ccbackup' });
  await s2.switchTo('9.9.9', { by: 'admin' });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(exited, 75);
  assert.equal(store.state.current.version, '9.9.9');
  assert.equal(store.state.previous.version, '1.0.0');
  assert.equal(backups.length, 1);
  assert.equal(store.target().version, '9.9.9');
});

test('paths that could leave a version folder are refused', () => {
  for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'C:/x', 'a//b', '']) assert.equal(safeRelative(bad), null, bad);
  assert.equal(safeRelative('server/app.js'), 'server/app.js');
});

test('backups: sealed with a passphrase, and nothing outside the data folder', () => {
  const dataDir = fs.mkdtempSync(path.join(tmp, 'bk-'));
  fs.writeFileSync(path.join(dataDir, 'iam.json'), '{"users":[]}');
  fs.mkdirSync(path.join(dataDir, 'app'));
  fs.writeFileSync(path.join(dataDir, 'app', 'state.json'), '{}');
  const sealed = createBackup({ dataDir, passphrase: 'correct horse' });
  assert.throws(() => readBackup(sealed), /passphrase/);
  assert.throws(() => readBackup(sealed, { passphrase: 'wrong' }), /does not open/);
  const b = readBackup(sealed, { passphrase: 'correct horse' });
  assert.ok(b.files['iam.json']);
  assert.equal(b.files['app/state.json'], undefined);
  const evil = zlib.gzipSync(Buffer.from(JSON.stringify({ format: 'ftr-cc-backup', files: { '../x': 'eA==' } })));
  assert.throws(() => readBackup(evil), /outside/);
});

test('the audit log is chained: a changed line is found', () => {
  const file = path.join(tmp, 'audit.log');
  const log = new AuditLog(file);
  for (let i = 0; i < 5; i++) log.record({ action: 'x', target: String(i) });
  assert.deepEqual(log.verify(), { ok: true, events: 5 });
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines[2] = lines[2].replace('"target":"2"', '"target":"two"');
  fs.writeFileSync(file, lines.join('\n'));
  const v = new AuditLog(file).verify();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 3);
});

test('checks for releases every few minutes (an Admin sets how many), and keeps their checksums', async () => {
  const { store, svc } = service(release);
  assert.equal(store.state.auto.enabled, true);
  assert.equal(store.state.auto.everyMinutes, 15);
  svc.setAuto({ everyMinutes: 30 });
  assert.equal(store.state.auto.everyMinutes, 30);
  assert.throws(() => svc.setAuto({ everyMinutes: 2 }), /5 to 1,440/);
  // Not under the launcher: found, not switched to.
  const out = await svc.autoTick();
  assert.deepEqual(out, { available: '9.9.9' });
  assert.ok(store.state.lastCheck.at);
  assert.match(store.state.trusted['9.9.9'].archive, /^[a-f0-9]{64}$/);
  assert.equal(svc.status().trusted[0].version, '9.9.9');
});

test('a release whose checksums changed after it was first seen is never installed', async () => {
  const assets = { ...release };
  const { store, svc } = service(assets, { fetchImpl: async (url) => fakeGithub(assets)(url) });
  await svc.check();
  const kept = store.state.trusted['9.9.9'].archive;
  // The release is re-published with another archive and matching SHA256SUMS.
  assets.archive = Buffer.concat([release.archive, Buffer.from('x')]);
  assets.sums = Buffer.from(`${createHash('sha256').update(assets.archive).digest('hex')}  ftr-cc-dashboard-9.9.9.tar.gz\n`);
  const list = await svc.check();
  assert.equal(list[0].tampered, true);
  assert.equal(store.state.trusted['9.9.9'].archive, kept);
  await assert.rejects(svc.install('9.9.9'), /changed after it was first seen/);
  assert.deepEqual(store.installed(), []);
  assert.ok(store.state.events.some((e) => e.type === 'checksum-changed'));
});

test('always on the newest version; a rollback by hand holds back what it left until something newer', async () => {
  const exits = [];
  const { store, svc } = service(release, { supervised: true, exit: (c) => exits.push(c) });
  const out = await svc.autoTick();
  assert.equal(out.to, '9.9.9');
  assert.equal(store.state.current.version, '9.9.9');
  // Now running 9.9.9, rolled back by hand to the built-in one: 9.9.9 is not put back by itself.
  const later = new UpdateService({ store, runningVersion: '9.9.9', repo: 'x/y', fetchImpl: fakeGithub(release), log: () => {}, supervised: true, exit: (c) => exits.push(c), backup: async () => null });
  await later.switchTo('built-in', { reason: 'rollback by hand' });
  assert.equal(store.state.heldUpTo, '9.9.9');
  const back = new UpdateService({ store, runningVersion: '1.0.0', repo: 'x/y', fetchImpl: fakeGithub(release), log: () => {}, supervised: true, exit: (c) => exits.push(c) });
  assert.deepEqual(await back.autoTick(), { held: '9.9.9' });
  // Moving forward by hand lifts the hold.
  await back.switchTo('9.9.9', { reason: 'by hand' });
  assert.equal(store.state.heldUpTo, null);
});

test('release files are downloaded from github.com, not through the API and its hourly limit', async () => {
  downloadsThroughApi.length = 0;
  const { svc } = service(release);
  await svc.install('9.9.9');
  assert.deepEqual(downloadsThroughApi, []);
});
