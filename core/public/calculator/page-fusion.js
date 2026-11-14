import { byOrigins, cleanScope, CRITICALITIES, FREQUENCIES, fusionEstimate, inScope, sortProjects, wholeNumber } from './model.js';

/**
 * Fusion from Checkmarx One: the projects, how often each is scanned, the engines and their credits; sorting the projects table.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupFusion(d) {
  const {
    $, c, esc, FREQ_LABEL, FROM_LABEL, fusionCounts, fusionOff, num, renderTr, save, SOURCE_LABEL, trEngines,
  } = d;
  // ---- Fusion -------------------------------------------------------------------------------

  const fusion = () => c.open?.fusion;
  // The scope as the customer keeps it, cleaned once for each scope it has (not at every question about a project).
  let scopeFrom = null;
  let scopeNow = cleanScope({});
  const scope = () => {
    const raw = c.open?.scope;
    if (raw !== scopeFrom) {
      scopeFrom = raw;
      scopeNow = cleanScope(raw);
    }
    return scopeNow;
  };
  /** Is this project in the scope, as the scans from the scan origins chosen see it (byOrigins)? */
  const counts = (p, sc = scope()) => {
    const seen = byOrigins(p, sc.origins);
    return Boolean(seen) && inScope(seen, sc, trEngines());
  };
  /** The projects that count, as the scans from the scan origins chosen see them (a project added by hand always counts). */
  const scoped = () => {
    const sc = scope();
    const engines = trEngines();
    return fusion().projects.map((p) => byOrigins(p, sc.origins)).filter((p) => p && (p.source === 'manual' || inScope(p, sc, engines)));
  };
  /** Projects read from Checkmarx One that the scope leaves out: none when it counts them all. */
  const leftOutBy = (sc = scope()) => (fusion()?.projects ?? []).filter((p) => p.source !== 'manual' && !counts(p, sc));
  const narrowed = () => leftOutBy().length > 0;
  /** How many projects each leave-out option takes out (of those the other choices keep), and those with no scan from the scan origins chosen. */
  function leftOutCounts(sc = scope()) {
    const read = (fusion()?.projects ?? []).filter((p) => p.source !== 'manual');
    const projects = read.map((p) => byOrigins(p, sc.origins)).filter(Boolean);
    const engines = trEngines();
    const without = (change) => {
      const changed = cleanScope({ ...sc, ...change });
      return projects.filter((p) => !inScope(p, changed, engines)).length;
    };
    const now = without({});
    return { noCode: sc.leaveOutNoCode ? now - without({ leaveOutNoCode: false }) : 0, noFindings: sc.leaveOutNoFindings ? now - without({ leaveOutNoFindings: false }) : 0, noOrigin: read.length - projects.length };
  }
  const estimate = () => fusionEstimate(scoped(), fusion());
  const ROWS_PAGE = 100;
  const saveFusion = () => save({ fusion: fusion() });
  const modelOptions = (selected, blank) =>
    `<option value="">${esc(blank)}</option>` + fusion().models.filter((m) => m.creditsPer10k !== null || m.id === selected).map((m) => `<option value="${esc(m.id)}"${m.id === selected ? ' selected' : ''}>${esc(m.name || 'Unnamed model')}${m.creditsPer10k === null ? '' : ` · ${num(m.creditsPer10k, 2)}`}</option>`).join('');
  /** "Default model" says which one it is, so picking that same model is seen to change nothing. */
  const defaultLabel = () => {
    const m = fusion().models.find((x) => x.id === fusion().defaultModel);
    return m ? `Default: ${m.name || 'Unnamed model'}${m.creditsPer10k === null ? '' : ` · ${num(m.creditsPer10k, 2)}`}` : 'Default model';
  };
  const shown = () => {
    const words = $('calc-filter').value.trim().toLowerCase();
    return estimate().rows.filter((p) => !words || String(p.name).toLowerCase().includes(words));
  };

  function renderFusion() {
    if (!c.open) return;
    const f = fusion();
    $('calc-fusion-on').checked = d.next().fusionOn;
    $('calc-fusion-off-note').hidden = !fusionOff();
    $('page-calculator').classList.toggle('calc-fusion-off', fusionOff());
    $('calc-default-scans').value = f.defaultScans;
    $('calc-combine').value = f.combine;
    $('calc-default-model').innerHTML = modelOptions(f.defaultModel, f.models.length ? 'No model' : 'No model yet');
    d.renderReadNote();
    renderModels();
    renderRules();
    renderProjects();
    d.renderFusionNew();
  }

  function renderModels() {
    const f = fusion();
    $('calc-models-empty').hidden = f.models.length > 0;
    // The default model is the one the projects use unless a rule says otherwise: marked, and named when it has no price.
    modelsWarn();
    $('calc-models').innerHTML = f.models
      .map(
        (m) => `<tr data-model="${esc(m.id)}"${m.id === f.defaultModel ? ' class="calc-model-default"' : ''}>
        <td>${m.source === 'tenant' || m.source === 'catalog'
          ? `<span class="calc-model-name" translate="no">${esc(m.name)}</span> <span class="calc-badge">${m.source === 'tenant' ? 'From Checkmarx One' : 'Checkmarx One model'}</span>${m.id === f.defaultModel ? ' <span class="calc-badge calc-badge-default">Default · used by the projects</span>' : ''}${m.description ? `<small class="hint" translate="no">${esc(m.description)}</small>` : ''}`
          : `<input type="text" value="${esc(m.name)}" maxlength="80" data-m="name" aria-label="Model name" translate="no" placeholder="Type the model's name, as Checkmarx One shows it" />`}</td>
        <td><input type="text" inputmode="decimal" class="calc-num" value="${esc(m.creditsPer10k ?? '')}" data-m="creditsPer10k" aria-label="Credits per 10K LOC" placeholder="${esc(m.id === f.defaultModel ? 'Price needed' : 'Credits')}" /></td>
        <td><button type="button" class="ghost calc-remove" data-remove-model>Remove</button></td></tr>`,
      )
      .join('');
  }

  /** Said when the default model, the one the projects use, has no price: the reason Fusion credits stay 0. */
  function modelsWarn() {
    const f = fusion();
    const def = f.models.find((m) => m.id === f.defaultModel);
    const unpriced = def && !(Number(def.creditsPer10k) > 0);
    $('calc-models-warn').hidden = !unpriced;
    if (unpriced) $('calc-models-warn').innerHTML = `<b translate="no">${esc(def.name)}</b> is the default model, used by the projects, and has no price yet: type its credits per 10K LOC, or Fusion credits stay 0.`;
  }

  let rulesModels = false;
  document.getElementById('page-calculator').addEventListener('click', (event) => {
    if (!event.target.closest('[data-rule-models]')) return;
    rulesModels = !rulesModels;
    renderRules();
  });
  function renderRules() {
    const f = fusion();
    const rows = scoped();
    const ruleRow = (key, label, count, rule, attr, title = '') => `<tr ${attr}="${key}"${title ? ` title="${esc(title)}"` : ''}>
      <td>${label}</td><td class="num">${num(count)}</td>
      <td><input type="text" inputmode="numeric" class="calc-num" value="${esc(rule.scans ?? '')}" data-r="scans" placeholder="${esc(num(f.defaultScans))} (default)" aria-label="Fusion scans per project" /></td>
      <td><select data-r="model" aria-label="Model">${modelOptions(rule.model, defaultLabel())}</select></td></tr>`;
    // A model of its own for a group is rare: its picker shows when one is set, or when asked for.
    for (const [body, rules] of [['calc-freq', f.byFrequency], ['calc-crit', f.byCriticality]]) {
      const table = $(body).closest('table');
      table.classList.toggle('show-models', rulesModels || Object.values(rules ?? {}).some((r) => r?.model));
    }
    // On Fusion · from Git the groups count the repositories, by how often each changes (commits on its default branch).
    const onGit = Boolean($('calc-freq-panel')?.closest('[data-ptpanel="calculator:fusion-git"]'));
    const grouped = onGit ? d.fnewEstimate().rows.filter((r) => r.included) : rows;
    $('calc-freq-panel')?.classList.toggle('calc-freq-git', onGit);
    for (const [cls, show] of [['.calc-explain', !onGit], ['.calc-explain-git', onGit]]) {
      const el = $('calc-freq-panel')?.querySelector(cls);
      if (el) el.hidden = !show;
    }
    const head = $('calc-freq-panel')?.querySelector('h2');
    if (head) head.textContent = onGit ? 'Fusion scans by how often repositories change' : 'Fusion scans by how often projects are scanned';
    $('calc-freq').innerHTML = FREQUENCIES.map((q) => ruleRow(q.id, esc(q.short), grouped.filter((p) => p.frequency === q.id).length, f.byFrequency[q.id], 'data-freq', q.label)).join('');
    // Folded unless a criticality has its own number or model, so a plan made with it is never hidden.
    if (CRITICALITIES.some((k) => f.byCriticality[k]?.scans != null || f.byCriticality[k]?.model)) $('calc-crit-fold').open = true;
    $('calc-crit').innerHTML = [...CRITICALITIES.map((k) => ruleRow(k, `${k}${k === 5 ? ' (most critical)' : k === 1 ? ' (least critical)' : ''}`, rows.filter((p) => p.criticality === k).length, f.byCriticality[k], 'data-crit'))].join('');
  }

  /**
   * Why the blocks are more than the lines over 10K: each project (repository) is rounded up to whole 10K-LOC blocks
   * on its own, so a 2,000-line one is a whole block.
   */
  function blocksWhy(t) {
    const pooled = Math.ceil((t.lines || 0) / 10000);
    const what = t.projects === 1 ? 'project' : 'projects';
    return t.units > pooled
      ? `${num(t.lines)} code lines in ${num(t.projects)} ${what}: each rounded up to whole blocks on its own (a 2,000-line one is 1 block), so ${num(t.units)}, not ${num(pooled)}`
      : `${num(t.lines)} code lines in ${num(t.projects)} ${what}, each rounded up to whole blocks`;
  }

  function renderKpis(est = estimate()) {
    const t = est.totals;
    const on = fusionCounts(est);
    c.fusionCredits = on ? t.credits : null;
    // Fusion coming in or going out changes what triage & remediation counts (the findings Fusion adds).
    if (c.trFusionOn !== undefined && c.trFusionOn !== on) renderTr();
    d.renderSummary();
    const kpi = (label, value, sub, cls = '') => `<div class="rp-kpi ${cls}"><span class="rp-tile-label">${esc(label)}</span><span class="rp-kpi-value">${value}</span><span class="rp-tile-sub">${sub}</span></div>`;
    $('calc-fkpis').innerHTML = [
      kpi('Projects', num(t.projects), t.unknownLines ? `<span class="calc-warn">Still without lines of code: ${num(t.unknownLines)}</span>` : 'Included, with lines of code'),
      kpi('10K-LOC blocks', num(t.units), blocksWhy(t)),
      kpi('Fusion scans', num(t.scans), `Over ${num(est.settings.periodMonths)} months`),
      kpi('Credits', num(t.credits, 1), t.unknownRate ? `<span class="calc-warn">Projects whose model has no credits per 10K LOC: ${num(t.unknownRate)}</span>` : `Over ${num(est.settings.periodMonths)} months`, 'calc-gold'),
      c.remainingCredits !== null ? kpi('Credits remaining in the tenant', num(c.remainingCredits), c.remainingCredits >= t.credits ? 'Enough for this projection' : `<span class="calc-warn">Short by ${num(t.credits - c.remainingCredits, 1)}</span>`) : '',
    ].join('');
  }

  function rowHtml(p) {
    const manual = p.source === 'manual';
    const scanned = wholeNumber(p.loc);
    const changed = !manual && wholeNumber(p.locOverride) !== null && wholeNumber(p.locOverride) !== scanned;
    return `<tr data-row="${esc(p.id)}" data-source="${esc(p.source ?? 'git')}" class="${p.included ? '' : 'calc-off'}">
      <td><input type="checkbox" data-p="included"${p.included ? ' checked' : ''} aria-label="Include ${esc(p.name)}" /></td>
      <td>${manual ? `<span class="calc-name-cell"><input type="text" data-p="name" value="${esc(p.name)}" maxlength="200" aria-label="Project name" translate="no" /><button type="button" class="ghost calc-remove" data-remove-project>Remove</button></span>` : `<span translate="no">${esc(p.name)}</span>`}</td>
      <td>${manual ? `<select data-p="criticality" aria-label="Criticality"><option value="">—</option>${CRITICALITIES.map((k) => `<option${p.criticality === k ? ' selected' : ''}>${k}</option>`).join('')}</select>` : p.criticality ?? '—'}</td>
      <td>${manual ? `<select data-p="frequency" aria-label="How often it is scanned">${FREQUENCIES.map((q) => `<option value="${q.id}"${p.frequency === q.id ? ' selected' : ''}>${esc(q.label)}</option>`).join('')}</select>` : `${esc(FREQ_LABEL[p.frequency] ?? '—')}${p.scanCount ? `<small class="hint">${num(p.scanCount)} scans in a year</small>` : ''}`}</td>
      <td><input type="text" inputmode="numeric" class="calc-num" data-p="loc" value="${esc(p.lines ?? '')}" placeholder="${scanned === null ? 'Type them' : ''}" aria-label="Lines of code of ${esc(p.name)}" title="${esc(SOURCE_LABEL[p.source] ?? '')}" />${changed ? `<small class="hint">Scan counted ${num(scanned)} <button type="button" class="link" data-reset-loc>Use it</button></small>` : ''}</td>
      <td class="num" data-cell="units">${p.included && p.units ? num(p.units) : '—'}</td>
      <td><input type="text" inputmode="numeric" class="calc-num" data-p="scansOverride" value="${esc(p.scansOverride ?? '')}" placeholder="${esc(num(p.scans))}" aria-label="Fusion scans for ${esc(p.name)}" /><small class="hint" data-cell="from">${esc(FROM_LABEL[p.scansFrom] ?? '')}</small></td>
      <td><select data-p="modelOverride" aria-label="Model for ${esc(p.name)}">${modelOptions(p.modelOverride, 'Automatic')}</select></td>
      <td class="num" data-cell="credits">${p.included && p.units ? (p.credits === null ? '—' : num(p.credits, 1)) : '—'}</td>
    </tr>`;
  }

  // ---- Sorting the projects table: click a column's heading; again for the other way. Remembered in this browser.
  const SORT_STORE = 'mz-calc-sort';
  let projectSort = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_STORE) || 'null');
      if (saved?.key) return { key: String(saved.key), dir: saved.dir === 'desc' ? 'desc' : 'asc' };
    } catch {}
    return { key: null, dir: 'asc' };
  })();
  /** The estimate's rows in the table's order (the CSV follows it too). */
  const sortedRows = (est) => sortProjects(est.rows, projectSort, { modelName: (id) => est.settings.models.find((m) => m.id === id)?.name ?? '' });
  function renderSortHeads() {
    for (const th of document.querySelectorAll('#calc-projects-head th[data-sort]')) {
      const on = th.dataset.sort === projectSort.key;
      th.setAttribute('aria-sort', on ? (projectSort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.dataset.dir = on ? projectSort.dir : '';
    }
  }
  $('calc-projects-head').addEventListener('click', (event) => {
    const th = event.target.closest('th[data-sort]');
    if (!th || !c.open) return;
    const key = th.dataset.sort;
    // A new column starts the way people usually want it: names A to Z, numbers largest first.
    projectSort = projectSort.key === key ? { key, dir: projectSort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'model' ? 'asc' : 'desc' };
    try {
      localStorage.setItem(SORT_STORE, JSON.stringify(projectSort));
    } catch {}
    renderProjects();
  });

  function renderProjects() {
    const est = estimate();
    const words = $('calc-filter').value.trim().toLowerCase();
    const rows = sortedRows(est).filter((p) => !words || String(p.name).toLowerCase().includes(words));
    renderSortHeads();
    // A long list a page at a time: the totals above always count every project in the scope.
    $('calc-rows').innerHTML = rows.slice(0, d.rowsShown).map(rowHtml).join('');
    $('calc-rows-more').hidden = rows.length <= d.rowsShown;
    $('calc-rows-more-btn').textContent = `Show ${num(Math.min(ROWS_PAGE, rows.length - d.rowsShown))} more of ${num(rows.length - d.rowsShown)}`;
    const all = fusion().projects.length;
    $('calc-rows-count').textContent = all ? (narrowed() ? `${num(est.rows.length)} of ${num(all)} projects in the scope` : `${num(all)} projects`) : '';
    $('calc-rows-empty').hidden = est.rows.length > 0 && rows.length > 0;
    if (est.rows.length && !rows.length) $('calc-rows-empty').textContent = 'No project matches that name.';
    else if (all && !est.rows.length) $('calc-rows-empty').textContent = 'No project is in the scope: narrow the projects differently at the top.';
    renderKpis(est);
  }
  // Opting out of Fusion: the customer is not taking it, so nothing of it is counted (its settings stay for later).
  // Ticked at the top, it waits for Apply; "Include it" on the tab counts at once.
  const setFusionOn = (on) => {
    if (!c.open) return;
    fusion().optOut = !on;
    if (c.next) c.next.fusionOn = on;
    saveFusion();
    renderFusion();
    // Triage & remediation's "More found by Fusion" follows: 0% while it is left out, its own % again once back.
    renderTr();
    d.renderPending();
  };
  $('calc-fusion-on').addEventListener('change', (event) => { if (!c.open) return; d.setNext({ fusionOn: event.target.checked }, { redraw: false }); });
  $('calc-fusion-include').addEventListener('click', () => setFusionOn(true));

  return {
    blocksWhy, counts, estimate, fusion, leftOutCounts, modelOptions, modelsWarn, narrowed, renderFusion,
    renderKpis, renderProjects, renderRules, ROWS_PAGE, saveFusion, scope, scoped, shown, sortedRows,
  };
}
