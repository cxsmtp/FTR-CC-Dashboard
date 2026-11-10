#!/usr/bin/env node
/**
 * Build a release the command center can install from Settings → Updates:
 *   dist/ftr-cc-dashboard-<version>.tar.gz   the app (server, public, client, vendor, docs, production node_modules)
 *                                            with MANIFEST.json: every file and its SHA-256
 *   dist/SHA256SUMS                          the archive's SHA-256
 * Run after `npm ci --omit=dev`. The release workflow (.github/workflows/release.yml) runs it on a v* tag and
 * attaches both files to the GitHub release.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'dist'));
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const INCLUDE = ['server', 'public', 'client', 'vendor', 'docs', 'scripts', 'node_modules', 'package.json', 'package-lock.json', 'LICENSE', 'TERMS.md', 'README.md', 'CHANGELOG.md'];
const sha = (b) => createHash('sha256').update(b).digest('hex');

const files = {};
const walk = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) for (const name of fs.readdirSync(abs).sort()) walk(path.posix.join(rel, name));
  else if (st.isFile() && !rel.endsWith('.tmp')) files[rel] = fs.readFileSync(abs);
};
for (const item of INCLUDE) walk(item);
files['MANIFEST.json'] = Buffer.from(`${JSON.stringify({ version, built: new Date().toISOString(), files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha(v)])) }, null, 1)}\n`);

// A plain ustar archive, every file under ftr-cc-dashboard-<version>/ (long paths in pax headers).
const blocks = [];
const top = `ftr-cc-dashboard-${version}`;
const header = (name, size, type = '0') => {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  h.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136);
  h.write('        ', 148);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
};
const pad = (n) => Buffer.alloc((512 - (n % 512)) % 512);
for (const [rel, data] of Object.entries(files)) {
  const name = `${top}/${rel}`;
  if (Buffer.byteLength(name) > 100) {
    const rec = (len) => `${len} path=${name}\n`;
    let len = Buffer.byteLength(rec(0));
    while (Buffer.byteLength(rec(len)) !== len) len = Buffer.byteLength(rec(len));
    const pax = Buffer.from(rec(len));
    blocks.push(header('pax', pax.length, 'x'), pax, pad(pax.length));
  }
  blocks.push(header(name, data.length), data, pad(data.length));
}
blocks.push(Buffer.alloc(1024));
const archive = zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
fs.mkdirSync(OUT, { recursive: true });
const asset = `ftr-cc-dashboard-${version}.tar.gz`;
fs.writeFileSync(path.join(OUT, asset), archive);
fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), `${sha(archive)}  ${asset}\n`);
console.log(`${asset}: ${Object.keys(files).length} files, ${(archive.length / 1024 / 1024).toFixed(1)} MB, sha256 ${sha(archive)}`);
