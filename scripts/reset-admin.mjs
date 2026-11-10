#!/usr/bin/env node
/**
 * Locked out? Give an Admin a new one-time password, from the server's own console:
 *   node scripts/reset-admin.mjs admin@corp.example
 * With no email, the first active Admin. With an email that has no access yet, a new Admin in the top team.
 */
import { loadConfig } from '../server/config.js';
import { Iam } from '../server/iam.js';
import { Teams } from '../server/teams.js';

const config = loadConfig();
const iam = new Iam(config.dataDir);
const teams = new Teams(config.dataDir);
const email = process.argv[2];
let user = email ? iam.byEmail(email) : iam.activeAdmins()[0];
let temporary;
if (!user && email) {
  ({ user, temporary } = await iam.create({ email, name: email.split('@')[0], role: 'admin', teamId: teams.list().find((t) => !t.parentId)?.id ?? null }));
} else if (user) {
  iam.update(user.id, { role: 'admin', active: true });
  temporary = await iam.resetPassword(user.id);
} else {
  console.error('No Admin found: give an email, node scripts/reset-admin.mjs you@corp.example');
  process.exit(1);
}
console.log(`${user.email} is an Admin. One-time password (they choose their own at sign-in):\n${temporary}`);
