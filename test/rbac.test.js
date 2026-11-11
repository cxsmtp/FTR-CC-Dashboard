import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scopeOf, subtree, wouldLoop } from '../server/rbac.js';
import { checkSalesforceUrl } from '../server/accounts.js';
import { hostAllowed, privateAddress } from '../server/calculator.js';
import { passwordProblem } from '../server/iam.js';

const teams = [
  { id: 'g', parentId: null, leaderIds: ['vp'] },
  { id: 'e', parentId: 'g', leaderIds: ['el'] },
  { id: 'e1', parentId: 'e', leaderIds: [] },
  { id: 'a', parentId: 'g', leaderIds: [] },
];

test('a team and everything below it', () => {
  assert.deepEqual([...subtree(teams, 'e')].sort(), ['e', 'e1']);
  assert.deepEqual([...subtree(teams, 'g')].sort(), ['a', 'e', 'e1', 'g']);
  assert.equal(wouldLoop(teams, 'e', 'e1'), true);
  assert.equal(wouldLoop(teams, 'e1', 'a'), false);
});

test('scope: own team, teams led and below, or everything', () => {
  assert.deepEqual([...scopeOf({ id: 'se', teamId: 'e1' }, new Set(), teams)], ['e1']);
  assert.deepEqual([...scopeOf({ id: 'el', teamId: 'e' }, new Set(), teams)].sort(), ['e', 'e1']);
  assert.deepEqual([...scopeOf({ id: 'vp', teamId: 'g' }, new Set(), teams)].sort(), ['a', 'e', 'e1', 'g']);
  assert.deepEqual([...scopeOf({ id: 'x', teamId: 'a' }, new Set(['scope.all']), teams)].sort(), ['a', 'e', 'e1', 'g']);
});

test('Salesforce links: https on a Salesforce host, to an opportunity or an account', () => {
  assert.equal(checkSalesforceUrl('https://acme.lightning.force.com/lightning/r/Opportunity/006AB000001xYzQYAU/view').kind, 'opportunity');
  assert.equal(checkSalesforceUrl('https://acme.my.salesforce.com/001AB000001xYzQ').kind, 'account');
  for (const bad of ['', 'not a url', 'http://acme.my.salesforce.com/001AB000001xYzQ', 'https://evil.example/006AB000001xYzQYAU', 'https://salesforce.com.evil.example/006AB000001xYzQYAU', 'https://acme.my.salesforce.com/home', 'https://user:pw@acme.my.salesforce.com/001AB000001xYzQ', 'javascript:alert(1)//006AB000001xYzQYAU']) {
    assert.throws(() => checkSalesforceUrl(bad), /Salesforce|link/, bad);
  }
});

test('outbound hosts: only listed names, never an address inside a network', () => {
  assert.equal(hostAllowed('eu.ast.checkmarx.net', ['checkmarx.net']), true);
  assert.equal(hostAllowed('checkmarx.net.evil.example', ['checkmarx.net']), false);
  assert.equal(hostAllowed('10.0.0.1', ['checkmarx.net']), false);
  for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(privateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '2606:4700::1111']) assert.equal(privateAddress(ip), false, ip);
});

test('passwords: long and varied', () => {
  assert.match(passwordProblem('short'), /12/);
  assert.match(passwordProblem('aaaaaaaaaaaaaa'), /repetitive/);
  assert.equal(passwordProblem('correct-horse-battery'), '');
});

test('Salesforce links are analysed: opportunity or account by the object and the id, and an 18-character id checked', () => {
  const opp = checkSalesforceUrl('https://checkmarx.lightning.force.com/lightning/r/Opportunity/006Tl00000aAXPOIA4/view');
  assert.deepEqual([opp.kind, opp.recordId], ['opportunity', '006Tl00000aAXPOIA4']);
  const acc = checkSalesforceUrl('https://checkmarx.lightning.force.com/lightning/r/Account/0013z00002NbBI1AAN/view');
  assert.deepEqual([acc.kind, acc.recordId], ['account', '0013z00002NbBI1AAN']);
  // A mistyped id (its last three letters do not match), a contact, or an object that disagrees with the id: refused.
  for (const bad of ['https://checkmarx.lightning.force.com/lightning/r/Opportunity/006Tl00000aAXPOIA5/view', 'https://checkmarx.lightning.force.com/lightning/r/Contact/0033z00002NbBI1AAN/view', 'https://checkmarx.lightning.force.com/lightning/r/Account/006Tl00000aAXPOIA4/view']) {
    assert.throws(() => checkSalesforceUrl(bad), /not|whole/, bad);
  }
});
