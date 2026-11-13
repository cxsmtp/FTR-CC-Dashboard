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

/** The industries an account can be in (its SE picks it in the calculator; an Admin on the estimate's page). */
export const INDUSTRIES = ['Banking & financial services', 'Insurance', 'Telecom', 'Technology & software', 'Retail & e-commerce', 'Healthcare & life sciences', 'Manufacturing & automotive', 'Energy & utilities', 'Government & public sector', 'Media & entertainment', 'Transport & logistics', 'Other'];
export const cleanIndustry = (value) => (INDUSTRIES.includes(String(value ?? '')) ? String(value) : '');
/** An industry's own figures count from this many of its accounts; with fewer, an Admin's typed standard, or none. */
export const MIN_INDUSTRY = 5;

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
    industry: cleanIndustry(account.industry),
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
export function estimate({ lines, months = 12, includeNew = true, activeShare = null }, bench, { rates = {}, density = null } = {}) {
  const kloc = Math.max(0, Number(lines) || 0) / 1000;
  // New findings come from code that changes: counted on the share of the lines in repositories with commits in the
  // last year (all of them when that is not known).
  const alive = activeShare === null || activeShare === undefined ? 1 : Math.min(1, Math.max(0, Number(activeShare) || 0));
  const grow = (bench.addedPct?.typical ?? 0) * alive;
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
  return { lines: Math.round(kloc * 1000), months, includeNew: Boolean(includeNew), byHand: Boolean(density), activeShare: activeShare === null || activeShare === undefined ? null : alive, ...out };
}

/**
 * What code that was only counted says (a git count, a cloc-fusion report): its lines, and how alive it is.
 *   lines        code lines counted, in the repositories included
 *   commits      commits a year on the default branches (as measured over each repository's window)
 *   developers   people who committed in the last 90 days (the most any one count saw; counts are not added up, as
 *                one person may work in several repositories)
 *   activeShare  the share of the lines that sit in repositories changed in the last year (0 to 1; null when no
 *                repository says how often it changes): new findings come from code that changes, so the findings
 *                still to come are counted on this share only.
 * `linesOf(project)` gives a repository's code lines (the calculator's own count).
 */
export function codeFacts(account, linesOf) {
  const own = account?.fusionNew ?? {};
  const projects = (own.projects ?? []).filter((p) => p?.included !== false);
  let lines = 0;
  let known = 0;
  let active = 0;
  let commits = 0;
  let developers = 0;
  for (const p of projects) {
    const n = Number(linesOf(p, own.leftOut)) || 0;
    lines += n;
    const a = p.activity;
    const c = Number(a?.commits);
    const days = Number(a?.windowDays) || 365;
    if (Number.isFinite(c) && c >= 0) {
      known += n;
      if (c > 0) active += n;
      commits += Math.round((c * 365) / days);
    }
    developers = Math.max(developers, Number(a?.devs90) || 0);
  }
  return { lines, repositories: projects.length, commits, developers, activeShare: known > 0 ? active / known : null };
}

/** A benchmark as it is kept when frozen: its figures only (no account's name or numbers). */
export const figuresOf = (b) => ({ accounts: b.accounts, density: b.density, densityBySeverity: b.densityBySeverity, addedPct: b.addedPct, within2: b.within2, within3: b.within3, tested: b.backtest?.length ?? b.tested ?? 0 });

/** The figures across all accounts and for each industry with accounts in it. */
export function benchmarks(facts) {
  const list = facts.filter(Boolean);
  const industries = {};
  for (const name of INDUSTRIES) {
    const of = list.filter((f) => f.industry === name);
    if (of.length) industries[name] = benchmark(of);
  }
  return { all: benchmark(list), industries };
}

/**
 * The two sets of figures an estimate for `industry` is made from, out of `state`:
 *   state.live       benchmarks(facts) as the accounts stand now
 *   state.frozen     { at, by, all, industries } kept by an Admin (figuresOf each), or null: used instead of live
 *   state.standards  { industry: { Critical, High, Medium, Low } } typed by an Admin (findings per 1,000 lines)
 * Returns { own, standard }: `own` from every account; `standard` for the industry, from the Admin's typed standard
 * first, else that industry's own accounts when there are MIN_INDUSTRY of them; null when there is neither.
 */
export function figuresFor(industry, state) {
  const from = state.frozen ?? { all: figuresOf(state.live.all), industries: Object.fromEntries(Object.entries(state.live.industries).map(([k, v]) => [k, figuresOf(v)])) };
  const own = { ...from.all, enough: from.all.accounts >= MIN_ACCOUNTS, source: 'accounts' };
  const name = cleanIndustry(industry);
  const typed = name ? state.standards?.[name] : null;
  const hasTyped = typed && SEVERITIES.some((s) => Number(typed[s]) > 0);
  let standard = null;
  if (hasTyped) {
    const one = (s) => ({ low: Number(typed[s]) || 0, typical: Number(typed[s]) || 0, high: Number(typed[s]) || 0 });
    standard = { accounts: 0, densityBySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, one(s)])), addedPct: from.all.addedPct, enough: true, source: 'typed', industry: name };
  } else if (name && from.industries?.[name]?.accounts >= MIN_INDUSTRY) {
    standard = { ...from.industries[name], enough: true, source: 'industry', industry: name };
  }
  return { own, standard, frozenAt: state.frozen?.at ?? null };
}
