// The Cx Credits Calculator hosted in the command center: CxMissionZero's calculator page (public/calculator/page.js)
// with its requests answered by this server, per team, instead of by the browser (MZ's standalone.js). The account
// bar above it ties each account to its Salesforce opportunity or account (required before a report can be made),
// its accountable SE and its team, and shows its primary report and what was shared with the customer.

import { initCalculator } from './page.js';
import { startHelpTips } from '../help-tips.js';

const THEME_KEY = 'cxcalc-theme';
const OPEN_KEY = 'mz-calc-customer';
const TEAM_KEY = 'cc-calc-team';

const fail = (status, message) => Object.assign(new Error(message), { status });

export function startHosted() {
  const cfg = window.CX_HOSTED && typeof window.CX_HOSTED === 'object' ? window.CX_HOSTED : {};
  const $ = (id) => document.getElementById(id);
  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const perms = new Set(cfg.permissions ?? []);
  const params = new URLSearchParams(location.search);
  let toastTimer = null;
  const toast = (message, kind = '', ms = 6000) => {
    const el = $('toast');
    el.textContent = message;
    el.className = `toast ${kind}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), ms);
  };
  const setStatus = (id, message, kind = '') => {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.className = `status ${kind}`;
  };
  const showError = (id, error) => setStatus(id, error.message, 'error');
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const num = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString() : '—');

  // ---- The team (region) worked in ----------------------------------------------------------------
  const teams = Array.isArray(cfg.teams) ? cfg.teams : [];
  let team = params.get('team') || (() => {
    try {
      return localStorage.getItem(TEAM_KEY) || '';
    } catch {
      return '';
    }
  })();
  if (!teams.some((t) => t.id === team)) team = teams.some((t) => t.id === cfg.ownTeamId) ? cfg.ownTeamId : teams[0]?.id ?? '';
  $('hc-team').innerHTML = teams.map((t) => `<option value="${esc(t.id)}" title="${esc(t.path)}"${t.id === team ? ' selected' : ''}>${esc(t.path.split(' › ').pop())}</option>`).join('');
  $('hc-team').disabled = teams.length < 2;
  if (params.get('account')) {
    try {
      localStorage.setItem(OPEN_KEY, params.get('account'));
    } catch {}
  }
  $('hc-me').textContent = `${cfg.user?.name ?? ''} · ${cfg.roleName ?? ''}`;

  // ---- Requests to the server ----------------------------------------------------------------------
  async function server(path, { method = 'GET', body, headers = {} } = {}) {
    let response;
    try {
      response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': cfg.csrf ?? '', 'X-Team': team, ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    } catch {
      throw fail(503, 'The command center cannot be reached: check your connection and try again.');
    }
    if (response.status === 401) {
      location.href = `/#/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw fail(401, 'Signed out.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw fail(response.status, data.error || `The server answered ${response.status}.`);
    return data;
  }

  // The calculator's own requests (/api/projections…), with the account opened followed for the account bar.
  let newByClick = false;
  let openCustomer = null;
  let calculator = null;
  const RESERVED = new Set(['reports', 'read', 'series', 'git', 'report-runtime', 'standalone', 'fusion']);
  const api = async (path, options = {}) => {
    const { method = 'GET' } = options;
    const url = new URL(path, location.origin);
    // A customer made on the first visit in MZ's own name is not an account here: only "New" makes one.
    if (method === 'POST' && url.pathname === '/api/projections') {
      if (!newByClick) throw fail(409, 'Click New to add an account.');
      newByClick = false;
    }
    const work = workOf(method, url.pathname);
    if (work) busy.start(work);
    let answer;
    try {
      answer = await server(url.pathname + url.search, { method, body: options.body, headers: method === 'POST' && url.pathname === '/api/projections/read' && account ? { 'X-Account': account.id } : {} });
    } catch (error) {
      if (method === 'POST' && url.pathname === '/api/projections/reports') busy.report(false);
      throw error;
    } finally {
      if (work) busy.end(work);
    }
    if (url.pathname === '/api/projections/read') busy.read(answer);
    if (url.pathname === '/api/projections/git/count') busy.git(answer);
    if (answer?.customer && (method === 'GET' || method === 'POST') && url.pathname.startsWith('/api/projections')) openCustomer = answer.customer;
    if (method === 'PUT' && answer?.customer) openCustomer = { ...openCustomer, ...answer.customer };
    const m = url.pathname.match(/^\/api\/projections\/([^/]+)$/);
    if (m && !RESERVED.has(m[1])) {
      if (method === 'GET') showAccount(decodeURIComponent(m[1]));
      if (method === 'DELETE') showAccount(null);
      if (method === 'PUT') refreshAccountSoon();
    }
    if (method === 'POST' && url.pathname === '/api/projections' && answer.customer) showAccount(answer.customer.id);
    if (url.pathname === '/api/projections/reports' && method === 'POST') {
      refreshAccountSoon();
      busy.report(true, answer?.report?.totalCredits);
    }
    return answer;
  };
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('#calc-new')) newByClick = true;
  }, true);

  // ---- Calculating: what is being worked out, always shown, with its progress ------------------------------------------------
  const WORK = { 'POST /api/projections/read': 'Reading Checkmarx One', 'POST /api/projections/series': 'Calculating the projection', 'POST /api/projections/reports': 'Generating the report', 'POST /api/projections/git/count': 'Counting code from git', 'POST /api/projections/git/repositories': 'Listing repositories', 'POST /api/projections/git/organizations': 'Finding organisations', 'PUT /api/projections': 'Saving' };
  function workOf(method, pathname) {
    if (method === 'PUT' && pathname.startsWith('/api/projections/')) return WORK['PUT /api/projections'];
    return WORK[`${method} ${pathname}`] ?? '';
  }
  const busy = (() => {
    const live = new Map();
    let reading = null;
    let counting = null;
    let shownAt = 0;
    let overlay = null;
    const pill = () => document.getElementById('hc-work');
    const render = () => {
      const el = pill();
      if (!el) return;
      const labels = [...live.keys()];
      const job = reading ?? counting;
      if (!labels.length && !job) {
        el.hidden = true;
        return;
      }
      const label = job ? job.label : labels[labels.length - 1];
      const pct = job?.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : null;
      el.hidden = false;
      el.innerHTML = `<span class="hc-orbit"><i></i><i></i></span><b>${esc(label)}…</b>${job?.detail ? `<span>${esc(job.detail)}</span>` : ''}${pct !== null ? `<span class="hc-bar"><i></i></span><span>${pct}%</span>` : ''}${reading ? '<span class="hc-away">Runs on the server: you can leave this page and come back.</span>' : ''}`;
      if (pct !== null) el.querySelector('.hc-bar i').style.width = `${pct}%`;
    };
    const showOverlay = () => {
      shownAt = Date.now();
      overlay = document.createElement('div');
      // A card in the corner, not a wall: everything stays usable while the report is made.
      overlay.className = 'hc-overlay hc-corner';
      overlay.innerHTML = `<div class="hc-card"><div class="hc-orbit big"><i></i><i></i><i></i></div><h2>Generating the projection report</h2><p class="hc-sub">Keep working: it is saved to the account's reports when ready.</p><ol class="hc-steps"><li class="on">Collecting the figures</li><li>Working out the credits and bundles</li><li>Writing the report</li></ol><p class="hc-note"></p></div>`;
      document.body.append(overlay);
      const steps = overlay.querySelectorAll('.hc-steps li');
      [350, 750].forEach((ms, i) => setTimeout(() => steps[i + 1]?.classList.add('on'), ms));
    };
    const hideOverlay = (ok, text) => {
      if (!overlay) return;
      const o = overlay;
      overlay = null;
      const wait = Math.max(0, 1100 - (Date.now() - shownAt));
      setTimeout(() => {
        o.querySelector('.hc-card').classList.add(ok ? 'done' : 'failed');
        o.querySelector('h2').textContent = ok ? 'Report ready' : 'Not generated';
        o.querySelector('.hc-note').textContent = text ?? '';
        o.querySelectorAll('.hc-steps li').forEach((li) => li.classList.add('on'));
        setTimeout(() => o.remove(), ok ? 1300 : 3500);
      }, wait);
    };
    return {
      start(label) {
        live.set(label, (live.get(label) ?? 0) + 1);
        if (label === WORK['POST /api/projections/reports']) showOverlay();
        render();
      },
      end(label) {
        const n = (live.get(label) ?? 1) - 1;
        if (n > 0) live.set(label, n);
        else live.delete(label);
        render();
      },
      read(job) {
        reading = job?.state === 'running' ? { label: 'Reading Checkmarx One', done: job.done ?? 0, total: job.total ?? 0, detail: job.step === 'projects' ? `${job.done ?? 0} of ${job.total || '…'} projects` : job.step ? `${job.step}: ${job.done ?? 0} of ${job.total || '…'}` : '' } : null;
        render();
      },
      git(job) {
        const running = job && !['done', 'failed', 'stopped'].includes(job.state) && (job.rows ?? job.repositories)?.length;
        const rows = job?.rows ?? [];
        counting = running ? { label: 'Counting code from git', done: rows.filter((r) => r.state === 'done' || r.done).length, total: rows.length || (job.repositories?.length ?? 0) } : null;
        render();
      },
      report(ok, total) {
        hideOverlay(ok, ok && Number.isFinite(total) ? `${Math.round(total).toLocaleString()} credits` : '');
      },
    };
  })();

  /** The totals count up to their new value whenever the calculator changes them (its own writes are not changes). */
  function countUpOnChange(id) {
    const el = document.getElementById(id);
    if (!el) return;
    let last = NaN;
    let mine = '';
    let frame = 0;
    const parse = (t) => Number(String(t).replace(/[^0-9.-]/g, ''));
    new MutationObserver(() => {
      const text = el.textContent;
      if (text === mine) return;
      const to = parse(text);
      if (!/[0-9]/.test(text) || !Number.isFinite(to) || to === last) return;
      const from = Number.isFinite(last) ? last : 0;
      last = to;
      cancelAnimationFrame(frame);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const start = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - start) / 650);
        mine = k < 1 ? text.replace(/[0-9][0-9,.]*/, Math.round(from + (to - from) * (1 - (1 - k) ** 3)).toLocaleString()) : text;
        if (el.textContent !== mine) el.textContent = mine;
        if (k < 1) frame = requestAnimationFrame(step);
        else {
          el.classList.add('hc-pop');
          setTimeout(() => el.classList.remove('hc-pop'), 500);
        }
      };
      frame = requestAnimationFrame(step);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }
  for (const id of ['calc-sum-total', 'calc-sum-tr', 'calc-sum-fusion', 'calc-sum-bundles']) countUpOnChange(id);

  // ---- The account bar ------------------------------------------------------------------------------
  let account = null;
  let refreshTimer = null;
  const refreshAccountSoon = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => account && showAccount(account.id), 400);
  };
  async function showAccount(id) {
    const bar = $('hc-account');
    if (!id) {
      account = null;
      bar.classList.remove('missing-sf');
      $('hc-sf').value = '';
      $('hc-sf').disabled = $('hc-sf-save').disabled = $('hc-owner').disabled = true;
      $('hc-sf-open').hidden = true;
      $('hc-owner').innerHTML = '';
      $('hc-reports').innerHTML = '<span>Open or add an account below.</span>';
      $('hc-impact').checked = false;
      $('hc-impact').disabled = true;
      $('hc-kept').textContent = '';
      $('hc-refresh').hidden = $('hc-forget').hidden = $('hc-upload-l').hidden = true;
      $('hc-currency').hidden = true;
      renderStatus();
      return;
    }
    try {
      const { account: a, members } = await server(`/api/cc/accounts/${encodeURIComponent(id)}`);
      account = a;
      bar.classList.toggle('missing-sf', !a.salesforceUrl);
      if (document.activeElement !== $('hc-sf')) $('hc-sf').value = a.salesforceUrl ?? '';
      $('hc-sf').disabled = $('hc-sf-save').disabled = false;
      $('hc-sf-open').hidden = !a.salesforceUrl;
      if (a.salesforceUrl) $('hc-sf-open').href = a.salesforceUrl;
      $('hc-owner').innerHTML = members.map((u) => `<option value="${esc(u.id)}"${u.id === a.ownerId ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
      $('hc-owner').disabled = false;
      const p = a.primary;
      const parts = [];
      if (!a.salesforceUrl) parts.push('<span class="hc-pill bad">No Salesforce link: reports cannot be generated until it is given</span>');
      else parts.push(`<span class="hc-pill ok">${esc(a.salesforceKind === 'opportunity' ? 'Opportunity' : 'Account')} ${esc(a.salesforceId)}</span>`);
      parts.push(`<span><b>${num(a.reportCount)}</b> report${a.reportCount === 1 ? '' : 's'}, <b>${num(a.sharedCount)}</b> shared with the customer</span>`);
      if (p) parts.push(`<span>${p.how === 'marked' ? 'Primary' : 'Primary (latest, none marked)'}: <b>${num(p.totalCredits)}</b> credits · ${esc(fmtDateTime(p.createdAt))} by ${esc(p.createdBy)}</span>`);
      if (p) parts.push(`<span class="hc-sold">Sold <b>${num(a.sold)}</b> · still needed <b>${num(a.remaining)}</b></span>`);
      parts.push(`<a href="/#/accounts/${encodeURIComponent(a.id)}">Mark primary and shared, record sales →</a>`);
      $('hc-reports').innerHTML = parts.join('');
      $('hc-kept').innerHTML = a.cxone ? `<span class="hc-pill ok">Checkmarx One key kept · ${esc(a.cxone.tenant)}</span> ${a.cxone.lastReadAt ? `last read ${esc(fmtDateTime(a.cxone.lastReadAt))}` : `kept by ${esc(a.cxone.savedBy)} ${esc(fmtDateTime(a.cxone.savedAt))}`}` : '<span>No Checkmarx One key kept for this account</span>';
      $('hc-refresh').hidden = !a.cxone;
      $('hc-forget').hidden = !a.cxone;
      $('hc-upload-l').hidden = false;
      if (autoRefresh && a.cxone) {
        autoRefresh = false;
        refreshFromKept();
      }
      $('hc-impact').disabled = false;
      $('hc-impact').checked = Boolean(a.impactEnabled);
      $('hc-currency').hidden = !a.impactCurrencyConfirmed;
      $('hc-currency').textContent = `Currency: ${a.impactCurrency} · change`;
      if (impactShown !== Boolean(a.impactEnabled)) {
        impactShown = Boolean(a.impactEnabled);
        calculator?.refresh();
      }
      renderStatus();
    } catch (error) {
      if (error.status !== 401) $('hc-reports').textContent = error.message;
    }
  }
  // ---- Impact (beta): per account, off by default, the currency suggested and confirmed by the SE ----------------------
  let impactShown = false;
  async function chooseCurrency() {
    let hint = { currency: account?.impactCurrency || 'USD', why: '' };
    try {
      hint = await server(`/api/cc/accounts/${encodeURIComponent(account.id)}/currency?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || '')}`);
    } catch {}
    const pick = account.impactCurrencyConfirmed ? account.impactCurrency : hint.currency;
    const options = [...document.querySelectorAll('#calc-imp-currency option')].map((o) => o.value);
    if (!options.includes(pick)) options.unshift(pick);
    $('hc-cur-select').innerHTML = options.map((c) => `<option value="${esc(c)}"${c === pick ? ' selected' : ''}>${esc(c)}</option>`).join('');
    $('hc-cur-why').textContent = account.impactCurrencyConfirmed ? `This account's soft savings are in ${account.impactCurrency}. Change it if needed.` : `Suggested: ${hint.currency}, from ${hint.why}. Please confirm or choose another.`;
    $('hc-cur-ok').textContent = account.impactEnabled || account.impactCurrencyConfirmed ? 'Confirm' : 'Confirm and turn Impact on';
    const dlg = $('hc-cur-dialog');
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? $('hc-cur-select').value : null), { once: true });
      dlg.showModal();
    });
  }
  async function setImpact(patch) {
    await server(`/api/cc/accounts/${encodeURIComponent(account.id)}`, { method: 'PUT', body: patch });
    await showAccount(account.id);
    // The calculator reloads the account, so its Impact tab has the currency now kept with it.
    await calculator.load();
  }
  $('hc-impact').addEventListener('change', async (event) => {
    if (!account) return;
    const on = event.target.checked;
    event.target.checked = !on;
    try {
      if (on && !account.impactCurrencyConfirmed) {
        const cur = await chooseCurrency();
        if (!cur) return;
        await setImpact({ impactCurrency: cur, impactEnabled: true });
      } else await setImpact({ impactEnabled: on });
      toast(on ? 'Impact is on for this account: set the minutes and the hourly rate on the Impact tab. Soft savings go into its reports.' : 'Impact is off for this account: its reports carry no savings.', 'ok', 8000);
      if (on) document.querySelector('[data-ptabs="calculator"] [data-pt="impact"]')?.click();
    } catch (error) {
      toast(error.message, 'bad');
    }
  });
  $('hc-currency').addEventListener('click', async () => {
    if (!account) return;
    const cur = await chooseCurrency();
    if (!cur) return;
    try {
      await setImpact({ impactCurrency: cur });
      toast(`Currency set to ${cur}.`, 'ok');
    } catch (error) {
      toast(error.message, 'bad');
    }
  });

  // ---- The status strip: the Checkmarx One connection and what this account's report will hold, always on top -----------
  let cxState = { connected: false, tenant: '' };
  function renderStatus() {
    const chip = (kind, text) => `<span class="hc-st ${kind}"><i></i>${esc(text)}</span>`;
    const cu = openCustomer && account && openCustomer.id === account.id ? openCustomer : null;
    const trSource = cu?.tr?.totals?.meta?.source ?? (cu?.hasTr ? 'data' : undefined);
    const fusionCx = cu?.fusion?.projects?.length ?? cu?.fusionProjects ?? 0;
    const fusionNew = cu?.fusionNew?.projects?.length ?? 0;
    const parts = [
      '<span class="hc-label">Status</span>',
      cxState.connected ? chip('ok', `Checkmarx One: connected · ${cxState.tenant}`) : chip('warn', 'Checkmarx One: not connected'),
    ];
    if (account) {
      parts.push(trSource === 'cxone' ? chip('ok', 'T&R: read from Checkmarx One') : trSource === 'upload' ? chip('ok', 'T&R: from the two exports') : trSource ? chip('ok', 'T&R: worked out') : chip('off', 'T&R: no data yet'));
      parts.push(fusionCx || fusionNew ? chip('ok', `Fusion: ${[fusionCx ? `${fusionCx} Checkmarx One projects` : '', fusionNew ? `${fusionNew} repositories (git / cloc-fusion)` : ''].filter(Boolean).join(' + ')}`) : chip('off', 'Fusion: none yet'));
      parts.push(account.salesforceUrl ? chip('ok', 'Salesforce: linked') : chip('bad', 'Salesforce: link missing'));
      parts.push(account.impactEnabled ? chip('ok', `Impact (beta): on · ${account.impactCurrency}`) : chip('off', 'Impact (beta): off'));
      parts.push(`<span class="hc-ready">${account.salesforceUrl ? (trSource || fusionCx || fusionNew ? 'Ready to generate' : 'Bring in data to generate') : 'Add the Salesforce link to generate'}</span>`);
    } else parts.push(chip('off', 'No account open'));
    $('hc-status').innerHTML = parts.join('');
  }
  // Generating a report: the status above it, in view, so what the report is built from is plain.
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('#calc-generate, #calc-pdf')) return;
    renderStatus();
    const strip = $('hc-status');
    strip.classList.remove('flash');
    void strip.offsetWidth;
    strip.classList.add('flash');
  }, true);

  // ---- Refresh from the kept key, and the customer's own version of a report ------------------------------------------
  let autoRefresh = params.get('refresh') === '1';
  async function refreshFromKept() {
    if (!account?.cxone) return;
    setStatus('sa-connect-status', `Connecting with the key kept for ${account.name}…`, 'muted');
    try {
      const state = await server(`/api/cc/accounts/${encodeURIComponent(account.id)}/cxone/connect`, { method: 'POST', body: {} });
      showState(state);
      toast(`Connected to ${state.tenant}: reading it again for ${account.name}. You can leave this page; it carries on.`, 'ok', 8000);
      // The calculator's own Read: the projection worked out again from what the tenant holds today.
      setTimeout(() => document.getElementById('calc-read')?.click(), 300);
    } catch (error) {
      setStatus('sa-connect-status', error.message, 'error');
      toast(error.message, 'bad', 9000);
    }
  }
  $('hc-refresh').addEventListener('click', refreshFromKept);
  $('hc-forget').addEventListener('click', async () => {
    if (!account || !confirm(`Forget the Checkmarx One key kept for ${account.name}? Refreshing then needs it pasted again.`)) return;
    try {
      await server(`/api/cc/accounts/${encodeURIComponent(account.id)}/cxone`, { method: 'DELETE' });
      showAccount(account.id);
    } catch (error) {
      toast(error.message, 'bad');
    }
  });
  $('hc-upload').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !account) return;
    const html = await file.text();
    let preview;
    try {
      preview = await server(`/api/cc/accounts/${encodeURIComponent(account.id)}/customer-version`, { method: 'POST', body: { html, dryRun: true } });
    } catch (error) {
      return toast(error.message, 'bad', 9000);
    }
    const delta = preview.sentTotal ? preview.total - preview.sentTotal : null;
    $('hc-cv-body').innerHTML = `<p>${preview.sameName ? '' : `<b class="hc-req">Made for "${esc(preview.customer)}", not ${esc(account.name)}.</b> `}Their numbers, worked out again by the calculator:</p>
      <div class="hc-delta"><div><small>As sent</small><b>${num(preview.sentTotal)}</b></div><div><small>Their version</small><b>${num(preview.total)}</b></div>${delta !== null ? `<div><small>Difference</small><b>${delta > 0 ? '+' : ''}${num(delta)}</b></div>` : ''}</div>
      ${preview.changes.length ? `<div class="hc-changes"><b>What they changed</b><ul>${preview.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '<p class="hint">They changed nothing: the figures are as sent.</p>'}`;
    const dlg = $('hc-cv-dialog');
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', async () => {
      if (dlg.returnValue !== 'ok') return;
      try {
        await server(`/api/cc/accounts/${encodeURIComponent(account.id)}/customer-version`, { method: 'POST', body: { html, dryRun: false, confirm: true, makePrimary: $('hc-cv-primary').checked, applyPreferences: $('hc-cv-prefs').checked, note: $('hc-cv-note').value } });
        toast(`The customer's version is recorded${$('hc-cv-primary').checked ? ' as the primary report' : ''}${$('hc-cv-prefs').checked ? ', and their numbers are now this account\u2019s' : ''}.`, 'ok', 9000);
        await calculator.load();
        showAccount(account.id);
      } catch (error) {
        toast(error.message, 'bad', 9000);
      }
    }, { once: true });
  });

  $('hc-sf-save').addEventListener('click', async () => {
    if (!account) return;
    try {
      await server(`/api/cc/accounts/${encodeURIComponent(account.id)}`, { method: 'PUT', body: { salesforceUrl: $('hc-sf').value } });
      toast('Salesforce link saved.', 'ok');
      showAccount(account.id);
    } catch (error) {
      toast(error.message, 'bad', 9000);
    }
  });
  $('hc-sf').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('hc-sf-save').click();
    }
  });
  $('hc-owner').addEventListener('change', async () => {
    if (!account) return;
    try {
      await server(`/api/cc/accounts/${encodeURIComponent(account.id)}`, { method: 'PUT', body: { ownerId: $('hc-owner').value } });
      toast('Accountable SE changed.', 'ok');
    } catch (error) {
      toast(error.message, 'bad');
    }
  });
  $('hc-team').addEventListener('change', () => {
    try {
      localStorage.setItem(TEAM_KEY, $('hc-team').value);
      localStorage.removeItem(OPEN_KEY);
    } catch {}
    location.href = `/calculator?team=${encodeURIComponent($('hc-team').value)}`;
  });
  $('hc-signout').addEventListener('click', async () => {
    try {
      await server('/api/auth/signout', { method: 'POST', body: {} });
    } catch {}
    location.href = '/#/login';
  });

  // ---- Theme ----------------------------------------------------------------------------------------
  const applyTheme = (theme) => {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  };
  try {
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  } catch {
    applyTheme('light');
  }
  $('sa-theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  });

  // ---- The calculator's tabs (in MZ, app.js switches them) -------------------------------------------
  const showTab = (tab) => {
    const group = tab.closest('[data-ptabs]').dataset.ptabs;
    for (const t of document.querySelectorAll(`[data-ptabs="${group}"] [data-pt]`)) {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    for (const panel of document.querySelectorAll(`[data-ptpanel^="${group}:"]`)) panel.hidden = panel.dataset.ptpanel !== `${group}:${tab.dataset.pt}`;
  };
  for (const bar of document.querySelectorAll('[data-ptabs]')) {
    const first = bar.querySelector('[data-pt]');
    if (first) showTab(first);
  }
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-ptabs] [data-pt]');
    if (tab) showTab(tab);
  });
  document.addEventListener('keydown', (event) => {
    const tab = event.target.closest?.('[data-ptabs] [data-pt]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...tab.closest('[data-ptabs]').querySelectorAll('[data-pt]')].filter((t) => !t.hidden);
    const i = tabs.indexOf(tab);
    const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault();
    showTab(next);
    next.focus();
  });

  // ---- The calculator ---------------------------------------------------------------------------------
  let connected = false;
  calculator = initCalculator({
    api,
    $,
    esc,
    toast,
    setStatus,
    showError,
    handleAuthLoss: (error) => error?.status === 401,
    fmtDateTime,
    me: () => ({ organisationName: cfg.organisationName ?? '', user: { name: cfg.user?.name ?? '' } }),
    can: (p) => perms.has(p),
    standalone: true,
    canRead: () => connected,
    canGit: () => true,
    // Impact (beta): on only for an account whose SE turned it on (and confirmed its currency).
    impactOn: () => Boolean(account?.impactEnabled),
    sampleFile: (name) => fetch(`/calc-assets/samples/${encodeURIComponent(name)}`, { credentials: 'same-origin' }),
  });
  showAccount(null);

  // ---- The customer's Checkmarx One: the key goes to the server, which holds it in memory for this session -------
  const shell = document.querySelector('.shell');
  const showState = (state) => {
    connected = Boolean(state?.connected);
    cxState = { connected, tenant: state?.tenant ?? '' };
    renderStatus();
    shell.classList.toggle('can-read', connected);
    $('sa-disconnect').hidden = !connected;
    $('sa-key').placeholder = connected ? 'Connected: paste another key to switch' : 'Paste the API key (not kept: in memory for your session only)';
    setStatus('sa-connect-status', connected ? `Connected to tenant ${state.tenant}` : `Not connected. A prospect not on Checkmarx One: use Fusion · from Git or Fusion · cloc-fusion${cfg.exportsEnabled ? ', or the two exports' : ''}.`, connected ? 'ok' : 'muted');
    calculator.refresh();
  };
  $('sa-connect').addEventListener('submit', async (event) => {
    event.preventDefault();
    const apiKey = $('sa-key').value.trim();
    if (!apiKey) return setStatus('sa-connect-status', 'Paste a Checkmarx One API key first.', 'error');
    setStatus('sa-connect-status', 'Connecting…', 'muted');
    $('sa-connect-go').disabled = true;
    try {
      const remember = $('sa-remember').checked && Boolean(account);
      const state = await server('/api/cc/cxone/connect', { method: 'POST', body: { apiKey, baseUrl: $('sa-base').value, iamUrl: $('sa-iam').value, tenant: $('sa-tenant').value, remember, accountId: account?.id } });
      if (state.saved) {
        toast(`Key kept for ${account.name}: next time, Refresh from Checkmarx One is one click.`, 'ok', 8000);
        showAccount(account.id);
      }
      $('sa-key').value = '';
      showState(state);
      toast(`Connected to ${state.tenant}: Read from Checkmarx One fills the account open.`, 'ok');
      calculator.autoRead();
    } catch (error) {
      setStatus('sa-connect-status', error.message, 'error');
    } finally {
      $('sa-connect-go').disabled = false;
    }
  });
  $('sa-disconnect').addEventListener('click', async () => {
    try {
      showState(await server('/api/cc/cxone/disconnect', { method: 'POST', body: {} }));
    } catch (error) {
      setStatus('sa-connect-status', error.message, 'error');
    }
  });
  server('/api/cc/cxone/status').then(showState, (error) => setStatus('sa-connect-status', error.message, 'error'));

  // The two Checkmarx One exports: behind the Admin's flag (off by default); when on, always collapsed until opened by hand.
  const alt = document.getElementById('calc-alt');
  if (alt) {
    if (!cfg.exportsEnabled) alt.hidden = true;
    else {
      let byHand = 0;
      alt.querySelector('summary')?.addEventListener('click', () => (byHand = Date.now()));
      alt.open = false;
      new MutationObserver(() => {
        if (alt.open && Date.now() - byHand > 600) alt.open = false;
      }).observe(alt, { attributes: true, attributeFilter: ['open'] });
    }
  }
  const impactTab = document.querySelector('[data-ptabs="calculator"] [data-pt="impact"]');
  if (impactTab) impactTab.innerHTML = 'Impact <i class="hc-beta">beta</i>';
  for (const hint of document.querySelectorAll('#page-calculator .hint')) if (hint.textContent.includes('They start from Settings → Impact')) hint.textContent = 'Kept with this account: the minutes to triage and to remediate a finding by hand, and the developers\u2019 hourly rate, in the currency confirmed above.';
  renderStatus();
  startHelpTips();
  calculator.load();
}
