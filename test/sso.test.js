import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignedXml } from 'xml-crypto';

import { makeCertificate } from '../core/src/tls.js';
import { client, start } from './helpers.js';

let env;
let idp;
before(async () => {
  env = await start({ publicUrl: 'https://cc.example' });
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cert = makeCertificate({ subject: { cn: 'Test IdP' }, names: [], publicKey, signerKey: privateKey });
  idp = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: typeof cert === 'string' ? cert : cert.pem ?? cert.toString() };
});
after(async () => {
  await env.close();
  fs.rmSync(env.dataDir, { recursive: true, force: true });
});

const requestId = async () => {
  const r = await fetch(`${env.base}/saml/login`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  const u = new URL(r.headers.get('location'));
  assert.equal(u.origin, 'https://idp.example');
  const xml = zlib.inflateRawSync(Buffer.from(u.searchParams.get('SAMLRequest'), 'base64')).toString();
  return /ID="([^"]+)"/.exec(xml)[1];
};

function assertion({ email, inResponseTo, sign = true, key = idp.key, audience = 'https://cc.example/saml/metadata' }) {
  const now = new Date();
  const later = new Date(now.getTime() + 5 * 60_000).toISOString();
  const aid = `_${randomUUID()}`;
  const a = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${aid}" Version="2.0" IssueInstant="${now.toISOString()}"><saml:Issuer>https://idp.example/issuer</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${email}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${inResponseTo}" NotOnOrAfter="${later}" Recipient="https://cc.example/saml/acs"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${new Date(now.getTime() - 60000).toISOString()}" NotOnOrAfter="${later}"><saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now.toISOString()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>${email}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="name"><saml:AttributeValue>Jo SSO</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion>`;
  let signed = a;
  if (sign) {
    const sig = new SignedXml({ privateKey: key, signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' });
    sig.addReference({ xpath: `//*[local-name(.)='Assertion']`, transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'], digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
    sig.computeSignature(a, { location: { reference: `//*[local-name(.)='Issuer']`, action: 'after' } });
    signed = sig.getSignedXml();
  }
  const response = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${now.toISOString()}" Destination="https://cc.example/saml/acs" InResponseTo="${inResponseTo}"><saml:Issuer>https://idp.example/issuer</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${signed}</samlp:Response>`;
  return Buffer.from(response).toString('base64');
}
const acs = (samlResponse) => fetch(`${env.base}/saml/acs`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://idp.example' }, body: new URLSearchParams({ SAMLResponse: samlResponse }), redirect: 'manual' });

test('an Admin connects the identity provider; SSO is off until it is complete', async () => {
  const admin = await client(env.base, 'admin@t.example');
  assert.equal((await admin.put('/api/settings/sso', { enabled: true })).status, 409);
  assert.equal((await admin.put('/api/settings/sso', { entryPoint: 'http://idp.example/sso' })).status, 400);
  assert.equal((await admin.put('/api/settings/sso', { idpCert: 'not a cert' })).status, 400);
  const saved = await admin.put('/api/settings/sso', { entryPoint: 'https://idp.example/sso', idpIssuer: 'https://idp.example/issuer', idpCert: idp.cert, emailAttribute: 'email', nameAttribute: 'name', enabled: true });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.ready, true);
  assert.equal(saved.data.sp.acs, 'https://cc.example/saml/acs');
  assert.equal(saved.data.idpCert, undefined);
  assert.match(await (await fetch(`${env.base}/saml/metadata`)).text(), /AssertionConsumerService/);
  assert.equal((await (await fetch(`${env.base}/api/auth/sso`)).json()).enabled, true);
  const se = await client(env.base, 'se1@t.example');
  assert.equal((await se.get('/api/settings/sso')).status, 403);
});

test('a signed assertion for someone with access signs them in', async () => {
  const res = await acs(assertion({ email: 'se1@t.example', inResponseTo: await requestId() }));
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const me = await (await fetch(`${env.base}/api/me`, { headers: { cookie } })).json();
  assert.equal(me.user.email, 'se1@t.example');
});

test('unsigned, wrongly signed, replayed or unasked-for answers are refused', async () => {
  const id = await requestId();
  assert.ok(!(await acs(assertion({ email: 'se1@t.example', inResponseTo: id, sign: false }))).headers.get('set-cookie'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.ok(!(await acs(assertion({ email: 'se1@t.example', inResponseTo: await requestId(), key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }))).headers.get('set-cookie'));
  assert.ok(!(await acs(assertion({ email: 'se1@t.example', inResponseTo: '_never-asked' }))).headers.get('set-cookie'));
  assert.ok(!(await acs(assertion({ email: 'se1@t.example', inResponseTo: await requestId(), audience: 'https://other.example' }))).headers.get('set-cookie'));
  const once = assertion({ email: 'se1@t.example', inResponseTo: await requestId() });
  assert.ok((await acs(once)).headers.get('set-cookie'));
  assert.ok(!(await acs(once)).headers.get('set-cookie'));
});

test('someone without access is refused, unless they are added on first sign-in (never as an Admin)', async () => {
  assert.ok(!(await acs(assertion({ email: 'new.person@t.example', inResponseTo: await requestId() }))).headers.get('set-cookie'));
  const admin = await client(env.base, 'admin@t.example');
  assert.equal((await admin.put('/api/settings/sso', { jit: true, jitRole: 'admin', jitTeamId: env.teams.emea.id })).status, 400);
  assert.equal((await admin.put('/api/settings/sso', { jit: true, jitRole: 'se', jitTeamId: env.teams.emea.id })).status, 200);
  const res = await acs(assertion({ email: 'new.person@t.example', inResponseTo: await requestId() }));
  assert.ok(res.headers.get('set-cookie'));
  const person = env.app.iam.byEmail('new.person@t.example');
  assert.equal(person.role, 'se');
  assert.equal(person.teamId, env.teams.emea.id);
  assert.equal(person.name, 'Jo SSO');
});

test('passwords for Admins only: everyone else uses SSO', async () => {
  const admin = await client(env.base, 'admin@t.example');
  await admin.put('/api/settings/sso', { passwordSignIn: 'admins' });
  await assert.rejects(client(env.base, 'se2@t.example'), /403/);
  await client(env.base, 'admin@t.example');
  await admin.put('/api/settings/sso', { passwordSignIn: 'everyone' });
});
