/**
 * A customer's own version of a projection report. The report's "Try other numbers" levers work everything out again
 * in the customer's browser, and "Download my version" saves the file as they left it: their inputs, the plan as sent,
 * and the figures the report was built from, as JSON in <script id="cx-live">.
 *
 * Here only that JSON is read. The file's HTML and scripts are never run or kept. The figures are worked out again
 * with the calculator's own model (vendor/mz/public/calculator/levers.js), so what is recorded is what their numbers
 * give, not what the file claims.
 */
import { leverData } from '../vendor/mz/public/calculator/levers.js';
import { creditSummary, fusionTotal } from '../vendor/mz/public/calculator/model.js';
import { fail } from './store.js';

const MAX_HTML = 40 * 1024 * 1024;
const SEV = ['Critical', 'High', 'Medium', 'Low'];

/** The JSON a report with levers carries: { inputs, sentInputs, sentTotal, base }. */
export function readCustomerVersion(html) {
  const text = String(html ?? '');
  if (!text) throw fail(400, 'Choose the report file the customer sent back.');
  if (text.length > MAX_HTML) throw fail(413, 'That file is larger than a projection report can be.');
  const m = /<script type="application\/json" id="cx-live">([^<]*)<\/script>/.exec(text);
  if (!m) throw fail(400, 'That is not a projection report with its "Try other numbers" levers: ask the customer to use "Download my version" in the report and send that file.');
  let live;
  try {
    live = JSON.parse(m[1]);
  } catch {
    throw fail(400, 'The report’s figures could not be read: the file may have been changed by hand.');
  }
  if (!live || typeof live !== 'object' || !live.inputs || !live.base || typeof live.inputs !== 'object' || typeof live.base !== 'object') throw fail(400, 'The report’s figures could not be read.');
  return live;
}

/** What the customer changed, in words: one line per lever moved. */
export function changesOf(sent = {}, mine = {}) {
  const out = [];
  const num = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en'));
  const cmp = (label, a, b, unit = '') => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push(`${label}: ${num(a)}${unit} → ${num(b)}${unit}`);
  };
  cmp('Projection period', sent.months, mine.months, ' months');
  const ps = sent.tr?.plan ?? {};
  const pm = mine.tr?.plan ?? {};
  for (const s of SEV) {
    cmp(`${s} findings planned`, ps.selected?.[s], pm.selected?.[s]);
    cmp(`${s} false positives`, ps.fpPercent?.[s], pm.fpPercent?.[s], '%');
    cmp(`${s} triage credits`, ps.triageCost?.[s], pm.triageCost?.[s]);
    cmp(`${s} remediation credits`, ps.remediationCost?.[s], pm.remediationCost?.[s]);
  }
  if ((ps.includeFuture ?? true) !== (pm.includeFuture ?? true)) out.push(`New findings to come: ${pm.includeFuture === false ? 'left out' : 'counted'}`);
  cmp('Fewer new findings with AI', ps.aiDeclinePercent, pm.aiDeclinePercent, '%');
  cmp('Pace of new findings', ps.newPacePercent, pm.newPacePercent, '%');
  cmp('Extra findings from Fusion', ps.fusionUpliftPercent, pm.fusionUpliftPercent, '%');
  cmp('Extra credits', sent.totals?.extraPercent, mine.totals?.extraPercent, '%');
  cmp('Credits per bundle', sent.totals?.bundleCredits, mine.totals?.bundleCredits);
  const ms = new Map((sent.fusion?.settings?.models ?? []).map((x) => [x.id, x]));
  for (const x of mine.fusion?.settings?.models ?? []) cmp(`${x.name || x.id} credits per 10K lines`, ms.get(x.id)?.creditsPer10k, x.creditsPer10k);
  for (const [id, r] of Object.entries(mine.fusion?.settings?.byFrequency ?? {})) cmp(`Fusion scans (${id})`, sent.fusion?.settings?.byFrequency?.[id]?.scans, r?.scans);
  const pn = new Map((sent.fusion?.projects ?? []).map((p) => [p.key, p]));
  let projects = 0;
  for (const p of mine.fusion?.projects ?? []) {
    const before = pn.get(p.key);
    if (before && (before.scansOverride !== p.scansOverride || before.modelOverride !== p.modelOverride || before.included !== p.included)) projects++;
  }
  if (projects) out.push(`${projects} Fusion project${projects === 1 ? '' : 's'} changed (scans, model or included)`);
  return out;
}

/** The report's figures with the customer's numbers, and its totals, worked out here. */
export function customerFigures(live) {
  const data = { ...leverData(live.base, live.inputs), levers: live.inputs };
  const tr = Number.isFinite(data.tr?.totals?.credits) ? data.tr.totals.credits : null;
  const fusion = fusionTotal(data.fusion, data.fusionNew);
  const sum = creditSummary(tr, fusion, data.summary?.settings ?? live.inputs.totals);
  return { data, total: sum.total, sentTotal: Number(live.sentTotal) || null, customer: String(live.base.customer ?? '') };
}

/** The account's calculator settings with the customer's choices in them (their numbers, from now on). */
export function preferencesPatch(profile, inputs) {
  const patch = {};
  const plan = inputs.tr?.plan;
  if (plan && profile.tr) {
    patch.tr = { ...profile.tr };
    for (const k of ['selected', 'fpPercent', 'triageCost', 'remediationCost']) if (plan[k] && typeof plan[k] === 'object') patch.tr[k] = { ...(profile.tr[k] ?? {}), ...plan[k] };
    for (const k of ['includeFuture', 'aiDeclinePercent', 'newPacePercent', 'fusionUpliftPercent']) if (plan[k] !== undefined) patch.tr[k] = plan[k];
  }
  if (profile.fusion && (inputs.months || inputs.fusion)) {
    const f = { ...profile.fusion };
    if (inputs.months) f.periodMonths = inputs.months;
    const s = inputs.fusion?.settings;
    if (s?.models) f.models = (f.models ?? []).map((m) => ({ ...m, creditsPer10k: s.models.find((x) => x.id === m.id)?.creditsPer10k ?? m.creditsPer10k }));
    if (s?.byFrequency) f.byFrequency = { ...(f.byFrequency ?? {}), ...s.byFrequency };
    // Per project, matched by name: a project the customer changed keeps their scans and model.
    const theirs = new Map((inputs.fusion?.projects ?? []).filter((p) => p.name).map((p) => [p.name, p]));
    if (theirs.size && Array.isArray(f.projects)) f.projects = f.projects.map((p) => (theirs.has(p.name) ? { ...p, included: theirs.get(p.name).included !== false, scansOverride: theirs.get(p.name).scansOverride ?? null, modelOverride: theirs.get(p.name).modelOverride ?? null } : p));
    patch.fusion = f;
  }
  if (inputs.totals) patch.totals = { ...(profile.totals ?? {}), ...inputs.totals };
  return patch;
}
