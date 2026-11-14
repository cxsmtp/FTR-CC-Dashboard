/**
 * Self-healing start. Before anything is loaded, every data file is read. A file that cannot be read (cut short by a
 * failing disk, edited by hand, …) is put aside as <name>.damaged-<time> and brought back from the newest backup that
 * has it. When no backup has it:
 *   - an account or a report is left aside, and the server starts without it (a warning says which);
 *   - a file the whole server needs (people, teams, settings) stops the start, with the file and what to do: nothing
 *     is guessed.
 * What was done is returned, for the audit log once the server is up.
 */
import fs from 'node:fs';
import path from 'node:path';

import { listBackups, readBackup } from './backup.js';

const CORE = new Set(['iam.json', 'teams.json', 'settings.json', 'terms.json', 'sessions.json', 'https.json', 'acme.json', 'reads.json']);
const COLLECTIONS = ['accounts', 'reports'];

function readable(file, read) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    read?.(value);
    return true;
  } catch (error) {
    return error.code === 'ENOENT';
  }
}

/** Every JSON data file the server reads, relative to the data folder. */
function dataFiles(dataDir) {
  const out = [];
  for (const name of CORE) if (fs.existsSync(path.join(dataDir, name))) out.push(name);
  for (const dir of COLLECTIONS) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(dataDir, dir));
    } catch {}
    for (const n of names) if (n.endsWith('.json')) out.push(`${dir}/${n}`);
  }
  return out;
}

/**
 * `seen(rel, value)`, when given, is told each account and report as it is read here, so the start does not read
 * every one of them a second time (what it keeps of each is small: see Accounts). A file brought back from a backup
 * is not told: it is read when the server loads it.
 */
export function recoverDataDir({ dataDir, backupDir, passphrase = '', log = console.log, seen = null }) {
  const damaged = dataFiles(dataDir).filter((rel) => !readable(path.join(dataDir, rel), seen && !CORE.has(rel) ? (value) => seen(rel, value) : null));
  if (!damaged.length) return [];
  log(`! [recover] ${damaged.length} data file(s) could not be read: ${damaged.slice(0, 5).join(', ')}${damaged.length > 5 ? '…' : ''}. Looking in the backups.`);
  // The backups, newest first; each opened at most once.
  const backups = listBackups(backupDir);
  const opened = new Map();
  const open = (name) => {
    if (!opened.has(name)) {
      try {
        opened.set(name, readBackup(fs.readFileSync(path.join(backupDir, name)), { passphrase }));
      } catch (error) {
        log(`! [recover] Backup ${name} could not be opened: ${error.message}`);
        opened.set(name, null);
      }
    }
    return opened.get(name);
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const events = [];
  for (const rel of damaged) {
    const file = path.join(dataDir, rel);
    const aside = `${file}.damaged-${stamp}`;
    fs.renameSync(file, aside);
    let restored = null;
    for (const b of backups) {
      const bundle = open(b.name);
      const b64 = bundle?.files?.[rel];
      if (!b64) continue;
      const bytes = Buffer.from(b64, 'base64');
      try {
        JSON.parse(bytes.toString('utf8'));
      } catch {
        continue; // damaged in that backup too: an older one
      }
      fs.writeFileSync(file, bytes, { mode: 0o600 });
      restored = { backup: b.name, at: bundle.at };
      break;
    }
    if (restored) {
      log(`[recover] ${rel} restored from ${restored.backup} (the damaged file is kept beside it as ${path.basename(aside)}).`);
      events.push({ file: rel, outcome: 'restored', backup: restored.backup, backupAt: restored.at, kept: path.basename(aside) });
    } else if (!CORE.has(rel)) {
      log(`! [recover] ${rel} is in no backup: it is left aside (${path.basename(aside)}) and the server starts without it.`);
      events.push({ file: rel, outcome: 'set aside', kept: path.basename(aside) });
    } else {
      // Put back as it was: an Admin decides (restore a backup from elsewhere, or mend the file).
      fs.renameSync(aside, file);
      throw new Error(`${file} cannot be read and no backup in ${backupDir} has a good copy. Restore it from a backup kept elsewhere (Settings → Backups & health, or copy the file back), or mend it, then start again.`);
    }
  }
  return events;
}
