import { aheadSettings, BUNDLE_CREDITS, cleanScope, CRITICALITIES, FREQUENCIES, fusionSettings, MAX_PROJECTS, originCounts, settingChanges, sharesFull, topSettings, totalsSettings, weightedSeries, wholeNumber } from './model.js';

/**
 * The settings at the top: which projects count, which scan origins, and the one Apply for them all.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupScope(d) {
  const {
    $, api, c, counts, esc, fnew, fnewOff, FREQ_LABEL, fusion, fusionOff, handleAuthLoss, horizon,
    leftOutCounts, narrowed, num, offline, renderFusion, renderHorizon, renderProjects, renderRules,
    renderTr, ROWS_FIRST, save, scope, setStatus, showError, sure, toast, tr, trEngines, trShareOf,
  } = d;
  // ---- Scope: which projects count, for both parts (as narrowing the Dashboard) --------------

  const splitList = (text) => String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const FREQ_BOXES = FREQUENCIES.map((q) => `<label class="pill-check"><input type="checkbox" value="${q.id}" /> ${esc(q.label)}</label>`).join('');
  $('calc-scope-frequencies').innerHTML = FREQ_BOXES;
  $('calc-scope-criticalities').innerHTML = CRITICALITIES.map((k) => `<label class="pill-check"><input type="checkbox" value="${k}" /> ${k}</label>`).join('');

  /** What the scope fields show (as chosen, until Apply), and the names offered as one types (from the last read). */
  function renderScope() {
    if (!c.open) return;
    const { scope: sc, allBranches } = next();
    // The names offered as you type (every project, application, group and person): made when the settings are
    // opened, not for a box that is closed (thousands of entries nobody is looking at).
    if (!$('calc-scope-form').hidden) fillScopeLists();
    else scopeListsFor = null;
    drawScopeChips();
    $('calc-scope-groups').value = sc.groups.join(', ');
    $('calc-scope-names').value = sc.names.join(', ');
    $('calc-scope-initiators').value = sc.initiators.join(', ');
    for (const box of $('calc-scope-frequencies').querySelectorAll('input')) box.checked = sc.frequencies.includes(box.value);
    for (const box of $('calc-scope-criticalities').querySelectorAll('input')) box.checked = sc.criticalities.includes(Number(box.value));
    $('calc-leave-no-code').checked = sc.leaveOutNoCode;
    $('calc-leave-no-findings').checked = sc.leaveOutNoFindings;
    // Ticked: every branch (the last read's, until another is applied).
    $('calc-all-branches').checked = allBranches;
    $('calc-max-projects').value = num(sc.maxProjects);
    renderOrigins();
    renderScopeSummary();
    renderPending();
  }

  let scopeListsFor = null; // the projects the lists of names were last made from
  function fillScopeLists() {
    const projects = fusion()?.projects ?? [];
    if (scopeListsFor === projects && $('calc-scope-projects-list').childElementCount) return;
    scopeListsFor = projects;
    const offer = (id, values) => {
      $(id).replaceChildren(...[...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 500).map((v) => Object.assign(document.createElement('option'), { value: v })));
    };
    offer('calc-scope-applications-list', projects.flatMap((p) => p.applications ?? []));
    $('calc-scope-projects-list').replaceChildren(...projects.filter((p) => p.source !== 'manual').slice(0, 5000).map((p) => Object.assign(document.createElement('option'), { value: p.name })));
    offer('calc-scope-groups-list', projects.flatMap((p) => p.groups ?? []));
    offer('calc-scope-initiators-list', projects.map((p) => p.initiator));
  }

  /** The projects counted now (as applied): how many, and what narrows them. */
  function renderScopeSummary() {
    const sc = scope();
    const all = (fusion()?.projects ?? []).filter((p) => p.source !== 'manual');
    const inIt = all.filter((p) => counts(p, sc)).length;
    const out = leftOutCounts(sc);
    const nameOf = new Map(all.map((p) => [p.id, p.name]));
    const parts = [
      sc.applications.length && `${sc.applications.length === 1 ? 'Application' : 'Applications'}: ${sc.applications.join(', ')}`,
      sc.projects.length && (sc.projects.length <= 3 ? `${sc.projects.length === 1 ? 'Project' : 'Projects'}: ${sc.projects.map((id) => nameOf.get(id) ?? id).join(', ')}` : `${num(sc.projects.length)} projects picked`),
      sc.groups.length && `${sc.groups.length === 1 ? 'Group' : 'Groups'}: ${sc.groups.join(', ')}`,
      sc.names.length && `Names: ${sc.names.join(', ')}`,
      sc.initiators.length && `Last scanned by: ${sc.initiators.join(', ')}`,
      sc.frequencies.length && `Scanned: ${sc.frequencies.map((id) => FREQ_LABEL[id]).join(', ')}`,
      sc.criticalities.length && `Criticality: ${sc.criticalities.join(', ')}`,
      out.noCode && `${num(out.noCode)} with no lines of code left out`,
      out.noFindings && `${num(out.noFindings)} with no open findings left out`,
      out.noOrigin && `${num(out.noOrigin)} with no scan from the scan origins chosen left out`,
    ].filter(Boolean);
    const el = $('calc-scope-summary');
    // Each part its own piece, so each is translated on its own.
    const pieces = !parts.length ? [all.length ? `All ${num(all.length)} projects` : 'All projects'] : [`${num(inIt)} of ${num(all.length)} projects`, ...parts];
    el.replaceChildren(...pieces.flatMap((text, i) => [...(i ? [' · '] : []), Object.assign(document.createElement('span'), { textContent: text })]));
    el.classList.toggle('on', parts.length > 0);
  }

  $('calc-scope-toggle').addEventListener('click', () => {
    const form = $('calc-scope-form');
    form.hidden = !form.hidden;
    $('calc-scope-toggle').setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) fillScopeLists();
    if (!form.hidden) $('calc-scope-groups').focus();
  });

  // Applications and projects: chips, as on the Dashboard. A change waits for Apply.
  const scopeProjects = () => (fusion()?.projects ?? []).filter((p) => p.source !== 'manual');
  function drawScopeChips() {
    const sc = next().scope;
    const nameOf = new Map(scopeProjects().map((p) => [p.id, p.name]));
    const draw = (box, entries, kind) => {
      for (const chip of box.querySelectorAll('.scope-chip')) chip.remove();
      const input = box.querySelector('input');
      for (const [key, label] of entries) {
        const chip = document.createElement('span');
        chip.className = 'scope-chip';
        const text = Object.assign(document.createElement('span'), { textContent: label, title: label });
        text.setAttribute('translate', 'no');
        const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '×' });
        remove.setAttribute('aria-label', `Remove ${label}`);
        remove.dataset.removeScope = kind;
        remove.dataset.key = key;
        chip.append(text, remove);
        box.insertBefore(chip, input);
      }
    };
    draw($('calc-apps'), sc.applications.map((a) => [a, a]), 'applications');
    draw($('calc-projects'), sc.projects.map((id) => [id, nameOf.get(id) ?? id]), 'projects');
  }

  /** A change to the scope chosen: it waits for Apply. */
  function changeScope(change) {
    setNext({ scope: { ...next().scope, ...change } });
    drawScopeChips();
  }

  /** The application or project with exactly this name, else every one whose name contains it. */
  function pickScope(kind, text) {
    const wanted = text.trim().toLowerCase();
    if (!wanted || !c.open) return;
    const sc = next().scope;
    if (kind === 'applications') {
      const all = [...new Set(scopeProjects().flatMap((p) => p.applications ?? []))];
      const exact = all.filter((a) => a.toLowerCase() === wanted);
      const found = exact.length ? exact : all.filter((a) => a.toLowerCase().includes(wanted));
      if (!found.length) return setStatus('calc-scope-status', all.length ? `No application name contains "${text.trim()}".` : 'Read Checkmarx One first: the applications come from it.', 'error');
      changeScope({ applications: [...sc.applications, ...found] });
    } else {
      const all = scopeProjects();
      const exact = all.filter((p) => p.name.toLowerCase() === wanted);
      const found = exact.length ? exact : all.filter((p) => p.name.toLowerCase().includes(wanted));
      if (!found.length) return setStatus('calc-scope-status', all.length ? `No project name contains "${text.trim()}".` : 'Read Checkmarx One first: the projects come from it.', 'error');
      changeScope({ projects: [...sc.projects, ...found.map((p) => p.id)] });
    }
  }

  for (const [inputId, kind] of [['calc-app-input', 'applications'], ['calc-project-input', 'projects']]) {
    const input = $(inputId);
    const commit = () => {
      const value = input.value;
      input.value = '';
      pickScope(kind, value);
    };
    input.addEventListener('keydown', (event) => {
      if (['Enter', ',', 'Tab'].includes(event.key)) {
        if (!input.value.trim()) return;
        event.preventDefault();
        commit();
      } else if (event.key === 'Backspace' && !input.value && next().scope[kind].length) {
        changeScope({ [kind]: next().scope[kind].slice(0, -1) });
      }
    });
    // A suggestion picked from the list: add it at once; anything else typed is added by Apply.
    input.addEventListener('input', () => {
      const value = input.value.trim().toLowerCase();
      const exact = value && (kind === 'applications' ? scopeProjects().some((p) => (p.applications ?? []).some((a) => a.toLowerCase() === value)) : scopeProjects().some((p) => p.name.toLowerCase() === value));
      if (exact) commit();
      else renderPending();
    });
  }
  $('calc-scope-box').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-scope]');
    if (!button || !c.open) return;
    const kind = button.dataset.removeScope;
    changeScope({ [kind]: next().scope[kind].filter((k) => k !== button.dataset.key) });
  });

  /**
   * What triage & remediation counts was changed (a group's share, a project ticked or unticked): the backlog is
   * added up again from the last read. When that cannot be done (the read is no longer held: it is kept only while
   * connected to this account), the change is taken back and the reason said where it was made, instead of a figure
   * left as it was beside a setting that says otherwise.
   */
  let lastCounted = null; // what was counted before the changes still being worked out (several can follow each other)
  let recounts = 0;
  async function recountBacklog(given) {
    // The setting to go back to is the one before the first change still on its way, not one of those in between.
    lastCounted ??= given;
    const was = lastCounted;
    recounts += 1;
    const done = await applyScope();
    recounts -= 1;
    if (done !== false) {
      if (!recounts) lastCounted = null;
      return;
    }
    if (recounts) return; // a later change is still being worked out: it settles what stands
    lastCounted = null;
    // As it was, spelled out (a setting left out of what is saved would keep the value just tried).
    const before = aheadSettings(was);
    c.open.tr = { ...tr(), shares: { ...before.shares }, excluded: [...before.excluded], activeOnly: Boolean(was.activeOnly) };
    save({ tr: c.open.tr });
    // The box being typed in is left alone by a redraw (so typing is never lost): here it is put back by hand.
    document.activeElement?.blur?.();
    renderTr();
    const shares = aheadSettings(tr()).shares;
    for (const box of $('calc-tr').querySelectorAll('[data-share]')) box.value = shares[box.dataset.share] ?? 100;
  }

  /** Use the scope: Fusion counts its projects, and triage & remediation reads their backlog (from the last read). */
  async function applyScope({ quiet = false } = {}) {
    if (!c.open) return;
    renderScopeSummary();
    d.rowsShown = ROWS_FIRST;
    renderRules();
    renderProjects();
    const fromTenant = tr()?.totals?.meta?.source === 'cxone';
    // Filling in as the projects come in: Fusion follows the scope now, the backlog's weeks when the read is done (applyRead).
    if (d.reading.stream && c.open.id === d.reading.customer) {
      if (!quiet && narrowed()) setStatus('calc-scope-status', 'Fusion follows the scope now; triage & remediation does when the read is done.', 'muted');
      return renderTr();
    }
    if (!fromTenant) {
      if (!quiet && narrowed()) setStatus('calc-scope-status', 'Fusion follows the scope. Triage & remediation comes from the two exports, which cover every project.', 'warn');
      return renderTr();
    }
    const inScopeNow = fusion().projects.filter((p) => p.source !== 'manual' && counts(p));
    // Triage & remediation only: each group of projects (by how often they are scanned) with its share of findings.
    // Fusion keeps every project of the scope.
    const shares = aheadSettings(tr()).shares;
    const byShare = new Map();
    const A = aheadSettings(tr());
    for (const p of inScopeNow) {
      const share = trShareOf(p, A);
      if (share > 0) byShare.set(share, [...(byShare.get(share) ?? []), p.id]);
    }
    const ids = [...byShare.values()].flat();
    try {
      // Only the scans from the scan origins chosen count (null: every scan).
      const ask = (projectIds) => api('/api/projections/series', { method: 'POST', body: JSON.stringify({ projectIds, engines: trEngines(), origins: scope().origins }), quiet: true });
      let series;
      if (byShare.size <= 1 && (byShare.keys().next().value ?? 100) === 100) series = await ask(ids);
      else series = weightedSeries(await Promise.all([...byShare].map(async ([share, list]) => ({ share, series: await ask(list) })))) ?? (await ask([]));
      const partial = !sharesFull(shares) || A.excluded.length > 0;
      c.open.tr = { ...tr(), totals: series.totals, fixed: series.fixed, activeCount: partial ? ids.length : null, activeOf: partial ? inScopeNow.length : null };
      save({ tr: c.open.tr });
      if (!quiet) setStatus('calc-scope-status', `${num(ids.length)} projects counted.`, 'ok');
    } catch (error) {
      if (handleAuthLoss(error)) return false;
      if (!quiet) {
        showError('calc-scope-status', error);
        // Said where the change was made too (the status above sits in the settings, which may be closed).
        toast(/Read Checkmarx One first/.test(error.message) ? 'Not changed: what each project has open is kept only while you are connected to this account. Connect and read Checkmarx One again (Refresh, at the top), then change what is counted.' : `Not changed: ${error.message}`, 'bad', 12000);
      }
      renderTr();
      return false;
    }
    renderTr();
    return true;
  }

  // More filters: each change waits for Apply; Enter in a field applies.
  const readFilters = () => {
    const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((box) => box.value);
    return {
      groups: splitList($('calc-scope-groups').value),
      names: splitList($('calc-scope-names').value),
      initiators: splitList($('calc-scope-initiators').value),
      frequencies: checked('calc-scope-frequencies'),
      criticalities: checked('calc-scope-criticalities').map(Number),
    };
  };
  for (const kind of ['input', 'change']) {
    $('calc-scope-form').addEventListener(kind, () => {
      if (c.open) setNext({ scope: { ...next().scope, ...readFilters() } }, { redraw: false });
    });
  }
  $('calc-scope-form').addEventListener('submit', (event) => {
    event.preventDefault();
    applyAll();
  });
  // Leave out projects with nothing to analyse.
  for (const [id, key] of [['calc-leave-no-code', 'leaveOutNoCode'], ['calc-leave-no-findings', 'leaveOutNoFindings']]) {
    $(id).addEventListener('change', (event) => {
      if (c.open) changeScope({ [key]: event.target.checked });
    });
  }
  $('calc-scope-clear').addEventListener('click', () => {
    if (!c.open) return;
    // Every project: the picks go; the leave-out options, Projects to read and the scan origins stay as they are.
    const { leaveOutNoCode, leaveOutNoFindings, maxProjects, origins } = next().scope;
    setNext({ scope: { leaveOutNoCode, leaveOutNoFindings, maxProjects, origins } });
  });

  // Every branch, and how many of the tenant's projects a read takes (10,000 unless set): both wait for Apply.
  $('calc-all-branches').addEventListener('change', (event) => {
    if (c.open) setNext({ allBranches: event.target.checked }, { redraw: false });
  });
  $('calc-max-projects').addEventListener('change', (event) => {
    if (!c.open) return;
    const typed = wholeNumber(event.target.value);
    setNext({ scope: { ...next().scope, maxProjects: typed } }, { redraw: false });
    event.target.value = num(next().scope.maxProjects);
    if (typed > MAX_PROJECTS) setStatus('calc-read-note', `At most ${num(MAX_PROJECTS)} projects are read at once.`, 'warn');
  });

  // ---- Include scans from: the scan origins whose scans count ----------------------------------

  /** Every scan origin the last read found, with its scans and projects. */
  const knownOrigins = () => originCounts(fusion()?.projects ?? []);
  /** Did the last read record where scans came from? (No read, or none recorded: no.) */
  const originsRead = () => (fusion()?.projects ?? []).some((p) => p.source !== 'manual' && p.origins);

  /** The drop-down: each scan origin, ticked when its scans count (as chosen, until Apply). */
  function renderOrigins() {
    const known = knownOrigins();
    const chosen = next().scope.origins;
    const on = (o) => !chosen || chosen.includes(o);
    const ticked = known.filter((x) => on(x.origin)).length;
    $('calc-origin-summary').textContent = !known.length ? 'Every scan origin' : ticked === known.length ? `Every scan origin (${num(known.length)})` : ticked ? `${num(ticked)} of ${num(known.length)} scan origins` : 'No scan origin';
    $('calc-origin-pick').classList.toggle('on', Boolean(chosen) && ticked < known.length);
    const menu = $('calc-origin-menu');
    if (!known.length) {
      menu.innerHTML = `<p class="hint calc-origin-none">${originsRead() || !fusion()?.projects?.length ? 'Read from Checkmarx One to see where the scans come from.' : 'The last read did not record where the scans come from: read from Checkmarx One again to choose.'}</p>`;
      return;
    }
    menu.innerHTML = `<div class="calc-origin-tools"><button type="button" class="link" data-origins="all">Select all</button><button type="button" class="link" data-origins="none">Clear</button></div>${known
      .map((x, i) => `<label class="engine-opt"><input type="checkbox" value="${esc(x.origin)}"${on(x.origin) ? ' checked' : ''} /><b>${esc(x.origin)}</b><span></span><small>${i ? `${num(x.scans)} · ${num(x.projects)}` : `${num(x.scans)} scans · ${num(x.projects)} projects`}</small></label>`)
      .join('')}`;
  }
  /** Ticked: every origin is null, so one a later read finds counts too. */
  const setOrigins = (list) => {
    const known = knownOrigins().map((x) => x.origin);
    setNext({ scope: { ...next().scope, origins: list === null || known.every((o) => list.includes(o)) ? null : list } }, { redraw: false });
    renderOrigins();
  };
  $('calc-origin-menu').addEventListener('change', () => setOrigins([...$('calc-origin-menu').querySelectorAll('input:checked')].map((box) => box.value)));
  $('calc-origin-menu').addEventListener('click', (event) => {
    const button = event.target.closest('[data-origins]');
    if (button && c.open) setOrigins(button.dataset.origins === 'all' ? null : []);
  });
  document.addEventListener('click', (event) => {
    const pick = $('calc-origin-pick');
    if (pick.open && !pick.contains(event.target)) pick.open = false;
  });

  // ---- One Apply for every setting at the top: changes wait, listed, until Apply (or Undo) ------

  /** The settings at the top as they count now. During a read, its branches are the ones taken. */
  const appliedSettings = () =>
    topSettings({ allBranches: d.reading.branches ? d.reading.branches === 'all' : tr()?.totals?.meta?.branches === 'all', fusionOn: !fusionOff(), fusionNewOn: !fnewOff(), periodMonths: horizon(), ...d.totals(), scope: scope() });
  /** The settings at the top as chosen: the same as applied until something is changed. */
  const next = () => (c.next ??= appliedSettings());
  /** Change what is chosen (it waits for Apply); `redraw`: put every field at the top back as chosen. */
  function setNext(change, { redraw = true } = {}) {
    c.next = topSettings({ ...next(), ...change });
    if (redraw) renderTop();
    else renderPending();
  }
  /** Every field at the top as chosen. */
  function renderTop() {
    if (!c.open) return;
    const n = next();
    $('calc-fusion-on').checked = n.fusionOn;
    $('calc-fusion-new-on').checked = n.fusionNewOn;
    $('calc-extra').value = n.extraPercent || '';
    $('calc-bundle').value = n.bundleCredits;
    // The bundle size is 10,000 for nearly every customer: it waits behind the "?" on Bundles, marked when it is another.
    $('calc-bundle-size').textContent = `Bundles of ${num(n.bundleCredits)} credits, rounded up to whole bundles.`;
    $('calc-bundle-q').classList.toggle('calc-q-set', Number(n.bundleCredits) !== BUNDLE_CREDITS);
    renderHorizon();
    renderScope();
  }
  /** What the last read can answer: when, which branches, where it stopped, and whether it recorded scan origins. */
  const lastRead = () => {
    const meta = tr()?.totals?.meta ?? {};
    return { at: (meta.source === 'cxone' ? meta.readAt : null) ?? fusion()?.readAt ?? null, branches: meta.branches, limit: fusion()?.readLimit ?? null, origins: originsRead() };
  };
  /** What is typed in Applications or Projects and not added yet: Apply adds it. */
  const typedScope = () => [['calc-app-input', 'applications', 'Applications'], ['calc-project-input', 'projects', 'Projects']].filter(([id]) => $(id).value.trim());
  const pending = () => {
    const changes = settingChanges(appliedSettings(), next(), lastRead()).filter((x) => !offline() || !x.reads);
    for (const [, key, label] of typedScope()) if (!changes.some((x) => x.key === key)) changes.push({ key, label, reads: false });
    return changes;
  };
  /** Where each change is made, marked while it waits. */
  const MARKED = {
    allBranches: () => $('calc-all-branches').closest('label'),
    maxProjects: () => $('calc-max-projects'),
    fusionOn: () => $('calc-fusion-on').closest('label'),
    fusionNewOn: () => $('calc-fusion-new-on').closest('label'),
    origins: () => $('calc-origin-pick').querySelector('summary'),
    applications: () => $('calc-apps'),
    projects: () => $('calc-projects'),
    leaveOutNoCode: () => $('calc-leave-no-code').closest('label'),
    leaveOutNoFindings: () => $('calc-leave-no-findings').closest('label'),
    groups: () => $('calc-scope-groups'),
    names: () => $('calc-scope-names'),
    initiators: () => $('calc-scope-initiators'),
    frequencies: () => $('calc-scope-frequencies'),
    criticalities: () => $('calc-scope-criticalities'),
    periodMonths: () => $('calc-horizon'),
    extraPercent: () => $('calc-extra'),
    // Behind its "?": the "?" is marked, so a change waiting shows with the box closed.
    bundleCredits: () => $('calc-bundle-q'),
  };
  /** The bar that lists what waits, with Undo and Apply. */
  function renderPending() {
    const changes = c.open ? pending() : [];
    // Apply is always in view in the settings block: quiet while everything is applied, lit when something waits.
    const idle = !changes.length;
    $('calc-pending').hidden = !c.open;
    $('calc-pending').classList.toggle('idle', idle);
    $('calc-apply').disabled = !c.open || idle;
    $('calc-undo').hidden = idle;
    $('calc-pending-count').textContent = idle ? 'Every setting is applied' : changes.length === 1 ? '1 change not applied yet' : `${num(changes.length)} changes not applied yet`;
    $('calc-pending-list').replaceChildren(...changes.map((x) => Object.assign(document.createElement('li'), { textContent: x.reads ? `${x.label} (reads Checkmarx One again)` : x.label })));
    const waiting = new Set(changes.map((x) => x.key));
    for (const [key, el] of Object.entries(MARKED)) el()?.classList.toggle('calc-changed', waiting.has(key));
  }

  /** Why Apply reads Checkmarx One again, asked first. */
  function readQuestion(reads, wanted) {
    const why = {
      allBranches: wanted.allBranches ? 'Every branch: the scans of every branch are read, not only each project’s primary branch.' : 'Every branch, unticked: only each project’s primary branch is read.',
      maxProjects: `Projects to read: up to ${num(wanted.scope.maxProjects)} projects, more than the last read took.`,
      origins: 'Include scans from: the last read did not record where the scans come from.',
    };
    return `Read Checkmarx One again now? These changes need it.\n\n${reads.map((x) => `• ${why[x.key]}`).join('\n')}\n\nOn a large tenant this takes a while.`;
  }

  /**
   * Apply every change waiting at once, and work the figures out again. A change the last read cannot
   * answer reads Checkmarx One again, asked first (`read`: read anyway, without asking: Read from Checkmarx One).
   */
  async function applyAll({ read = false } = {}) {
    if (!c.open) return;
    // What is typed in Applications and Projects is added first, as Enter adds it.
    for (const [id, kind] of typedScope()) {
      const value = $(id).value;
      $(id).value = '';
      pickScope(kind, value);
    }
    const wanted = next();
    const before = appliedSettings();
    const changes = settingChanges(before, wanted, lastRead());
    const reads = offline() ? [] : changes.filter((x) => x.reads);
    if (!changes.length && !read) return renderPending();
    if (reads.length && !read && !await sure(readQuestion(reads, wanted))) return;
    if (changes.length) {
      c.open.scope = cleanScope(wanted.scope);
      fusion().periodMonths = wanted.periodMonths;
      fusion().optOut = !wanted.fusionOn;
      fnew().optOut = !wanted.fusionNewOn;
      Object.assign(c.open.fusion, fusionSettings(fusion()));
      c.open.totals = totalsSettings(wanted);
      save({ scope: c.open.scope, fusion: fusion(), fusionNew: fnew(), totals: c.open.totals });
    }
    const fresh = read || reads.length > 0;
    if (fresh) d.readCxOne({ branches: wanted.allBranches ? 'all' : 'primary' });
    c.next = null;
    renderTop();
    renderFusion();
    renderTr();
    // Which projects or scans count changed: the figures from the last read again (a new read does it once more).
    if (changes.some((x) => x.key !== 'maxProjects' && Object.hasOwn(before.scope, x.key))) applyScope({ quiet: fresh });
  }
  $('calc-apply').addEventListener('click', () => applyAll());
  $('calc-undo').addEventListener('click', () => {
    if (!c.open) return;
    for (const [id] of typedScope()) $(id).value = '';
    c.next = null;
    renderTop();
  });

  return {
    applyAll, applyScope, knownOrigins, next, recountBacklog, renderPending, renderScope, renderTop, setNext,
  };
}
