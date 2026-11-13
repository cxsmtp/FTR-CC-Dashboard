import { $, api, applyTheme, avatar, brandHtml, can, esc, go, icon, num, state, themePicker, toast } from './core.js';
import { ADMIN_TABS } from './settings.js';
// ---- Settings: everything that is not Overview, Accounts or the Calculator, in one place ----
export const SETTINGS_PAGES = ['people', 'teams', 'rates', 'audit', 'activity', 'admin'];
export function settingsNav() {
  const system = ADMIN_TABS.some(([, , p]) => p && can(p)) ? ADMIN_TABS.filter(([, , p]) => !p || can(p)).map(([id, label]) => [label, `/admin/${id}`]) : [];
  return [
    ['People', [['People', '/people/people'], ...(can('teams.manage') || can('dashboard.view') ? [['Teams', '/teams']] : []), ...(can('users.manage') || can('roles.manage') ? [['Roles &amp; permissions', '/people/roles']] : []), ...(can('users.manage') ? [['Sign-in', '/people/signin']] : [])]],
    ['Pricing', [['Engines &amp; rates', '/rates']]],
    ['Records', [...(can('audit.view') ? [['Audit log', '/audit']] : []), ['CxOne API audit', '/activity']]],
    ...(system.length ? [['System', system]] : []),
  ];
}

