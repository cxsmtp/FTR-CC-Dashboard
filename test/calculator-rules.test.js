import { test } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

import { ACTIVE_LEVELS, activeEnough, aheadSettings, newCustomerEstimate, newCustomerSettings, parseClocFusionReport, repoKey } from '../core/public/calculator/model.js';
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

test('a cloc-fusion report is read in every format it is written in: JSON, HTML, CSV and Markdown', () => {
  const read = (ext) => parseClocFusionReport(fs.readFileSync(new URL(`./fixtures/cloc-fusion/cloc-fusion-report.${ext}`, import.meta.url), 'utf8'), `cloc-fusion-report.${ext}`, {});
  const json = read('json');
  assert.equal(json.projects.length, 3);
  assert.equal(json.skipped, 2);
  assert.deepEqual(json.projects[0].langs, { Python: 119800, YAML: 200 });
  for (const ext of ['html', 'csv', 'md']) {
    const r = read(ext);
    assert.equal(r.skipped, 2, ext);
    // The same repositories, lines (as one figure), commits, change frequency and developers as the JSON says.
    assert.deepEqual(r.projects.map((p) => [p.fullName, p.locOverride, p.activity.commits, p.activity.frequency, p.activity.devs90]), [['acme/payments-api', 120000, 420, 'more-5-week', 2], ['acme/web, the "site"', 45500, 30, '2-weeks', 2], ['acme/a|b_c', 9000, 2, '6-months', 1]], ext);
    assert.deepEqual(r.projects.map((p) => p.activity.frequency), json.projects.map((p) => p.activity.frequency), ext);
  }
  assert.equal(read('html').version, '1.4.1');
  assert.equal(read('md').version, '1.4.1');
  assert.equal(read('html').developers, 3);
  // Its list of contributors is not a report, and neither is any other file.
  assert.throws(() => parseClocFusionReport(fs.readFileSync(new URL('./fixtures/cloc-fusion/cloc-fusion-contributors.csv', import.meta.url), 'utf8'), 'c.csv', {}), /not a cloc-fusion report/);
  assert.throws(() => parseClocFusionReport('<html><body>hello</body></html>', 'x.html', {}), /not a cloc-fusion report/);
});

test('a report loaded into the calculator gives back the backlog, the plan and Fusion as the report had them', async () => {
  const { analyse, seriesRows, trProjection, fusionEstimate, SEVERITIES } = await import('../core/public/calculator/model.js');
  const { leverInputs } = await import('../core/public/calculator/levers.js');
  const { profileFromReport } = await import('../server/customer-version.js');
  const { cleanTr, cleanFusion } = await import('../core/public/calculator/profiles.js');
  // Twenty weeks of a backlog that grows, with fixes along the way.
  const weeks = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 4, 4 + i * 7)).toISOString().slice(0, 10));
  const grow = (start, step) => weeks.map((_, i) => start + i * step);
  const totals = { weeks, bySeverity: { Critical: grow(400, 12), High: grow(900, 25), Medium: grow(3000, 40), Low: grow(50, 1) } };
  const fixed = { weeks, bySeverity: { Critical: weeks.map(() => 3), High: weeks.map(() => 8), Medium: weeks.map(() => 0), Low: weeks.map((_, i) => i % 3) } };
  const { totalRows, fixedRows } = seriesRows(totals, fixed);
  const analysis = analyse(totalRows, fixedRows, 3);
  const plan = { selected: { Critical: null, High: 500, Medium: 0, Low: 0 }, fpPercent: { Critical: 20, High: 30, Medium: 30, Low: 30 }, includeFuture: true, aiDeclinePercent: 10, newPacePercent: 80, fusionUpliftPercent: 5 };
  const settings = { models: [{ id: 'm1', name: 'haiku', creditsPer10k: 1 }], defaultModel: 'm1', periodMonths: 12 };
  const projects = [{ id: 'a', name: 'payments', loc: 250000, frequency: '1-5-week' }, { id: 'b', name: 'web', loc: 42000, frequency: 'month', scansOverride: 9 }];
  const inputs = leverInputs({ analysis, plan, months: 12, fusionOn: true, fusion: { settings, projects }, totals: { extraPercent: 10, bundleCredits: 10000 } });
  const patch = profileFromReport({ inputs, base: { generatedAt: '2026-09-20T10:00:00.000Z' } });
  // The backlog worked out again from what was loaded.
  const tr = cleanTr(patch.tr);
  const again = seriesRows(tr.totals, tr.fixed);
  const back = analyse(again.totalRows, again.fixedRows, tr.lookbackMonths);
  for (const s of SEVERITIES) {
    for (const k of ['current', 'prior', 'fixed']) assert.equal(back.perSeverity[s][k], analysis.perSeverity[s][k], `${s} ${k}`);
    assert.ok(Math.abs(back.perSeverity[s].arrivals - analysis.perSeverity[s].arrivals) < 1e-9, `${s} arrivals`);
  }
  const one = trProjection(analysis, plan, { months: 12, fusion: true });
  const two = trProjection(back, tr, { months: 12, fusion: true });
  assert.ok(Math.abs(one.totals.credits - two.totals.credits) < 1e-6);
  // Fusion: the same projects, scans and credits.
  const f = cleanFusion(patch.fusion);
  assert.equal(fusionEstimate(f.projects, f).totals.credits, fusionEstimate(projects, settings).totals.credits);
  assert.equal(f.projects.find((p) => p.name === 'web').scansOverride, 9);
  assert.equal(patch.totals.extraPercent, 10);
});

