import { cleanEngines, DEFAULT_ENGINES, ENGINES } from '../engines.js';
import { currentLanguage, RTL, t } from '../i18n.js';
import { debtFixChart, forecastChart, SEVERITY_COLOURS, severityCharts } from './charts.js';
import { allSections, sectionHtml } from './explain.js';
import { aheadMonths, aheadSettings, amount, analyse, DEFAULT_TR, FREQUENCIES, LOOKBACKS, planForecast, seriesRows, SEVERITIES, severityPlan, sharesFull, trProjection, weeklyTrend } from './model.js';
import { wording } from './report.js';

/**
 * Triage & remediation: the backlog, the plan per severity, the forecast, and how each number is worked out.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupTr(d) {
  const {
    $, c, esc, fmtDateTime, num, offline, sampleFile, save, setStatus,
  } = d;
  // ---- Triage & remediation -----------------------------------------------------------------

  const tr = () => c.open.tr;

  function syncDraft() {
    for (const s of SEVERITIES) {
      c.draft[s] = { selected: tr().selected[s] ?? null, triageCost: tr().triageCost[s], fpPercent: tr().fpPercent[s], remediationCost: tr().remediationCost[s] };
      c.dirty[s] = false;
    }
  }

  /** The projection period (months), shared by both parts. */
  const horizon = () => d.fusion()?.periodMonths ?? 12;
  /** Whether this customer opted out of Fusion: then it is left out of the credits, the findings and the report. */
  const fusionOff = () => d.fusion()?.optOut === true;
  /** Whether Fusion is part of this projection: not opted out, and some project counted. */
  const fusionCounts = (est = d.estimate()) => !fusionOff() && est.rows.some((r) => r.included && r.units);
  const fusionOn = () => fusionCounts();

  /** The figures behind the tab and the report: null until the backlog is read. */
  function trFigures() {
    if (!c.open?.tr?.totals || !c.open.tr.fixed) return null;
    const { totalRows, fixedRows } = seriesRows(tr().totals, tr().fixed);
    const analysis = analyse(totalRows, fixedRows, tr().lookbackMonths);
    if (!analysis) return null;
    // Fusion's extra findings are SAST's: its own part of the read, when the read told engines apart.
    const sastRows = tr().totals.sast && tr().fixed.sast ? seriesRows(tr().totals, tr().fixed, 'sast') : null;
    const sast = sastRows ? analyse(sastRows.totalRows, sastRows.fixedRows, tr().lookbackMonths) : null;
    const projection = trProjection(analysis, tr(), { months: horizon(), fusion: fusionOn(), sast });
    return {
      analysis,
      sast,
      // The debt and fixing rates over the last 6 months, for the report, whatever the trend is averaged over.
      recent: analyse(totalRows, fixedRows, 6),
      projection,
      // Week by week over the months the trend is averaged over, at least 6 (as far back as the data goes).
      // Loaded from a report, the series is rebuilt from months, so the report's own weekly rates are drawn instead.
      weekly: fromReport() ? reportWeeks(analysis) : weeklyTrend(totalRows, fixedRows, Math.round(Math.max(6, tr().lookbackMonths) * 4.345)),
      forecast: planForecast(analysis, projection),
      bySeverity: severityPlan(analysis, projection),
    };
  }

  let vendor = null;
  /** The .xlsx reader and the export parser, loaded the first time a file is read. */
  function readers() {
    // In the standalone file they are already in the page.
    if (window.CxXlsx && window.CxParse) return Promise.resolve({ xlsx: window.CxXlsx, parse: window.CxParse });
    vendor ??= Promise.all(
      ['calculator/vendor/xlsx-lite.js', 'calculator/vendor/parse.js'].map(
        (src) =>
          new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error('The file reader could not be loaded. Reload the page.'));
            document.head.append(script);
          }),
      ),
    ).then(() => ({ xlsx: window.CxXlsx, parse: window.CxParse }));
    return vendor;
  }

  /** Read one export into its slot (or the slot its name or filters say, when dropped together). */
  async function ingest(file, slot) {
    if (!c.open) return;
    setStatus('calc-upload-status', `Reading ${file.name}…`, 'muted');
    try {
      const { xlsx, parse } = await readers();
      const sheets = await xlsx.readFile(file);
      const kind = slot ?? (parse.guessKind(file.name, sheets) === 'fixed' ? 'fixed' : 'totals');
      const parsed = parse.parseWorkbook(sheets, file.name);
      c.open.tr = { ...tr(), [kind]: parsed };
      save({ tr: c.open.tr });
      setStatus('calc-upload-status', parsed.warnings?.length ? parsed.warnings.join(' ') : `${num(parsed.weeks.length)} weeks read.`, parsed.warnings?.length ? 'warn' : 'ok');
      syncDraft();
      renderTr();
    } catch (error) {
      setStatus('calc-upload-status', error.message, 'error');
    }
  }

  for (const slot of ['totals', 'fixed']) {
    const input = $(`calc-file-${slot}`);
    input.addEventListener('change', () => {
      for (const file of input.files) ingest(file, input.files.length > 1 ? null : slot);
      input.value = '';
    });
    const zone = $(`calc-slot-${slot}`);
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('over');
      const files = [...(event.dataTransfer?.files ?? [])];
      for (const file of files) ingest(file, files.length > 1 ? null : slot);
    });
  }
  $('calc-sample').addEventListener('click', async () => {
    for (const [name, slot] of [
      ['Total_Vulnerabilities_by_Severity.xlsx', 'totals'],
      ['Fixed_Vulnerabilities_by_Severity.xlsx', 'fixed'],
    ]) {
      try {
        const response = sampleFile ? await sampleFile(name) : await fetch(`calculator/samples/${name}`);
        if (!response.ok) throw new Error(`${name}: ${response.status}`);
        await ingest(new File([await response.blob()], name), slot);
      } catch (error) {
        setStatus('calc-upload-status', error.message, 'error');
      }
    }
  });
  $('calc-present').addEventListener('click', () => {
    c.present = !c.present;
    $('calc-present').setAttribute('aria-pressed', String(c.present));
    $('calc-present').textContent = c.present ? 'Exit customer view' : 'Customer view';
    $('page-calculator').classList.toggle('calc-presenting', c.present);
    document.body.classList.toggle('calc-presenting-on', c.present);
  });

  function renderSlots() {
    const t = tr()?.totals;
    const range = t?.weeks?.length ? ` · <span translate="no">${esc(t.weeks[0])} → ${esc(t.weeks[t.weeks.length - 1])}</span>` : '';
    $('calc-tr-source').innerHTML = !t
      ? offline()
        ? '<span>Nothing yet: drop the two Checkmarx One exports below, or load the sample data.</span>'
        : '<span>Nothing read yet: <strong>Read from Checkmarx One</strong> at the top reads the backlog and fixes, week by week.</span>'
      : t.meta?.source === 'cxone'
        ? `<b>From Checkmarx One</b> · <span>Last read <time translate="no">${esc(fmtDateTime(t.meta.readAt))}</time></span> · <span>${num(t.meta.projects)} projects, ${num(t.meta.scans)} scans</span>${range}`
        : t.meta?.layout === 'report'
          ? `<b>From an uploaded report</b> · <span>${esc(t.meta.fileName || '')}</span>${range} · <span>read Checkmarx One again for the week-by-week detail</span>`
          : `<b>From the two exports</b>${range}`;
    for (const slot of ['totals', 'fixed']) {
      const s = tr()?.[slot];
      $(`calc-slot-${slot}`).classList.toggle('ok', Boolean(s));
      $(`calc-file-${slot}-name`).innerHTML = s ? `${s.meta?.fileName ? `<span translate="no">${esc(s.meta.fileName)}</span>` : '<span>Saved data</span>'} · <span>${num(s.weeks.length)} weeks</span> · <span translate="no">${esc(s.weeks[0])} → ${esc(s.weeks[s.weeks.length - 1])}</span>` : 'Choose or drop the .xlsx export';
    }
  }

  /** The engines whose findings are projected (SAST and SCA unless more are ticked). */
  const trEngines = () => (cleanEngines(tr()?.engines).length ? cleanEngines(tr().engines) : [...DEFAULT_ENGINES]);

  /** Which engines' findings the projection counts: read from Checkmarx One, each engine is counted apart. */
  function enginesRow() {
    const meta = tr()?.totals?.meta ?? {};
    const live = meta.source === 'cxone';
    const chosen = new Set(trEngines());
    const note = !live
      ? `<span class="hint">${offline() ? 'The two exports count every engine together.' : 'The two exports count every engine together: read from Checkmarx One to count only some.'}</span>`
      : meta.engineSplit === false
        ? '<span class="hint calc-warn">This read is from before engines were counted apart, so every engine is counted: read from Checkmarx One again to count only these.</span>'
        : '<span class="hint">AI Triage and AI Remediation credits are spent on SAST and SCA findings.</span>';
    // Only some scan origins chosen, but this backlog counts every scan: said, with what to do.
    const origins = !d.scope().origins
      ? ''
      : !live
        ? '<span class="hint calc-warn">The two exports count every scan: only Fusion follows Include scans from.</span>'
        : meta.originSplit === false
          ? '<span class="hint calc-warn">This read is from before scan origins were recorded, so every scan is counted: read from Checkmarx One again to count only the scans chosen.</span>'
          : '';
    // By how often projects are scanned: how much of each group's findings is counted (as Fusion's scans are set by
    // the same groups). Every group in full unless set.
    const all = live ? d.fusion().projects.filter((p) => p.source !== 'manual' && d.counts(p)) : [];
    const shares = aheadSettings(tr()).shares;
    const inGroup = (id) => all.filter((p) => (p.frequency ?? 'rare') === id).length;
    const full = all.filter((p) => shares[p.frequency ?? 'rare'] === 100).length;
    const out = all.filter((p) => shares[p.frequency ?? 'rare'] === 0).length;
    const active = `<div class="calc-shares calc-edit">
          <div class="calc-shares-head"><b>Findings counted, by how often projects are scanned</b>
            <span class="hint">${live ? (sharesFull(shares) ? `Every project’s findings are counted (${num(all.length)} projects).` : `${num(full)} of ${num(all.length)} projects counted in full${out ? `, ${num(out)} left out` : ''}${all.length - full - out ? `, ${num(all.length - full - out)} in part` : ''}.`) : 'After a read from Checkmarx One: the two exports do not say which project a finding is in.'}</span>
            ${live ? '<button type="button" class="link" data-shares="active" title="100% for projects scanned at least once a month, 0% for the rest">Active projects only</button><button type="button" class="link" data-shares="all">Every project</button>' : ''}</div>
          <div class="calc-shares-grid">${FREQUENCIES.map((f) => `<label class="calc-share${shares[f.id] === 100 ? '' : shares[f.id] === 0 ? ' out' : ' changed'}" title="${esc(f.label)}"><span class="calc-share-name">${esc(f.short)}</span><span class="calc-share-in"><input type="text" inputmode="numeric" class="calc-num" data-share="${f.id}" value="${shares[f.id]}" aria-label="${esc(f.label)}: % of findings counted"${live ? '' : ' disabled'} /><i>%</i></span><span class="calc-share-n">${live ? `${num(inGroup(f.id))} projects` : '—'}</span></label>`).join('')}</div>
        </div>`;
    return `${active}<div class="calc-engines calc-edit" role="group" aria-label="Engines counted">
          <span class="hint"><b>Engines counted</b></span>
          ${live ? ENGINES.map((e) => `<label class="pill-check"><input type="checkbox" data-engine="${e.key}"${chosen.has(e.key) ? ' checked' : ''} /> <span translate="no">${e.label}</span>${e.ai ? '' : ' <small>No AI</small>'}</label>`).join('') : ''}
          ${note}${origins}
        </div>`;
  }

  function renderTr() {
    if (!c.open) return;
    renderSlots();
    const f = trFigures();
    c.trCredits = f ? f.projection.totals.credits : null;
    c.trSplit = f ? f.projection.totals : null;
    d.renderSummary();
    if (!f) {
      $('calc-tr').innerHTML = offline()
        ? '<p class="hint calc-wait">Drop the two Checkmarx One exports (or load the sample data) to see the backlog, its trend and the credits it takes.</p>'
        : '<p class="hint calc-wait">Read from Checkmarx One (or use the two exports) to see the backlog, its trend and the credits it takes.</p>';
      return;
    }
    const { analysis, projection } = f;
    c.trFusionOn = projection.fusion;
    const P = projection.totals;
    const A = projection.ahead;
    const months = projection.months;
    const sevHead = (s) => `<th><span class="calc-sev"><i translate="no" style="background:${SEVERITY_COLOURS[s]}"></i>${s}</span></th>`;
    const row = (label, cells, total, cls = '') => `<tr class="${cls}"><td>${label}</td>${cells.map((v) => `<td class="num">${v}</td>`).join('')}<td class="num calc-total">${total}</td></tr>`;
    const R = projection.rows;
    const step = (label, value, sub, cls = '', why = '') => `<div class="calc-step ${cls}"><span class="calc-step-label">${label}${why ? whyButton(why) : ''}</span><b>${value}</b><small>${sub}</small></div>`;
    $('calc-tr').innerHTML = `
      <p class="calc-snapshot">Backlog as of <time>${esc(analysis.latestDate)}</time>; the trend over the ${num(tr().lookbackMonths)} months before it.</p>
      <section class="panel calc-flow">
        <div class="calc-section-head"><h2>What the projection counts</h2>
          <div class="calc-lookback calc-edit" role="group" aria-label="Trend over">${LOOKBACKS.map((m) => `<button type="button" class="${tr().lookbackMonths === m ? 'on' : ''}" aria-pressed="${tr().lookbackMonths === m}" data-lookback="${m}">${m} months</button>`).join('')}</div></div>
        ${enginesRow()}
        <div class="calc-steps">
          ${step('Backlog today', num(P.selected), P.selected === P.backlog ? 'every open finding' : `of ${num(P.backlog)} open`, '', 'backlog')}
          <span class="calc-op" aria-hidden="true">+</span>
          ${step('Still to come', num(P.future), !A.includeFuture ? 'not counted' : A.newPacePercent === 100 ? `${num(P.arrivals)} a month × ${num(projection.paced, 1)} months` : `${num(P.arrivals)} a month × ${num(aheadMonths(projection.months, A.aiDeclinePercent), 1)} months × ${num(A.newPacePercent)}%`, '', 'future')}
          <span class="calc-op" aria-hidden="true">+</span>
          ${step('More found by Fusion', num(P.fusionExtra), projection.fusion ? (projection.sastOnly ? `${num(A.fusionUpliftPercent)}% more SAST findings` : tr().totals?.meta?.source === 'cxone' ? `${num(A.fusionUpliftPercent)}% more findings · read again for SAST only` : `${num(A.fusionUpliftPercent)}% more findings · the exports count every engine`) : fusionOff() ? '0% · Fusion left out' : 'Fusion not in the projection', '', 'fusion')}
          <span class="calc-op" aria-hidden="true">=</span>
          ${step('To triage', num(P.toTriage), `${num(P.truePositives)} to remediate`, 'calc-step-key', 'triage')}
          <span class="calc-op" aria-hidden="true">→</span>
          ${step('Credits', num(P.credits, 1), `${num(P.backlogCredits, 1)} backlog + ${num(P.aheadCredits, 1)} ahead`, 'calc-step-gold', 'credits')}
        </div>
        <div class="calc-assume calc-edit">
          <label class="check"><input type="checkbox" data-ahead="includeFuture"${A.includeFuture ? ' checked' : ''} /> Count findings still to come</label>
          <label class="calc-assume-num"><span>New findings counted (%)</span><input type="text" inputmode="decimal" class="calc-num" data-ahead="newPacePercent" value="${esc(A.newPacePercent)}"${A.includeFuture ? '' : ' disabled'} /></label>
          <label class="calc-assume-num"><span>AI adoption: fewer new findings over a year (%)</span><input type="text" inputmode="decimal" class="calc-num" data-ahead="aiDeclinePercent" value="${esc(A.aiDeclinePercent)}" /></label>
          <label class="calc-assume-num"${fusionOff() ? ' title="Fusion · Checkmarx One is left out of this projection: use it on its tab to count it."' : ''}><span>More found by Fusion (%)</span><input type="text" inputmode="decimal" class="calc-num" data-ahead="fusionUpliftPercent" value="${esc(fusionOff() ? 0 : A.fusionUpliftPercent)}"${fusionOff() ? ' disabled' : ''} /></label>
          <button type="button" class="link" data-ahead-reset>Defaults</button>
        </div>
        ${A.includeFuture ? `<p class="hint calc-pace-note"><b>New findings counted</b>: 100% counts as many new findings a month as the last ${num(tr().lookbackMonths)} months had (${num(P.arrivals)} a month), 50% half as many, 0% none. Lower it when the customer expects fewer new findings, raise it when more code or projects are coming.</p>` : ''}
      </section>
      <details class="panel calc-edit calc-custom" open>
        <summary><h2>Customize per severity</h2><span class="hint">How many of the backlog to triage, the false positives expected, and the credits each step takes. Everything starts from the defaults.</span></summary>
        <label class="calc-fp-one" title="Your estimate for this customer: the share of findings triaged that are false positives (triaged, never remediated). The same for every severity."><span>False positives</span><input type="number" min="0" max="100" step="1" inputmode="decimal" value="${esc(fpOne())}" data-fp-one aria-label="False positives % (every severity)" /><span>%</span></label>
        <div class="calc-sev-grid">${SEVERITIES.map((s) => {
          const d = c.draft[s];
          const open = analysis.perSeverity[s].current;
          const chosen = d.selected === null || d.selected === undefined ? open : Math.min(d.selected, open);
          return `<div class="calc-sev-box" data-sev="${s}">
            <div class="calc-sev-top"><span class="calc-sev"><i translate="no" style="background:${SEVERITY_COLOURS[s]}"></i>${s}</span><span class="hint">${num(open)} open</span></div>
            <input type="range" min="0" max="${esc(open)}" value="${esc(chosen)}" data-f="selected" aria-label="${s}: to triage" style="--p:${fill(chosen, open)}%" />
            <div class="calc-row"><input type="number" min="0" max="${esc(open)}" value="${esc(chosen)}" data-f="selected" aria-label="${s}: to triage" />
              <span><button type="button" class="ghost small-btn" data-set="0">None</button><button type="button" class="ghost small-btn" data-set="all">All</button></span></div>
            <label class="calc-row"><span>Credits per triage</span><input type="number" min="0" step="0.5" value="${esc(d.triageCost)}" data-f="triageCost" disabled title="Set by the Admin for everyone" /></label>
            <label class="calc-row"><span>Credits per remediation</span><input type="number" min="0" step="0.5" value="${esc(d.remediationCost)}" data-f="remediationCost" disabled title="Set by the Admin for everyone" /></label>
            <p class="calc-sev-result"><span>To triage</span> <b>${num(R[s].toTriage)}</b> · <span>to remediate</span> <b>${num(R[s].truePositives)}</b> · <b class="calc-gold">${num(R[s].credits, 1)}</b> <span>credits</span></p>
            <button type="button" class="${c.dirty[s] ? 'primary' : 'secondary'} calc-apply" data-apply${c.dirty[s] ? '' : ' disabled'}>${c.dirty[s] ? 'Apply' : 'Applied'}</button>
          </div>`;
        }).join('')}</div>
        <p class="hint">Credits per triage and per remediation start at Checkmarx One's 1 and 3: set them to the customer's agreement. The false positives (one % for every severity, above) are your estimate for this customer.</p>
      </details>
      ${debtFixSection(analysis, f.weekly)}
      <section class="panel">
        <h2>Backlog trend and forecast</h2>
        <p class="hint">${analysis.monthlyChange >= 0 ? `The backlog grew by ${num(analysis.monthlyChange)} a month on average recently.` : `The backlog shrank by ${num(-analysis.monthlyChange)} a month on average recently.`} Shaded: the next ${num(months)} months.</p>
        ${forecastChart(f.forecast)}
      </section>
      <section class="panel">
        <h2>By severity</h2>
        <p class="hint">The backlog so far, then with the plan over the next ${num(months)} months (dashed). Each severity on its own scale.</p>
        ${severityCharts(f.bySeverity)}
      </section>
      ${byProjectSeverity()}`;
  }

  /** The consolidated backlog by project and severity (from Read from Checkmarx One); empty without per-project data. */
  /** How much of a project's findings triage & remediation counts (0 to 100): its group's share, or 0 when left out by hand. */
  const trShareOf = (p, A = aheadSettings(tr())) => (A.excluded.includes(String(p.id)) ? 0 : A.shares[p.frequency ?? 'rare'] ?? 100);
  let planFind = '';
  /**
   * The plan by project: every project of the scope with its open findings, how often it is scanned, and how much of
   * it is counted. Untick one to leave it out; the shares by scan frequency (above) and the scope (at the top) set
   * the rest. Empty without per-project data (a read from Checkmarx One).
   */
  function byProjectSeverity() {
    const A = aheadSettings(tr());
    const live = tr()?.totals?.meta?.source === 'cxone';
    const rows = (d.fusion()?.projects ?? [])
      .filter((p) => p.source !== 'manual' && p.openBySeverity && d.counts(p))
      .map((p) => ({ id: String(p.id), name: p.name, frequency: p.frequency ?? 'rare', share: trShareOf(p, A), byHand: A.excluded.includes(String(p.id)), sev: p.openBySeverity, total: SEVERITIES.reduce((n, s) => n + (p.openBySeverity[s] ?? 0), 0) }))
      .filter((r) => r.total > 0);
    if (!rows.length) return '';
    // The projects scanned most often first (then the ones with the most open findings).
    const rank = Object.fromEntries(FREQUENCIES.map((f, i) => [f.id, i]));
    rows.sort((a, b) => (rank[a.frequency] ?? 99) - (rank[b.frequency] ?? 99) || b.total - a.total || a.name.localeCompare(b.name));
    // Only part of a severity in the plan (Customize per severity): it is taken from the projects scanned most often
    // first, in this order, until the number chosen is reached.
    const chosen = tr()?.selected ?? {};
    const partial = [];
    for (const s of SEVERITIES) {
      const limit = chosen[s] === null || chosen[s] === undefined ? null : Math.max(0, Number(chosen[s]) || 0);
      let left = limit;
      for (const r of rows) {
        const mine = ((r.sev[s] ?? 0) * r.share) / 100;
        const take = left === null ? mine : Math.min(mine, left);
        if (left !== null) left -= take;
        (r.counted ??= {})[s] = take;
      }
      if (limit !== null && rows.reduce((n, r) => n + ((r.sev[s] ?? 0) * r.share) / 100, 0) > limit) partial.push(s);
    }
    const counted = (r, s) => r.counted[s];
    const tot = Object.fromEntries(SEVERITIES.map((s) => [s, rows.reduce((n, r) => n + counted(r, s), 0)]));
    const grand = SEVERITIES.reduce((n, s) => n + tot[s], 0);
    const open = rows.reduce((n, r) => n + r.total, 0);
    const got = (r) => SEVERITIES.reduce((n, s) => n + counted(r, s), 0);
    const inFull = rows.filter((r) => Math.round(got(r)) >= r.total).length;
    const out = rows.filter((r) => got(r) === 0).length;
    const short = (id) => FREQUENCIES.find((f) => f.id === id)?.short ?? id;
    const head = (s) => `<th class="num"><span class="calc-sev"><i translate="no" style="background:${SEVERITY_COLOURS[s]}"></i>${s}</span></th>`;
    const q = planFind.trim().toLowerCase();
    const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    return `
      <details class="panel calc-fold calc-byproject" open>
        <summary><h2>The plan by project</h2><span class="hint">Open findings, and what triage &amp; remediation counts of them</span></summary>
        <div class="calc-plan-bar calc-edit">
          <span class="hint"><b>${num(Math.round(grand))}</b> of ${num(open)} open findings counted · ${num(inFull)} of ${num(rows.length)} projects in full${out ? ` · ${num(out)} left out` : ''}${rows.length - inFull - out ? ` · ${num(rows.length - inFull - out)} in part` : ''}</span>
          <input type="search" class="calc-plan-find" data-plan-find placeholder="Find a project" value="${esc(planFind)}" aria-label="Find a project" />
          ${live ? '<button type="button" class="secondary" data-plan="all">Count all</button><button type="button" class="secondary" data-plan="none">Count none</button>' : ''}
        </div>
        <div class="table-wrap calc-plan-wrap"><table class="data-table calc-byproject-table">
          <thead><tr><th class="calc-plan-c">Count</th><th>Project</th><th>Scanned</th><th class="num">Counted</th>${SEVERITIES.map(head).join('')}<th class="num">Total</th></tr></thead>
          <tbody>${shown.map((r) => `<tr class="${SEVERITIES.every((s) => counted(r, s) === 0) ? 'calc-plan-out' : ''}" data-plan-row="${esc(r.id)}">
            <td class="calc-plan-c"><input type="checkbox" data-plan-project="${esc(r.id)}"${r.byHand ? '' : ' checked'}${live ? '' : ' disabled'} aria-label="Count ${esc(r.name)}" /></td>
            <td translate="no" class="calc-plan-name" title="${esc(r.name)}">${esc(r.name)}</td><td class="calc-plan-f">${esc(short(r.frequency))}</td><td class="num">${r.total ? num(Math.round((SEVERITIES.reduce((n, s) => n + counted(r, s), 0) / r.total) * 100)) : 0}%</td>
            ${SEVERITIES.map((s) => { const c2 = Math.round(counted(r, s)); const open2 = r.sev[s] ?? 0; return `<td class="num${c2 < open2 ? ' calc-plan-part' : ''}"${c2 < open2 ? ` title="${num(c2)} of ${num(open2)} open counted"` : ''}>${c2 < open2 ? `${num(c2)}<small> of ${num(open2)}</small>` : num(open2)}</td>`; }).join('')}<td class="num calc-total">${num(Math.round(SEVERITIES.reduce((n, s) => n + counted(r, s), 0)))}</td></tr>`).join('') || `<tr><td colspan="${SEVERITIES.length + 5}" class="hint">No project matches.</td></tr>`}</tbody>
          <tfoot><tr><td></td><td>Counted</td><td></td><td class="num">${open ? num(Math.round((grand / open) * 100)) : 0}%</td>${SEVERITIES.map((s) => `<td class="num">${num(Math.round(tot[s]))}</td>`).join('')}<td class="num calc-total">${num(Math.round(grand))}</td></tr></tfoot>
        </table></div>
        <p class="hint">The projects scanned most often come first. Follows the projects chosen at the top (scope) and the shares by scan frequency above${partial.length ? `; only part of ${partial.join(', ')} is in the plan (Customize per severity), taken from the projects scanned most often first` : ''}. ${live ? 'Untick a project to leave it out of triage &amp; remediation; Fusion keeps it.' : 'To change it, read from Checkmarx One: the two exports do not say which project a finding is in.'}</p>
      </details>`;
  }

  /**
   * Debt added against fixes: one sentence, the timeline, and by severity what new findings add
   * and fixes take away a month (each also as a share of the backlog), and the difference.
   */
  /**
   * A loaded report's weekly rates over the months its figures are worked out over (from the trend's start), as the
   * table under the chart has them; all of them when that leaves too few weeks to draw.
   */
  function reportWeeks(analysis) {
    const all = tr().totals.meta?.weekly ?? [];
    const from = String(analysis?.previousDate ?? '').slice(0, 10);
    const recent = from ? all.filter((w) => w.date >= from) : all;
    return recent.length >= 4 ? recent : all;
  }

  /** Whether the backlog's series was loaded from an uploaded report (rebuilt from months, not read week by week). */
  function fromReport() {
    return tr()?.totals?.meta?.layout === 'report';
  }

  function debtFixSection(analysis, weekly) {
    const T = analysis.total;
    const share = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : ` <small>${num(v, 1)}%</small>`);
    const net = (v) => (!Number.isFinite(v) ? '—' : Math.round(v) > 0 ? `<span class="calc-bad">▲ +${num(v)}</span>` : Math.round(v) < 0 ? `<span class="calc-good">▼ −${num(-v)}</span>` : '0');
    const line = (label, x, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="num">${num(x.current)}</td><td class="num">${num(x.arrivals)}${share(x.addedPct)}</td><td class="num">${num(x.fixedMonthly)}${share(x.fixedPct)}</td><td class="num">${net(x.netMonthly)}</td></tr>`;
    const faster = T.fixedMonthly > 0 && T.arrivals > T.fixedMonthly ? T.arrivals / T.fixedMonthly : null;
    const verdict = !Number.isFinite(T.netMonthly)
      ? ''
      : T.netMonthly > 0
        ? faster ? `The backlog grows by ${num(T.netMonthly)} a month: fixing would have to be ${num(faster, 1)} times as fast to keep up.` : `The backlog grows by ${num(T.netMonthly)} a month.`
        : `The backlog shrinks by ${num(-T.netMonthly)} a month.`;
    return `<section class="panel calc-debtfix">
        <h2>Debt added against fixes</h2>
        <p class="calc-verdict"><span>Each month, new findings add ${num(T.addedPct, 1)}% to the backlog and fixes take away ${num(T.fixedPct, 1)}%.</span> <span>${verdict}</span></p>
        ${weekly?.length ? debtFixChart(weekly) : fromReport() ? '<p class="hint">The report this was loaded from kept the month\'s figures, not the weeks, so there is no weekly chart. Read Checkmarx One again to see it.</p>' : ''}
        <div class="table-wrap"><table class="data-table calc-debt-table">
          <thead><tr><th>Severity</th><th class="num">Open now</th><th class="num">Added a month</th><th class="num">Fixed a month</th><th class="num">Change a month</th></tr></thead>
          <tbody>
            ${SEVERITIES.map((s) => line(`<span class="calc-sev"><i translate="no" style="background:${SEVERITY_COLOURS[s]}"></i>${s}</span>`, analysis.perSeverity[s])).join('')}
            ${line('Total', T, 'strong')}
          </tbody></table></div>
        <p class="hint">Over the last ${num(tr().lookbackMonths)} months. Percentages: a share of today's backlog. The estimates (Fusion, false positives, credits) are set above, under What the projection counts and Customize per severity.</p>
      </section>`;
  }

  // ---- "?": how each number is worked out, with the figures in -------------------------------

  const whyButton = (key) => `<button type="button" class="calc-why" data-why="${key}" aria-haspopup="dialog" aria-label="How is this worked out?" title="How is this worked out?">?</button>`;
  const WHY = { backlog: ['backlog'], future: ['future'], fusion: ['fusion'], triage: ['triage', 'remediate'], credits: ['credits'], 'fusion-credits': ['fusion-credits', 'fusion-new-credits'], total: ['total'] };
  const pop = document.createElement('div');
  pop.className = 'calc-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('translate', 'no');
  pop.hidden = true;
  document.body.append(pop);
  let popFor = null;
  const closePop = () => {
    pop.hidden = true;
    popFor?.setAttribute('aria-expanded', 'false');
    popFor = null;
  };
  function openPop(button) {
    if (popFor === button) return closePop();
    closePop();
    const data = d.reportData();
    const L = wording({ t, lang: currentLanguage() });
    // The summary's Fusion is both customers': with only the new customer's counted, the existing one's "not in this projection" is left out.
    const sections = allSections(data, L).filter((x) => WHY[button.dataset.why]?.includes(x.key) && !(x.key === 'fusion-credits' && !data.fusion && data.fusionNew));
    if (!sections.length) return;
    pop.innerHTML = `<button type="button" class="calc-pop-close" aria-label="${esc(t('Close'))}">×</button>${sections.map((x) => `<h4>${x.title}</h4>${sectionHtml(x)}`).join('')}`;
    pop.dir = RTL.has(currentLanguage()) ? 'rtl' : 'ltr';
    pop.hidden = false;
    const r = button.getBoundingClientRect();
    const width = Math.min(480, window.innerWidth - 24);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(12, Math.min(window.scrollX + r.left - 20, window.scrollX + window.innerWidth - width - 12))}px`;
    pop.style.top = `${window.scrollY + r.bottom + 8}px`;
    button.setAttribute('aria-expanded', 'true');
    popFor = button;
    pop.querySelector('.calc-pop-close').focus();
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.calc-why[data-why]');
    if (button) return openPop(button);
    if (event.target.closest('.calc-pop-close') || (!pop.hidden && !event.target.closest('.calc-pop'))) closePop();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !pop.hidden) {
      const back = popFor;
      closePop();
      back?.focus();
    }
  });

  /** What the report keeps of the analysis for one severity (or the total). */

  /** One false-positive % for every severity: the one most severities have (30% unless changed). */
  function fpOne() {
    const all = SEVERITIES.map((s) => Number(tr()?.fpPercent?.[s] ?? DEFAULT_TR.fpPercent[s]));
    const most = all.reduce((best, v) => (all.filter((x) => x === v).length > all.filter((x) => x === best).length ? v : best), all[0]);
    return Number.isFinite(most) ? most : DEFAULT_TR.fpPercent.Critical;
  }

  /** How far along its track a slider's thumb is, for the filled part (0 is at the very start). */
  const fill = (value, max) => (max > 0 ? Math.round((Math.min(value, max) / max) * 1000) / 10 : 0);

  function setDraft(box, field, value) {
    const s = box.dataset.sev;
    const max = Number(box.querySelector('input[type="range"]').max);
    if (field === 'selected' && value === 'all') value = max;
    let v = amount(value) ?? 0;
    if (field === 'selected') {
      v = Math.min(max, Math.round(v));
      for (const input of box.querySelectorAll('[data-f="selected"]')) if (Number(input.value) !== v) input.value = v;
      box.querySelector('input[type="range"]').style.setProperty('--p', `${fill(v, max)}%`);
    }
    if (field === 'fpPercent') v = Math.min(100, v);
    c.draft[s][field] = v;
    c.dirty[s] = true;
    const apply = box.querySelector('[data-apply]');
    apply.disabled = false;
    apply.className = 'primary calc-apply';
    apply.textContent = 'Apply';
  }

  $('calc-tr').addEventListener('input', (event) => {
    // Find a project in the plan: the rows that match, as it is typed (nothing is worked out again).
    if (event.target.matches('[data-plan-find]')) {
      planFind = event.target.value;
      const q = planFind.trim().toLowerCase();
      for (const row of $('calc-tr').querySelectorAll('[data-plan-row]')) row.hidden = Boolean(q) && !row.querySelector('.calc-plan-name').textContent.toLowerCase().includes(q);
      return;
    }
    const box = event.target.closest('.calc-sev-box');
    if (box && event.target.dataset.f) setDraft(box, event.target.dataset.f, event.target.value);
  });
  $('calc-tr').addEventListener('click', (event) => {
    const box = event.target.closest('.calc-sev-box');
    if (box && event.target.closest('[data-set]')) return setDraft(box, 'selected', event.target.closest('[data-set]').dataset.set);
    if (box && event.target.closest('[data-apply]')) {
      const s = box.dataset.sev;
      const d = c.draft[s];
      const open = Number(box.querySelector('input[type="range"]').max);
      c.open.tr = {
        ...tr(),
        // Every open finding stays "every open finding" (null), so a later read keeps it whole.
        selected: { ...tr().selected, [s]: d.selected === null || d.selected >= open ? null : d.selected },
        triageCost: { ...tr().triageCost, [s]: d.triageCost },
        fpPercent: { ...tr().fpPercent, [s]: d.fpPercent },
        remediationCost: { ...tr().remediationCost, [s]: d.remediationCost },
      };
      c.dirty[s] = false;
      save({ tr: c.open.tr });
      return renderTr();
    }
    const lookback = event.target.closest('[data-lookback]');
    if (lookback) {
      c.open.tr = { ...tr(), lookbackMonths: Number(lookback.dataset.lookback) };
      save({ tr: c.open.tr });
      renderTr();
    }
    const planAll = event.target.closest('[data-plan]');
    if (planAll) {
      const none = planAll.dataset.plan === 'none';
      c.open.tr = { ...tr(), excluded: none ? d.fusion().projects.filter((p) => p.source !== 'manual' && d.counts(p)).map((p) => String(p.id)) : [] };
      save({ tr: c.open.tr });
      return d.applyScope();
    }
    const pickShares = event.target.closest('[data-shares]');
    if (pickShares) {
      const activeOnes = pickShares.dataset.shares === 'active';
      const order = FREQUENCIES.map((f) => f.id);
      const was = tr();
      c.open.tr = { ...tr(), activeOnly: false, shares: Object.fromEntries(order.map((id, i) => [id, !activeOnes || i <= order.indexOf('month') ? 100 : 0])) };
      save({ tr: c.open.tr });
      return d.recountBacklog(was);
    }
    if (event.target.closest('[data-ahead-reset]')) {
      c.open.tr = { ...tr(), includeFuture: DEFAULT_TR.includeFuture, fusionUpliftPercent: DEFAULT_TR.fusionUpliftPercent, aiDeclinePercent: DEFAULT_TR.aiDeclinePercent, newPacePercent: DEFAULT_TR.newPacePercent };
      save({ tr: c.open.tr });
      renderTr();
    }
  });
  // What is still to come: changes count at once (the figures follow as it is typed).
  $('calc-tr').addEventListener('change', (event) => {
    // A project counted or left out, one by one.
    if (event.target.matches('[data-plan-project]')) {
      const id = event.target.dataset.planProject;
      const before = aheadSettings(tr()).excluded;
      const was = tr();
      c.open.tr = { ...tr(), excluded: event.target.checked ? before.filter((x) => x !== id) : [...before, id] };
      save({ tr: c.open.tr });
      return d.recountBacklog(was);
    }
    // A group's share of findings: the backlog is added up again from the last read.
    if (event.target.matches('[data-share]')) {
      const shares = { ...aheadSettings(tr()).shares, [event.target.dataset.share]: amount(event.target.value) ?? 100 };
      const was = tr();
      c.open.tr = { ...tr(), shares, activeOnly: false };
      save({ tr: c.open.tr });
      return d.recountBacklog(was);
    }
    const engine = event.target.dataset.engine;
    if (engine) {
      const chosen = [...$('calc-tr').querySelectorAll('[data-engine]:checked')].map((box) => box.dataset.engine);
      // At least one engine: none would count nothing.
      if (!chosen.length) {
        event.target.checked = true;
        return;
      }
      c.open.tr = { ...tr(), engines: chosen };
      save({ tr: c.open.tr });
      return d.applyScope();
    }
    if (event.target.matches('[data-fp-one]')) {
      const v = Math.min(100, Math.max(0, amount(event.target.value) ?? DEFAULT_TR.fpPercent.Critical));
      c.open.tr = { ...tr(), fpPercent: Object.fromEntries(SEVERITIES.map((s) => [s, v])) };
      for (const s of SEVERITIES) if (c.draft?.[s]) c.draft[s].fpPercent = v;
      save({ tr: c.open.tr });
      return renderTr();
    }
    const key = event.target.dataset.ahead;
    if (!key) return;
    const value = key === 'includeFuture' ? event.target.checked : amount(event.target.value);
    c.open.tr = { ...tr(), ...aheadSettings({ ...tr(), [key]: value }) };
    save({ tr: c.open.tr });
    renderTr();
  });

  return {
    fusionCounts, fusionOff, fusionOn, horizon, renderTr, syncDraft, tr, trEngines, trFigures, trShareOf,
  };
}
