import { workbook } from './xlsx-write.js';

// FTR Credits Command Center: the dashboard. One page, routes in the hash (#/overview, #/accounts/<id>…), every
// figure from the server's /api, everything written into the page escaped.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
const compact = (n) => (!Number.isFinite(Number(n)) ? '—' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : num(Math.round(n)));
const date = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (iso) => {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(iso);
};
const initials = (name) => String(name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const ICONS = {
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  accounts: '<path d="M3 7h18M3 12h18M3 17h12"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.5 3.2-5.5 6-5.5s5.2 2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.4.2 4 1.9 4.5 4.5"/>',
  teams: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5 5 16.5M12 11.5l7 5"/>',
  admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  audit: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  guide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17 9 10l4 3 7-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- State and requests ---------------------------------------------------------------------------------

const state = { me: null, people: null };

async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && state.me?.csrf) headers['X-CSRF-Token'] = state.me.csrf;
  const res = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && !path.startsWith('/api/auth/') && state.me) {
    // The session ended (signed out elsewhere, idle, access removed): back to sign-in.
    state.me = null;
    go('/login');
    throw Object.assign(new Error('Sign in first.'), { status: 401 });
  }
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw Object.assign(new Error(data?.error || `The server answered ${res.status}.`), { status: res.status });
  return data;
}

let toastTimer;
function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5500);
}

const can = (p) => state.me?.permissions?.includes(p);
const go = (path) => {
  if (location.hash !== `#${path}`) location.hash = `#${path}`;
  else route();
};

// ---- Themes: light, dark or the system's, and six palettes; each person's own, else the organisation's ---------------
const THEME_KEY = 'cxcalc-theme';
const ACCENT_KEY = 'cc-accent';
const THEMES = [
  ['aurora', 'Aurora', 'Cyan to violet: the command center\u2019s own'],
  ['ocean', 'Ocean', 'Deep blue to teal'],
  ['emerald', 'Emerald', 'Green and teal, calm'],
  ['sunset', 'Sunset', 'Amber to rose'],
  ['royal', 'Royal', 'Indigo to magenta'],
  ['graphite', 'Graphite', 'Quiet greys with one blue'],
  ['command', 'Command Center', 'The war room: phosphor green and amber, radar, DEFCON status'],
];
const media = matchMedia('(prefers-color-scheme: dark)');
let themeMode = 'light';
function applyTheme(mode = themeMode, accent) {
  themeMode = ['light', 'dark', 'system'].includes(mode) ? mode : 'light';
  document.documentElement.dataset.theme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
  if (accent) document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem(THEME_KEY, document.documentElement.dataset.theme);
    if (accent) localStorage.setItem(ACCENT_KEY, accent);
  } catch {}
}
media.addEventListener?.('change', () => themeMode === 'system' && applyTheme('system'));
try {
  applyTheme(localStorage.getItem(THEME_KEY) || 'light', localStorage.getItem(ACCENT_KEY) || 'aurora');
} catch {
  applyTheme('light', 'aurora');
}
/** The signed-in person's look: theirs (when people may choose), else the organisation's. */
function applyMyTheme() {
  const me = state.me;
  if (!me) return;
  if (me.branding) state.branding = me.branding;
  const own = state.branding?.letChoose !== false;
  applyTheme((own && me.prefs?.mode) || me.theme?.mode || 'light', (own && me.prefs?.accent) || me.theme?.accent || 'aurora');
  applyBranding();
}
// ---- Branding (Settings → Branding): the name, the logo, the browser icon, the accent and where the menu sits --------
state.branding = null;
const brandHtml = () => {
  const b = state.branding ?? {};
  return `<div class="brand"><div class="logo${b.logo ? ' img' : ''}">${b.logo ? `<img src="${esc(b.logo)}" alt="" />` : LOGO}</div><div><b>${esc(b.appName ?? 'FTR Credits')}</b><span>${esc(b.tagline ?? 'Command Center')}</span></div></div>`;
};
function applyBranding(b = state.branding) {
  if (!b) return;
  state.branding = b;
  const root = document.documentElement;
  root.dataset.menu = b.menu === 'top' ? 'top' : 'left';
  root.dataset.ownLook = b.letChoose === false ? 'no' : 'yes';
  // The accent: the look's own, unless the organisation chose a colour.
  for (const v of ['--cyan', '--violet', '--grad']) root.style.removeProperty(v);
  if (/^#[0-9a-f]{6}$/i.test(b.accent ?? '')) {
    root.style.setProperty('--cyan', b.accent);
    root.style.setProperty('--violet', `color-mix(in srgb, ${b.accent} 70%, #7c3aed)`);
    root.style.setProperty('--grad', `linear-gradient(120deg, ${b.accent} 0%, color-mix(in srgb, ${b.accent} 60%, #6366f1) 55%, color-mix(in srgb, ${b.accent} 40%, #a855f7) 100%)`);
  }
  document.title = `${b.appName ?? 'FTR Credits'} · ${b.tagline || 'Command Center'}`;
  const fav = document.getElementById('favicon');
  if (fav && b.icon && fav.getAttribute('href') !== b.icon) fav.setAttribute('href', b.icon);
  for (const el of document.querySelectorAll('.brand')) el.outerHTML = brandHtml();
}
fetch('/api/branding', { credentials: 'same-origin' }).then((r) => r.json()).then((b) => {
  state.branding ??= b;
  applyBranding(state.branding);
}).catch(() => {});
function themePicker() {
  const me = state.me;
  const dlg = document.createElement('dialog');
  const cur = { mode: me.prefs?.mode ?? me.theme?.mode ?? 'light', accent: me.prefs?.accent ?? me.theme?.accent ?? 'aurora' };
  dlg.innerHTML = `<form method="dialog"><div class="dh"><h2>Theme</h2><p class="muted small">Yours, on every device you sign in on.</p></div><div class="db">
    <div class="seg" id="modes">${['light', 'dark', 'system'].map((m) => `<button type="button" data-m="${m}" class="${cur.mode === m ? 'primary' : ''}">${m[0].toUpperCase()}${m.slice(1)}</button>`).join('')}</div>
    <div class="swatches mt">${THEMES.map(([id, name, note]) => `<button type="button" class="swatch${cur.accent === id ? ' on' : ''}" data-a="${id}"><span class="sw sw-${id}"></span><b>${name}</b><small>${note}</small></button>`).join('')}</div></div>
    <div class="df"><button value="ok" class="primary">Done</button></div></form>`;
  document.body.append(dlg);
  const save = async () => {
    applyTheme(cur.mode, cur.accent);
    try {
      const r = await api('/api/me/prefs', { method: 'PUT', body: cur });
      state.me.prefs = r.prefs;
    } catch {}
  };
  for (const b of dlg.querySelectorAll('[data-m]')) b.onclick = () => {
    cur.mode = b.dataset.m;
    dlg.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('primary', x === b));
    save();
  };
  for (const b of dlg.querySelectorAll('[data-a]')) b.onclick = () => {
    cur.accent = b.dataset.a;
    dlg.querySelectorAll('[data-a]').forEach((x) => x.classList.toggle('on', x === b));
    save();
  };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

// ---- Shell ----------------------------------------------------------------------------------------------
function shell(active, content) {
  const me = state.me;
  const link = (path, name, label, show = true) => (show ? `<a href="#${path}" class="${active === name ? 'on' : ''}">${icon(name)}<span>${label}</span></a>` : '');
  const admin = can('users.manage') || can('teams.manage') || ADMIN_TABS.some(([, , p]) => can(p)) || can('audit.view');
  $('#app').className = 'app';
  $('#app').innerHTML = `
    <aside class="side">
      ${brandHtml()}
      <nav class="nav">
        <div class="label">Insight</div>
        ${link('/overview', 'overview', 'Overview', can('dashboard.view'))}
        ${link('/accounts', 'accounts', 'Accounts', can('dashboard.view'))}
        ${link('/activity', 'pulse', 'Checkmarx One activity')}
        ${link('/people', 'people', can('users.manage') ? 'People & roles' : 'People')}
        ${can('calculator.use') ? '<div class="label">Work</div>' : ''}
        ${can('calculator.use') ? `<a href="/calculator">${icon('calc')}<span>Calculator</span></a>` : ''}
        ${admin ? '<div class="label">Administration</div>' : ''}
        ${link('/teams', 'teams', 'Teams', can('teams.manage') || can('dashboard.view'))}
        ${link('/admin', 'admin', 'Settings', ADMIN_TABS.some(([, , p]) => can(p)))}
        ${link('/audit', 'audit', 'Audit log', can('audit.view'))}
      </nav>
      <a class="bgwork" id="bgwork" hidden></a>
      <nav class="nav guide-nav"><a href="#" id="side-refresh" title="Refresh this page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg><span>Refresh</span></a>${link('/guide', 'guide', 'Quick guide')}</nav>
      <button class="ver" id="ver" title="${can('system.update') ? 'Versions and updates' : 'About, version and what is new'}">${esc(me.versionLabel ?? '')}</button>
      <div class="side-links"><a href="#/about">About</a><span>·</span><a href="#/legal" data-doc="terms">Terms &amp; license</a></div>
      <div class="side-lic">PolyForm Internal Use 1.0.0 · internal use only</div>
    </aside>
    <div class="col">
      <header class="topbar">
        <button class="jump" id="jump" title="Jump to a page, an account or a person">${icon('search')}<span>Jump to…</span><kbd>Ctrl K</kbd></button>
        <span class="tb-grow"></span>
        <span class="tb-lights" id="tb-lights"></span>
        <button class="tb-icon" id="tb-mode" title="Light or dark" aria-label="Light or dark">${icon('theme')}</button>
        <div class="tb-me"><button class="tb-who" id="tb-who" aria-haspopup="true" aria-expanded="false"><span class="avatar sm">${esc(initials(me.user.name))}</span><span><b>${esc(me.user.name)}</b><small>${esc(me.role.name)}${me.team ? ` · ${esc(me.team.name)}` : ''}</small></span></button>
          <div class="menu-list" id="tb-menu" hidden><button type="button" id="theme">${icon('theme')}Theme…</button><button type="button" data-go="/guide">${icon('guide')}Quick guide</button><button type="button" data-go="/about">About</button><button type="button" class="danger" id="signout">${icon('out')}Sign out</button></div></div>
      </header>
      <main class="main fade" id="main">${content}</main>
    </div>
    <div class="ops-strip" id="ops-strip" aria-hidden="true"><span class="ops-dot"></span><b>DEFCON 5</b><span>All systems nominal</span><span class="ops-sep">│</span><span>${location.protocol === 'https:' ? 'Secure link · TLS' : 'Link open'}</span><span class="ops-sep">│</span><span>Operator: ${esc(me.user.name)} · ${esc(me.role.name)}</span><span class="ops-grow"></span><span id="ops-clock"></span><span class="ops-sep">│</span><span>${esc(me.versionLabel ?? '')}</span></div>`;
  opsClock();
  watchWork();
  wireTopbar();
  $('#theme').onclick = () => {
    $('#tb-menu').hidden = true;
    themePicker();
  };
  $('#ver').onclick = () => go(can('system.update') ? '/admin/updates' : '/about');
  $('#signout').onclick = signOut;
}
// ---- The top bar: Jump to (Ctrl K), refresh, the lights, light or dark, and the person ----------------------------------
let lightsTimer = null;
async function lights() {
  clearTimeout(lightsTimer);
  const el = document.getElementById('tb-lights');
  if (!el) return;
  try {
    const st = await api('/api/status');
    const light = (on, label, title, href, warn = false) => `<a class="tb-light ${on ? (warn ? 'warn' : 'on') : 'off'}" href="${href}" title="${esc(title)}"><i></i>${esc(label)}</a>`;
    el.innerHTML = [
      can('calculator.use') ? light(st.cxone.on, 'Checkmarx One', st.cxone.on ? `Connected to ${st.cxone.tenant}${st.cxone.reading ? ': reading' : ''}` : 'Not connected: connect in the calculator', '/calculator', st.cxone.reading) : '',
      light(st.email.on, 'Email', st.email.on ? 'The email server is set up and tested' : st.email.configured ? 'Set up but not tested: Settings → Email' : 'No email server: Settings → Email', can('settings.manage') ? '#/admin/email' : '#/about', st.email.configured && !st.email.on),
      can('calculator.use') ? light(st.git.on, 'Git', st.git.on ? `${st.git.hosts} git host${st.git.hosts === 1 ? '' : 's'} allowed for Fusion · from Git` : 'No git host allowed', can('settings.manage') ? '#/admin/general' : '/calculator') : '',
      st.update ? light(true, `${st.update.version} ready`, 'A newer version is ready: Update now', '#/admin/updates', true) : '',
      st.integrity && ['tampered', 'not-genuine'].includes(st.integrity) ? `<a class="tb-light bad" href="#/admin/updates" title="Software integrity"><i></i>Integrity</a>` : '',
    ].join('');
  } catch {}
  lightsTimer = setTimeout(lights, 30_000);
}
function wireTopbar() {
  lights();
  $('#side-refresh').onclick = (e) => {
    e.preventDefault();
    lights();
    route();
  };
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
async function jumpTo() {
  if (document.getElementById('jumpd')) return;
  const dlg = document.createElement('dialog');
  dlg.id = 'jumpd';
  dlg.className = 'jumpd';
  dlg.innerHTML = `<div class="jd-in">${icon('search')}<input id="jq" placeholder="Jump to a page, an account or a person…" autocomplete="off" /><kbd>Esc</kbd></div><div class="jd-list" id="jl" role="listbox"></div>`;
  document.body.append(dlg);
  dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  const pages = [
    ['Overview', '/overview', 'overview', can('dashboard.view')], ['Accounts', '/accounts', 'accounts', can('dashboard.view')], ['Checkmarx One activity', '/activity', 'pulse', true],
    ['People & roles', '/people', 'people', true], ['Calculator', '/calculator', 'calc', can('calculator.use')], ['Teams', '/teams', 'teams', can('teams.manage') || can('dashboard.view')],
    ['Settings', '/admin', 'admin', ADMIN_TABS.some(([, , p]) => can(p))], ['Updates', '/admin/updates', 'admin', can('system.update')], ['Audit log', '/audit', 'audit', can('audit.view')],
    ['Quick guide', '/guide', 'guide', true], ['About', '/about', 'guide', true],
  ].filter((x) => x[3]).map(([t, href, ic]) => ({ t, sub: 'Page', href, ic }));
  let items = pages;
  const extra = [];
  Promise.all([can('dashboard.view') ? api('/api/accounts').catch(() => ({ accounts: [] })) : { accounts: [] }, can('users.manage') ? api('/api/people').catch(() => ({ people: [] })) : { people: [] }]).then(([a, p]) => {
    for (const x of a.accounts ?? []) extra.push({ t: x.name, sub: `Account · ${x.teamPath ?? x.team ?? ''}`, href: `/accounts/${encodeURIComponent(x.id)}`, ic: 'accounts' });
    for (const x of p.people ?? []) extra.push({ t: x.name, sub: `Person · ${x.email}`, href: '/people', ic: 'people' });
    draw();
  });
  let sel = 0;
  const draw = () => {
    const q = $('#jq', dlg).value.trim().toLowerCase();
    items = [...pages, ...extra].filter((x) => !q || `${x.t} ${x.sub}`.toLowerCase().includes(q)).slice(0, 40);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    $('#jl', dlg).innerHTML = items.map((x, i) => `<button type="button" role="option" class="${i === sel ? 'on' : ''}" data-i="${i}">${icon(x.ic)}<span><b>${esc(x.t)}</b><small>${esc(x.sub)}</small></span></button>`).join('') || '<p class="muted small">Nothing matches.</p>';
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
let opsTimer = null;
function opsClock() {
  clearInterval(opsTimer);
  const tick = () => {
    const el = document.getElementById('ops-clock');
    if (!el) return clearInterval(opsTimer);
    el.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  };
  tick();
  opsTimer = setInterval(tick, 1000);
}
async function signOut() {
  try {
    await api('/api/auth/signout', { method: 'POST', body: {} });
  } catch {}
  state.me = null;
  go('/login');
}
const loading = () => '<div class="loading"><span class="spinner"></span>Loading…</div>';

// ---- Work that runs on the server while people do something else: a Checkmarx One read --------------------------------
let workTimer = null;
let workSeen = '';
async function watchWork() {
  clearTimeout(workTimer);
  if (!can('calculator.use') || !state.me) return;
  let w;
  try {
    w = await api('/api/cc/work');
  } catch {
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

// ---- Sign in --------------------------------------------------------------------------------------------
function viewLogin() {
  $('#app').className = 'app bare';
  $('#app').innerHTML = `
  <div class="auth fade">
    <section class="pitch">
      ${brandHtml()}
      <h1 class="serif">Every credit projection.<br/><em>One command center.</em></h1>
      <p>Work out what each account needs for Triage &amp; Remediation and Checkmarx Fusion, keep every report in one place, and give leaders the full picture across every team and region.</p>
      <div class="feats">
        <div class="feat"><b>Cx Credits Calculator</b>Read the customer's Checkmarx One tenant, or count a prospect's code from git or cloc-fusion.</div>
        <div class="feat"><b>Tied to Salesforce</b>Every account carries its opportunity or account link, one click away.</div>
        <div class="feat"><b>Primary &amp; shared</b>One primary report per account, and a record of what went to the customer.</div>
        <div class="feat"><b>Team-based access</b>See your team's accounts; leaders see every team below them.</div>
      </div>
    </section>
    <section class="card">
      <h2>Sign in</h2>
      <p class="lead">With your work email and password.</p>
      <form class="form" id="login" autocomplete="on">
        <label class="f">Work email<input type="email" name="email" autocomplete="username" required autofocus /></label>
        <label class="f">Password<input type="password" name="password" autocomplete="current-password" required /></label>
        <div class="err" id="err"></div>
        <button class="primary" type="submit">Sign in</button>
        <a href="#/forgot" class="small" id="forgot-link">Forgot your password?</a>
      </form>
      <div id="sso-box" hidden><div class="or"><span>or</span></div><a class="btn sso" id="sso-btn" href="/saml/login">${icon('people')}<span id="sso-label">Sign in with SSO</span></a></div>
      <p class="foot">First time? Your Admin sent you a one-time password: sign in with it and you will choose your own, accept the terms of use and see a quick guide.<br/>Internal use only · <a href="#/legal" data-doc="terms">Terms of use &amp; license</a></p>
    </section>
  </div>`;
  fetch('/api/auth/sso').then((r) => r.json()).then((x) => {
    if (!x.enabled) return;
    $('#sso-label').textContent = x.label;
    $('#sso-box').hidden = false;
    if (x.passwordsForAdminsOnly) {
      $('#login').classList.add('admins-only');
      $('#login').insertAdjacentHTML('afterbegin', '<p class="small muted">Passwords are kept for Admins: everyone else signs in with single sign-on.</p>');
    }
  }).catch(() => {});
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#err').textContent = '';
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      await api('/api/auth/signin', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } });
      state.me = await api('/api/me');
      applyMyTheme();
      const next = new URLSearchParams(location.hash.split('?')[1] ?? '').get('next');
      if (next && next.startsWith('/calculator') && firstStepsDone()) location.href = next;
      else go(firstStepsDone() ? home() : '/welcome');
    } catch (error) {
      $('#err').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
// ---- Forgot your password? ------------------------------------------------------------------------------
function authCard(inner) {
  $('#app').className = 'app bare';
  $('#app').innerHTML = `<div class="auth fade"><section class="pitch">${brandHtml()}<h1 class="serif">Back in, <em>safely.</em></h1><p>A link to choose a new password goes to your own work email. It works once, for 30 minutes, and every place you were signed in is signed out when you use it.</p></section><section class="card">${inner}</section></div>`;
}
async function viewForgot(params) {
  const { available } = await api('/api/auth/reset').catch(() => ({ available: false }));
  if (!available) {
    authCard(`<h2>Forgot your password?</h2><p class="lead">Resetting by email is not set up on this server yet.</p><div class="callout">Ask an Admin: they can give you a new one-time password from <b>People → Edit → Reset password</b>.</div><p class="foot"><a href="#/login">Back to sign in</a></p>`);
    return;
  }
  authCard(`<h2>Forgot your password?</h2><p class="lead">Enter the email you sign in with. If it has an account here, a link to choose a new password is sent to it.</p>
    <form class="form" id="fp"><label class="f">Work email<input type="email" name="email" autocomplete="username" required autofocus value="${esc(params.get('email') ?? '')}" /></label><div class="err" id="err"></div><button class="primary" type="submit">Send me a link</button><a href="#/login" class="small">Back to sign in</a></form>`);
  $('#fp').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      const r = await api('/api/auth/forgot', { method: 'POST', body: { email: new FormData(e.target).get('email') } });
      authCard(`<h2>Check your email</h2><div class="callout mt">${esc(r.message)}</div><p class="foot"><a href="#/login">Back to sign in</a></p>`);
    } catch (error) {
      $('#err').textContent = error.message;
      button.disabled = false;
    }
  };
}
async function viewReset(params) {
  const token = params.get('token') ?? '';
  // The link's secret is not left in the address bar or the history.
  history.replaceState(null, '', `${location.pathname}#/reset`);
  if (!token) return go('/forgot');
  let who;
  try {
    who = await api('/api/auth/reset/check', { method: 'POST', body: { token } });
  } catch (error) {
    authCard(`<h2>Choose a new password</h2><div class="callout warn mt">${esc(error.message)}</div><p class="foot"><a href="#/forgot">Ask for a new link</a> · <a href="#/login">Sign in</a></p>`);
    return;
  }
  authCard(`<h2>Choose a new password</h2><p class="lead">For <b>${esc(who.email)}</b>. At least 12 characters.</p>
    <form class="form" id="rp"><label class="f">New password<input type="password" name="next" autocomplete="new-password" minlength="12" required autofocus /></label><label class="f">New password again<input type="password" name="again" autocomplete="new-password" minlength="12" required /></label><div class="err" id="err"></div><button class="primary" type="submit">Save my new password</button></form>`);
  $('#rp').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('next') !== f.get('again')) return ($('#err').textContent = 'The two passwords are not the same.');
    try {
      await api('/api/auth/reset/confirm', { method: 'POST', body: { token, password: f.get('next') } });
      authCard(`<h2>Password changed</h2><div class="callout mt">Your new password is saved and every place you were signed in was signed out. Sign in with it now.</div><p class="foot"><a class="btn primary" href="#/login">Sign in</a></p>`);
    } catch (error) {
      $('#err').textContent = error.message;
    }
  };
}

const firstStepsDone = () => state.me && !state.me.user.mustChangePassword && state.me.terms.accepted && state.me.guideSeen;
const home = () => (can('dashboard.view') ? '/overview' : '/guide');

// ---- First sign-in: password, terms, quick guide ----------------------------------------------------------
async function viewWelcome() {
  const me = state.me;
  const step = me.user.mustChangePassword ? 1 : !me.terms.accepted ? 2 : 3;
  $('#app').className = 'app bare';
  const steps = `<div class="steps">${[1, 2, 3].map((n) => `<span class="${n <= step ? 'on' : ''}"></span>`).join('')}</div>`;
  if (step === 1) {
    $('#app').innerHTML = `<div class="wizard fade">${steps}
      <div class="panel"><h1 class="serif">Welcome, ${esc(me.user.name.split(' ')[0])}</h1>
      <p class="muted">Step 1 of 3 · Choose your own password. At least 12 characters; a few words strung together are easy to remember and hard to guess.</p>
      <form class="form" id="pw" autocomplete="off">
        <label class="f">One-time password from your Admin<input type="password" name="current" autocomplete="current-password" required /></label>
        <div class="row"><label class="f">New password<input type="password" name="next" autocomplete="new-password" minlength="12" required /></label>
        <label class="f">New password again<input type="password" name="again" autocomplete="new-password" minlength="12" required /></label></div>
        <div class="err" id="err"></div>
        <div class="flex"><button class="primary" type="submit">Save and continue</button><span class="spacer"></span><button type="button" class="ghost" id="signout2">Sign out</button></div>
      </form></div></div>`;
    $('#signout2').onclick = signOut;
    $('#pw').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (f.get('next') !== f.get('again')) return ($('#err').textContent = 'The two new passwords are not the same.');
      try {
        await api('/api/me/password', { method: 'POST', body: { current: f.get('current'), next: f.get('next') } });
        state.me = await api('/api/me');
        viewWelcome();
      } catch (error) {
        $('#err').textContent = error.message;
      }
    };
    return;
  }
  if (step === 2) {
    const terms = await api('/api/terms');
    $('#app').innerHTML = `<div class="wizard fade">${steps}
      <div class="panel"><h1 class="serif">Terms of use</h1>
      <p class="muted">Step 2 of 3 · Version ${esc(terms.version)}. Please read and accept them before you use the command center. They are always at the bottom of every page.</p>
      <div class="terms" tabindex="0">${esc(terms.text)}</div>
      <label class="check mt"><input type="checkbox" id="agree" /><span>I have read and accept the terms of use, and understand the command center is licensed under the PolyForm Internal Use License 1.0.0 for internal business use only.</span></label>
      <div class="err" id="err"></div>
      <div class="flex mt"><button class="primary" id="accept" disabled>Accept and continue</button><span class="spacer"></span><button type="button" class="ghost" id="signout2">Sign out</button></div></div></div>`;
    $('#agree').onchange = (e) => ($('#accept').disabled = !e.target.checked);
    $('#signout2').onclick = signOut;
    $('#accept').onclick = async () => {
      try {
        await api('/api/terms/accept', { method: 'POST', body: {} });
        state.me = await api('/api/me');
        viewWelcome();
      } catch (error) {
        $('#err').textContent = error.message;
      }
    };
    return;
  }
  $('#app').innerHTML = `<div class="wizard wide fade">${steps}<div class="panel gx-panel">${guideHtml(personaOf(), { first: true })}<div class="flex mt gx-done"><button class="primary" id="done">Get started →</button><button type="button" class="ghost" data-doc="guide">Full user guide</button><span class="muted small">This guide is always under <b>Quick guide</b>, just above your name in the menu.</span></div></div></div>`;
  $('#done').onclick = async () => {
    await api('/api/me/guide', { method: 'POST', body: {} }).catch(() => {});
    state.me = await api('/api/me');
    go(home());
  };
}

