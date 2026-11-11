import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../server/app.js';
import { hashPassword } from '../server/iam.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PASSWORD = 'Test-Password-For-Tests-1';
export const SF = 'https://acme.lightning.force.com/lightning/r/Opportunity/006AB000001xYzQAAQ/view';

/** A server on a free port with: Global → EMEA, APAC; an Admin, a VP leading Global, an EMEA leader, two EMEA SEs, one APAC SE. */
export async function start({ mailTransport, publicUrl = '', calculatorService } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
  const config = { root: ROOT, dataDir, adminEmail: 'admin@t.example', adminName: 'Admin', sessionIdleHours: 8, signInPerMinute: 10000, signInPerAccountPerMinute: 10000, secureCookies: false, trustProxy: false, publicUrl, productCode: '', salesforceHosts: null, cxoneHosts: null, gitHosts: null };
  const app = createApp(config, { log: () => {}, ...(mailTransport ? { mailTransport } : {}), ...(calculatorService ? { calculatorService } : {}) });
  await app.ready;
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const global = app.teams.list()[0];
  const emea = app.teams.create({ name: 'EMEA', parentId: global.id });
  const apac = app.teams.create({ name: 'APAC', parentId: global.id });
  const ready = async (email, name, role, teamId) => {
    const u = app.iam.byEmail(email) ?? (await app.iam.create({ email, name, role, teamId })).user;
    Object.assign(u, { passwordHash: await hashPassword(PASSWORD), mustChangePassword: false, guideSeenAt: new Date().toISOString() });
    app.iam.save();
    app.terms.accept(u.id);
    return u;
  };
  const users = {
    admin: await ready('admin@t.example', 'Admin', 'admin', global.id),
    vp: await ready('vp@t.example', 'VP', 'leader', global.id),
    emeaLead: await ready('emea.lead@t.example', 'EMEA Lead', 'leader', emea.id),
    se1: await ready('se1@t.example', 'SE One', 'se', emea.id),
    se2: await ready('se2@t.example', 'SE Two', 'se', emea.id),
    apacSe: await ready('apac@t.example', 'APAC SE', 'se', apac.id),
    viewer: await ready('viewer@t.example', 'Viewer', 'viewer', emea.id),
  };
  app.teams.update(global.id, { leaderIds: [users.vp.id] });
  app.teams.update(emea.id, { leaderIds: [users.emeaLead.id] });
  return { app, server, base, dataDir, teams: { global, emea, apac }, users, close: () => new Promise((r) => server.close(r)) };
}

/** A signed-in client: its cookie and CSRF token on every request. */
export async function client(base, email, password = PASSWORD) {
  const res = await fetch(`${base}/api/auth/signin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const me = await (await fetch(`${base}/api/me`, { headers: { cookie } })).json();
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(`${base}${p}`, { method, headers: { cookie, 'X-CSRF-Token': me.csrf, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: r.status, data, headers: r.headers };
  };
  return { me, cookie, call, get: (p, h) => call('GET', p, undefined, h), post: (p, b, h) => call('POST', p, b ?? {}, h), put: (p, b, h) => call('PUT', p, b, h), del: (p, h) => call('DELETE', p, undefined, h) };
}

export const reportData = (tr = 1000, fusion = 500) => ({ tr: { totals: { credits: tr } }, fusion: { totals: { credits: fusion } }, summary: { settings: { extraPercent: 10, bundleCredits: 10000 } } });
