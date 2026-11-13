import { clocLines } from '../../core/public/calculator/model.js';
import { accountFacts, benchmark, estimate } from '../estimate.js';
import { fail } from '../store.js';

/**
 * The vulnerability estimate (server/estimate.js): findings and triage & remediation credits for code that has only
 * been counted, from this installation's own accounts. For Admins only, and internal: nothing of it is in a report.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers).
 */
export function registerEstimate(d) {
  const { accounts, r, ready2, record, trRates } = d;
  const adminOnly = (req, ctx) => {
    ready2(req, ctx);
    if (ctx.user.role !== 'admin') throw fail(403, 'The estimate is for Admins.');
  };
  // What the accounts say, worked out again at most once a minute (every account's file is read for it).
  let kept = null;
  const facts = () => {
    if (kept && Date.now() - kept.at < 60_000) return kept;
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
      const own = account.fusionNew ?? {};
      const lines = (own.projects ?? []).filter((p) => p?.included !== false).reduce((n, p) => n + (clocLines(p, own.leftOut) || 0), 0);
      if (lines > 0) counted.push({ id: account.id, name: account.name, lines, repositories: (own.projects ?? []).length, scanned: Boolean(f) });
    }
    kept = { at: Date.now(), all, counted: counted.sort((a, b) => a.name.localeCompare(b.name)), bench: benchmark(all) };
    return kept;
  };
  r('GET', '/api/estimate', adminOnly, () => {
    const { all, counted, bench } = facts();
    return {
      benchmark: bench,
      accounts: all.map((f) => ({ id: f.id, name: f.name, lines: f.lines, projects: f.projects, total: f.total, open: f.open, density: f.density, addedPct: f.addedPct, from: f.from })).sort((a, b) => b.density - a.density),
      counted,
      rates: trRates(),
    };
  });
  r('POST', '/api/estimate', adminOnly, (req, ctx, body) => {
    const { counted, bench } = facts();
    const from = body?.accountId ? counted.find((c) => c.id === String(body.accountId)) : null;
    if (body?.accountId && !from) throw fail(404, 'That account has no counted code to estimate from.');
    const lines = from ? from.lines : Number(body?.lines);
    if (!(lines >= 1000 && lines <= 5e9)) throw fail(400, 'Give the lines of code: 1,000 or more.');
    const months = Math.min(60, Math.max(1, Math.round(Number(body?.months) || 12)));
    // By hand: the Admin's own findings per 1,000 lines, when the accounts are too few or do not fit this customer.
    const density = body?.density && typeof body.density === 'object' ? body.density : null;
    if (!density && !bench.enough) throw fail(409, `An estimate needs ${bench.minAccounts} accounts with code and findings from Checkmarx One (there are ${bench.accounts}), or your own findings per 1,000 lines.`);
    // The pace of new findings comes from the accounts too: with too few of them it is left out, not guessed.
    const includeNew = body?.includeNew !== false && bench.enough;
    const out = estimate({ lines, months, includeNew }, bench, { rates: trRates(), density });
    record(ctx, req, 'estimate.run', from?.name ?? `${Math.round(lines)} lines`, { lines: Math.round(lines), months, byHand: Boolean(density), accounts: bench.accounts });
    return { ...out, account: from ? { id: from.id, name: from.name } : null, accounts: bench.accounts, newLeftOut: body?.includeNew !== false && !bench.enough };
  });
}