// ---- Quick guides: one per persona, six steps each, animated; people open their own and the ones below them -------
const GUIDE_ART = {
  calc: '<rect x="14" y="8" width="36" height="48" rx="6"/><rect x="20" y="14" width="24" height="10" rx="2"/><path d="M21 32h4M30 32h4M39 32h4M21 40h4M30 40h4M39 40h4M21 48h4M30 48h13"/>',
  link: '<rect x="8" y="12" width="48" height="40" rx="6"/><path d="M8 22h48"/><circle cx="14" cy="17" r="1.5"/><circle cx="19" cy="17" r="1.5"/><path d="M27 38l-3 3a5 5 0 0 1-7-7l3-3M37 32l3-3a5 5 0 0 0-7-7l-3 3M28 36l8-8"/>',
  data: '<ellipse cx="32" cy="14" rx="18" ry="6"/><path d="M14 14v12c0 3.3 8 6 18 6s18-2.7 18-6V14M14 26v12c0 3.3 8 6 18 6s18-2.7 18-6V26"/><path d="M42 50l6 6 10-12"/>',
  report: '<path d="M18 6h20l12 12v38a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M38 6v12h12"/><path d="M24 46V38M31 46V30M38 46V34M45 46V26"/>',
  star: '<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z"/>',
  coins: '<ellipse cx="24" cy="18" rx="14" ry="6"/><path d="M10 18v10c0 3.3 6.3 6 14 6s14-2.7 14-6V18"/><ellipse cx="40" cy="38" rx="14" ry="6"/><path d="M26 38v10c0 3.3 6.3 6 14 6s14-2.7 14-6V38"/>',
  overview: '<rect x="8" y="8" width="20" height="24" rx="3"/><rect x="36" y="8" width="20" height="14" rx="3"/><rect x="36" y="30" width="20" height="26" rx="3"/><rect x="8" y="40" width="20" height="16" rx="3"/>',
  tree: '<circle cx="32" cy="12" r="6"/><circle cx="14" cy="50" r="6"/><circle cx="32" cy="50" r="6"/><circle cx="50" cy="50" r="6"/><path d="M32 18v14M14 44v-6h36v6M32 32v12"/>',
  flag: '<path d="M14 58V8M14 10h32l-6 10 6 10H14"/><circle cx="46" cy="48" r="8"/><path d="M46 44v5M46 52h0"/>',
  people: '<circle cx="24" cy="22" r="8"/><path d="M8 54c2-10 8-15 16-15s14 5 16 15"/><circle cx="44" cy="24" r="6"/><path d="M42 38c7 0 12 5 14 14"/>',
  chart: '<path d="M8 56h48M8 56V8"/><path d="M14 46l12-12 9 7 17-21"/><path d="M44 20h8v8"/>',
  sheet: '<rect x="10" y="8" width="44" height="48" rx="5"/><path d="M10 20h44M10 32h44M10 44h44M26 8v48"/><path d="M38 50l4 4 8-9"/>',
  key: '<circle cx="22" cy="40" r="10"/><path d="M29 33l21-21M44 18l6 6M38 24l5 5"/>',
  shield: '<path d="M32 6l20 8v16c0 13-8.5 22-20 28C20.5 52 12 43 12 30V14z"/><path d="M24 32l6 6 11-12"/>',
  refresh: '<path d="M50 22A20 20 0 0 0 14 24M14 42a20 20 0 0 0 36-2"/><path d="M50 10v12H38M14 54V42h12"/>',
  audit: '<rect x="14" y="10" width="36" height="46" rx="5"/><rect x="24" y="6" width="16" height="8" rx="2"/><path d="M22 26h20M22 34h20M22 42h12"/><circle cx="46" cy="48" r="7"/><path d="M51 53l5 5"/>',
};
const GUIDES = {
  se: {
    name: 'Sales Engineer',
    tagline: 'From a customer’s name to a projection they can trust, in six steps.',
    steps: [
      ['calc', 'Open the Calculator', 'Pick your team (region) at the top. Every account of your team is shared with your teammates: anyone in it can open it and generate projections.', '/calculator', 'Open the calculator'],
      ['link', 'Name it as in Salesforce', 'Type the customer’s name as Salesforce has it, then paste the opportunity or account link and Save. It is required: no report without it.', '/calculator', 'Start an account'],
      ['data', 'Bring in the data', 'A Checkmarx One customer: paste their API key and Connect; tick Remember to refresh in one click later. A prospect: Fusion from Git, or cloc-fusion. You can leave while it reads.', '/calculator', 'Connect'],
      ['report', 'Generate the report', 'Check the credits, then Generate projection report: the HTML for the customer and the PDF summary to present. Make as many as you need.', '/calculator', 'Generate'],
      ['star', 'Mark primary and shared', 'On the account page, star the report that stands for the account (else the latest counts) and mark the ones you sent to the customer.', '/accounts', 'Your accounts'],
      ['coins', 'Record credits sold', 'Each sale against the account, one or many. The dashboards then show sold so far and what is still needed.', '/accounts', 'Record a sale'],
    ],
  },
  leader: {
    name: 'Leader',
    tagline: 'Your teams at a glance, and where to step in.',
    steps: [
      ['overview', 'See your whole picture', 'Overview rolls up every team below you: the credits projected from each primary report, credits sold and still needed.', '/overview', 'Overview'],
      ['tree', 'Dive into teams and people', 'Click a team in the tree, or an SE, to see their accounts and reports. All my teams ▾ narrows everything to one team.', '/overview', 'Your teams'],
      ['flag', 'Spot what needs attention', 'Accounts filters: missing Salesforce link, no report yet, not shared with the customer, no primary marked.', '/accounts', 'Accounts'],
      ['coins', 'Projection against sales', 'Each account shows what was projected, sold and still needed. Export the accounts or reports as CSV for a forecast call.', '/accounts', 'Credits sold'],
      ['people', 'Look after your people', 'Add people or import a whole region from a sheet, reset a password, unlock, or sign someone out everywhere.', '/people', 'People'],
      ['calc', 'Work alongside your SEs', 'You can open any account of your teams in the calculator, refresh it from Checkmarx One, and generate a projection yourself.', '/calculator', 'Calculator'],
    ],
  },
  admin: {
    name: 'Admin',
    tagline: 'Set the command center up once; it looks after itself.',
    steps: [
      ['tree', 'Build the team tree', 'Teams: from the top down (Global › EMEA › …), with each team’s region and leaders. Leaders see every team below theirs.', '/teams', 'Teams'],
      ['sheet', 'Bring everyone in', 'People → Import: one sheet with names, emails, roles and teams. You get an Excel sheet of temporary passwords. Or turn on single sign-on.', '/people', 'Import people'],
      ['key', 'Roles and their names', 'Roles & permissions: rename any role, tick what each may do, or make new ones. The Admin-only settings stay with Admins.', '/people/roles', 'Roles'],
      ['shield', 'Email, sign-on and HTTPS', 'Settings: the email server for password resets, SAML single sign-on, and HTTPS with your certificate or Let’s Encrypt.', '/admin', 'Settings'],
      ['refresh', 'Updates and backups', 'New versions are found every 15 minutes, checked against their checksums and switched to without a restart. Backups run nightly and before every switch.', '/admin/updates', 'Updates'],
      ['audit', 'Every action, on record', 'The audit log keeps every action and everything refused, chained so a changed entry is found. Filter it, check it, export it.', '/audit', 'Audit log'],
    ],
  },
};
const GUIDE_ORDER = ['se', 'leader', 'admin'];
/** Whose guide this is: Admins, then those who lead or oversee (and sales, who do not use the calculator), then SEs. */
function personaOf(me = state.me) {
  if (me.role?.id === 'admin' || can('settings.manage')) return 'admin';
  if ((me.leads?.length ?? 0) > 0 || can('scope.all') || can('users.manage') || !can('calculator.use')) return 'leader';
  return 'se';
}
/** Theirs and every guide below it. */
const guidesFor = (persona) => GUIDE_ORDER.slice(0, GUIDE_ORDER.indexOf(persona) + 1).reverse();
function guideHtml(persona, { first = false, tabs = [] } = {}) {
  const g = GUIDES[persona];
  const art = (k) => `<svg viewBox="0 0 64 64" aria-hidden="true">${GUIDE_ART[k] ?? ''}</svg>`;
  return `<div class="gx" data-persona="${persona}">
    <div class="gx-hero">
      <div class="gx-orbit" aria-hidden="true"><i></i><i></i><i></i><span>${art(g.steps[0][0])}</span></div>
      <div class="gx-intro"><span class="chip star">${first ? 'Welcome · step 3 of 3' : 'Quick guide'}</span><h1 class="serif">${first ? `Welcome, ${esc(state.me.user.name.split(' ')[0])}` : `The ${esc(g.name)} guide`}</h1>
      <p>${esc(g.tagline)}</p><p class="muted small">${esc(state.me.role.name)} · ${esc(state.me.team?.path ?? 'no team yet')}</p></div>
    </div>
    ${tabs.length > 1 ? `<div class="gx-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" data-guide="${t}" aria-selected="${t === persona}" class="${t === persona ? 'on' : ''}">${esc(GUIDES[t].name)}${t === personaOf() ? ' <small>yours</small>' : ''}</button>`).join('')}</div>` : ''}
    <ol class="gx-steps">${g.steps.map(([k, t, p, href, cta], i) => `<li class="gx-step" style="--i:${i}"><div class="gx-art">${art(k)}<b class="gx-n">${i + 1}</b></div><h3>${esc(t)}</h3><p>${esc(p)}</p>${first ? '' : `<a class="gx-go" href="${href.startsWith('/calculator') ? href : `#${href}`}">${esc(cta)} →</a>`}</li>`).join('')}</ol>
    <div class="callout mt">Figures are supporting information worked out from the customer’s data at a moment in time; Checkmarx’s own records are authoritative. Paste a customer’s key only into the Calculator, and use read-only git tokens.</div>
  </div>`;
}
function viewGuide(params) {
  const mine = personaOf();
  const tabs = guidesFor(mine);
  const want = params?.get?.('for');
  const persona = tabs.includes(want) ? want : mine;
  shell('guide', `<div class="head"><div></div><div class="tools"><button type="button" data-doc="guide">Full user guide</button><button type="button" class="ghost" data-doc="terms">Terms &amp; license</button></div></div><div class="panel gx-panel">${guideHtml(persona, { tabs })}</div>`);
  for (const b of $$('[data-guide]')) b.onclick = () => go(`/guide?for=${b.dataset.guide}`);
}

// ---- Overview ---------------------------------------------------------------------------------------------
function teamSelect(id, selected, { all = true } = {}) {
  const teams = [...(state.me.scopeTeams ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  return `<select id="${id}">${all ? '<option value="">All my teams</option>' : ''}${teams.map((t) => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select>`;
}

async function viewOverview(params) {
  const focus = params.get('team') ?? '';
  shell('overview', loading());
  const d = await api(`/api/dashboard${focus ? `?team=${encodeURIComponent(focus)}` : ''}`);
  const t = d.totals;
  const scopeName = focus ? state.me.scopeTeams.find((x) => x.id === focus)?.path : can('scope.all') ? 'Every team' : 'Your teams';
  const maxTeam = Math.max(1, ...d.teams.map((x) => x.credits));
  const sePeople = d.people.filter((x) => x.accounts > 0 || x.reports > 0).sort((a, b) => b.credits - a.credits);
  const maxPerson = Math.max(1, ...sePeople.map((x) => x.credits));
  const roots = d.teams.filter((x) => !x.parentId);
  const kids = (id) => d.teams.filter((x) => x.parentId === id);
  const treeRows = [];
  const walk = (node, depth) => {
    treeRows.push({ node, depth });
    for (const k of kids(node.id).sort((a, b) => b.credits - a.credits)) walk(k, depth + 1);
  };
  for (const r of roots.sort((a, b) => b.credits - a.credits)) walk(r, 0);
  $('#main').innerHTML = `
    <div class="head"><div><div class="crumbs">${esc(scopeName)}</div><h1 class="serif">Overview</h1><p>The credits projected for every account from its primary report, how many reports were made and shared with customers, and where something is missing.</p></div>
      <div class="tools">${teamSelect('focus', focus)}${can('dashboard.export') ? `<a class="btn" href="/api/export/accounts.csv" download>${icon('download')}Accounts CSV</a><a class="btn ghost" href="/api/export/reports.csv" download>${icon('download')}Reports CSV</a>` : ''}${can('calculator.use') ? `<a class="btn primary" href="/calculator">${icon('calc')}Open calculator</a>` : ''}</div></div>
    <div class="kpis">
      <div class="kpi hero"><div class="k">Projected credits · primary reports</div><div class="v">${num(Math.round(t.credits))}</div><div class="s">T&amp;R ${num(Math.round(t.trCredits))} · Fusion ${num(Math.round(t.fusionCredits))} · across ${num(t.withReport)} account${t.withReport === 1 ? '' : 's'}</div></div>
      <div class="kpi sold"><div class="k">Credits sold</div><div class="v">${num(Math.round(t.sold))}</div><div class="s">${pct(t.sold, t.credits)}% of the projection · ${num(t.accountsWithSales)} account${t.accountsWithSales === 1 ? '' : 's'}</div><div class="meter"><i data-w="${pct(t.sold, t.credits)}"></i></div></div>
      <div class="kpi need"><div class="k">Still needed</div><div class="v">${num(Math.round(t.remaining))}</div><div class="s">projected and not sold yet</div></div>
      <div class="kpi"><div class="k">Accounts</div><div class="v">${num(t.accounts)}</div><div class="s">${num(t.withReport)} with a report</div><div class="meter"><i data-w="${pct(t.withReport, t.accounts)}"></i></div></div>
      <div class="kpi"><div class="k">Reports generated</div><div class="v">${num(t.reports)}</div><div class="s">${num(t.primaryMarked)} account${t.primaryMarked === 1 ? '' : 's'} with a primary marked</div></div>
      <div class="kpi"><div class="k">Shared with customers</div><div class="v">${num(t.sharedReports)}</div><div class="s">${num(t.accountsShared)} of ${num(t.accounts)} accounts</div><div class="meter"><i data-w="${pct(t.accountsShared, t.accounts)}"></i></div></div>
      <div class="kpi ${t.missingSalesforce ? 'warn' : ''}"><div class="k">Missing Salesforce link</div><div class="v">${num(t.missingSalesforce)}</div><div class="s">${t.missingSalesforce ? 'No report can be made for them yet' : 'Every account is tied to Salesforce'}</div></div>
    </div>
    <div class="grid g3">
      <div class="panel"><h2>Teams <small>credits from primary reports, teams below rolled up</small></h2>
        ${treeRows.length ? `<div class="tree ov">${treeRows.map(({ node, depth }) => `<div class="node" data-team="${esc(node.id)}"><div class="t"><span class="indent" data-indent="${depth}"></span>${depth ? '<span class="twig"></span>' : ''}<div><b>${esc(node.name)}</b><small>${node.leaders.length ? ` · led by ${esc(node.leaders.join(', '))}` : ''}</small><div class="meta">${num(node.people)} people · ${num(node.accounts)} accounts · ${num(node.shared)} shared · <span class="sold-t">${num(Math.round(node.sold))} sold</span> · ${num(Math.round(node.remaining))} to go</div><div class="bar"><div class="track"><i data-w="${pct(node.credits, maxTeam)}"></i></div></div></div></div><span class="credits">${num(Math.round(node.credits))}</span></div>`).join('')}</div>` : '<div class="empty"><b>No teams yet</b>An Admin sets them up under Teams.</div>'}
      </div>
      <div class="panel chart"><h2>Activity <small>last 12 months</small></h2>${monthsChart(d.months)}<div class="legend"><span><i class="lg-a"></i>Reports generated</span><span><i class="lg-b"></i>Shared with customer</span></div></div>
    </div>
    <div class="grid g2 mt">
      <div class="panel"><h2>Sales Engineers <small>accounts they are accountable for</small></h2>
        ${sePeople.length ? `<div class="bars">${sePeople.slice(0, 12).map((p) => `<div class="bar click" data-person="${esc(p.id)}"><div class="name"><div class="flex"><span class="avatar sm">${esc(initials(p.name))}</span><div>${esc(p.name)}<small>${esc(p.team)} · ${num(p.accounts)} accounts · ${num(p.reports)} reports · ${num(p.shared)} shared · <span class="sold-t">${num(Math.round(p.sold))} sold</span>${p.missingSalesforce ? ` · <span class="warn-t">${num(p.missingSalesforce)} no SF</span>` : ''}</small></div></div></div><div class="track"><i data-w="${pct(p.credits, maxPerson)}"></i></div><div class="val">${num(Math.round(p.credits))}</div></div>`).join('')}</div>${sePeople.length > 12 ? `<a class="more" href="#/accounts">${num(sePeople.length - 12)} more: see every account →</a>` : ''}` : '<div class="empty"><b>No accounts yet</b>They appear once Sales Engineers add accounts in the calculator.</div>'}
      </div>
      <div class="panel"><h2>Largest projections <small>primary report per account</small></h2>
        ${d.top.length ? `<div class="tw"><table><thead><tr><th>Account</th><th>SE</th><th class="num">Credits</th><th class="num">Sold</th><th></th></tr></thead><tbody>${d.top.map((a) => `<tr class="click" data-account="${esc(a.id)}"><td><b>${esc(a.name)}</b><span class="sub">${esc(a.team)}</span></td><td>${esc(a.owner)}</td><td class="num"><span class="credits big">${num(Math.round(a.primary.totalCredits))}</span></td><td class="num">${soldCell(a)}</td><td>${sfChip(a)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No reports yet</b>Generate the first one in the calculator.</div>'}
      </div>
    </div>
    <div class="panel mt"><h2>Latest reports <small>${num(d.recent.length)} most recent</small></h2>
      ${d.recent.length ? `<div class="tw"><table><thead><tr><th>Account</th><th>Team</th><th>Made by</th><th>When</th><th class="num">Credits</th><th>Customer</th></tr></thead><tbody>${d.recent.map((x) => `<tr class="click" data-account="${esc(x.customerId)}"><td><b>${esc(x.customer)}</b></td><td>${esc(x.team)}</td><td>${esc(x.createdBy)}</td><td>${esc(ago(x.createdAt))}</td><td class="num credits">${num(Math.round(x.totalCredits))}</td><td>${x.sharedAt ? `<span class="chip ok"><i></i>Shared ${esc(date(x.sharedAt))}</span>` : '<span class="chip"><i></i>Not shared</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Nothing yet</b></div>'}
    </div>`;
  paint();
  $('#focus').onchange = (e) => go(`/overview${e.target.value ? `?team=${encodeURIComponent(e.target.value)}` : ''}`);
  for (const el of $$('[data-team]')) el.onclick = () => go(`/accounts?team=${encodeURIComponent(el.dataset.team)}`);
  for (const el of $$('[data-person]')) el.onclick = () => go(`/accounts?owner=${encodeURIComponent(el.dataset.person)}`);
  for (const el of $$('[data-account]')) el.onclick = () => go(`/accounts/${encodeURIComponent(el.dataset.account)}`);
}

/** Widths and indents set through the CSSOM (no style attributes: the page's policy allows none). */
function paint() {
  // The figures count up from zero as the page appears (not for people who asked for less motion).
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const el of $$('.kpi .v')) {
      const to = Number(el.textContent.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(to) && to > 0) countUp(el, to);
    }
  }
  requestAnimationFrame(() => {
    for (const el of $$('[data-w]')) el.style.width = `${Math.max(Number(el.dataset.w) || 0, 0.5)}%`;
    for (const el of $$('[data-indent]')) el.style.width = `${Number(el.dataset.indent) * 18}px`;
  });
}

function monthsChart(months) {
  const W = 560;
  const H = 220;
  const pad = { l: 30, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...months.map((m) => Math.max(m.reports, m.shared)));
  const bw = (W - pad.l - pad.r) / months.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.ceil(max / 2), max];
  const label = (k) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reports generated and shared each month">
    <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#6366f1"/></linearGradient><linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
    ${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="${pad.l - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="currentColor" fill-opacity=".5">${v}</text>`).join('')}
    ${months.map((m, i) => {
      const x = pad.l + i * bw + bw * 0.16;
      const w = bw * 0.32;
      return `<rect x="${x}" y="${y(m.reports)}" width="${w}" height="${H - pad.b - y(m.reports)}" rx="3" fill="url(#gA)"><title>${m.month}: ${m.reports} generated</title></rect><rect x="${x + w + 2}" y="${y(m.shared)}" width="${w}" height="${H - pad.b - y(m.shared)}" rx="3" fill="url(#gB)"><title>${m.month}: ${m.shared} shared</title></rect><text x="${pad.l + i * bw + bw / 2}" y="${H - 8}" font-size="10" text-anchor="middle" fill="currentColor" fill-opacity=".55">${label(m.month)}</text>`;
    }).join('')}
  </svg>`;
}

const sfChip = (a) => (a.salesforceUrl ? `<a class="chip sf" href="${esc(a.salesforceUrl)}" target="_blank" rel="noopener noreferrer" title="Open in Salesforce (new tab)">${icon('ext')}${a.salesforceKind === 'opportunity' ? 'Opportunity' : 'Account'}</a>` : '<span class="chip bad"><i></i>No SF link</span>');

/** Credits sold for an account, and how far that goes against its projection. */
const soldCell = (a) => {
  const total = Number(a.primary?.totalCredits) || 0;
  if (!a.sold) return '<span class="muted">—</span>';
  const p = total ? Math.min(100, Math.round((a.sold / total) * 100)) : 100;
  return `<span class="credits">${num(Math.round(a.sold))}</span><span class="sub">${total ? `${p}%` : ''}${a.salesCount > 1 ? ` · ${num(a.salesCount)} sales` : ''}</span>`;
};

// ---- Accounts --------------------------------------------------------------------------------------------
async function viewAccounts(params) {
  const focus = params.get('team') ?? '';
  shell('accounts', loading());
  const [{ accounts }, people] = await Promise.all([api(`/api/accounts${focus ? `?team=${encodeURIComponent(focus)}` : ''}`), peopleList()]);
  const owners = [...new Map(accounts.map((a) => [a.ownerId, a.owner])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  void people;
  let sort = { key: 'credits', dir: -1 };
  $('#main').innerHTML = `
    <div class="head"><div><h1 class="serif">Accounts</h1><p>Every account in your teams with its primary report. Click an account to see all its reports, mark the primary one and record what was shared with the customer.</p></div>
      <div class="tools">${can('calculator.use') ? `<a class="btn primary" href="/calculator">${icon('plus')}New in calculator</a>` : ''}</div></div>
    <div class="panel">
      <div class="flex">
        <div class="search">${icon('search')}<input id="q" placeholder="Search accounts, SEs, Salesforce ids" /></div>
        <div>${teamSelect('team', focus)}</div>
        <div><select id="owner"><option value="">Every SE</option>${owners.map(([id, name]) => `<option value="${esc(id)}"${id === params.get('owner') ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
        <div><select id="status"><option value="">Any status</option><option value="nosf">Missing Salesforce link</option><option value="noreport">No report yet</option><option value="notshared">Report not shared</option><option value="shared">Shared with customer</option><option value="unsold">Projected, nothing sold yet</option><option value="partly">Partly sold</option><option value="sold">Fully sold</option><option value="noprimary">No primary marked</option></select></div>
        <span class="spacer"></span><span class="muted small" id="count"></span>
      </div>
      <div class="tw mt"><table><thead><tr>
        <th class="sort" data-k="name">Account</th><th class="sort" data-k="owner">Accountable SE</th><th>Salesforce</th><th class="sort num" data-k="tr">T&amp;R</th><th class="sort num" data-k="fusion">Fusion</th><th class="sort num" data-k="credits">Total credits</th><th class="sort num" data-k="sold">Sold</th><th class="sort num" data-k="remaining">Still needed</th><th class="sort num" data-k="reports">Reports</th><th>Customer</th><th class="sort" data-k="last">Last report</th>
      </tr></thead><tbody id="rows"></tbody></table></div>
    </div>`;
  const val = (a, k) => ({ name: a.name.toLowerCase(), owner: String(a.owner).toLowerCase(), tr: a.primary?.trCredits ?? -1, fusion: a.primary?.fusionCredits ?? -1, credits: a.primary?.totalCredits ?? -1, reports: a.reportCount, sold: a.sold ?? 0, remaining: a.remaining ?? -1, last: a.lastReportAt ?? '' })[k];
  const render = () => {
    const q = $('#q').value.trim().toLowerCase();
    const owner = $('#owner').value;
    const status = $('#status').value;
    const list = accounts
      .filter((a) => !q || [a.name, a.owner, a.team, a.salesforceId].some((s) => String(s ?? '').toLowerCase().includes(q)))
      .filter((a) => !owner || a.ownerId === owner)
      .filter((a) => !['unsold', 'partly', 'sold'].includes(status) || (status === 'unsold' ? a.primary && !a.sold : status === 'partly' ? a.sold > 0 && a.remaining > 0 : a.sold > 0 && a.remaining === 0))
      .filter((a) => !status || ['unsold', 'partly', 'sold'].includes(status) || (status === 'nosf' ? !a.salesforceUrl : status === 'noreport' ? !a.primary : status === 'notshared' ? a.primary && !a.sharedCount : status === 'shared' ? a.sharedCount > 0 : a.primary && a.primary.how !== 'marked'))
      .sort((a, b) => (val(a, sort.key) > val(b, sort.key) ? 1 : val(a, sort.key) < val(b, sort.key) ? -1 : 0) * sort.dir);
    $('#count').textContent = `${num(list.length)} of ${num(accounts.length)} accounts`;
    $('#rows').innerHTML = list.length
      ? list.map((a) => `<tr class="click" data-account="${esc(a.id)}">
        <td><b>${esc(a.name)}</b><span class="sub">${esc(a.teamPath)}</span></td>
        <td><div class="flex"><span class="avatar sm">${esc(initials(a.owner))}</span>${esc(a.owner)}</div></td>
        <td>${sfChip(a)}</td>
        <td class="num">${a.primary ? num(Math.round(a.primary.trCredits ?? 0)) : '—'}</td>
        <td class="num">${a.primary ? num(Math.round(a.primary.fusionCredits ?? 0)) : '—'}</td>
        <td class="num">${a.primary ? `<span class="credits big">${num(Math.round(a.primary.totalCredits))}</span>${a.primary.how === 'latest' ? '<span class="sub">latest · none marked</span>' : '<span class="sub">primary</span>'}` : '<span class="muted">No report</span>'}</td>
        <td class="num">${soldCell(a)}</td>
        <td class="num">${a.remaining === null ? '—' : a.remaining === 0 && a.sold ? '<span class="chip ok"><i></i>Done</span>' : num(a.remaining)}</td>
        <td class="num">${num(a.reportCount)}</td>
        <td>${a.sharedCount ? `<span class="chip ok"><i></i>${num(a.sharedCount)} shared</span>` : a.reportCount ? '<span class="chip warn"><i></i>Not shared</span>' : '<span class="chip"><i></i>—</span>'}</td>
        <td>${esc(ago(a.lastReportAt))}</td></tr>`).join('')
      : '<tr><td colspan="11"><div class="empty"><b>No accounts match</b>Change the filters, or add one in the calculator.</div></td></tr>';
    for (const el of $$('[data-account]')) el.onclick = (e) => !e.target.closest('a') && go(`/accounts/${encodeURIComponent(el.dataset.account)}`);
  };
  for (const th of $$('th.sort')) th.onclick = () => {
    sort = { key: th.dataset.k, dir: sort.key === th.dataset.k ? -sort.dir : th.dataset.k === 'name' || th.dataset.k === 'owner' ? 1 : -1 };
    render();
  };
  $('#q').oninput = render;
  $('#owner').onchange = render;
  $('#status').onchange = render;
  $('#team').onchange = (e) => go(`/accounts${e.target.value ? `?team=${encodeURIComponent(e.target.value)}` : ''}`);
  render();
}

async function viewAccount(id) {
  shell('accounts', loading());
  let d;
  try {
    d = await api(`/api/cc/accounts/${encodeURIComponent(id)}`);
  } catch (error) {
    $('#main').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b><a href="#/accounts">Back to accounts</a></div></div>`;
    return;
  }
  const a = d.account;
  const p = a.primary;
  const calcHref = `/calculator?team=${encodeURIComponent(a.teamId)}&account=${encodeURIComponent(a.id)}`;
  $('#main').innerHTML = `
    <div class="crumbs"><a href="#/accounts">Accounts</a> › ${esc(a.teamPath)}</div>
    <div class="head"><div><h1 class="serif">${esc(a.name)}</h1><p>Accountable SE <b>${esc(a.owner)}</b> · ${num(a.reportCount)} report${a.reportCount === 1 ? '' : 's'} · ${num(a.sharedCount)} shared with the customer</p></div>
      <div class="tools">${a.salesforceUrl ? `<a class="btn" href="${esc(a.salesforceUrl)}" target="_blank" rel="noopener noreferrer">${icon('ext')}Open in Salesforce</a>` : ''}${d.can.edit ? `<a class="btn primary" href="${esc(calcHref)}">${icon('calc')}Open in calculator</a>` : ''}</div></div>
    ${a.salesforceUrl ? '' : `<div class="callout warn">This account has no Salesforce opportunity or account link: no report can be generated until it is given.${d.can.edit ? ' Add it below.' : ''}</div>`}
    <div class="hero-card mt">
      <div class="panel"><h2>Primary report <small>${p ? (p.how === 'marked' ? 'marked primary' : 'the latest: none marked, so the latest stands for the account') : 'none yet'}</small></h2>
        ${p ? `<div class="flex"><span class="credits big serif" id="bigc"></span></div>
        <div class="figure"><div><small>Triage &amp; remediation</small><b>${num(Math.round(p.trCredits ?? 0))}</b></div><div><small>Fusion</small><b>${num(Math.round(p.fusionCredits ?? 0))}</b></div><div><small>Total${p.extraPercent ? ` (+${num(p.extraPercent, 1)}%)` : ''}</small><b>${num(Math.round(p.totalCredits))}</b></div></div>
        <p class="muted small mt">Made ${esc(dateTime(p.createdAt))} by ${esc(p.createdBy)}${p.bundles ? ` · ${num(p.bundles)} bundle${p.bundles === 1 ? '' : 's'}` : ''} · ${p.sharedAt ? `<span class="chip ok"><i></i>Shared ${esc(date(p.sharedAt))}</span>` : '<span class="chip warn"><i></i>Not shared yet</span>'}</p>` : '<div class="empty"><b>No report yet</b>Open the account in the calculator and generate one.</div>'}
      </div>
      <div class="panel"><h2>Account</h2>
        <form class="form" id="acct">
          <label class="f">Salesforce opportunity or account link <b>required</b><input name="sf" type="url" value="${esc(a.salesforceUrl)}" placeholder="https://yourorg.lightning.force.com/lightning/r/Opportunity/006…/view" ${d.can.edit ? '' : 'disabled'} /></label>
          <div class="row">
            <label class="f">Accountable SE<select name="owner" ${d.can.edit ? '' : 'disabled'}>${d.members.map((m) => `<option value="${esc(m.id)}"${m.id === a.ownerId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
            <label class="f">Team${teamSelect('acct-team', a.teamId, { all: false }).replace('<select', `<select name="team" ${d.can.edit ? '' : 'disabled'}`)}</label>
          </div>
          ${d.can.edit ? '<div class="flex"><button class="primary" type="submit">Save</button><span class="err" id="err"></span></div>' : ''}
        </form>
        ${a.salesforceUrl ? `<dl class="kv mt"><dt>Salesforce</dt><dd>${esc(a.salesforceKind === 'opportunity' ? 'Opportunity' : 'Account')} <span class="mono">${esc(a.salesforceId)}</span></dd><dt>Created</dt><dd>${esc(dateTime(a.createdAt))} by ${esc(a.createdBy)}</dd><dt>Updated</dt><dd>${esc(dateTime(a.updatedAt))}</dd><dt>Checkmarx One</dt><dd>${a.cxone ? `Key kept for <b>${esc(a.cxone.tenant)}</b> by ${esc(a.cxone.savedBy)} · ${a.cxone.lastReadAt ? `last read ${esc(ago(a.cxone.lastReadAt))}` : 'not read since'}${d.can.edit ? ` · <a href="${esc(calcHref)}&amp;refresh=1">↻ Refresh in the calculator</a> · <a href="#" id="forget-key">Forget the key</a>` : ''}` : 'No key kept: tick "Remember this key" when connecting in the calculator, to refresh in one click later.'}</dd><dt>Impact <span class="chip star">beta</span></dt><dd>${a.impactEnabled ? `On · soft savings in ${esc(a.impactCurrency)} go into its reports` : 'Off: turn it on in the calculator for soft savings in the reports'}</dd></dl>` : ''}
        ${d.can.deleteAccount ? '<div class="mt"><button class="danger sm" id="del-acct">Delete account and its reports</button></div>' : ''}
      </div>
    </div>
    ${salesPanel(a, d)}
    <div class="panel mt"><h2>Reports <small>download them from the calculator's Saved reports list</small>${d.can.edit ? `<label class="btn sm file-btn">⇪ Upload the customer's version<input type="file" id="cv-file" accept=".html,.htm,text/html" hidden /></label>` : ''}</h2>
      ${d.reports.length ? `<div class="tw"><table><thead><tr><th></th><th>Made</th><th>By</th><th class="num">T&amp;R</th><th class="num">Fusion</th><th class="num">Total</th><th>Shared with customer</th><th></th></tr></thead><tbody>${d.reports.map((r) => {
        const primary = a.primary?.id === r.id;
        return `<tr data-id="${esc(r.id)}"><td>${primary ? `<span class="chip star">${icon('star')}${a.primary.how === 'marked' ? 'Primary' : 'Latest'}</span>` : ''}${r.source === 'customer' ? `<span class="chip sf" title="${esc(r.changes.join('\n') || 'No changes')}">Customer's version</span><span class="sub">${r.sentTotal ? `${r.totalCredits - r.sentTotal > 0 ? '+' : ''}${num(Math.round(r.totalCredits - r.sentTotal))} vs sent` : ''}${r.changes.length ? ` · ${num(r.changes.length)} change${r.changes.length === 1 ? '' : 's'}` : ''}</span>` : ''}</td><td>${esc(dateTime(r.createdAt))}</td><td>${esc(r.createdBy)}</td><td class="num">${num(Math.round(r.trCredits ?? 0))}</td><td class="num">${num(Math.round(r.fusionCredits ?? 0))}</td><td class="num credits">${num(Math.round(r.totalCredits))}</td><td>${r.sharedAt ? `<span class="chip ok"><i></i>${esc(date(r.sharedAt))}</span><span class="sub">${esc(r.sharedByName)}${r.sharedNote ? ` · ${esc(r.sharedNote)}` : ''}</span>` : '<span class="muted">—</span>'}</td>
        <td class="actions">${d.can.share ? `${a.primaryReportId === r.id ? '<button class="sm ghost" data-act="unprimary">Unmark primary</button>' : `<button class="sm" data-act="primary">${icon('star')}Make primary</button>`}${r.sharedAt ? '<button class="sm ghost" data-act="unshare">Unmark shared</button>' : `<button class="sm" data-act="share">${icon('send')}Mark shared</button>`}` : ''}${d.can.sell ? `<button class="sm ghost" data-sell="${esc(r.id)}" title="Record credits sold against this report">Sold…</button>` : ''}<button class="sm ghost icon" data-act="delete" title="Delete report">${icon('trash')}</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty"><b>No reports yet</b></div>'}
    </div>`;
  if (p) countUp($('#bigc'), Math.round(p.totalCredits), ' credits');
  wireSales(a, d);
  if ($('#forget-key')) $('#forget-key').onclick = async (e) => {
    e.preventDefault();
    if (!confirm(`Forget the Checkmarx One key kept for ${a.name}?`)) return;
    await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/cxone`, { method: 'DELETE' }).catch((x) => toast(x.message, 'bad'));
    viewAccount(a.id);
  };
  if ($('#cv-file')) $('#cv-file').onchange = (e) => customerVersion(a, e.target.files[0]);
  const form = $('#acct');
  if (form && d.can.edit) form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const body = { ownerId: f.get('owner'), teamId: f.get('team') };
    if (String(f.get('sf') ?? '').trim() !== a.salesforceUrl) body.salesforceUrl = f.get('sf');
    try {
      await api(`/api/cc/accounts/${encodeURIComponent(a.id)}`, { method: 'PUT', body });
      toast('Saved.', 'ok');
      viewAccount(a.id);
    } catch (error) {
      $('#err').textContent = error.message;
    }
  };
  if ($('#del-acct')) $('#del-acct').onclick = async () => {
    if (!confirm(`Delete ${a.name} and its ${a.reportCount} report(s)? This cannot be undone.`)) return;
    try {
      await api(`/api/cc/accounts/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      toast('Account deleted.', 'ok');
      go('/accounts');
    } catch (error) {
      toast(error.message, 'bad');
    }
  };
  for (const b of $$('[data-act]')) b.onclick = async () => {
    const rid = b.closest('tr').dataset.id;
    const act = b.dataset.act;
    try {
      if (act === 'primary' || act === 'unprimary') await api(`/api/cc/reports/${encodeURIComponent(rid)}/primary`, { method: 'POST', body: { primary: act === 'primary' } });
      if (act === 'share') {
        const note = await ask('Mark shared with the customer', 'How and to whom was it shared? (optional) For example: emailed to the CISO, 12 Nov.');
        if (note === null) return;
        await api(`/api/cc/reports/${encodeURIComponent(rid)}/shared`, { method: 'POST', body: { shared: true, note } });
      }
      if (act === 'unshare') await api(`/api/cc/reports/${encodeURIComponent(rid)}/shared`, { method: 'POST', body: { shared: false } });
      if (act === 'delete') {
        if (!confirm('Delete this report? This cannot be undone.')) return;
        await api(`/api/cc/reports/${encodeURIComponent(rid)}`, { method: 'DELETE' });
      }
      toast('Done.', 'ok');
      viewAccount(a.id);
    } catch (error) {
      toast(error.message, 'bad');
    }
  };
}

// ---- Credits sold: one or many sales per account, against the projection of its primary report --------------------
function salesPanel(a, d) {
  const projected = Math.round(Number(a.primary?.totalCredits) || 0);
  const p = projected ? Math.min(100, Math.round((a.sold / projected) * 100)) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const reportName = (id) => {
    const r = d.reports.find((x) => x.id === id);
    return r ? `${date(r.createdAt)} · ${num(Math.round(r.totalCredits))}` : 'a deleted report';
  };
  return `<div class="panel mt" id="sales"><h2>Credits sold <small>one or many sales, against the projection of the primary report</small></h2>
    <div class="sold-strip">
      <div><small>Projected</small><b>${projected ? num(projected) : '—'}</b></div>
      <div><small>Sold so far</small><b class="sold-t">${num(a.sold)}</b></div>
      <div><small>Still needed</small><b>${a.remaining === null ? '—' : num(a.remaining)}</b></div>
      <div class="sold-bar"><span class="track"><i data-w="${p}"></i></span><small>${projected ? `${p}% of the projection sold` : 'No projection yet: the primary report sets it'}${projected && a.sold > projected ? ` · ${num(a.sold - projected)} more than projected` : ''}</small></div>
    </div>
    ${d.can.sell ? `<form class="form sale-form mt" id="sale"><div class="row">
      <label class="f">Credits sold<input name="credits" type="number" min="1" step="1" required placeholder="e.g. 50000" /></label>
      <label class="f">Date of the sale<input name="date" type="date" value="${today}" max="${today}" required /></label>
      <label class="f">Salesforce opportunity or order <span class="muted">optional</span><input name="reference" maxlength="120" placeholder="006… or order number" /></label>
      <label class="f">Against the report <span class="muted">optional</span><select name="reportId"><option value="">None in particular</option>${d.reports.map((r) => `<option value="${esc(r.id)}"${r.id === a.primary?.id ? ' selected' : ''}>${esc(date(r.createdAt))} · ${esc(num(Math.round(r.totalCredits)))} credits${r.id === a.primary?.id ? ' (primary)' : ''}</option>`).join('')}</select></label></div>
      <label class="f">Note <span class="muted">optional</span><input name="note" maxlength="300" placeholder="First year of a 3-year deal, bundle of 5…" /></label>
      <div class="flex"><button class="primary" type="submit">${icon('plus')}Record the sale</button>${a.remaining ? `<button type="button" class="ghost" id="sale-rest">Fill in what is still needed (${num(a.remaining)})</button>` : ''}<span class="err" id="sale-err"></span></div></form>` : ''}
    ${d.sales.length ? `<div class="tw mt"><table><thead><tr><th>Date</th><th class="num">Credits</th><th>Salesforce / order</th><th>Against</th><th>Note</th><th>Recorded by</th><th></th></tr></thead><tbody>${d.sales.map((x) => `<tr data-sale="${esc(x.id)}"><td>${esc(date(x.date))}</td><td class="num credits">${num(x.credits)}</td><td class="mono small">${esc(x.reference || '—')}</td><td class="small">${x.reportId ? esc(reportName(x.reportId)) : '—'}</td><td class="small">${esc(x.note || '')}</td><td class="small">${esc(x.by)}<span class="sub">${esc(ago(x.at))}</span></td><td class="actions">${d.can.removeAnySale || x.byId === d.can.me ? `<button class="sm ghost icon" data-unsell title="Remove this sale">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td><b>Total</b></td><td class="num credits">${num(a.sold)}</td><td colspan="5"></td></tr></tfoot></table></div>` : '<p class="muted small mt">No sales recorded yet.</p>'}
  </div>`;
}
function wireSales(a, d) {
  const form = $('#sale');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/sales`, { method: 'POST', body: { credits: Number(f.get('credits')), date: f.get('date'), reference: f.get('reference'), note: f.get('note'), reportId: f.get('reportId') || null } });
        toast(`${num(Number(f.get('credits')))} credits recorded as sold.`, 'ok');
        viewAccount(a.id);
      } catch (error) {
        $('#sale-err').textContent = error.message;
      }
    };
    if ($('#sale-rest')) $('#sale-rest').onclick = () => (form.credits.value = a.remaining);
  }
  for (const b of $$('[data-sell]')) b.onclick = () => {
    if (!form) return;
    form.reportId.value = b.dataset.sell;
    $('#sales').scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.credits.focus();
  };
  for (const b of $$('[data-unsell]')) b.onclick = async () => {
    const id = b.closest('tr').dataset.sale;
    const x = d.sales.find((s) => s.id === id);
    if (!confirm(`Remove the sale of ${num(x.credits)} credits on ${date(x.date)}?`)) return;
    try {
      await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/sales/${encodeURIComponent(id)}`, { method: 'DELETE' });
      viewAccount(a.id);
    } catch (error) {
      toast(error.message, 'bad');
    }
  };
  paint();
}

/** The customer's own version of a report: what they changed, then recorded as theirs. */
async function customerVersion(a, file) {
  if (!file) return;
  const html = await file.text();
  let p;
  try {
    p = await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/customer-version`, { method: 'POST', body: { html, dryRun: true } });
  } catch (error) {
    return toast(error.message, 'bad');
  }
  const delta = p.sentTotal ? p.total - p.sentTotal : null;
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog"><div class="dh"><h2>The customer's version</h2><p class="small muted">Only the report's figures are read, and worked out again by the calculator; the file itself is not kept.</p></div><div class="db">
    ${p.sameName ? '' : `<div class="callout warn">Made for <b>${esc(p.customer)}</b>, not ${esc(a.name)}.</div>`}
    <div class="figure"><div><small>As sent</small><b>${num(p.sentTotal)}</b></div><div><small>Their version</small><b>${num(Math.round(p.total))}</b></div><div><small>Difference</small><b>${delta === null ? '—' : `${delta > 0 ? '+' : ''}${num(Math.round(delta))}`}</b></div></div>
    ${p.changes.length ? `<h3 class="mt">What they changed</h3><ul class="small">${p.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="muted mt">They changed nothing.</p>'}
    <label class="check mt"><input type="checkbox" name="primary" checked /><span>Make it the primary report<small>The dashboards and "still needed" then count their numbers.</small></span></label>
    <label class="check"><input type="checkbox" name="prefs" checked /><span>Use their numbers in the calculator from now on<small>Their plan, prices, scans and period become this account's settings.</small></span></label>
    <label class="f mt">Note <span class="muted">optional</span><input name="note" maxlength="300" /></label></div>
    <div class="df"><button value="cancel" class="ghost">Cancel</button><button value="ok" class="primary">Record their version</button></div></form>`;
  document.body.append(dlg);
  dlg.addEventListener('close', async () => {
    const ok = dlg.returnValue === 'ok';
    const f = new FormData(dlg.querySelector('form'));
    dlg.remove();
    if (!ok) return;
    try {
      await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/customer-version`, { method: 'POST', body: { html, dryRun: false, confirm: true, makePrimary: f.get('primary') === 'on', applyPreferences: f.get('prefs') === 'on', note: f.get('note') } });
      toast('Their version is recorded.', 'ok');
      viewAccount(a.id);
    } catch (error) {
      toast(error.message, 'bad');
    }
  });
  dlg.showModal();
}

function countUp(el, to, suffix = '') {
  if (!el) return;
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / 700);
    el.textContent = `${num(Math.round(to * (1 - (1 - k) ** 3)))}${suffix}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function ask(title, hint, value = '') {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog"><div class="dh"><h2>${esc(title)}</h2></div><div class="db"><label class="f">${esc(hint)}<input name="v" maxlength="300" value="${esc(value)}" /></label></div><div class="df"><button value="cancel" class="ghost">Cancel</button><button value="ok" class="primary">Save</button></div></form>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok' ? dlg.querySelector('input').value : null);
      dlg.remove();
    });
    dlg.showModal();
  });
}

// ---- People -------------------------------------------------------------------------------------------
async function peopleList() {
  state.people = await api('/api/people');
  return state.people;
}
// People, roles and sign-in, as CxMissionZero's Access page: for Leaders (their teams), Executives and Admins (everyone).
let peopleTab = 'people';
const STATUS = { active: ['ok', 'Active'], locked: ['bad', 'Locked'], disabled: ['bad', 'Off'], pending: ['warn', 'Must set password'] };
const PAGE = 25;
async function viewPeople(tab = peopleTab) {
  peopleTab = ['people', 'roles', 'signin'].includes(tab) ? tab : 'people';
  if (peopleTab === 'signin' && !can('users.manage')) peopleTab = 'people';
  if (peopleTab === 'roles' && !(can('users.manage') || can('roles.manage'))) peopleTab = 'people';
  if (location.hash.split('?')[0] !== `#/people/${peopleTab}`) history.replaceState(null, '', `#/people/${peopleTab}`);
  const manage = can('users.manage');
  shell('people', loading());
  const d = await peopleList();
  const tabs = [['people', `People <em>${num(d.people.length)}</em>`], ...(manage || can('roles.manage') ? [['roles', `Roles &amp; permissions <em>${num(d.roles.length)}</em>`]] : []), ...(manage ? [['signin', 'Sign-in']] : [])];
  $('#main').innerHTML = `<div class="head"><div><h1 class="serif">People</h1><p>${manage ? (can('scope.all') ? 'Everyone who can sign in, and what they may do. You manage people in every team.' : 'The people in the teams you lead. You can invite them, change their role and team, reset passwords, unlock, sign out and turn access off, never beyond your own permissions.') : 'The people in your teams and the teams you lead.'}</p></div></div>
    <nav class="tabs" role="tablist">${tabs.map(([id, label]) => `<a role="tab" href="#/people/${id}" class="${id === peopleTab ? 'on' : ''}">${label}</a>`).join('')}</nav><div id="ptab"></div>`;
  if (peopleTab === 'roles') return rolesMatrix(d);
  if (peopleTab === 'signin') return signInTab();
  return peopleTable(d);
}

function peopleTable(d) {
  const manage = can('users.manage');
  const roles = d.roles.filter((r) => r.grantable);
  const teams = [...d.teams].sort((a, b) => a.path.localeCompare(b.path));
  let page = 0;
  $('#ptab').innerHTML = `<div class="panel">
    <div class="flex"><h2 class="grow-h">People <small>everyone who can sign in, and what they may do</small></h2>${manage ? `<button id="import">${icon('download')}Import people &amp; teams</button><button class="primary" id="add-toggle">${icon('plus')}Add person</button>` : ''}</div>
    ${manage ? `<form class="form add-form" id="add" hidden autocomplete="off">
      <div class="row"><label class="f">Work email<input name="email" type="email" required /></label><label class="f">Name<input name="name" maxlength="120" /></label><label class="f">Title<input name="title" maxlength="120" placeholder="Sales Engineer" /></label></div>
      <div class="row"><label class="f">Role<select name="role">${roles.map((r) => `<option value="${esc(r.id)}"${r.id === 'se' ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label class="f">Team<select name="team" required>${teams.map((t) => `<option value="${esc(t.id)}"${t.id === state.me.team?.id ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select></label>
      <label class="f">Temporary password <span class="muted">blank: one is made</span><span class="flex nowrap"><input name="password" autocomplete="off" spellcheck="false" placeholder="They choose their own at first sign-in" /><button type="button" class="sm" id="gen">Generate</button></span></label></div>
      <label class="check"><input type="checkbox" name="welcome" ${d.mail ? 'checked' : 'disabled'} /><span>Email them a welcome<small>${d.mail ? 'Where to sign in, and how to set their password with "Forgot your password?". The temporary password is never emailed.' : 'Needs the email server (Settings → Email).'}</small></span></label>
      <div class="flex"><button class="primary" type="submit">Add person</button><button type="button" class="ghost" id="add-cancel">Cancel</button><span class="err" id="add-err"></span></div><div id="add-secret"></div></form>` : ''}
    <div class="flex mt"><div class="search">${icon('search')}<input id="q" placeholder="Search people, emails, titles" /></div>
      <select id="f-role"><option value="">All roles</option>${d.roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select>
      <select id="f-team"><option value="">All teams</option>${teams.map((t) => `<option value="${esc(t.id)}">${esc(t.path)}</option>`).join('')}</select>
      <select id="f-status"><option value="">Any status</option>${Object.entries(STATUS).map(([k, [, l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <span class="spacer"></span><span class="muted small" id="count"></span></div>
    <div class="tw mt"><table class="people"><thead><tr><th>Person</th><th>Role</th><th>Team</th><th>Sign-in</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="flex pager" id="pager"><span class="muted small" id="pinfo"></span><span class="spacer"></span><button class="sm" id="prev">Previous</button><button class="sm" id="next">Next</button></div></div>`;
  const list = () => {
    const q = $('#q').value.trim().toLowerCase();
    const [role, team, status] = [$('#f-role').value, $('#f-team').value, $('#f-status').value];
    return d.people
      .filter((u) => !q || [u.name, u.email, u.title, u.team].some((s) => String(s ?? '').toLowerCase().includes(q)))
      .filter((u) => (!role || u.role === role) && (!team || u.teamId === team) && (!status || u.status === status))
      .sort((a, b) => a.name.localeCompare(b.name));
  };
  const render = () => {
    const all = list();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    page = Math.min(page, pages - 1);
    $('#count').textContent = `${num(all.length)} of ${num(d.people.length)}`;
    $('#pager').hidden = pages < 2;
    $('#pinfo').textContent = `Page ${page + 1} of ${pages}`;
    $('#prev').disabled = page === 0;
    $('#next').disabled = page >= pages - 1;
    $('#rows').innerHTML = all.slice(page * PAGE, page * PAGE + PAGE).map((u) => {
      const [kind, label] = STATUS[u.status] ?? STATUS.active;
      const acts = u.manageable ? `<details class="menu"><summary class="btn sm">Manage</summary><div class="menu-list">
        <button type="button" data-act="edit">Edit role, team, name</button>
        <button type="button" data-act="reset">Reset password</button>
        ${u.status === 'locked' ? '<button type="button" data-act="unlock">Unlock now</button>' : ''}
        ${u.sessions ? `<button type="button" data-act="signout">Sign out everywhere (${num(u.sessions)})</button>` : ''}
        <button type="button" data-act="toggle">${u.active ? 'Turn access off' : 'Turn access on'}</button>
        <button type="button" data-act="remove" class="danger">Remove</button></div></details>` : '';
      return `<tr data-id="${esc(u.id)}"><td><div class="flex nowrap"><span class="avatar sm">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b>${u.id === state.me.user.id ? ' <span class="chip">You</span>' : ''}<span class="sub">${esc(u.email)}${u.title ? ` · ${esc(u.title)}` : ''}</span></div></div></td>
        <td><span class="chip role">${esc(u.roleName)}</span>${u.leads.length ? `<span class="sub">Leads ${esc(u.leads.join(', '))}</span>` : ''}</td><td title="${esc(u.teamPath)}">${esc(u.team || '—')}</td>
        <td class="small">${u.signIn === 'sso' ? 'Single sign-on' : 'Password'}</td><td><span class="chip ${kind}"><i></i>${label}</span>${u.lockedUntil ? `<span class="sub">until ${esc(new Date(u.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>` : ''}</td>
        <td class="small">${esc(ago(u.lastSignInAt))}</td><td class="actions">${acts}</td></tr>`;
    }).join('') || '<tr><td colspan="7"><div class="empty"><b>Nobody matches</b></div></td></tr>';
    for (const b of $$('[data-act]')) b.onclick = () => personAction(d, d.people.find((u) => u.id === b.closest('tr').dataset.id), b.dataset.act);
  };
  for (const id of ['#q', '#f-role', '#f-team', '#f-status']) $(id)[id === '#q' ? 'oninput' : 'onchange'] = () => ((page = 0), render());
  $('#prev').onclick = () => (page--, render());
  $('#next').onclick = () => (page++, render());
  if (manage) {
    $('#add-toggle').onclick = () => ($('#add').hidden = !$('#add').hidden);
    $('#import').onclick = () => importPeople(d);
    $('#add-cancel').onclick = () => ($('#add').hidden = true);
    $('#gen').onclick = () => {
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      $('#add [name=password]').value = [...bytes].map((x) => a[x % a.length]).join('').match(/.{5}/g).join('-');
    };
    $('#add').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await api('/api/people', { method: 'POST', body: { email: f.get('email'), name: f.get('name'), title: f.get('title'), role: f.get('role'), teamId: f.get('team'), password: f.get('password'), sendWelcome: f.get('welcome') === 'on' } });
        $('#add-err').textContent = '';
        $('#add-secret').innerHTML = `<div class="callout mt"><b>${esc(r.user.email)} can sign in with this temporary password</b><p class="small muted">Give it to them over a channel only they read; it is shown once and they choose their own at first sign-in.${r.welcomed ? ' A welcome email is on its way.' : ''}</p><div class="secret">${esc(r.temporary)}</div></div>`;
        e.target.reset();
        d.people = (await peopleList()).people;
        render();
      } catch (error) {
        $('#add-err').textContent = error.message;
      }
    };
  }
  render();
}

// ---- Bulk onboarding: people and the team structure from one sheet; their temporary passwords back as a sheet ---------
const saveBlob = (blob, name) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
};
const HEADERS = { email: /^(e-?mail|work e-?mail|email address)$/, name: /^(name|full name|person)$/, title: /^(title|job title|position)$/, role: /^(role|access)$/, team: /^(team|team path|region|team \(path\))$/, leads: /^(leads?|leader|leads (the |their )?team|team leader)$/ };
function sheetRows(sheet) {
  const rows = sheet.rows.filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  if (!rows.length) return [];
  const head = rows[0].map((c) => String(c ?? '').trim().toLowerCase());
  const at = Object.fromEntries(Object.entries(HEADERS).map(([k, re]) => [k, head.findIndex((h) => re.test(h))]));
  if (at.email < 0) throw new Error('The sheet needs an Email column (download the template to see the columns).');
  return rows.slice(1).map((r) => Object.fromEntries(Object.entries(at).map(([k, i]) => [k, i < 0 ? '' : String(r[i] ?? '').trim()])));
}
function downloadTemplate(d) {
  const top = state.me.scopeTeams.find((t) => !t.parentId)?.name ?? 'Global Sales Engineering';
  const teams = [...d.teams].sort((a, b) => a.path.localeCompare(b.path)).map((t) => [t.path.replace(/ › /g, ' > '), t.leaders.map((l) => l.name).join(', '), t.members]);
  saveBlob(workbook([
    { name: 'People', widths: [32, 24, 22, 18, 52, 12], rows: [['Email', 'Name', 'Title', 'Role', 'Team', 'Leads team'], [`regional.lead@yourcompany.com`, 'Regional Lead', 'SE Director, EMEA', 'Leader', `${top} > EMEA Sales Engineering`, 'yes'], [`first.se@yourcompany.com`, 'First SE', 'Sales Engineer', 'Sales Engineer', `${top} > EMEA Sales Engineering`, ''], [`second.se@yourcompany.com`, 'Second SE', 'Sales Engineer', 'Sales Engineer', `${top} > EMEA Sales Engineering > EMEA North`, '']] },
    { name: 'How to fill it', widths: [22, 90], rows: [['Column', 'What to put'], ['Email', 'Their work email: how they sign in. Required.'], ['Name', 'Their name, as shown everywhere.'], ['Title', 'Optional: Sales Engineer, SE Director…'], ['Role', `One of: ${d.roles.filter((r) => r.grantable).map((r) => r.name).join(', ')}. Blank: Sales Engineer.`], ['Team', 'The path from the top team to theirs, with > between teams, e.g. Global SE > EMEA SE > EMEA North. Teams that do not exist yet are created (Executives and Admins).'], ['Leads team', 'yes if they lead that team: they see it and every team below it (Executives and Admins set this).'], ['', ''], ['Afterwards', 'You get a sheet with each new person\u2019s temporary password. Give each one to its person over a channel only they read; they choose their own password at first sign-in. People who already have access are left as they are.']] },
    { name: 'Teams now', widths: [60, 30, 10], rows: [['Team (path)', 'Leaders', 'People'], ...teams] },
  ]), 'command-center-people-template.xlsx');
}
function importPeople(d) {
  const dlg = document.createElement('dialog');
  dlg.className = 'wide';
  dlg.innerHTML = `<div class="dh"><h2>Import people &amp; teams</h2><p class="small muted">From one sheet (Excel or CSV): each person's email, name, title, role, team path and whether they lead it. Teams in the paths are created where missing. You get back a sheet with every new person's temporary password.</p></div>
    <div class="db"><div class="flex"><button id="tpl">${icon('download')}Download the template</button><label class="btn primary file-btn">${icon('plus')}Choose the filled-in sheet<input type="file" id="file" accept=".xlsx,.csv,.tsv,.txt" hidden /></label><span class="small muted" id="fname"></span></div>
    <div class="err mt" id="ierr"></div><div id="preview"></div></div>
    <div class="df"><button class="ghost" id="iclose">Close</button><button class="primary" id="go" hidden>Create</button></div>`;
  document.body.append(dlg);
  dlg.showModal();
  let rows = [];
  let welcome = false;
  const close = () => (dlg.close(), dlg.remove(), viewPeople('people'));
  $('#iclose', dlg).onclick = close;
  $('#tpl', dlg).onclick = () => downloadTemplate(d);
  const STATUS_CHIP = { create: ['ok', 'To create'], created: ['ok', 'Created'], exists: ['', 'Already has access'], error: ['bad', 'Not possible'] };
  const table = (res) => `<div class="tw mt import-tw"><table><thead><tr><th>Row</th><th>Person</th><th>Role</th><th>Team</th><th>Leads</th><th>Result</th></tr></thead><tbody>${res.rows.map((x) => `<tr><td class="small muted">${x.row}</td><td><b>${esc(x.name || '—')}</b><span class="sub">${esc(x.email)}</span></td><td>${esc(x.role || '—')}</td><td class="small">${esc(x.team || '—')}${x.newTeams.length ? `<span class="sub"><span class="chip warn">new</span> ${esc(x.newTeams.join(' › '))}</span>` : ''}</td><td>${x.leads ? '<span class="chip star">Leads</span>' : ''}</td><td><span class="chip ${STATUS_CHIP[x.status][0]}"><i></i>${STATUS_CHIP[x.status][1]}</span>${x.message ? `<span class="sub">${esc(x.message)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  $('#file', dlg).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#fname', dlg).textContent = file.name;
    $('#ierr', dlg).textContent = '';
    try {
      const book = await window.CxXlsx.readFile(file);
      const sheet = book.find((sh) => /people/i.test(sh.name)) ?? book[0];
      rows = sheetRows(sheet);
      if (!rows.length) throw new Error('The sheet has no people in it.');
      const res = await api('/api/people/import', { method: 'POST', body: { rows, dryRun: true } });
      const s2 = res.summary;
      $('#preview', dlg).innerHTML = `<div class="import-sum mt"><span class="chip ok"><i></i>${num(s2.create)} to create</span><span class="chip"><i></i>${num(s2.exists)} already have access</span>${s2.errors ? `<span class="chip bad"><i></i>${num(s2.errors)} not possible</span>` : ''}${s2.newTeams.length ? `<span class="chip warn"><i></i>${num(s2.newTeams.length)} team path${s2.newTeams.length === 1 ? '' : 's'} with new teams</span>` : ''}</div>${table(res)}
        ${d.mail ? '<label class="check mt"><input type="checkbox" id="welcome" /><span>Also email each new person a welcome<small>Where to sign in, and how to set their password with "Forgot your password?". The temporary password is never emailed.</small></span></label>' : ''}`;
      $('#go', dlg).hidden = !s2.create;
      $('#go', dlg).textContent = `Create ${num(s2.create)} ${s2.create === 1 ? 'person' : 'people'}`;
    } catch (error) {
      $('#ierr', dlg).textContent = error.message;
      $('#go', dlg).hidden = true;
    }
  };
  $('#go', dlg).onclick = async () => {
    welcome = Boolean($('#welcome', dlg)?.checked);
    $('#go', dlg).disabled = true;
    $('#go', dlg).innerHTML = '<span class="spinner"></span>Creating…';
    try {
      const res = await api('/api/people/import', { method: 'POST', body: { rows, dryRun: false } });
      const made = res.rows.filter((x) => x.status === 'created');
      const signIn = res.signInAt || location.origin;
      const file = `command-center-new-people-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const blob = workbook([
        { name: 'Temporary passwords', widths: [32, 24, 18, 52, 28, 40], rows: [['Email', 'Name', 'Role', 'Team', 'Temporary password', 'Sign in at'], ...made.map((x) => [x.email, x.name, x.role, x.team, x.temporary, signIn])] },
        { name: 'Read me', widths: [100], rows: [['Give each person their own temporary password over a channel only they read (not this whole sheet).'], ['They sign in at the address given, choose their own password, accept the terms of use and see a quick guide.'], ['Delete this file once everyone has signed in: the passwords stop working as soon as they choose their own.'], [`Made ${new Date().toLocaleString()} by ${state.me.user.name}.`]] },
        { name: 'All rows', widths: [8, 32, 24, 52, 22, 60], rows: [['Row', 'Email', 'Name', 'Team', 'Result', 'Note'], ...res.rows.map((x) => [x.row, x.email, x.name, x.team, x.status, x.message])] },
      ]);
      saveBlob(blob, file);
      if (welcome) for (const x of made) api(`/api/people/${encodeURIComponent(x.id)}/welcome`, { method: 'POST', body: {} }).catch(() => {});
      $('#preview', dlg).innerHTML = `<div class="callout mt"><b>${num(made.length)} ${made.length === 1 ? 'person' : 'people'} created${res.summary.newTeams.length ? ` and ${num(res.summary.newTeams.length)} team${res.summary.newTeams.length === 1 ? '' : 's'}` : ''}.</b> Their temporary passwords are in <b>${esc(file)}</b>, just downloaded: they are shown nowhere else and kept nowhere. <button class="sm" id="again">${icon('download')}Download it again</button></div>${table(res)}`;
      $('#again', dlg).onclick = () => saveBlob(blob, file);
      $('#go', dlg).hidden = true;
      state.me = await api('/api/me');
    } catch (error) {
      $('#ierr', dlg).textContent = error.message;
      $('#go', dlg).disabled = false;
      $('#go', dlg).textContent = 'Create';
    }
  };
}

async function personAction(d, u, act) {
  const path = `/api/people/${encodeURIComponent(u.id)}`;
  try {
    if (act === 'edit') return editPerson(d, u);
    if (act === 'reset') {
      if (!confirm(`Give ${u.name} a new temporary password? Their current one stops working and they are signed out everywhere.`)) return;
      const r = await api(`${path}/reset`, { method: 'POST', body: {} });
      return showTemporary(u.email, r.temporary);
    }
    if (act === 'unlock') await api(`${path}/unlock`, { method: 'POST', body: {} });
    if (act === 'signout') {
      if (!confirm(`Sign ${u.name} out on every device?`)) return;
      await api(`${path}/signout`, { method: 'POST', body: {} });
    }
    if (act === 'toggle') {
      if (u.active && !confirm(`Turn off ${u.name}'s access? They are signed out at once; their accounts and reports stay with their team.`)) return;
      await api(path, { method: 'PUT', body: { active: !u.active } });
    }
    if (act === 'remove') {
      if (!confirm(`Remove ${u.name}? Their accounts and reports stay with their team.`)) return;
      await api(path, { method: 'DELETE' });
    }
    toast('Done.', 'ok');
    viewPeople('people');
  } catch (error) {
    toast(error.message, 'bad');
  }
}
function showTemporary(email, temporary) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog"><div class="dh"><h2>New temporary password</h2></div><div class="db"><p class="small muted">For ${esc(email)}. Give it to them over a channel only they read: it is shown once, and they choose their own at sign-in.</p><div class="secret">${esc(temporary)}</div></div><div class="df"><button value="ok" class="primary">Done</button></div></form>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => (dlg.remove(), viewPeople('people')));
  dlg.showModal();
}

/** Roles as columns, permissions as rows, MZ's matrix: tick, compare, save; never a permission you do not hold. */
function rolesMatrix(d) {
  const edit = can('roles.manage');
  const groups = [...new Set(d.permissions.map((p) => p.group))];
  const draft = Object.fromEntries(d.roles.map((r) => [r.id, new Set(r.permissions)]));
  const editable = (r, p) => edit && !r.locked && !p.special && can(p.id);
  $('#ptab').innerHTML = `<div class="panel"><div class="flex"><h2 class="grow-h">Roles &amp; permissions <small>changes apply at once to everyone with the role · <span class="chip">Admin only</span> stays with Admins</small></h2>${edit ? `<button id="newrole">${icon('plus')}New role</button>` : ''}</div>
    <div class="flex mt"><div class="search">${icon('search')}<input id="pq" placeholder="Find a permission" /></div><label class="check inline"><input type="checkbox" id="diff" /><span>Show only the differences</span></label><span class="spacer"></span>${edit ? '<span class="small muted" id="dirty"></span><button class="primary" id="save" disabled>Save role changes</button><button class="ghost" id="discard" disabled>Discard</button>' : '<span class="small muted">Read only: an Executive or Admin changes roles.</span>'}</div>
    <div class="tw mt matrix-wrap"><table class="matrix"><thead><tr><th>Permission</th>${d.roles.map((r) => `<th class="rc" title="${esc(r.description)}">${esc(r.name)}<span class="sub">${num(r.holders)} ${r.holders === 1 ? 'person' : 'people'}</span>${edit ? `<button class="sm ghost" data-role-edit="${esc(r.id)}" title="${r.builtin ? 'Rename this role (its permissions stay as ticked below)' : 'Rename, describe or remove this role'}">${r.builtin ? 'Rename' : 'Edit'}</button>` : ''}</th>`).join('')}</tr></thead><tbody id="mx"></tbody></table></div></div>`;
  const render = () => {
    const q = $('#pq').value.trim().toLowerCase();
    const diff = $('#diff').checked;
    $('#mx').innerHTML = groups.map((g) => {
      const rows = d.permissions.filter((p) => p.group === g).filter((p) => !q || `${p.label} ${p.description}`.toLowerCase().includes(q)).filter((p) => !diff || new Set(d.roles.map((r) => draft[r.id].has(p.id))).size > 1);
      if (!rows.length) return '';
      return `<tr class="grp"><td colspan="${d.roles.length + 1}">${esc(g)}</td></tr>${rows.map((p) => `<tr><td><b>${esc(p.label)}</b>${p.special ? ' <span class="chip">Admin only</span>' : ''}<span class="sub">${esc(p.description)}</span></td>${d.roles.map((r) => `<td class="rc"><input type="checkbox" data-r="${esc(r.id)}" data-p="${esc(p.id)}" ${draft[r.id].has(p.id) ? 'checked' : ''} ${editable(r, p) ? '' : 'disabled'} aria-label="${esc(r.name)}: ${esc(p.label)}" /></td>`).join('')}</tr>`).join('')}`;
    }).join('');
    for (const box of $$('#mx input')) box.onchange = () => {
      draft[box.dataset.r][box.checked ? 'add' : 'delete'](box.dataset.p);
      dirty();
    };
  };
  const changed = () => d.roles.filter((r) => { const a = new Set(r.permissions); const b = draft[r.id]; return a.size !== b.size || [...a].some((x) => !b.has(x)); });
  const dirty = () => {
    if (!edit) return;
    const c = changed();
    $('#save').disabled = $('#discard').disabled = !c.length;
    $('#dirty').textContent = c.length ? `Changed: ${c.map((r) => r.name).join(', ')}` : '';
  };
  $('#pq').oninput = render;
  $('#diff').onchange = render;
  if (edit) {
    $('#discard').onclick = () => viewPeople('roles');
    $('#save').onclick = async () => {
      try {
        for (const r of changed()) await api(`/api/roles/${encodeURIComponent(r.id)}`, { method: 'PUT', body: { name: r.name, description: r.description, permissions: [...draft[r.id]] } });
        toast('Roles saved.', 'ok');
        viewPeople('roles');
      } catch (error) {
        toast(error.message, 'bad');
      }
    };
    const roleForm = (r) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form class="form" id="rf"><div class="dh"><h2>${r ? `${r.builtin ? 'Rename' : 'Edit'} ${esc(r.name)}` : 'New role'}</h2><p class="small muted">${r ? (r.locked ? 'The name everyone sees. This role always holds every permission.' : 'The name everyone sees, on People, invitations and the import sheet. Who holds it and what it allows stay the same.') : 'Then tick its permissions in the matrix.'}</p></div><div class="db form"><label class="f">Name<input name="name" required maxlength="60" value="${esc(r?.name ?? '')}" /></label><label class="f">Description<input name="desc" maxlength="300" value="${esc(r?.description ?? '')}" /></label>${r ? '' : `<label class="f">Start from<select name="from"><option value="">Nothing</option>${d.roles.filter((x) => !x.locked).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>`}<div class="err" id="rerr"></div></div>
        <div class="df">${r && !r.builtin ? '<button type="button" class="danger" id="rdel">Remove</button><span class="spacer"></span>' : ''}<button type="button" class="ghost" id="rclose">Cancel</button><button class="primary" type="submit">${r ? 'Save' : 'Create role'}</button></div></form>`;
      document.body.append(dlg);
      dlg.showModal();
      const close = () => (dlg.close(), dlg.remove());
      $('#rclose', dlg).onclick = close;
      $('#rf', dlg).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const from = d.roles.find((x) => x.id === f.get('from'));
        try {
          await api(`/api/roles/${encodeURIComponent(r?.id ?? 'new')}`, { method: 'PUT', body: { name: f.get('name'), description: f.get('desc'), permissions: r ? [...draft[r.id]] : (from?.permissions ?? []).filter((p) => can(p) && !d.permissions.find((x) => x.id === p)?.special) } });
          close();
          viewPeople('roles');
        } catch (error) {
          $('#rerr', dlg).textContent = error.message;
        }
      };
      if ($('#rdel', dlg)) $('#rdel', dlg).onclick = async () => {
        try {
          await api(`/api/roles/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
          close();
          viewPeople('roles');
        } catch (error) {
          $('#rerr', dlg).textContent = error.message;
        }
      };
    };
    $('#newrole').onclick = () => roleForm(null);
    for (const b of $$('[data-role-edit]')) b.onclick = () => roleForm(d.roles.find((x) => x.id === b.dataset.roleEdit));
  }
  render();
}

async function signInTab() {
  const s = await api('/api/people/signin');
  $('#ptab').innerHTML = `<div class="grid g2"><div class="panel"><h2>Forgotten passwords</h2>
    <p class="muted small">"Forgot your password?" sends a one-time link to the account's own email. It works once, for 30 minutes, signs the account out everywhere when used, and is followed by an email saying the password was changed. The answer never says whether an address has an account.</p>
    <label class="f">Who may reset a forgotten password by email<select id="policy" ${s.canChange ? '' : 'disabled'}><option value="everyone"${s.passwordReset === 'everyone' ? ' selected' : ''}>Everyone with a password</option><option value="not-admins"${s.passwordReset === 'not-admins' ? ' selected' : ''}>Everyone except those who manage people</option><option value="off"${s.passwordReset === 'off' ? ' selected' : ''}>Nobody: a person who manages people sets a temporary password</option></select></label>
    ${s.reset.ready ? '<div class="callout mt">"Forgot your password?" is working.</div>' : `<div class="callout warn mt">Not available yet: ${s.reset.missing.map(esc).join(' ')}</div>`}
    ${s.canChange ? '' : '<p class="small muted mt">An Admin changes this.</p>'}</div>
    <div class="panel"><h2>How people sign in</h2><dl class="kv"><dt>Passwords</dt><dd>At least 12 characters; locked 15 minutes after 5 wrong ones (unlock from People).</dd><dt>Single sign-on</dt><dd>${s.sso.ready ? `On ("${esc(s.sso.label)}")${s.sso.passwordSignIn === 'admins' ? '; passwords for Admins only' : ''}` : 'Off'}</dd><dt>Idle sign-out</dt><dd>After ${esc(s.idleHours)} hours; never longer than 7 days.</dd><dt>New people</dt><dd>A temporary password, then their own, the terms of use and the quick guide.</dd></dl>
    ${can('security.sso') ? '<a class="btn mt" href="#/admin/sso">Single sign-on settings</a>' : ''}</div></div>`;
  if (s.canChange) $('#policy').onchange = async (e) => {
    try {
      await api('/api/settings/smtp', { method: 'PUT', body: { passwordReset: e.target.value } });
      toast('Saved.', 'ok');
      viewPeople('signin');
    } catch (error) {
      toast(error.message, 'bad');
    }
  };
}

function editPerson(d, u) {
  const roles = d.roles.filter((r) => r.grantable || r.id === u?.role);
  const teams = [...d.teams].sort((a, b) => a.path.localeCompare(b.path));
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form class="form" id="pf"><div class="dh"><h2>${u ? `Edit ${esc(u.name)}` : 'Invite someone'}</h2></div><div class="db form">
    <div class="row"><label class="f">Name<input name="name" required maxlength="120" value="${esc(u?.name ?? '')}" /></label><label class="f">Title<input name="title" maxlength="120" value="${esc(u?.title ?? '')}" placeholder="Sales Engineer" /></label></div>
    ${u ? '' : '<label class="f">Work email<input name="email" type="email" required /></label>'}
    <div class="row"><label class="f">Role<select name="role">${roles.map((r) => `<option value="${esc(r.id)}"${r.id === (u?.role ?? 'se') ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
    <label class="f">Team<select name="team" required>${teams.map((t) => `<option value="${esc(t.id)}"${t.id === u?.teamId ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select></label></div>
    <p class="muted small">${esc(roles.find((r) => r.id === (u?.role ?? 'se'))?.description ?? '')}</p>
    ${u ? '' : `<label class="check"><input type="checkbox" name="welcome" ${d.mail ? 'checked' : 'disabled'} /><span>Email them a welcome<small>${d.mail ? 'Where to sign in, and how to set their password with "Forgot your password?". The one-time password is never emailed.' : 'Set up the email server in Settings to send one.'}</small></span></label>`}
    ${u ? `<div class="flex"><button type="button" class="sm" id="reset">Reset password</button><button type="button" class="sm ${u.active ? 'danger' : ''}" id="active">${u.active ? 'Turn access off' : 'Turn access on'}</button><button type="button" class="sm danger" id="remove">Remove</button></div>` : ''}
    <div class="err" id="perr"></div><div id="secret"></div></div>
    <div class="df"><button type="button" class="ghost" id="close">Close</button><button class="primary" type="submit">${u ? 'Save' : 'Invite'}</button></div></form>`;
  document.body.append(dlg);
  dlg.showModal();
  const done = () => {
    dlg.close();
    dlg.remove();
    viewPeople();
  };
  $('#close', dlg).onclick = () => (dlg.close(), dlg.remove());
  const showSecret = (temporary, email) => {
    $('#secret', dlg).innerHTML = `<div class="callout mt"><b>One-time password for ${esc(email)}</b><p class="small muted">Give it to them in person or over a channel only they read. It is shown once; they choose their own at first sign-in.</p><div class="secret">${esc(temporary)}</div></div>`;
    $('button[type=submit]', dlg).hidden = true;
    $('#close', dlg).onclick = done;
  };
  $('#pf', dlg).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      if (u) {
        await api(`/api/people/${encodeURIComponent(u.id)}`, { method: 'PUT', body: { name: f.get('name'), title: f.get('title'), role: f.get('role'), teamId: f.get('team') } });
        done();
        toast('Saved.', 'ok');
      } else {
        const r = await api('/api/people', { method: 'POST', body: { email: f.get('email'), name: f.get('name'), title: f.get('title'), role: f.get('role'), teamId: f.get('team'), sendWelcome: f.get('welcome') === 'on' } });
        showSecret(r.temporary, r.user.email);
        if (r.welcomed) $('#secret', dlg).insertAdjacentHTML('beforeend', '<p class="small muted mt">A welcome email is on its way to them.</p>');
      }
    } catch (error) {
      $('#perr', dlg).textContent = error.message;
    }
  };
  if (u) {
    $('#reset', dlg).onclick = async () => {
      try {
        const r = await api(`/api/people/${encodeURIComponent(u.id)}/reset`, { method: 'POST', body: {} });
        showSecret(r.temporary, u.email);
      } catch (error) {
        $('#perr', dlg).textContent = error.message;
      }
    };
    $('#active', dlg).onclick = async () => {
      try {
        await api(`/api/people/${encodeURIComponent(u.id)}`, { method: 'PUT', body: { active: !u.active } });
        done();
      } catch (error) {
        $('#perr', dlg).textContent = error.message;
      }
    };
    $('#remove', dlg).onclick = async () => {
      if (!confirm(`Remove ${u.name}? Their accounts and reports stay with their team.`)) return;
      try {
        await api(`/api/people/${encodeURIComponent(u.id)}`, { method: 'DELETE' });
        done();
      } catch (error) {
        $('#perr', dlg).textContent = error.message;
      }
    };
  }
}

// ---- Teams -----------------------------------------------------------------------------------------------
async function viewTeams() {
  shell('teams', loading());
  const d = await peopleList();
  const manage = can('teams.manage');
  const kids = (id) => d.teams.filter((t) => (t.parentId ?? null) === id).sort((a, b) => a.name.localeCompare(b.name));
  const rowsHtml = [];
  const walk = (t, depth) => {
    rowsHtml.push(`<div class="node" data-id="${esc(t.id)}"><div class="t"><span class="indent" data-indent="${depth}"></span>${depth ? '<span class="twig"></span>' : ''}<div><b>${esc(t.name)}</b> <small>${esc(t.region ?? '')}</small><div class="small muted">${t.leaders.length ? `Led by ${esc(t.leaders.map((l) => l.name).join(', '))}` : 'No leader yet'}</div></div></div><span class="m">${num(t.members)} people</span><span class="m"><a href="#/accounts?team=${encodeURIComponent(t.id)}">Accounts</a></span>${manage ? '<button class="sm" data-act="edit">Edit</button>' : '<span></span>'}</div>`);
    for (const k of kids(t.id)) walk(k, depth + 1);
  };
  const ids = new Set(d.teams.map((t) => t.id));
  for (const t of d.teams.filter((x) => !x.parentId || !ids.has(x.parentId)).sort((a, b) => a.name.localeCompare(b.name))) walk(t, 0);
  $('#main').innerHTML = `<div class="head"><div><h1 class="serif">Teams</h1><p>The team structure: everyone in a team works on its accounts together, and a team's leaders see it and every team below it. Executives and Admins see every team.</p></div><div class="tools">${manage ? `<button class="primary" id="add">${icon('plus')}New team</button>` : ''}</div></div>
    <div class="panel"><div class="tree">${rowsHtml.join('') || '<div class="empty"><b>No teams</b></div>'}</div></div>`;
  paint();
  const edit = (t) => {
    const others = d.teams.filter((x) => x.id !== t?.id).sort((a, b) => a.path.localeCompare(b.path));
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form class="form" id="tf"><div class="dh"><h2>${t ? `Edit ${esc(t.name)}` : 'New team'}</h2></div><div class="db form">
      <div class="row"><label class="f">Name<input name="name" required maxlength="80" value="${esc(t?.name ?? '')}" /></label><label class="f">Region<input name="region" maxlength="60" value="${esc(t?.region ?? '')}" placeholder="EMEA, APAC, NA…" /></label></div>
      <label class="f">Sits below<select name="parent"><option value="">Nothing: a top team</option>${others.map((o) => `<option value="${esc(o.id)}"${o.id === t?.parentId ? ' selected' : ''}>${esc(o.path)}</option>`).join('')}</select></label>
      <label class="f">Leaders <span class="muted">(they see this team and every team below it)</span><select name="leaders" multiple size="6">${[...d.people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${esc(p.id)}"${t?.leaderIds?.includes(p.id) ? ' selected' : ''}>${esc(p.name)} · ${esc(p.roleName)}</option>`).join('')}</select></label>
      <div class="err" id="terr"></div></div>
      <div class="df">${t ? '<button type="button" class="danger" id="tdel">Remove team</button><span class="spacer"></span>' : ''}<button type="button" class="ghost" id="tclose">Cancel</button><button class="primary" type="submit">Save</button></div></form>`;
    document.body.append(dlg);
    dlg.showModal();
    const close = () => (dlg.close(), dlg.remove());
    $('#tclose', dlg).onclick = close;
    $('#tf', dlg).onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = { name: f.get('name'), region: f.get('region'), parentId: f.get('parent') || null, leaderIds: f.getAll('leaders') };
      try {
        await api(t ? `/api/teams/${encodeURIComponent(t.id)}` : '/api/teams', { method: t ? 'PUT' : 'POST', body });
        close();
        state.me = await api('/api/me');
        viewTeams();
      } catch (error) {
        $('#terr', dlg).textContent = error.message;
      }
    };
    if (t) $('#tdel', dlg).onclick = async () => {
      try {
        await api(`/api/teams/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
        close();
        state.me = await api('/api/me');
        viewTeams();
      } catch (error) {
        $('#terr', dlg).textContent = error.message;
      }
    };
  };
  if ($('#add')) $('#add').onclick = () => edit(null);
  for (const b of $$('[data-act="edit"]')) b.onclick = () => edit(d.teams.find((t) => t.id === b.closest('[data-id]').dataset.id));
}

// ---- Settings: one tab per area, each only for those whose role allows it (the special ones are Admin-only) -------------
let adminTab = 'general';
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const ADMIN_TABS = [
  ['branding', 'Branding', 'settings.manage'],
  ['general', 'General', 'settings.manage'],
  ['email', 'Email (SMTP)', 'settings.manage'],
  ['sso', 'Single sign-on', 'security.sso'],
  ['https', 'HTTPS', 'security.https'],
  ['updates', 'Updates', 'system.update'],
  ['backups', 'Backups & health', 'backup.manage'],
];
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error(`${file.name} could not be read.`));
    r.readAsDataURL(file);
  });
