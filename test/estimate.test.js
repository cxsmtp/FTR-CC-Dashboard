import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { MIN_ACCOUNTS, accountFacts, benchmark, estimate, quantile } from '../server/estimate.js';
import { client, sfLink, start } from './helpers.js';

// An account as the calculator keeps it: its projects' lines and its backlog three months apart.
const account = (id, lines, open, { then = null, manual = false } = {}) => ({
  id,
  name: `Account ${id}`,
  fusion: { projects: [{ id: 'p1', loc: lines, source: manual ? 'manual' : 'scan' }] },
  tr: {
    lookbackMonths: 3,
    totals: { weeks: ['2026-08-13', '2026-11-13'], bySeverity: Object.fromEntries(['Critical', 'High', 'Medium', 'Low'].map((s, i) => [s, [Math.round(((then ?? open) * [0.1, 0.3, 0.3, 0.3][i])), Math.round(open * [0.1, 0.3, 0.3, 0.3][i])]])), meta: { source: 'cxone' } },
    fixed: { weeks: ['2026-11-13'], bySeverity: { Critical: [0], High: [0], Medium: [0], Low: [0] } },
  },
});

test('an account says its findings per 1,000 lines; too little code, no backlog or typed projects say nothing', () => {
  const f = accountFacts(account('a', 1_000_000, 2000, { then: 1700 }));
  assert.equal(f.lines, 1_000_000);
  assert.equal(f.total, 2000);
  assert.equal(f.density, 2);
  assert.equal(f.open.High, 600);
  assert.ok(f.addedPct > 0);
  assert.equal(accountFacts(account('b', 10_000, 500)), null);
  assert.equal(accountFacts(account('c', 1_000_000, 2000, { manual: true })), null);
  assert.equal(accountFacts({ id: 'd', name: 'D', fusion: { projects: [{ loc: 900000, source: 'scan' }] } }), null);
});

test('the range across accounts, and each account tested against the others', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(quantile([], 0.5), null);
  // Densities 1 to 10 per 1,000 lines.
  const facts = Array.from({ length: 10 }, (_, i) => accountFacts(account(`a${i}`, 1_000_000, (i + 1) * 1000)));
  const b = benchmark(facts);
  assert.equal(b.accounts, 10);
  assert.equal(b.enough, true);
  assert.equal(b.density.typical, 5.5);
  assert.equal(b.backtest.length, 10);
  // The middle ones are predicted well, the ends are not: said as they are.
  assert.ok(b.within2 >= 6 && b.within2 < 10);
  assert.ok(b.worst > 3);
  assert.equal(benchmark(facts.slice(0, 2)).enough, false);
  assert.equal(benchmark(facts.slice(0, 2)).backtest.length, 0);
});

test('the estimate: lines times the accounts’ density, with the calculator’s own triage and remediation sum', () => {
  const facts = Array.from({ length: MIN_ACCOUNTS }, (_, i) => accountFacts(account(`a${i}`, 1_000_000, 2000, { then: 2000 })));
  const b = benchmark(facts);
  const e = estimate({ lines: 500_000, months: 12, includeNew: false }, b);
  assert.equal(e.typical.total, 1000);
  assert.equal(e.low.total, 1000);
  assert.equal(e.typical.open.Critical, 100);
  // 1,000 findings triaged at 1 credit, 70% true (30% false positives) remediated at 3: 1,000 + 2,100.
  assert.equal(e.typical.credits, 3100);
  // The Admin's own rates are used.
  assert.equal(estimate({ lines: 500_000, includeNew: false }, b, { rates: { triageCost: { Critical: 2, High: 2, Medium: 2, Low: 2 }, remediationCost: { Critical: 3, High: 3, Medium: 3, Low: 3 } } }).typical.credits, 4100);
  // By hand: the Admin's own findings per 1,000 lines.
  const own = estimate({ lines: 500_000, includeNew: false }, b, { density: { Critical: 1, High: 1, Medium: 1, Low: 1 } });
  assert.equal(own.typical.total, 2000);
  assert.equal(own.byHand, true);
});