// ---- Shell ----------------------------------------------------------------------------------------------
export function shell(active, content) {
  const me = state.me;
  const link = (path, name, label, show = true) => (show ? `<a href="#${path}" class="${active === name ? 'on' : ''}">${icon(name)}<span>${label}</span></a>` : '');
  const inSettings = SETTINGS_PAGES.includes(active);
  const here = location.hash.slice(1).split('?')[0];
  const setNav = inSettings
    ? `<nav class="set-nav" aria-label="Settings">${settingsNav().map(([group, items]) => `<div class="set-group"><span class="set-label">${group}</span>${items.map(([label, href]) => `<a href="#${href}" class="${here === href || here.startsWith(`${href}/`) ? 'on' : ''}">${label}</a>`).join('')}</div>`).join('')}</nav>`
    : '';
  $('#app').className = 'app';
  $('#app').innerHTML = `
    <aside class="side">
      ${brandHtml()}
      <nav class="nav">
        ${link('/overview', 'overview', 'Overview', can('dashboard.view'))}
        ${link('/accounts', 'accounts', 'Accounts', can('dashboard.view'))}
        ${can('calculator.use') ? `<a href="/calculator">${icon('calc')}<span>Calculator</span></a>` : ''}
        <a href="#/people" class="${inSettings ? 'on' : ''}">${icon('admin')}<span>Settings</span></a>
      </nav>
      <a class="bgwork" id="bgwork" hidden></a>
      <nav class="nav guide-nav">${link('/guide', 'guide', 'Quick guide')}${link('/help', 'help', 'Get help')}</nav>
      <button class="ver" id="ver" title="${can('system.update') ? 'Versions and updates' : 'About, version and what is new'}">${esc(me.versionLabel ?? '')}</button>
      <div class="side-links"><a href="#/about">About</a><span>·</span><a href="#/legal" data-doc="terms">Terms &amp; license</a></div>
      <div class="side-lic">PolyForm Internal Use 1.0.0 · internal use only</div>
    </aside>
    <div class="col">
      ${me.impersonating ? `<div class="imp-bar" role="status"><span class="imp-dot"></span><span>You are signed in as <b>${esc(me.user.name)}</b> (${esc(me.role.name)}${me.team ? ` · ${esc(me.team.name)}` : ''}): you see and work as they do, recorded as ${esc(me.impersonating.by.name || me.impersonating.by.email)} acting as them.</span><button type="button" class="sm" id="imp-stop">Back to my own account</button></div>` : ''}
      <header class="topbar">
        <button class="jump" id="jump" title="Jump to a page, an account or a person">${icon('search')}<span>Jump to…</span><kbd>Ctrl K</kbd></button>
        <span class="tb-grow"></span>
        <span class="tb-lights" id="tb-lights"></span>
        <button class="tb-icon" id="tb-mode" title="Light or dark" aria-label="Light or dark">${icon('theme')}</button>
        <div class="tb-me"><button class="tb-who" id="tb-who" aria-haspopup="true" aria-expanded="false">${avatar(me.user.name, me.picture)}<span><b>${esc(me.user.name)}</b><small>${esc(me.role.name)}${me.team ? ` · ${esc(me.team.name)}` : ''}</small></span></button>
          <div class="menu-list" id="tb-menu" hidden><button type="button" data-go="/profile">${icon('people')}Your profile</button><button type="button" id="theme">${icon('theme')}Theme…</button><button type="button" data-go="/guide">${icon('guide')}Quick guide</button><button type="button" data-go="/about">About</button><button type="button" class="danger" id="signout">${icon('out')}Sign out</button></div></div>
      </header>
      ${inSettings ? `<div class="set-wrap">${setNav}<main class="main fade" id="main" data-page="${esc(active)}">${content}</main></div>` : `<main class="main fade" id="main" data-page="${esc(active)}">${content}</main>`}
    </div>
    <div class="ops-strip" id="ops-strip" aria-hidden="true"><span class="ops-dot"></span><b>DEFCON 5</b><span>All systems nominal</span><span class="ops-sep">│</span><span>${location.protocol === 'https:' ? 'Secure link · TLS' : 'Link open'}</span><span class="ops-sep">│</span><span>Operator: ${esc(me.user.name)} · ${esc(me.role.name)}</span><span class="ops-grow"></span><span id="ops-clock"></span><span class="ops-sep">│</span><span>${esc(me.versionLabel ?? '')}</span></div>`;
  opsClock();
  watchWork();
  wireTopbar();
  if ($('#imp-stop')) $('#imp-stop').onclick = stopImpersonating;
  $('#theme').onclick = () => {
    $('#tb-menu').hidden = true;
    themePicker();
  };
  $('#ver').onclick = () => go(can('system.update') ? '/admin/updates' : '/about');
  $('#signout').onclick = signOut;
}
// ---- The top bar: Jump to (Ctrl K), refresh, the lights, light or dark, and the person ----------------------------------
export let lightsTimer = null;
export async function lights() {
  clearTimeout(lightsTimer);
  const el = document.getElementById('tb-lights');
  if (!el) return;
  try {
    const st = await api('/api/status');
    const light = (on, label, title, href, warn = false) => `<a class="tb-light ${on ? (warn ? 'warn' : 'on') : 'off'}" href="${href}" title="${esc(title)}"><i></i>${esc(label)}</a>`;
    el.innerHTML = [
      st.update ? light(true, `${st.update.version} ready`, 'A newer version is ready: Update now', '#/admin/updates', true) : '',
      st.integrity && ['tampered', 'not-genuine'].includes(st.integrity) ? `<a class="tb-light bad" href="#/admin/updates" title="Software integrity"><i></i>Integrity</a>` : '',
    ].join('');
  } catch {}
  lightsTimer = setTimeout(lights, 30_000);
}
export function wireTopbar() {
  lights();
  $('#tb-mode').onclick = async () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const mode = dark ? 'light' : 'dark';
    applyTheme(mode);
    try {
      const r = await api('/api/me/prefs', { method: 'PUT', body: { mode } });
      state.me.prefs = r.prefs;
    } catch {}
  };
  const menu = $('#tb-menu');
  $('#tb-who').onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    $('#tb-who').setAttribute('aria-expanded', String(!menu.hidden));
  };
  for (const b of menu.querySelectorAll('[data-go]')) b.onclick = () => ((menu.hidden = true), go(b.dataset.go));
  $('#jump').onclick = () => jumpTo();
}
document.addEventListener('click', (e) => {
  const m = document.getElementById('tb-menu');
  if (m && !m.hidden && !e.target.closest('.tb-me')) m.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.me && document.getElementById('jump')) {
    e.preventDefault();
    jumpTo();
  }
});
/** Jump to: pages, accounts and people, as you type; arrows and Enter. */
export async function jumpTo() {
  if (document.getElementById('jumpd')) return;
  const dlg = document.createElement('dialog');
  dlg.id = 'jumpd';
  dlg.className = 'jumpd';
  dlg.innerHTML = `<div class="jd-in">${icon('search')}<input id="jq" placeholder="Jump to a page, an account or a person…" autocomplete="off" /><kbd>Esc</kbd></div><div class="jd-list" id="jl" role="listbox"></div>`;
  document.body.append(dlg);
  dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  const pages = [
    ['Overview', '/overview', 'overview', can('dashboard.view')], ['Accounts', '/accounts', 'accounts', can('dashboard.view')], ['Calculator', '/calculator', 'calc', can('calculator.use')],
    // Every page under Settings answers to "settings" and to its group's name, as well as to its own.
    ...settingsNav().flatMap(([group, items]) => items.map(([label, href]) => [label.replace(/&amp;/g, '&'), href, 'admin', true, `Settings · ${group.charAt(0)}${group.slice(1).toLowerCase()}`])),
    ['Quick guide', '/guide', 'guide', true], ['Get help', '/help', 'help', true], ['About', '/about', 'guide', true], ['Your profile', '/profile', 'people', true],
  ].filter((x) => x[3]).map(([t, href, ic, , where]) => ({ t, sub: where ?? 'Page', href, ic }));
  let items = pages;
  const extra = [];
  // Accounts and the people in view (everyone signed in sees the people of their teams), loaded once; until then it says so.
  let loading = true;
  Promise.all([can('dashboard.view') ? api('/api/accounts').catch(() => ({ accounts: [] })) : { accounts: [] }, api('/api/people').catch(() => ({ people: [] }))]).then(([a, p]) => {
    for (const x of a.accounts ?? []) extra.push({ t: x.name, sub: `Account · ${x.teamPath ?? x.team ?? ''}${x.salesforceId ? ` · ${x.salesforceId}` : ''}`, href: `/accounts/${encodeURIComponent(x.id)}`, ic: 'accounts' });
    for (const x of p.people ?? []) extra.push({ t: x.name, sub: `Person · ${x.email}${x.title ? ` · ${x.title}` : ''}${x.team ? ` · ${x.team}` : ''}`, href: '/people/people', ic: 'people' });
    loading = false;
    if (document.getElementById('jumpd')) draw();
  });
  let sel = 0;
  const draw = () => {
    const q = $('#jq', dlg).value.trim().toLowerCase();
    // Every word typed must appear (in any order): "kotak mf", "settings email", "abdul".
    const words = q.split(/\s+/).filter(Boolean);
    items = [...pages, ...extra].filter((x) => words.every((w) => `${x.t} ${x.sub}`.toLowerCase().includes(w))).slice(0, 40);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    $('#jl', dlg).innerHTML = items.map((x, i) => `<button type="button" role="option" class="${i === sel ? 'on' : ''}" data-i="${i}">${icon(x.ic)}<span><b>${esc(x.t)}</b><small>${esc(x.sub)}</small></span></button>`).join('') || `<p class="muted small">${loading ? 'Looking through the accounts and people…' : 'Nothing matches.'}</p>`;
  };
  const open = (x) => {
    dlg.close();
    if (x.href.startsWith('/calculator')) location.href = x.href;
    else go(x.href);
  };
  $('#jq', dlg).oninput = () => ((sel = 0), draw());
  $('#jq', dlg).onkeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % Math.max(1, items.length);
      draw();
      $('#jl', dlg).querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items[sel]) open(items[sel]);
  };
  $('#jl', dlg).onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (b) open(items[Number(b.dataset.i)]);
  };
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  draw();
  $('#jq', dlg).focus();
}

