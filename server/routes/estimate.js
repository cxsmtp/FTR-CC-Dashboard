import { clocLines } from '../../core/public/calculator/model.js';
import { INDUSTRIES, MIN_ACCOUNTS, MIN_INDUSTRY, accountFacts, benchmarks, cleanIndustry, codeFacts, estimate, figuresFor, figuresOf } from '../estimate.js';
import { fail } from '../store.js';

const SEVS = ['Critical', 'High', 'Medium', 'Low'];

/**
 * The vulnerability estimate (server/estimate.js): findings and triage & remediation credits for code that has only
 * been counted, from this installation's own accounts.
 *   - The Admins' page (Settings → Pricing): what the accounts say, each account's industry, the figures frozen or
 *     worked out again, a standard typed for an industry, and whether SEs get it in the calculator and in reports.
 *   - In the calculator (beta, when an Admin turns it on): an SE picks the industry of a Fusion-only account and gets
 *     the estimate from all accounts and the industry's standard; kept with the account, and put in its report when
 *     the Admin allows that too. Only figures across accounts are used: nothing of one customer shows in another's.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers).
 */
export function registerEstimate(d) {
  const { accounts, calcTeam, r, ready2, record, settings, trRates } = d;
  const adminOnly = (req, ctx) => {
    ready2(req, ctx);
    if (ctx.user.role !== 'admin') throw fail(403, 'The estimate is for Admins.');
  };
  /** What the Admin set: figures frozen (or null), a standard typed for an industry, and where the estimate shows. */
  const kept = () => {
    const e = settings.value.estimate ?? {};
    const calculator = e.beta?.calculator === true;
    // In the total: off until an Admin turns it on (beta), and only where the calculator has the estimate.
    return { frozen: e.frozen ?? null, standards: e.standards ?? {}, beta: { calculator, report: e.beta?.report === true, total: calculator && e.beta?.total === true } };
  };
  // What the accounts say, worked out again at most once a minute (every account's file is read for it).
  let cache = null;
  const live = () => {
    if (cache && Date.now() - cache.at < 60_000) return cache;
    const all = [];
    const counted = [];
    for (const meta of accounts.accounts.list()) {
      if (meta.pendingSince) continue;
      let account;
      try {
        account = accounts.accounts.get(meta.id);
      } catch {
        continue;
      }
      if (!account) continue;
      const f = accountFacts(account);
      if (f) all.push(f);
      // Code that was only counted (git, a cloc-fusion report): what an estimate is made for.
      const code = codeFacts(account, clocLines);
      if (code.lines > 0) counted.push({ id: account.id, name: account.name, industry: cleanIndustry(account.industry), ...code, scanned: Boolean(f) });
    }
    cache = { at: Date.now(), all, counted: counted.sort((a, b) => a.name.localeCompare(b.name)), bench: benchmarks(all) };
    return cache;
  };
  const stateNow = () => ({ live: live().bench, ...kept() });

  /** Both estimates for some code: from every account, and the industry's standard (null where there is none). */
  const both = ({ lines, months, includeNew, activeShare, industry }) => {
    const { own, standard, frozenAt } = figuresFor(industry, stateNow());
    const run = (figures) => estimate({ lines, months, includeNew: includeNew && figures.addedPct?.typical !== null, activeShare }, figures, { rates: trRates() });
    return {
      own: own.enough ? { ...run(own), accounts: own.accounts } : null,
      standard: standard ? { ...run(standard), accounts: standard.accounts, source: standard.source } : null,
      industry: cleanIndustry(industry),
      frozenAt,
      needed: MIN_ACCOUNTS,
      have: own.accounts,
    };
  };

  r('GET', '/api/estimate', adminOnly, () => {
    const { all, counted, bench } = live();
    const k = kept();
    return {
      benchmark: bench.all,
      accounts: all.map((f) => ({ id: f.id, name: f.name, industry: f.industry, lines: f.lines, projects: f.projects, total: f.total, open: f.open, density: f.density, addedPct: f.addedPct, from: f.from })).sort((a, b) => b.density - a.density),
      counted,
      industries: INDUSTRIES,
      minIndustry: MIN_INDUSTRY,
      byIndustry: INDUSTRIES.map((name) => {
        const b = bench.industries[name];
        const typed = k.standards[name] ?? null;
        return { name, accounts: b?.accounts ?? 0, density: b?.density ?? null, densityBySeverity: b?.densityBySeverity ?? null, enough: (b?.accounts ?? 0) >= MIN_INDUSTRY, typed };
      }),
      frozen: k.frozen,
      beta: k.beta,
      rates: trRates(),
    };
  });

  /** Freeze the figures (or work them out from the accounts again), type a standard for an industry, turn the beta on. */
  r('PUT', '/api/estimate/settings', adminOnly, (req, ctx, body) => {
    const e = { ...(settings.value.estimate ?? {}) };
    const said = [];
    if (body?.freeze === true) {
      cache = null;
      const b = live().bench;
      if (b.all.accounts < MIN_ACCOUNTS) throw fail(409, `Figures can be frozen once ${MIN_ACCOUNTS} accounts feed them (there are ${b.all.accounts}).`);
      e.frozen = { at: new Date().toISOString(), by: ctx.user.name, all: figuresOf(b.all), industries: Object.fromEntries(Object.entries(b.industries).map(([k, v]) => [k, figuresOf(v)])) };
      said.push(`frozen at ${e.frozen.all.accounts} accounts`);
    } else if (body?.freeze === false) {
      e.frozen = null;
      said.push('follows the accounts again');
    }
    if (body?.standards && typeof body.standards === 'object') {
      const next = { ...(e.standards ?? {}) };
      for (const [name, v] of Object.entries(body.standards)) {
        if (!cleanIndustry(name)) throw fail(400, 'Choose an industry of the list.');
        const one = Object.fromEntries(SEVS.map((s) => [s, v?.[s] === '' || v?.[s] === null || v?.[s] === undefined ? null : Number(v[s])]));
        if (SEVS.some((s) => one[s] !== null && !(one[s] >= 0 && one[s] <= 1000))) throw fail(400, 'Findings per 1,000 lines: a number from 0 to 1,000 for each severity, or empty.');
        if (SEVS.every((s) => one[s] === null)) delete next[name];
        else next[name] = Object.fromEntries(SEVS.map((s) => [s, one[s] ?? 0]));
        said.push(`standard for ${name}`);
      }
      e.standards = next;
    }
    if (body?.beta && typeof body.beta === 'object') {
      const was = kept().beta;
      const calculator = body.beta.calculator === undefined ? was.calculator : body.beta.calculator === true;
      // In a report only where it is in the calculator: that is where it is made.
      const report = calculator && (body.beta.report === undefined ? was.report : body.beta.report === true);
      const total = calculator && (body.beta.total === undefined ? was.total : body.beta.total === true);
      e.beta = { calculator, report, total };
      said.push(`in the calculator ${calculator ? 'on' : 'off'}, in reports ${report ? 'on' : 'off'}, in the total ${total ? 'on' : 'off'}`);
    }
    settings.value.estimate = e;
    settings.save();
    record(ctx, req, 'estimate.settings', said.join('; ') || 'unchanged');
    return { ok: true };
  });

  /** An estimate on the Admins' page: for an account's counted code, or for lines typed (and figures typed for this run). */
  r('POST', '/api/estimate', adminOnly, (req, ctx, body) => {
    const { counted } = live();
    const from = body?.accountId ? counted.find((c) => c.id === String(body.accountId)) : null;
    if (body?.accountId && !from) throw fail(404, 'That account has no counted code to estimate from.');
    const lines = from ? from.lines : Number(body?.lines);
    if (!(lines >= 1000 && lines <= 5e9)) throw fail(400, 'Give the lines of code: 1,000 or more.');
    const months = Math.min(60, Math.max(1, Math.round(Number(body?.months) || 12)));
    const industry = cleanIndustry(body?.industry) || from?.industry || '';
    const density = body?.density && typeof body.density === 'object' ? body.density : null;
    const includeNew = body?.includeNew !== false;
    const out = both({ lines, months, includeNew, activeShare: from?.activeShare ?? null, industry });
    // By hand: the Admin's own findings per 1,000 lines for this one run.
    const typed = density ? estimate({ lines, months, includeNew: includeNew && out.have >= MIN_ACCOUNTS, activeShare: from?.activeShare ?? null }, figuresFor('', stateNow()).own, { rates: trRates(), density }) : null;
    if (!out.own && !out.standard && !typed) throw fail(409, `An estimate needs ${MIN_ACCOUNTS} accounts with code and findings from Checkmarx One (there are ${out.have}), a standard typed for the industry, or your own findings per 1,000 lines.`);
    record(ctx, req, 'estimate.run', from?.name ?? `${Math.round(lines)} lines`, { lines: Math.round(lines), months, industry, byHand: Boolean(density), accounts: out.have, frozen: Boolean(out.frozenAt) });
    return { ...out, typed, lines: Math.round(lines), months, includeNew, account: from ? { id: from.id, name: from.name } : null, code: from ? { repositories: from.repositories, commits: from.commits, developers: from.developers, activeShare: from.activeShare } : null };
  });

  /**
   * In the calculator (beta): the estimate for an account whose code was only counted, made by its SE with the
   * industry picked, and kept with the account (so its report can carry it, where the Admin allows that).
   */
  r('POST', '/api/projections/estimate', calcTeam, (req, ctx, body) => {
    const k = kept();
    if (!k.beta.calculator) throw fail(404, 'The estimate is not turned on here.');
    const account = accounts.get(String(body?.accountId ?? ''), ctx.teamSet);
    if (body?.remove === true) {
      accounts.setEstimate(account.id, ctx.teamSet, null);
      record(ctx, req, 'estimate.account.remove', account.name, { id: account.id });
      return { estimate: null };
    }
    const code = codeFacts(account, clocLines);
    if (!(code.lines >= 1000)) throw fail(409, 'Count the customer’s code first (from Git or their cloc-fusion report): the estimate is made from its lines.');
    const industry = cleanIndustry(body?.industry);
    // Counted in the total: from all accounts until the customer's industry is chosen (then its standard, where set).
    if (!industry && !k.beta.total) throw fail(400, 'Choose the customer’s industry.');
    const months = Math.min(60, Math.max(1, Math.round(Number(body?.months) || 12)));
    const priorSast = body?.priorSast !== false;
    const out = both({ lines: code.lines, months, includeNew: true, activeShare: code.activeShare, industry });
    if (!out.own && !out.standard) throw fail(409, industry ? `There are too few accounts to estimate from yet (${out.have} of ${out.needed}), and no standard is set for ${industry}: ask an Admin.` : `There are too few accounts to estimate from yet (${out.have} of ${out.needed}): choose the customer’s industry to use its standard.`);
    const slim = (e) => (e ? { accounts: e.accounts, source: e.source ?? 'accounts', ...Object.fromEntries(['low', 'typical', 'high'].map((l) => [l, e[l]])) } : null);
    const est = {
      industry,
      priorSast,
      // The figure to quote: typical where the customer has used a SAST tool before, high for an untouched codebase.
      quote: priorSast ? 'typical' : 'high',
      include: body?.include === true && k.beta.report,
      months,
      at: new Date().toISOString(),
      by: ctx.user.name,
      code,
      own: slim(out.own),
      standard: slim(out.standard),
      frozenAt: out.frozenAt,
    };
    accounts.setEstimate(account.id, ctx.teamSet, est);
    record(ctx, req, 'estimate.account', account.name, { id: account.id, industry, lines: code.lines, priorSast, inReport: est.include, inTotal: k.beta.total, auto: body?.auto === true });
    return { estimate: est };
  });

  return { estimateBeta: () => kept().beta };
}
