import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { client, start } from './helpers.js';

let env;
const sent = [];
before(async () => {
  env = await start({ mailTransport: { verify: async () => {}, send: async (smtp, m) => sent.push(m) } });
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('Get help: a numbered case or enhancement, emailed to the support address, answered by email', async () => {
  const se = await client(env.base, 'se1@t.example');
  const se2 = await client(env.base, 'se2@t.example');
  const admin = await client(env.base, 'admin@t.example');
  assert.equal((await admin.get('/api/me')).data.support.email, 'bhawani.singh@checkmarx.com');
  // A tested email server: requests are then emailed.
  await admin.put('/api/settings/smtp', { smtp: { host: 'smtp.example.com', port: 587, requireAuth: false, fromAddress: 'cc@example.com' } });
  assert.equal((await admin.post('/api/settings/smtp/test')).data.verified, true);
  sent.length = 0;
  assert.equal((await se.post('/api/support', { kind: 'case', subject: '', text: 'x' })).status, 400);
  const c = await se.post('/api/support', { kind: 'case', subject: 'Report fails', text: 'It stops at 40%.', priority: 'high' });
  assert.equal(c.status, 200);
  assert.equal(c.data.request.id, 'SUP-0001');
  // The person who raised it gets their number; the support address (bhawani.singh@checkmarx.com) the request.
  assert.equal(c.data.emailed.error, '');
  const tos = sent.map((m) => String(m.to));
  assert.ok(tos.some((t) => t.includes('se1@t.example')), tos.join(' | '));
  assert.ok(tos.some((t) => t.includes('bhawani.singh@checkmarx.com')), tos.join(' | '));
  assert.ok(sent.some((m) => /\[SUP-0001\] Report fails/.test(m.subject)));
  const e = await se.post('/api/support', { kind: 'enhancement', subject: 'Dark PDF', text: 'Please.' });
  assert.equal(e.data.request.id, 'ENH-0001');
  // Only theirs, and the team's: another SE does not see it; the Admin (support team) sees both.
  assert.equal((await se2.get('/api/support/SUP-0001')).status, 404);
  assert.equal((await admin.get('/api/support')).data.requests.length, 2);
  // Answered by email: the support address replies to the person who asked; there is no conversation here.
  assert.ok(sent.some((m) => String(m.to).includes('bhawani.singh@checkmarx.com') && String(m.replyTo).includes('se1@t.example')));
  assert.equal((await admin.post('/api/support/SUP-0001/messages', { text: 'Fixed.' })).status, 410);
  assert.equal((await admin.post('/api/support/SUP-0001/status', { status: 'completed' })).status, 410);
  // Settings: the address can change; the audit log has it all.
  assert.equal((await admin.put('/api/settings/support', { mode: 'portal', email: 'not an address' })).status, 400);
  assert.equal((await se.put('/api/settings/support', { mode: 'email' })).status, 403);
  const audit = JSON.stringify((await admin.get('/api/audit?limit=100')).data);
  assert.match(audit, /support\.case/);
});
