/**
 * Where everything is kept: one folder (DATA_DIR), plain JSON, each file written whole beside its place and then
 * renamed over it, so a stop half-way never leaves half a file. Small things (users, teams, settings, sessions)
 * live in one file each; customers and reports, which can be megabytes, each in a file of their own, with their
 * summaries kept in memory for the dashboards. Back up the folder and you have backed up everything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const fail = (status, message) => Object.assign(new Error(message), { status });

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`${file} could not be read (${error.message}): fix or restore it before starting.`);
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
export const safeId = (id) => (SAFE_ID.test(String(id ?? '')) ? String(id) : null);

/** One small JSON document, kept in memory and written on every change. */
export class Doc {
  constructor(file, initial) {
    this.file = file;
    this.value = readJson(file, null) ?? initial();
  }
  save() {
    writeJson(this.file, this.value);
  }
}

/**
 * A folder of records, one file each (customers, reports). `meta` picks what is kept in memory for lists and
 * dashboards; the whole record is read from disk when asked for.
 */
export class Collection {
  #dir;
  #meta;
  #index = new Map();

  constructor(dir, meta) {
    this.#dir = dir;
    this.#meta = meta;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) {
        if (name.endsWith('.tmp')) fs.rmSync(path.join(dir, name), { force: true });
        continue;
      }
      const record = readJson(path.join(dir, name), null);
      if (record?.id) this.#index.set(record.id, meta(record));
    }
  }

  #file(id) {
    const ok = safeId(id);
    if (!ok) throw fail(404, 'Not found.');
    return path.join(this.#dir, `${ok}.json`);
  }

  has(id) {
    return this.#index.has(String(id));
  }
  meta(id) {
    return this.#index.get(String(id)) ?? null;
  }
  list() {
    return [...this.#index.values()];
  }
  get(id) {
    if (!this.has(id)) return null;
    return readJson(this.#file(id), null);
  }
  put(record) {
    writeJson(this.#file(record.id), record);
    this.#index.set(record.id, this.#meta(record));
    return record;
  }
  remove(id) {
    if (!this.has(id)) return false;
    fs.rmSync(this.#file(id), { force: true });
    this.#index.delete(String(id));
    return true;
  }
  get size() {
    return this.#index.size;
  }
}

/**
 * The audit trail: one JSON line per event, appended, never rewritten, each chained to the one before by SHA-256
 * (as the calculator’s audit log is), so an edited, removed or reordered line shows when the log is verified.
 */
/**
 * A log of one JSON line per entry, as its lines parsed: read whole once, and after that only what was appended since
 * (a page of the audit log or of the activity log is then a walk over memory, not the whole file read and parsed
 * again each time, twice a page). A file that shrank or was replaced (rotated, restored) is read whole again. Beyond
 * `MAX_KEPT` bytes nothing is kept, and it is read as before.
 */
const MAX_KEPT = 64 * 1024 * 1024;
export class LogLines {
  #file;
  #size = -1;
  #ino = null;
  #entries = [];
  #rest = '';
  constructor(file) {
    this.#file = file;
  }
  /** Every entry, oldest first (the array is this reader's own: do not change it). */
  entries() {
    let stat;
    try {
      stat = fs.statSync(this.#file);
    } catch {
      this.#size = -1;
      this.#entries = [];
      this.#rest = '';
      return this.#entries;
    }
    if (stat.size > MAX_KEPT) {
      this.#size = -1;
      this.#entries = [];
      return parseLines(fs.readFileSync(this.#file, 'utf8')).entries;
    }
    if (this.#size < 0 || stat.size < this.#size || stat.ino !== this.#ino) {
      const { entries, rest } = parseLines(fs.readFileSync(this.#file, 'utf8'));
      this.#entries = entries;
      this.#rest = rest;
    } else if (stat.size > this.#size) {
      const fd = fs.openSync(this.#file, 'r');
      try {
        const buf = Buffer.alloc(stat.size - this.#size);
        fs.readSync(fd, buf, 0, buf.length, this.#size);
        const { entries, rest } = parseLines(this.#rest + buf.toString('utf8'));
        for (const e of entries) this.#entries.push(e);
        this.#rest = rest;
      } finally {
        fs.closeSync(fd);
      }
    }
    this.#size = stat.size;
    this.#ino = stat.ino;
    return this.#entries;
  }
  /** The file was replaced under this reader: read whole next time. */
  forget() {
    this.#size = -1;
  }
}
/** The entries of whole lines, and what follows the last line break (a line still being written). */
function parseLines(text) {
  const cut = text.lastIndexOf('\n');
  const entries = [];
  for (const line of (cut < 0 ? '' : text.slice(0, cut)).split('\n')) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  return { entries, rest: cut < 0 ? text : text.slice(cut + 1) };
}

export class AuditLog {
  #last = '';
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.#last = this.#tail();
  }
  #tail() {
    try {
      const text = fs.readFileSync(this.file, 'utf8').trimEnd();
      const line = text.slice(text.lastIndexOf('\n') + 1);
      return line ? JSON.parse(line).hash ?? '' : '';
    } catch {
      return '';
    }
  }
  static hashOf(prev, event) {
    return createHash('sha256').update(`${prev}\n${JSON.stringify(event)}`).digest('hex');
  }
  /** The file was replaced (a backup restored): the chain continues from what is on disk now. */
  reload() {
    this.#last = this.#tail();
    this.#lines?.forget();
  }
  record({ actor = null, action, target = '', details = {}, ip = '' }) {
    const event = { at: new Date().toISOString(), actor, action, target, details, ip };
    const hash = AuditLog.hashOf(this.#last, event);
    fs.appendFileSync(this.file, `${JSON.stringify({ ...event, prev: this.#last, hash })}\n`, { mode: 0o600 });
    this.#last = hash;
  }
  /** Walk the whole log: every line chained to the one before. */
  verify() {
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return { ok: true, events: 0 };
    }
    let prev = '';
    let n = 0;
    for (const line of text.split('\n')) {
      if (!line) continue;
      n++;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        return { ok: false, events: n, brokenAt: n, why: 'a line is not JSON' };
      }
      if (e.hash === undefined) {
        prev = '';
        continue; // written before the chain existed
      }
      const { prev: p, hash, ...event } = e;
      if (p !== prev || AuditLog.hashOf(prev, event) !== hash) return { ok: false, events: n, brokenAt: n, at: e.at, why: p !== prev ? 'a line before it was removed or changed' : 'this line was changed' };
      prev = hash;
    }
    return { ok: true, events: n };
  }
  /** The newest events first, up to `limit`, those matching `filter`. */
  #lines = null;
  recent({ limit = 200, filter = () => true } = {}) {
    this.#lines ??= new LogLines(this.file);
    const all = this.#lines.entries();
    const out = [];
    for (let i = all.length - 1; i >= 0 && out.length < limit; i--) {
      const { prev, hash, ...event } = all[i];
      void prev;
      void hash;
      if (filter(event)) out.push(event);
    }
    return out;
  }
}