test('a report from an earlier version (figures on its page only) is read back into the calculator', async () => {
  const { readOldReport, isOldReport } = await import('../server/old-report.js');
  const { customerFigures, profileFromReport } = await import('../server/customer-version.js');
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const page = `<!doctype html><html><head><title>Example Co: Checkmarx credits projection</title></head><body>
    <h1>Example Co: credits projection</h1><p>Made 10/14/2026, 1:01:02 PM by Pat Example</p>
    <p>Total credits required 30,000</p><p>3 bundles of 10,000 credits · over 12 months</p><h2>How we got there</h2>
    <p>Read live from Checkmarx One on October 14, 2026: 3 projects, 40 scans, 600 open vulnerabilities.</p>
    <p>The trend is measured over the last 3 months of that data, week by week, and carried forward.</p>
    <p>Backlog as of October 14, 2026, against July 15, 2026.</p>
    <table>${row(['By severity', 'Critical', 'High', 'Medium', 'Low', 'Total'])}${row(['Current backlog', '100', '200', '300', '0', '600'])}${row(['Added a month', '10', '20', '0', '0', '30'])}${row(['Fixed a month', '5', '5', '0', '0', '10'])}${row(['Backlog to triage', '100', '200', '0', '0', '300'])}${row(['Still to come', '0', '0', '0', '0', '0'])}${row(['Credits per triage', '1', '1', '1', '1', '—'])}${row(['False positives (estimated)', '30%', '30%', '30%', '30%', '—'])}${row(['Credits per remediation', '3', '3', '3', '3', '—'])}${row(['Credits', '310', '620', '0', '0', '930'])}</table>
    <table>${row(['Model', 'Credits per 10K LOC', 'Projects', '10K units × scans', 'Credits'])}${row(['haiku', '1', '2', '29', '29'])}</table>
    <table>${row(['Scanned today', 'Projects', 'Fusion scans per project', 'Model', '10K units', 'Credits'])}${row(['About once a month', '2', '6', 'haiku', '5', '30'])}</table>
    <table>${row(['Project', 'Criticality', 'Scanned today', 'Lines of code', '10K units', 'Fusion scans', 'Set by', 'Model', 'Credits'])}${row(['payments', '3', 'About once a month (0.3/week)', '25,000', '3', '6', 'Scan frequency', 'haiku', '18'])}${row(['web', '—', 'About once a month (0.2/week)', '12,000', '2', '9', 'This project', 'haiku', '18'])}</table>
  </body></html>`;
  assert.equal(isOldReport(page), true);
  assert.equal(isOldReport(page.replace('<body>', '<body><script type="application/json" id="cx-live">{}</script>')), false);
  const live = readOldReport(page);
  assert.equal(live.base.customer, 'Example Co');
  assert.equal(live.base.preparedBy, 'Pat Example');
  assert.equal(live.sentTotal, 30000);
  const a = live.inputs.tr.analysis;
  assert.deepEqual(SEV_CURRENT(a), [100, 200, 300, 0]);
  assert.equal(live.inputs.tr.plan.selected.Medium, 0);
  const p = live.inputs.fusion.projects;
  assert.deepEqual(p.map((x) => [x.name, x.loc, x.frequency, x.scansOverride ?? null]), [['payments', 25000, 'month', null], ['web', 12000, 'month', 9]]);
  const fig = customerFigures(live);
  assert.equal(fig.data.fusion.totals.credits, 3 * 6 + 2 * 9);
  const patch = profileFromReport(live, { useSent: true });
  assert.ok(patch.tr.totals.weeks.length >= 2);
  assert.equal(patch.fusion.projects.length, 2);
  assert.throws(() => readOldReport('<html><body>hello</body></html>'), /not a projection report/);
});
const SEV_CURRENT = (a) => ['Critical', 'High', 'Medium', 'Low'].map((s) => a.perSeverity[s].current);

test('triage & remediation in the total: the scan first, else the estimate counted (beta), else none', async () => {
  const { trCreditsOf, creditSummary } = await import('../core/public/calculator/model.js');
  assert.equal(trCreditsOf({ tr: { totals: { credits: 120 } }, estimateTotal: { credits: 900 } }), 120);
  assert.equal(trCreditsOf({ estimateTotal: { credits: 900 } }), 900);
  assert.equal(trCreditsOf({ estimateTotal: { credits: 0 } }), null);
  assert.equal(trCreditsOf({}), null);
  assert.equal(creditSummary(trCreditsOf({ estimateTotal: { credits: 900 } }), 100, { extraPercent: 10 }).total, 1100);
});
