import { DEFAULT_ENGINES } from '../engines.js';
import { nextSpeedster } from '../speedsters.js';
import { SEVERITY_COLOURS } from './charts.js';
import { aheadSettings, cleanScope, FREQUENCIES, readLimit, SEVERITIES, sharesFull, suggestedScans, topSettings } from './model.js';

/**
 * Reading Checkmarx One: starting a read, and the panel that shows it as it goes.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupRead(d) {
  const {
    $, api, applyAll, applyScope, basis, c, esc, estimate, flush, fmtDateTime, fnew, FREQ_LABEL, FROM_LABEL,
    fusion, fusionOff, handleAuthLoss, knownOrigins, narrowed, next, num, offline, placeFusion, renderFusion,
    renderPending, renderScope, renderTr, save, saveFnew, saveFusion, scope, setStatus, showError,
    sortedRows, syncDraft, toast, tr, trEngines,
  } = d;
  // ---- Reading Checkmarx One: both tabs come from the tenant's projects and their scans ----------

  // `branches`: what the read running takes ('all' or 'primary'), so Every branch is not shown as waiting meanwhile.
  // `stream`: a customer with nothing read yet gets the figures as the projects come in (`rows`: those in so far);
  // `before`: what it had (projects added by hand), put back if it is left before the read ends.
  const reading = { customer: null, timer: null, auto: false, waiters: [], branches: null, stream: false, rows: [], before: null };
  /** Resolves when the read running now has finished (true when it gave data). */
  const readFinished = () => new Promise((resolve) => reading.waiters.push(resolve));
  const settle = (ok) => {
    reading.branches = null;
    reading.startedAt = null;
    reading.lastPct = 0;
    const streamed = reading.stream;
    reading.stream = false;
    reading.rows = [];
    reading.before = null;
    for (const resolve of reading.waiters.splice(0)) resolve(ok);
    renderPending();
    // What was changed while it streamed waited for the read: saved now.
    if (streamed && c.pending) flush();
  };

  function readProgress(job) {
    const running = job?.state === 'running';
    const bar = $('calc-read-progress');
    bar.hidden = !running;
    $('calc-read').disabled = running || !c.open;
    if (!running) return;
    // Two things side by side: the projects read (their scans and lines of code), and those with their findings in.
    const total = job.total || 0;
    const read = job.read ?? (job.step === 'projects' ? job.done : total);
    const found = job.found ?? (job.step === 'summaries' ? job.done : 0);
    const pct = total ? Math.min(99, Math.round(((read * 0.6 + found * 0.4) / total) * 100)) : 0;
    bar.value = pct;
    // How long is left, from the pace so far (shown once there is a pace to go by).
    const now = Date.now();
    if (!reading.startedAt || pct < (reading.lastPct ?? 0)) reading.startedAt = now;
    reading.lastPct = pct;
    const spent = (now - reading.startedAt) / 1000;
    const left = pct >= 3 && spent > 5 ? (spent * (100 - pct)) / pct : null;
    const eta = left === null ? '' : left < 90 ? 'under 2 minutes left' : `about ${num(Math.round(left / 60))} minutes left`;
    const fill = reading.stream ? ' The figures fill in as the projects come in.' : ' The figures change when the read is done.';
    if (total) setStatus('calc-read-note', `Reading from Checkmarx One: ${pct}% — ${num(read)} of ${num(total)} projects read, ${num(found)} with their findings in${eta ? ` · ${eta}` : ''}.${fill}`, 'reading');
    else setStatus('calc-read-note', `Reading from Checkmarx One: the list of projects…${fill}`, 'reading');
    readFx({ job, pct, eta, read, found, total });
  }

  // ---- The read panel, on the right: each project as it is read, the totals climbing, the severities in so far ----
  const fx = { queue: [], drip: null, seen: 0, hidden: false, open: false, shown: {}, done: null, runner: null, feed: 0 };
  const FX_FEED = 8;
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /** A figure in the panel that climbs to its new value. */
  function countTo(id, value, format = num) {
    const el = $(id);
    const from = fx.shown[id] ?? 0;
    fx.shown[id] = value;
    if (from === value || reduceMotion()) return void (el.textContent = format(value));
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 700);
      el.textContent = format(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1 && fx.shown[id] === value) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.classList.remove('calc-readfx-bump');
    void el.offsetWidth;
    el.classList.add('calc-readfx-bump');
  }
  const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : num(n));
  function fxShow(open) {
    fx.open = open;
    $('calc-readfx').hidden = !open;
    $('calc-readfx-pill').hidden = open || !(reading.timer || fx.done);
    document.body.classList.toggle('calc-readfx-on', open);
    if (open) fxPlace();
  }
  /** Level with the top of the calculator (below the head and the keys), then held near the top of the window as the page scrolls. */
  function fxPlace() {
    const panel = $('calc-readfx');
    if (panel.hidden) return;
    if (window.matchMedia?.('(max-width: 760px)').matches) return void (panel.style.top = panel.style.maxHeight = '');
    const top = Math.max(16, Math.round($('page-calculator').getBoundingClientRect().top));
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `calc(100vh - ${top + 20}px)`;
  }
  window.addEventListener('scroll', () => fx.open && fxPlace(), { passive: true });
  window.addEventListener('resize', () => fx.open && fxPlace());
  function fxStart() {
    clearTimeout(fx.closer);
    Object.assign(fx, { queue: [], seen: 0, shown: {}, done: null, feed: 0 });
    $('calc-readfx').classList.remove('done', 'failed');
    $('calc-readfx-title').textContent = 'Reading the projects';
    $('calc-readfx-feed').replaceChildren();
    $('calc-readfx-sev').replaceChildren();
    for (const id of ['calc-readfx-read', 'calc-readfx-loc', 'calc-readfx-scans', 'calc-readfx-open']) $(id).textContent = '0';
    $('calc-readfx-fill').style.width = '0%';
    // A different fast thing each read, as on CxMissionZero's progress flares.
    const s = nextSpeedster();
    const runner = $('calc-readfx-runner');
    runner.innerHTML = s.svg;
    runner.title = s.name;
    runner.classList.remove('settling');
    runner.style.insetInlineStart = '0%';
    $('calc-readfx-note').textContent = reading.stream ? 'The figures fill in as the projects come in: try the severities, the period or the scope meanwhile.' : 'The figures change when the read is done; until then they are the last read’s.';
    fxShow(!fx.hidden);
  }
  function readFx({ job, pct, eta, read, total }) {
    if (!fx.open && $('calc-readfx-pill').hidden && !fx.hidden) fxStart();
    $('calc-readfx-pill-text').textContent = total ? `Reading Checkmarx One · ${pct}%` : 'Reading Checkmarx One';
    $('calc-readfx-pct').textContent = `${pct}%`;
    $('calc-readfx-eta').textContent = total ? `${num(read)} of ${num(total)} projects${eta ? ` · ${eta}` : ''}` : 'Listing the projects…';
    $('calc-readfx-fill').style.width = `${pct}%`;
    $('calc-readfx-runner').style.insetInlineStart = `calc(${pct}% - ${(pct / 100) * 64}px)`;
    const live = job.live;
    if (!live) return;
    countTo('calc-readfx-read', read);
    countTo('calc-readfx-loc', live.loc ?? 0, short);
    countTo('calc-readfx-scans', live.scans ?? 0);
    const open = live.open ?? {};
    countTo('calc-readfx-open', SEVERITIES.reduce((n, s) => n + (open[s] ?? 0), 0));
    renderFxSeverities(open);
    // Each project read since the last look, dripped in one after another over the next second and a half.
    const fresh = (live.recent ?? []).filter((x) => x.n > fx.seen);
    if (fresh.length) fx.seen = fresh[fresh.length - 1].n;
    fx.queue.push(...fresh.slice(-FX_FEED * 3));
    if (fx.queue.length > FX_FEED * 3) fx.queue.splice(0, fx.queue.length - FX_FEED * 3);
    dripFeed();
  }
  function renderFxSeverities(open) {
    const box = $('calc-readfx-sev');
    const shown = SEVERITIES.filter((s) => s !== 'Info');
    const max = Math.max(1, ...shown.map((s) => open[s] ?? 0));
    if (box.children.length !== shown.length) {
      box.replaceChildren(
        ...shown.map((s) => {
          const row = document.createElement('div');
          row.className = 'calc-readfx-sevrow';
          row.innerHTML = `<span class="calc-readfx-sevname">${esc(s)}</span><span class="calc-readfx-bar"><i></i></span><b translate="no">0</b>`;
          row.querySelector('i').style.background = SEVERITY_COLOURS[s];
          return row;
        }),
      );
    }
    shown.forEach((s, i) => {
      const row = box.children[i];
      row.querySelector('i').style.width = `${Math.round(((open[s] ?? 0) / max) * 100)}%`;
      row.querySelector('b').textContent = num(open[s] ?? 0);
    });
  }
  function dripFeed() {
    if (fx.drip || !fx.queue.length) return;
    const gap = Math.max(60, Math.min(260, 1400 / fx.queue.length));
    const next = () => {
      const item = fx.queue.shift();
      if (!item) return void (fx.drip = null);
      const li = document.createElement('li');
      const facts = [item.loc ? `${short(item.loc)} lines` : 'no code counted', `${num(item.scans ?? 0)} scans in the year`, ...(item.criticality ? [`criticality ${item.criticality}`] : [])];
      li.innerHTML = `<span class="calc-readfx-tick" aria-hidden="true"></span><span class="calc-readfx-what"><b translate="no">${esc(item.name)}</b><small>${esc(facts.join(' · '))}</small></span><span class="calc-readfx-n" translate="no">#${num(item.n)}</span>`;
      const feed = $('calc-readfx-feed');
      feed.prepend(li);
      while (feed.children.length > FX_FEED) feed.lastElementChild.remove();
      fx.drip = setTimeout(next, gap);
    };
    next();
  }
  /** The read ended: the runner glides to a stop and the panel says what was read, then folds away. */
  function fxEnd(ok, text, result = null) {
    if (!fx.open && $('calc-readfx-pill').hidden) return;
    // The totals from the whole read (a quick read can end before any figure came in on the way).
    const rows = Array.isArray(result?.projects) ? result.projects : null;
    if (ok && rows) {
      const open = Object.fromEntries(SEVERITIES.map((s) => [s, rows.reduce((n, r) => n + (r.openBySeverity?.[s] ?? 0), 0)]));
      countTo('calc-readfx-read', rows.length);
      countTo('calc-readfx-loc', rows.reduce((n, r) => n + (r.loc ?? 0), 0), short);
      countTo('calc-readfx-scans', rows.reduce((n, r) => n + (r.scanCount ?? 0), 0));
      countTo('calc-readfx-open', SEVERITIES.reduce((n, s) => n + open[s], 0));
      renderFxSeverities(open);
    }
    fx.done = ok ? 'done' : 'failed';
    clearTimeout(fx.drip);
    fx.drip = null;
    const panel = $('calc-readfx');
    panel.classList.add(ok ? 'done' : 'failed');
    $('calc-readfx-title').textContent = text;
    if (ok) {
      $('calc-readfx-pct').textContent = '100%';
      $('calc-readfx-fill').style.width = '100%';
      $('calc-readfx-runner').style.insetInlineStart = 'calc(100% - 64px)';
      const runner = $('calc-readfx-runner');
      runner.classList.add('settling');
      // It glides to a stop, then the tick pops in (as the progress flares do).
      setTimeout(() => {
        runner.classList.remove('settling');
        runner.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="tick-disc" cx="12" cy="12" r="11" fill="#16a34a" /><path class="tick-mark" pathLength="1" d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>';
      }, reduceMotion() ? 0 : 520);
      $('calc-readfx-eta').textContent = 'Every figure is from the whole read now.';
      $('calc-readfx-pill-text').textContent = 'Read from Checkmarx One · done';
    } else $('calc-readfx-pill-text').textContent = 'Reading Checkmarx One stopped';
    if (ok) fx.closer = setTimeout(() => { fx.done = null; fxShow(false); }, 6000);
  }
  $('calc-readfx-hide').addEventListener('click', () => {
    fx.hidden = true;
    fxShow(false);
  });
  $('calc-readfx-pill').addEventListener('click', () => {
    fx.hidden = false;
    clearTimeout(fx.closer);
    fxShow(true);
  });

  /** What has come in so far, put in the customer open (a customer with nothing read yet only): shown, not saved until the read ends. */
  function applyLive(live) {
    if (!live) return;
    // The rows complete since the last look (from where this page had them; a gap is asked for again next time).
    if (live.rowsFrom === reading.rows.length && live.rows?.length) reading.rows.push(...live.rows);
    if (!reading.stream || !c.open || c.open.id !== reading.customer) return;
    const f = fusion();
    const manual = reading.before?.projects ?? [];
    f.projects = [...reading.rows.map((p) => ({ ...p, locOverride: null, included: true, scansOverride: null, modelOverride: null })), ...manual];
    if (live.offer?.models?.length && !reading.modelsIn) {
      reading.modelsIn = true;
      mergeModels(f, live.offer.models);
      c.remainingCredits = live.offer.remainingCredits ?? null;
    }
    if (FREQUENCIES.every((q) => f.byFrequency[q.id].scans === null)) for (const q of FREQUENCIES) f.byFrequency[q.id].scans = suggestedScans(q.id, f.periodMonths);
    // Nothing counted from git or cloc yet: Fusion · Checkmarx One is the estimate in the credits, from the first projects in.
    if (!reading.basisSet && reading.rows.length && !['cxone', 'both'].includes(basis()) && !(fnew().projects ?? []).length) {
      reading.basisSet = true;
      f.optOut = false;
      fnew().optOut = true;
      if (c.next) Object.assign(c.next, { fusionOn: true, fusionNewOn: false });
      saveFusion();
      saveFnew();
      renderPending();
      placeFusion();
    }
    if (live.tr?.totals && live.tr?.fixed) {
      const first = !tr().totals;
      c.open.tr = { ...tr(), totals: live.tr.totals, fixed: live.tr.fixed };
      if (first) syncDraft();
    }
    // Someone changing a figure meanwhile (a field in use, a slider held) is not redrawn under their hands: the next look shows it.
    const field = document.activeElement;
    if (fx.pointer || (field?.closest?.('#page-calculator') && field.matches('input, select, textarea'))) return void (reading.redraw = true);
    reading.redraw = false;
    renderTr();
    renderFusion();
  }
  $('page-calculator').addEventListener('pointerdown', () => (fx.pointer = true));
  document.addEventListener('pointerup', () => (fx.pointer = false));
  document.addEventListener('pointercancel', () => (fx.pointer = false));

  /** The last read, under the button, when nothing else is said there. */
  function renderReadNote() {
    const note = $('calc-read-note');
    if (!c.open || reading.timer || ['error', 'ok', 'warn'].some((k) => note.classList.contains(k))) return;
    const at = c.open.fusion?.readAt ?? c.open.tr?.totals?.meta?.readAt;
    note.className = 'status hint';
    note.innerHTML = at ? `Last read <time translate="no">${esc(fmtDateTime(at))}</time>` : 'Not read yet';
  }

  /** Follow a read for the customer open: a customer with nothing read yet gets the figures as they come in. */
  function follow() {
    reading.customer = c.open.id;
    reading.stream = !c.open.tr?.totals && !(c.open.fusion?.projects ?? []).some((p) => p.source !== 'manual');
    reading.rows = [];
    reading.modelsIn = false;
    reading.basisSet = false;
    reading.before = reading.stream ? { projects: (c.open.fusion?.projects ?? []).filter((p) => p.source === 'manual'), tr: c.open.tr } : null;
    fxStart();
  }

  /** Start a read (or follow the one running in this tenant), then put what it found in the customer open. */
  async function readCxOne({ auto = false, branches = next().allBranches ? 'all' : 'primary' } = {}) {
    if (!c.open || reading.timer || reading.starting || offline()) return;
    // One read followed at a time: a second start meanwhile (Connect and the page opening at once) is left out.
    reading.starting = true;
    reading.auto = auto;
    reading.branches = branches;
    follow();
    setStatus('calc-read-note', 'Reading the projects…', 'muted');
    try {
      // One branch per project (its primary branch) unless "Every branch" is ticked.
      readProgress(await api('/api/projections/read', { method: 'POST', body: JSON.stringify({ branches, maxProjects: readLimit(scope().maxProjects) }), quiet: true }));
      reading.starting = false;
      poll(400);
    } catch (error) {
      reading.starting = false;
      readProgress(null);
      leaveStream();
      settle(false);
      fxEnd(false, 'Checkmarx One could not be read');
      if (handleAuthLoss(error)) return;
      if (auto && error.status === 409) {
        fx.done = null;
        fxShow(false);
        return setStatus('calc-read-note', 'Not connected to Checkmarx One: connect it under Settings, or use the two exports.', 'muted');
      }
      showError('calc-read-note', error);
    }
  }

  /** A streamed customer left (or the read failed before anything came in): what it had before is put back. */
  function leaveStream() {
    if (!reading.stream || !reading.before) return;
    const customer = c.customers.find((x) => x.id === reading.customer) ?? (c.open?.id === reading.customer ? c.open : null);
    if (!customer) return;
    if (customer.fusion) customer.fusion.projects = reading.before.projects;
    customer.tr = reading.before.tr;
    // What waits to be saved for it keeps its own changes, not the projects shown meanwhile.
    if (c.pending?.id === customer.id && 'tr' in c.pending.patch) c.pending.patch.tr = reading.before.tr;
  }

  function poll(wait = 1500) {
    clearTimeout(reading.timer);
    reading.timer = setTimeout(async () => {
      let job;
      try {
        job = await api(`/api/projections/read?since=${reading.rows.length}`, { quiet: true });
      } catch (error) {
        reading.timer = null;
        readProgress(null);
        settle(false);
        fxEnd(false, 'Checkmarx One could not be read');
        if (!handleAuthLoss(error)) showError('calc-read-note', error);
        return;
      }
      if (job.state === 'running') {
        applyLive(job.live);
        readProgress(job);
        return poll();
      }
      reading.timer = null;
      readProgress(null);
      if (job.state === 'failed') {
        const some = reading.stream && reading.rows.length;
        settle(false);
        fxEnd(false, 'The read stopped');
        return setStatus('calc-read-note', `${job.error || 'Checkmarx One could not be read.'}${some ? ` The figures shown are from the ${num(some)} projects read before it stopped: read again for them all.` : ''}`, 'error');
      }
      const blank = c.open && ((!c.open.tr?.totals && !c.open.fusion?.projects?.length) || (reading.stream && c.open.id === reading.customer));
      // Hosted for many customers, a read says which account it is for: it goes into that account and no other.
      const another = job.account !== undefined && (!c.open || job.account?.id !== c.open.id);
      if (job.state !== 'done' || !c.open || another || (c.open.id !== reading.customer && !blank)) {
        settle(false);
        fxEnd(false, 'Read for another customer');
        return renderReadNote();
      }
      const count = job.result?.projects?.length ?? 0;
      applyRead(job.result);
      settle(true);
      fxEnd(true, count === 1 ? '1 project read' : `${num(count)} projects read`, job.result);
    }, wait);
  }

  /** The tenant's models replace those read before; models typed here stay. A model already here by that name keeps its place (and so the projects set to it) and the credits typed for it. */
  function mergeModels(f, models) {
    const named = (n) => String(n ?? '').trim().toLowerCase();
    const fresh = models.map((t) => {
      const old = f.models.find((m) => m.id === t.id || named(m.name) === named(t.name));
      return old ? { ...t, id: old.id, creditsPer10k: t.creditsPer10k ?? old.creditsPer10k, description: t.description || old.description } : t;
    });
    const taken = new Set(fresh.map((m) => m.id));
    f.models = [...fresh, ...f.models.filter((m) => m.source !== 'tenant' && !taken.has(m.id))].slice(0, 20);
    if (!f.models.some((m) => m.id === f.defaultModel)) f.defaultModel = f.models[0]?.id ?? null;
  }

  function applyRead(body) {
    const f = fusion();
    const before = new Map(f.projects.map((p) => [p.id, p]));
    const keep = (p) => ({ locOverride: before.get(p.id)?.locOverride ?? null, included: before.get(p.id)?.included ?? true, scansOverride: before.get(p.id)?.scansOverride ?? null, modelOverride: before.get(p.id)?.modelOverride ?? null });
    const read = (body.projects ?? []).map((p) => ({ ...p, ...keep(p) }));
    const ids = new Set(read.map((p) => p.id));
    const gone = f.projects.filter((p) => p.source !== 'manual' && !ids.has(p.id)).length;
    const originsBefore = new Set(knownOrigins().map((x) => x.origin));
    f.projects = [...read, ...f.projects.filter((p) => p.source === 'manual')];
    f.readAt = body.readAt;
    // Where the read stopped (Projects to read), so raising it is known to need another read.
    f.readLimit = body.limited?.limit ?? null;
    // A scan origin this read found for the first time starts ticked, here and in what waits for Apply.
    const found = knownOrigins().map((x) => x.origin).filter((o) => !originsBefore.has(o));
    const patch = { fusion: f };
    if (found.length && scope().origins) {
      c.open.scope = cleanScope({ ...scope(), origins: [...scope().origins, ...found] });
      patch.scope = c.open.scope;
    }
    if (found.length && c.next?.scope.origins) c.next = topSettings({ ...c.next, scope: { ...c.next.scope, origins: [...c.next.scope.origins, ...found] } });
    // The tenant's models replace those read before; models typed here stay. A model already here by that name
    // keeps its place (and so the projects set to it) and the credits typed for it.
    if (body.models?.length) mergeModels(f, body.models);
    // No number set for any frequency yet: start from the scans each group runs today.
    if (FREQUENCIES.every((q) => f.byFrequency[q.id].scans === null)) for (const q of FREQUENCIES) f.byFrequency[q.id].scans = suggestedScans(q.id, f.periodMonths);
    c.remainingCredits = body.remainingCredits ?? null;
    if (body.tr?.totals && body.tr?.fixed) {
      $('calc-alt').open = false;
      c.open.tr = { ...tr(), totals: body.tr.totals, fixed: body.tr.fixed };
      patch.tr = c.open.tr;
      syncDraft();
    }
    save(patch);
    renderScope();
    renderTr();
    renderFusion();
    // The read counts SAST and SCA, every scan, for the whole tenant: a scope, other engines, or only some scan origins are added up from it.
    if (narrowed() || trEngines().join() !== DEFAULT_ENGINES.join() || scope().origins || !sharesFull(aheadSettings(tr()).shares) || aheadSettings(tr()).excluded.length) applyScope({ quiet: true });
    if (!body.tr) setStatus('calc-read-note', `Read ${num(read.length)} projects from Checkmarx One; none had a scan to read the findings of.`, 'warn');
    else if (read.length === 1) setStatus('calc-read-note', 'Read 1 project and its scans from Checkmarx One.', 'ok');
    else setStatus('calc-read-note', `Read ${num(read.length)} projects and their scans from Checkmarx One.`, 'ok');
    // More projects than Projects to read: said, with how to read them all.
    if (body.limited) setStatus('calc-read-note', body.limited.total ? `Read the first ${num(body.limited.read)} of ${num(body.limited.total)} projects in Checkmarx One: set Projects to read to ${num(body.limited.total)} or more and read again to count them all.` : `Read the first ${num(body.limited.read)} projects: Checkmarx One has more. Raise Projects to read and read again to count them all.`, 'warn');
    if (!body.models?.length && !f.models.length && !fusionOff()) toast('Checkmarx One did not say which Fusion models it offers: add them under Fusion models, with their credits per 10K LOC.', 'warn', 9000);
    if (gone === 1) toast('1 project read before is no longer in Checkmarx One: it was taken off.', 'warn');
    else if (gone) toast(`${num(gone)} projects read before are no longer in Checkmarx One: they were taken off.`, 'warn');
  }

  // Read from Checkmarx One: what waits is applied first (without asking: reading is what was asked for).
  $('calc-read').addEventListener('click', () => applyAll({ read: true }));

  /** A customer with nothing read yet reads Checkmarx One by itself; a read already running is followed. */
  async function autoRead() {
    if (!c.open || reading.timer || reading.starting || offline()) return;
    const empty = !c.open.tr?.totals && !c.open.fusion?.projects?.length;
    let job = null;
    reading.starting = true;
    try {
      job = await api('/api/projections/read', { quiet: true });
    } catch {}
    reading.starting = false;
    if (!c.open || reading.timer) return;
    // A read for another account (another customer) is not this one's: neither followed here nor put here.
    if (job && job.account !== undefined && job.account?.id !== c.open.id) {
      if (job.state === 'running' && job.account?.name) setStatus('calc-read-note', `Checkmarx One is being read for ${job.account.name}. This account is read with its own key.`, 'muted');
      return;
    }
    if (job?.state === 'running') {
      follow();
      readProgress(job);
      return poll(400);
    }
    if (!empty) return;
    // A read finished in the last few minutes (for another customer, say) serves this one too.
    if (job?.state === 'done' && Date.now() - Date.parse(job.finishedAt) < 15 * 60_000) return applyRead(job.result);
    readCxOne({ auto: true });
  }

  $('calc-csv').addEventListener('click', () => {
    if (!c.open) return;
    const est = estimate();
    const models = new Map(est.settings.models.map((m) => [m.id, m]));
    const cell = (v) => {
      let text = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = [
      ['Project', 'Included', 'Criticality', 'Scanned today', 'Scans in the last year', 'Lines of code', '10K-LOC blocks', 'Fusion scans', 'Scans set by', 'Model', 'Credits per 10K LOC', 'Credits'],
      ...sortedRows(est).map((r) => [r.name, r.included ? 'yes' : 'no', r.criticality ?? '', FREQ_LABEL[r.frequency] ?? '', r.scanCount ?? '', r.lines ?? '', r.units, r.scans, FROM_LABEL[r.scansFrom] ?? '', models.get(r.model)?.name ?? '', r.rate ?? '', r.credits ?? '']),
      [],
      ['Total', est.totals.projects, '', '', '', est.totals.lines, est.totals.units, est.totals.scans, '', '', '', est.totals.credits],
      ['Projection period (months)', est.settings.periodMonths],
    ];
    d.download(new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }), `${String(c.open.name).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'customer'}_fusion_${new Date().toISOString().slice(0, 10)}.csv`);
  });

  return {
    autoRead, leaveStream, readCxOne, readFinished, reading, renderReadNote,
  };
}
