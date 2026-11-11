#!/usr/bin/env node
/**
 * A large fictional organisation for load tests: REGIONS regions × SES Sales Engineers (plus a leader each, a VP and an
 * Admin), ACCOUNTS accounts with reports and sales. Every person's password is BENCH_PASSWORD.
 *   DATA_DIR=/tmp/cc-bench REGIONS=8 SES=24 ACCOUNTS=1000 node loadtest/seed.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from '../server/config.js';
import { Iam, hashPassword } from '../server/iam.js';
import { Teams } from '../server/teams.js';
import { Accounts, sfChecksum } from '../server/accounts.js';
import { Terms } from '../server/terms.js';

const config = loadConfig();
const REGIONS = Number(process.env.REGIONS ?? 8);
const SES = Number(process.env.SES ?? 24);
const ACCOUNTS = Number(process.env.ACCOUNTS ?? 1000);
// One password for every simulated person, made for this run by run.sh and handed over in BENCH_PASSWORD.
const PASSWORD = process.env.BENCH_PASSWORD;
if (!PASSWORD) throw new Error('Set BENCH_PASSWORD (loadtest/run.sh makes one for each run).');
if (fs.existsSync(path.join(config.dataDir, 'iam.json'))) throw new Error(`${config.dataDir} is not empty`);
const iam = new Iam(config.dataDir);
const teams = new Teams(config.dataDir);
const accounts = new Accounts(config.dataDir);
const terms = new Terms({ dataDir: config.dataDir, textFile: path.join(config.root, 'TERMS.md') });
const hash = await hashPassword(PASSWORD);
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const people = [];
async function person(email, name, role, teamId) {
  const { user } = await iam.create({ email, name, role, teamId });
  Object.assign(user, { passwordHash: hash, mustChangePassword: false, guideSeenAt: new Date().toISOString(), prefs: { seenVersion: JSON.parse(fs.readFileSync(path.join(config.root, 'package.json'))).version } });
  terms.accept(user.id);
  people.push({ email, role, teamId, id: user.id });
  return user;
}
const root = teams.create({ name: 'Global Sales Engineering' });
await person('admin@bench.example', 'Bench Admin', 'admin', root.id);
const vp = await person('vp@bench.example', 'Bench VP', 'leader', root.id);
teams.update(root.id, { leaderIds: [vp.id] });
const seByTeam = new Map();
for (let r = 0; r < REGIONS; r++) {
  const t = teams.create({ name: `Region ${r + 1}`, parentId: root.id });
  const lead = await person(`lead${r + 1}@bench.example`, `Lead ${r + 1}`, 'leader', t.id);
  teams.update(t.id, { leaderIds: [lead.id] });
  const list = [];
  for (let s = 0; s < SES; s++) list.push(await person(`se${r + 1}-${s + 1}@bench.example`, `SE ${r + 1}.${s + 1}`, 'se', t.id));
  seByTeam.set(t.id, list);
}
iam.save();
const regionIds = [...seByTeam.keys()];
// A whole 18-character opportunity id: 15 characters and their checksum, as Salesforce shows it.
const SF = `https://bench.lightning.force.com/lightning/r/Opportunity/006AB000001xYzQ${sfChecksum('006AB000001xYzQ')}/view`;
for (let i = 0; i < ACCOUNTS; i++) {
  const teamId = regionIds[i % regionIds.length];
  const owner = seByTeam.get(teamId)[Math.floor(rand() * SES)];
  const a = accounts.create({ name: `Account ${i + 1}`, teamId, user: owner });
  accounts.setDetails(a.id, new Set([teamId]), { salesforceUrl: SF }, ['force.com']);
  const n = 1 + Math.floor(rand() * 5);
  let last;
  for (let k = 0; k < n; k++) {
    last = accounts.addReport({ customerId: a.id, user: owner, data: { tr: { totals: { credits: Math.round(1e4 + rand() * 4e5) } }, fusion: { totals: { credits: Math.round(rand() * 2e5) } }, summary: { settings: { extraPercent: 10, bundleCredits: 10000 } } } }, new Set([teamId]));
  }
  if (rand() < 0.5) accounts.setPrimary(a.id, last.id, new Set([teamId]));
  if (rand() < 0.5) accounts.addSale(a.id, new Set([teamId]), { credits: 50000, date: '2026-10-01' }, owner);
}
fs.writeFileSync(path.join(config.dataDir, 'bench-people.json'), JSON.stringify(people));
console.log(`Seeded ${people.length} people in ${regionIds.length} regions, ${accounts.accounts.size} accounts, ${accounts.reports.size} reports into ${config.dataDir}`);
