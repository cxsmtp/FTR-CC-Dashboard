import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { makePass, readPass } from '../server/link.js';
import { client, start } from './helpers.js';

// Linked apps: one sign-in for this command center and Kendra (server/routes/linked.js, server/link.js).
let env;
before(async () => {
  env = await start();
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

test('Kendra and the FTR command center: signed in to one, signed in to the other', async () => {
  const { base } = env;
  assert.equal((await (await fetch(`${base}/api/auth/linked`)).json()).kendra, null);
  assert.match(await (await fetch(`${base}/link/kendra/authorize`)).text(), /Not linked/);

  const se = await client(base, 'se1@t.example');
  assert.equal((await se.put('/api/settings/link', { kendraUrl: 'https://kendra.example.com', newKey: true })).status, 403, 'Admins only');
  const admin = await client(base, 'admin@t.example');
  assert.equal((await admin.put('/api/settings/link', { kendraUrl: 'http://kendra.example.com' })).status, 400, 'https only');
  const made = await admin.put('/api/settings/link', { kendraUrl: 'https://kendra.example.com/', newKey: true });
  assert.equal(made.status, 200);
  const key = made.data.key;
  assert.ok(key.length >= 43 && made.data.ready);
  const shown = await admin.get('/api/settings/link');
  assert.ok(!JSON.stringify(shown.data).includes(key), 'the key is never sent back');
  assert.ok(!fs.readFileSync(`${env.dataDir}/settings.json`, 'utf8').includes(key), 'sealed on disk');
  assert.equal((await (await fetch(`${base}/api/auth/linked`)).json()).kendra, 'https://kendra.example.com');
  assert.deepEqual((await admin.get('/api/me')).data.linked, { kendra: 'https://kendra.example.com' });

  // The menu: Kendra, with a pass for this person.
  const out = await fetch(`${base}/link/kendra?to=%2F%23%2Fpovs`, { headers: { cookie: se.cookie }, redirect: 'manual' });
  assert.equal(out.status, 302);
  const loc = new URL(out.headers.get('location'));
  assert.equal(`${loc.origin}${loc.pathname}`, 'https://kendra.example.com/link/ftr/in');
  assert.equal(loc.searchParams.get('to'), '/#/povs');
  assert.equal(readPass(loc.searchParams.get('pass'), { key, me: 'kendra', from: 'ftr' }).email, 'se1@t.example');

  // Kendra asks who is here: the hop page, then a pass (signed in) or "nobody".
  assert.match(await (await fetch(`${base}/link/kendra/authorize?to=%2F`)).text(), /authorize2/);
  const who = await fetch(`${base}/link/kendra/authorize2?to=%2F`, { headers: { cookie: se.cookie }, redirect: 'manual' });
  assert.match(who.headers.get('location'), /^https:\/\/kendra\.example\.com\/link\/ftr\/in\?pass=/);
  const nobody = await fetch(`${base}/link/kendra/authorize2`, { redirect: 'manual' });
  assert.equal(nobody.headers.get('location'), 'https://kendra.example.com/link/ftr/none');

  // Kendra vouches for someone: a session here, once.
  const pass = makePass({ key, from: 'kendra', to: 'ftr', email: 'SE2@t.example' });
  const inn = await fetch(`${base}/link/kendra/in?pass=${encodeURIComponent(pass)}&to=%2F%23%2Faccounts`, { redirect: 'manual' });
  const set = inn.headers.get('set-cookie');
  assert.match(set ?? '', /HttpOnly; SameSite=Strict/);
  assert.match(await inn.text(), /url=\/#\/accounts/);
  const me = await (await fetch(`${base}/api/me`, { headers: { cookie: set.split(';')[0] } })).json();
  assert.equal(me.user.email, 'se2@t.example');
  assert.ok(!(await fetch(`${base}/link/kendra/in?pass=${encodeURIComponent(pass)}`, { redirect: 'manual' })).headers.get('set-cookie'), 'a pass works once');
  // A pass for the other app, from the wrong key, or for someone without access: refused.
  for (const bad of [makePass({ key, from: 'ftr', to: 'kendra', email: 'se2@t.example' }), makePass({ key: 'x'.repeat(43), from: 'kendra', to: 'ftr', email: 'se2@t.example' }), makePass({ key, from: 'kendra', to: 'ftr', email: 'stranger@else.example' })]) {
    const r = await fetch(`${base}/link/kendra/in?pass=${encodeURIComponent(bad)}`, { redirect: 'manual' });
    assert.ok(!r.headers.get('set-cookie'));
    assert.match(await r.text(), /linked=none/);
  }
  // Somewhere else to land is refused: only this site's own pages.
  const away = await fetch(`${base}/link/kendra/in?pass=${encodeURIComponent(makePass({ key, from: 'kendra', to: 'ftr', email: 'se2@t.example' }))}&to=${encodeURIComponent('//evil.example')}`, { redirect: 'manual' });
  assert.doesNotMatch(await away.text(), /evil/);

  // In the audit log; and unlinked, nothing more.
  const log = JSON.stringify((await admin.get('/api/audit?limit=200')).data);
  assert.match(log, /auth\.linked\.signin/);
  assert.match(log, /auth\.linked\.refused/);
  await admin.put('/api/settings/link', { remove: true });
  assert.equal((await (await fetch(`${base}/api/auth/linked`)).json()).kendra, null);
});

test('the passes used in the last minute go to the next version', async () => {
  const { app } = env;
  const state = app.handoff();
  assert.ok(Array.isArray(state.linked));
  app.resume();
});
