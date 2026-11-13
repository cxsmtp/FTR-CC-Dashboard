/**
 * A customer's own version of a projection report. The report's "Try other numbers" levers work everything out again
 * in the customer's browser, and "Download my version" saves the file as they left it: their inputs, the plan as sent,
 * and the figures the report was built from, as JSON in <script id="cx-live">.
 *
 * Here only that JSON is read. The file's HTML and scripts are never run or kept. The figures are worked out again
 * with the calculator's own model (core/public/calculator/levers.js), so what is recorded is what their numbers
 * give, not what the file claims.
 */
import { leverData } from '../core/public/calculator/levers.js';
import { creditSummary, fusionTotal } from '../core/public/calculator/model.js';
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

/**
 * The calculator's own data again, from what a report with levers keeps (`inputs`: the backlog's analysis, the plan,
 * Fusion's settings and projects; `base`: the code counted and how the report was made). Loaded into an account, the
 * calculator shows what the report showed, and can be changed and read again from there.
 *
 * The backlog's series is rebuilt from its analysis: the month-end backlog before the trend's start, the backlog at
 * the trend's start and today, and what was fixed in between. Worked out again, it gives the same open findings, new
 * findings a month and fixes as the report (the week-by-week detail of the read is not in a report, so its charts show
 * months). SAST's part, when the report kept it, is rebuilt the same way.
 */
/** The weekly rates a report drew its "Debt added against fixes" chart from, when it kept them. */
function reportWeekly(weekly) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return (Array.isArray(weekly) ? weekly : []).map((w) => ({ date: String(w?.date ?? '').slice(0, 10), addedRate4: n(w?.addedRate4 ?? w?.addedRate), fixedRate4: n(w?.fixedRate4 ?? w?.fixedRate) })).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date));
}

export function profileFromReport(live, { useSent = false } = {}) {
  const inputs = (useSent ? live.sentInputs : null) ?? live.inputs ?? {};
  const base = live.base ?? {};
  const patch = {};
  const t = inputs.tr;
  const a = t?.analysis;
  if (a?.perSeverity && a.latestDate && a.previousDate) {
    const latest = String(a.latestDate).slice(0, 10);
    const prev = String(a.previousDate).slice(0, 10);
    const spanMonths = Math.max(0.25, (Date.parse(latest) - Date.parse(prev)) / 86400000 / 30.44);
    const monthEnd = (month) => {
      const [y, m] = String(month).split('-').map(Number);
      return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    };
    const rows = (a.history ?? []).filter((h) => /^\d{4}-\d{2}$/.test(h?.month ?? '')).map((h) => ({ date: monthEnd(h.month), ...Object.fromEntries(SEV.map((s) => [s, Math.max(0, Number(h[s]) || 0)])) })).filter((r) => r.date < prev);
    rows.push({ date: prev, ...Object.fromEntries(SEV.map((s) => [s, Math.max(0, Number(a.perSeverity[s]?.prior) || 0)])) });
    rows.push({ date: latest, ...Object.fromEntries(SEV.map((s) => [s, Math.max(0, Number(a.perSeverity[s]?.current) || 0)])) });
    const weeks = rows.map((r) => r.date);
    const totals = { weeks, bySeverity: Object.fromEntries(SEV.map((s) => [s, rows.map((r) => r[s])])), meta: { source: 'upload', fileName: `Report of ${String(base.generatedAt ?? '').slice(0, 10) || 'an earlier date'}`, layout: 'report', exportedAt: base.generatedAt ?? null, weekly: reportWeekly(t.weekly) } };
    const fixedAt = (n) => weeks.map((w) => (w === latest ? n : 0));
    const fixed = { weeks, bySeverity: Object.fromEntries(SEV.map((s) => [s, fixedAt(Math.max(0, Number(a.perSeverity[s]?.fixed) || 0))])) };
    // SAST's own part: today, and new SAST findings a month (none fixed, unless the start would fall below zero).
    const sp = t.sast?.perSeverity;
    if (sp) {
      const part = (s) => {
        const now = Math.max(0, Number(sp[s]?.current) || 0);
        const grew = Math.max(0, Number(sp[s]?.arrivals) || 0) * spanMonths;
        const start = Math.max(0, now - grew);
        return { now, start, fixedNow: start - now + grew };
      };
      const p = Object.fromEntries(SEV.map((s) => [s, part(s)]));
      totals.sast = Object.fromEntries(SEV.map((s) => [s, rows.map((r) => (r.date === latest ? p[s].now : r.date === prev ? p[s].start : Math.round(r[s] * (a.perSeverity[s]?.current ? p[s].now / a.perSeverity[s].current : 0))))]));
      fixed.sast = Object.fromEntries(SEV.map((s) => [s, fixedAt(p[s].fixedNow)]));
    }
    const plan = t.plan ?? {};
    patch.tr = {
      totals,
      fixed,
      lookbackMonths: a.lookbackMonths,
      selected: plan.selected ?? {},
      fpPercent: plan.fpPercent,
      includeFuture: plan.includeFuture,
      aiDeclinePercent: plan.aiDeclinePercent,
      newPacePercent: plan.newPacePercent,
      fusionUpliftPercent: plan.fusionUpliftPercent,
    };
  }
  const f = inputs.fusion;
  if (f?.settings) {
    const projects = (f.projects ?? []).map((p, i) => {
      const folded = Number(p.count) > 0 && p.units !== undefined && !p.name;
      return {
        id: `report-${i + 1}`,
        name: folded ? `${p.count} project${p.count === 1 ? '' : 's'} (the report kept no names)` : p.name,
        loc: folded ? Number(p.units) * 10000 : p.loc,
        criticality: p.criticality ?? null,
        frequency: p.frequency ?? 'rare',
        scansPerWeek: p.scansPerWeek ?? 0,
        included: p.included !== false,
        scansOverride: p.scansOverride ?? null,
        modelOverride: p.modelOverride ?? null,
        source: 'scan',
      };
    });
    patch.fusion = { ...f.settings, periodMonths: inputs.months ?? f.settings.periodMonths, projects, optOut: false, readAt: null };
  }
  const n = base.fusionNew;
  if (n?.rows?.length) {
    patch.fusionNew = {
      defaultScans: n.defaultScans,
      defaultModel: n.defaultModel,
      leftOut: n.leftOut,
      onTop: n.onTop === true,
      basis: 'cloc',
      basisByHand: true,
      projects: n.rows.map((r, i) => ({
        id: `report-new-${i + 1}`,
        name: r.name,
        file: r.file || 'from a report',
        locOverride: r.lines,
        included: r.included !== false,
        criticality: r.criticality ?? null,
        scansOverride: r.scansFrom === 'project' ? r.scans : null,
        ...(r.frequency ? { activity: { frequency: r.frequency, commits: r.commits ?? 0, windowDays: r.windowDays ?? 365, devs90: r.devs90 ?? null, engine: 'report' } } : {}),
      })),
    };
  }
  if (inputs.totals) patch.totals = inputs.totals;
  return patch;
}

