import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { client, start } from './helpers.js';

// Emails are kept here instead of sent.
const sent = [];
const transport = { async verify() {}, async send(smtp, message) { sent.push(message); return { messageId: 'x' }; } };

let env;
before(async () => {
  env = await start({ mailTransport: transport, publicUrl: 'https://cc.example' });
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

const post = (p, body) => fetch(`${env.base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const wait = () => new Promise((r) => setTimeout(r, 150));
const mailTo = (to) => sent.filter((m) => m.to === to).at(-1);
const tokenIn = (mail, kind) => new RegExp(`#/${kind}\\?token=([A-Za-z0-9_-]{43})`).exec(mail?.text ?? '')?.[1];

test('joining by oneself: off without email; one answer for all; an existing person gets a new-password link, never a password', async () => {
  // No tested email server: not offered.
  assert.equal((await (await fetch(`${env.base}/api/auth/join`)).json()).available, false);
  assert.equal((await post('/api/auth/join', { email: 'new.person@checkmarx.com' })).status, 409);
  const admin = await client(env.base, 'admin@t.example');
  await admin.put('/api/settings/smtp', { smtp: { host: 'smtp.example.com', port: 587, fromAddress: 'cc@example.com' } });
  assert.equal((await admin.post('/api/settings/smtp/test')).data.verified, true);
  const offered = await (await fetch(`${env.base}/api/auth/join`)).json();
  assert.deepEqual(offered, { available: true, domains: ['checkmarx.com'] });
  // Another domain: said plainly.
  const other = await post('/api/auth/join', { email: 'someone@gmail.com' });
  assert.equal(other.status, 400);
  assert.match((await other.json()).error, /@checkmarx\.com/);
  // The test people are on t.example: that domain joins too.
  assert.equal((await admin.put('/api/settings/join', { domains: 'checkmarx.com, t.example' })).status, 200);
  // Someone with access and someone new get the very same answer on the page.
  const known = await (await post('/api/auth/join', { email: 'se1@t.example' })).json();
  const fresh = await (await post('/api/auth/join', { email: 'new.person@t.example' })).json();
  assert.equal(known.message, fresh.message);
  await wait();
  // The email says the rest: a link to choose a new password (no password in it), or a link to finish joining.
  const toKnown = mailTo('se1@t.example');
  assert.match(toKnown.subject, /already have access/);
  assert.ok(tokenIn(toKnown, 'reset'));
  assert.doesNotMatch(toKnown.text, /Password-|password is:/i);
  assert.ok(tokenIn(mailTo('new.person@t.example'), 'join'));
});

test('joining: the link proves the address; team from the structure, a role open to joining; signed in; reviewed on People', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const token = tokenIn(mailTo('new.person@t.example'), 'join');
  const check = await (await post('/api/auth/join/check', { token })).json();
  assert.equal(check.email, 'new.person@t.example');
  assert.equal(check.name, 'New Person');
  assert.ok(check.teams.some((t) => t.path.endsWith('EMEA')));
  // Never a role that manages people or sees everything.
  const offered = check.roles.map((r) => r.id).sort();
  assert.deepEqual(offered, ['cs', 'sales', 'se', 'viewer']);
  assert.equal((await post('/api/auth/join/confirm', { token, name: 'New Person', teamId: env.teams.emea.id, role: 'admin', password: 'A-good-long-password-77' })).status, 400);
  assert.equal((await post('/api/auth/join/confirm', { token, name: 'New Person', teamId: 'nope', role: 'se', password: 'A-good-long-password-77' })).status, 400);
  assert.equal((await post('/api/auth/join/confirm', { token, name: 'New Person', teamId: env.teams.emea.id, role: 'se', password: 'short' })).status, 400);
  const done = await post('/api/auth/join/confirm', { token, name: 'New Person', teamId: env.teams.emea.id, role: 'se', password: 'A-good-long-password-77' });
  assert.equal(done.status, 200);
  assert.match(done.headers.get('set-cookie') ?? '', /HttpOnly/);
  // Used: the link works once.
  assert.equal((await post('/api/auth/join/check', { token })).status, 400);
  // They sign in with the password they chose: no first change asked; the terms come next, as for anyone.
  const joiner = await client(env.base, 'new.person@t.example', 'A-good-long-password-77');
  const me = (await joiner.get('/api/me')).data;
  assert.equal(me.user.mustChangePassword, false);
  assert.equal(me.role.id, 'se');
  // The Admin is told, and sees them to review with what they chose.
  assert.equal((await admin.get('/api/me')).data.joinersToReview, 1);
  // So is the Leader of their team; a Leader elsewhere is not (APAC has none in the tests: the EMEA Lead's view is enough).
  const emeaLead = await client(env.base, 'emea.lead@t.example');
  assert.equal((await emeaLead.get('/api/me')).data.joinersToReview, 1);
  const list = (await admin.get('/api/people')).data.people;
  const them = list.find((u) => u.email === 'new.person@t.example');
  assert.equal(them.joined.role, 'se');
  assert.equal(them.joined.reviewedAt, null);
  // Put right (another team), then approved.
  assert.equal((await admin.put(`/api/people/${them.id}`, { teamId: env.teams.apac.id })).status, 200);
  const ok = await admin.post(`/api/people/${them.id}/approve`, {});
  assert.equal(ok.status, 200);
  assert.ok(ok.data.user.joined.reviewedAt);
  assert.equal((await admin.get('/api/me')).data.joinersToReview, 0);
  // Someone made by an Admin is not "approved".
  assert.equal((await admin.post(`/api/people/${env.users.se2.id}/approve`, {})).status, 400);
  // Asking again with that address now: they have access, so a new-password link, not a second account.
  await post('/api/auth/join', { email: 'new.person@t.example' });
  await wait();
  assert.match(mailTo('new.person@t.example').subject, /already have access/);
  // All of it on record.
  const actions = (await admin.get('/api/audit?limit=60')).data.events.map((e) => e.action);
  for (const a of ['join.asked', 'user.join', 'user.join.approve', 'settings.join']) assert.ok(actions.includes(a), a);
});

test('joining: only an Admin sets the rules; a role that manages people can never be opened; turned off, it is gone', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const lead = await client(env.base, 'emea.lead@t.example');
  assert.equal((await lead.put('/api/settings/join', { enabled: false })).status, 403);
  assert.equal((await admin.put('/api/settings/join', { roles: ['se', 'leader'] })).status, 400);
  assert.equal((await admin.put('/api/settings/join', { domains: 'not a domain' })).status, 400);
  assert.equal((await admin.put('/api/settings/join', { roles: ['se'] })).status, 200);
  assert.deepEqual((await admin.get('/api/settings/join')).data.roles, ['se']);
  assert.equal((await admin.put('/api/settings/join', { enabled: false })).status, 200);
  assert.equal((await (await fetch(`${env.base}/api/auth/join`)).json()).available, false);
  assert.equal((await post('/api/auth/join', { email: 'late@t.example' })).status, 409);
});
