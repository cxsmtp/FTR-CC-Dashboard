import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PASSWORD, client, start } from './helpers.js';

const sent = [];
const transport = {
  ok: true,
  async verify() {
    if (!this.ok) throw Object.assign(new Error('The connection test failed: The server rejected that user name and password.'), { status: 400 });
  },
  async send(smtp, message) {
    sent.push({ smtp, ...message });
    return { messageId: 'x' };
  },
};

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
const tokenOf = (mail) => /#\/reset\?token=([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1];

test('without a tested email server, "Forgot your password?" is not offered and sends nothing', async () => {
  assert.equal((await (await fetch(`${env.base}/api/auth/reset`)).json()).available, false);
  const r = await post('/api/auth/forgot', { email: 'se1@t.example' });
  assert.equal(r.status, 200);
  await wait();
  assert.equal(sent.length, 0);
});

test('SMTP: saved, its password never shown, nothing sent until a test succeeds for exactly those settings', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const saved = await admin.put('/api/settings/smtp', { smtp: { host: 'smtp.example.com', port: 587, requireAuth: true, user: 'cc@example.com', password: 'mail-secret-1', fromAddress: 'cc@example.com' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.smtp.password, undefined);
  assert.equal(saved.data.smtp.passwordSet, true);
  assert.equal(saved.data.verified, false);
  assert.ok(!fs.readFileSync(path.join(env.dataDir, 'settings.json'), 'utf8').includes('mail-secret-1'));
  assert.equal((await admin.post('/api/settings/smtp/send-test', { to: 'x@example.com' })).status, 409);
  transport.ok = false;
  assert.equal((await admin.post('/api/settings/smtp/test')).status, 400);
  transport.ok = true;
  const tested = await admin.post('/api/settings/smtp/test');
  assert.equal(tested.data.verified, true);
  assert.equal(tested.data.reset.ready, true);
  assert.equal((await admin.post('/api/settings/smtp/send-test', { to: 'x@example.com' })).status, 200);
  assert.equal(sent.at(-1).smtp.password, 'mail-secret-1');
  // A change to the settings needs a new test.
  const changed = await admin.put('/api/settings/smtp', { smtp: { port: 2525 } });
  assert.equal(changed.data.verified, false);
  assert.equal(changed.data.smtp.passwordSet, true);
  await admin.post('/api/settings/smtp/test');
  // Not for SEs.
  const se = await client(env.base, 'se1@t.example');
  assert.equal((await se.get('/api/settings/smtp')).status, 403);
});

test('forgot password: the same answer for anyone; a one-time link to the account’s own email', async () => {
  sent.length = 0;
  const a = await (await post('/api/auth/forgot', { email: 'nobody@t.example' })).json();
  const b = await (await post('/api/auth/forgot', { email: 'se2@t.example' })).json();
  assert.equal(a.message, b.message);
  await wait();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'se2@t.example');
  const token = tokenOf(sent[0]);
  assert.ok(token);
  assert.ok(sent[0].text.includes('https://cc.example/#/reset?token='));
  const check = await (await post('/api/auth/reset/check', { token })).json();
  assert.match(check.email, /^s•+@t\.example$/);
  assert.equal((await post('/api/auth/reset/confirm', { token, password: 'short' })).status, 400);
  const done = await post('/api/auth/reset/confirm', { token, password: 'A-brand-new-password-42' });
  assert.equal(done.status, 200);
  // Once only.
  assert.equal((await post('/api/auth/reset/confirm', { token, password: 'Another-new-password-43' })).status, 400);
  await client(env.base, 'se2@t.example', 'A-brand-new-password-42');
  await wait();
  assert.ok(sent.some((m) => /was changed/.test(m.subject)));
});

test('a reset link ends every session, and a made-up link does nothing', async () => {
  const se = await client(env.base, 'se1@t.example');
  sent.length = 0;
  await post('/api/auth/forgot', { email: 'se1@t.example' });
  await wait();
  const token = tokenOf(sent[0]);
  assert.equal((await post('/api/auth/reset/confirm', { token, password: 'Session-ending-password-7' })).status, 200);
  assert.equal((await se.get('/api/me')).status, 401);
  assert.equal((await post('/api/auth/reset/check', { token: 'A'.repeat(43) })).status, 400);
});

test('"not-admins": people who manage people reset through another Admin', async () => {
  const admin = await client(env.base, 'admin@t.example');
  await admin.put('/api/settings/smtp', { passwordReset: 'not-admins' });
  sent.length = 0;
  await post('/api/auth/forgot', { email: 'admin@t.example' });
  await wait();
  assert.equal(sent.length, 0);
  await admin.put('/api/settings/smtp', { passwordReset: 'everyone' });
});

test('an invite can send a welcome email, never the one-time password', async () => {
  const admin = await client(env.base, 'admin@t.example');
  sent.length = 0;
  const r = await admin.post('/api/people', { email: 'welcome@t.example', name: 'Welcome', role: 'se', teamId: env.teams.emea.id, sendWelcome: true });
  assert.equal(r.data.welcomed, true);
  assert.equal(sent[0].to, 'welcome@t.example');
  assert.ok(!sent[0].text.includes(r.data.temporary));
  assert.ok(!sent[0].html.includes(r.data.temporary));
  void PASSWORD;
});

test('an Admin resets a password from the address the page was opened by, even when PUBLIC_URL names another', async () => {
  const admin = await client(env.base, 'admin@t.example');
  // The browser says where the page is: here the server's own address, not PUBLIC_URL (https://cc.example).
  const ownOrigin = { Origin: env.base };
  const r = await admin.post(`/api/people/${env.users.se2.id}/reset`, {}, ownOrigin);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.temporary);
  // PUBLIC_URL itself is accepted too, and any other site is not.
  assert.equal((await admin.post(`/api/people/${env.users.se2.id}/unlock`, {}, { Origin: 'https://cc.example' })).status, 200);
  const evil = await admin.post(`/api/people/${env.users.se2.id}/reset`, {}, { Origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.match(evil.data.error, /another site/);
});

test('email settings save as typed, are tested at once, and a failing change brings back the last working ones', async () => {
  const admin = await client(env.base, 'admin@t.example');
  transport.ok = true;
  const good = await admin.put('/api/settings/smtp', { smtp: { host: 'smtp.good.example', port: 587, secure: false, requireAuth: true, user: 'mailer@good.example', password: 'app-password-1', fromAddress: 'mailer@good.example' }, test: true });
  assert.equal(good.status, 200, JSON.stringify(good.data));
  assert.equal(good.data.verified, true);
  // A change the mail server refuses: the working settings come back.
  transport.ok = false;
  const bad = await admin.put('/api/settings/smtp', { smtp: { host: 'smtp.broken.example', user: 'nobody', password: 'wrong' }, test: true });
  assert.equal(bad.status, 409);
  assert.match(bad.data.error, /last email settings that worked are back/);
  const now = (await admin.get('/api/settings/smtp')).data;
  assert.equal(now.smtp.host, 'smtp.good.example');
  assert.equal(now.verified, true);
  transport.ok = true;
});
