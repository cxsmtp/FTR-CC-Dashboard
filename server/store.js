/**
 * Where everything is kept: one folder (DATA_DIR), plain JSON, each file written whole beside its place and then
 * renamed over it, so a stop half-way never leaves half a file. Small things (users, teams, settings, sessions)
 * live in one file each; customers and reports, which can be megabytes, each in a file of their own, with their
 * summaries kept in memory for the dashboards. Back up the folder and you have backed up everything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

/** The audit trail: one JSON line per event, appended, never rewritten. */
export class AuditLog {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  record({ actor = null, action, target = '', details = {}, ip = '' }) {
    const line = JSON.stringify({ at: new Date().toISOString(), actor, action, target, details, ip });
    fs.appendFileSync(this.file, `${line}\n`, { mode: 0o600 });
  }
  /** The newest events first, up to `limit`, those matching `filter`. */
  recent({ limit = 200, filter = () => true } = {}) {
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return [];
    }
    const out = [];
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      if (!lines[i]) continue;
      try {
        const event = JSON.parse(lines[i]);
        if (filter(event)) out.push(event);
      } catch {}
    }
    return out;
  }
}