let env;
before(async () => {
  env = await start();
});
after(() => env.close());

test('the estimate is the Admins’ alone; too few accounts says so; figures typed for a run or for an industry still work', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const se1 = await client(env.base, 'se1@t.example');
  assert.equal((await se1.get('/api/estimate')).status, 403);
  assert.equal((await se1.post('/api/estimate', { lines: 100000 })).status, 403);
  assert.equal((await se1.put('/api/estimate/settings', { beta: { calculator: true } })).status, 403);
  const seen = await admin.get('/api/estimate');
  assert.equal(seen.status, 200);
  assert.equal(seen.data.benchmark.enough, false);
  assert.ok(seen.data.industries.includes('Insurance'));
  // Too few accounts: nothing is made up, and nothing can be frozen.
  assert.equal((await admin.post('/api/estimate', { lines: 100000 })).status, 409);
  assert.equal((await admin.put('/api/estimate/settings', { freeze: true })).status, 409);
  // Figures typed for this one run.
  const own = await admin.post('/api/estimate', { lines: 100000, includeNew: false, density: { Critical: 0.1, High: 1, Medium: 2, Low: 3 } });
  assert.equal(own.status, 200);
  assert.equal(own.data.typed.typical.total, 610);
  assert.equal(own.data.own, null);
  // A standard typed for an industry: that industry's estimate is made from it.
  assert.equal((await admin.put('/api/estimate/settings', { standards: { Nonsense: { High: 1 } } })).status, 400);
  assert.equal((await admin.put('/api/estimate/settings', { standards: { Insurance: { Critical: 0.1, High: 0.4, Medium: 0.5, Low: 1 } } })).status, 200);
  const ins = await admin.post('/api/estimate', { lines: 1_000_000, industry: 'Insurance' });
  assert.equal(ins.status, 200);
  assert.equal(ins.data.standard.typical.total, 2000);
  assert.equal(ins.data.standard.source, 'typed');
  assert.equal(ins.data.own, null);
  assert.equal((await admin.post('/api/estimate', { lines: 10 })).status, 400);
  // Recorded, like every action.
  const { events } = (await admin.get('/api/audit?limit=30')).data;
  assert.ok(events.some((e) => e.action === 'estimate.run'));
  assert.ok(events.some((e) => e.action === 'estimate.settings'));
});