async function download(path, fallbackName) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The server answered ${res.status}.`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function viewAdmin(tab = adminTab) {
  const tabs = ADMIN_TABS.filter(([, , p]) => can(p));
  if (!tabs.length) return go(home());
  adminTab = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  if (location.hash !== `#/admin/${adminTab}`) history.replaceState(null, '', `#/admin/${adminTab}`);
  shell('admin', `<div class="head"><div><h1 class="serif">Settings</h1><p>Admin settings for the whole command center. Leaders and Sales Engineers do not see them.</p></div><div class="tools"><a class="btn ghost" href="#/about">${esc(state.me.versionLabel ?? '')} · About</a></div></div>
    <nav class="tabs" role="tablist">${tabs.map(([id, label]) => `<a role="tab" href="#/admin/${id}" class="${id === adminTab ? 'on' : ''}" aria-selected="${id === adminTab}">${esc(label)}</a>`).join('')}</nav><div id="tab">${loading()}</div>`);
  try {
    await ADMIN_VIEWS[adminTab]();
  } catch (error) {
    if (error.status !== 401) $('#tab').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
  }
}

const ADMIN_VIEWS = {
  async branding() {
    const [s, b] = await Promise.all([api('/api/settings'), api('/api/branding')]);
    const look = { accent: b.look ?? 'aurora', mode: b.mode ?? 'light' };
    $('#tab').innerHTML = `<div class="saved-banner">✓ Changes save as you type.</div>
      <div class="panel brand-page"><h2>Branding</h2>
      <form class="form" id="bf" autocomplete="off">
        <div class="brand-grid">
          <label class="f">App name<input name="appName" maxlength="40" value="${esc(b.appName)}" /></label>
          <label class="f">Under the name<input name="tagline" maxlength="40" value="${esc(b.tagline ?? '')}" placeholder="Command Center" /></label>
          <label class="f">Company name <small>on every report</small><input name="organisationName" maxlength="120" value="${esc(s.organisationName)}" /></label>
          <label class="f">Accent colour <small>${b.accent ? `<button type="button" class="link" id="accent-reset">the look’s own</button>` : 'the look’s own'}</small><span class="colour"><input type="color" name="accent" value="${esc(b.accent || '#22d3ee')}" /><span id="accent-v">${esc(b.accent || 'From the look')}</span></span></label>
        </div>
        <div class="brand-grid two">
          <div class="f">Company logo <small>https address, or upload one (PNG, JPEG, SVG or WebP, up to 200 KB)</small>
            <div class="img-pick"><span class="img-prev" id="logo-prev">${b.logo ? `<img src="${esc(b.logo)}" alt="" />` : LOGO}</span><input name="logoUrl" type="url" placeholder="https://acme.com/logo.png" /><label class="btn sm">Upload<input type="file" id="logo-file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden /></label>${b.logo ? '<button type="button" class="sm ghost" id="logo-rm">Remove</button>' : ''}</div></div>
          <div class="f">Browser icon <small>https address, or upload one</small>
            <div class="img-pick"><span class="img-prev small" id="icon-prev"><img src="${esc(b.icon ?? '/favicon.svg')}" alt="" /></span><input name="iconUrl" type="url" placeholder="https://acme.com/icon.png" /><label class="btn sm">Upload<input type="file" id="icon-file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden /></label>${b.icon ? '<button type="button" class="sm ghost" id="icon-rm">Remove</button>' : ''}</div></div>
        </div>
        <div class="f">Look of the app <small>Everyone’s look, unless they pick their own under Theme. Every look is kept here to choose from.</small></div>
        <div class="seg" id="b-modes">${['light', 'dark', 'system'].map((m) => `<button type="button" data-m="${m}" class="${look.mode === m ? 'primary' : ''}">${m[0].toUpperCase()}${m.slice(1)}</button>`).join('')}</div>
        <div class="looks" id="b-looks">${THEMES.map(([id, name, note]) => `<button type="button" class="look-card${look.accent === id ? ' on' : ''}" data-a="${id}"><span class="lc-prev lc-${id}"><i class="lc-side"></i><i class="lc-l1"></i><i class="lc-l2"></i><i class="lc-dot"></i></span><b>${esc(name)}</b><small>${esc(note)}</small></button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" name="letChoose" ${b.letChoose !== false ? 'checked' : ''} /><span class="tg"></span><span>Let people choose their own look <small>Off: everyone sees the look chosen here, and Theme is not offered.</small></span></label>
        <label class="f">Menu<select name="menu"><option value="left"${b.menu !== 'top' ? ' selected' : ''}>Down the left side</option><option value="top"${b.menu === 'top' ? ' selected' : ''}>Across the top</option></select></label>
      </form></div>
      <div class="saved-foot" id="bsaved">All changes are saved.</div>`;
    let good = b;
    const say = (text, bad) => {
      $('#bsaved').textContent = text;
      $('#bsaved').classList.toggle('bad', Boolean(bad));
    };
    const save = async (patch) => {
      say('Saving…');
      try {
        const r = await api('/api/settings/branding', { method: 'PUT', body: patch });
        good = r;
        state.branding = r;
        state.me.theme = { mode: r.mode, accent: r.look };
        state.me.branding = r;
        applyMyTheme();
        say(`All changes are saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        return r;
      } catch (error) {
        // Refused: the last good setting stays, and the page shows it again.
        say(`${error.message} The last saved setting is kept.`, true);
        const f = $('#bf');
        f.elements.appName.value = good.appName;
        f.elements.tagline.value = good.tagline ?? '';
        f.elements.menu.value = good.menu;
        f.elements.letChoose.checked = good.letChoose !== false;
        return null;
      }
    };
    const form = $('#bf');
    let timer = null;
    for (const name of ['appName', 'tagline', 'organisationName']) form.elements[name].addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => save({ [name]: form.elements[name].value }), 600);
    });
    form.elements.accent.addEventListener('change', () => {
      $('#accent-v').textContent = form.elements.accent.value;
      save({ accent: form.elements.accent.value });
    });
    $('#accent-reset')?.addEventListener('click', async () => (await save({ accent: '' })) && viewAdmin('branding'));
    form.elements.letChoose.addEventListener('change', () => save({ letChoose: form.elements.letChoose.checked }));
    form.elements.menu.addEventListener('change', () => save({ menu: form.elements.menu.value }));
    form.onsubmit = (e) => e.preventDefault();
    for (const bt of $$('#b-modes [data-m]')) bt.onclick = () => {
      $$('#b-modes [data-m]').forEach((x) => x.classList.toggle('primary', x === bt));
      save({ mode: bt.dataset.m });
    };
    for (const bt of $$('#b-looks [data-a]')) bt.onclick = () => {
      $$('#b-looks [data-a]').forEach((x) => x.classList.toggle('on', x === bt));
      save({ look: bt.dataset.a });
    };
    const image = (key, file, url, rm) => {
      $(file).onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 200 * 1024) return say(`${f.name} is ${Math.round(f.size / 1024)} KB: at most 200 KB.`, true);
        if (await save({ [key]: { upload: await fileToBase64(f) } })) viewAdmin('branding');
      };
      form.elements[url].addEventListener('change', async () => {
        const v = form.elements[url].value.trim();
        if (v && (await save({ [key]: { url: v } }))) viewAdmin('branding');
      });
      if ($(rm)) $(rm).onclick = async () => (await save({ [key]: null })) && viewAdmin('branding');
    };
    image('logo', '#logo-file', 'logoUrl', '#logo-rm');
    image('icon', '#icon-file', 'iconUrl', '#icon-rm');
  },

  async general() {
    const s = await api('/api/settings');
    $('#tab').innerHTML = `<div class="panel"><h2>Hosts &amp; features <small>The name, logo and look are under Branding</small></h2><form class="form" id="sf">
      <label class="check"><input type="checkbox" name="exports" ${s.features?.exports ? 'checked' : ''} /><span>Allow the two Checkmarx One exports in the calculator <span class="chip warn">off by default</span><small>"Total" and "Fixed vulnerabilities by severity" from Checkmarx One → Analytics, dropped in by hand instead of reading the tenant with an API key. When on, the section stays collapsed until opened.</small></span></label>

      <div class="row"><label class="f">Salesforce hosts${s.fromEnvironment.salesforce ? ' (set by SALESFORCE_HOSTS)' : ''}<textarea name="sfh" rows="3" ${s.fromEnvironment.salesforce ? 'disabled' : ''}>${esc(s.effective.salesforce.join('\n'))}</textarea></label>
      <label class="f">Checkmarx One hosts${s.fromEnvironment.cxone ? ' (set by CXONE_ALLOWED_HOSTS)' : ''}<textarea name="cxh" rows="3" ${s.fromEnvironment.cxone ? 'disabled' : ''}>${esc(s.effective.cxone.join('\n'))}</textarea></label>
      <label class="f">Git hosts${s.fromEnvironment.git ? ' (set by GIT_ALLOWED_HOSTS)' : ''}<textarea name="gh" rows="3" ${s.fromEnvironment.git ? 'disabled' : ''}>${esc(s.effective.git.join('\n'))}</textarea></label></div>
      <p class="muted small">A host here also allows every name below it (force.com allows acme.lightning.force.com). Private and link-local addresses are never called, whatever is listed.</p>
      <div class="flex"><span class="small muted" id="ssaved">Saved as you change it.</span><span class="err" id="serr"></span></div></form></div>`;
    // Saved as it changes; a value the server refuses goes back to the last one saved.
    let good = s;
    const save = async () => {
      const f = new FormData($('#sf'));
      const body = { features: { exports: f.get('exports') === 'on' } };
      if (!s.fromEnvironment.salesforce) body.salesforceHosts = f.get('sfh');
      if (!s.fromEnvironment.cxone) body.cxoneHosts = f.get('cxh');
      if (!s.fromEnvironment.git) body.gitHosts = f.get('gh');
      try {
        good = await api('/api/settings', { method: 'PUT', body });
        $('#serr').textContent = '';
        $('#ssaved').textContent = `Saved \u2713 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        return true;
      } catch (error) {
        $('#serr').textContent = `${error.message} Back to what was saved.`;
        const form = $('#sf');
        form.elements.exports.checked = Boolean(good.features?.exports);
        return false;
      }
    };
    let timer = null;
    $('#sf').onsubmit = (e) => e.preventDefault();
    $('#sf').addEventListener('input', (e) => {
      if (e.target.closest('.look-org')) return;
      clearTimeout(timer);
      timer = setTimeout(save, e.target.tagName === 'TEXTAREA' ? 900 : 500);
    });
    $('#sf').addEventListener('change', (e) => {
      if (e.target.closest('.look-org')) return;
      clearTimeout(timer);
      save();
    });
  },

  async email() {
    const m = await api('/api/settings/smtp');
    $('#tab').innerHTML = smtpPanel(m).replace('<div class="panel mt">', '<div class="panel">');
    wireSmtp(m);
  },

  async sso() {
    const x = await api('/api/settings/sso');
    const chip = x.ready ? '<span class="chip ok"><i></i>On</span>' : x.enabled ? '<span class="chip warn"><i></i>On, but PUBLIC_URL is missing</span>' : '<span class="chip"><i></i>Off</span>';
    $('#tab').innerHTML = `<div class="grid g2">
      <div class="panel"><h2>Identity provider (SAML 2.0) ${chip}</h2>
        <form class="form" id="ssof">
          <label class="f">Sign-in URL of the identity provider (SSO URL)<input name="entryPoint" value="${esc(x.entryPoint)}" placeholder="https://login.microsoftonline.com/<tenant>/saml2" /></label>
          <label class="f">Identity provider issuer (entity ID) <span class="muted">optional, checked when given</span><input name="idpIssuer" value="${esc(x.idpIssuer)}" placeholder="https://sts.windows.net/<tenant>/" /></label>
          <label class="f">Signing certificate of the identity provider <span class="muted">PEM or base64; two for a rollover</span><textarea name="idpCert" rows="5" placeholder="${x.certificates.length ? 'Kept: paste to replace' : '-----BEGIN CERTIFICATE-----'}"></textarea></label>
          ${x.certificates.map((c) => `<div class="small muted">${icon('star')} ${esc(c.subject)} · valid until ${esc(date(c.validTo))} · <span class="mono">${esc(c.fingerprint.slice(0, 23))}…</span></div>`).join('')}
          <div class="row"><label class="f">Email attribute<input name="emailAttribute" value="${esc(x.emailAttribute)}" /></label><label class="f">Name attribute<input name="nameAttribute" value="${esc(x.nameAttribute)}" /></label></div>
          <label class="check"><input type="checkbox" name="wantResponseSigned" ${x.wantResponseSigned ? 'checked' : ''} /><span>Require the whole response signed too<small>Assertions must always be signed. Turn this on if your identity provider signs both.</small></span></label>
          <label class="f">Button on the sign-in page<input name="label" maxlength="60" value="${esc(x.label)}" /></label>
          <label class="check"><input type="checkbox" name="jit" ${x.jit ? 'checked' : ''} /><span>Add people on their first sign-in<small>Otherwise only people an Admin invited can sign in. Never as an Admin or anyone who manages people.</small></span></label>
          <div class="row"><label class="f">Their role<select name="jitRole">${x.roles.map((r) => `<option value="${esc(r.id)}"${r.id === x.jitRole ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
          <label class="f">Their team<select name="jitTeamId"><option value="">Choose…</option>${x.teams.map((t) => `<option value="${esc(t.id)}"${t.id === x.jitTeamId ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select></label></div>
          <label class="f">Who may still sign in with a password<select name="passwordSignIn"><option value="everyone"${x.passwordSignIn === 'everyone' ? ' selected' : ''}>Everyone</option><option value="admins"${x.passwordSignIn === 'admins' ? ' selected' : ''}>Admins only (a way in if the identity provider is down)</option></select></label>
          <label class="check"><input type="checkbox" name="enabled" ${x.enabled ? 'checked' : ''} /><span><b>Single sign-on is on</b></span></label>
          <div class="flex"><button class="primary" type="submit">Save</button><span class="err" id="ssoerr"></span></div>
        </form></div>
      <div class="panel"><h2>This service, for the identity provider</h2>
        ${x.sp ? `<dl class="kv"><dt>Entity ID (audience)</dt><dd class="mono">${esc(x.sp.entityId)}</dd><dt>Reply URL (ACS)</dt><dd class="mono">${esc(x.sp.acs)}</dd><dt>Sign-on URL</dt><dd class="mono">${esc(x.sp.login)}</dd><dt>Metadata</dt><dd><a href="/saml/metadata" target="_blank" rel="noopener">${esc(x.sp.metadata)}</a></dd><dt>Name ID</dt><dd class="mono">emailAddress</dd></dl>
        <div class="callout mt">In your identity provider, add an enterprise application (SAML) with the Entity ID and Reply URL above, send the work email as the NameID or the email attribute, and assign the Sales Engineers and leaders. Then paste its SSO URL and signing certificate here.</div>` : '<div class="callout warn">Set <b>PUBLIC_URL</b> to the https address people use, and restart: the identity provider needs it.</div>'}
      </div></div>`;
    $('#ssof').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = { entryPoint: f.get('entryPoint'), idpIssuer: f.get('idpIssuer'), emailAttribute: f.get('emailAttribute'), nameAttribute: f.get('nameAttribute'), wantResponseSigned: f.get('wantResponseSigned') === 'on', label: f.get('label'), jit: f.get('jit') === 'on', jitRole: f.get('jitRole'), jitTeamId: f.get('jitTeamId'), passwordSignIn: f.get('passwordSignIn'), enabled: f.get('enabled') === 'on' };
      if (String(f.get('idpCert') ?? '').trim()) body.idpCert = f.get('idpCert');
      try {
        await api('/api/settings/sso', { method: 'PUT', body });
        toast('Single sign-on saved.', 'ok');
        viewAdmin('sso');
      } catch (error) {
        $('#ssoerr').textContent = error.message;
      }
    };
  },

  async https() {
    const h = await api('/api/https');
    const cert = h.certificate ?? {};
    const sum = cert.summary ?? {};
    const issues = (cert.checks ?? []).filter((c) => c.level === 'error' || c.level === 'warn').map((c) => `${c.title}${c.detail ? `: ${c.detail}` : ''}`);
    const selfSigned = Boolean(sum.selfSigned || /self/i.test(String(cert.source ?? '')));
    const MODE = { http: 'HTTP only', both: 'HTTP and HTTPS', https: 'HTTPS only' };
    const age = (s) => ({ 86400: 'a day', 604800: 'a week', 15768000: 'half a year', 31536000: 'a year' })[s] ?? `${s} s`;
    const acme = h.acme ?? {};
    $('#tab').innerHTML = `<div class="grid g2">
      <div class="panel"><h2>How the server is reached <span class="chip ${h.mode === 'https' ? 'ok' : h.mode === 'both' ? 'warn' : 'bad'}"><i></i>${esc(MODE[h.mode])}</span></h2>
        <p class="muted small">One port answers both: each connection's first byte says whether it is TLS. You are viewing this page over <b>${h.viewing.secure ? 'HTTPS' : 'plain http'}</b>.</p>
        <div class="seg">${['http', 'both', 'https'].map((m) => `<button class="${h.mode === m ? 'primary' : ''}" data-mode="${m}">${esc(MODE[m])}</button>`).join('')}</div>
        ${h.mode !== 'https' ? `<p class="small mt">To switch to HTTPS only, open <a href="${esc(h.viewing.httpsUrl)}/#/admin/https">${esc(h.viewing.httpsUrl)}</a> and switch there: that proves HTTPS works from your browser first.</p>` : ''}
        <h3 class="mt">Hardening</h3>
        <form class="form" id="hard"><div class="row"><label class="f">Lowest TLS version<select name="minVersion">${['TLSv1.2', 'TLSv1.3'].map((v) => `<option${h.minVersion === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f">HSTS for<select name="maxAge">${h.hstsAges.map((a) => `<option value="${a}"${h.hsts.maxAge === a ? ' selected' : ''}>${esc(age(a))}</option>`).join('')}</select></label></div>
        <label class="check"><input type="checkbox" name="hsts" ${h.hsts.enabled ? 'checked' : ''} /><span>HSTS: browsers refuse plain http to this name<small>Only with HTTPS only and a certificate browsers trust.</small></span></label>
        <label class="check"><input type="checkbox" name="sub" ${h.hsts.includeSubDomains ? 'checked' : ''} /><span>Include subdomains</span></label>
        <div class="flex"><button type="submit">Save hardening</button></div></form>
        <div class="err" id="herr"></div></div>
      <div class="panel"><h2>Certificate in use ${h.mode === 'http' || !sum.subject ? '' : selfSigned ? '<span class="chip warn"><i></i>Self-signed: browsers warn</span>' : cert.usable === false ? '<span class="chip bad"><i></i>Not usable</span>' : '<span class="chip ok"><i></i>Trusted</span>'}</h2>
        ${sum.subject ? `<dl class="kv"><dt>For</dt><dd>${esc(sum.subject)}</dd><dt>Names</dt><dd class="mono small">${esc((sum.names ?? []).join(', '))}</dd><dt>Issuer</dt><dd>${esc(sum.issuer ?? '')}</dd><dt>Valid until</dt><dd>${esc(date(sum.validTo))}${sum.daysLeft !== undefined ? ` · ${esc(sum.daysLeft)} days` : ''}</dd><dt>Source</dt><dd>${esc(cert.source ?? (h.uploaded ? 'uploaded here' : h.environmentCertificate ? 'from the server options' : 'self-signed'))}</dd></dl>` : '<p class="muted">No certificate in use (HTTP only).</p>'}
        ${issues.length ? `<div class="callout warn mt">${issues.map((i) => esc(typeof i === 'string' ? i : i.message ?? JSON.stringify(i))).join('<br/>')}</div>` : ''}
        <h3 class="mt">Upload your certificate</h3>
        <form class="form" id="up"><label class="f">Certificate files <span class="muted">PEM (certificate, chain and key, in any files) or one .pfx</span><input type="file" name="files" multiple accept=".pem,.crt,.cer,.key,.pfx,.p12" /></label>
        <label class="f">Key or .pfx passphrase <span class="muted">if any</span><input type="password" name="pass" autocomplete="off" /></label>
        <div class="flex"><button type="button" id="inspect">Check it</button><button class="primary" type="submit">Check and put to use</button>${h.previous ? '<button type="button" class="ghost" id="prev">Put the previous one back</button>' : ''}</div>
        <div id="upres" class="small mt"></div></form>
        <details class="mt"><summary>No certificate yet? Ask IT with a request (CSR), or use a self-signed one</summary>
          <form class="form mt" id="csr"><label class="f">Names it is for<input name="names" value="${esc([...new Set([...(h.selfSignedNames ?? []), h.viewing.host.replace(/:\d+$/, '')])].join(', '))}" /></label><label class="f">Organisation<input name="org" /></label>
          <div class="flex"><button type="submit">Create a request</button>${h.request?.available ? `<button type="button" class="ghost" id="csrdl">${icon('download')}Download the request</button>` : ''}<button type="button" class="ghost" id="ss">Make a self-signed one for these names</button></div></form></details>
      </div>
      <div class="panel"><h2>Free certificate from Let's Encrypt ${acme.issued ? `<span class="chip ok"><i></i>${esc(acme.issued.names?.join(', '))} · renews by itself</span>` : ''}</h2>
        <p class="muted small">For a public name the internet reaches on port 80. Renewed 30 days before it expires.${acme.fromEnvironment ? ` Set by LETSENCRYPT_DOMAIN: ${esc(acme.fromEnvironment)}.` : ''}</p>
        <form class="form" id="le"><div class="row"><label class="f">Names<input name="names" value="${esc((acme.last?.names ?? acme.suggested ?? []).join(', '))}" /></label><label class="f">Email for expiry notices<input name="email" type="email" value="${esc(acme.email ?? '')}" /></label></div>
        <label class="check"><input type="checkbox" name="agree" /><span>I accept the <a href="https://letsencrypt.org/repository/" target="_blank" rel="noopener noreferrer">Let's Encrypt Subscriber Agreement</a></span></label>
        <label class="check"><input type="checkbox" name="staging" /><span>Staging (a test certificate browsers do not trust)</span></label>
        <div class="flex"><button class="primary" type="submit">Get the certificate</button>${acme.issued ? '<button type="button" id="renew">Renew now</button><button type="button" class="ghost" id="leoff">Stop renewing</button>' : ''}</div>
        ${acme.running || acme.last ? `<p class="small mt">${esc(acme.running ? 'Working on it…' : acme.last?.error ? `Last attempt failed: ${acme.last.error}` : acme.last?.at ? `Last attempt ${dateTime(acme.last.at)}` : '')}</p>` : ''}</form></div>
    </div>`;
    const err = (e) => ($('#herr').textContent = e.message);
    for (const b of $$('[data-mode]')) b.onclick = async () => {
      const mode = b.dataset.mode;
      try {
        await api('/api/https/mode', { method: 'POST', body: { mode } });
      } catch (error) {
        if (/Confirm/.test(error.message) && confirm(error.message)) await api('/api/https/mode', { method: 'POST', body: { mode, confirm: true } }).catch(err);
        else return err(error);
      }
      toast(`Now ${MODE[mode]}.`, 'ok');
      viewAdmin('https');
    };
    $('#hard').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/api/https/hardening', { method: 'POST', body: { minVersion: f.get('minVersion'), hsts: { enabled: f.get('hsts') === 'on', includeSubDomains: f.get('sub') === 'on', maxAge: Number(f.get('maxAge')) } } });
        toast('Saved.', 'ok');
        viewAdmin('https');
      } catch (error) {
        err(error);
      }
    };
    const files = async () => Promise.all([...$('#up input[type=file]').files].map(async (file) => ({ name: file.name, data: await fileToBase64(file) })));
    const report = (r) => {
      const s2 = r.summary ?? {};
      const probs = (r.checks ?? []).filter((c) => c.level === 'error' || c.level === 'warn').map((c) => `${c.title}${c.detail ? `: ${c.detail}` : ''}`);
      $('#upres').innerHTML = `${s2.subject ? `<b>${esc(s2.subject)}</b> · valid until ${esc(date(s2.validTo))} · ${esc((s2.names ?? []).join(', '))}` : ''}${probs.length ? `<div class="callout warn mt">${probs.map(esc).join('<br/>')}</div>` : '<div class="ok-t">Checked like a browser would: it works.</div>'}`;
    };
    $('#inspect').onclick = async () => {
      try {
        report(await api('/api/https/inspect', { method: 'POST', body: { files: await files(), passphrase: $('#up [name=pass]').value } }));
      } catch (error) {
        $('#upres').textContent = error.message;
      }
    };
    $('#up').onsubmit = async (e) => {
      e.preventDefault();
      const body = { files: await files(), passphrase: $('#up [name=pass]').value };
      try {
        await api('/api/https/certificate', { method: 'POST', body });
      } catch (error) {
        if (/Confirm|confirm/.test(error.message) && confirm(error.message)) {
          await api('/api/https/certificate', { method: 'POST', body: { ...body, confirm: true } }).catch((x) => ($('#upres').textContent = x.message));
        } else return ($('#upres').textContent = error.message);
      }
      toast('Certificate in use.', 'ok');
      viewAdmin('https');
    };
    if ($('#prev')) $('#prev').onclick = async () => {
      await api('/api/https/certificate/previous', { method: 'POST', body: {} }).catch(err);
      viewAdmin('https');
    };
    const names = (form) => String(new FormData(form).get('names') ?? '').split(/[\s,]+/).filter(Boolean);
    $('#csr').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/https/request', { method: 'POST', body: { names: names(e.target), organization: new FormData(e.target).get('org') } });
        await download('/api/https/request.csr', 'command-center.csr');
        viewAdmin('https');
      } catch (error) {
        err(error);
      }
    };
    if ($('#csrdl')) $('#csrdl').onclick = () => download('/api/https/request.csr', 'command-center.csr').catch(err);
    $('#ss').onclick = async () => {
      try {
        await api('/api/https/self-signed', { method: 'POST', body: { names: names($('#csr')) } });
        toast('Self-signed certificate made.', 'ok');
        viewAdmin('https');
      } catch (error) {
        err(error);
      }
    };
    $('#le').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/api/https/acme', { method: 'POST', body: { names: names(e.target), email: f.get('email'), agree: f.get('agree') === 'on', staging: f.get('staging') === 'on' } });
        toast('Asking Let’s Encrypt: this takes under a minute.', 'ok');
        setTimeout(() => adminTab === 'https' && viewAdmin('https'), 4000);
      } catch (error) {
        err(error);
      }
    };
    if ($('#renew')) $('#renew').onclick = () => api('/api/https/acme/renew', { method: 'POST', body: {} }).then(() => toast('Renewing.', 'ok'), err);
    if ($('#leoff')) $('#leoff').onclick = () => api('/api/https/acme', { method: 'DELETE' }).then(() => viewAdmin('https'), err);
  },

  async updates() {
    const u = await api('/api/updates');
    const ev = { installed: 'Installed', 'install-failed': 'Install refused', switch: 'Switched', 'rolled-back': 'Rolled back', started: 'Started', refused: 'Not started', auto: 'Auto-update', trusted: 'Checksum kept', 'checksum-changed': 'Checksum changed: refused', 'changed-on-disk': 'Changed on disk' };
    const integ = await api('/api/integrity').catch(() => ({ state: 'checking', summary: '' }));
    const label = (v) => `CC-${String(v).split('.').map((n) => n.padStart(2, '0')).join('.')}`;
    const newest = u.releases.find((r) => !r.prerelease && r.installable && !r.tampered);
    const avail = u.releases.find((r) => !r.prerelease && r.installable && !r.tampered && !r.failed && cmpVer(r.version, u.running) > 0);
    const lastSwitch = (u.events ?? []).find((e) => e.type === 'switch' && e.to === u.running);
    const INTEG = { genuine: ['ok', 'Genuine'], unconfirmed: ['warn', 'Not confirmed yet'], unsigned: ['', 'Built from the source'], tampered: ['bad', 'Changed'], 'not-genuine': ['bad', 'Not genuine'], checking: ['', 'Checking…'] };
    const [ic, il] = INTEG[integ.state] ?? ['', integ.state];
    const o = integ.origin?.ok ? integ.origin : null;
    $('#tab').innerHTML = `<div class="saved-banner">✓ Changes save as you type.</div>
      <div class="panel"><h2>Update &amp; recovery</h2>
        <div class="ur-cards">
          <div class="ur-card"><small>Running</small><b>${esc(label(u.running))}</b><span>${u.source === 'built-in' ? 'Built into this server' : 'Installed from a release'}</span>${lastSwitch ? `<span class="faint">Switched to it ${esc(dateTime(lastSwitch.at))}${lastSwitch.by ? ` · ${esc(lastSwitch.by)}` : ''}</span>` : ''}</div>
          <div class="ur-card"><small>Latest published</small><b>${newest ? esc(label(newest.version)) : '—'}</b><span>${avail ? `${esc(label(avail.version))} is ready.` : 'Up to date.'} ${u.lastCheck?.at ? `Checked ${esc(dateTime(u.lastCheck.at))}` : 'Not checked yet'}</span>${avail ? `<button class="sm primary mt" data-update-now="${esc(avail.version)}">Update now</button>` : ''}${u.lastCheck?.error && u.lastCheck.failedAt > (u.lastCheck.at ?? '') ? `<span class="bad-t">Last try: ${esc(u.lastCheck.error)}</span>` : ''}</div>
          <div class="ur-card"><small>Auto-update</small><b class="ok-t">Always on the newest</b>
            <form id="auto" class="inline-num">Check every <input type="number" name="everyMinutes" min="5" max="1440" step="1" value="${esc(u.checkEveryMinutes ?? 15)}" /> minutes</form>
            <span class="faint" id="auto-saved">Installed without a restart; a version that fails to start is rolled back and never installed again by itself.</span></div>
        </div>
        <div class="integ"><div class="integ-h"><b>Software integrity</b><span class="chip ${ic}"><i></i>${esc(il)}</span><span class="spacer"></span><button class="sm" id="integ-check">Check now</button></div>
          <p>${esc(integ.summary ?? '')}</p>
          ${integ.digest ? `<dl class="kv">
            <dt>Version</dt><dd>${esc(integ.version ? label(integ.version) : '—')}</dd>
            ${o ? `<dt>Built from</dt><dd><a href="https://github.com/${esc(o.repository)}/commit/${esc(o.commit)}" target="_blank" rel="noopener noreferrer">${esc(o.repository)} · ${esc(o.ref.replace(/^refs\/(heads|tags)\//, ''))} · ${esc(o.commit.slice(0, 12))}</a></dd>
            <dt>Workflow run</dt><dd>${/^https:\/\/github\.com\//.test(o.run ?? '') ? `<a href="${esc(o.run)}" target="_blank" rel="noopener noreferrer">${esc(o.run.replace('https://github.com/', ''))}</a>` : esc(o.run ?? '')}</dd>
            <dt>Signed</dt><dd>${esc(dateTime(o.signedAt))}${Number.isFinite(o.logIndex) ? ` · <a href="https://search.sigstore.dev/?logIndex=${esc(o.logIndex)}" target="_blank" rel="noopener noreferrer">Sigstore log entry ${esc(o.logIndex)}</a>` : ''}</dd>` : ''}
            <dt>Files</dt><dd>${num(integ.files?.checked)} checked${integ.files && !integ.files.ok ? ` · ${num(integ.files.counts.changed)} changed, ${num(integ.files.counts.missing)} missing, ${num(integ.files.counts.extra)} added` : ''}</dd>
            <dt>File list SHA-256</dt><dd class="mono small">${esc(integ.digest)}</dd>
            <dt>Checked</dt><dd>${esc(dateTime(integ.at))}</dd></dl>` : ''}
          ${integ.files && !integ.files.ok ? `<p class="small bad-t">${esc([...integ.files.changed.map((f) => `changed ${f}`), ...integ.files.missing.map((f) => `missing ${f}`), ...integ.files.extra.map((f) => `added ${f}`)].slice(0, 8).join(' · '))}</p>` : ''}
        </div>
        ${u.supervised ? '' : '<div class="callout warn mt">Not started by the launcher (<code>npm start</code> / the container’s command), so versions can be installed but not switched to from here.</div>'}
        <div class="flex mt"><button class="primary" id="chk">Check for updates</button>${u.supervised ? '<button id="restart">Reload the server</button>' : ''}<button id="diag2">${icon('download')}Download troubleshooting report</button></div>
      </div>
      <div class="grid g2 mt">
      <div class="panel wide-panel"><h2>Versions <small>each with the checksum kept the first time it was seen: update or roll back from here</small></h2>
        ${(() => {
          const rel = new Map(u.releases.map((r) => [r.version, r]));
          const trusted = new Map((u.trusted ?? []).map((t) => [t.version, t]));
          const inst = new Map(u.installed.map((i) => [i.version, i]));
          const all = [...new Set([...trusted.keys(), ...inst.keys(), ...rel.keys(), u.builtIn, u.running])].sort((x, y) => cmpVer(y, x));
          if (!all.length) return '<div class="empty"><b>No versions yet</b>Check for updates.</div>';
          return `<div class="tw"><table class="versions"><thead><tr><th>Version</th><th>SHA-256 (kept)</th><th>First seen</th><th>State</th><th></th></tr></thead><tbody>${all.map((v) => {
            const r = rel.get(v);
            const t = trusted.get(v);
            const i = inst.get(v);
            const builtIn = v === u.builtIn;
            const running = v === u.running;
            const failed = (u.failed ?? []).includes(v);
            const tampered = t?.tampered || r?.tampered;
            const can = builtIn || i?.verified || (r?.installable && !tampered);
            const act = builtIn ? 'builtin' : i?.verified ? 'switch' : 'installswitch';
            const newer = cmpVer(v, u.running) > 0;
            const state = [running ? '<span class="chip ok"><i></i>Running</span>' : '', builtIn ? '<span class="chip"><i></i>Built in</span>' : '', i ? `<span class="chip ${i.verified ? '' : 'bad'}"><i></i>${i.verified ? 'Installed · files verified' : 'Files changed: will not start'}</span>` : '', failed ? '<span class="chip bad"><i></i>Failed to start</span>' : '', tampered ? '<span class="chip bad"><i></i>Checksum changed: refused</span>' : '', r?.prerelease ? '<span class="chip warn"><i></i>Pre-release</span>' : '', t && !tampered ? '<span class="chip ok"><i></i>Trusted</span>' : ''].join('');
            const action = running ? '' : !can ? `<span class="muted small">${tampered ? 'not trusted' : 'not available'}</span>` : newer ? `<button class="sm primary" data-act="${act}">Update now</button>` : `<button class="sm" data-act="${act}" data-rollback="1">Roll back to this</button>`;
            const notes = r?.notes ? `<details class="rel-notes"><summary>${md((r.notes.split('\n').find((l) => l.trim().startsWith('-')) ?? '').replace(/^\s*[-*]\s*/, '').split(/(?<=[.!?])\s/)[0]).replace(/^<p>|<\/p>$/g, '')}</summary><div class="md">${md(r.notes.replace(/^## .*\n/, ''))}</div></details>` : '';
            return `<tr data-v="${esc(v)}"><td><b>${esc(v)}</b>${r?.publishedAt ? `<span class="sub">published ${esc(date(r.publishedAt))}</span>` : ''}${notes}</td><td>${t ? `<code class="small" title="${esc(t.sha256)}">${esc(t.sha256.slice(0, 12))}…${esc(t.sha256.slice(-6))}</code>` : '<span class="muted small">—</span>'}</td><td class="small">${t ? esc(dateTime(t.firstSeen)) : ''}</td><td>${state}</td><td class="actions">${action}</td></tr>`;
          }).join('')}</tbody></table></div>`;
        })()}
        <p class="muted small mt">Always on the newest version: a newer release is installed and switched to by itself. <b>Roll back to this</b> moves to an older one (a backup is taken first, and there is no restart); the version you left is then not put back by itself until a newer release comes.</p></div>
      <div class="panel"><h2>Recent events</h2>${u.events.length ? `<div class="tw"><table><tbody>${u.events.map((e) => `<tr><td class="small">${esc(dateTime(e.at))}</td><td><span class="chip ${/fail|refused|rolled|changed/.test(e.type) ? 'bad' : 'ok'}"><i></i>${esc(ev[e.type] ?? e.type)}</span></td><td class="small">${esc([e.version, e.from && `from ${e.from}`, e.to && `to ${e.to}`, e.why || e.error || e.reason, e.by && `by ${e.by}`].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing yet.</p>'}</div>
    </div>`;
    const busy = (b, text) => {
      b.disabled = true;
      b.innerHTML = `<span class="spinner"></span>${esc(text)}`;
    };
    $('#integ-check').onclick = async (e) => {
      busy(e.target, 'Checking…');
      try {
        await api('/api/integrity/check', { method: 'POST', body: {} });
      } catch (error) {
        toast(error.message, 'bad');
      }
      viewAdmin('updates');
    };
    $('#diag2').onclick = () => download('/api/system/diagnostics', 'cc-troubleshooting.json').catch((x) => toast(x.message, 'bad'));
    $('#chk').onclick = async (e) => {
      busy(e.target, 'Checking…');
      try {
        const r = await api('/api/updates/check', { method: 'POST', body: {} });
        if (r.switching) return waitForRestart(r.to);
        if (r.installError) toast(r.installError, 'bad');
      } catch (error) {
        toast(error.message, 'bad');
      }
      viewAdmin('updates');
    };
    const waitForRestart = async (to) => {
      shell('admin', `<div class="loading"><div class="orbit"><i></i><i></i><i></i></div><b>Switching to ${esc(to)}…</b><span class="muted">A backup was taken. The new version loads beside this one and takes over without a restart: nobody is signed out and nothing is lost.</span></div>`);
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const h = await fetch('/healthz', { cache: 'no-store' }).then((r) => r.json());
          if (h.version === to || i > 5) return location.reload();
        } catch {}
      }
      location.reload();
    };
    for (const b of $$('[data-update-now]')) b.onclick = async () => {
      busy(b, 'Updating…');
      try {
        const row = u.releases.find((r) => r.version === b.dataset.updateNow);
        if (row?.installed) await api('/api/updates/switch', { method: 'POST', body: { version: row.version } });
        else await api('/api/updates/install', { method: 'POST', body: { version: b.dataset.updateNow, switch: true } });
        return waitForRestart(b.dataset.updateNow);
      } catch (error) {
        toast(error.message, 'bad');
        viewAdmin('updates');
      }
    };
    for (const b of $$('[data-act]')) b.onclick = async () => {
      const v = b.closest('tr').dataset.v;
      if (b.dataset.rollback && !confirm(`Roll back to ${v}? A backup is taken first, and it takes over without a restart. Going back to an older version can leave newer data it does not know.`)) return;
      if (b.dataset.act === 'builtin') {
        busy(b, 'Switching…');
        try {
          await api('/api/updates/switch', { method: 'POST', body: { version: 'built-in', reason: b.dataset.rollback ? 'rollback' : 'by hand' } });
          return waitForRestart(v);
        } catch (error) {
          toast(error.message, 'bad');
          return viewAdmin('updates');
        }
      }
      busy(b, b.dataset.act === 'switch' ? 'Switching…' : 'Installing…');
      try {
        if (b.dataset.act === 'switch') await api('/api/updates/switch', { method: 'POST', body: { version: v, ...(b.dataset.rollback ? { reason: 'rollback' } : {}) } });
        else await api('/api/updates/install', { method: 'POST', body: { version: v, switch: b.dataset.act === 'installswitch', rollback: Boolean(b.dataset.rollback) } });
        if (b.dataset.act !== 'install') return waitForRestart(v);
        toast(`${v} installed and verified.`, 'ok');
      } catch (error) {
        toast(error.message, 'bad');
      }
      viewAdmin('updates');
    };
    for (const b of $$('[data-roll]')) b.onclick = async () => {
      if (!confirm(`Switch to ${b.dataset.roll}? A backup is taken first. Going back to an older version can leave newer data it does not know.`)) return;
      try {
        const r = await api('/api/updates/switch', { method: 'POST', body: { version: b.dataset.roll, reason: 'rollback' } });
        waitForRestart(r.to);
      } catch (error) {
        toast(error.message, 'bad');
      }
    };
    // Auto-update saves as it is changed.
    $('#auto').onsubmit = (e) => e.preventDefault();
    $('#auto').onchange = async () => {
      const f = new FormData($('#auto'));
      try {
        const r = await api('/api/updates/auto', { method: 'PUT', body: { everyMinutes: Number(f.get('everyMinutes')) } });
        $('#auto-saved').textContent = `Saved \u2713 · every ${r.auto?.everyMinutes ?? f.get('everyMinutes')} minutes`;
      } catch (x) {
        toast(x.message, 'bad');
        viewAdmin('updates');
      }
    };
    if ($('#restart')) $('#restart').onclick = async () => {
      if (!confirm('Reload the server? It loads again beside the running one and takes over without a restart: nobody is signed out.')) return;
      await api('/api/system/restart', { method: 'POST', body: {} });
      waitForRestart(u.running);
    };
  },

  async backups() {
    const [b, v] = await Promise.all([api('/api/backups'), can('audit.view') ? api('/api/audit/verify') : null]);
    $('#tab').innerHTML = `<div class="grid g2">
      <div class="panel"><h2>Backups <small>nightly, before every version switch, and by hand · the newest 14 kept</small></h2>
        <p class="muted small">Everything: people, teams, accounts, reports, settings, certificates and the audit log. ${b.sealed ? 'Sealed with BACKUP_PASSPHRASE.' : 'Not sealed: set BACKUP_PASSPHRASE to seal them with a passphrase.'} Kept in <span class="mono">${esc(b.dir)}</span>.</p>
        ${b.separate ? '<div class="callout">Backups go to their own place (BACKUP_DIR), away from the data: losing one disk does not lose both.</div>' : '<div class="callout warn">Backups are in the data volume itself. Mount a second volume or a network share and set <b>BACKUP_DIR</b> to it, so losing one disk does not lose both.</div>'}
        ${b.last && !b.last.ok ? `<div class="callout warn mt">The last backup failed (${esc(dateTime(b.last.at))}): ${esc(b.last.error)}</div>` : ''}
        <div class="flex"><button class="primary" id="now">${icon('plus')}Back up now</button></div>
        <div class="tw mt"><table><tbody>${b.backups.map((x) => `<tr><td class="small mono">${esc(x.name)}</td><td class="small">${esc(dateTime(x.at))}</td><td class="num small">${esc((x.bytes / 1024).toFixed(0))} KB</td><td class="actions"><button class="sm ghost" data-dl="${esc(x.name)}">${icon('download')}Download</button></td></tr>`).join('') || '<tr><td><div class="empty"><b>No backups yet</b></div></td></tr>'}</tbody></table></div>
        <h3 class="mt">Restore</h3>
        <form class="form" id="rs"><label class="f">A backup file<input type="file" name="file" accept=".ccbackup" /></label><label class="f">Its passphrase <span class="muted">if sealed</span><input type="password" name="pass" autocomplete="off" /></label><div class="flex"><button type="submit" class="danger">Check and restore</button></div><div class="small" id="rsres"></div></form></div>
      <div class="panel"><h2>Health</h2>
        ${v ? `<p>${v.ok ? `<span class="chip ok"><i></i>Audit log intact</span> ${esc(v.events)} events, each chained to the one before.` : `<span class="chip bad"><i></i>Audit log broken</span> at event ${esc(v.brokenAt)}: ${esc(v.why)}.`}</p>` : ''}
        ${b.recovered?.length ? `<h3>Repaired at start</h3><ul class="small">${b.recovered.map((e) => `<li>${esc(dateTime(e.at))}: <span class="mono">${esc(e.target)}</span> ${e.action === 'recover.restored' ? `could not be read and was restored from ${esc(e.details.backup)}` : 'could not be read, was in no backup, and was set aside'} (the damaged file is kept as ${esc(e.details.kept)})</li>`).join('')}</ul>` : '<p class="small muted">Every data file is checked at start; one that cannot be read is restored from the newest backup that has it. Nothing needed repairing.</p>'}
        <p class="muted small">The troubleshooting report has versions, health, settings in force, update events, backups and recent errors, and no secrets, keys or customer data.</p>
        <div class="flex"><button id="diag">${icon('download')}Download troubleshooting report</button>${can('audit.view') ? `<a class="btn ghost" href="/api/audit/export.csv" download>${icon('download')}Audit log (CSV)</a>` : ''}</div></div>
    </div>`;
    $('#now').onclick = async () => {
      await api('/api/backups', { method: 'POST', body: {} }).then(() => toast('Backed up.', 'ok'), (x) => toast(x.message, 'bad'));
      viewAdmin('backups');
    };
    for (const btn of $$('[data-dl]')) btn.onclick = () => download(`/api/backups/${encodeURIComponent(btn.dataset.dl)}`, btn.dataset.dl).catch((x) => toast(x.message, 'bad'));
    $('#diag').onclick = () => download('/api/system/diagnostics', 'cc-troubleshooting.json').catch((x) => toast(x.message, 'bad'));
    $('#rs').onsubmit = async (e) => {
      e.preventDefault();
      const file = e.target.file.files[0];
      if (!file) return ($('#rsres').textContent = 'Choose a backup file.');
      const body = { data: await fileToBase64(file), passphrase: e.target.pass.value };
      try {
        const info = await api('/api/backups/inspect', { method: 'POST', body });
        if (!confirm(`Restore the backup of ${dateTime(info.at)} (${info.files} files: ${info.accounts} accounts, ${info.reports} reports)?\n\nEverything here is replaced. A backup of what is here now is taken first.`)) return;
        const r = await api('/api/backups/restore', { method: 'POST', body: { ...body, confirm: true } });
        $('#rsres').textContent = r.restarting ? 'Restored. The command center is loading it, without a restart…' : 'Restored. Restart the server to read it.';
        if (r.restarting) setTimeout(() => location.reload(), 6000);
      } catch (error) {
        $('#rsres').textContent = error.message;
      }
    };
  },

  async roles() {
    const d = await peopleList();
    const groups = [...new Set(d.permissions.map((p) => p.group))];
    $('#tab').innerHTML = `<div class="panel"><h2>Roles <small>nobody can give permissions they do not hold · the special ones stay with Admins</small><button class="sm" id="newrole">${icon('plus')}New role</button></h2>
      <div class="tw"><table><thead><tr><th>Role</th><th>Permissions</th><th></th></tr></thead><tbody>${d.roles.map((r) => `<tr data-id="${esc(r.id)}"><td><b>${esc(r.name)}</b><span class="sub">${esc(r.description)}</span></td><td class="small">${r.permissions.map((p) => esc(d.permissions.find((x) => x.id === p)?.label ?? p)).join(' · ')}</td><td class="actions">${r.locked ? '<span class="chip">Locked</span>' : '<button class="sm" data-act="role">Edit</button>'}</td></tr>`).join('')}</tbody></table></div></div>`;
    const editRole = (r) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form class="form" id="rf"><div class="dh"><h2>${r ? `Edit ${esc(r.name)}` : 'New role'}</h2></div><div class="db form">
        <div class="row"><label class="f">Name<input name="name" required maxlength="60" value="${esc(r?.name ?? '')}" /></label><label class="f">Description<input name="desc" maxlength="300" value="${esc(r?.description ?? '')}" /></label></div>
        ${groups.map((g) => `<div><div class="muted small">${esc(g)}</div><div class="checks">${d.permissions.filter((p) => p.group === g).map((p) => `<label class="check"><input type="checkbox" name="p" value="${esc(p.id)}" ${r?.permissions.includes(p.id) ? 'checked' : ''} ${can(p.id) && !p.special ? '' : 'disabled'} /><span>${esc(p.label)}${p.special ? ' <span class="chip">Admin only</span>' : ''}<small>${esc(p.description)}</small></span></label>`).join('')}</div></div>`).join('')}
        <div class="err" id="rerr"></div></div><div class="df">${r && !r.builtin ? '<button type="button" class="danger" id="rdel">Remove</button><span class="spacer"></span>' : ''}<button type="button" class="ghost" id="rclose">Cancel</button><button class="primary" type="submit">Save</button></div></form>`;
      document.body.append(dlg);
      dlg.showModal();
      const close = () => (dlg.close(), dlg.remove());
      $('#rclose', dlg).onclick = close;
      $('#rf', dlg).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api(`/api/roles/${encodeURIComponent(r?.id ?? 'new')}`, { method: 'PUT', body: { name: f.get('name'), description: f.get('desc'), permissions: f.getAll('p') } });
          close();
          viewAdmin('roles');
        } catch (error) {
          $('#rerr', dlg).textContent = error.message;
        }
      };
      if ($('#rdel', dlg)) $('#rdel', dlg).onclick = async () => {
        try {
          await api(`/api/roles/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
          close();
          viewAdmin('roles');
        } catch (error) {
          $('#rerr', dlg).textContent = error.message;
        }
      };
    };
    $('#newrole').onclick = () => editRole(null);
    for (const b of $$('[data-act="role"]')) b.onclick = () => editRole(d.roles.find((x) => x.id === b.closest('tr').dataset.id));
  },
};

