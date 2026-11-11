/**
 * Branding (Settings → Branding), as CxMissionZero has it: the app's name, the company's name, its logo and browser
 * icon, an accent colour, the look everyone sees, whether people may choose their own, and where the menu sits.
 *
 * A logo or icon is kept in the data folder as bytes (settings.json, base64), never as a link the browser follows:
 * it is either uploaded (PNG, JPEG, SVG or WebP, up to 200 KB) or fetched once from an https address given here,
 * which must not lead to a private or link-local address. It is served from /brand/logo and /brand/icon; an SVG
 * is served with a policy that runs nothing in it.
 */
import dns from 'node:dns/promises';
import https from 'node:https';

import { outboundUrlProblem } from '../vendor/mz/src/outbound-url.js';
import { privateAddress } from './calculator.js';
import { fail } from './store.js';

export const MAX_IMAGE = 200 * 1024;
export const LOOKS = ['aurora', 'ocean', 'emerald', 'sunset', 'royal', 'graphite', 'command'];
const TYPES = { png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
export const DEFAULT_BRANDING = { appName: 'FTR Credits', tagline: 'Command Center', accent: '', letChoose: true, menu: 'left', logo: null, icon: null };

/** What kind of image these bytes are, by their first bytes (not by what the sender says). */
export function sniff(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const head = buf.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/** An image to keep: bytes of a known kind, within the size. */
export function imageFrom(buf, what = 'The image') {
  if (!buf?.length) throw fail(400, `${what} is empty.`);
  if (buf.length > MAX_IMAGE) throw fail(413, `${what} is ${Math.round(buf.length / 1024)} KB: at most 200 KB.`);
  const kind = sniff(buf);
  if (!kind) throw fail(415, `${what} is not a PNG, JPEG, SVG or WebP image.`);
  return { type: TYPES[kind], data: buf.toString('base64'), bytes: buf.length, at: new Date().toISOString() };
}

/** An uploaded image, sent as a data: URL or bare base64. */
export function imageFromUpload(value, what) {
  const m = /^data:[^;,]*;base64,(.*)$/s.exec(String(value ?? ''));
  return imageFrom(Buffer.from(m ? m[1] : String(value ?? ''), 'base64'), what);
}

/**
 * GET over https from the addresses already checked, and only those: the connection never asks DNS again, so a name
 * that changes its answer after the check (DNS rebinding) cannot lead to a private address. The certificate is
 * checked for the name; the body stops at `max` bytes.
 */
export function pinnedGet(u, addresses, { max = MAX_IMAGE, timeoutMs = 15_000, headers = {} } = {}) {
  const pinned = addresses.map((a) => ({ address: a.address, family: a.family }));
  return new Promise((resolve, reject) => {
    const req = https.get(u, {
      headers,
      timeout: timeoutMs,
      lookup: (host, options, done) => (options?.all ? done(null, pinned) : done(null, pinned[0].address, pinned[0].family)),
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        return reject(Object.assign(new Error('redirect'), { cause: { code: 'REDIRECT' } }));
      }
      if (Number(res.headers['content-length'] ?? 0) > max) {
        res.destroy();
        return resolve({ ok: false, status: 413, tooLarge: true });
      }
      const parts = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > max) {
          res.destroy();
          resolve({ ok: false, status: 413, tooLarge: true });
        } else parts.push(chunk);
      });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: Buffer.concat(parts) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { cause: { code: 'ETIMEDOUT' } })));
    req.on('error', reject);
  });
}

/** An image at an https address: fetched once, here, and kept. */
export async function imageFromUrl(url, what, { fetchImpl = null } = {}) {
  const problem = outboundUrlProblem(url, { allowLoopbackHttp: false });
  if (problem) throw fail(400, `${what}: ${problem}`);
  const u = new URL(url);
  if (u.protocol !== 'https:') throw fail(400, `${what}: use an https address.`);
  const addresses = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw fail(400, `${what}: ${u.hostname} cannot be found.`);
  if (addresses.some((a) => privateAddress(a.address))) throw fail(400, `${what}: ${u.hostname} is a private address.`);
  const headers = { Accept: 'image/*', 'User-Agent': 'ftr-cc-dashboard-branding' };
  let res;
  try {
    if (fetchImpl) {
      // Tests pass their own fetch.
      const r = await fetchImpl(u, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers });
      const body = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
      res = { ok: r.ok, status: r.status, tooLarge: body.length > MAX_IMAGE || Number(r.headers.get('content-length') ?? 0) > MAX_IMAGE, body };
    } else res = await pinnedGet(u, addresses, { headers });
  } catch (error) {
    throw fail(502, `${what}: ${u.hostname} could not be reached (${error.cause?.code ?? error.message}).`);
  }
  if (res.tooLarge) throw fail(413, `${what} is larger than 200 KB.`);
  if (!res.ok) throw fail(502, `${what}: ${u.hostname} answered ${res.status}.`);
  return { ...imageFrom(res.body, what), from: u.href };
}

/** The colour as #rrggbb, or '' for the look's own. */
export function cleanColour(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (!/^#[0-9a-f]{6}$/.test(s)) throw fail(400, 'Choose the accent colour as #rrggbb.');
  return s;
}

/** What every page may know (no image bytes: those are at /brand/logo and /brand/icon). */
export function publicBranding(b, theme) {
  return { appName: b.appName, tagline: b.tagline, accent: b.accent, letChoose: b.letChoose !== false, menu: b.menu === 'top' ? 'top' : 'left', logo: b.logo ? `/brand/logo?v=${encodeURIComponent(b.logo.at)}` : null, icon: b.icon ? `/brand/icon?v=${encodeURIComponent(b.icon.at)}` : null, look: theme?.accent ?? 'aurora', mode: theme?.mode ?? 'light' };
}

/** Headers for a kept image: an SVG runs nothing, whatever it holds. */
export const imageHeaders = (img) => ({ 'Content-Type': img.type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' });
