/**
 * Checkmarx One activity: every call the command center makes to a customer's Checkmarx One tenant, on whose behalf,
 * for which account, with its result and how long it took; and each connection, read and report generated.
 *
 * Kept apart from the audit log (a tenant read can make thousands of calls): DATA_DIR/cxone-activity.jsonl, rotated
 * to cxone-activity.1.jsonl past ACTIVITY_MAX_MB (20), so at most twice that is kept. Never a key, token, query string
 * or response body: only the method, the API path (ids shortened), the status and the time.
 */
import fs from 'node:fs';
import path from 'node:path';

const KINDS = ['connect', 'disconnect', 'call', 'read', 'report', 'refresh'];

/** /api/projects/1f2e…/branches?x → /api/projects/:id/branches: what was asked, without ids or queries. */
export function shortPath(p) {
  return String(p ?? '')
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .replace(/\/\d{3,}(?=\/|$)/g, '/:n')
    .slice(0, 160);
}

export class ActivityLog {
  constructor({ dataDir, maxBytes = (Number(process.env.ACTIVITY_MAX_MB) || 20) * 1024 * 1024 }) {
    this.file = path.join(dataDir, 'cxone-activity.jsonl');
    this.old = path.join(dataDir, 'cxone-activity.1.jsonl');
    this.maxBytes = maxBytes;
    this.buffer = [];
    this.timer = null;
    try {
      this.size = fs.statSync(this.file).size;
    } catch {
      this.size = 0;
    }
  }

  /** One event: { kind, user: {id,name,email,teamId}, tenant, account: {id,name,teamId}, method, path, status, ms, ok, detail } */
  add(event) {
    if (!KINDS.includes(event.kind)) return;
    this.buffer.push({ at: new Date().toISOString(), ...event });
    // Written in batches: a read's hundreds of calls a second cost one write each 500 ms.
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 500);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.buffer.length) return;
    const text = this.buffer.map((e) => JSON.stringify(e)).join('\n') + '\n';
    this.buffer = [];
    if (this.size + text.length > this.maxBytes) {
      try {
        fs.renameSync(this.file, this.old);
      } catch {}
      this.size = 0;
    }
    try {
      fs.appendFileSync(this.file, text, { mode: 0o600 });
      this.size += Buffer.byteLength(text);
    } catch (error) {
      // The activity log never stops the server: a full or missing disk loses these entries, and says so.
      console.error(`! [activity] ${text.split("\n").length - 1} entries not written: ${error.message}`);
    }
  }

  /** Newest first, those `filter` keeps, up to `limit`; both files. */
  recent({ limit = 200, filter = () => true } = {}) {
    this.flush();
    const out = [];
    for (const file of [this.file, this.old]) {
      let text = '';
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        if (!lines[i]) continue;
        try {
          const e = JSON.parse(lines[i]);
          if (filter(e)) out.push(e);
        } catch {}
      }
      if (out.length >= limit) break;
    }
    return out;
  }
}

/**
 * A Checkmarx One client whose every request is recorded for `who()` (the person and the account open), on `log`.
 * The client's own pagination goes through request(), so every page is recorded too.
 */
export function recorded(client, { log, who, tenant, memory = null, slowAtOnce = 6 }) {
  const request = client.request.bind(client);
  // A tenant that asked to slow down is read with fewer calls at once (server/resilience.js).
  let running = 0;
  const waiting = [];
  const slot = async () => {
    if (!memory?.isSlow(tenant)) return () => {};
    if (running >= slowAtOnce) await new Promise((r) => waiting.push(r));
    running++;
    return () => {
      running--;
      waiting.shift()?.();
    };
  };
  client.request = async (p, opts = {}) => {
    const t = Date.now();
    const method = String(opts.method ?? 'GET').toUpperCase();
    // What this tenant taught (server/resilience.js): a call known to fail is not made; the caller's fallback runs.
    if (memory && method === 'GET' && !memory.allows(tenant, p)) throw Object.assign(new Error('Not asked: this tenant is known not to answer it.'), { status: 404, avoided: true });
    const done = await slot();
    try {
      const out = await request(p, opts);
      log.add({ kind: 'call', ...who(), tenant, method, path: shortPath(p), status: 200, ok: true, ms: Date.now() - t });
      return out;
    } catch (error) {
      log.add({ kind: 'call', ...who(), tenant, method, path: shortPath(p), status: error.status || 0, ok: false, ms: Date.now() - t, detail: String(error.message ?? '').slice(0, 160) });
      memory?.learn(tenant, p, error.status || 0);
      throw error;
    } finally {
      done();
    }
  };
  return client;
}