// ---- Email server (SMTP), as CxMissionZero sets it up ---------------------------------------------------------------
function smtpPanel(m) {
  const x = m.smtp;
  const status = m.verified ? `<span class="chip ok"><i></i>Tested ${esc(dateTime(m.verifiedAt))}</span>` : x.host ? '<span class="chip warn"><i></i>Not tested: nothing is sent until it is</span>' : '<span class="chip"><i></i>Not set up</span>';
  return `<div class="panel mt"><h2>Email server (SMTP) ${status}</h2>
    <p class="muted small">Used for "Forgot your password?" links and welcome emails. Nothing is sent until <b>Test connection</b> succeeds for exactly the settings saved. The password is kept encrypted and never shown again.</p>
    <form class="form" id="smtp">
      <div class="row"><label class="f">Mail server<input name="host" value="${esc(x.host)}" placeholder="smtp.office365.com" autocomplete="off" /></label><label class="f">Port<input name="port" type="number" min="1" max="65535" value="${esc(x.port)}" /></label></div>
      <div class="row"><label class="check"><input type="checkbox" name="secure" ${x.secure ? 'checked' : ''} /><span>Implicit TLS<small>On for port 465. Off for 587 and 25, where STARTTLS is required whenever a password is sent.</small></span></label>
      <label class="check"><input type="checkbox" name="rejectUnauthorized" ${x.rejectUnauthorized !== false ? 'checked' : ''} /><span>Check the mail server's certificate<small>Leave on. For a private CA, set NODE_EXTRA_CA_CERTS on the server instead.</small></span></label></div>
      <label class="check"><input type="checkbox" name="requireAuth" ${x.requireAuth ? 'checked' : ''} /><span>The server needs a sign-in</span></label>
      <div class="row"><label class="f">User name<input name="user" value="${esc(x.user)}" autocomplete="off" /></label><label class="f">Password<input name="password" type="password" autocomplete="new-password" placeholder="${x.passwordSet ? 'Kept: type to replace' : ''}" /></label></div>
      <div class="row"><label class="f">From name<input name="fromName" value="${esc(x.fromName)}" /></label><label class="f">From address<input name="fromAddress" type="email" value="${esc(x.fromAddress)}" placeholder="Same as the user name" /></label></div>
      <div class="row"><label class="f">Who may reset a forgotten password by email<select name="passwordReset"><option value="everyone"${m.passwordReset === 'everyone' ? ' selected' : ''}>Everyone</option><option value="not-admins"${m.passwordReset === 'not-admins' ? ' selected' : ''}>Everyone but those who manage people</option><option value="off"${m.passwordReset === 'off' ? ' selected' : ''}>Nobody: Admins reset passwords</option></select></label>
      <label class="f">Links in emails point at<input value="${esc(m.publicUrl || 'PUBLIC_URL is not set')}" disabled /></label></div>
      ${m.reset.ready ? '<div class="callout">"Forgot your password?" is working.</div>' : `<div class="callout warn">"Forgot your password?" is not available yet: ${m.reset.missing.map(esc).join(' ')}</div>`}
      <div class="flex"><button class="primary" type="submit">Save</button><button type="button" id="smtp-test">Test connection</button><input id="smtp-to" type="email" placeholder="Send a test to (you by default)" class="grow" /><button type="button" id="smtp-send">Send test email</button></div>
      <div class="small" id="smtp-msg" aria-live="polite"></div>
    </form></div>`;
}
function wireSmtp() {
  const form = $('#smtp');
  const msg = (text, ok) => {
    $('#smtp-msg').textContent = text;
    $('#smtp-msg').className = `small ${ok ? 'ok-t' : 'err'}`;
  };
  /** What the form says, saved: Test connection and Send test email always try exactly that. */
  const save = async () => {
    const f = new FormData(form);
    const smtp = { host: f.get('host'), port: Number(f.get('port')), secure: f.get('secure') === 'on', requireAuth: f.get('requireAuth') === 'on', rejectUnauthorized: f.get('rejectUnauthorized') === 'on', user: f.get('user'), fromName: f.get('fromName'), fromAddress: f.get('fromAddress') };
    if (f.get('password')) smtp.password = f.get('password');
    await api('/api/settings/smtp', { method: 'PUT', body: { smtp, passwordReset: f.get('passwordReset') } });
  };
  // Implicit TLS goes with port 465; 587 and 25 use STARTTLS.
  form.elements.port.addEventListener('change', () => {
    const port = Number(form.elements.port.value);
    if (port === 465) form.elements.secure.checked = true;
    if (port === 587 || port === 25) form.elements.secure.checked = false;
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await save();
      toast('Saved. Now Test connection: nothing is sent until it succeeds.', 'ok');
      viewAdmin('email');
    } catch (error) {
      msg(error.message);
    }
  };
  $('#smtp-test').onclick = async () => {
    msg('Saving and testing…', true);
    try {
      await save();
      const r = await api('/api/settings/smtp/test', { method: 'POST', body: {} });
      toast(r.message, 'ok');
      viewAdmin('email');
    } catch (error) {
      msg(error.message);
    }
  };
  $('#smtp-send').onclick = async () => {
    msg('Sending…', true);
    try {
      msg((await api('/api/settings/smtp/send-test', { method: 'POST', body: { to: $('#smtp-to').value } })).message, true);
    } catch (error) {
      msg(error.message);
    }
  };
}

