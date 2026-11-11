/**
 * Email: the SMTP server an Admin sets up (Settings → Email server), adapted from the calculator (src/mailer.js).
 *
 * - Nothing is sent until a connection test has succeeded for exactly the settings in force (a fingerprint of
 *   host, port, TLS, login and password), so a typo is caught by the Admin, not by someone waiting for a link.
 * - A login is never sent in clear: without TLS from the start, STARTTLS must be offered and taken.
 * - The mail password is kept encrypted (AES-256-GCM, key in DATA_DIR/secret.key) and never sent back to a
 *   browser; every error has it taken out, whatever the server echoed back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';

const GMAIL_HOSTS = /(^|\.)(gmail|googlemail)\.com$/i;
const STARTTLS_PORTS = new Set([25, 587, 2525]);
const EMAIL = /^(?=[^]{3,254}$)[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export const DEFAULT_SMTP = { host: '', port: 587, secure: false, requireAuth: true, user: '', password: '', fromName: 'FTR Credits Command Center', fromAddress: '', rejectUnauthorized: true };

export class MailError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MailError';
    this.status = status;
  }
}

// ---- The password at rest ----------------------------------------------------------------------------
export class Secrets {
  #key;
  constructor(dataDir) {
    const file = path.join(dataDir, 'secret.key');
    if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
    this.#key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
    if (this.#key.length !== 32) throw new Error(`${file} is not a 32-byte key: restore it from the backup of this data folder.`);
  }
  seal(text) {
    if (!text) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
  }
  open(sealed) {
    if (!sealed) return '';
    const [v, iv, tag, body] = String(sealed).split(':');
    if (v !== 'v1') return '';
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.#key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }
}

// ---- Settings ---------------------------------------------------------------------------------------------
const int = (v, d) => (Number.isInteger(Number(v)) ? Number(v) : d);
const plain = (v, max = 254) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

/** The ports mail servers listen on (1025: a local test server). */
export const SMTP_PORTS = [25, 465, 587, 2525, 1025];

