import { t } from '../i18n.js';
import { amount, FREQUENCIES, fusionSettings, MAX_CLOC_FUSION_BYTES, parseCloc, parseClocFusionReport, suggestedScans, wholeNumber } from './model.js';

/**
 * cloc-fusion: its one-file page to download, and its report to import.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupCloc(d) {
  const {
    $, api, c, esc, estimate, FROM_LABEL, fusion, handleAuthLoss, modelOptions, modelsWarn, num,
    renderFusion, renderFusionNew, renderKpis, renderProjects, renderRules, ROWS_FIRST, ROWS_PAGE, saveFnew,
    saveFusion, setStatus, shown, toast, upsertMeasured,
  } = d;
  // ---- cloc-fusion: its one-file page to download, and its report to import --------------------------

  $('calc-cf-download').addEventListener('click', async () => {
    const button = $('calc-cf-download');
    button.disabled = true;
    try {
      const page = await api('/api/projections/git/cloc-fusion', { quiet: true });
      d.download(new Blob([page.html], { type: 'text/html' }), page.file || 'cloc-fusion.html');
      $('calc-cf-sum').textContent = `cloc-fusion ${page.version} · SHA-256 ${page.sha256}`;
    } catch (error) {
      if (!handleAuthLoss(error)) toast(error.message, 'bad');
    } finally {
      button.disabled = false;
    }
  });

  /** A cloc-fusion report's repositories as projects (read here: nothing is sent anywhere but this customer's save). */
  function importClocFusion(textValue, fileName) {
    const found = parseClocFusionReport(textValue, fileName, { models: fusion().models });
    found.projects.forEach((p, i) => upsertMeasured({ ...p, path: p.fullName }, { key: `cf${i}` }));
    return found;
  }
  async function readClocFusion(files) {
    if (!c.open || !files.length) return;
    const done = [];
    const said = [];
    let added = 0;
    for (const file of files) {
      try {
        if (file.size > MAX_CLOC_FUSION_BYTES) throw new Error(t('{0} is over 64 MB.').replace('{0}', file.name));
        const found = importClocFusion(await file.text(), file.name);
        added += found.projects.length;
        said.push(t('{0}: {1} repositories read (cloc-fusion {2}), {3} not measured there; developers in the last 90 days across it: {4}.').replace('{0}', file.name).replace('{1}', num(found.projects.length)).replace('{2}', found.version || '—').replace('{3}', num(found.skipped)).replace('{4}', num(found.developers)));
        done.push(`<span translate="no">✓ ${esc(file.name)}</span>`);
      } catch (error) {
        const message = error.notReport ? t('{0} is not a cloc-fusion report: use the report cloc-fusion made (its JSON, HTML, CSV or Markdown file).').replace('{0}', file.name) : error.message;
        done.push(`<span class="bad" title="${esc(message)}" translate="no">✗ ${esc(file.name)}</span>`);
        toast(message, 'bad');
      }
    }
    $('calc-cf-files').innerHTML = done.join('');
    setStatus('calc-cf-status', said.join(' '), added ? 'ok' : '');
    if (added) saveFnew();
    renderFusionNew();
  }
  $('calc-cf-pick').addEventListener('click', () => $('calc-cf-file').click());
  $('calc-cf-file').addEventListener('change', (event) => {
    readClocFusion([...event.target.files]);
    event.target.value = '';
  });
  const cfDrop = $('calc-cf-drop');
  cfDrop.addEventListener('dragover', (event) => {
    event.preventDefault();
    cfDrop.classList.add('drag');
  });
  cfDrop.addEventListener('dragleave', () => cfDrop.classList.remove('drag'));
  cfDrop.addEventListener('drop', (event) => {
    event.preventDefault();
    cfDrop.classList.remove('drag');
    readClocFusion([...(event.dataTransfer?.files ?? [])]);
  });

  /** The customer's cloc results: each file read here (nothing is sent anywhere but this customer's save). A cloc-fusion report dropped here is read as one. */
  const MAX_CLOC_BYTES = 50 * 1024 * 1024;
  async function readCloc(files) {
    if (!c.open || !files.length) return;
    const done = [];
    let added = 0;
    for (const file of files) {
      try {
        if (file.size > MAX_CLOC_BYTES && !/\.json$/i.test(file.name)) throw new Error(t('{0} is over 50 MB: run cloc without --by-file.').replace('{0}', file.name));
        if (file.size > MAX_CLOC_FUSION_BYTES) throw new Error(t('{0} is over 64 MB.').replace('{0}', file.name));
        const content = await file.text();
        if (/^\s*\{/.test(content) && /"tool"\s*:\s*"cloc-fusion"/.test(content.slice(0, 4096))) {
          added += importClocFusion(content, file.name).projects.length;
        } else {
          if (file.size > MAX_CLOC_BYTES) throw new Error(t('{0} is over 50 MB: run cloc without --by-file.').replace('{0}', file.name));
          for (const found of parseCloc(content, file.name)) {
            upsertMeasured({ name: found.name, langs: found.langs, file: file.name, locOverride: null }, { key: String(added) });
            added += 1;
          }
        }
        done.push(`<span translate="no">✓ ${esc(file.name)}</span>`);
      } catch (error) {
        const message = error.notCloc ? t('{0} is not a cloc report: run cloc with --json or --csv.').replace('{0}', file.name) : error.notReport ? t('{0} is not a cloc-fusion report: use the report cloc-fusion made (its JSON, HTML, CSV or Markdown file).').replace('{0}', file.name) : error.message;
        done.push(`<span class="bad" title="${esc(message)}" translate="no">✗ ${esc(file.name)}</span>`);
        toast(message, 'bad');
      }
    }
    $('calc-cloc-files').innerHTML = done.join('');
    setStatus('calc-cloc-status', added ? `${num(added)} project(s) read.` : '');
    if (added) saveFnew();
    renderFusionNew();
  }
  $('calc-cloc-pick').addEventListener('click', () => $('calc-cloc-file').click());
  $('calc-cloc-file').addEventListener('change', (event) => {
    readCloc([...event.target.files]);
    event.target.value = '';
  });
  const drop = $('calc-cloc-drop');
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('drag');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('drag');
    readCloc([...(event.dataTransfer?.files ?? [])]);
  });

  $('calc-rows-more-btn').addEventListener('click', () => {
    d.rowsShown += ROWS_PAGE;
    renderProjects();
  });

  /** Totals and each row's figures, while something is typed (so the field keeps its place). */
  function refreshFigures() {
    const est = estimate();
    renderKpis(est);
    const byId = new Map(est.rows.map((r) => [r.id, r]));
    for (const line of $('calc-rows').querySelectorAll('tr[data-row]')) {
      const p = byId.get(line.dataset.row);
      if (!p) continue;
      line.querySelector('[data-cell="units"]').textContent = p.included && p.units ? num(p.units) : '—';
      line.querySelector('[data-cell="credits"]').textContent = p.included && p.units ? (p.credits === null ? '—' : num(p.credits, 1)) : '—';
      line.querySelector('[data-cell="from"]').textContent = FROM_LABEL[p.scansFrom] ?? '';
      line.querySelector('[data-p="scansOverride"]').placeholder = num(p.scans);
    }
  }

  const project = (el) => fusion().projects.find((p) => p.id === el.closest('tr[data-row]')?.dataset.row);

  $('calc-rows').addEventListener('input', (event) => {
    const p = project(event.target);
    const field = event.target.dataset.p;
    if (!p || !field) return;
    if (field === 'loc') {
      const typed = wholeNumber(event.target.value);
      p.locOverride = p.source !== 'manual' && typed === wholeNumber(p.loc) ? null : typed;
    } else if (field === 'scansOverride') p.scansOverride = wholeNumber(event.target.value);
    else if (field === 'name') p.name = event.target.value.trim() || 'Unnamed project';
    else return;
    refreshFigures();
    saveFusion();
  });
  $('calc-rows').addEventListener('change', (event) => {
    const p = project(event.target);
    const field = event.target.dataset.p;
    if (!p || !field) return;
    if (field === 'included') p.included = event.target.checked;
    else if (field === 'criticality') p.criticality = wholeNumber(event.target.value);
    else if (field === 'frequency') p.frequency = event.target.value;
    else if (field === 'modelOverride') p.modelOverride = event.target.value || null;
    saveFusion();
    if (['criticality', 'frequency'].includes(field)) renderRules();
    renderProjects();
  });
  $('calc-rows').addEventListener('click', (event) => {
    const p = project(event.target);
    if (!p) return;
    if (event.target.closest('[data-reset-loc]')) p.locOverride = null;
    else if (event.target.closest('[data-remove-project]')) fusion().projects = fusion().projects.filter((x) => x !== p);
    else return;
    renderRules();
    renderProjects();
    saveFusion();
  });

  const settingsChanged = () => {
    Object.assign(c.open.fusion, fusionSettings(fusion()), { projects: fusion().projects, readAt: fusion().readAt });
    saveFusion();
  };
  /** The projection period, at the top: both parts use it (as chosen, until Apply). */
  function renderHorizon() {
    const months = d.next().periodMonths;
    const select = $('calc-horizon');
    if (![...select.options].some((o) => Number(o.value) === months)) select.append(Object.assign(document.createElement('option'), { value: String(months), textContent: `${months} months` }));
    select.value = String(months);
  }
  $('calc-horizon').addEventListener('change', () => {
    if (!c.open) return;
    d.setNext({ periodMonths: wholeNumber($('calc-horizon').value) ?? 12 });
  });
  $('calc-default-scans').addEventListener('input', () => {
    fusion().defaultScans = wholeNumber($('calc-default-scans').value) ?? 0;
    settingsChanged();
    renderRules();
    refreshFigures();
  });
  $('calc-default-model').addEventListener('change', () => {
    fusion().defaultModel = $('calc-default-model').value || null;
    settingsChanged();
    renderRules();
    renderProjects();
  });
  $('calc-combine').addEventListener('change', () => {
    fusion().combine = $('calc-combine').value;
    settingsChanged();
    renderProjects();
  });

  for (const [id, attr, key] of [
    ['calc-freq', 'freq', 'byFrequency'],
    ['calc-crit', 'crit', 'byCriticality'],
  ]) {
    const update = (event, rerender) => {
      const row = event.target.closest(`tr[data-${attr}]`);
      const field = event.target.dataset.r;
      if (!row || !field) return;
      const rule = fusion()[key][row.dataset[attr]];
      rule[field] = field === 'scans' ? wholeNumber(event.target.value) : event.target.value || null;
      saveFusion();
      if (rerender) renderProjects();
      else refreshFigures();
    };
    $(id).addEventListener('input', (event) => update(event, false));
    $(id).addEventListener('change', (event) => update(event, true));
  }
  $('calc-suggest').addEventListener('click', () => {
    for (const q of FREQUENCIES) fusion().byFrequency[q.id].scans = suggestedScans(q.id, fusion().periodMonths);
    saveFusion();
    renderRules();
    renderProjects();
  });

  $('calc-models').addEventListener('input', (event) => {
    const id = event.target.closest('tr[data-model]')?.dataset.model;
    const model = fusion().models.find((m) => m.id === id);
    if (!model) return;
    if (event.target.dataset.m === 'name') model.name = event.target.value;
    if (event.target.dataset.m === 'creditsPer10k') model.creditsPer10k = amount(event.target.value);
    saveFusion();
    refreshFigures();
    modelsWarn();
  });
  // A model renamed or priced: the lists that offer it follow (the table itself stays, so the next field keeps its focus).
  $('calc-models').addEventListener('change', () => {
    $('calc-default-model').innerHTML = modelOptions(fusion().defaultModel, 'No model');
    renderRules();
    renderProjects();
  });
  $('calc-models').addEventListener('click', (event) => {
    if (!event.target.closest('[data-remove-model]')) return;
    const id = event.target.closest('tr[data-model]').dataset.model;
    const f = fusion();
    f.models = f.models.filter((m) => m.id !== id);
    if (f.defaultModel === id) f.defaultModel = f.models[0]?.id ?? null;
    for (const rule of [...Object.values(f.byFrequency), ...Object.values(f.byCriticality)]) if (rule.model === id) rule.model = null;
    for (const p of f.projects) if (p.modelOverride === id) p.modelOverride = null;
    saveFusion();
    renderFusion();
  });
  $('calc-add-model').addEventListener('click', () => {
    const f = fusion();
    if (f.models.length >= 20) return;
    const id = `model-${Date.now().toString(36)}`;
    f.models.push({ id, name: '', description: '', creditsPer10k: null, source: 'manual' });
    f.defaultModel ??= id;
    saveFusion();
    renderFusion();
    $('calc-models').querySelector(`tr[data-model="${CSS.escape(id)}"] input`)?.focus();
  });

  $('calc-filter').addEventListener('input', () => {
    d.rowsShown = ROWS_FIRST;
    renderProjects();
  });
  for (const [id, on] of [
    ['calc-all', true],
    ['calc-none', false],
  ]) {
    $(id).addEventListener('click', () => {
      const ids = new Set(shown().map((p) => p.id));
      for (const p of fusion().projects) if (ids.has(p.id)) p.included = on;
      renderProjects();
      saveFusion();
    });
  }
  $('calc-add').addEventListener('click', () => {
    const f = fusion();
    const id = `manual-${Date.now().toString(36)}`;
    f.projects.push({ id, name: `Project ${f.projects.length + 1}`, loc: null, locOverride: null, criticality: null, frequency: '1-5-week', scansPerWeek: 0, scanCount: 0, lastScanAt: null, scanId: '', source: 'manual', included: true, scansOverride: null, modelOverride: null });
    $('calc-filter').value = '';
    renderRules();
    renderProjects();
    saveFusion();
    $('calc-rows').querySelector(`tr[data-row="${CSS.escape(id)}"] [data-p="name"]`)?.select();
  });

  return {
    renderHorizon,
  };
}