// ---- Audit ------------------------------------------------------------------------------------------------------
const AUDIT_GROUPS = { auth: 'Sign-in', user: 'People', people: 'People', team: 'Teams', teams: 'Teams', role: 'Roles', roles: 'Roles', account: 'Accounts', accounts: 'Accounts', report: 'Reports', reports: 'Reports', sale: 'Credits sold', cxone: 'Checkmarx One', git: 'Git', calculator: 'Calculator', settings: 'Settings', https: 'HTTPS', sso: 'Single sign-on', updates: 'Updates', backup: 'Backups', backups: 'Backups', audit: 'Audit log', system: 'System', export: 'Exports', terms: 'Terms', me: 'Own settings', setup: 'Setup', dashboard: 'Dashboard' };
const AUDIT_NAMES = {
  'auth.signin': 'Signed in', 'auth.signout': 'Signed out', 'auth.failed': 'Sign-in failed', 'auth.password': 'Changed their password', 'auth.password.refused': 'Password change refused', 'auth.reset.sent': 'Password reset email sent', 'auth.reset.done': 'Reset their password by email', 'auth.reset.failed': 'Password reset failed', 'auth.reset.refused': 'Password reset refused', 'auth.sso.signin': 'Signed in with SSO', 'auth.sso.refused': 'SSO sign-in refused',
  'user.create': 'Added a person', 'user.create.sso': 'Added by SSO sign-in', 'user.update': 'Changed a person', 'user.remove': 'Removed a person', 'user.reset': 'Reset a password', 'user.unlock': 'Unlocked a person', 'user.signout': 'Signed a person out everywhere', 'user.welcome': 'Sent a welcome email', 'user.import': 'Imported people and teams',
  'team.create': 'Created a team', 'team.update': 'Changed a team', 'team.remove': 'Removed a team', 'role.save': 'Saved a role', 'role.remove': 'Removed a role',
  'account.create': 'Created an account', 'account.update': 'Changed an account', 'account.delete': 'Deleted an account', 'report.create': 'Generated a report', 'report.delete': 'Deleted a report', 'report.open': 'Opened a report', 'sale.record': 'Recorded credits sold', 'sale.remove': 'Removed a sale',
  'cxone.connect': 'Connected to Checkmarx One', 'cxone.key.saved': 'Kept a Checkmarx One key', 'cxone.key.used': 'Refreshed with the kept key', 'cxone.key.forgotten': 'Forgot the kept key', 'cxone.key.failed': 'Kept key refused', 'cxone.read.resumed': 'Read resumed after a reload', 'cxone.read.interrupted': 'Read cut off', 'git.count': 'Counted code from git',
  'settings.update': 'Changed settings', 'settings.smtp': 'Changed the email server', 'settings.smtp.test': 'Tested the email server', 'settings.sso': 'Changed single sign-on', 'terms.accept': 'Accepted the terms', 'me.prefs.update': 'Changed their theme', 'calculator.update': 'Saved an account in the calculator', 'calculator.read': 'Read Checkmarx One', 'cxone.disconnect': 'Disconnected from Checkmarx One', 'backups.create': 'Took a backup', 'report.open': 'Opened a report', 'setup.admin': 'First Admin created',
  'updates.check': 'Checked for updates', 'updates.install': 'Installed a version', 'updates.switch': 'Switched version', 'updates.auto': 'Changed auto-update', 'system.restart': 'Reloaded the server', 'system.diagnostics': 'Downloaded diagnostics',
  'backup.written': 'Backup written', 'backup.download': 'Downloaded a backup', 'backup.restore': 'Restored a backup', 'backup.failed': 'Backup failed', 'audit.verify': 'Checked the audit log', 'audit.export': 'Exported the audit log', 'export.accounts': 'Exported accounts', 'export.reports': 'Exported reports',
};
const auditBase = (a) => String(a).replace(/^refused: /, '');
const auditLabel = (a) => {
  const b = auditBase(a);
  const name = AUDIT_NAMES[b] ?? b.split('.').map((w, i) => (i === 0 ? AUDIT_GROUPS[w] ?? w : w.replace(/-/g, ' '))).join(' · ');
  return String(a).startsWith('refused: ') ? `Refused: ${name}` : name;
};
const auditDetails = (d) =>
  Object.entries(d ?? {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `<span class="kvp"><i>${esc(k)}</i> ${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</span>`)
    .join(' ');
async function viewAudit(params) {
  shell('audit', loading());
  const f = Object.fromEntries(['q', 'who', 'what', 'from', 'to', 'outcome'].map((k) => [k, params.get(k) ?? '']));
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const first = await api(`/api/audit${qs ? `?${qs}` : ''}`);
  const groups = [...new Set(first.actions.map((a) => a.split('.')[0]))].sort((a, b) => (AUDIT_GROUPS[a] ?? a).localeCompare(AUDIT_GROUPS[b] ?? b));
  const row = (e) => {
    const refused = String(e.action).startsWith('refused: ');
    return `<tr${refused ? ' class="refused"' : ''}><td class="small nowrap">${esc(dateTime(e.at))}</td><td>${esc(e.actor?.name ?? 'System')}<span class="sub">${esc(e.actor?.email ?? '')}</span></td><td><span class="chip ${refused ? 'bad' : /fail|broken/.test(e.action) ? 'warn' : ''}"><i></i>${esc(auditLabel(e.action))}</span><span class="sub mono">${esc(auditBase(e.action))}</span></td><td>${esc(e.target ?? '')}</td><td class="small">${auditDetails(e.details)}</td><td class="small mono">${esc(e.ip ?? '')}</td></tr>`;
  };
  $('#main').innerHTML = `<div class="head"><div><h1 class="serif">Audit log</h1><p>Every action, by everyone: sign-ins, changes to accounts, reports, sales, people, teams, roles and settings, exports and downloads, updates and backups, and anything refused, with the reason. Newest first. Each entry is chained to the one before, so a changed or removed entry is found.</p></div>
    <div class="tools"><button class="ghost" id="averify">Check the log is intact</button><a class="btn" id="aexport" download href="/api/audit/export.csv${qs ? `?${qs}` : ''}">${icon('download')}Export CSV</a></div></div>
    <div class="panel"><form class="filters" id="af">
      <div class="search">${icon('search')}<input name="q" value="${esc(f.q)}" placeholder="Search everything" /></div>
      <label class="f">Who<select name="who"><option value="">Everyone</option>${first.people.map((p) => `<option value="${esc(p.email)}"${f.who === p.email ? ' selected' : ''}>${esc(p.name)} · ${esc(p.email)}</option>`).join('')}</select></label>
      <label class="f">What<select name="what"><option value="">Every action</option>${groups.map((g) => `<optgroup label="${esc(AUDIT_GROUPS[g] ?? g)}"><option value="${esc(g)}"${f.what === g ? ' selected' : ''}>All: ${esc(AUDIT_GROUPS[g] ?? g)}</option>${first.actions.filter((a) => a.split('.')[0] === g).map((a) => `<option value="${esc(a)}"${f.what === a ? ' selected' : ''}>${esc(auditLabel(a))}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="f">From<input type="date" name="from" value="${esc(f.from)}" /></label>
      <label class="f">To<input type="date" name="to" value="${esc(f.to)}" /></label>
      <label class="f">Outcome<select name="outcome"><option value="">All</option><option value="done"${f.outcome === 'done' ? ' selected' : ''}>Done</option><option value="refused"${f.outcome === 'refused' ? ' selected' : ''}>Refused</option></select></label>
      <div class="flex"><button class="primary">Apply</button>${qs ? '<a class="btn ghost" href="#/audit">Clear</a>' : ''}</div>
    </form>
    <div id="averified"></div>
    <div class="tw mt"><table class="audit"><thead><tr><th>When</th><th>Who</th><th>What</th><th>On</th><th>Details</th><th>Address</th></tr></thead><tbody id="arows">${first.events.map(row).join('') || '<tr><td colspan="6"><div class="empty"><b>No events</b>Nothing matches these filters.</div></td></tr>'}</tbody></table></div>
    <div class="flex mt"><button id="amore" ${first.more ? '' : 'hidden'}>Older entries</button><span class="muted small" id="acount">${first.events.length} shown</span></div></div>`;
  let last = first.events.at(-1)?.at ?? '';
  let shown = first.events.length;
  $('#af').onsubmit = (e) => {
    e.preventDefault();
    const data = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
    go(`/audit${data.toString() ? `?${data}` : ''}`);
  };
  $('#amore').onclick = async (e) => {
    e.target.disabled = true;
    const next = await api(`/api/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), before: last })}`);
    $('#arows').insertAdjacentHTML('beforeend', next.events.map(row).join(''));
    last = next.events.at(-1)?.at ?? last;
    shown += next.events.length;
    $('#acount').textContent = `${shown} shown`;
    e.target.disabled = false;
    e.target.hidden = !next.more;
  };
  $('#averify').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const v = await api('/api/audit/verify');
      $('#averified').innerHTML = v.ok ? `<div class="callout ok mt">Intact: all ${num(v.events)} entries are chained, none changed or removed.</div>` : `<div class="callout bad mt"><b>The log was changed</b> at entry ${num(v.brokenAt)}${v.at ? ` (${esc(dateTime(v.at))})` : ''}: ${esc(v.why)}.</div>`;
    } catch (error) {
      toast(error.message, 'bad');
    }
    e.target.disabled = false;
  };
}

// ---- Multi-select: a dropdown of checkboxes with a search, for filters everywhere --------------------------------------
/** options: [[value, label]]; selected: a Set of values. The chosen values are read with pickValues(root). */
function multiPick(name, label, options, selected = new Set()) {
  const n = selected.size;
  return `<details class="mpick" data-name="${esc(name)}"><summary><span class="mp-l">${esc(label)}</span><b class="mp-v">${n ? (n === 1 ? esc(options.find(([v]) => selected.has(v))?.[1] ?? '1 chosen') : `${n} chosen`) : 'All'}</b></summary>
    <div class="mp-menu">${options.length > 8 ? '<input class="mp-q" placeholder="Find…" />' : ''}<div class="mp-acts"><button type="button" class="link" data-mp="all">All</button><button type="button" class="link" data-mp="none">None</button></div>
    <div class="mp-list">${options.map(([v, l]) => `<label><input type="checkbox" value="${esc(v)}" ${selected.has(v) ? 'checked' : ''} /><span>${esc(l)}</span></label>`).join('') || '<span class="muted small">Nothing to choose yet</span>'}</div></div></details>`;
}
function wirePicks(root = document, onChange = () => {}) {
  for (const d of root.querySelectorAll('.mpick')) {
    if (d.dataset.wired) continue;
    d.dataset.wired = '1';
    const update = () => {
      const on = [...d.querySelectorAll('.mp-list input:checked')];
      d.querySelector('.mp-v').textContent = on.length === 0 ? 'All' : on.length === 1 ? on[0].nextElementSibling.textContent : `${on.length} chosen`;
      d.classList.toggle('active', on.length > 0);
      onChange(d);
    };
    d.classList.toggle('active', d.querySelectorAll('.mp-list input:checked').length > 0);
    d.addEventListener('change', (e) => e.target.matches('.mp-list input') && update());
    d.querySelector('.mp-q')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      for (const l of d.querySelectorAll('.mp-list label')) l.hidden = !l.textContent.toLowerCase().includes(q);
    });
    d.addEventListener('click', (e) => {
      const act = e.target.closest('[data-mp]')?.dataset.mp;
      if (!act) return;
      for (const i of d.querySelectorAll('.mp-list label:not([hidden]) input')) i.checked = act === 'all';
      update();
    });
  }
  // One open at a time; a click elsewhere closes them.
  if (!document.body.dataset.mpWired) {
    document.body.dataset.mpWired = '1';
    document.addEventListener('click', (e) => {
      for (const d of document.querySelectorAll('.mpick[open]')) if (!d.contains(e.target)) d.open = false;
    });
  }
}
const pickValues = (root, name) => [...(root.querySelector(`.mpick[data-name="${name}"]`)?.querySelectorAll('.mp-list input:checked') ?? [])].map((i) => i.value);

