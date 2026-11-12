import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACTIVE_LEVELS, activeEnough, aheadSettings, newCustomerEstimate, newCustomerSettings, repoKey } from '../core/public/calculator/model.js';
import { LONG_LINE, countText } from '../core/src/cloc-fusion/loc.js';

const JS = { line: ['//'], block: [['/*', '*/']] };

test('a line of code longer than 512 characters counts as several (minified code weighs what it holds)', () => {
  assert.equal(LONG_LINE, 512);
  assert.deepEqual(countText('a = 1;\n// note\n\nb = 2;\n', JS), { code: 2, comment: 1, blank: 1 });
  assert.equal(countText(`${'x'.repeat(512)}\n`, JS).code, 1);
  assert.equal(countText(`${'x'.repeat(513)}\n`, JS).code, 2);
  // One 120,005-character line: 235 lines of 512, not 1.
  assert.equal(countText(`var a=${'1+'.repeat(60000)}1;\n`, JS).code, 235);
  // Leading spaces do not count towards its length; a long comment stays one comment line.
  assert.equal(countText(`${' '.repeat(600)}x = 1;\n`, JS).code, 1);
  assert.deepEqual(countText(`/* ${'c'.repeat(5000)} */\n`, JS), { code: 0, comment: 1, blank: 0 });
});

test('triage & remediation: only the active projects, when ticked', () => {
  assert.equal(aheadSettings({}).activeOnly, false);
  assert.equal(aheadSettings({ activeOnly: true }).activeAtLeast, 'month');
  assert.equal(aheadSettings({ activeOnly: true, activeAtLeast: 'nonsense' }).activeAtLeast, 'month');
  assert.ok(ACTIVE_LEVELS.includes('year'));
  for (const f of ['more-5-week', '1-5-week', '2-weeks', 'month']) assert.equal(activeEnough(f, 'month'), true, f);
  for (const f of ['2-months', '3-months', '6-months', 'year', 'rare', undefined]) assert.equal(activeEnough(f, 'month'), false, String(f));
  assert.equal(activeEnough('year', 'year'), true);
  assert.equal(activeEnough('rare', 'year'), false);
});

test('counted code on top of Checkmarx One: only the repositories that are not projects there', () => {
  assert.equal(repoKey('Org/Payments-API'), 'payments-api');
  const fusion = { models: [{ id: 'm', name: 'Opus 5.5', creditsPer10k: 2 }], defaultModel: 'm' };
  const projects = [{ name: 'org/pay-api', git: {}, langs: { Java: 25000 } }, { name: 'new-svc', git: {}, langs: { Go: 12000 } }];
  const all = newCustomerEstimate({ basis: 'git', projects }, fusion).totals;
  const top = newCustomerEstimate({ basis: 'git', onTop: true, onTopSkip: ['PAY-API'], projects }, fusion);
  assert.equal(all.projects, 2);
  assert.equal(top.totals.projects, 1);
  assert.ok(top.totals.credits < all.credits);
  assert.equal(top.rows.find((r) => r.name === 'org/pay-api').inCxone, true);
  // Off unless chosen; the names left out are kept only while it is on top.
  assert.equal(newCustomerSettings({}).onTop, false);
  assert.deepEqual(newCustomerSettings({ onTopSkip: ['x'] }).onTopSkip, []);
});
