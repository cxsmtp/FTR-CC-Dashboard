/**
 * Backups of the data folder, CxMissionZero's way (src/backup.js): everything people, teams, accounts, reports,
 * settings, certificates and the audit log are, in one compressed file, optionally sealed with a passphrase
 * (AES-256-GCM, key from scrypt). Taken every night and before every version switch, kept 14 deep in
 * DATA_DIR/backups; downloaded and restored by an Admin. The versions folder (app/) is never in a backup.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

import { fail } from './store.js';

export const FORMAT = 'ftr-cc-backup';
const MAGIC_SEALED = Buffer.from('CCBAK1S');
const SKIP = new Set(['app', 'backups', 'initial-admin-password.txt']);
const MAX_UNPACKED = 1024 * 1024 * 1024;

function collect(dataDir) {
  const files = {};
  const walk = (dir, base = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!base && SKIP.has(e.name)) continue;
      if (e.name.endsWith('.tmp') || e.name.endsWith('.part')) continue;
      const rel = `${base}${e.name}`;
      if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}/`);
      else if (e.isFile()) files[rel] = fs.readFileSync(path.join(dir, e.name)).toString('base64');
    }
  };
  walk(dataDir);
  return files;
}

export function createBackup({ dataDir, passphrase = '', version = '', reason = '' }) {
  const files = collect(dataDir);
  const body = zlib.gzipSync(Buffer.from(JSON.stringify({ format: FORMAT, version, reason, at: new Date().toISOString(), files })));
  if (!passphrase) return body;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const sealed = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.concat([MAGIC_SEALED, salt, iv, cipher.getAuthTag(), sealed]);
}

export function readBackup(buffer, { passphrase = '' } = {}) {
  let body = buffer;
  if (buffer.subarray(0, MAGIC_SEALED.length).equals(MAGIC_SEALED)) {
    if (!passphrase) throw fail(400, 'This backup is sealed: give its passphrase.');
    const o = MAGIC_SEALED.length;
    const key = scryptSync(passphrase, buffer.subarray(o, o + 16), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(o + 16, o + 28));
    decipher.setAuthTag(buffer.subarray(o + 28, o + 44));
    try {
      body = Buffer.concat([decipher.update(buffer.subarray(o + 44)), decipher.final()]);
    } catch {
      throw fail(400, 'That passphrase does not open this backup.');
    }
  }
  let bundle;
  try {
    bundle = JSON.parse(zlib.gunzipSync(body, { maxOutputLength: MAX_UNPACKED }).toString('utf8'));
  } catch {
    throw fail(400, 'That is not a backup of the command center.');
  }
  if (bundle?.format !== FORMAT || !bundle.files || typeof bundle.files !== 'object') throw fail(400, 'That is not a backup of the command center.');
  for (const rel of Object.keys(bundle.files)) {
    if (rel.startsWith('/') || rel.split('/').some((s) => s === '..' || !s) || SKIP.has(rel.split('/')[0])) throw fail(400, 'That backup names a file outside the data folder.');
  }
  return bundle;
}

export const describeBackup = (b) => ({ version: b.version, at: b.at, reason: b.reason, files: Object.keys(b.files).length, accounts: Object.keys(b.files).filter((f) => f.startsWith('accounts/')).length, reports: Object.keys(b.files).filter((f) => f.startsWith('reports/')).length });

/** Put a backup's files in place (after a backup of what is there now). The server restarts to read them. */
export function restoreBackup(bundle, { dataDir }) {
  for (const [rel, b64] of Object.entries(bundle.files)) {
    const out = path.join(dataDir, rel);
    if (!out.startsWith(path.resolve(dataDir) + path.sep)) throw fail(400, 'That backup names a file outside the data folder.');
    fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
    const tmp = `${out}.restore.tmp`;
    fs.writeFileSync(tmp, Buffer.from(b64, 'base64'), { mode: 0o600 });
    fs.renameSync(tmp, out);
  }
}

export const backupName = (now = new Date()) => `cc-backup-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.ccbackup`;

export function listBackups(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^cc-backup-[\w-]+\.ccbackup$/.test(f))
      .map((f) => ({ name: f, bytes: fs.statSync(path.join(dir, f)).size, at: fs.statSync(path.join(dir, f)).mtime.toISOString() }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

export function writeBackupTo(dir, { dataDir, passphrase = '', version = '', reason = '', keep = 14 }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = backupName();
  const buf = createBackup({ dataDir, passphrase, version, reason });
  fs.writeFileSync(path.join(dir, name), buf, { mode: 0o600 });
  for (const old of listBackups(dir).slice(keep)) fs.rmSync(path.join(dir, old.name), { force: true });
  return { name, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}