test('in the calculator (beta): off until an Admin turns it on; the SE picks the industry; kept with the account', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const se1 = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const made = await se1.post('/api/projections', { name: 'Fusion Only Insurance', salesforceUrl: sfLink() }, h);
  const id = made.data.customer.id;
  // Its code, counted from git: two repositories, one of them not touched in a year.
  const projects = [
    { id: 'r1', name: 'core', included: true, langs: { Java: 900_000 }, activity: { commits: 500, windowDays: 365, devs90: 12, frequency: 'more-5-week' }, git: { host: 'github.com' } },
    { id: 'r2', name: 'legacy', included: true, langs: { Java: 100_000 }, activity: { commits: 0, windowDays: 365, devs90: 0, frequency: 'rare' }, git: { host: 'github.com' } },
  ];
  assert.equal((await se1.put(`/api/projections/${id}`, { fusionNew: { projects } }, h)).status, 200);
  // Not turned on: not there.
  assert.equal((await se1.post('/api/projections/estimate', { accountId: id, industry: 'Insurance' }, h)).status, 404);
  assert.equal((await se1.get('/api/cc/calc-config')).data.estimate.calculator, false);
  // In a report only where it is in the calculator.
  await admin.put('/api/estimate/settings', { beta: { calculator: false, report: true } });
  assert.equal((await se1.get('/api/cc/calc-config')).data.estimate.report, false);
  assert.equal((await admin.put('/api/estimate/settings', { beta: { calculator: true, report: true } })).status, 200);
  assert.deepEqual({ ...(await se1.get('/api/cc/calc-config')).data.estimate, industries: undefined }, { calculator: true, report: true, total: false, industries: undefined });
  assert.equal((await se1.post('/api/projections/estimate', { accountId: id }, h)).status, 400);
  const got = await se1.post('/api/projections/estimate', { accountId: id, industry: 'Insurance', priorSast: false, include: true }, h);
  assert.equal(got.status, 200, JSON.stringify(got.data));
  const e = got.data.estimate;
  assert.equal(e.code.lines, 1_000_000);
  assert.equal(e.code.repositories, 2);
  assert.equal(e.code.commits, 500);
  assert.equal(e.code.developers, 12);
  assert.equal(e.code.activeShare, 0.9);
  assert.equal(e.quote, 'high');
  assert.equal(e.include, true);
  // The standard typed for Insurance in the test before: 2 findings per 1,000 lines.
  assert.equal(e.standard.typical.total, 2000);
  assert.equal(e.own, null);
  // Kept with the account (its industry too), and given to the calculator with it.
  const again = (await se1.get(`/api/projections/${id}`, h)).data.customer;
  assert.equal(again.estimate.industry, 'Insurance');
  assert.equal((await admin.get('/api/accounts')).data.accounts.find((a) => a.id === id).industry, 'Insurance');
  // Another team's SE cannot make one for it.
  const apac = await client(env.base, 'apac@t.example');
  assert.equal((await apac.post('/api/projections/estimate', { accountId: id, industry: 'Insurance' }, { 'X-Team': env.teams.apac.id })).status, 404);
  // Taken out of reports by the Admin: the account's estimate no longer says to include it.
  await admin.put('/api/estimate/settings', { beta: { report: false } });
  assert.equal((await se1.get(`/api/projections/${id}`, h)).data.customer.estimate.include, false);
  assert.equal((await se1.post('/api/projections/estimate', { accountId: id, remove: true }, h)).data.estimate, null);
});

test('in the total (beta): an Admin turns it on; from all accounts until the industry is chosen; refused while off', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const se1 = await client(env.base, 'se1@t.example');
  const h = { 'X-Team': env.teams.emea.id };
  const made = await se1.post('/api/projections', { name: 'Counted Only Co', salesforceUrl: sfLink() }, h);
  const id = made.data.customer.id;
  const projects = [{ id: 'r1', name: 'core', included: true, langs: { Java: 500_000 }, activity: { commits: 100, windowDays: 365, devs90: 4, frequency: 'more-5-week' }, git: { host: 'github.com' } }];
  assert.equal((await se1.put(`/api/projections/${id}`, { fusionNew: { projects } }, h)).status, 200);
  // Only with the calculator's estimate on, and only by an Admin.
  assert.equal((await se1.put('/api/estimate/settings', { beta: { total: true } })).status, 403);
  await admin.put('/api/estimate/settings', { beta: { calculator: false, total: true } });
  assert.equal((await se1.get('/api/cc/calc-config')).data.estimate.total, false);
  assert.equal((await admin.put('/api/estimate/settings', { beta: { calculator: true, total: true } })).status, 200);
  assert.equal((await se1.get('/api/cc/calc-config')).data.estimate.total, true);
  // No industry chosen: from all accounts, and there are too few yet: said so, nothing made up.
  const none = await se1.post('/api/projections/estimate', { accountId: id, auto: true }, h);
  assert.equal(none.status, 409);
  assert.match(none.data.error, /choose the customer’s industry/);
  // The industry chosen: its standard.
  const ins = await se1.post('/api/projections/estimate', { accountId: id, industry: 'Insurance' }, h);
  assert.equal(ins.status, 200, JSON.stringify(ins.data));
  const credits = ins.data.estimate.standard.typical.credits;
  assert.ok(credits > 0);
  // A report with the estimate in its total: Overview and Accounts count it as its headline does.
  const data = { fusionNew: { totals: { credits: 1000 } }, estimateTotal: { credits, from: 'industry', industry: 'Insurance' } };
  const rep = await se1.post('/api/projections/reports', { customerId: id, data }, h);
  assert.equal(rep.status, 200, JSON.stringify(rep.data));
  assert.equal(rep.data.report.totalCredits, 1000 + credits);
  assert.equal(rep.data.report.trCredits, credits);
  assert.equal(rep.data.report.trEstimated, true);
  // A scanned backlog always wins over an estimate.
  const scanned = await se1.post('/api/projections/reports', { customerId: id, data: { ...data, tr: { totals: { credits: 50 } } } }, h);
  assert.equal(scanned.data.report.totalCredits, 1050);
  assert.equal(scanned.data.report.trEstimated, false);
  // Turned off: a report sent with an estimate does not count it.
  await admin.put('/api/estimate/settings', { beta: { total: false } });
  const off = await se1.post('/api/projections/reports', { customerId: id, data }, h);
  assert.equal(off.data.report.totalCredits, 1000);
  assert.equal(off.data.report.trCredits, null);
  // And without the total, an estimate needs the industry again.
  assert.equal((await se1.post('/api/projections/estimate', { accountId: id }, h)).status, 400);
  const { events } = (await admin.get('/api/audit?limit=40')).data;
  assert.ok(events.some((e) => e.action === 'estimate.settings' && /in the total on/.test(e.target)));
});

