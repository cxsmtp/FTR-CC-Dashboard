#!/usr/bin/env node
/**
 * USERS people working at once against a running command center (seeded by loadtest/seed.mjs), for SECONDS seconds.
 * Sales Engineers open accounts and the calculator, save, generate reports and record sales; leaders read the
 * dashboards, accounts and people. Each person waits THINK_MS (on average) between actions, as people do; THINK_MS=0
 * is a stress test. Reports latency per action, errors, and the server's CPU and memory (SERVER_PID).
 *
 *   BASE=https://127.0.0.1:7443 DATA_DIR=… USERS=200 SECONDS=120 SERVER_PID=1234 node loadtest/load.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = new URL(process.env.BASE ?? 'https://127.0.0.1:7443');
const USERS = Number(process.env.USERS ?? 200);
const SECONDS = Number(process.env.SECONDS ?? 120);
const RAMP = Number(process.env.RAMP ?? 20) * 1000;
const THINK = Number(process.env.THINK_MS ?? 1500);
const PID = Number(process.env.SERVER_PID ?? 0);
const people = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'bench-people.json'), 'utf8'));
// The password seed.mjs chose for every simulated person (BENCH_PASSWORD, or one made for the run): never in the source.
const PASSWORD = process.env.BENCH_PASSWORD || fs.readFileSync(path.join(process.env.DATA_DIR, 'bench-password.txt'), 'utf8').trim();
const reportData = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'report-data.json'), 'utf8'));
// A save the size a read of a large tenant makes: 300 Fusion projects.
const fusionSave = { fusion: { periodMonths: 12, projects: Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, name: `Project ${i}`, loc: 20000 + i * 137, criticality: 1 + (i % 3), frequency: ['daily', 'weekly', 'monthly'][i % 3], scansPerWeek: (i % 7) + 1, scanCount: 40 + (i % 50), source: 'scan', applications: [`App ${i % 20}`], included: true })) } };

const lib = BASE.protocol === 'https:' ? https : http;
// The certificate is checked: the server's own self-signed one (DATA_DIR/tls) is the one trusted, or CA_FILE.
const caFile = process.env.CA_FILE || path.join(process.env.DATA_DIR, 'tls', 'self-signed.crt');
const agent = new lib.Agent({ keepAlive: true, maxSockets: USERS * 2, ...(BASE.protocol === 'https:' && fs.existsSync(caFile) ? { ca: fs.readFileSync(caFile) } : {}) });
const stats = new Map();
const note = (name, ms, ok, status) => {
  const s = stats.get(name) ?? { times: [], errors: 0, codes: {} };
  s.times.push(ms);
  if (!ok) {
    s.errors++;
    s.codes[status] = (s.codes[status] ?? 0) + 1;
  }
  stats.set(name, s);
};
function request(method, p, { body, headers = {}, cookie } = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const start = performance.now();
    const req = lib.request({ host: BASE.hostname, port: BASE.port, path: p, method, agent, headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', Origin: BASE.origin, ...(cookie ? { cookie } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), ms: performance.now() - start }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, ms: performance.now() - start }));
    req.setTimeout(60_000, () => req.destroy(new Error('timeout')));
    if (data) req.write(data);
    req.end();
  });
}
const json = (r) => {
  try {
    const raw = r.headers?.['content-encoding'] === 'gzip' ? zlib.gunzipSync(r.body) : r.body;
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK ? THINK * (0.3 + Math.random() * 1.4) : 0);
const pick = (weights) => {
  let x = Math.random() * weights.reduce((n, [, w]) => n + w, 0);
  for (const [name, w] of weights) if ((x -= w) <= 0) return name;
  return weights[0][0];
};

const SE = [['dashboard', 12], ['accounts', 10], ['account', 15], ['calculator page', 4], ['calc list', 8], ['calc open', 14], ['calc save', 10], ['report', 5], ['sale', 3], ['work poll', 15], ['people', 4]];
const LEAD = [['dashboard', 35], ['accounts', 20], ['account', 20], ['people', 15], ['dashboard team', 10]];

let stop = false;
async function user(p, index) {
  await sleep((RAMP * index) / USERS);
  const t0 = performance.now();
  const r = await request('POST', '/api/auth/signin', { body: { email: p.email, password: PASSWORD } });
  note('sign in', performance.now() - t0, r.status === 200, r.status);
  if (r.status !== 200) return;
  const cookie = String(r.headers['set-cookie'] ?? '').split(';')[0];
  const meR = await request('GET', '/api/me', { cookie });
  const me = json(meR);
  note('me', meR.ms, meR.status === 200, meR.status);
  if (!me) return;
  const h = { 'X-CSRF-Token': me.csrf, 'X-Team': p.teamId };
  let accountIds = [];
  const leader = p.role === 'leader' || p.role === 'admin';
  while (!stop) {
    const action = pick(leader ? LEAD : SE);
    let res;
    switch (action) {
      case 'dashboard': res = await request('GET', '/api/dashboard', { cookie }); break;
      case 'dashboard team': res = await request('GET', `/api/dashboard?team=${encodeURIComponent(me.scopeTeams[Math.floor(Math.random() * me.scopeTeams.length)].id)}`, { cookie }); break;
      case 'accounts': {
        res = await request('GET', '/api/accounts', { cookie });
        const a = json(res)?.accounts;
        if (a?.length) accountIds = a.map((x) => x.id);
        break;
      }
      case 'account':
        if (!accountIds.length) continue;
        res = await request('GET', `/api/cc/accounts/${accountIds[Math.floor(Math.random() * accountIds.length)]}`, { cookie });
        break;
      case 'people': res = await request('GET', '/api/people', { cookie }); break;
      case 'audit': res = await request('GET', '/api/audit', { cookie }); break;
      case 'calculator page': res = await request('GET', '/calculator', { cookie, headers: { Accept: 'text/html' } }); break;
      case 'calc list': {
        res = await request('GET', '/api/projections', { cookie, headers: h });
        const c = json(res)?.customers;
        if (c?.length) accountIds = c.map((x) => x.id);
        break;
      }
      case 'calc open':
        if (!accountIds.length) continue;
        res = await request('GET', `/api/projections/${accountIds[Math.floor(Math.random() * accountIds.length)]}`, { cookie, headers: h });
        break;
      case 'calc save':
        if (!accountIds.length) continue;
        res = await request('PUT', `/api/projections/${accountIds[Math.floor(Math.random() * accountIds.length)]}`, { cookie, headers: h, body: Math.random() < 0.5 ? fusionSave : { totals: { extraPercent: Math.round(Math.random() * 30), bundleCredits: 10000 } } });
        break;
      case 'report':
        if (!accountIds.length) continue;
        res = await request('POST', '/api/projections/reports', { cookie, headers: h, body: { customerId: accountIds[Math.floor(Math.random() * accountIds.length)], data: reportData } });
        break;
      case 'sale':
        if (!accountIds.length) continue;
        res = await request('POST', `/api/cc/accounts/${accountIds[Math.floor(Math.random() * accountIds.length)]}/sales`, { cookie, headers: h, body: { credits: 1000 + Math.round(Math.random() * 9000) } });
        break;
      case 'work poll': res = await request('GET', '/api/cc/work', { cookie }); break;
    }
    note(action, res.ms, res.status >= 200 && res.status < 300, res.status || res.error);
    await think();
  }
}

// The server's CPU (one core = 100%) and memory, every second.
const samples = [];
let lastCpu = null;
function sample() {
  if (!PID) return;
  try {
    const stat = fs.readFileSync(`/proc/${PID}/stat`, 'utf8').split(') ')[1].split(' ');
    const ticks = Number(stat[11]) + Number(stat[12]);
    const rss = Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${PID}/status`, 'utf8'))[1]) / 1024;
    const now = performance.now();
    if (lastCpu) samples.push({ cpu: ((ticks - lastCpu.ticks) / 100 / ((now - lastCpu.now) / 1000)) * 100, rss });
    lastCpu = { ticks, now };
  } catch {}
}
const timer = setInterval(sample, 1000);
const pct = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);
const started = performance.now();
const chosen = Array.from({ length: USERS }, (_, i) => people[i % people.length]);
const runs = chosen.map((p, i) => user(p, i));
await sleep(SECONDS * 1000);
stop = true;
await Promise.all(runs);
clearInterval(timer);
const elapsed = (performance.now() - started) / 1000;
let total = 0;
let errors = 0;
const rows = [...stats.entries()].map(([name, s]) => {
  s.times.sort((a, b) => a - b);
  total += s.times.length;
  errors += s.errors;
  return { action: name, count: s.times.length, p50: Math.round(pct(s.times, 50)), p95: Math.round(pct(s.times, 95)), p99: Math.round(pct(s.times, 99)), max: Math.round(s.times.at(-1) ?? 0), errors: s.errors, codes: s.codes };
}).sort((a, b) => b.count - a.count);
const steady = samples.slice(Math.ceil(RAMP / 1000));
const out = {
  users: USERS, seconds: SECONDS, thinkMs: THINK, requests: total, rps: Math.round(total / elapsed), errors,
  cpu: steady.length ? { avg: Math.round(steady.reduce((n, s) => n + s.cpu, 0) / steady.length), max: Math.round(Math.max(...steady.map((s) => s.cpu))) } : null,
  memoryMB: samples.length ? { start: Math.round(samples[0].rss), max: Math.round(Math.max(...samples.map((s) => s.rss))), end: Math.round(samples.at(-1).rss) } : null,
  actions: rows,
};
console.log(`\n${USERS} people · ${SECONDS}s · think ${THINK}ms: ${total} requests, ${out.rps}/s, ${errors} errors`);
if (out.cpu) console.log(`server CPU avg ${out.cpu.avg}% max ${out.cpu.max}% (100% = one core) · memory ${out.memoryMB.start} → max ${out.memoryMB.max} MB`);
console.log('action'.padEnd(18), 'count'.padStart(7), 'p50'.padStart(6), 'p95'.padStart(6), 'p99'.padStart(6), 'max'.padStart(7), 'errors'.padStart(7));
for (const r of rows) console.log(r.action.padEnd(18), String(r.count).padStart(7), String(r.p50).padStart(6), String(r.p95).padStart(6), String(r.p99).padStart(6), String(r.max).padStart(7), String(r.errors).padStart(7), Object.keys(r.codes).length ? JSON.stringify(r.codes) : '');
if (process.env.BENCH_OUT) fs.writeFileSync(process.env.BENCH_OUT, JSON.stringify(out, null, 2));
agent.destroy();
