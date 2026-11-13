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

test('the estimate is the Admins’ alone, and says when the accounts are too few', async () => {
  const admin = await client(env.base, 'admin@t.example');
  const se1 = await client(env.base, 'se1@t.example');
  const lead = await client(env.base, 'lead@t.example').catch(() => null);
  assert.equal((await se1.get('/api/estimate')).status, 403);
  assert.equal((await se1.post('/api/estimate', { lines: 100000 })).status, 403);
  if (lead) assert.equal((await lead.get('/api/estimate')).status, 403);
  const seen = await admin.get('/api/estimate');
  assert.equal(seen.status, 200);
  assert.equal(seen.data.benchmark.enough, false);
  // Too few accounts: nothing is made up; the Admin's own figures still work.
  assert.equal((await admin.post('/api/estimate', { lines: 100000 })).status, 409);
  const own = await admin.post('/api/estimate', { lines: 100000, includeNew: false, density: { Critical: 0.1, High: 1, Medium: 2, Low: 3 } });
  assert.equal(own.status, 200);
  assert.equal(own.data.typical.total, 610);
  assert.equal(own.data.newLeftOut, false);
  // Asked for with the findings still to come: left out and said so, as their pace would come from too few accounts.
  const ahead = await admin.post('/api/estimate', { lines: 100000, density: { Critical: 0.1, High: 1, Medium: 2, Low: 3 } });
  assert.equal(ahead.data.newLeftOut, true);
  assert.equal(ahead.data.includeNew, false);
  assert.equal(ahead.data.typical.credits, own.data.typical.credits);
  assert.equal((await admin.post('/api/estimate', { lines: 10 })).status, 400);
  // Recorded, like every action.
  const { events } = (await admin.get('/api/audit?limit=20')).data;
  assert.ok(events.some((e) => e.action === 'estimate.run'));
  void sfLink;
});