// ---- Checkmarx One activity: every call to a customer's tenant, reads, connections, reports generated --------------
const ACT_KINDS = [['call', 'API call'], ['connect', 'Connected'], ['disconnect', 'Disconnected'], ['read', 'Tenant read'], ['report', 'Report generated']];
async function viewActivity(params) {
  shell('activity', loading());
  const get = (k) => new Set((params.get(k) ?? '').split(',').filter(Boolean));
  const f = { who: get('who'), tenant: get('tenant'), kind: get('kind'), account: get('account'), outcome: params.get('outcome') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const qs = () => new URLSearchParams(Object.entries(f).map(([k, v]) => [k, v instanceof Set ? [...v].join(',') : v]).filter(([, v]) => v)).toString();
  const d = await api(`/api/activity${qs() ? `?${qs()}` : ''}`);
  const onlyMe = f.who.size === 1 && (f.who.has('me') || f.who.has(d.me));
  const sm = d.summary;
  const row = (e) => `<tr class="${e.ok === false ? 'refused' : ''}"><td class="small nowrap">${esc(dateTime(e.at))}</td><td>${esc(e.user?.name ?? '—')}<span class="sub">${esc(e.user?.email ?? '')}</span></td><td><span class="chip ${e.ok === false ? 'bad' : e.kind === 'report' ? 'ok' : ''}"><i></i>${esc(ACT_KINDS.find(([k]) => k === e.kind)?.[1] ?? e.kind)}</span></td><td class="mono small">${esc(e.tenant ?? '')}</td><td>${e.account ? `<a href="#/accounts/${encodeURIComponent(e.account.id)}">${esc(e.account.name)}</a>` : '<span class="muted">—</span>'}</td><td class="mono small">${e.method ? `${esc(e.method)} ${esc(e.path ?? '')}` : esc(e.detail ?? '')}</td><td class="small nowrap">${e.status ? `<b>${esc(e.status)}</b> · ` : ''}${e.ms !== undefined ? `${num(e.ms)} ms` : ''}${e.method && e.detail ? `<span class="sub">${esc(e.detail)}</span>` : ''}</td></tr>`;
  $('#main').innerHTML = `<div class="head"><div><div class="crumbs">Insight</div><h1 class="serif">Checkmarx One activity</h1><p>Every call made to a customer’s Checkmarx One tenant, on whose behalf and for which account, with its result and time; and every connection, tenant read and report generated. You see your own and that of the teams you see.</p></div>
      <div class="tools"><label class="switch"><input type="checkbox" id="onlyme" ${onlyMe ? 'checked' : ''} /><span>Only me</span></label></div></div>
    <div class="kpis five">
      <div class="kpi"><div class="k">API calls · 30 days</div><div class="v">${num(sm.calls)}</div><div class="s">${num(sm.avgMs)} ms on average</div></div>
      <div class="kpi ${sm.failed ? 'warn' : ''}"><div class="k">Calls that failed</div><div class="v">${num(sm.failed)}</div><div class="s">${sm.calls ? `${pct(sm.failed, sm.calls)}% of calls` : 'none yet'}</div></div>
      <div class="kpi"><div class="k">Tenants</div><div class="v">${num(sm.tenants)}</div><div class="s">${num(sm.connects)} connection${sm.connects === 1 ? '' : 's'}</div></div>
      <div class="kpi"><div class="k">Tenant reads</div><div class="v">${num(sm.reads)}</div><div class="s">finished</div></div>
      <div class="kpi"><div class="k">Reports generated</div><div class="v">${num(sm.reports)}</div><div class="s">in the calculator</div></div>
    </div>
    <div class="panel"><form class="filters" id="actf">
      ${multiPick('who', 'People', d.people.map((p) => [p.id, p.id === d.me ? `${p.name} (me)` : p.name]), new Set([...f.who].map((x) => (x === 'me' ? d.me : x))))}
      ${multiPick('tenant', 'Tenant', d.tenants.map((t) => [t, t]), f.tenant)}
      ${multiPick('kind', 'What', ACT_KINDS, f.kind)}
      ${multiPick('account', 'Account', d.accounts.map((a) => [a.id, a.name]), f.account)}
      <label class="f">Outcome<select name="outcome"><option value="">All</option><option value="ok"${f.outcome === 'ok' ? ' selected' : ''}>Succeeded</option><option value="failed"${f.outcome === 'failed' ? ' selected' : ''}>Failed</option></select></label>
      <label class="f">From<input type="date" name="from" value="${esc(f.from)}" /></label>
      <label class="f">To<input type="date" name="to" value="${esc(f.to)}" /></label>
      <div class="flex"><button class="primary">Apply</button>${qs() ? '<a class="btn ghost" href="#/activity">Clear</a>' : ''}</div>
    </form>
    <div class="tw mt"><table class="audit"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Tenant</th><th>Account</th><th>Request</th><th>Result</th></tr></thead><tbody id="actrows">${d.events.map(row).join('') || '<tr><td colspan="7"><div class="empty"><b>No activity yet</b>Connections to Checkmarx One, reads and reports generated in the calculator show here.</div></td></tr>'}</tbody></table></div>
    <div class="flex mt"><button id="actmore" ${d.more ? '' : 'hidden'}>Older entries</button><span class="muted small" id="actcount">${d.events.length} shown</span></div></div>`;
  wirePicks($('#main'));
  const apply = () => {
    const form = $('#actf');
    const out = new URLSearchParams();
    for (const k of ['who', 'tenant', 'kind', 'account']) {
      const v = pickValues(form, k);
      if (v.length) out.set(k, v.join(','));
    }
    for (const k of ['outcome', 'from', 'to']) if (form.elements[k].value) out.set(k, form.elements[k].value);
    go(`/activity${out.toString() ? `?${out}` : ''}`);
  };
  $('#actf').onsubmit = (e) => {
    e.preventDefault();
    apply();
  };
  $('#onlyme').onchange = (e) => {
    const out = new URLSearchParams(qs());
    if (e.target.checked) out.set('who', 'me');
    else out.delete('who');
    go(`/activity${out.toString() ? `?${out}` : ''}`);
  };
  let last = d.events.at(-1)?.at ?? '';
  let shown = d.events.length;
  $('#actmore').onclick = async (e) => {
    e.target.disabled = true;
    const next = await api(`/api/activity?${new URLSearchParams([...new URLSearchParams(qs()), ['before', last]])}`);
    $('#actrows').insertAdjacentHTML('beforeend', next.events.map(row).join(''));
    last = next.events.at(-1)?.at ?? last;
    shown += next.events.length;
    $('#actcount').textContent = `${shown} shown`;
    e.target.disabled = false;
    e.target.hidden = !next.more;
  };
}

// ---- About: the version, what is new, the licence ------------------------------------------------------------------
/** Markdown from this repository's own files (CHANGELOG.md), as safe HTML: headings, lists, bold and code only. */
function md(text) {
  const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = false;
  for (const line of String(text).split('\n')) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!li && list) (out.push('</ul>'), (list = false));
    if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    else if (li) (list || (out.push('<ul>'), (list = true)), out.push(`<li>${inline(li[1])}</li>`));
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}
async function viewAbout(params) {
  shell('', loading());
  const me = state.me;
  const b = state.branding ?? {};
  const log = await fetch('/legal/changelog').then((r) => r.text()).catch(() => '');
  const versions = log.replace(/^# .*\n/, '').split(/\n(?=## )/).filter((x) => x.startsWith('## '));
  const accepted = me.terms?.accepted;
  $('#main').innerHTML = `<div class="head"><div><h1 class="serif">About</h1><p>${esc(b.appName ?? 'FTR Credits')} ${esc(b.tagline ?? 'Command Center')}, with the Cx Credits Calculator from CxMissionZero.</p></div></div>
    <div class="panel about">
      <h2>About ${esc(b.appName ?? 'FTR Credits')} ${esc(b.tagline ?? 'Command Center')}</h2>
      <p class="muted">Where every Sales Engineer works out the credits an account needs, keeps each projection report and what was shared with the customer, and where leaders see the whole picture across every team and region.</p>
      <dl class="about-facts">
        <div><dt>Version</dt><dd>${esc(me.versionLabel)} <span class="muted">(${esc(me.version)})</span>${can('system.update') ? ' · <a href="#/admin/updates">Versions and updates</a>' : ''}</dd></div>
        <div><dt>Calculator</dt><dd>Cx Credits Calculator from CxMissionZero ${esc(me.mz)}</dd></div>
        <div><dt>Licence</dt><dd>PolyForm Internal Use 1.0.0 · <button type="button" class="link" data-doc="license">read it</button></dd></div>
        <div><dt>Project</dt><dd><a href="https://github.com/cxsmtp/FTR-CC-Dashboard" target="_blank" rel="noopener noreferrer">github.com/cxsmtp/FTR-CC-Dashboard</a></dd></div>
        <div><dt>Terms accepted</dt><dd>${accepted ? `Version ${esc(me.terms.version)}${me.terms.at ? `, ${esc(dateTime(me.terms.at))}` : ''}` : 'Not yet'}</dd></div>
        <div><dt>Organisation</dt><dd>${esc(me.organisationName ?? '')}</dd></div>
      </dl>
      <p class="onprem-note"><b>On premise, your data stays yours.</b> The command center runs on your own server and sends your data to no one: it connects only to what you connect it to (customers’ Checkmarx One tenants with their keys, your email server, the git hosts an SE counts code from, and GitHub for its own updates). No telemetry, no analytics.</p>
      <div class="terms-card"><h3>Terms of use &amp; license</h3>
        <p class="muted small">An independent project, not a Checkmarx product, for internal business use under the PolyForm Internal Use License 1.0.0. Figures are supporting information worked out from data at a moment in time: Checkmarx’s own records are authoritative, and a projection is not a quote.</p>
        <div class="flex"><button type="button" class="primary" data-doc="terms">Read the terms of use &amp; license</button><button type="button" data-doc="guide">Read the user guide</button></div></div>
    </div>
    <div class="panel mt"><h2>What is new <small>every version, newest first</small></h2>
      <div class="versions-log">${versions.map((v, i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(v.split('\n')[0].replace(/^## /, ''))}</summary><div class="md">${md(v.split('\n').slice(1).join('\n'))}</div></details>`).join('')}</div></div>`;
  if (params?.get?.('doc')) openDoc(params.get('doc'));
}
/** Terms of use, the licence and the user guide: read here, in the app’s own look, never as a bare file in a new tab. */
const DOCS = [['terms', 'Terms of use', '/legal/terms'], ['license', 'License', '/legal/license'], ['guide', 'User guide', '/legal/guide']];
async function openDoc(which = 'terms') {
  document.getElementById('docd')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'docd';
  dlg.className = 'docd';
  dlg.innerHTML = `<div class="doc-head"><div class="seg" role="tablist">${DOCS.map(([id, name]) => `<button type="button" role="tab" data-d="${id}">${esc(name)}</button>`).join('')}</div><button type="button" class="ghost sm" id="doc-close" aria-label="Close">✕</button></div><div class="doc-text md" id="doc-text"></div><div class="doc-foot muted small">PolyForm Internal Use License 1.0.0 · internal business use only · not a Checkmarx product</div>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  $('#doc-close', dlg).onclick = () => dlg.close();
  const show = async (id) => {
    for (const b of dlg.querySelectorAll('[data-d]')) b.classList.toggle('primary', b.dataset.d === id);
    const [, , url] = DOCS.find((d) => d[0] === id) ?? DOCS[0];
    $('#doc-text', dlg).innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';
    const text = await fetch(url).then((r) => r.text()).catch(() => 'It could not be loaded.');
    // Links in the text show as their words (the overlay keeps you here).
    $('#doc-text', dlg).innerHTML = md(text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^<(https?:[^>]+)>$/gm, '$1'));
    $('#doc-text', dlg).scrollTop = 0;
  };
  for (const b of dlg.querySelectorAll('[data-d]')) b.onclick = () => show(b.dataset.d);
  dlg.showModal();
  show(which);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-doc]');
  if (!b) return;
  e.preventDefault();
  openDoc(b.dataset.doc);
});

