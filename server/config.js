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
  // HTTPS by default (MZ's way: your certificate when given, else a self-signed one until an Admin uploads one or
  // gets one from Let's Encrypt under Settings → HTTPS). HTTPS=off for a laptop or behind a proxy that does HTTPS.
  if (env.TLS_CERT && !env.TLS_CERT_FILE) env.TLS_CERT_FILE = env.TLS_CERT;
  if (env.TLS_KEY && !env.TLS_KEY_FILE) env.TLS_KEY_FILE = env.TLS_KEY;
  if (env.HTTPS === undefined || env.HTTPS === '') env.HTTPS = 'on';
  if (env.PUBLIC_URL && !env.REPORT_SERVER_URL) env.REPORT_SERVER_URL = env.PUBLIC_URL;
  const port = Number(env.PORT ?? 7443);
  return {
    root: ROOT,
    host: env.HOST ?? '0.0.0.0',
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 7443,
    dataDir: path.resolve(ROOT, env.DATA_DIR ?? 'data'),
    // Backups somewhere else than the data (a second volume or a network share), so losing one disk loses not both.
    backupDir: env.BACKUP_DIR ? path.resolve(ROOT, env.BACKUP_DIR) : '',
    publicUrl: env.PUBLIC_URL ?? '',
    env,
    // Secure cookies whenever the server is reached over https (directly, or behind a proxy that says so).
    secureCookies: bool(env.SECURE_COOKIES, String(env.PUBLIC_URL ?? '').startsWith('https://')),
    trustProxy: bool(env.TRUST_PROXY, false),
    adminEmail: env.ADMIN_EMAIL ?? '',
    adminName: env.ADMIN_NAME ?? 'Administrator',
    signInPerMinute: Math.max(Number(env.SIGNIN_PER_MINUTE ?? 60) || 60, 5),
    sessionIdleHours: Math.min(Math.max(Number(env.SESSION_IDLE_HOURS ?? 8) || 8, 1), 72),
    productCode: env.MZ_PRODUCT_CODE ?? '',
    salesforceHosts: list(env.SALESFORCE_HOSTS, null),
    // The email server on the first start (an Admin still tests it in Settings → Email server before anything is sent).
    smtp: env.SMTP_HOST ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 587), secure: bool(env.SMTP_SECURE, false), requireAuth: Boolean(env.SMTP_USER), user: env.SMTP_USER ?? '', password: env.SMTP_PASSWORD ?? '', fromAddress: env.SMTP_FROM ?? '', fromName: env.SMTP_FROM_NAME ?? 'FTR Credits Command Center' } : null,
    cxoneHosts: list(env.CXONE_ALLOWED_HOSTS, null),
    gitHosts: list(env.GIT_ALLOWED_HOSTS, null),
  };
}
