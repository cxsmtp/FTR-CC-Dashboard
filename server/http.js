/**
 * The few web pieces the server needs, on Node's own http module (no framework, no dependencies): a router,
 * JSON bodies with a size limit, cookies, security headers on every answer, and a per-address rate limit for
 * sign-in.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** The dashboard's own pages: scripts and styles from this server only, nothing inline, nothing framed. */
export const APP_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const isText = typeof body === 'string' || Buffer.isBuffer(body);
  let out = isText ? body : JSON.stringify(body);
  const extra = {};
  // Large JSON answers (dashboards of a whole organisation) go compressed when the browser takes it.
  if (!isText && out.length > 16 * 1024 && /\bgzip\b/.test(String(res.req?.headers?.['accept-encoding'] ?? ''))) {
    out = zlib.gzipSync(out, { level: 5 });
    Object.assign(extra, { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
  }
  const cut = Boolean(res.req?.cutShort);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...(isText ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...extra, ...headers, ...(cut ? { Connection: 'close' } : {}) });
  // A request cut short (too large) is not read to its end: once the answer is out, the connection goes.
  res.end(out, cut ? () => setTimeout(() => res.req?.socket?.destroy(), 250).unref?.() : undefined);
}

export async function readBody(req, limit) {
  const type = String(req.headers['content-type'] ?? '');
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      // The rest is not read: the answer says so, and the connection is closed after it (send), so the sender is not
      // left writing into a request nobody reads.
      req.cutShort = true;
      throw Object.assign(new Error('That request is too large.'), { status: 413 });
    }
    parts.push(chunk);
  }
  if (!parts.length) return {};
  if (!type.startsWith('application/json')) throw Object.assign(new Error('Send JSON.'), { status: 415 });
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw Object.assign(new Error('That request is not JSON.'), { status: 400 });
  }
}

export function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Routes as "METHOD /path/:param"; the first that matches answers. */
export class Router {
  #routes = [];
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '/([^/]+)'))}$`);
    this.#routes.push({ method, pattern, re, keys, handlers });
  }
  match(method, pathname) {
    for (const r of this.#routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) {
        const params = Object.create(null);
        r.keys.forEach((k, i) => {
          try {
            params[k] = decodeURIComponent(m[i + 1]);
          } catch {
            params[k] = '';
          }
        });
        return { handlers: r.handlers, params, pattern: r.pattern };
      }
    }
    return null;
  }
}

/** A small fixed-window limiter: at most `max` hits per key in `windowMs`. */
export class RateLimit {
  #hits = new Map();
  constructor({ max, windowMs }) {
    this.max = max;
    this.windowMs = windowMs;
  }
  hit(key) {
    const now = Date.now();
    const entry = this.#hits.get(key);
    if (!entry || now - entry.start > this.windowMs) {
      this.#hits.set(key, { start: now, count: 1 });
      if (this.#hits.size > 50_000) this.#hits.clear();
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

/** A file from one folder, never outside it; GET and HEAD only. */
export function serveStatic(root, req, res, pathname, { cache = 'no-cache' } = {}) {
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const file = path.resolve(root, rel);
  if (!file.startsWith(path.resolve(root) + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return false;
  // Kept in memory compressed, with an ETag: a browser coming back is answered 304, with nothing sent again.
  let cached = STATIC.get(file);
  if (!cached || cached.mtime !== stat.mtimeMs) {
    const raw = fs.readFileSync(file);
    const compressible = /text|javascript|json|svg|markdown/.test(type) && raw.length > 1024;
    cached = { mtime: stat.mtimeMs, raw, gz: compressible ? zlib.gzipSync(raw, { level: 9 }) : null, etag: `"${createHash('sha256').update(raw).digest('hex').slice(0, 20)}"` };
    STATIC.set(file, cached);
  }
  const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache, ETag: cached.etag, Vary: 'Accept-Encoding', 'Content-Security-Policy': APP_CSP };
  if (req.headers['if-none-match'] === cached.etag) return res.writeHead(304, headers).end(), true;
  const gz = cached.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  const body = gz ? cached.gz : cached.raw;
  res.writeHead(200, { ...headers, ...(gz ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
const STATIC = new Map();
