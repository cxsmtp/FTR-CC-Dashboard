// The Cx Credits Calculator hosted in the command center: CxMissionZero's calculator page (public/calculator/page.js)
// with its requests answered by this server, per team, instead of by the browser (MZ's standalone.js). The account
// bar above it ties each account to its Salesforce opportunity or account (required before a report can be made),
// its accountable SE and its team, and shows its primary report and what was shared with the customer.

import { initCalculator } from './page.js';
import { startHelpTips } from '../help-tips.js';

const THEME_KEY = 'cxcalc-theme';
const ACCENT_KEY = 'cc-accent';
const ACCENTS = [
  ['aurora', 'Aurora', 'Cyan to violet: the command center\u2019s own'],
  ['ocean', 'Ocean', 'Deep blue to teal'],
  ['emerald', 'Emerald', 'Green and teal, calm'],
  ['sunset', 'Sunset', 'Amber to rose'],
  ['royal', 'Royal', 'Indigo to magenta'],
  ['graphite', 'Graphite', 'Quiet greys with one blue'],
  ['command', 'Command Center', 'The war room: phosphor green and amber, radar, DEFCON status'],
];
const ADMIN_PERMS = ['settings.manage', 'security.sso', 'security.https', 'system.update', 'backup.manage'];
const media = matchMedia('(prefers-color-scheme: dark)');
let themeMode = 'light';
/** The same look as the dashboard: light, dark or the system's, in one of six palettes (public/app.js applyTheme). */
function applyTheme(mode = themeMode, accent) {
  themeMode = ['light', 'dark', 'system'].includes(mode) ? mode : 'light';
  const root = document.documentElement;
  root.dataset.theme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
  if (accent && ACCENTS.some(([id]) => id === accent)) root.dataset.accent = accent;
  try {
    localStorage.setItem(THEME_KEY, root.dataset.theme);
    localStorage.setItem(ACCENT_KEY, root.dataset.accent);
  } catch {}
}
media.addEventListener?.('change', () => themeMode === 'system' && applyTheme('system'));

const OPEN_KEY = 'mz-calc-customer';
const TEAM_KEY = 'cc-calc-team';

const fail = (status, message) => Object.assign(new Error(message), { status });