/** The war room's clock (Command Center theme): UTC, every second. */
export let opsTimer = null;
export function opsClock() {
  clearInterval(opsTimer);
  const tick = () => {
    const el = document.getElementById('ops-clock');
    if (!el) return clearInterval(opsTimer);
    el.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  };
  tick();
  opsTimer = setInterval(tick, 1000);
}
/** Sign in as: back to the Admin's own account, on the People page. */
export async function stopImpersonating() {
  try {
    await api('/api/auth/impersonate/stop', { method: 'POST', body: {} });
  } catch {}
  location.href = '/#/people';
  location.reload();
}
/** One CSV cell, quoted; one that a spreadsheet would read as a formula (= + - @, tab, return) is kept as text. */
export const csvCell = (v) => {
  const t = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};
export async function signOut() {
  try {
    await api('/api/auth/signout', { method: 'POST', body: {} });
  } catch {}
  state.me = null;
  go('/login');
}
export const loading = () => '<div class="loading"><span class="spinner"></span>Loading…</div>';

// ---- Work that runs on the server while people do something else: a Checkmarx One read --------------------------------
export let workTimer = null;
export let workSeen = '';
export async function watchWork() {
  clearTimeout(workTimer);
  if (!can('calculator.use') || !state.me) return;
  let w;
  try {
    w = await api('/api/cc/work');
  } catch {
    // One look that failed (a dropped connection, an update under way): looked at again in a while.
    workTimer = setTimeout(watchWork, 15000);
    return;
  }
  const el = $('#bgwork');
  const r = w.read;
  const name = r?.account?.name ?? 'an account';
  const href = r?.account ? `/calculator?team=${encodeURIComponent(r.account.teamId)}&account=${encodeURIComponent(r.account.id)}` : '/calculator';
  if (el) {
    if (r?.state === 'running') {
      const pct = r.total ? Math.min(100, Math.round((r.done / r.total) * 100)) : 0;
      el.hidden = false;
      el.className = 'bgwork running';
      el.href = href;
      el.innerHTML = `<span class="orbit sm"><i></i><i></i></span><span><b>Reading Checkmarx One</b><small>${esc(name)} · ${r.total ? `${num(r.done)} of ${num(r.total)}` : 'starting'}</small><span class="bar"><i data-w="${pct}"></i></span></span>`;
      requestAnimationFrame(() => el.querySelector('[data-w]') && (el.querySelector('[data-w]').style.width = `${pct}%`));
    } else if (r?.state === 'done' && !r.applied) {
      el.hidden = false;
      el.className = 'bgwork done';
      el.href = href;
      el.innerHTML = `<span class="tick">✓</span><span><b>Data for ${esc(name)} is ready</b><small>${r.projects !== null ? `${num(r.projects)} projects read · ` : ''}open it to generate the report →</small></span>`;
      if (workSeen === 'running') toast(`Checkmarx One for ${name} is read: open it in the calculator to generate the report.`, 'ok');
    } else if (r?.state === 'interrupted') {
      el.hidden = false;
      el.className = 'bgwork failed';
      el.href = href;
      el.innerHTML = `<span class="tick">↻</span><span><b>The read for ${esc(name)} was cut off</b><small>The server restarted meanwhile: open it and read again →</small></span>`;
    } else if (r?.state === 'failed' && !r.applied) {
      el.hidden = false;
      el.className = 'bgwork failed';
      el.href = href;
      el.innerHTML = `<span class="tick">!</span><span><b>The read for ${esc(name)} stopped</b><small>${esc(r.error ?? '')}</small></span>`;
    } else el.hidden = true;
  }
  workSeen = r?.state ?? '';
  workTimer = setTimeout(watchWork, r?.state === 'running' ? 2500 : 30_000);
}
