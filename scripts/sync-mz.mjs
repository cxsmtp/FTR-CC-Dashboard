#!/usr/bin/env node
/**
 * Copy the Cx Credits Calculator from a CxMissionZero (MZ) checkout into vendor/mz/, so the dashboard runs
 * exactly MZ's calculator: its projection, its Checkmarx One reads, its Fusion counting (cloc-fusion) and its
 * reports. Changes to the calculator are made in MZ; run this to take a new release:
 *
 *   node scripts/sync-mz.mjs /path/to/CxDetectionDateBaseReminder
 *
 * It copies the launcher's module graph (the same files the standalone cx-credits-calculator.mjs carries), the
 * page builder, the page's modules, styles, fonts and samples, and records the MZ version and commit in
 * vendor/mz/SOURCE.json. Nothing else of MZ is taken.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mz = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(mz, 'src', 'calculator-launcher.js'))) {
  console.error('Give the path of a CxMissionZero checkout: node scripts/sync-mz.mjs <path>');
  process.exit(1);
}
const out = path.join(ROOT, 'vendor', 'mz');

/** A module and every file it imports, following relative imports and re-exports. */
function graph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const m of fs.readFileSync(entry, 'utf8').matchAll(/^(?:import|export)\s[^;]*?from\s*'(\.[^']+)'/gms)) graph(path.resolve(path.dirname(entry), m[1]), seen);
  return seen;
}

const files = new Set();
// The calculator, and the pieces of MZ the command center runs as they are: HTTPS (certificates, Let's Encrypt) and
// forgotten passwords.
for (const entry of ['src/calculator-launcher.js', 'src/standalone-calculator.js', 'src/licence-gate.js', 'public/calculator/standalone.js', 'public/calculator/report-live.js', 'src/https-manager.js', 'src/acme.js', 'src/password-reset.js']) {
  for (const f of graph(path.join(mz, entry))) files.add(path.relative(mz, f));
}
const tree = (dir) => fs.readdirSync(path.join(mz, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? tree(path.join(dir, d.name)) : [path.join(dir, d.name)]));
for (const f of [...tree('public/calculator'), ...tree('public/fonts'), 'public/styles.css', 'public/nextgen.css', 'public/index.html', 'public/favicon.svg', 'public/contours-dark.svg', 'public/contours-light.svg', 'src/cloc-fusion/cloc-fusion.html', 'LICENSE']) files.add(f);

fs.rmSync(out, { recursive: true, force: true });
for (const f of [...files].sort()) {
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(path.join(mz, f), path.join(out, f));
}
fs.writeFileSync(path.join(out, 'package.json'), '{ "type": "module", "private": true }\n');
let commit = '';
try {
  commit = execFileSync('git', ['-C', mz, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}
const version = JSON.parse(fs.readFileSync(path.join(mz, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'SOURCE.json'), `${JSON.stringify({ from: 'https://github.com/cxsmtp/CxDetectionDateBaseReminder', version, label: `MZ-${version.split('.').map((n) => n.padStart(2, '0')).join('.')}`, commit, copiedAt: new Date().toISOString(), files: files.size }, null, 2)}\n`);
console.log(`Copied ${files.size} files of MZ ${version} (${commit.slice(0, 12)}) into vendor/mz/.`);
