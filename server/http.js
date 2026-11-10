/**
 * The few web pieces the server needs, on Node's own http module (no framework, no dependencies): a router,
 * JSON bodies with a size limit, cookies, security headers on every answer, and a per-address rate limit for
 * sign-in.
 */
import fs from 'node:fs';
import path from 'node:path';

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
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...(isText ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers });
  res.end(isText ? body : JSON.stringify(body));
}

export async function readBody(req, limit) {
  const type = String(req.headers['content-type'] ?? '');
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('That request is too large.'), { status: 413 });
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
    this.#routes.push({ method, re, keys, handlers });
  }
  match(method, pathname) {
    for (const r of this.#routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => {
          try {
            params[k] = decodeURIComponent(m[i + 1]);
          } catch {
            params[k] = '';
          }
        });
        return { handlers: r.handlers, params };
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
export function serveStatic(root, req, res, pathname) {
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
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-cache', 'Content-Security-Policy': APP_CSP });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}
