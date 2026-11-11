#!/usr/bin/env node
/**
 * Fill an EMPTY data folder with a fictional demo organisation, to try the command center or show it:
 * Global → EMEA, APAC, Americas, with leaders, Sales Engineers, accounts and reports.
 *
 *   DATA_DIR=./demo-data node scripts/demo-seed.mjs     (then: DATA_DIR=./demo-data npm start)
 *
 * Everyone's password is printed once; every name and Salesforce id is made up. Never run it on real data.
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from '../server/config.js';
import { Iam, hashPassword } from '../server/iam.js';
import { Teams } from '../server/teams.js';
import { Accounts } from '../server/accounts.js';
import { Terms } from '../server/terms.js';

const config = loadConfig();
if (fs.existsSync(path.join(config.dataDir, 'iam.json'))) {
  console.error(`${config.dataDir} already has data: the demo only fills an empty folder.`);
  process.exit(1);
}
const iam = new Iam(config.dataDir);
const teams = new Teams(config.dataDir);
const accounts = new Accounts(config.dataDir);
const terms = new Terms({ dataDir: config.dataDir, textFile: path.join(config.root, 'TERMS.md') });
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo-Command-Center-2026';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const sfId = (prefix) => prefix + Array.from({ length: 15 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789'[Math.floor(rand() * 58)]).join('');

async function person(email, name, role, teamId, title) {
  const { user } = await iam.create({ email, name, role, teamId, title });
  Object.assign(user, { passwordHash: await hashPassword(PASSWORD), mustChangePassword: false, guideSeenAt: new Date().toISOString(), lastSignInAt: new Date(Date.now() - rand() * 6 * 86400e3).toISOString() });
  terms.accept(user.id);
  return user;
}

const root = teams.create({ name: 'Global Sales Engineering', region: 'Global' });
const admin = await person('admin@corp.example', 'Avery Admin', 'admin', root.id, 'Platform owner');
const vp = await person('vp.se@corp.example', 'Jordan Rivera', 'leader', root.id, 'VP, Sales Engineering');
teams.update(root.id, { leaderIds: [vp.id] });

const regions = [
  { name: 'EMEA', lead: ['emea.lead@corp.example', 'Sam Okafor'], ses: ['Lena Fischer', 'Marco Bianchi', 'Aisha Rahman', 'Tom Clarke', 'Noa Levi', 'Pierre Laurent', 'Ingrid Berg', 'Yusuf Demir'] },
  { name: 'APAC', lead: ['apac.lead@corp.example', 'Mei Tanaka'], ses: ['Arjun Mehta', 'Grace Lim', 'Kenji Sato', 'Priya Nair', 'Liam Walsh', 'Hana Kim'] },
  { name: 'Americas', lead: ['amer.lead@corp.example', 'Chris Morgan'], ses: ['Diego Santos', 'Emily Carter', 'Noah Brooks', 'Sofia Alvarez', 'Ethan Price', 'Olivia Reed', 'Lucas Martin', 'Maya Patel'] },
];
const companies = ['Northwind Bank', 'Helios Energy', 'Contoso Retail', 'Fabrikam Health', 'Tailspin Air', 'Wingtip Insurance', 'Litware Telecom', 'Adatum Pharma', 'Proseware Logistics', 'Woodgrove Capital', 'Alpine Motors', 'Blue Yonder Foods', 'Coho Media', 'Fourth Coffee', 'Lucerne Publishing', 'Margie Travel', 'Trey Research', 'VanArsdel Games', 'Wide World Shipping', 'Graphic Design Inst', 'Humongous Cloud', 'Relecloud', 'Datum Analytics', 'Bellows College', 'Southridge Video', 'Fineartschool', 'Consolidated Mining', 'Nod Publishers', 'Olympia Steel', 'Sapphire Grid', 'Quantum Freight', 'Orbit Payments', 'Starling Insure', 'Nimbus Software', 'Cobalt Health', 'Polar Utilities'];
let ci = 0;

for (const region of regions) {
  const team = teams.create({ name: `${region.name} Sales Engineering`, region: region.name, parentId: root.id });
  const lead = await person(region.lead[0], region.lead[1], 'leader', team.id, `SE Director, ${region.name}`);
  teams.update(team.id, { leaderIds: [lead.id] });
  for (const name of region.ses) {
    const se = await person(`${name.toLowerCase().replace(/[^a-z]+/g, '.')}@corp.example`, name, 'se', team.id, 'Sales Engineer');
    const n = 1 + Math.floor(rand() * 2.4);
    for (let k = 0; k < n && ci < companies.length * 3; k++) {
      const company = `${companies[ci % companies.length]}${ci >= companies.length ? ` ${region.name}` : ''}`;
      ci++;
      const a = accounts.create({ name: company, teamId: team.id, user: se });
      const opp = rand() > 0.35;
      const missing = rand() < 0.12;
      if (!missing) accounts.setDetails(a.id, new Set([team.id]), { salesforceUrl: `https://corp-demo.lightning.force.com/lightning/r/${opp ? 'Opportunity' : 'Account'}/${sfId(opp ? '006' : '001')}/view` }, ['force.com']);
      if (missing) continue;
      const reportsMade = 1 + Math.floor(rand() * 3);
      const base = 20000 + rand() * 260000;
      let last = null;
      for (let r = 0; r < reportsMade; r++) {
        const tr = Math.round(base * (0.45 + rand() * 0.3) * (1 + r * 0.06));
        const fusion = Math.round(base * (0.2 + rand() * 0.35));
        const author = rand() < 0.8 ? se : pick([lead, se]);
        const rep = accounts.addReport({ customerId: a.id, user: author, data: { tr: { totals: { credits: tr } }, fusion: { totals: { credits: fusion } }, summary: { settings: { extraPercent: pick([0, 10, 15, 20]), bundleCredits: 10000 } } } }, new Set([team.id]));
        const when = new Date(Date.now() - (300 - r * 20) * rand() * 86400e3).toISOString();
        const full = accounts.reports.get(rep.id);
        accounts.reports.put({ ...full, createdAt: when });
        if (rand() < 0.55) {
          const shared = accounts.markShared(rep.id, new Set([team.id]), { shared: true, note: pick(['Emailed to the CISO', 'Presented on the QBR call', 'Sent with the proposal', 'Shared with the AppSec lead']) }, author);
          accounts.reports.put({ ...shared, sharedAt: new Date(Math.min(Date.now(), Date.parse(when) + (1 + rand() * 9) * 86400e3)).toISOString() });
        }
        last = rep;
      }
      if (last && rand() < 0.6) accounts.setPrimary(a.id, last.id, new Set([team.id]));
      // Some of what was projected has been sold: one sale or several.
      const primary = accounts.primaryOf(accounts.accounts.meta(a.id)).report;
      if (primary && rand() < 0.65) {
        let left = primary.totalCredits * (0.25 + rand() * 0.85);
        const parts = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < parts && left > 1000; k++) {
          const credits = Math.round((k === parts - 1 ? left : left * (0.3 + rand() * 0.4)) / 1000) * 1000;
          left -= credits;
          const day = new Date(Date.now() - rand() * 120 * 86400e3).toISOString().slice(0, 10);
          accounts.addSale(a.id, new Set([team.id]), { credits, date: day, reference: `${sfId('006').slice(0, 15)}`, note: pick(['Year 1', 'Initial bundle', 'Expansion', 'Q4 order']), reportId: primary.id }, se);
        }
      }
    }
  }
}
void admin;
console.log(`Demo organisation made in ${config.dataDir}: ${iam.users().length} people, ${teams.list().length} teams, ${accounts.accounts.size} accounts, ${accounts.reports.size} reports.`);
console.log(`Everyone signs in with the password ${PASSWORD} (admin@corp.example is the Admin, vp.se@corp.example the VP, emea.lead@corp.example a regional leader, lena.fischer@corp.example an SE).`);
