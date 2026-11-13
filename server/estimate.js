/**
 * An estimate of open findings for code that Checkmarx One has not scanned, from this installation's own accounts.
 * For Admins only, and internal: it is never in a report and never shown to anyone else.
 *
 * What an account read from Checkmarx One holds is its lines of code (its projects) and its open findings by
 * severity. Across those accounts that gives the findings per 1,000 lines of code: low, typical and high (the 25th,
 * 50th and 75th percentile). For code only counted (a cloc-fusion report, a git count), the lines times that density
 * is an estimate of the backlog a first scan would report, and the calculator's own triage & remediation sum gives
 * its credits.
 *
 * How far to trust it is measured, not assumed: each account is predicted from the others and compared with what it
 * really has (`backtest`). Codebases of one size differ widely, so it is a range, and it stands only until a scan.
 * Nothing of one customer is shown in another's estimate: only the figures across all of them are used.
 */
import { DEFAULT_TR, SEVERITIES, analyse, seriesRows, trProjection } from '../core/public/calculator/model.js';

/** An account needs this much code and this many findings to count (a pilot of three projects says little). */
export const MIN_LINES = 50_000;
/** Fewer accounts than this: no estimate is offered (a "typical" of two or three accounts is not one). */
export const MIN_ACCOUNTS = 8;

const linesOf = (p) => Number(p?.locOverride ?? p?.loc) || 0;

/**
 * What one account says: its lines of code and open findings, when it has both from Checkmarx One (a read, or a
 * report of one loaded into it). null when it cannot be used: no backlog, or too little code.
 */
export function accountFacts(account) {
  const projects = (account?.fusion?.projects ?? []).filter((p) => p?.source !== 'manual' && linesOf(p) > 0);
  const lines = projects.reduce((n, p) => n + linesOf(p), 0);
  const tr = account?.tr;
  if (lines < MIN_LINES || !tr?.totals || !tr?.fixed) return null;
  const { totalRows, fixedRows } = seriesRows(tr.totals, tr.fixed);
  const a = analyse(totalRows, fixedRows, tr.lookbackMonths);
  if (!a || !(a.total.current > 0)) return null;
  const open = Object.fromEntries(SEVERITIES.map((s) => [s, Math.max(0, Math.round(a.perSeverity[s]?.current ?? 0))]));
  const total = SEVERITIES.reduce((n, s) => n + open[s], 0);
  const per = (n) => (n / lines) * 1000;
  return {
    id: account.id,
    name: account.name,
    lines,
    projects: projects.length,
    open,
    total,
    density: per(total),
    densityBySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, per(open[s])])),
    // New findings a month, as a share of the backlog (how fast it grows before anything is fixed).
    addedPct: Number.isFinite(a.total.addedPct) && a.total.addedPct >= 0 ? a.total.addedPct : null,
    from: tr.totals.meta?.source === 'cxone' ? 'read' : 'report',
  };
}

/** The value at `q` (0 to 1) of a list of numbers, between the two nearest when it falls between. */
export function quantile(values, q) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (v.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return v[lo] + (v[hi] - v[lo]) * (at - lo);
}
const range = (values) => ({ low: quantile(values, 0.25), typical: quantile(values, 0.5), high: quantile(values, 0.75) });

/**
 * Across the accounts: findings per 1,000 lines (in all and by severity), new findings a month, and the back-test.
 * `enough` says whether there are accounts enough to estimate from.
 */
export function benchmark(facts) {
  const list = facts.filter(Boolean);
  // Each account predicted from the others' typical density, against what it really has.
  const backtest = list.length >= 3
    ? list.map((f) => {
        const others = list.filter((x) => x.id !== f.id).map((x) => x.density);
        const predicted = Math.round((quantile(others, 0.5) * f.lines) / 1000);
        return { id: f.id, name: f.name, lines: f.lines, actual: f.total, predicted, ratio: predicted > 0 ? f.total / predicted : null };
      })
    : [];
  const off = backtest.map((b) => (b.ratio > 0 ? Math.max(b.ratio, 1 / b.ratio) : Infinity));
  return {
    accounts: list.length,
    enough: list.length >= MIN_ACCOUNTS,
    minAccounts: MIN_ACCOUNTS,
    minLines: MIN_LINES,
    density: range(list.map((f) => f.density)),
    densityBySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, range(list.map((f) => f.densityBySeverity[s]))])),
    addedPct: range(list.map((f) => f.addedPct)),
    backtest,
    within2: backtest.length ? off.filter((x) => x <= 2).length : 0,
    within3: backtest.length ? off.filter((x) => x <= 3).length : 0,
    // How wide the spread really is: the largest miss, as a factor.
    worst: backtest.length ? Math.max(...off.filter(Number.isFinite), 1) : null,
  };
}

/**
 * The estimate for `lines` of code: low, typical and high, each with its backlog by severity, the new findings a
 * month, and the triage & remediation credits over `months` (the calculator's own sum, at the Admin's rates and the
 * usual plan: every finding triaged, the true ones remediated). `density` may be given by hand (per severity, per
 * 1,000 lines) in place of the accounts' own.
 */
export function estimate({ lines, months = 12, includeNew = true }, bench, { rates = {}, density = null } = {}) {
  const kloc = Math.max(0, Number(lines) || 0) / 1000;
  const grow = bench.addedPct?.typical ?? 0;
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const before = new Date(today);
  before.setUTCMonth(before.getUTCMonth() - 3);
  const out = {};
  for (const level of ['low', 'typical', 'high']) {
    const open = Object.fromEntries(SEVERITIES.map((s) => [s, Math.round(kloc * (Number(density?.[s]) >= 0 && density?.[s] !== '' && density?.[s] !== null && density?.[s] !== undefined ? Number(density[s]) : bench.densityBySeverity[s][level] ?? 0))]));
    const total = SEVERITIES.reduce((n, s) => n + open[s], 0);
    // The backlog three months ago, so that the calculator's own analysis finds the new findings a month in it.
    const monthly = (grow / 100) * total;
    const then = Object.fromEntries(SEVERITIES.map((s) => [s, Math.max(0, Math.round(open[s] - (total ? (open[s] / total) * monthly * 3 : 0)))]));
    const analysis = analyse([{ date: iso(before), ...then }, { date: iso(today), ...open }], [], 3);
    const plan = { ...DEFAULT_TR, ...rates, includeFuture: Boolean(includeNew) };
    const p = analysis ? trProjection(analysis, plan, { months }) : null;
    out[level] = {
      open,
      total,
      newMonthly: Math.round(analysis?.total?.arrivals ?? 0),
      credits: Math.round(p?.totals?.credits ?? 0),
      backlogCredits: Math.round(p?.totals?.backlogCredits ?? 0),
      aheadCredits: Math.round(p?.totals?.aheadCredits ?? 0),
    };
  }
  return { lines: Math.round(kloc * 1000), months, includeNew: Boolean(includeNew), byHand: Boolean(density), ...out };
}
