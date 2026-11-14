import { cleanEngines } from '../engines.js';
import { currentLanguage, RTL, t } from '../i18n.js';
import { barChart, donutChart, lineChart, PAGE_PALETTE } from './charts.js';
import { fusionImpactSections, impactSections, sectionHtml } from './explain.js';
import { leverData, leverInputs, recentRates } from './levers.js';
import { aheadSettings, cleanScope, creditSummary, DEFAULT_TR, fusionImpact, fusionSettings, fusionTotal, impactSettings, overallImpact, scopeActive, SEVERITIES, totalsSettings, trImpact, wholeNumber } from './model.js';
import { reportFileName, wording } from './report.js';
import { slidesFileName, slidesPdf } from './slides.js';

/**
 * Projection reports: what a report carries, generating it, and the list of those made.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupReports(d) {
  const {
    $, api, appLook, BASES, basis, c, can, esc, estimate, estimateOf, flush, fmtDateTime, fnew, fnewCounts,
    fnewEstimate, fnewOff, fusion, fusionCounts, fusionOff, fusionOn, handleAuthLoss, horizon, impactOn,
    knownOrigins, leftOutCounts, me, next, num, offline, readCxOne, readFinished, reading, renderBasis,
    reportHtml, save, scope, scoped, setNext, setStatus, show, showError, sure, toast, tr, trFigures,
  } = d;
  // ---- Projection reports -------------------------------------------------------------------

  function download(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // --- Credits required: both tabs together, an extra % on top, and the bundles that buys ----------

  const totals = () => totalsSettings(c.open?.totals);

  /** The Impact tab is held back until an activation code turns it on (feature:impact): hidden, and left out of the reports. */
  function gateImpact() {
    const tab = document.querySelector('[data-ptabs="calculator"] [data-pt="impact"]');
    if (!tab) return;
    tab.hidden = !impactOn();
    if (tab.hidden && tab.classList.contains('active')) document.querySelector('[data-ptabs="calculator"] [data-pt="tr"]')?.click();
  }

  // --- Fusion visuals: four graphs over the counted Fusion, each one the user can mute (hide) ---
  const VIZ_COLOURS = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#2563eb', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#64748b'];
  const vizHidden = () => { try { return new Set(JSON.parse(localStorage.getItem('cx-fusion-viz-hidden') || '[]')); } catch { return new Set(); } };

  function renderFusionVisuals() {
    const panel = $('calc-fusion-viz-panel');
    const host = $('calc-fusion-viz');
    if (!panel || !host) return;
    const est = estimate();
    const fn = fnewEstimate();
    const parts = [fusionCounts(est) && est, fnewCounts(fn) && fn].filter(Boolean);
    const rows = parts.flatMap((p) => p.rows.filter((r) => r.included && r.units));
    if (!rows.length) { panel.hidden = true; host.innerHTML = ''; return; }
    panel.hidden = false;
    const totalCredits = rows.reduce((a, r) => a + (r.credits ?? 0), 0);
    // 1 · credit mix by model
    const byModel = new Map();
    for (const p of parts) for (const m of p.byModel ?? []) byModel.set(m.name || 'No model', (byModel.get(m.name || 'No model') ?? 0) + (m.credits ?? 0));
    const modelSeg = [...byModel.entries()].map(([label, value], i) => ({ label, value, colour: VIZ_COLOURS[i % VIZ_COLOURS.length] }));
    // 2 · 10K-LOC blocks by repository (top 12 by blocks)
    const repoBars = [...rows].sort((a, b) => (b.units ?? 0) - (a.units ?? 0)).slice(0, 12).map((r) => ({ label: r.name || '—', value: r.units ?? 0, sub: `${num(r.scans)} scans`, colour: PAGE_PALETTE.plan }));
    // 3 · credits over the projection period (accrue evenly)
    const months = Math.max(2, Math.min(horizon(), 36));
    const pts = Array.from({ length: months }, (_, i) => ({ label: `M${i + 1}`, credits: Math.round((totalCredits * (i + 1)) / months) }));
    // 4 · lines of code by language (from the new-code projects, which know their languages)
    const langs = new Map();
    for (const p of (fnewCounts(fn) ? (fnew()?.projects ?? []).filter((x) => x.included !== false) : [])) for (const [lang, n] of Object.entries(p.langs ?? {})) langs.set(lang, (langs.get(lang) ?? 0) + (wholeNumber(n) ?? 0));
    const langBars = [...langs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value], i) => ({ label, value, colour: VIZ_COLOURS[i % VIZ_COLOURS.length] }));
    const cards = [
      ['mix', 'Credit mix by model', donutChart(modelSeg, { centre: num(Math.round(totalCredits)), title: 'Credit mix by model' })],
      ['repo', '10K-LOC blocks by repository', barChart(repoBars, { title: 'Blocks by repository' })],
      ['period', 'Credits over the period', lineChart(pts, [{ key: 'credits', colour: '#0d9488', label: 'Credits', area: true }], { width: 380, height: 190, title: 'Credits over the period' })],
      ['langs', 'Lines of code by language', barChart(langBars, { title: 'Lines by language' })],
    ].filter(([, , svg]) => svg);
    const hidden = vizHidden();
    host.innerHTML = cards.map(([id, title, svg]) => `
      <div class="calc-viz${hidden.has(id) ? ' muted' : ''}" data-viz="${id}">
        <div class="calc-viz-head"><h3>${esc(title)}</h3><label class="calc-viz-mute"><input type="checkbox" data-viz-mute="${id}" ${hidden.has(id) ? '' : 'checked'} /> Show</label></div>
        <div class="calc-viz-body">${svg}</div>
      </div>`).join('');
  }
  $('calc-fusion-viz')?.addEventListener('change', (event) => {
    const id = event.target?.dataset?.vizMute;
    if (!id) return;
    const hidden = vizHidden();
    if (event.target.checked) hidden.delete(id); else hidden.add(id);
    try { localStorage.setItem('cx-fusion-viz-hidden', JSON.stringify([...hidden])); } catch {}
    event.target.closest('.calc-viz')?.classList.toggle('muted', !event.target.checked);
  });

  function renderSummary() {
    gateImpact();
    queueMicrotask(renderBasis);
    $('calc-pdf').hidden = !(d.lastMade && d.lastMade.customerId === c.open?.id);
    if (!c.open) { $('calc-fusion-viz-panel') && ($('calc-fusion-viz-panel').hidden = true); return; }
    const fn = fnewEstimate();
    c.fusionNewCredits = fnewCounts(fn) ? fn.totals.credits : null;
    // Fusion for the customer's projects in Checkmarx One and for its new code, together.
    const sum = creditSummary(c.trCredits, fusionTotal({ totals: { credits: c.fusionCredits } }, { totals: { credits: c.fusionNewCredits } }), totals());
    $('calc-sum-tr').textContent = num(sum.trShown);
    $('calc-sum-tr-split').textContent = c.trSplit ? `${num(Math.round(c.trSplit.backlogCredits))} backlog + ${num(Math.round(c.trSplit.aheadCredits))} ahead` : '';
    // One Fusion figure, for the part that applies to this customer (ticked, with projects counted): both
    // added up when both do, with the split under it.
    const existing = c.fusionCredits !== null && c.fusionCredits !== undefined;
    const fresh = c.fusionNewCredits !== null && c.fusionNewCredits !== undefined;
    $('calc-sum-fusion-label').textContent = 'Fusion';
    $('calc-sum-fusion').textContent = existing || fresh ? num(Math.round((c.fusionCredits ?? 0) + (c.fusionNewCredits ?? 0))) : fusionOff() && fnewOff() ? 'Left out' : '—';
    const inUse = basis();
    $('calc-sum-fusion-split').textContent = existing && fresh ? `${num(Math.round(c.fusionCredits))} Checkmarx One + ${num(Math.round(c.fusionNewCredits))} counted code` : BASES[inUse] ? `Fusion · ${BASES[inUse].short}${existing || fresh ? '' : ' · nothing counted yet'}` : '';
    $('calc-sum-total').textContent = sum.tr === null && sum.fusion === null ? '—' : num(sum.totalShown);
    $('calc-sum-extra').textContent = num(sum.extraShown);
    $('calc-mix-extra').hidden = !(sum.extraShown > 0);
    $('calc-sum-bundles').textContent = sum.totalShown ? num(sum.bundlesShown) : '—';
    $('calc-sum-exact').textContent = sum.total && sum.bundles !== sum.exactBundles ? `${num(sum.exactBundles, 2)}, rounded up` : '';
    renderMix(sum, existing ? c.fusionCredits : 0, fresh ? c.fusionNewCredits : 0, existing || fresh);
    renderImpact();
    renderFusionVisuals();
  }

  /**
   * The strip's pictures: the bar of what the total is made of (each part's share is written by its
   * figure too, so the bar itself is only a picture), and the bundles as cells, the last filled to what is used.
   */
  function renderMix(sum, fusionExisting, fusionNew, fusionCounts) {
    const whole = sum.total > 0 ? sum.total : 0;
    const parts = [['tr', sum.tr ?? 0], ['fx', fusionExisting ?? 0], ['fn', fusionNew ?? 0], ['extra', sum.extra]].filter(([, v]) => v > 0);
    $('calc-mix-bar').replaceChildren(...(whole ? parts : []).map(([key, value]) => {
      const seg = document.createElement('i');
      seg.className = `calc-mix-seg calc-seg-${key}`;
      seg.style.flexGrow = String(value / whole);
      return seg;
    }));
    const share = (value) => {
      if (!whole || !(value > 0)) return '';
      const p = (value / whole) * 100;
      return p < 1 ? '<1%' : `${Math.round(p)}%`;
    };
    $('calc-mix-tr-pct').textContent = share(sum.tr);
    $('calc-mix-fusion-pct').textContent = share((fusionExisting ?? 0) + (fusionNew ?? 0));
    $('calc-mix-extra-pct').textContent = share(sum.extra);
    // Fusion's swatch: its part's colour, both colours when both count, grey when it does not count.
    const key = $('calc-mix-fusion');
    key.classList.toggle('calc-mix-both', fusionExisting > 0 && fusionNew > 0);
    key.classList.toggle('calc-mix-new-only', !(fusionExisting > 0) && fusionNew > 0);
    key.classList.toggle('calc-mix-off', !fusionCounts);
    $('calc-mix-tr').classList.toggle('calc-mix-off', sum.tr === null);
    // One cell a bundle while they fit; none past 60 (the figure says it).
    const n = whole ? sum.bundles : 0;
    const cells = $('calc-bundle-cells');
    cells.hidden = !n || n > 60;
    cells.classList.toggle('calc-cells-many', n > 12);
    cells.replaceChildren(...(cells.hidden ? [] : Array.from({ length: n }, (_, i) => {
      const cell = document.createElement('i');
      const used = sum.exactBundles - (n - 1);
      if (i === n - 1 && used < 0.995) {
        cell.className = 'calc-cell-part';
        cell.style.setProperty('--fill', `${Math.max(6, Math.round(used * 100))}%`);
      }
      return cell;
    })));
  }

  // --- Impact: what the triage & remediation credits give back ---------------------------------

  /** This customer's assumptions; a customer saved before the Impact tab starts from Settings → Impact. */
  const impact = () => impactSettings(c.open?.impact ?? {}, impactSettings(c.impactDefaults ?? {}));
  const IMPACT_FIELDS = {
    'calc-imp-triage': 'triageMinutes', 'calc-imp-fix': 'fixMinutes', 'calc-imp-review': 'reviewMinutes', 'calc-imp-rate': 'hourlyRate', 'calc-imp-price': 'creditPrice', 'calc-imp-currency': 'currency',
    'calc-imp-lph': 'linesPerHour', 'calc-imp-reviewers': 'reviewers', 'calc-imp-later': 'laterFixMultiplier',
  };

  function fillImpact() {
    const s = impact();
    for (const [id, key] of Object.entries(IMPACT_FIELDS)) {
      const v = s[key];
      if (key === 'currency' && ![...$(id).options].some((o) => o.value === v)) $(id).add(new Option(v, v));
      $(id).value = key === 'currency' ? v : key === 'hourlyRate' || key === 'creditPrice' ? (v || '') : v;
    }
    $('calc-imp-fusion-on').checked = s.countFusion;
  }

  const money = (n, currency) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    try {
      return n.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch {
      return `${num(n)} ${currency}`;
    }
  };

  /** The impact of the projection on the Triage & remediation tab, with these assumptions. */
  function currentImpact() {
    const t = trFigures();
    return t ? trImpact(t.projection.rows, t.projection.months, impact()) : null;
  }

  /** Fusion's impact: the projects counted on the Fusion tab, and what Fusion adds to triage & remediation. */
  function currentFusionImpact() {
    if (!impact().countFusion) return null;
    const est = estimate();
    const fn = fnewEstimate();
    const parts = [fusionCounts(est) && est, fnewCounts(fn) && fn].filter(Boolean);
    if (!parts.length) return null;
    return fusionImpact(parts.flatMap((x) => x.rows), parts.reduce((n, x) => n + x.totals.credits, 0), est.settings.periodMonths, impact(), trFigures()?.projection.rows ?? null);
  }

  function renderImpact() {
    if (!c.open) return;
    const m = currentImpact();
    $('calc-impact-empty').hidden = Boolean(m);
    // In the reader's language here (the same words as the report), as the figures sit inside the sentences.
    const L = wording({ t, lang: currentLanguage() });
    const { w } = L;
    renderFusionImpact(L);
    renderOverallImpact(L, m);
    if (!m) {
      $('calc-impact-kpis').innerHTML = '';
      $('calc-impact-rows').innerHTML = '';
      $('calc-impact-how').innerHTML = `<h2>${w('How each number is calculated')}</h2>${fusionImpactSections(currentFusionImpact(), L).map((x) => `<h3>${x.title}</h3>${sectionHtml(x)}`).join('')}`;
      return;
    }
    const cur = m.settings.currency;
    const cash = (n) => esc(money(n, cur));
    const kpi = (label, value, sub, cls = '') => `<div class="rp-kpi ${cls}"><span class="rp-tile-label">${label}</span><span class="rp-kpi-value">${value}</span><span class="rp-tile-sub">${sub}</span></div>`;
    $('calc-impact-kpis').innerHTML = [
      kpi(w('Hours given back'), num(m.hours), w('About {0} developer-years over {1} months', num(m.developerYears, 1), num(m.months)), 'calc-gold'),
      kpi(w('Value of that time'), cash(m.value), m.value === null ? w('Enter what a developer\'s hour costs') : w('{0} hours × {1}', num(m.hours), cash(m.settings.hourlyRate))),
      kpi(w('What the credits cost'), cash(m.cost), m.cost === null ? w('Enter what a credit costs') : w('{0} credits', num(m.credits, 1))),
      kpi(w('Return'), m.roi === null ? '—' : `${num(m.roi * 100)}%`, m.net === null ? w('Once the hour and the credit have a price') : `${w('{0} net', cash(m.net))}${m.paybackMonths !== null ? ` · ${w('paid back in {0} months', num(m.paybackMonths, 1))}` : ''}`),
      kpi(w('False positives cleared'), num(m.cleared), w('Never reach a developer')),
    ].join('');
    const SEV = { Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low' };
    $('calc-impact-rows').innerHTML = m.bySeverity
      .filter((r) => r.triaged || r.fixes)
      .map((r) => `<tr><td>${w(SEV[r.severity])}</td><td class="num">${num(r.triaged)}</td><td class="num">${num(r.cleared)}</td><td class="num">${num(r.fixes)}</td><td class="num">${num(r.hours)}</td><td class="num">${num(r.credits, 1)}</td></tr>`)
      .join('') + `<tr class="calc-total"><td>${w('Total')}</td><td class="num">${num(m.triaged)}</td><td class="num">${num(m.cleared)}</td><td class="num">${num(m.fixes)}</td><td class="num">${num(m.hours)}</td><td class="num">${num(m.credits, 1)}</td></tr>`;
    $('calc-impact-how').innerHTML = `<h2>${w('How each number is calculated')}</h2>${[...impactSections(m, L), ...fusionImpactSections(currentFusionImpact(), L)].map((x) => `<h3>${x.title}</h3>${sectionHtml(x)}`).join('')}`;
  }

  const kpiTile = (label, value, sub, cls = '') => `<div class="rp-kpi ${cls}"><span class="rp-tile-label">${label}</span><span class="rp-kpi-value">${value}</span><span class="rp-tile-sub">${sub}</span></div>`;

  function renderFusionImpact(L) {
    const f = currentFusionImpact();
    const { w } = L;
    $('calc-impact-fusion-empty').hidden = Boolean(f);
    $('calc-impact-fusion-empty').textContent = !impact().countFusion ? 'Fusion’s impact is not calculated: tick Calculate Fusion’s impact above to see its figures (and count them in the return).' : fusionOff() ? 'Fusion · Checkmarx One is left out of this projection: use it on its tab to count it.' : 'No Fusion projects yet: add them, with their lines of code, on the Fusion tabs.';
    if (!f) return ($('calc-impact-fusion').innerHTML = '');
    const cash = (n) => esc(money(n, f.settings.currency));
    $('calc-impact-fusion').innerHTML = [
      kpiTile(w('Expert review replaced'), `${num(f.expertHours)} ${w('hours')}`, f.expertValue === null ? w('{0} lines read at {1} an hour', num(f.linesRead), num(f.settings.linesPerHour)) : w('Worth {0}', cash(f.expertValue)), 'calc-gold'),
      kpiTile(w('Every line read'), w('{0} times', num(f.timesRead, 1)), w('{0} lines in {1} projects, over {2} months', num(f.linesOnce), num(f.projects), num(f.months))),
      kpiTile(w('Cost per 10K lines read'), f.costPer10k === null ? '—' : cash(f.costPer10k), f.expertPer10k === null ? w('Enter what a developer\'s hour costs') : w('An expert: {0}', cash(f.expertPer10k))),
      kpiTile(w('Reviewers to keep pace'), num(f.reviewersNeeded, 1), w('Full-time, reading what Fusion reads')),
      kpiTile(w('A team reading it once'), w('{0} weeks', num(f.teamWeeks, 1)), w('{0} reviewers, 40 hours a week', num(f.settings.reviewers))),
      f.extraTrue !== null ? kpiTile(w('Found earlier, fixed cheaper'), f.earlyValue === null ? `${num(f.earlyHours)} ${w('hours')}` : cash(f.earlyValue), w('{0} more true positives fixed while coding, not after release', num(f.extraTrue))) : '',
      f.breachAvoided !== null ? kpiTile(`${w('Breach cost avoided')} <i class="hc-beta">beta</i>`, cash(f.breachAvoided), w('{0} breach(es) × {1}% of ARR; for projection only', num(f.settings.breachesAvoided), num(f.settings.breachArrPercent, 1))) : '',
    ].join('');
  }

  function renderOverallImpact(L, tr) {
    const o = overallImpact(tr, currentFusionImpact());
    const { w } = L;
    if (!o) return ($('calc-impact-overall').innerHTML = '');
    const cash = (n) => esc(money(n, o.currency));
    $('calc-impact-overall').innerHTML = [
      kpiTile(w('All the credits give back'), o.value === null ? `${num(o.hours)} ${w('hours')}` : cash(o.value), w('Triage & remediation and Fusion, over {0} months', num(o.months)), 'calc-gold'),
      kpiTile(w('What the credits cost'), cash(o.cost), o.cost === null ? w('Enter what a credit costs') : w('Every credit in this projection')),
      kpiTile(w('Return'), o.roi === null ? '—' : `${num(o.roi * 100)}%`, o.net === null ? w('Once the hour and the credit have a price') : `${w('{0} net', cash(o.net))}${o.paybackMonths !== null ? ` · ${w('paid back in {0} months', num(o.paybackMonths, 1))}` : ''}`),
    ].join('');
  }

  $('calc-imp-fusion-on').addEventListener('change', (event) => {
    if (!c.open) return;
    c.open.impact = impactSettings({ ...impact(), countFusion: event.target.checked }, impact());
    if (event.target.checked) $('calc-imp-fusion-box').open = true;
    renderImpact();
    save({ impact: c.open.impact });
  });
  for (const [id, key] of Object.entries(IMPACT_FIELDS)) {
    $(id).addEventListener('input', (event) => {
      if (!c.open) return;
      c.open.impact = impactSettings({ ...impact(), [key]: key === 'currency' ? event.target.value : event.target.value === '' && (key === 'hourlyRate' || key === 'creditPrice') ? 0 : event.target.value }, impact());
      renderImpact();
      save({ impact: c.open.impact });
    });
  }

  // The extra % and the credits per bundle wait for Apply too.
  $('calc-extra').addEventListener('input', (event) => c.open && setNext({ extraPercent: event.target.value }, { redraw: false }));
  // The credits per bundle, behind the "?" on Bundles: opens under it, closes with the "?", Escape or a click elsewhere.
  const bundlePop = (open) => {
    $('calc-bundle-item').hidden = !open;
    $('calc-bundle-q').setAttribute('aria-expanded', String(open));
    if (open) $('calc-bundle').focus();
  };
  $('calc-bundle-q').addEventListener('click', () => bundlePop($('calc-bundle-item').hidden));
  $('calc-bundle-item').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' && event.key !== 'Enter') return;
    event.preventDefault();
    bundlePop(false);
    $('calc-bundle-q').focus();
  });
  document.addEventListener('click', (event) => {
    if (!$('calc-bundle-item').hidden && !event.target.closest('#calc-bundle-item, #calc-bundle-q')) bundlePop(false);
  });
  $('calc-bundle').addEventListener('input', (event) => c.open && setNext({ bundleCredits: event.target.value }, { redraw: false }));
  $('calc-extra').addEventListener('change', (event) => (event.target.value = next().extraPercent || ''));
  $('calc-bundle').addEventListener('change', (event) => (event.target.value = next().bundleCredits));

  /**
   * Everything a report shows, as figures: what the server keeps, and the file is built from. The figures
   * that move are worked out from its levers (levers.js), as the report's own script works them out again
   * when the customer changes one. Without project details nothing in it names a project.
   */
  function reportData() {
    const t = trFigures();
    const est = estimate();
    const fusionCounted = fusionCounts(est);
    const fn = fnewEstimate();
    const fnCounted = fnewCounts(fn);
    const who = me()?.user;
    const meta = tr()?.totals?.meta ?? {};
    const sc = scope();
    const details = $('calc-details')?.checked !== false;
    const levers = leverInputs({
      analysis: t?.analysis ?? null,
      sast: t?.sast ?? null,
      plan: tr() ?? {},
      months: horizon(),
      fusionOn: fusionOn(),
      recent: recentRates(t?.recent),
      weekly: t?.weekly ?? null,
      fusion: fusionCounted ? { settings: est.settings, projects: scoped(), remainingCredits: c.remainingCredits } : null,
      fusionNewRows: fnCounted ? fn.rows : null,
      totals: totals(),
      impact: impactOn() ? impact() : null,
      details,
    });
    const base = {
      version: 2,
      // The indicative triage & remediation estimate of an account whose code was only counted (beta): in the report
      // only when its SE ticked it and the Admin allows it. Never part of the credits.
      estimate: estimateOf()?.include ? estimateOf() : null,
      organisation: me()?.organisationName ?? '',
      customer: c.open.name,
      preparedBy: who?.name || who?.email || '',
      generatedAt: new Date().toISOString(),
      source: {
        kind: meta.source === 'cxone' ? 'cxone' : t ? 'upload' : fusion().readAt ? 'cxone' : 'manual',
        readAt: meta.readAt ?? fusion().readAt ?? null,
        projects: est.rows.filter((r) => r.source !== 'manual').length,
        allProjects: fusion().projects.filter((p) => p.source !== 'manual').length,
        scans: meta.scans ?? null,
        // Read from Checkmarx One: the engines whose findings the projection counts ([] = every engine).
        ...(meta.source === 'cxone' ? { engines: meta.engineSplit === false ? [] : cleanEngines(meta.engines) } : {}),
        scoped: scopeActive(sc),
        scope: sc,
        // Read from Checkmarx One: one branch per project, or every branch; and the projects left out as having nothing to analyse.
        ...(meta.source === 'cxone' && meta.branches ? { branches: meta.branches } : {}),
        leftOut: leftOutCounts(sc),
        // The projects picked one by one, by name: only with the project details.
        details,
        ...(details ? { projectNames: sc.projects.map((id) => fusion().projects.find((p) => p.id === id)?.name ?? id) } : {}),
        // Not every scan origin: those whose scans were counted (Fusion only, when the backlog came from the two exports).
        ...(() => {
          const known = knownOrigins().map((x) => x.origin);
          if (!sc.origins || !known.length) return {};
          return { origins: known.filter((o) => sc.origins.includes(o)), ...(t && meta.source !== 'cxone' ? { originsFusionOnly: true } : {}) };
        })(),
      },
      tr: null,
      fusion: null,
      // What the triage & remediation credits give back, with this customer's assumptions (worked out with the rest).
      impact: impactOn() ? true : null,
      // Fusion for the customer's new code (not in Checkmarx One yet): its lines counted from git (cloc-fusion's
      // engine, with how often each repository changes), read from a cloc-fusion report, or counted with cloc.
      fusionNew: fnCounted
        ? {
            periodMonths: fn.settings.periodMonths,
            defaultScans: fn.settings.defaultScans,
            defaultModel: fn.settings.defaultModel,
            models: fn.settings.models,
            rules: fn.settings.byFrequency,
            leftOut: fn.settings.leftOut,
            byModel: fn.byModel,
            byFrequency: fn.byFrequency,
            totals: fn.totals,
            // Added on top of Checkmarx One: only the repositories that are not projects there.
            onTop: fn.settings.onTop === true,
            details,
            rows: details ? fn.rows.filter((r) => r.inBasis).map((r) => ({ name: r.name, file: r.file, included: r.included, lines: r.lines, units: r.units, frequency: r.frequency, commits: r.commits, windowDays: r.activity?.windowDays ?? null, devs90: r.devs90, criticality: r.criticality, scans: r.scans, scansFrom: r.scansFrom, model: r.model, credits: r.credits, languages: r.languages.filter((l) => l.counted && l.lines > 0).slice(0, 6) })) : [],
          }
        : null,
    };
    // Open vulnerabilities by project and severity (ticked, with the project names): from the last read of Checkmarx One.
    if ($('calc-sev-report')?.checked && details) {
      const rows = (fusion()?.projects ?? [])
        .filter((p) => p.source !== 'manual' && p.openBySeverity)
        .map((p) => ({ name: p.name, sev: Object.fromEntries(SEVERITIES.map((s) => [s, p.openBySeverity[s] ?? 0])) }))
        .map((r) => ({ ...r, total: SEVERITIES.reduce((n, s) => n + r.sev[s], 0) }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      if (rows.length) base.bySeverity = { severities: [...SEVERITIES], rows };
    }
    return { ...leverData(base, levers), levers };
  }

  const hasData = () => Boolean(c.open?.tr?.totals || c.open?.fusion?.projects?.length || c.open?.fusionNew?.projects?.length);

  /**
   * One click: read Checkmarx One first when nothing is read yet (or follow the read running), then
   * make the report with every default in place. Returns the report and its file, or null.
   */

  async function generate({ download: save = true } = {}) {
    if (!c.open) return null;
    await flush();
    if (!offline() && (reading.timer || !hasData())) {
      const done = readFinished();
      if (!reading.timer) readCxOne();
      setStatus('calc-read-note', 'Reading Checkmarx One first, then the report is made…', 'muted');
      await done;
      await flush();
    }
    const data = reportData();
    // Code that was only counted (Fusion · from Git) is something to report too: a Fusion-only customer has nothing else.
    if (!data.tr && !data.fusion && !data.fusionNew) {
      toast(offline() ? 'Nothing to report yet: drop the two Checkmarx One exports below (or load the sample data), or add Fusion projects first.' : 'Nothing to report yet: read Checkmarx One (or use the two exports), or add Fusion projects first.', 'warn');
      return null;
    }
    try {
      const { report } = await api('/api/projections/reports', { method: 'POST', body: JSON.stringify({ customerId: c.open.id, data }) });
      const html = await reportHtml(data, report.createdAt);
      if (save) download(new Blob([html], { type: 'text/html' }), reportFileName(report.customer, report.createdAt));
      // Once the report is made, its three-page PDF summary can be downloaded too.
      d.lastMade = { customerId: c.open.id, report, data };
      $('calc-pdf').hidden = false;
      loadReports();
      return { report, html, data };
    } catch (error) {
      if (!handleAuthLoss(error)) toast(error.message, 'bad');
      return null;
    }
  }
  $('calc-generate').addEventListener('click', () => generate());

  /** The three-page PDF summary of a generated report, drawn here in the page's language. */
  async function downloadPdf(report, data = report.data) {
    const button = $('calc-pdf');
    button.disabled = true;
    try {
      // The appendix of calculations only when asked for (unticked unless the reader ticks it).
      const pdf = await slidesPdf({ ...data, generatedAt: report.createdAt }, { t, lang: currentLanguage(), dir: RTL.has(currentLanguage()) ? 'rtl' : 'ltr', look: appLook(), calculations: $('calc-pdf-calculations').checked });
      download(pdf, slidesFileName(report.customer, report.createdAt));
      window.mzReportActivity?.('event', 'Downloaded the calculator PDF summary');
    } catch (error) {
      toast(`The PDF could not be made: ${error.message}`, 'bad');
    } finally {
      button.disabled = false;
    }
  }
  $('calc-pdf').addEventListener('click', () => d.lastMade && downloadPdf(d.lastMade.report, d.lastMade.data));

  // Email: the report is made (as with Generate) and sent as a file, in the page's language.
  $('calc-email-open').addEventListener('click', () => {
    const form = $('calc-email-form');
    form.hidden = !form.hidden;
    $('calc-email-open').setAttribute('aria-expanded', String(!form.hidden));
    setStatus('calc-email-status', '');
    if (!form.hidden) $('calc-email-to').focus();
  });
  $('calc-email-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const to = $('calc-email-to').value.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean);
    if (!to.length) return setStatus('calc-email-status', 'Type at least one email address.', 'error');
    setStatus('calc-email-status', 'Making the report…', 'muted');
    const made = await generate({ download: false });
    if (!made) return setStatus('calc-email-status', '');
    const sum = made.data.summary;
    const lines = [
      t('{0}: Checkmarx credits projection').replace('{0}', made.report.customer),
      t('Total credits required: {0} ({1} bundles of {2}), over {3} months.').replace('{0}', num(sum.total, 1)).replace('{1}', num(sum.bundles)).replace('{2}', num(sum.settings.bundleCredits)).replace('{3}', num(made.data.months)),
      t('The full projection is attached: open it in any browser.'),
    ];
    try {
      const body = await api(`/api/projections/reports/${encodeURIComponent(made.report.id)}/email`, { method: 'POST', body: JSON.stringify({ to, html: made.html, subject: lines[0], lines: lines.slice(1) }) });
      setStatus('calc-email-status', body.sent === 1 ? 'Sent to 1 address.' : `Sent to ${num(body.sent)} addresses.`, 'ok');
    } catch (error) {
      if (!handleAuthLoss(error)) showError('calc-email-status', error);
    }
  });

  // Start again: every choice made for this customer goes back to the defaults, and Checkmarx One is read again.
  $('calc-restart').addEventListener('click', async () => {
    if (!c.open) return;
    const again = offline() ? 'and the two exports are cleared' : 'and Checkmarx One is read again';
    if (!await sure(`Start again for ${c.open.name}?\n\nEvery choice made here goes back to the defaults (the projects narrowed, the plan, the Fusion numbers, the extra credits), ${again}. The Fusion models and their credits stay. Reports already made are kept.`)) return;
    const models = fusion().models;
    c.open.scope = cleanScope({});
    c.open.tr = { totals: null, fixed: null, selected: Object.fromEntries(SEVERITIES.map((s) => [s, null])), triageCost: { ...DEFAULT_TR.triageCost }, fpPercent: { ...DEFAULT_TR.fpPercent }, remediationCost: { ...DEFAULT_TR.remediationCost }, lookbackMonths: DEFAULT_TR.lookbackMonths, ...aheadSettings({}) };
    c.open.fusion = { ...fusionSettings({ models, defaultModel: models[0]?.id }), projects: [], readAt: null };
    c.open.totals = totalsSettings({});
    save({ scope: c.open.scope, tr: c.open.tr, fusion: c.open.fusion, totals: c.open.totals });
    show(c.open);
    readCxOne();
  });

  async function loadReports() {
    if (!c.open && $('calc-reports-mine').checked) {
      c.reports = [];
      return renderReports();
    }
    try {
      const mine = $('calc-reports-mine').checked;
      c.reports = (await api(`/api/projections/reports${mine && c.open ? `?customer=${encodeURIComponent(c.open.id)}` : ''}`, { quiet: true })).reports ?? [];
    } catch (error) {
      if (handleAuthLoss(error)) return;
      c.reports = [];
    }
    renderReports();
  }

  function renderReports() {
    $('calc-reports-empty').hidden = c.reports.length > 0;
    const count = $('calc-saved-count');
    if (count) count.textContent = c.reports.length ? `(${num(c.reports.length)})` : '';
    $('calc-reports').innerHTML = c.reports
      .map(
        (r) => `<tr data-report="${esc(r.id)}">
        <td translate="no">${esc(r.customer)}</td>
        <td><time translate="no">${esc(fmtDateTime(r.createdAt))}</time></td>
        <td translate="no">${esc(r.createdBy)}</td>
        <td class="num">${r.trCredits === null ? '—' : num(Math.round(r.trCredits))}</td>
        <td class="num">${r.fusionCredits === null ? '—' : num(Math.round(r.fusionCredits))}</td>
        <td class="num">${r.extraPercent ? `${num(r.extraPercent, 2)}%` : '—'}</td>
        <td class="num"><b>${num(Math.round(r.totalCredits))}</b></td>
        <td class="num">${r.bundles === undefined ? '—' : num(r.bundles)}</td>
        <td><button type="button" class="secondary" data-download>Download</button> <button type="button" class="ghost" data-pdf>PDF</button> ${can('reports.delete') ? '<button type="button" class="ghost calc-remove" data-delete-report>Delete</button>' : ''}</td></tr>`,
      )
      .join('');
  }

  $('calc-reports-mine').addEventListener('change', loadReports);
  $('calc-reports').addEventListener('click', async (event) => {
    const id = event.target.closest('tr[data-report]')?.dataset.report;
    if (!id) return;
    try {
      if (event.target.closest('[data-download]')) {
        const { report } = await api(`/api/projections/reports/${encodeURIComponent(id)}`, { quiet: true });
        download(new Blob([await reportHtml(report.data, report.createdAt)], { type: 'text/html' }), reportFileName(report.customer, report.createdAt));
      } else if (event.target.closest('[data-pdf]')) {
        const { report } = await api(`/api/projections/reports/${encodeURIComponent(id)}`, { quiet: true });
        await downloadPdf(report);
      } else if (event.target.closest('[data-delete-report]')) {
        if (!await sure('Delete this projection report? It cannot be undone.')) return;
        await api(`/api/projections/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
        loadReports();
      }
    } catch (error) {
      if (!handleAuthLoss(error)) toast(error.message, 'bad');
    }
  });

  gateImpact();

  return { download, fillImpact, gateImpact, loadReports, renderSummary, reportData, totals };
}
