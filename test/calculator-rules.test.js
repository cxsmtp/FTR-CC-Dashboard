import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACTIVE_LEVELS, activeEnough, aheadSettings, newCustomerEstimate, newCustomerSettings, repoKey } from '../core/public/calculator/model.js';
import { DENSE_MIN_BYTES, LocTally, adjustedLoc, countText } from '../core/src/cloc-fusion/loc.js';
import { isExcludedPath, languageOf } from '../core/src/cloc-fusion/languages.js';

const JS = { line: ['//'], block: [['/*', '*/']] };

test('dense files (minified or generated code) are sized as cloc-fusion sizes them: 64 KB or more, over 512 bytes a line', () => {
  assert.deepEqual(countText('a = 1;\n// note\n\nb = 2;\n', JS), { code: 2, comment: 1, blank: 1 });
  assert.equal(adjustedLoc(DENSE_MIN_BYTES - 1, 1), 1);
  assert.equal(adjustedLoc(DENSE_MIN_BYTES, DENSE_MIN_BYTES / 512), DENSE_MIN_BYTES / 512);
  // A 300 KB bundle on one line: 7,680 lines, not 1.
  assert.equal(adjustedLoc(300 * 1024, 1), 7680);
  const js = languageOf('app.js');
  const tally = new LocTally();
  tally.add(js, `var a=${'1+'.repeat(60000)}1;\n`);
  tally.add(js, 'a = 1;\nb = 2;\n');
  tally.addBySize(js, 4 * 1024 * 1024);
  const sum = tally.summary({});
  assert.equal(sum.languages[js.name].code, Math.ceil(120008 / 40) + 2 + Math.ceil((4 * 1024 * 1024) / 40));
  assert.equal(sum.denseFiles, 2);
  // Files named as minified stay out unless asked for.
  assert.equal(isExcludedPath('dist-free/app.min.js'), true);
  assert.equal(isExcludedPath('web/app.min.js', { countMinified: true }), false);
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

test('triage & remediation by how often projects are scanned: a share for each group, and projects left out by hand', async () => {
  const { trShares, sharesFull, weightedSeries, FREQUENCIES } = await import('../core/public/calculator/model.js');
  assert.equal(sharesFull(trShares({})), true);
  assert.equal(Object.keys(trShares({})).length, FREQUENCIES.length);
  // "Only the active projects" ticked before the table: the groups scanned less often count for nothing.
  const legacy = trShares({ activeOnly: true });
  assert.equal(legacy.month, 100);
  assert.equal(legacy['2-months'], 0);
  assert.equal(legacy.rare, 0);
  // A share set wins over the old tick; above 100 is 100, and something that is not a share (a negative) is as not set.
  assert.deepEqual([trShares({ activeOnly: true, shares: { rare: 40 } }).rare, trShares({ shares: { year: 250 } }).year, trShares({ shares: { year: -3 } }).year], [40, 100, 100]);
  assert.deepEqual(aheadSettings({ excluded: ['a', 'a', '', 7] }).excluded, ['a', '7']);
  const series = (n) => ({ totals: { weeks: ['w1', 'w2'], bySeverity: { Critical: [n, n * 2], High: [0, 0], Medium: [0, 0], Low: [0, 0] }, meta: { projects: n } }, fixed: { weeks: ['w1', 'w2'], bySeverity: { Critical: [1, 1], High: [0, 0], Medium: [0, 0], Low: [0, 0] }, meta: { projects: n } } });
  const mixed = weightedSeries([{ share: 100, series: series(10) }, { share: 50, series: series(4) }, { share: 0, series: series(99) }]);
  assert.deepEqual(mixed.totals.bySeverity.Critical, [12, 24]);
  assert.deepEqual(mixed.fixed.bySeverity.Critical, [1.5, 1.5]);
  assert.equal(mixed.totals.meta.projects, 14);
  assert.equal(weightedSeries([{ share: 0, series: series(1) }]), null);
});
