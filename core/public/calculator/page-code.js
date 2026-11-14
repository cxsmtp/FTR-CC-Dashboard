import { t } from '../i18n.js';
import { fusionEstimate, newCustomerEstimate, repoKey, wholeNumber } from './model.js';
import { cleanFusionNew } from './profiles.js';

/**
 * Fusion for code not in Checkmarx One yet: its lines counted from git or from a cloc-fusion report, and the two Fusion tabs.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupCode(d) {
  const {
    $, api, blocksWhy, c, canGit, esc, fmtDateTime, FREQ_LABEL, fusion, fusionOff, handleAuthLoss, horizon,
    modelOptions, num, renderFusion, renderRules, renderTr, save, saveFusion, scoped, standalone, tr,
    WAY_STORE, WAYS,
  } = d;
  // ---- Fusion — new customer: code not in Checkmarx One yet, its lines counted from git or with cloc

  /** The new customer tab's projects and choices (a customer saved before it has none yet). */
  const fnew = () => {
    if (c.open && !c.open.fusionNew) c.open.fusionNew = cleanFusionNew({});
    return c.open?.fusionNew;
  };
  const fnewOff = () => fnew()?.optOut === true;
  const fnewEstimate = () => newCustomerEstimate(fnew(), fusion());
  const fnewCounts = (est = fnewEstimate()) => !fnewOff() && est.rows.some((r) => r.included && r.units);
  const saveFnew = () => save({ fusionNew: fnew() });
  const LANG_COLOURS = ['#2856c9', '#b45309', '#0d9488', '#7c3aed', '#be185d', '#0891b2', '#65a30d', '#ea580c'];

  // Where a project's Fusion scans came from, on this tab.
  const FROM_NEW = { default: 'Default', frequency: 'Change frequency', criticality: 'Criticality', project: 'Set here' };

  /** Where a project's lines came from: "git · main · 3f2a1c9" (and Count again), "cloc-fusion · report.json", "cloc · payments-api.json", or typed. */
  function fnewFromHtml(p) {
    const again = p.git && gitOn() ? ' <button type="button" class="link" data-fnew-recount>Count again</button>' : '';
    const where = p.git ? `${p.git.host}/${p.git.path}${p.git.countedAt ? ` · ${fmtDateTime(p.git.countedAt)}` : ''}` : '';
    if (p.activity?.engine === 'report') return `<span class="calc-git-tag" translate="no"${where ? ` title="${esc(where)}"` : ''}>${esc(`cloc-fusion · ${p.file || 'report'}`)}</span>${again}`;
    if (p.git) return `<span class="calc-git-tag" translate="no" title="${esc(where)}">${esc([p.activity?.engine === 'api' ? 'api' : 'git', p.git.branch, p.git.commit].filter(Boolean).join(' · '))}</span>${again}`;
    return p.file ? `<span class="calc-git-tag" translate="no">${esc(`cloc · ${p.file}`)}</span>` : '—';
  }

  /** How often it changes: the bucket, its commits in the window, and its last commit. */
  function fnewFrequencyHtml(p) {
    if (!p.frequency) return '—';
    const a = p.activity ?? {};
    const last = a.lastCommitAt ? `<small>Last commit <time datetime="${esc(a.lastCommitAt)}" translate="no">${esc(new Date(a.lastCommitAt).toLocaleDateString())}</time></small>` : '';
    const devs = p.devs90 === null || p.devs90 === undefined ? '' : `<small>${esc(`${num(p.devs90)} developers in the last 90 days`)}</small>`;
    return `<span class="calc-freq">${esc(FREQ_LABEL[p.frequency] ?? '—')}<small>${esc(`${num(a.commits)} commits in ${num(a.windowDays)} days`)}</small>${devs}${last}</span>`;
  }

  function fnewRowHtml(p, colourOf) {
    const counted = p.languages.filter((l) => l.counted && l.lines > 0);
    const left = p.languages.filter((l) => !l.counted).reduce((n, l) => n + l.lines, 0);
    const total = counted.reduce((n, l) => n + l.lines, 0) || 1;
    const typed = wholeNumber(p.locOverride) !== null;
    const countedBy = p.activity?.engine === 'report' ? 'cloc-fusion counted' : p.git ? 'Counted from git' : 'cloc counted';
    return `<tr data-row="${esc(p.id)}" class="${p.included ? '' : 'calc-off'}">
      <td><input type="checkbox" data-n="included"${p.included ? ' checked' : ''} aria-label="Include ${esc(p.name)}" /></td>
      <td><span class="calc-name-cell"><input type="text" data-n="name" value="${esc(p.name)}" maxlength="200" aria-label="Project name" translate="no" /><button type="button" class="ghost calc-remove" data-remove-fnew>Remove</button></span></td>
      <td class="calc-from">${fnewFromHtml(p)}</td>
      <td>${counted.length || left
        ? `<span class="calc-lang-line" translate="no">${counted.slice(0, 3).map((l) => `${esc(l.name)} ${Math.round((l.lines / total) * 100)}%`).join(' · ')}${counted.length > 3 ? ` · +${counted.length - 3}` : ''}</span>${left ? `<span class="calc-lang-line">${esc(`${num(left)} lines not counted`)}</span>` : ''}<span class="calc-lang-bar">${counted.map((l) => `<i style="width:${((l.lines / total) * 100).toFixed(2)}%;background:${colourOf(l.name)}" title="${esc(`${l.name}: ${num(l.lines)}`)}"></i>`).join('')}</span>`
        : '—'}</td>
      <td><input type="text" inputmode="numeric" class="calc-num" data-n="loc" value="${esc(typed ? p.locOverride : p.lines ?? '')}" placeholder="Type them" aria-label="Lines of code of ${esc(p.name)}" /><small class="hint calc-units">10K-LOC blocks <b data-cell="units">${p.included && p.units ? num(p.units) : '—'}</b></small>${typed && p.languages.length ? `<small class="hint">${countedBy} ${num(newCustomerEstimate({ ...fnew(), projects: [{ ...p, locOverride: null }] }, fusion()).rows[0]?.lines)} <button type="button" class="link" data-fnew-reset>Use it</button></small>` : ''}</td>
      <td>${fnewFrequencyHtml(p)}</td>
      <td><input type="text" inputmode="numeric" class="calc-num" data-n="scansOverride" value="${esc(p.scansOverride ?? '')}" placeholder="${esc(num(p.scans))}" aria-label="Fusion scans for ${esc(p.name)}" /><span class="calc-scans-from" data-cell="from">${esc(FROM_NEW[p.scansFrom] ?? '')}</span></td>
      <td><select data-n="modelOverride" aria-label="Model for ${esc(p.name)}">${modelOptions(p.modelOverride, 'Automatic')}</select></td>
      <td class="num" data-cell="credits">${p.included && p.units ? (p.credits === null ? '—' : num(p.credits, 1)) : '—'}</td>
    </tr>`;
  }

  const fnewKpi = (label, value, sub, cls = '') => `<div class="rp-kpi ${cls}"><span class="rp-tile-label">${esc(label)}</span><span class="rp-kpi-value">${value}</span><span class="rp-tile-sub">${sub}</span></div>`;

  function renderFusionNew() {
    if (!c.open) return;
    const f = fnew();
    const est = fnewEstimate();
    $('calc-fusion-new-on').checked = d.next().fusionNewOn;
    $('calc-fnew-off-note').hidden = !fnewOff();
    $('calc-fnew-scans').value = f.defaultScans;
    const fallback = fusion().models.find((m) => m.id === fusion().defaultModel);
    $('calc-fnew-model').innerHTML = modelOptions(f.defaultModel, fallback ? t('As Fusion · Checkmarx One: {0}').replace('{0}', fallback.name || t('Unnamed model')) : 'No model yet');
    // Every language found, most lines first: each one counted or left out with a click.
    const langs = new Map();
    for (const p of f.projects) for (const [lang, n] of Object.entries(p.langs ?? {})) langs.set(lang, (langs.get(lang) ?? 0) + (wholeNumber(n) ?? 0));
    const order = [...langs].sort((a, b) => b[1] - a[1]).map(([lang]) => lang);
    const colourOf = (lang) => LANG_COLOURS[Math.max(0, order.indexOf(lang)) % LANG_COLOURS.length];
    const out = new Set(f.leftOut);
    $('calc-fnew-langs').innerHTML = order.map((lang) => `<button type="button" class="m-flat${out.has(lang) ? ' out' : ''}" data-lang="${esc(lang)}" aria-pressed="${out.has(lang) ? 'false' : 'true'}" title="${out.has(lang) ? 'Not counted: click to count it' : 'Counted: click to leave it out'}"><span translate="no">${esc(lang)}</span><em>${num(langs.get(lang))}</em></button>`).join('');
    // A project on both tabs is counted twice unless one of them is unticked.
    const existing = new Set((fusionOff() ? [] : scoped().filter((p) => p.included !== false)).map((p) => String(p.name).toLowerCase()));
    const twice = fnewOff() ? [] : est.rows.filter((r) => r.included && existing.has(String(r.name).toLowerCase())).map((r) => r.name);
    $('calc-fnew-dup').hidden = !twice.length;
    $('calc-fnew-dup').textContent = twice.length ? t('Also on Fusion · Checkmarx One, so counted on both: {0}. Untick it on one of them unless it really is a second copy of the code.').replace('{0}', twice.join(', ')) : '';
    // (Named `tot`, not `t`: `t` is the translation used above in this function.)
    const tot = est.totals;
    $('calc-fnew-kpis').innerHTML = f.projects.length
      ? [
          fnewKpi('Projects', num(tot.projects), tot.unknownLines ? `<span class="calc-warn">Still without lines of code: ${num(tot.unknownLines)}</span>` : 'Included, with lines of code'),
          fnewKpi('10K-LOC blocks', num(tot.units), blocksWhy(tot)),
          fnewKpi('Fusion scans', num(tot.scans), tot.withActivity ? esc(`Over ${num(est.settings.periodMonths)} months · ${num(tot.byRule)} by change frequency`) : `Over ${num(est.settings.periodMonths)} months`),
          fnewKpi('Credits', num(tot.credits, 1), tot.unknownRate ? `<span class="calc-warn">Projects whose model has no credits per 10K LOC: ${num(tot.unknownRate)}</span>` : `Over ${num(est.settings.periodMonths)} months`, 'calc-gold'),
        ].join('')
      : '';
    $('calc-fnew-rows').innerHTML = est.rows.map((p) => fnewRowHtml(p, colourOf)).join('');
    $('calc-fnew-empty').hidden = f.projects.length > 0;
    $('calc-fnew-again').hidden = !f.projects.some((p) => p.git);
    showWay(d.way);
    d.renderSummary();
  }

  /** Totals and each row's figures while something is typed (the field keeps its place). */
  function refreshFnewFigures() {
    const est = fnewEstimate();
    const byId = new Map(est.rows.map((r) => [r.id, r]));
    for (const line of $('calc-fnew-rows').querySelectorAll('tr[data-row]')) {
      const p = byId.get(line.dataset.row);
      if (!p) continue;
      line.querySelector('[data-cell="units"]').textContent = p.included && p.units ? num(p.units) : '—';
      line.querySelector('[data-cell="credits"]').textContent = p.included && p.units ? (p.credits === null ? '—' : num(p.credits, 1)) : '—';
      line.querySelector('[data-cell="from"]').textContent = FROM_NEW[p.scansFrom] ?? '';
      line.querySelector('[data-n="scansOverride"]').placeholder = num(p.scans);
    }
    d.renderSummary();
  }

  const setFnewOn = (on) => {
    if (!c.open) return;
    fnew().optOut = !on;
    if (c.next) c.next.fusionNewOn = on;
    saveFnew();
    renderFusionNew();
    d.renderPending();
  };
  $('calc-fusion-new-on').addEventListener('change', (event) => c.open && d.setNext({ fusionNewOn: event.target.checked }, { redraw: false }));
  $('calc-fnew-include').addEventListener('click', () => setFnewOn(true));
  $('calc-fnew-scans').addEventListener('input', (event) => {
    if (!c.open) return;
    const n = wholeNumber(event.target.value);
    fnew().defaultScans = n === null ? fnew().defaultScans : Math.min(n, 10000);
    refreshFnewFigures();
    saveFnew();
  });
  $('calc-fnew-model').addEventListener('change', (event) => {
    if (!c.open) return;
    fnew().defaultModel = event.target.value || null;
    saveFnew();
    renderFusionNew();
  });
  $('calc-fnew-langs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-lang]');
    if (!button || !c.open) return;
    const lang = button.dataset.lang;
    const out = new Set(fnew().leftOut);
    if (out.has(lang)) out.delete(lang);
    else out.add(lang);
    fnew().leftOut = [...out];
    saveFnew();
    renderFusionNew();
  });

  const fnewProject = (el) => fnew().projects.find((p) => p.id === el.closest('tr[data-row]')?.dataset.row);
  $('calc-fnew-rows').addEventListener('input', (event) => {
    const p = fnewProject(event.target);
    const field = event.target.dataset.n;
    if (!p || !field) return;
    if (field === 'loc') p.locOverride = wholeNumber(event.target.value);
    else if (field === 'scansOverride') p.scansOverride = wholeNumber(event.target.value);
    else if (field === 'name') p.name = event.target.value.trim() || 'Unnamed project';
    else return;
    refreshFnewFigures();
    saveFnew();
  });
  $('calc-fnew-rows').addEventListener('change', (event) => {
    const p = fnewProject(event.target);
    const field = event.target.dataset.n;
    if (!p || !field) return;
    if (field === 'included') p.included = event.target.checked;
    else if (field === 'modelOverride') p.modelOverride = event.target.value || null;
    else if (field === 'name') return renderFusionNew();
    else return;
    saveFnew();
    renderFusionNew();
  });
  $('calc-fnew-rows').addEventListener('click', (event) => {
    const p = fnewProject(event.target);
    if (!p) return;
    if (event.target.closest('[data-fnew-recount]') && p.git) return d.countAgain(p);
    if (event.target.closest('[data-fnew-reset]')) p.locOverride = null;
    else if (event.target.closest('[data-remove-fnew]')) fnew().projects = fnew().projects.filter((x) => x !== p);
    else return;
    saveFnew();
    renderFusionNew();
  });
  $('calc-fnew-add').addEventListener('click', () => {
    if (!c.open) return;
    fnew().projects.push({ id: `new-${Date.now().toString(36)}`, name: 'New project', file: '', langs: {}, locOverride: null, included: true, scansOverride: null, modelOverride: null });
    saveFnew();
    renderFusionNew();
    $('calc-fnew-rows').querySelector('tr:last-child [data-n="name"]')?.select();
  });

  /**
   * A repository measured (from git, or a cloc-fusion report) as a project: the one of the same repository is
   * replaced (or `projectId`'s, counted again); one with no repository, of the same name, too. Two repositories of
   * the same name in different places keep their paths as names. Returns the project.
   */
  function upsertMeasured(found, { projectId = null, key = '' } = {}) {
    const list = fnew().projects;
    const url = found.git?.url ? cleanUrl(found.git.url) : '';
    const sameName = (p) => String(p.name).toLowerCase() === String(found.name).toLowerCase();
    let same = projectId ? list.find((p) => p.id === projectId) : null;
    same ??= url ? list.find((p) => p.git?.url && cleanUrl(p.git.url) === url) : null;
    same ??= list.find((p) => (found.git ? !p.git : true) && sameName(p));
    const taken = list.some((p) => p !== same && sameName(p));
    const name = same?.name ?? (taken && found.path ? found.path : found.name);
    const patch = { name, langs: found.langs, file: found.file ?? '', locOverride: found.locOverride ?? null, ...(found.activity ? { activity: found.activity } : {}), ...(found.criticality ? { criticality: found.criticality } : {}) };
    if (found.git) patch.git = found.git;
    if (same) {
      if (!found.git) delete same.git;
      if (!found.activity) delete same.activity;
      Object.assign(same, patch, found.scansOverride !== null && found.scansOverride !== undefined ? { scansOverride: found.scansOverride } : {}, found.modelOverride ? { modelOverride: found.modelOverride } : {});
      return same;
    }
    const made = { id: `new-${Date.now().toString(36)}-${key || list.length}`, ...patch, included: true, scansOverride: found.scansOverride ?? null, modelOverride: found.modelOverride ?? null };
    list.push(made);
    return made;
  }
  const cleanUrl = (u) => String(u).replace(/(\.git)?\/*$/i, '').toLowerCase();

  // ---- Count from git, with cloc-fusion's engine (src/fusion-git.js): discover, pick, measure ----------
  // On the server, or in the launcher on its own computer; the HTML file on its own can reach no git host.

  const gitOn = () => !standalone || canGit();
  const GIT_ADDRESS = { github: 'https://github.com', gitlab: 'https://gitlab.com', azure: 'https://dev.azure.com/your-organisation', bitbucket: 'https://bitbucket.org' };
  // The Admin's connections (id, host, provider: never a token), the sources ticked, the organizations found,
  // the repositories listed, and the run going.
  const git = { connections: null, limit: 1000, chosen: null, orgs: {}, repos: [], run: null, filter: '' };
  const bytes = (b) => (b >= 1024 ** 3 ? `${num(b / 1024 ** 3, 1)} GB` : b >= 1024 ** 2 ? `${num(b / 1024 ** 2)} MB` : `${num(Math.max(1, b / 1024))} KB`);

  /** Count from git, Import a cloc-fusion report or Upload cloc results: one shown at a time. */
  function showWay(pick) {
    const on = gitOn();
    const shown = WAYS.includes(pick) ? pick : 'git';
    for (const input of document.querySelectorAll('input[name="calc-fnew-way"]')) input.checked = input.value === shown;
    $('calc-git').hidden = shown !== 'git';
    $('calc-cf').hidden = shown !== 'report';
    $('calc-cloc').hidden = shown !== 'cloc';
    // The HTML file on its own: Count from git says it cannot, and points to cloc-fusion.
    $('calc-git-offline').hidden = on;
    $('calc-git-steps').hidden = !on || git.stepsFolded === true;
    // How the server measures: not said where nothing is measured.
    $('calc-git-how').hidden = !on;
    $('calc-git-details').hidden = !on;
    for (const id of ['calc-git-progress', 'calc-git-summary']) if (!on) $(id).hidden = true;
    if (shown === 'git' && on) loadConnections();
  }
  $('calc-fnew-ways').addEventListener('change', (event) => {
    if (event.target.name !== 'calc-fnew-way') return;
    d.way = WAYS.includes(event.target.value) ? event.target.value : 'git';
    try {
      localStorage.setItem(WAY_STORE, d.way);
    } catch {}
    showWay(d.way);
  });

  /** Fusion's parts, each in a tab of its own now: both always drawn, the tabs show one at a time. */
  const showFsub = () => {
    for (const box of document.querySelectorAll('#page-calculator .calc-fsub')) box.hidden = false;
  };
  showFsub();

  // ---- The two Fusion tabs: Checkmarx One, and code counted (from Git or a cloc-fusion report); one in the credits --
  const BASES = {
    cxone: { tab: 'fusion', kick: 'Fusion · Checkmarx One', title: 'From Checkmarx One projects', short: 'Checkmarx One', what: 'projects' },
    git: { tab: 'fusion-git', kick: 'Fusion · from Git', title: 'From code counted in git or by cloc-fusion', short: 'from Git', what: 'repositories' },
  };
  /** The estimate in the credits: one of the three, or none. A customer saved with both parts on counts both until one is chosen. */
  function basis() {
    if (!c.open) return 'none';
    const cx = !fusionOff();
    const nw = !fnewOff();
    if (cx && nw) return 'both';
    if (cx) return 'cxone';
    if (nw) return 'git';
    return 'none';
  }
  /** Every estimate, worked out whichever is chosen, so each tab can show its own and the others beside it. */
  function estimates() {
    const cx = fusionEstimate(scoped(), { ...fusion(), optOut: false }).totals;
    const one = (b) => newCustomerEstimate({ ...fnew(), basis: b, optOut: false, onTop: false }, fusion()).totals;
    return { cxone: cx, git: one('git') };
  }
  /** The names (short, lower case) of the Checkmarx One projects in the scope. */
  const cxNames = () => new Set(scoped().map((p) => repoKey(p.name)));
  /** What `b`'s repositories that are not in Checkmarx One would add on top of it. */
  const onTopOf = (b) => {
    const names = cxNames();
    const skip = fnewEstimate().rows.filter((r) => names.has(repoKey(r.name))).map((r) => repoKey(r.name));
    return { skip, totals: newCustomerEstimate({ ...fnew(), basis: b, optOut: false, onTop: true, onTopSkip: skip }, fusion()).totals };
  };
  /** Checkmarx One's projects, plus the counted repositories that are not there yet (by name): nothing counted twice. */
  function useOnTop(b) {
    if (!c.open || !(b === 'git' || b === 'cloc')) return;
    Object.assign(fnew(), { basisByHand: true, basis: b, onTop: true, onTopSkip: onTopOf(b).skip, optOut: false });
    fusion().optOut = false;
    if (c.next) Object.assign(c.next, { fusionOn: true, fusionNewOn: true });
    saveFusion();
    saveFnew();
    renderFusion();
    renderFusionNew();
    renderTr();
    d.renderPending();
    d.renderSummary();
    placeFusion();
  }
  /** Use one estimate (or none) in the credits: at once, as picking it is the whole change. */
  function useBasis(b, { byHand = true } = {}) {
    if (!c.open) return;
    fnew().basisByHand = byHand;
    Object.assign(fnew(), { onTop: false, onTopSkip: [] });
    if (b === 'git' || b === 'cloc') fnew().basis = b;
    fusion().optOut = b !== 'cxone';
    fnew().optOut = !(b === 'git' || b === 'cloc');
    if (c.next) Object.assign(c.next, { fusionOn: b === 'cxone', fusionNewOn: b === 'git' || b === 'cloc' });
    saveFusion();
    saveFnew();
    renderFusion();
    renderFusionNew();
    renderTr();
    d.renderPending();
    d.renderSummary();
    placeFusion();
  }
  const credits = (t) => (t && t.projects ? num(Math.round(t.credits)) : '—');
  /**
   * Until one is picked by hand, the estimate predicting the most credits is the one in them (the most 10K-LOC blocks
   * while no model has a price). True when it changed the one in use (and drew everything again).
   */
  let autoPicking = false;
  function autoBasis(all = estimates()) {
    if (!c.open || autoPicking || fnew().basisByHand) return false;
    const order = Object.keys(BASES).filter((k) => all[k].projects);
    if (!order.length) return false;
    // The estimate in use stays while it has anything to count: none is swapped for a bigger one. With nothing in use
    // yet, Checkmarx One's when it was read, else the code counted (git before cloc-fusion).
    const now = basis();
    if (now === 'both' || (all[now]?.projects ?? 0) > 0) return false;
    const best = order[0];
    if (best === now) return false;
    autoPicking = true;
    try {
      useBasis(best, { byHand: false });
    } finally {
      autoPicking = false;
    }
    return true;
  }
  function renderBasis() {
    if (!c.open) return;
    if (fnew().onTop && basis() === 'both') {
      const skip = onTopOf('git').skip;
      if (skip.slice().sort().join('\n') !== [...(fnew().onTopSkip ?? [])].sort().join('\n')) {
        fnew().onTopSkip = skip;
        saveFnew();
      }
    }
    const all = estimates();
    if (autoBasis(all)) return;
    const shownRows = fnewEstimate().rows;
    $('calc-fnew-log-count').textContent = shownRows.length ? `(${num(shownRows.length)})` : '(none yet)';
    const used = basis();
    const months = horizon();
    for (const [b, d] of Object.entries(BASES)) {
      const box = $(`calc-fh-${d.tab}`);
      if (!box) continue;
      const t = all[b];
      const top = used === 'both' && fnew().onTop ? 'git' : null;
      const on = used === b || (used === 'both' && (b === 'cxone' || b === top));
      const connection = b === 'cxone'
        ? (tr()?.totals?.meta?.source === 'cxone' || scoped().length ? `<span class="calc-fh-pill ok">Read from Checkmarx One · ${num(scoped().length)} projects</span>` : '<span class="calc-fh-pill">Not read yet: connect the key at the top and Read from Checkmarx One</span>')
        : b === 'git'
          ? (t.projects ? `<span class="calc-fh-pill ok">Counted from git · ${num(t.projects)} repositories</span>` : '<span class="calc-fh-pill">Nothing counted yet: give a token below and count the repositories</span>')
          : (t.projects ? `<span class="calc-fh-pill ok">Imported · ${num(t.projects)} repositories</span>` : '<span class="calc-fh-pill">Nothing imported yet: download cloc-fusion, send it to the customer, import the report they send back</span>');
      const facts = t.projects
        ? `<span><b>${num(t.projects)}</b> ${d.what}</span><span><b>${num(t.lines)}</b> lines of code</span><span title="${esc(blocksWhy(t))}"><b>${num(t.units)}</b> 10K-LOC blocks</span><span><b>${num(t.scans)}</b> Fusion scans</span><span class="hint">${b === 'cxone' ? 'scans from how often each project was scanned in the last 12 months' : 'scans from the commits on each default branch'}</span>`
        : '';
      const others = Object.entries(BASES).filter(([k]) => k !== b && all[k].projects).map(([k, o]) => `<div class="calc-fh-alt">${esc(o.short)}: ${credits(all[k])}${used === k ? ' · <b>in use</b>' : ` · <button type="button" class="link" data-use-basis="${esc(k)}">use instead</button>`}</div>`).join('');
      // On top of Checkmarx One: what the repositories that are not there yet add, in credits and as a share of its own.
      const pctOf = (extraCredits) => (all.cxone.credits > 0 ? ` (+${num(Math.round((extraCredits / all.cxone.credits) * 1000) / 10, 1)}% on Checkmarx One’s ${credits(all.cxone)})` : '');
      let extra = '';
      if (b !== 'cxone' && scoped().length && t.projects) {
        const add = onTopOf(b).totals;
        if (top === b) extra = `<div class="calc-fh-foot calc-fh-top"><b>✓ On top of Checkmarx One:</b> ${num(add.projects)} repositories that are not projects there, <b>+${num(Math.round(add.credits))}</b> credits${pctOf(add.credits)}. <button type="button" class="link" data-use-basis="cxone">Take them out</button></div>`;
        else if (add.projects) extra = `<div class="calc-fh-foot calc-fh-top">${num(add.projects)} of these repositories are not projects in Checkmarx One yet (matched by name): <b>+${num(Math.round(add.credits))}</b> credits${pctOf(add.credits)}. <button type="button" class="secondary" data-on-top="${esc(b)}">Add them on top of Checkmarx One</button></div>`;
        else extra = '<div class="calc-fh-foot">Every one of these repositories is already a project in Checkmarx One (matched by name): nothing to add.</div>';
      } else if (b === 'cxone' && top) {
        const add = onTopOf(top).totals;
        extra = `<div class="calc-fh-foot calc-fh-top"><b>Plus ${num(add.projects)} repositories ${top === 'git' ? 'counted from git' : 'from cloc-fusion'}</b> that are not projects here: +${num(Math.round(add.credits))} credits${pctOf(add.credits)}.</div>`;
      }
      const both = used === 'both' && b !== 'git' && b !== 'cloc' ? '' : '';
      box.innerHTML = `
        <div class="calc-fh-main">
          <div class="calc-fh-kick calc-fh-${b}">${esc(d.kick)}</div>
          <h2>${esc(d.title)}</h2>
          <div class="calc-fh-conn">${connection}</div>
          ${facts ? `<div class="calc-fh-facts">${facts}</div>` : ''}
        </div>
        <div class="calc-fh-side">
          <div class="calc-fh-credits"><b>${credits(t)}</b><span>credits over ${num(months)} months</span></div>
          ${on ? `<span class="calc-fh-used">✓ ${top === b ? 'Added on top' : 'Used in the credits'}</span>` : `<button type="button" class="primary" data-use-basis="${esc(b)}"${t.projects ? '' : ' disabled'}>${used === 'none' ? 'Use this' : 'Use this instead'}</button>`}
          ${others}
          ${used === 'none' ? '<div class="calc-fh-alt"><b>Fusion is left out</b></div>' : '<button type="button" class="link calc-fh-out" data-use-basis="none">Leave Fusion out</button>'}
        </div>
        ${used === 'both' && !top ? `<div class="calc-fh-foot">Both Checkmarx One and the counted code are in the credits (saved that way before). Pick one with <b>Use this instead</b>, or add only the repositories that are not in Checkmarx One, so no code is counted twice.</div>` : ''}${extra}${both}`;
    }
  }
  document.getElementById('page-calculator').addEventListener('click', (event) => {
    const onTop = event.target.closest('[data-on-top]');
    if (onTop) return useOnTop(onTop.dataset.onTop);
    const pick = event.target.closest('[data-use-basis]');
    if (pick && !pick.disabled) useBasis(pick.dataset.useBasis);
  });

  /** The parts the three Fusion tabs share (visuals, pricing, the counted code) go to the tab in view. */
  function placeFusion() {
    const panel = [...document.querySelectorAll('#page-calculator [data-ptpanel^="calculator:fusion"]')].find((x) => !x.hidden);
    if (!panel) return;
    const view = panel.dataset.ptpanel.split(':')[1];
    const slot = panel.querySelector('.calc-fslot');
    // The visuals draw the estimate in the credits: shown on that estimate's tab only.
    const viz = $('calc-fusion-viz-panel');
    const mine = { fusion: 'cxone', 'fusion-git': 'git' }[view];
    const inUse = basis();
    viz?.classList.toggle('calc-viz-elsewhere', !(inUse === mine || (inUse === 'both' && mine === 'cxone')));
    const parts = [viz, $('calc-fusion-pricing')];
    const counted = document.querySelector('#page-calculator .calc-fsub[data-fsub="new"]');
    const freq = $('calc-freq-panel');
    if (view === 'fusion') {
      slot.append(...parts.filter(Boolean));
      // The scans by how often projects are scanned go back among Checkmarx One's settings.
      if (freq && freqHome && freq.previousSibling !== freqHome) freqHome.after(freq);
      // The tiles go back to their place among the counted code's settings.
      const kpis = $('calc-fnew-kpis');
      const home = $('calc-fnew-log');
      if (kpis && home && kpis.nextElementSibling !== home) home.before(kpis);
    }
    else {
      slot.append(...parts.filter(Boolean), counted);
      // The tiles (repositories, lines, developers, scans) lead the tab, under its header.
      const kpis = $('calc-fnew-kpis');
      if (kpis) slot.prepend(kpis);
      // The same scans by how often a repository changes, as for Checkmarx One's projects by how often they are scanned.
      if (freq) counted.after(freq);
      // Counted from git, or from the customer's cloc-fusion report (or cloc results): all three ways, on one tab.
      for (const label of document.querySelectorAll('#calc-fnew-ways .mode')) label.hidden = false;
      $('calc-fnew-ways').hidden = false;
      // The source picked at the top of the hosted calculator says which way leads.
      const src = document.documentElement.dataset.src;
      if (src === 'cloc' && d.way === 'git') showWay('report');
      else if (src === 'git' && d.way !== 'git') showWay('git');
    }
    if (c.open) renderRules();
    panel.classList.toggle('calc-fview-new', view !== 'fusion');
    panel.dataset.fview = view;
    renderBasis();
  }
  // Where the scans by how often projects are scanned sit among Checkmarx One's settings, to go back to.
  const freqHome = (() => {
    const freq = $('calc-freq-panel');
    if (!freq) return null;
    const mark = document.createComment('calc-freq-panel');
    freq.before(mark);
    return mark;
  })();
  for (const panel of document.querySelectorAll('#page-calculator [data-ptpanel^="calculator:fusion"]')) new MutationObserver(placeFusion).observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  /** The Admin's git connections, once: each one a choice in step 1, beside a token typed for one run. */
  async function loadConnections() {
    if (git.connections) return;
    git.connections = [];
    try {
      const found = await api('/api/projections/git/connections', { quiet: true });
      git.connections = found.connections ?? [];
      git.limit = wholeNumber(found.limits?.repositories) || git.limit;
      if (found.clocFusion?.version) $('calc-cf-sum').textContent = `cloc-fusion ${found.clocFusion.version} · SHA-256 ${found.clocFusion.sha256}`;
    } catch (error) {
      if (handleAuthLoss(error)) return;
    }
    renderHosts();
  }

  const chosenSources = () => [...$('calc-git-hosts').querySelectorAll('input:checked')].map((i) => i.value);
  function renderHosts() {
    const list = git.connections ?? [];
    git.chosen ??= new Set(list.length ? [list[0].id] : ['token']);
    $('calc-git-hosts').innerHTML = [
      ...list.map((x, i) => `<label class="calc-git-host"><input type="checkbox" name="calc-git-host" value="${esc(x.id)}"${git.chosen.has(x.id) ? ' checked' : ''} /><span><b translate="no">${esc(`${x.label} · ${x.host}${x.owner ? ` · ${x.owner}` : ''}`)}</b><small>${i === 0 ? 'A git connection the Admin already set up (the same tokens as Code authors). Nothing to type.' : 'Another git connection the Admin set up.'}</small></span></label>`),
      `<label class="calc-git-host"><input type="checkbox" name="calc-git-host" value="token"${git.chosen.has('token') ? ' checked' : ''} /><span><b>Git tokens for this run only (one or more)</b><small>${standalone ? 'The customer’s own read-only token: git on this computer fetches the code and counts it here.' : 'The customer’s own read-only token, for a host connected or allowed by the Admin.'}</small></span></label>`,
    ].join('');
    hostChanged();
  }

  function hostChanged() {
    git.chosen = new Set(chosenSources());
    $('calc-git-token').hidden = !git.chosen.has('token');
    $('calc-git-address').placeholder = GIT_ADDRESS[$('calc-git-provider').value];
    d.countLabel();
  }
  const hostSwitched = () => {
    git.repos = [];
    git.orgs = {};
    d.renderOrgs();
    d.renderRepos();
    hostChanged();
  };
  $('calc-git-hosts').addEventListener('change', hostSwitched);
  $('calc-git-provider').addEventListener('change', hostSwitched);

  return {
    BASES, basis, bytes, cleanUrl, fnew, fnewCounts, fnewEstimate, fnewKpi, fnewOff, git, GIT_ADDRESS,
    hostSwitched, placeFusion, renderBasis, renderFusionNew, saveFnew, showWay, upsertMeasured,
  };
}