test('figures frozen stay as they were when accounts change; an industry counts from five accounts', async () => {
  const { MIN_INDUSTRY, benchmarks, figuresFor, figuresOf, codeFacts } = await import('../server/estimate.js');
  const f = (i, density, industry) => ({ ...accountFacts(account(`a${i}`, 1_000_000, density * 1000)), industry });
  const first = [...Array.from({ length: 6 }, (_, i) => f(i, 2, 'Insurance')), ...Array.from({ length: 4 }, (_, i) => f(10 + i, 6, 'Telecom'))];
  const live = benchmarks(first);
  assert.equal(live.all.accounts, 10);
  assert.equal(live.industries.Insurance.accounts, 6);
  // Insurance has its five accounts: its own figures. Telecom (four) has none.
  assert.equal(figuresFor('Insurance', { live }).standard.density.typical, 2);
  assert.equal(figuresFor('Insurance', { live }).standard.source, 'industry');
  assert.equal(figuresFor('Telecom', { live }).standard, null);
  assert.ok(MIN_INDUSTRY > 4);
  // A typed standard comes first.
  assert.equal(figuresFor('Telecom', { live, standards: { Telecom: { Critical: 0, High: 1, Medium: 1, Low: 1 } } }).standard.source, 'typed');
  // Frozen: later accounts change nothing until it is worked out again.
  const frozen = { at: '2026-11-13T00:00:00.000Z', by: 'Admin', all: figuresOf(live.all), industries: Object.fromEntries(Object.entries(live.industries).map(([k, v]) => [k, figuresOf(v)])) };
  const later = benchmarks([...first, ...Array.from({ length: 10 }, (_, i) => f(20 + i, 50, 'Insurance'))]);
  assert.notEqual(later.all.density.typical, live.all.density.typical);
  assert.equal(figuresFor('Insurance', { live: later, frozen }).own.density.typical, live.all.density.typical);
  assert.equal(figuresFor('Insurance', { live: later, frozen }).frozenAt, frozen.at);
  // New findings only on the code that changes.
  const whole = estimate({ lines: 1_000_000, includeNew: true }, { ...figuresOf(live.all), addedPct: { typical: 5 } });
  const half = estimate({ lines: 1_000_000, includeNew: true, activeShare: 0.5 }, { ...figuresOf(live.all), addedPct: { typical: 5 } });
  assert.ok(half.typical.newMonthly > 0 && half.typical.newMonthly < whole.typical.newMonthly);
  assert.equal(half.typical.total, whole.typical.total);
  assert.equal(codeFacts({ fusionNew: { projects: [] } }, () => 0).activeShare, null);
});