// ---- Every table: sort low to high and back, and filter each column by its values (multi-select) -------------------
/** What a cell sorts and filters by: data-sort / data-v, else its text without the small print under it. */
function cellText(td) {
  if (!td) return '';
  if (td.dataset.v !== undefined) return td.dataset.v;
  const c = td.cloneNode(true);
  for (const x of c.querySelectorAll('.sub, button, .actions, svg, .avatar, .tx-tools')) x.remove();
  return c.textContent.replace(/\s+/g, ' ').trim();
}
const YEAR = new Date().getFullYear();
function sortKey(td) {
  if (td?.dataset.sort !== undefined) {
    const n = Number(td.dataset.sort);
    return Number.isFinite(n) ? n : td.dataset.sort.toLowerCase();
  }
  const t = cellText(td);
  if (!t || t === '—') return null;
  const num = /^[-+]?[€$£₹]?\s?[\d,]*\.?\d+\s*(%|ms|s|credits|KB|MB|GB)?$/i.exec(t.split(' · ')[0]);
  if (num) return Number(t.split(' · ')[0].replace(/[^\d.+-]/g, ''));
  if (/\d{1,2}:\d{2}|\b(19|20)\d{2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(t)) {
    const d = Date.parse(t) || Date.parse(t.replace(/^(\w{3} \d{1,2}),/, `$1 ${YEAR}`)) || Date.parse(`${t} ${YEAR}`);
    if (Number.isFinite(d)) return d;
  }
  return t.toLowerCase();
}
const dataRows = (tbody) => [...tbody.rows].filter((r) => !(r.cells.length === 1 && r.cells[0].colSpan > 1) && !r.classList.contains('grp'));
function enhanceTable(table) {
  if (table.dataset.tx || table.classList.contains('matrix') || table.dataset.plain !== undefined || !table.tHead || !table.tBodies[0]) return;
  table.dataset.tx = '1';
  const tbody = table.tBodies[0];
  const heads = [...table.tHead.rows[0].cells];
  const state = { col: -1, dir: 0, filters: new Map() };
  const bar = document.createElement('div');
  bar.className = 'tx-bar';
  bar.hidden = true;
  table.closest('.tw')?.before(bar) ?? table.before(bar);
  let observer;
  const apply = () => {
    observer?.disconnect();
    const rows = dataRows(tbody);
    let shown = 0;
    for (const r of rows) {
      const ok = [...state.filters].every(([i, set]) => set.has(cellText(r.cells[i])));
      r.hidden = !ok;
      if (ok) shown++;
    }
    if (state.dir) {
      const dir = state.dir;
      const keyed = rows.map((r, i) => [r, sortKey(r.cells[state.col]), i]);
      // A column of numbers sorts as numbers; words in it ("No report", "—") go last either way.
      const nums = keyed.filter(([, k]) => typeof k === 'number').length;
      if (nums && nums >= keyed.filter(([, k]) => k !== null).length / 2) for (const x of keyed) if (typeof x[1] !== 'number') x[1] = null;
      const sorted = keyed.sort((a, b) => {
        if (a[1] === null && b[1] === null) return a[2] - b[2];
        if (a[1] === null) return 1;
        if (b[1] === null) return -1;
        if (typeof a[1] === typeof b[1]) return (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2]) * dir;
        return (typeof a[1] === 'number' ? -1 : 1) * dir;
      });
      for (const [r] of sorted) tbody.append(r);
    }
    for (const [i, th] of heads.entries()) {
      th.classList.toggle('tx-asc', state.col === i && state.dir === 1);
      th.classList.toggle('tx-desc', state.col === i && state.dir === -1);
      th.classList.toggle('tx-filtered', state.filters.has(i));
      th.setAttribute('aria-sort', state.col === i && state.dir ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    }
    bar.hidden = !state.filters.size;
    if (state.filters.size) bar.innerHTML = `Showing <b>${num(shown)}</b> of ${num(rows.length)} · ${[...state.filters.keys()].map((i) => esc(heads[i].dataset.txLabel)).join(', ')} filtered <button type="button" class="link" data-tx-clear>Clear filters</button>`;
    observer?.observe(tbody, { childList: true });
  };
  bar.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tx-clear]')) return;
    state.filters.clear();
    apply();
  });
  // Rows drawn again (a search, Older entries…): sorted and filtered the same way.
  observer = new MutationObserver(() => apply());
  observer.observe(tbody, { childList: true });
  for (const [i, th] of heads.entries()) {
    const label = th.childNodes[0]?.textContent?.trim() || th.textContent.trim();
    if (!label || th.colSpan > 1) continue;
    th.dataset.txLabel = label;
    th.classList.add('tx-th');
    const tools = document.createElement('span');
    tools.className = 'tx-tools';
    tools.innerHTML = `<button type="button" class="tx-sort" title="Sort: low to high, then high to low" aria-label="Sort by ${esc(label)}"></button><button type="button" class="tx-filter" title="Filter ${esc(label)}" aria-label="Filter by ${esc(label)}">⏷</button>`;
    th.append(tools);
    const sortIt = () => {
      state.dir = state.col === i ? (state.dir === 1 ? -1 : state.dir === -1 ? 0 : 1) : 1;
      state.col = state.dir ? i : -1;
      apply();
    };
    tools.querySelector('.tx-sort').onclick = (e) => {
      e.stopPropagation();
      sortIt();
    };
    th.addEventListener('click', (e) => {
      if (e.target.closest('.tx-tools, button, a, input, select')) return;
      sortIt();
    });
    tools.querySelector('.tx-filter').onclick = (e) => {
      e.stopPropagation();
      openColumnFilter(th, i, label);
    };
  }
  function openColumnFilter(th, i, label) {
    document.querySelector('.tx-pop')?.remove();
    const counts = new Map();
    for (const r of dataRows(tbody)) {
      const v = cellText(r.cells[i]);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const values = [...counts.keys()].sort((a, b) => {
      const ka = sortKey(Object.assign(document.createElement('td'), { textContent: a }));
      const kb = sortKey(Object.assign(document.createElement('td'), { textContent: b }));
      return ka === kb ? 0 : ka === null ? 1 : kb === null ? -1 : typeof ka === typeof kb ? (ka < kb ? -1 : 1) : typeof ka === 'number' ? -1 : 1;
    });
    const chosen = state.filters.get(i);
    const pop = document.createElement('div');
    pop.className = 'tx-pop mp-menu';
    pop.innerHTML = `<div class="tx-pop-h"><b>${esc(label)}</b><span class="tx-sorts"><button type="button" class="sm ghost" data-dir="1">Low to high</button><button type="button" class="sm ghost" data-dir="-1">High to low</button></span></div>
      ${values.length > 8 ? '<input class="mp-q" placeholder="Find…" />' : ''}<div class="mp-acts"><button type="button" class="link" data-mp="all">All</button><button type="button" class="link" data-mp="none">None</button></div>
      <div class="mp-list">${values.slice(0, 500).map((v) => `<label><input type="checkbox" value="${esc(v)}" ${!chosen || chosen.has(v) ? 'checked' : ''} /><span>${esc(v || '(empty)')}</span><em>${num(counts.get(v))}</em></label>`).join('')}</div>`;
    document.body.append(pop);
    const r = th.getBoundingClientRect();
    pop.style.top = `${window.scrollY + r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8))}px`;
    const update = () => {
      const on = [...pop.querySelectorAll('.mp-list input')].filter((x) => x.checked).map((x) => x.value);
      if (on.length === values.length) state.filters.delete(i);
      else state.filters.set(i, new Set(on));
      apply();
    };
    pop.addEventListener('change', update);
    pop.addEventListener('click', (e) => {
      const act = e.target.closest('[data-mp]')?.dataset.mp;
      if (act) {
        for (const x of pop.querySelectorAll('.mp-list label:not([hidden]) input')) x.checked = act === 'all';
        update();
      }
      const dir = e.target.closest('[data-dir]')?.dataset.dir;
      if (dir) {
        state.col = i;
        state.dir = Number(dir);
        apply();
      }
    });
    pop.querySelector('.mp-q')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      for (const l of pop.querySelectorAll('.mp-list label')) l.hidden = !l.textContent.toLowerCase().includes(q);
    });
    setTimeout(() => {
      const close = (e) => {
        if (pop.contains(e.target)) return;
        pop.remove();
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    });
  }
  apply();
}
// ---- Every page keeps your work: what you type in a form is kept as you type, until the form is sent -----------------
// Settings save on the server as they change; everything else (a person being added, a sale being recorded, a team
// being made…) is kept in this browser, so leaving the page, a reload or a dropped connection loses nothing.
const DRAFT = 'cc-draft:';
const draftable = (el) => el.form && el.name && !el.closest('[data-nodraft], .filters, .mpick') && !['password', 'file', 'hidden', 'submit', 'button', 'search'].includes(el.type) && !el.form.matches('#sf, #bf, #auto, #af, #actf');
const draftKey = (el) => `${DRAFT}${location.hash.split('?')[0]}:${el.form.id || el.form.className}:${el.name}`;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!draftable(el)) return;
  try {
    localStorage.setItem(draftKey(el), JSON.stringify(el.type === 'checkbox' ? el.checked : el.value));
    el.form.dataset.drafted = '1';
  } catch {}
}, true);
document.addEventListener('submit', (e) => {
  try {
    for (const el of e.target.elements ?? []) if (draftable(el)) localStorage.removeItem(draftKey(el));
  } catch {}
}, true);
function restoreDrafts(root) {
  for (const el of root.querySelectorAll('form input, form textarea, form select')) {
    if (!draftable(el) || el.dataset.draftChecked) continue;
    el.dataset.draftChecked = '1';
    let v;
    try {
      v = localStorage.getItem(draftKey(el));
    } catch {}
    if (v === null || v === undefined) continue;
    const value = JSON.parse(v);
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
    el.classList.add('drafted');
    el.title = 'Kept from what you typed before';
  }
}
/** Tables appear as pages draw: each is given sorting and filters once. */
new MutationObserver(() => {
  for (const t of document.querySelectorAll('#app table:not([data-tx])')) enhanceTable(t);
  restoreDrafts(document.getElementById('app') ?? document.body);
}).observe(document.getElementById('app') ?? document.body, { childList: true, subtree: true });
window.addEventListener('hashchange', () => document.querySelector('.tx-pop')?.remove());

