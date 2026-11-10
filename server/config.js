/** Settings from the environment (or a .env file beside package.json), with safe defaults. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const list = (v, fallback) => (v ? String(v).split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean) : fallback);
const bool = (v, fallback) => (v === undefined || v === '' ? fallback : /^(1|true|yes|on)$/i.test(String(v)));

export function loadConfig(env = process.env) {
  loadDotEnv();
  const port = Number(env.PORT ?? 8080);
  return {
    root: ROOT,
    host: env.HOST ?? '0.0.0.0',
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080,
    dataDir: path.resolve(ROOT, env.DATA_DIR ?? 'data'),
    publicUrl: env.PUBLIC_URL ?? '',
    tlsCert: env.TLS_CERT ?? '',
    tlsKey: env.TLS_KEY ?? '',
    // Secure cookies whenever the server is reached over https (directly, or behind a proxy that says so).
    secureCookies: bool(env.SECURE_COOKIES, Boolean(env.TLS_CERT) || String(env.PUBLIC_URL ?? '').startsWith('https://')),
    trustProxy: bool(env.TRUST_PROXY, false),
    adminEmail: env.ADMIN_EMAIL ?? '',
    adminName: env.ADMIN_NAME ?? 'Administrator',
    signInPerMinute: Math.max(Number(env.SIGNIN_PER_MINUTE ?? 60) || 60, 5),
    sessionIdleHours: Math.min(Math.max(Number(env.SESSION_IDLE_HOURS ?? 8) || 8, 1), 72),
    productCode: env.MZ_PRODUCT_CODE ?? '',
    salesforceHosts: list(env.SALESFORCE_HOSTS, null),
    cxoneHosts: list(env.CXONE_ALLOWED_HOSTS, null),
    gitHosts: list(env.GIT_ALLOWED_HOSTS, null),
  };
}
