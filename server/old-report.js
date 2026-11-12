/**
 * A projection report from an earlier version of the calculator: a page of figures with nothing to work them out again
 * (no "Try other numbers", no data inside). Read from the page itself: the backlog by severity and what it adds and
 * fixes a month, the plan, the month-end backlog and the week-by-week rates of its charts, Fusion's models, its scans
 * by frequency and every project. From these the report's figures are made again with today's model, so the account's
 * calculator can be filled from it, and changed from there.
 *
 * Only what the page says is read: its scripts are never run. A page that is not such a report is refused.
 */
import { FREQUENCIES, SEVERITIES, aheadMonths } from '../core/public/calculator/model.js';
import { leverInputs } from '../core/public/calculator/levers.js';
import { fail } from './store.js';

const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sept: 9, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const un = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const n = (s) => {
  const v = Number(String(s ?? '').replace(/[,\s%+]/g, '').replace('−', '-'));
  return s !== undefined && s !== null && String(s).trim() !== '' && Number.isFinite(v) ? v : null;
};
const isoDay = (s) => {
  const t = Date.parse(`${s} UTC`);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

/** Whether this page is an earlier report (and not one with its figures inside). */
export const isOldReport = (html) => /credits projection/i.test(html) && !/id="cx-live"/.test(html) && /How we got there|Total credits required/.test(html);

/** `{ inputs, sentInputs, base, sentTotal }`, as a report with levers keeps them, from an earlier report's page. */
export function readOldReport(html, { force = false } = {}) {
  const page = String(html ?? '');
  if (!force && !isOldReport(page)) throw fail(400, 'That is not a projection report: use the report file the calculator made.');
  const tables = [...page.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => [...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => un(c[1]))));
  const table = (firstCell) => tables.find((t) => t.some((r) => r[0] === firstCell));
  const body = page.slice(page.indexOf('<body'));
  const text = un(body.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' '));
  const titles = [...page.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => un(m[1]));

  const customer = (/<h1>([^<:]*):/.exec(page)?.[1] ?? '').trim() || 'Customer';
  const made = /Made ([\d/]+), ([\d:]+) ([AP]M) by (.{1,80}?)(?= Theme| Auto| Total credits| Light| Dark|$)/.exec(text);
  let generatedAt = new Date().toISOString();
  let preparedBy = '';
  if (made) {
    const [mo, da, ye] = made[1].split('/').map(Number);
    let [hh, mi, ss] = made[2].split(':').map(Number);
    if (made[3] === 'PM' && hh < 12) hh += 12;
    if (made[3] === 'AM' && hh === 12) hh = 0;
    const t = Date.UTC(ye, mo - 1, da, hh, mi || 0, ss || 0);
    if (Number.isFinite(t)) generatedAt = new Date(t).toISOString();
    preparedBy = made[4].trim().slice(0, 120);
  }
  const months = n(/over (\d+) months/.exec(text)?.[1]) ?? 12;
  const bundleCredits = n(/Bundles of ([\d,]+) credits/.exec(text)?.[1]) ?? 10000;
  const sentTotal = n(/Total credits required ([\d,]+)/.exec(text)?.[1]);
  const extraPercent = n(/([\d.]+)% extra/.exec(text)?.[1]) ?? 0;
  const read = /Read live from Checkmarx One on ([A-Za-z]+ \d+, \d{4}): ([\d,]+) projects, ([\d,]+) scans/.exec(text);
  const leftOutNoFindings = n(/Left out: ([\d,]+) projects with no open findings/.exec(text)?.[1]);

  // ---- Triage & remediation ----
  let analysis = null;
  let plan = null;
  let weekly = null;
  const sev = table('By severity');
  const span = /Backlog as of ([A-Za-z]+ \d+, \d{4}), against ([A-Za-z]+ \d+, \d{4})/.exec(text);
  if (sev && span) {
    const row = (name) => {
      const r = sev.find((x) => x[0] === name);
      return r ? Object.fromEntries(SEVERITIES.map((s, i) => [s, n(r[i + 1]) ?? 0])) : null;
    };
    const current = row('Current backlog');
    if (current) {
      const latestDate = isoDay(span[1]);
      const previousDate = isoDay(span[2]);
      const lookbackMonths = n(/measured over the last (\d+) months/.exec(text)?.[1]) ?? 3;
      const addedMonth = row('Added a month') ?? Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
      const fixedMonth = row('Fixed a month') ?? Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
      const chosen = row('Backlog to triage') ?? current;
      const stillToCome = row('Still to come') ?? {};
      const credits = row('Credits') ?? {};
      const triageCost = row('Credits per triage') ?? Object.fromEntries(SEVERITIES.map((s) => [s, 1]));
      const fp = row('False positives (estimated)') ?? Object.fromEntries(SEVERITIES.map((s) => [s, 30]));
      const remCost = row('Credits per remediation') ?? Object.fromEntries(SEVERITIES.map((s) => [s, 3]));
      const upliftPct = n(/Fusion reports (\d+(?:\.\d+)?)% more findings/.exec(text)?.[1]) ?? 0;
      const faePct = n(/FAE keeps (\d+(?:\.\d+)?)% of the new findings/.exec(text)?.[1]) ?? 0;
      const aiMonthly = n(/(\d+(?:\.\d+)?)% fewer each month with AI/.exec(text)?.[1]);
      const aiYearly = n(/(\d+(?:\.\d+)?)% fewer over a year with AI/.exec(text)?.[1]);
      // Today the fall with AI is said over a year: the same fall as that much each month.
      const aiDeclinePercent = aiYearly ?? (aiMonthly !== null ? (1 - (1 - aiMonthly / 100) ** 12) * 100 : 0);
      const paced = aheadMonths(months, aiDeclinePercent);
      const spanMonths = Math.max(0.25, (Date.parse(latestDate) - Date.parse(previousDate)) / 86400000 / 30.44);
      const perSeverity = {};
      for (const s of SEVERITIES) {
        // New findings a month: worked back from the severity's credits where it is in the plan (one decimal on the page),
        // else as printed.
        let arrivals = addedMonth[s];
        if (chosen[s] > 0 && credits[s] > 0 && current[s] > 0 && paced > 0) {
          const tc = triageCost[s];
          const rc = remCost[s];
          const tp = 1 - fp[s] / 100;
          const u = 1 + upliftPct / 100;
          const keep = 1 - faePct / 100;
          const R = (credits[s] - tc * chosen[s] * (1 - keep)) / (tc * keep + rc * tp);
          const future = R / u - chosen[s];
          const worked = future / paced / (chosen[s] / current[s]);
          if (Number.isFinite(worked) && worked >= 0) arrivals = worked;
        }
        const fixedMonthly = fixedMonth[s];
        const fixed = fixedMonthly * spanMonths;
        const prior = Math.max(0, Math.round(current[s] - (arrivals - fixedMonthly) * spanMonths));
        perSeverity[s] = { current: current[s], prior, fixed, arrivals, debtRate: prior ? ((current[s] - prior) / prior) * 100 : null, fixRate: current[s] ? (fixed / current[s]) * 100 : null };
      }
      const sum = (k) => SEVERITIES.reduce((a, s) => a + perSeverity[s][k], 0);
      const total = { current: sum('current'), prior: sum('prior'), fixed: sum('fixed'), arrivals: sum('arrivals') };
      total.debtRate = total.prior ? ((total.current - total.prior) / total.prior) * 100 : null;
      total.fixRate = total.current ? (total.fixed / total.current) * 100 : null;
      for (const x of [...SEVERITIES.map((s) => perSeverity[s]), total]) {
        x.fixedMonthly = x.fixed / spanMonths;
        x.netMonthly = x.arrivals - x.fixedMonthly;
        x.addedPct = x.current ? (x.arrivals / x.current) * 100 : null;
        x.fixedPct = x.current ? (x.fixedMonthly / x.current) * 100 : null;
      }
      // The month-end backlog, from the severity charts' points ("Critical · Oct 25: 26,718").
      const hist = new Map();
      for (const s of SEVERITIES) {
        for (const t of titles) {
          const m = new RegExp(`^${s} · ([A-Za-z]+) (\\d\\d): ([\\d,.]+)$`).exec(t);
          if (!m || !MON[m[1]]) continue;
          const key = `20${m[2]}-${String(MON[m[1]]).padStart(2, '0')}`;
          hist.set(key, { ...(hist.get(key) ?? { month: key }), [s]: n(m[3]) });
        }
      }
      const history = [...hist.values()].sort((a, b) => a.month.localeCompare(b.month)).map((h) => ({ ...h, ...Object.fromEntries(SEVERITIES.map((s) => [s, h[s] ?? 0])), open: SEVERITIES.reduce((a, s) => a + (h[s] ?? 0), 0) }));
      const tail = history.slice(-4);
      const avg = (k) => (tail.length < 2 ? 0 : (tail[tail.length - 1][k] - tail[0][k]) / (tail.length - 1));
      analysis = { latestDate, previousDate, lookbackMonths, spanMonths, perSeverity, total, history, monthlyChange: avg('open'), monthlyChangeBySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, avg(s)])) };
      // Week by week: debt added and fixed, as the chart had them (a share of the backlog a month).
      const latestMonth = Number(latestDate.slice(5, 7));
      const latestDay = Number(latestDate.slice(8, 10));
      const latestYear = Number(latestDate.slice(0, 4));
      const wk = new Map();
      for (const t of titles) {
        const m = /^(Debt added|Fixed) · (\d+) ([A-Za-z]+): ([\d.,]+)%$/.exec(t);
        if (!m || !MON[m[3]]) continue;
        const month = MON[m[3]];
        const year = month > latestMonth || (month === latestMonth && Number(m[2]) > latestDay) ? latestYear - 1 : latestYear;
        const date = `${year}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
        const w = wk.get(date) ?? { date };
        w[m[1] === 'Fixed' ? 'fixedRate4' : 'addedRate4'] = n(m[4]) / 4.345;
        wk.set(date, w);
      }
      weekly = wk.size ? [...wk.values()].sort((a, b) => a.date.localeCompare(b.date)) : null;
      plan = {
        selected: chosen,
        fpPercent: fp,
        triageCost,
        remediationCost: remCost,
        includeFuture: SEVERITIES.some((s) => (stillToCome[s] ?? 0) > 0),
        aiDeclinePercent,
        newPacePercent: 100,
        fusionUpliftPercent: upliftPct,
      };
    }
  }

  // ---- Fusion ----
  let fusion = null;
  const modelsTable = table('Model');
  const freqTable = table('Scanned today');
  const projTable = table('Project');
  if (modelsTable && projTable) {
    const FREQ = new Map(FREQUENCIES.map((f) => [f.label, f.id]));
    const slug = (name) => name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '') || 'model';
    const models = modelsTable.slice(1).filter((r) => r[0]).map((r) => ({ id: slug(r[0]), name: r[0], creditsPer10k: n(r[1]), source: 'manual' }));
    const modelId = (name) => models.find((m) => m.name === name)?.id ?? null;
    const freqRows = (freqTable ?? []).filter((r) => FREQ.has(r[0]));
    const byFrequency = Object.fromEntries(freqRows.map((r) => [FREQ.get(r[0]), { scans: n(r[2]), model: null }]));
    const defaultModel = modelId(freqRows[0]?.[3]) ?? models[0]?.id ?? null;
    const head = projTable[0].map((h) => h.toLowerCase());
    const col = (name) => head.indexOf(name);
    const at = (r, name) => (col(name) < 0 ? '' : r[col(name)] ?? '');
    const projects = projTable.slice(1).filter((r) => r[0]).map((r, i) => {
      const f = /^(.*?)(?: \(([\d.]+)\/week\))?$/.exec(at(r, 'scanned today'));
      const frequency = FREQ.get(f?.[1]) ?? null;
      const scans = n(at(r, 'fusion scans'));
      const p = { id: `old-${i + 1}`, name: r[0], included: true, criticality: n(at(r, 'criticality')), frequency, scansPerWeek: f?.[2] ? Number(f[2]) : null, loc: n(at(r, 'lines of code')) };
      if (scans !== null && (at(r, 'set by') !== 'Scan frequency' || scans !== byFrequency[frequency]?.scans)) p.scansOverride = scans;
      const model = modelId(at(r, 'model'));
      if (model && model !== defaultModel) p.modelOverride = model;
      return p;
    });
    if (projects.length) fusion = { settings: { periodMonths: months, defaultScans: 1, defaultModel, combine: 'frequency', models, byFrequency }, projects, remainingCredits: null };
  }
  if (!analysis && !fusion) throw fail(400, 'This earlier report has neither a backlog by severity nor Fusion projects to read: there is nothing in it to fill the calculator with.');

  const inputs = leverInputs({ analysis, plan: plan ?? {}, months, fusionOn: Boolean(fusion && plan?.fusionUpliftPercent), weekly, fusion, totals: { extraPercent, bundleCredits }, details: true });
  const base = {
    version: 2,
    organisation: 'Checkmarx',
    customer,
    preparedBy,
    generatedAt,
    source: read ? { kind: 'cxone', readAt: new Date(Date.parse(`${read[1]} UTC`)).toISOString(), projects: n(read[2]), allProjects: (n(read[2]) ?? 0) + (leftOutNoFindings ?? 0), scans: n(read[3]), engines: ['sast'], scoped: false, scope: {}, leftOut: leftOutNoFindings ? { noFindings: leftOutNoFindings } : {}, details: true, projectNames: [] } : { kind: 'manual' },
    tr: null,
    fusion: null,
    fusionNew: null,
    impact: null,
  };
  return { inputs, sentInputs: inputs, base, sentTotal, old: true };
}