// ---- Router ---------------------------------------------------------------------------------------------------
async function route() {
  const [pathPart, query = ''] = location.hash.replace(/^#/, '').split('?');
  const path = pathPart || '/';
  const params = new URLSearchParams(query);
  if (path === '/forgot') return viewForgot(params);
  if (path === '/reset') return viewReset(params);
  if (!state.me) {
    try {
      state.me = await api('/api/me');
    } catch {
      state.me = null;
    }
  }
  if (!state.me) return viewLogin();
  applyMyTheme();
  if (path === '/login') return go(firstStepsDone() ? home() : '/welcome');
  if (!firstStepsDone()) return viewWelcome();
  try {
    if (path === '/' || path === '/welcome') return go(home());
    if (path === '/overview') return await viewOverview(params);
    if (path === '/accounts') return await viewAccounts(params);
    if (path.startsWith('/accounts/')) return await viewAccount(decodeURIComponent(path.slice('/accounts/'.length)));
    if (path === '/people') return await viewPeople();
    if (path.startsWith('/people/')) return await viewPeople(path.slice('/people/'.length));
    if (path === '/teams') return await viewTeams();
    if (path === '/admin') return await viewAdmin();
    if (path.startsWith('/admin/')) return await viewAdmin(path.slice('/admin/'.length));
    if (path === '/audit') return await viewAudit(params);
    if (path === '/activity') return await viewActivity(params);
    if (path === '/guide') return viewGuide(params);
    if (path === '/about') return await viewAbout(params);
    if (path === '/legal') return await viewAbout(new URLSearchParams(`doc=${params.get('doc') ?? 'terms'}`));
    go(home());
  } catch (error) {
    if (error.status === 401) return;
    if ($('#main')) $('#main').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
    else toast(error.message, 'bad');
  }
}

window.addEventListener('hashchange', route);
route();