export async function startHosted() {
  // The look the dashboard last had on this device, at once; then this person's own, from the server.
  try {
    applyTheme(localStorage.getItem(THEME_KEY) || 'light', localStorage.getItem(ACCENT_KEY) || 'aurora');
  } catch {
    applyTheme('light', 'aurora');
  }
  // This person's settings (the page itself is the same for everyone, so it is cached).
  let cfg = {};
  try {
    const res = await fetch('/api/cc/calc-config', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      location.href = `/#/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      return;
    }
    cfg = await res.json();
  } catch {}
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
  // The organisation's branding (Settings → Branding): the name, the logo, the accent, the menu, and whether people
  // may choose their own look.
  const brand = cfg.branding ?? {};
  const own = brand.letChoose !== false;
  const look = { mode: (own && cfg.prefs?.mode) || cfg.theme?.mode || 'light', accent: (own && cfg.prefs?.accent) || cfg.theme?.accent || 'aurora' };
  applyTheme(look.mode, look.accent);
  {
    const rootEl = document.documentElement;
    rootEl.dataset.menu = brand.menu === 'top' ? 'top' : 'left';
    rootEl.dataset.ownLook = own ? 'yes' : 'no';
    if (/^#[0-9a-f]{6}$/i.test(brand.accent ?? '')) {
      rootEl.style.setProperty('--cyan', brand.accent);
      rootEl.style.setProperty('--violet', `color-mix(in srgb, ${brand.accent} 70%, #7c3aed)`);
      rootEl.style.setProperty('--grad', `linear-gradient(120deg, ${brand.accent} 0%, color-mix(in srgb, ${brand.accent} 60%, #6366f1) 55%, color-mix(in srgb, ${brand.accent} 40%, #a855f7) 100%)`);
    }
    if (brand.appName) $('cc-app-name').textContent = brand.appName;
    if (brand.tagline !== undefined) $('cc-tagline').textContent = brand.tagline || 'Command Center';
    if (brand.logo) {
      const img = document.createElement('img');
      img.src = brand.logo;
      img.alt = '';
      $('cc-logo').replaceChildren(img);
      $('cc-logo').classList.add('img');
    }
    if (brand.icon) document.getElementById('favicon')?.setAttribute('href', brand.icon);
    document.title = `Calculator · ${brand.appName ?? 'FTR Credits'}`;
  }
  renderMenu();

  // ---- The command center's menu, as on every dashboard page --------------------------------------
  function renderMenu() {
    const ICONS = {
      overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
      accounts: '<path d="M3 7h18M3 12h18M3 17h12"/>',
      calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>',
      people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.5 3.2-5.5 6-5.5s5.2 2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.4.2 4 1.9 4.5 4.5"/>',
      teams: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5 5 16.5M12 11.5l7 5"/>',
      admin: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
      audit: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
      pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
      guide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h0"/>',
    };
    const can = (p) => perms.has(p);
    const link = (href, ic, label, show = true, on = false) => (show ? `<a href="${href}"${on ? ' class="on" aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[ic]}</svg><span>${label}</span></a>` : '');
    const settings = ADMIN_PERMS.some(can);
    const admin = can('users.manage') || can('teams.manage') || settings || can('audit.view');
    $('cc-nav').innerHTML = `<div class="cc-label">Insight</div>
      ${link('/#/overview', 'overview', 'Overview', can('dashboard.view'))}
      ${link('/#/accounts', 'accounts', 'Accounts', can('dashboard.view'))}
      ${link('/#/activity', 'pulse', 'Checkmarx One activity')}
      ${link('/#/people', 'people', can('users.manage') ? 'People &amp; roles' : 'People')}
      <div class="cc-label">Work</div>
      ${link('/calculator', 'calc', 'Calculator', true, true)}
      ${admin ? '<div class="cc-label">Administration</div>' : ''}
      ${link('/#/teams', 'teams', 'Teams', can('teams.manage') || can('dashboard.view'))}
      ${link('/#/admin', 'admin', 'Settings', settings)}
      ${link('/#/audit', 'audit', 'Audit log', can('audit.view'))}`;
    $('cc-guide-nav').innerHTML = link('/#/guide', 'guide', 'Quick guide');
    const name = cfg.user?.name ?? '';
    $('cc-avatar').textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
    $('cc-name').textContent = name;
    $('cc-role').textContent = `${cfg.roleName ?? ''}${cfg.teamName ? ` · ${cfg.teamName}` : ''}`;
    $('cc-ver').textContent = cfg.versionLabel ?? '';
    // The DEFCON strip of the Command Center theme (shown only in it).
    $('cc-ops').innerHTML = `<span class="ops-dot"></span><b>DEFCON 5</b><span>All systems nominal</span><span class="ops-sep">\u2502</span><span>${location.protocol === 'https:' ? 'Secure link \u00b7 TLS' : 'Link open'}</span><span class="ops-sep">\u2502</span><span>Operator: ${esc(name)} \u00b7 ${esc(cfg.roleName ?? '')}</span><span class="ops-grow"></span><span id="cc-ops-clock"></span><span class="ops-sep">\u2502</span><span>${esc(cfg.versionLabel ?? '')}</span>`;
    const clock = () => {
      const el = document.getElementById('cc-ops-clock');
      if (el) el.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
    };
    clock();
    setInterval(clock, 1000);
    if (perms.has('system.update')) Object.assign($('cc-ver'), { href: '/#/admin/updates', title: 'Versions and updates' });
  }

  // A Checkmarx One read on the server, as the dashboard's menu shows it: for another account than the one open.
  async function watchWork() {
    let w;
    try {
      w = await server('/api/cc/work');
    } catch {
      return setTimeout(watchWork, 30_000);
    }
    const el = $('cc-work');
    const r = w.read;
    const name = r?.account?.name ?? 'an account';
    el.href = r?.account ? `/calculator?team=${encodeURIComponent(r.account.teamId)}&account=${encodeURIComponent(r.account.id)}` : '/calculator';
    el.hidden = true;
    if (r?.state === 'running') {
      const pct = r.total ? Math.min(100, Math.round((r.done / r.total) * 100)) : 0;
      el.className = 'cc-work running';
      el.innerHTML = `<span class="hc-orbit"><i></i><i></i><i></i></span><span><b>Reading Checkmarx One</b><small>${esc(name)} · ${r.total ? `${num(r.done)} of ${num(r.total)}` : 'starting'}</small><span class="bar"><i></i></span></span>`;
      el.querySelector('.bar i').style.width = `${pct}%`;
      el.hidden = false;
    } else if (r?.state === 'done' && !r.applied) {
      el.className = 'cc-work done';
      el.innerHTML = `<span class="tick">✓</span><span><b>Data for ${esc(name)} is ready</b><small>Open it to generate the report →</small></span>`;
      el.hidden = false;
    } else if ((r?.state === 'failed' && !r.applied) || r?.state === 'interrupted') {
      el.className = 'cc-work failed';
      el.innerHTML = `<span class="tick">!</span><span><b>The read for ${esc(name)} stopped</b><small>${esc(r.error ?? 'Open it and read again')}</small></span>`;
      el.hidden = false;
    }
    setTimeout(watchWork, r?.state === 'running' ? 2500 : 30_000);
  }

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
      account ? `<span class="hc-st cust"><i></i><b>${esc(account.name)}</b></span>` : '',
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
    foldSummary();
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

  // ---- Theme: the same picker as the dashboard's, saved to this person ---------------------------------
  $('cc-theme').addEventListener('click', () => {
    $('cc-menu').hidden = true;
    const dlg = $('cc-theme-dialog');
    const paint = () => {
      $('cc-modes').innerHTML = ['light', 'dark', 'system'].map((m) => `<button type="button" data-m="${m}" class="${look.mode === m ? 'primary' : ''}">${m[0].toUpperCase()}${m.slice(1)}</button>`).join('');
      $('cc-swatches').innerHTML = ACCENTS.map(([id, name, note]) => `<button type="button" class="cc-swatch${look.accent === id ? ' on' : ''}" data-a="${id}"><span class="cc-sw ${id}"></span><b>${name}</b><small>${note}</small></button>`).join('');
    };
    paint();
    dlg.onclick = async (event) => {
      const b = event.target.closest?.('[data-m],[data-a]');
      if (!b) return;
      if (b.dataset.m) look.mode = b.dataset.m;
      if (b.dataset.a) look.accent = b.dataset.a;
      applyTheme(look.mode, look.accent);
      paint();
      try {
        await server('/api/me/prefs', { method: 'PUT', body: { mode: look.mode, accent: look.accent } });
      } catch {}
    };
    dlg.showModal();
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

  // ---- The customer's name, as in Salesforce: names, opens and starts accounts (MZ's Customer ▾ menu is hidden) -------
  const picker = $('calc-customer');
  const names = () => [...picker.options].map((o) => ({ id: o.value, name: o.textContent.trim() }));
  const openName = () => picker.selectedOptions[0]?.textContent.trim() ?? '';
  const syncName = () => {
    $('hc-names').innerHTML = names().map((x) => `<option value="${esc(x.name)}"></option>`).join('');
    if (document.activeElement !== $('hc-name')) $('hc-name').value = picker.value ? openName() : '';
    $('hc-account').classList.toggle('missing-name', !picker.value);
  };
  new MutationObserver(syncName).observe(picker, { childList: true, subtree: true, characterData: true, attributes: true });
  picker.addEventListener('change', syncName);
  let starting = false;
  let naming = false; // + New: the next name typed starts an account
  /** A new account, named: MZ's own New customer, then its name field. */
  async function startAccount(name) {
    starting = true;
    const before = picker.value;
    $('calc-new').click();
    for (let i = 0; i < 200 && (!picker.value || picker.value === before); i++) await new Promise((r) => setTimeout(r, 50));
    const field = $('calc-name');
    field.value = name;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('change'));
    starting = false;
    syncName();
  }
  $('hc-name').addEventListener('change', async () => {
    const typed = $('hc-name').value.trim();
    if (!typed || starting) return syncName();
    const match = names().find((x) => x.name.toLowerCase() === typed.toLowerCase());
    if (match && match.id !== picker.value) {
      // One of the team's accounts: open it.
      picker.value = match.id;
      picker.dispatchEvent(new Event('change'));
      return;
    }
    if (match) return;
    if (!picker.value || naming) {
      naming = false;
      $('hc-name').placeholder = 'Type the account\u2019s name, or pick one';
      return startAccount(typed).catch((error) => toast(error.message, 'bad'));
    }
    // The open account's name, as Salesforce has it.
    const field = $('calc-name');
    field.value = typed;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('change'));
    toast(`Renamed to ${typed}.`, 'ok', 3000);
  });
  $('hc-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('hc-name').dispatchEvent(new Event('change'));
    }
  });
  $('hc-new').addEventListener('click', () => {
    naming = true;
    const field = $('hc-name');
    field.value = '';
    field.placeholder = 'The new account\u2019s name, as in Salesforce, then Enter';
    field.focus();
  });
  $('hc-name').addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && naming) {
      naming = false;
      $('hc-name').placeholder = 'Type the account\u2019s name, or pick one';
      syncName();
      $('hc-name').blur();
    }
  });
  $('hc-name').addEventListener('blur', () => setTimeout(() => !naming && syncName(), 200));
  // ---- Projection settings: collapsed until opened (the Read button stays in view) ------------------------------
  const heart = document.getElementById('calc-heart');
  const heartHead = heart?.querySelector('.calc-heart-head');
  if (heart && heartHead) {
    const HEART_KEY = 'cc-heart-open';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ghost sm hc-heart-toggle';
    heartHead.append(toggle);
    const set = (open) => {
      heart.classList.toggle('hc-collapsed', !open);
      toggle.textContent = open ? 'Hide settings ▴' : 'Show settings ▾';
      toggle.setAttribute('aria-expanded', String(open));
      try {
        localStorage.setItem(HEART_KEY, open ? '1' : '0');
      } catch {}
    };
    let open = false;
    try {
      open = localStorage.getItem(HEART_KEY) === '1';
    } catch {}
    set(open);
    heartHead.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      set(heart.classList.contains('hc-collapsed'));
    });
  }
  // ---- The top bar: as on the dashboard -----------------------------------------------------------------
  const lights = async () => {
    try {
      const st = await server('/api/status');
      const light = (on, label, title, href, warn = false) => `<a class="cc-light ${on ? (warn ? 'warn' : 'on') : 'off'}" href="${href}" title="${esc(title)}"><i></i>${esc(label)}</a>`;
      $('cc-lights').innerHTML = [
        light(st.cxone.on, 'Checkmarx One', st.cxone.on ? `Connected to ${st.cxone.tenant}` : 'Not connected: paste a key below', '#sa-connect', st.cxone.reading),
        light(st.email.on, 'Email', st.email.on ? 'The email server is set up and tested' : 'No tested email server', perms.has('settings.manage') ? '/#/admin/email' : '/#/about', st.email.configured && !st.email.on),
        light(st.git.on, 'Git', st.git.on ? `${st.git.hosts} git host${st.git.hosts === 1 ? '' : 's'} allowed` : 'No git host allowed', perms.has('settings.manage') ? '/#/admin/general' : '#calc-heart'),
        st.update ? light(true, `${st.update.version} ready`, 'A newer version is ready', '/#/admin/updates', true) : '',
      ].join('');
    } catch {}
    setTimeout(lights, 30_000);
  };
  lights();
  $('cc-refresh').addEventListener('click', () => location.reload());
  $('cc-mode').addEventListener('click', async () => {
    look.mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(look.mode, look.accent);
    try {
      await server('/api/me/prefs', { method: 'PUT', body: { mode: look.mode } });
    } catch {}
  });
  $('cc-who2').addEventListener('click', (e) => {
    e.stopPropagation();
    $('cc-menu').hidden = !$('cc-menu').hidden;
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cc-me2')) $('cc-menu').hidden = true;
  });
  const jump = () => {
    const dlg = $('cc-jump-dialog');
    const can = (p) => perms.has(p);
    const pages = [['Overview', '/#/overview', can('dashboard.view')], ['Accounts', '/#/accounts', can('dashboard.view')], ['Checkmarx One activity', '/#/activity', true], ['People & roles', '/#/people', true], ['Teams', '/#/teams', true], ['Settings', '/#/admin', ADMIN_PERMS.some(can)], ['Updates', '/#/admin/updates', can('system.update')], ['Audit log', '/#/audit', can('audit.view')], ['Quick guide', '/#/guide', true], ['About', '/#/about', true]].filter((x) => x[2]).map(([t, href]) => ({ t, sub: 'Page', href }));
    const accts = names().map((x) => ({ t: x.name, sub: 'Account · open in the calculator', id: x.id }));
    let sel = 0;
    let items = [];
    const draw = () => {
      const q = $('cc-jq').value.trim().toLowerCase();
      items = [...accts, ...pages].filter((x) => !q || `${x.t} ${x.sub}`.toLowerCase().includes(q)).slice(0, 40);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      $('cc-jl').innerHTML = items.map((x, i) => `<button type="button" class="${i === sel ? 'on' : ''}" data-i="${i}"><b>${esc(x.t)}</b><small>${esc(x.sub)}</small></button>`).join('') || '<p class="hc-sub">Nothing matches.</p>';
    };
    const open = (x) => {
      dlg.close();
      if (x.href) location.href = x.href;
      else {
        picker.value = x.id;
        picker.dispatchEvent(new Event('change'));
      }
    };
    $('cc-jq').value = '';
    $('cc-jq').oninput = () => ((sel = 0), draw());
    $('cc-jq').onkeydown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % Math.max(1, items.length);
        draw();
      } else if (e.key === 'Enter' && items[sel]) open(items[sel]);
    };
    $('cc-jl').onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) open(items[Number(b.dataset.i)]);
    };
    dlg.onclick = (e) => e.target === dlg && dlg.close();
    draw();
    dlg.showModal();
    $('cc-jq').focus();
  };
  $('cc-jump').addEventListener('click', jump);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      jump();
    }
  });
  // ---- One compact panel: where the data comes from, folded to a line once connected ------------------------------
  const panes = [...document.querySelectorAll('.hc-pane')];
  const pick = (src) => {
    for (const b of document.querySelectorAll('.hc-seg [data-src]')) {
      b.classList.toggle('on', b.dataset.src === src);
      b.setAttribute('aria-selected', String(b.dataset.src === src));
    }
    for (const p of panes) p.hidden = p.dataset.pane !== src;
  };
  for (const b of document.querySelectorAll('.hc-seg [data-src]')) b.addEventListener('click', () => pick(b.dataset.src));
  // Git and cloc-fusion are the calculator's own Fusion tabs: open the one asked for, and bring it into view.
  for (const b of document.querySelectorAll('[data-open-tab]')) b.addEventListener('click', () => {
    const tab = document.querySelector(`[data-ptabs="calculator"] [data-pt="${b.dataset.openTab}"]`);
    if (!tab) return;
    tab.click();
    fold(true);
    setTimeout(() => {
      tab.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector(`[data-ptpanel="calculator:${b.dataset.openTab}"] input:not([type=hidden]), [data-ptpanel="calculator:${b.dataset.openTab}"] button`)?.focus({ preventScroll: true });
    }, 60);
  });
  function foldSummary() {
    const el = document.getElementById('hc-fold-sum');
    if (!el) return;
    const owner = $('hc-owner').selectedOptions[0]?.textContent ?? '';
    const team = $('hc-team').selectedOptions[0]?.textContent ?? '';
    const sfLabel = account?.salesforceUrl ? `${account.salesforceKind === 'opportunity' ? 'Opportunity' : 'Account'} ${account.salesforceId ?? ''}` : 'No Salesforce link';
    el.innerHTML = `<b>${esc(account?.name ?? 'No account open')}</b>${account ? `<span class="hc-pill ${account.salesforceUrl ? 'ok' : 'bad'}">${esc(sfLabel)}</span><span>${esc(team)}</span><span>${esc(owner)}</span>` : ''}<span class="hc-pill ${cxState.connected ? 'ok' : ''}">${cxState.connected ? `Checkmarx One · ${esc(cxState.tenant)}` : 'Not connected'}</span><button type="button" class="ghost sm" id="hc-unfold">Edit ▾</button>`;
    document.getElementById('hc-unfold').onclick = () => fold(false);
  }
  function fold(on) {
    $('hc-account').classList.toggle('folded', on);
    foldSummary();
  }
  $('hc-fold').addEventListener('click', () => fold(true));
  $('sa-disconnect').addEventListener('click', () => fold(false));
  foldSummary();
  const empty = document.getElementById('calc-empty');
  if (empty) empty.innerHTML = 'No accounts yet in this team. Type the customer’s name, as in Salesforce, at the top: each account keeps its own Checkmarx One data, plan and Fusion projects, saved as you go.';

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
      fold(true);
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
  watchWork();
}