/** The settings as changed by what an Admin sent; a password left empty keeps the one kept (null clears it). */
export function mergeSmtp(current, input = {}) {
  const smtp = { ...DEFAULT_SMTP, ...current };
  if ('host' in input) smtp.host = plain(input.host).toLowerCase();
  if ('port' in input) {
    smtp.port = Math.min(65535, Math.max(1, int(input.port, smtp.port)));
    // Mail ports only: the connection test must not become a way to knock on other services inside the network.
    if (!SMTP_PORTS.includes(smtp.port) && smtp.port !== current.port) throw new MailError(`Port ${smtp.port} is not a mail port: use 587 (STARTTLS), 465 (implicit TLS), 25 or 2525.`);
  }
  if ('secure' in input) smtp.secure = Boolean(input.secure);
  if ('requireAuth' in input) smtp.requireAuth = Boolean(input.requireAuth);
  if ('user' in input) smtp.user = plain(input.user);
  if ('fromName' in input) smtp.fromName = plain(input.fromName, 120).replace(/["<>]/g, '');
  if ('fromAddress' in input) smtp.fromAddress = plain(input.fromAddress);
  if ('rejectUnauthorized' in input) smtp.rejectUnauthorized = input.rejectUnauthorized !== false;
  const hostChanged = current.host && smtp.host !== current.host;
  if (typeof input.password === 'string' && input.password !== '') smtp.password = input.password.slice(0, 512);
  else if (input.password === null || hostChanged) smtp.password = '';
  if (smtp.host && !/^[a-z0-9.-]+$/.test(smtp.host)) throw new MailError('The mail server is a host name, like smtp.office365.com.');
  if (smtp.secure && (smtp.port === 587 || smtp.port === 25)) throw new MailError(`Port ${smtp.port} uses STARTTLS: untick Implicit TLS (it is for port 465).`);
  if (smtp.fromAddress && !EMAIL.test(smtp.fromAddress)) throw new MailError('The "from" address is not an email address.');
  return smtp;
}

/** Which settings a test proved: any change to these needs a new test before mail goes out. */
export const smtpFingerprint = (smtp) => createHash('sha256').update(JSON.stringify([smtp.host, smtp.port, smtp.secure, smtp.requireAuth, smtp.user, smtp.password, smtp.rejectUnauthorized, smtp.fromAddress])).digest('hex');

/** What a browser may see: never the password. */
export const publicSmtp = ({ password, ...smtp }) => ({ ...smtp, passwordSet: Boolean(password) });

// ---- Sending ----------------------------------------------------------------------------------------------
/** Google shows App Passwords in four groups with spaces; only for Google are the spaces taken out. */
export function normalizePassword(smtp) {
  const password = String(smtp.password ?? '');
  if (!GMAIL_HOSTS.test(String(smtp.host ?? ''))) return password;
  const stripped = password.replace(/\s+/g, '');
  return /^[A-Za-z0-9]{16}$/.test(stripped) ? stripped : password;
}

function secretForms(smtp = {}) {
  const forms = new Set();
  const user = String(smtp.user ?? '');
  for (const pass of [String(smtp.password ?? ''), normalizePassword(smtp)]) {
    if (!pass) continue;
    forms.add(pass);
    forms.add(Buffer.from(pass).toString('base64'));
    forms.add(Buffer.from(`\u0000${user}\u0000${pass}`).toString('base64'));
  }
  return [...forms].filter((f) => f.length >= 3).sort((a, b) => b.length - a.length);
}
export const redact = (text, smtp) => secretForms(smtp).reduce((t, f) => t.split(f).join('[hidden]'), String(text));

export function tlsModeMismatch(smtp) {
  if (smtp.secure && STARTTLS_PORTS.has(Number(smtp.port))) return `Port ${smtp.port} expects STARTTLS, but "Implicit TLS" is on. Turn Implicit TLS off, or use port 465.`;
  if (!smtp.secure && Number(smtp.port) === 465) return 'Port 465 expects TLS from the first byte, but "Implicit TLS" is off. Turn Implicit TLS on, or use port 587.';
  return '';
}

function friendly(error, smtp) {
  const code = error.code ?? '';
  const mismatch = tlsModeMismatch(smtp);
  if (code === 'EAUTH') return GMAIL_HOSTS.test(smtp.host) ? 'Google rejected those credentials: use a 16-character App Password (https://myaccount.google.com/apppasswords) and the full address as the user name.' : 'The server rejected that user name and password.';
  if (code === 'ECONNREFUSED') return `Nothing is listening on port ${Number(smtp.port) || ''} of the mail server.`;
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || /timed? ?out/i.test(error.message)) return mismatch ? `${mismatch} (The connection stalled during the TLS handshake.)` : 'Could not reach the mail server: check the host, the port and any firewall.';
  if (code === 'EDNS' || /getaddrinfo|ENOTFOUND/i.test(error.message)) return 'The mail server name did not resolve: check the spelling and the DNS.';
  if (/wrong version number|packet length too long|SSL routines/i.test(error.message)) return mismatch || 'TLS negotiation failed: the server did not speak TLS the way this port expects.';
  if (/self.signed|certificate/i.test(error.message)) return 'The mail server presented a certificate that could not be verified. If it uses a private CA, set NODE_EXTRA_CA_CERTS to it (or, last resort, turn off the certificate check).';
  return mismatch ? `${error.message} (${mismatch})` : error.message;
}
const failed = (prefix, error, smtp) => new MailError(redact(`${prefix}: ${friendly(error, smtp)}`, smtp), 400);

export function fromAddress(smtp) {
  const address = smtp.fromAddress || smtp.user;
  if (!address) return '';
  const clean = (v) => String(v).replace(/[\r\n"<>]/g, '').trim();
  return smtp.fromName ? `"${clean(smtp.fromName)}" <${clean(address)}>` : clean(address);
}

export function buildTransport(smtp) {
  if (!smtp.host) throw new MailError('No mail server is set up: an Admin sets it in Settings → Email server.');
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: Boolean(smtp.secure),
    requireTLS: !smtp.secure && Boolean(smtp.requireAuth && smtp.user),
    auth: smtp.requireAuth && smtp.user ? { user: smtp.user, pass: normalizePassword(smtp) } : undefined,
    tls: { rejectUnauthorized: smtp.rejectUnauthorized !== false, minVersion: 'TLSv1.2' },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

/** The default way to talk to the mail server; tests pass their own. */
export const smtpTransport = {
  async verify(smtp) {
    const t = buildTransport(smtp);
    try {
      await t.verify();
    } catch (error) {
      throw failed('The connection test failed', error, smtp);
    } finally {
      t.close();
    }
  },
  async send(smtp, message) {
    const t = buildTransport(smtp);
    try {
      return await t.sendMail({ from: fromAddress(smtp), ...message });
    } catch (error) {
      throw failed('The email could not be sent', error, smtp);
    } finally {
      t.close();
    }
  },
};

// ---- The emails ---------------------------------------------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A plain, branded system email: lines, facts, one button, a footer; text and HTML alike. */
export function systemEmail({ appName = 'FTR Credits Command Center', subject, lines = [], facts = [], button = null, footer = '' }) {
  const text = [...lines, '', ...facts.map(([k, v]) => `${k}: ${v}`), ...(button ? ['', `${button.label}: ${button.url}`] : []), '', footer, '', `— ${appName}`].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fd;padding:24px;font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#121735">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e3e7f5">
<tr><td style="background:linear-gradient(120deg,#22d3ee,#6366f1 55%,#a855f7);padding:18px 24px;color:#fff;font-weight:600">${esc(appName)}</td></tr>
<tr><td style="padding:24px">${lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('')}
${facts.length ? `<table role="presentation" style="margin:8px 0 16px;font-size:13px;color:#56608a">${facts.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0">${esc(k)}</td><td style="color:#121735">${esc(v)}</td></tr>`).join('')}</table>` : ''}
${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600">${esc(button.label)}</a></p><p style="font-size:12px;color:#8a93b8;word-break:break-all">${esc(button.url)}</p>` : ''}
${footer ? `<p style="margin:16px 0 0;font-size:13px;color:#56608a">${esc(footer)}</p>` : ''}</td></tr></table></body></html>`;
  return { subject, text, html };
}