/**
 * A report without its levers (made before them, or from an earlier report) but with its own figures: the backlog's
 * analysis per severity, the plan's rows, what is still to come, and Fusion's rows. The calculator's data again, from
 * those. Null when the report keeps only its totals.
 */
export function profileFromData(data) {
  const t = data?.tr;
  const SEVS = ['Critical', 'High', 'Medium', 'Low'];
  let tr = null;
  if (t?.analysis && t.asOf && t.previousDate && SEVS.every((s) => t.analysis[s])) {
    const perSeverity = Object.fromEntries(SEVS.map((s) => [s, { ...t.analysis[s] }]));
    const analysis = { latestDate: String(t.asOf).slice(0, 10), previousDate: String(t.previousDate).slice(0, 10), lookbackMonths: t.lookbackMonths ?? 3, spanMonths: t.analysis.spanMonths, perSeverity, total: t.analysis.total, history: [] };
    const rows = t.rows ?? {};
    const plan = {
      selected: Object.fromEntries(SEVS.map((s) => [s, rows[s]?.selected ?? null])),
      fpPercent: Object.fromEntries(SEVS.map((s) => [s, rows[s]?.fp ?? 30])),
      includeFuture: t.ahead?.includeFuture,
      aiDeclinePercent: t.ahead?.aiDeclinePercent,
      newPacePercent: t.ahead?.newPacePercent,
      fusionUpliftPercent: t.ahead?.fusionUpliftPercent,
    };
    tr = { analysis, plan, sast: null, fusion: Boolean(t.fusion) };
  }
  const f = data?.fusion;
  let fusion = null;
  if (f?.rows?.length) {
    fusion = {
      settings: { periodMonths: f.periodMonths ?? data.months ?? 12, defaultScans: f.defaultScans ?? 1, defaultModel: f.defaultModel ?? null, models: f.models ?? [], combine: 'frequency', byFrequency: {} },
      // Each project's scans as the report had them, so its credits come out the same.
      projects: f.rows.map((r) => ({ name: r.name, loc: r.lines ?? (r.units ? r.units * 10000 : null), frequency: r.frequency, criticality: r.criticality ?? null, scansPerWeek: r.scansPerWeek ?? 0, included: r.included !== false, scansOverride: r.scans ?? null, modelOverride: r.model ?? null, ...(r.count ? { count: r.count, units: r.units } : {}) })),
    };
  }
  if (!tr && !fusion) return null;
  return profileFromReport({ inputs: { months: data.months ?? 12, tr, fusion, totals: data.summary?.settings ?? data.levers?.totals }, base: data });
}
