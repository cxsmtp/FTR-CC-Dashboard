import { workbook } from './xlsx-write.js';

// FTR Credits Command Center: the dashboard. One page, routes in the hash (#/overview, #/accounts/<id>…), every
// figure from the server's /api, everything written into the page escaped.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
const compact = (n) => (!Number.isFinite(Number(n)) ? '—' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : num(Math.round(n)));
/** The time zone dates are shown in: the person's own (Your profile), else this computer's. */
const tz = () => (typeof state !== 'undefined' && state.me?.prefs?.timeZone) || undefined;
const date = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz() }) : '—');
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz() }) : '—');
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
/** A person's avatar: their picture (Your profile), else their initials. */
const avatar = (name, picture, cls = 'sm') => (picture ? `<span class="avatar ${cls} pic"><img src="${esc(picture)}" alt="" /></span>` : `<span class="avatar ${cls}">${esc(initials(name))}</span>`);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const ICONS = {
  help: '<path d="M4 5h16v11H8l-4 4z"/><path d="M9 9h6"/><path d="M9 12h4"/>',
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  accounts: '<path d="M3 7h18M3 12h18M3 17h12"/>',
  engine: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
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
  if (path === '/calculator') return location.assign('/calculator');
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
const OPS = [['green', '#39ff88'], ['cyan', '#00e5ff'], ['blue', '#4d9fff'], ['amber', '#ffb000'], ['red', '#ff4d4d'], ['violet', '#be82ff']];
const OPS_KEY = 'cc-ops';
/** Command Center's phosphor colour (green unless chosen). */
function applyOps(ops) {
  const v = OPS.some(([id]) => id === ops) ? ops : 'green';
  document.documentElement.dataset.ops = v;
  try {
    localStorage.setItem(OPS_KEY, v);
  } catch {}
}
try {
  applyOps(localStorage.getItem(OPS_KEY));
} catch {}
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
  applyOps(me.prefs?.ops);
  applyBranding();
}
// ---- Branding (Settings → Branding): the name, the logo, the browser icon, the accent and where the menu sits --------
state.branding = null;
const TEJAS_LINE = 'Tejas - Built for speed, engineered for dominance—Tejas turns every airspace into its own.';
const brandHtml = () => {
  const b = state.branding ?? {};
  // The default logo is Tejas: pointed at, it shows itself, larger, with its line.
  const tejas = String(b.logo ?? '').includes('v=default');
  return `<div class="brand"><div class="logo${b.logo ? ' img' : ''}${tejas ? ' tejas' : ''}"${tejas ? ` title="${esc(TEJAS_LINE)}" aria-label="${esc(TEJAS_LINE)}"` : ''}>${b.logo ? `<img src="${esc(b.logo)}" alt="" />` : LOGO}${tejas ? `<span class="tejas-card" role="tooltip"><img src="${esc(b.logo)}" alt="" /><span>${esc(TEJAS_LINE)}</span></span>` : ''}</div><div><b>${esc(b.appName ?? 'FTR Credits')}</b><span>${esc(b.tagline ?? 'Command Center')}</span></div></div>`;
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
    <div class="swatches mt">${THEMES.map(([id, name, note]) => `<button type="button" class="swatch${cur.accent === id ? ' on' : ''}" data-a="${id}"><span class="sw sw-${id}"></span><b>${name}</b><small>${note}</small></button>`).join('')}</div>
    <div class="ops-pick" id="ops-pick"${cur.accent === 'command' ? '' : ' hidden'}><span class="muted small">Command Center colour</span>${OPS.map(([id, c]) => `<button type="button" data-o="${id}" style="--c:${c}" class="${(me.prefs?.ops ?? 'green') === id ? 'on' : ''}" title="${id[0].toUpperCase()}${id.slice(1)}" aria-label="${id}"></button>`).join('')}</div></div>
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
    dlg.querySelector('#ops-pick').hidden = cur.accent !== 'command';
    save();
  };
  for (const b of dlg.querySelectorAll('[data-o]')) b.onclick = async () => {
    applyOps(b.dataset.o);
    dlg.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('on', x === b));
    try {
      const r = await api('/api/me/prefs', { method: 'PUT', body: { ops: b.dataset.o } });
      state.me.prefs = r.prefs;
    } catch {}
  };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

// ---- Shell ----------------------------------------------------------------------------------------------
function shell(active, content) {
  const me = state.me;
  const link = (path, name, label, show = true) => (show ? `<a href="#${path}" class="${active === name ? 'on' : ''}">${icon(name)}<span>${label}</span></a>` : '');
  const admin = can('users.manage') || can('teams.manage') || ADMIN_TABS.some(([, , p]) => p && can(p)) || can('audit.view');
  $('#app').className = 'app';
  $('#app').innerHTML = `
    <aside class="side">
      ${brandHtml()}
      <nav class="nav">
        <div class="label">Insight</div>
        ${link('/overview', 'overview', 'Overview', can('dashboard.view'))}
        ${link('/accounts', 'accounts', 'Accounts', can('dashboard.view'))}
        ${link('/people', 'people', can('users.manage') ? 'People & roles' : 'People')}
        <div class="label">Work</div>
        ${can('calculator.use') ? `<a href="/calculator">${icon('calc')}<span>Calculator</span></a>` : ''}
        ${link('/activity', 'pulse', 'CxOne API audit')}
        ${admin ? '<div class="label">Administration</div>' : ''}
        ${link('/teams', 'teams', 'Teams', can('teams.manage') || can('dashboard.view'))}
        ${link('/rates', 'engine', 'Fusion engines & rates', can('users.manage') || can('settings.manage'))}
        ${link('/admin', 'admin', 'Settings', ADMIN_TABS.some(([, , p]) => p && can(p)))}
        ${link('/audit', 'audit', 'Audit log', can('audit.view'))}
      </nav>
      <a class="bgwork" id="bgwork" hidden></a>
      <nav class="nav guide-nav"><a href="#" id="side-refresh" title="Refresh this page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg><span>Refresh</span></a>${link('/guide', 'guide', 'Quick guide')}${link('/help', 'help', 'Get help')}</nav>
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
      <main class="main fade" id="main" data-page="${esc(active)}">${content}</main>
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
    ['Overview', '/overview', 'overview', can('dashboard.view')], ['Accounts', '/accounts', 'accounts', can('dashboard.view')], ['CxOne API audit', '/activity', 'pulse', true], ['Fusion engines & rates', '/rates', 'engine', can('users.manage') || can('settings.manage')],
    ['People & roles', '/people', 'people', true], ['Calculator', '/calculator', 'calc', can('calculator.use')], ['Teams', '/teams', 'teams', can('teams.manage') || can('dashboard.view')],
    ['Settings', '/admin', 'admin', ADMIN_TABS.some(([, , p]) => p && can(p))], ['Updates', '/admin/updates', 'admin', can('system.update')], ['Audit log', '/audit', 'audit', can('audit.view')],
    ['Quick guide', '/guide', 'guide', true], ['Get help', '/help', 'help', true], ['Submit a support case', '/help/case', 'help', true], ['Request an enhancement', '/help/enhancement', 'help', true], ['About', '/about', 'guide', true],
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
/** Sign in as: back to the Admin's own account, on the People page. */
async function stopImpersonating() {
  try {
    await api('/api/auth/impersonate/stop', { method: 'POST', body: {} });
  } catch {}
  location.href = '/#/people';
  location.reload();
}
/** One CSV cell, quoted; one that a spreadsheet would read as a formula (= + - @, tab, return) is kept as text. */
const csvCell = (v) => {
  const t = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};
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
/**
 * A Salesforce link, read as the server reads it (server/accounts.js checkSalesforceUrl): https, an opportunity (006)
 * or an account (001) whose object in a Lightning link agrees, and an 18-character id whose last three letters check.
 */
function sfRead(value) {
  const text = String(value ?? '').trim();
  if (!text) return { error: 'Paste the opportunity or account link from Salesforce.' };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'That is not a link: copy it from the address bar of the opportunity or account.' };
  }
  if (url.protocol !== 'https:' || url.username || url.password) return { error: 'Give the https link from the address bar.' };
  if (!/(^|\.)(force\.com|salesforce\.com|lightning\.force\.com)$/i.test(url.hostname)) return { error: `${url.hostname} is not Salesforce.` };
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts.find((p) => /^(001|006)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(p)) ?? '';
  const kind = id.startsWith('006') ? 'opportunity' : id.startsWith('001') ? 'account' : '';
  const object = parts.includes('r') ? (parts[parts.indexOf('r') + 1] ?? '').toLowerCase() : '';
  if (!kind || (object && object !== kind)) return { error: `That link is to ${object && object !== 'r' ? `a ${object}` : 'something else'}: open the opportunity (006…) or the account (001…).` };
  if (id.length === 18) {
    const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    let sum = '';
    for (let b = 0; b < 3; b++) {
      let n = 0;
      for (let i = 0; i < 5; i++) if (/[A-Z]/.test(id[b * 5 + i])) n |= 1 << i;
      sum += map[n];
    }
    if (sum !== id.slice(15)) return { error: `The id ${id} is not a whole Salesforce id: copy the link again.` };
  }
  return { kind, id, label: `${kind === 'opportunity' ? 'Opportunity' : 'Account'} ${id}` };
}

// Salesforce links are read as they are typed, wherever one is asked for (the account's link; a sale's opportunity).
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches?.('input[name="sf"], input[name="opportunityUrl"]')) return;
  let hint = el.parentElement.querySelector('.sf-hint');
  if (!hint) {
    hint = document.createElement('small');
    hint.className = 'sf-hint';
    el.after(hint);
  }
  const r = sfRead(el.value);
  const wrong = !r.error && el.name === 'opportunityUrl' && r.kind !== 'opportunity' ? 'That is the account: a sale needs the opportunity (006…) it was won on.' : '';
  hint.textContent = r.error || wrong || `✓ ${r.label}`;
  hint.className = `sf-hint ${r.error || wrong ? 'bad' : 'ok'}`;
  el.setCustomValidity(r.error || wrong || '');
});
const HOME_PAGES = [['overview', 'Overview'], ['calculator', 'Calculator'], ['accounts', 'Accounts'], ['activity', 'CxOne API audit'], ['guide', 'Quick guide']];
/** Where this person lands: their role's home page (set in Roles & permissions), if they may open it. */
const home = () => {
  const h = state.me?.role?.home;
  if (h === 'calculator' && can('calculator.use')) return '/calculator';
  if ((h === 'overview' || h === 'accounts') && can('dashboard.view')) return `/${h}`;
  if (h === 'activity' || h === 'guide') return `/${h}`;
  return can('dashboard.view') ? '/overview' : '/guide';
};

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

// ---- The Overview's cards: small, each with a picture of its number; everyone chooses which they see ------------------
const ring = (p, kind = '') => `<span class="ring ${kind}" style="--p:${Math.max(0, Math.min(100, p))}"><b>${p}%</b></span>`;
const glyph = (name, kind = '') => `<span class="glyph ${kind}">${icon(name)}</span>`;
const OV_CARDS = [
  ['projected', 'Projected credits', (t) => ({ v: num(Math.round(t.credits)), s: `T&R ${num(Math.round(t.trCredits))} · Fusion ${num(Math.round(t.fusionCredits))}`, g: `<span class="split" title="T&R and Fusion"><i style="--w:${pct(t.trCredits, t.credits)}"></i></span>`, hero: true })],
  ['sold', 'Credits sold', (t) => ({ v: num(Math.round(t.sold)), s: `${num(t.accountsWithSales)} account${t.accountsWithSales === 1 ? '' : 's'}`, g: ring(pct(t.sold, t.credits), 'ok') })],
  ['needed', 'Still needed', (t) => ({ v: num(Math.round(t.remaining)), s: 'projected, not sold yet', g: ring(pct(t.remaining, t.credits), 'need') })],
  ['accounts', 'Accounts', (t) => ({ v: num(t.accounts), s: `${num(t.withReport)} with a report`, g: ring(pct(t.withReport, t.accounts)) })],
  ['reports', 'Reports', (t) => ({ v: num(t.reports), s: `${num(t.primaryMarked)} with a primary`, g: glyph('send') })],
  ['shared', 'Shared', (t) => ({ v: num(t.sharedReports), s: `${num(t.accountsShared)} of ${num(t.accounts)} accounts`, g: ring(pct(t.accountsShared, t.accounts)) })],
  ['missing', 'No Salesforce link', (t) => ({ v: num(t.missingSalesforce), s: t.missingSalesforce ? 'no report possible yet' : 'all tied to Salesforce', g: glyph('ext', t.missingSalesforce ? 'bad' : 'ok'), warn: t.missingSalesforce > 0 })],
];
/** Shown until a person chooses: credits sold and still needed are a click away in Cards ▾. */
const DEFAULT_CARDS = ['projected', 'accounts', 'reports', 'shared', 'missing'];
/** The cards this person shows, in their order. */
const myCards = () => (Array.isArray(state.me.prefs?.cards) && state.me.prefs.cards.length ? state.me.prefs.cards : DEFAULT_CARDS).filter((id) => OV_CARDS.some(([c]) => c === id));
const cardOf = (id) => OV_CARDS.find(([c]) => c === id);
function overviewTiles(t) {
  return `<div class="tiles">${myCards().map(cardOf).map(([id, label, f]) => {
    const c = f(t);
    return `<div class="tile${c.hero ? ' hero' : ''}${c.warn ? ' warn' : ''}" data-card="${id}"><div class="tile-g">${c.g}</div><div class="tile-t"><span class="k">${esc(label)}</span><b class="v">${c.v}</b><span class="s">${c.s}</span></div></div>`;
  }).join('')}</div>`;
}
function cardsPicker(onDone) {
  document.querySelector('.cards-pop')?.remove();
  const shown = myCards();
  const chosen = new Set(shown);
  // The chosen cards first, in their order; then the others.
  const order = [...shown, ...OV_CARDS.map(([id]) => id).filter((id) => !chosen.has(id))];
  const pop = document.createElement('div');
  pop.className = 'cards-pop mp-menu';
  pop.innerHTML = `<b>Cards on your Overview</b><span class="muted small">Tick to show; drag ⠿ or use ▲ ▼ to order them.</span><div class="mp-list cards-order">${order.map((id) => `<div class="co-row" draggable="true" data-id="${id}"><span class="co-grip" aria-hidden="true">⠿</span><label><input type="checkbox" value="${id}" ${chosen.has(id) ? 'checked' : ''} /><span>${esc(cardOf(id)[1])}</span></label><button type="button" class="link" data-up title="Move up" aria-label="Move up">▲</button><button type="button" class="link" data-down title="Move down" aria-label="Move down">▼</button></div>`).join('')}</div><div class="mp-acts"><button type="button" class="link" data-all>All</button><button type="button" class="link" data-default>Default</button><span class="muted small">Saved for you, on every device</span></div>`;
  document.body.append(pop);
  const r = $('#cards-btn').getBoundingClientRect();
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${Math.max(8, window.scrollX + r.right - pop.offsetWidth)}px`;
  const save = async () => {
    const cards = [...pop.querySelectorAll('.co-row input:checked')].map((i) => i.value);
    state.me.prefs = { ...(state.me.prefs ?? {}), cards };
    onDone();
    try {
      await api('/api/me/prefs', { method: 'PUT', body: { cards } });
    } catch {}
  };
  pop.addEventListener('change', save);
  pop.querySelector('[data-all]').onclick = () => {
    for (const i of pop.querySelectorAll('input')) i.checked = true;
    save();
  };
  const list = pop.querySelector('.cards-order');
  pop.querySelector('[data-default]').onclick = () => {
    const rows = new Map([...list.children].map((r) => [r.dataset.id, r]));
    for (const id of [...DEFAULT_CARDS, ...OV_CARDS.map(([c]) => c).filter((c) => !DEFAULT_CARDS.includes(c))]) list.append(rows.get(id));
    for (const i of list.querySelectorAll('input')) i.checked = DEFAULT_CARDS.includes(i.value);
    save();
  };
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.co-row');
    if (!row) return;
    if (e.target.closest('[data-up]') && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    else if (e.target.closest('[data-down]') && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    else return;
    save();
  });
  let dragged = null;
  list.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.co-row');
    dragged?.classList.add('dragging');
  });
  list.addEventListener('dragover', (e) => {
    const over = e.target.closest('.co-row');
    if (!dragged || !over || over === dragged) return;
    e.preventDefault();
    const r = over.getBoundingClientRect();
    list.insertBefore(dragged, e.clientY > r.top + r.height / 2 ? over.nextElementSibling : over);
  });
  list.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    dragged = null;
    save();
  });
  setTimeout(() => {
    const close = (e) => {
      if (pop.contains(e.target) || e.target.closest('#cards-btn')) return;
      pop.remove();
      document.removeEventListener('click', close);
    };
    document.addEventListener('click', close);
  });
}
/**
 * The Overview's teams: the team at the top (Global Solution Engineering: everything rolls up into it) as one fixed
 * line, then the three teams below it with the most projected credits, each with its share; the rest on Teams.
 */
function topTeams(roots, kids) {
  const top = [...roots].sort((a, b) => b.credits - a.credits)[0];
  const below = roots.length > 1 ? roots.filter((x) => x !== top) : kids(top.id);
  const three = [...below].sort((a, b) => b.credits - a.credits).slice(0, 3);
  const more = below.length - three.length;
  const total = Math.max(1, top.credits);
  const meta = (n) => `${num(n.people)} people · ${num(n.accounts)} accounts · ${num(n.shared)} shared · <span class="sold-t">${num(Math.round(n.sold))} sold</span> · ${num(Math.round(n.remaining))} to go`;
  return `<div class="team-top" data-team="${esc(top.id)}"><div><b>${esc(top.name)}</b><small>${top.leaders.length ? ` · led by ${esc(top.leaders.join(', '))}` : ''}</small><div class="meta">${meta(top)}</div></div><span class="credits">${num(Math.round(top.credits))}</span></div>
    ${three.length ? `<div class="team-three">${three.map((n, i) => `<div class="node" data-team="${esc(n.id)}"><div class="t3-head"><span class="rank">${i + 1}</span><b title="${esc(n.name)}">${esc(n.name)}</b><span class="credits">${num(Math.round(n.credits))}<small>${pct(n.credits, total)}%</small></span></div>${n.leaders.length ? `<small class="t3-lead">led by ${esc(n.leaders.join(', '))}</small>` : ''}<div class="meta">${num(n.people)} people · ${num(n.accounts)} accounts · ${num(n.shared)} shared<br /><span class="sold-t">${num(Math.round(n.sold))} sold</span> · ${num(Math.round(n.remaining))} to go</div><div class="bar"><div class="track"><i data-w="${pct(n.credits, total)}"></i></div></div></div>`).join('')}</div>` : ''}
    ${more > 0 ? `<a class="small team-more" href="#/teams">+${num(more)} more team${more === 1 ? '' : 's'} on Teams →</a>` : ''}`;
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
    <div class="head compact"><div class="ht"><h1 class="serif">Overview</h1><span class="crumbs">${esc(scopeName)}</span></div>
      <div class="tools">${teamSelect('focus', focus)}<button type="button" class="ghost" id="cards-btn" title="Choose the cards you see">${icon('overview')}Cards ▾</button>${can('dashboard.export') ? `<a class="btn ghost" href="/api/export/accounts.csv" download title="Every account, as a spreadsheet">${icon('download')}Accounts</a><a class="btn ghost" href="/api/export/reports.csv" download title="Every report, as a spreadsheet">${icon('download')}Reports</a>` : ''}${can('calculator.use') ? `<a class="btn primary" href="/calculator">${icon('calc')}Open calculator</a>` : ''}</div></div>
    ${overviewTiles(t)}
    <div>
      <div class="panel"><h2>Teams <small>credits from primary reports, teams below rolled up</small></h2>
        ${treeRows.length ? topTeams(roots, kids) : '<div class="empty"><b>No teams yet</b>An Admin sets them up under Teams.</div>'}
      </div>

    </div>
    <div class="ov-duo mt">
      <div class="panel ov-list"><h2>Sales Engineers <small>by projected credits</small></h2>
        ${sePeople.length ? `<ol class="rank-list">${sePeople.slice(0, 6).map((p) => `<li class="click" data-person="${esc(p.id)}"><span class="avatar sm">${esc(initials(p.name))}</span><div class="rl-main"><div class="rl-top"><b>${esc(p.name)}</b><span class="rl-val">${num(Math.round(p.credits))}</span></div><div class="rl-bar"><i data-w="${pct(p.credits, maxPerson)}"></i></div><small>${esc(p.team)} · ${num(p.accounts)} accounts · ${num(p.shared)} shared${p.sold ? ` · <span class="sold-t">${num(Math.round(p.sold))} sold</span>` : ''}</small></div></li>`).join('')}</ol>${sePeople.length > 6 ? `<a class="rl-more" href="#/accounts">All ${num(sePeople.length)} SEs’ accounts →</a>` : ''}` : '<div class="empty"><b>No accounts yet</b>They appear once Sales Engineers add accounts in the calculator.</div>'}
      </div>
      <div class="panel ov-list"><h2>Largest projections <small>primary report per account</small></h2>
        ${d.top.length ? `<ol class="rank-list">${d.top.slice(0, 6).map((a) => { const tot = Math.round(a.primary.totalCredits); const maxTop = Math.max(1, ...d.top.map((x) => x.primary.totalCredits)); return `<li class="click" data-account="${esc(a.id)}"><span class="rl-rank">${esc(initials(a.name))}</span><div class="rl-main"><div class="rl-top"><b>${esc(a.name)}</b><span class="rl-val">${num(tot)}</span></div><div class="rl-bar"><i data-w="${pct(a.primary.totalCredits, maxTop)}"></i>${a.sold ? `<i class="rl-sold" data-w="${pct(Math.min(a.sold, a.primary.totalCredits), maxTop)}"></i>` : ''}</div><small>${esc(a.owner)} · ${esc(a.team)}${a.sold ? ` · <span class="sold-t">${pct(a.sold, a.primary.totalCredits)}% sold</span>` : ''}</small></div></li>`; }).join('')}</ol><a class="rl-more" href="#/accounts">Every account →</a>` : '<div class="empty"><b>No reports yet</b>Generate the first one in the calculator.</div>'}
      </div>
    </div>`;
  paint();
  $('#cards-btn').onclick = (e) => {
    e.stopPropagation();
    cardsPicker(() => {
      const el = document.querySelector('#main .tiles');
      if (el) el.outerHTML = overviewTiles(t);
    });
  };
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
/** Email addresses typed for "shared with": one or more, comma or space between; null when one is not an address. */
function emailList(value) {
  const list = String(value ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  return list.length && list.every((e) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(e)) ? list : null;
}
/** Who it went to, for a table cell. */
const sharedTo = (r) => (r?.sharedWith?.length ? r.sharedWith.join(', ') : r?.sharedNote || '');
/**
 * Shared with the customer, typed where the click was: the email address(es) of whom it was shared with, then ✓.
 * Enter saves, Esc puts the place back. `onDone` runs once it is saved.
 */
function shareInline(host, reportId, { onDone, onCancel } = {}) {
  const before = host.innerHTML;
  host.innerHTML = `<span class="cell-edit share-inline"><input type="text" inputmode="email" autocomplete="off" spellcheck="false" placeholder="Shared with: name@customer.com" aria-label="Email address of whom it was shared with" /><button type="button" class="sm primary" data-ok>✓ Shared</button><button type="button" class="sm ghost" data-x title="Cancel">✕</button></span>`;
  const input = host.querySelector('input');
  input.focus();
  input.oninput = () => input.setCustomValidity(input.value.trim() && !emailList(input.value) ? 'Type the email address(es) of whom it was shared with.' : '');
  const cancel = () => {
    host.innerHTML = before;
    onCancel?.();
  };
  const save = async () => {
    const emails = emailList(input.value);
    if (!emails) {
      input.setCustomValidity('Type the email address(es) of whom it was shared with.');
      input.reportValidity();
      return;
    }
    host.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await api(`/api/cc/reports/${encodeURIComponent(reportId)}/shared`, { method: 'POST', body: { shared: true, sharedWith: emails.join(', ') } });
      toast(`Marked shared with ${emails.join(', ')}.`, 'ok');
      onDone?.();
    } catch (error) {
      toast(error.message, 'bad');
      host.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  };
  host.querySelector('[data-ok]').onclick = (e) => (e.stopPropagation(), save());
  host.querySelector('[data-x]').onclick = (e) => (e.stopPropagation(), cancel());
  input.onkeydown = (e) => (e.key === 'Enter' ? (e.preventDefault(), save()) : e.key === 'Escape' && cancel());
  host.onclick = (e) => e.stopPropagation();
}

async function viewAccounts(params) {
  const focus = params.get('team') ?? '';
  shell('accounts', loading());
  const listUrl = `/api/accounts${focus ? `?team=${encodeURIComponent(focus)}` : ''}`;
  let [{ accounts }, people] = await Promise.all([api(listUrl), peopleList()]);
  const owners = [...new Map(accounts.map((a) => [a.ownerId, a.owner])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  void people;
  let sort = { key: 'credits', dir: -1 };
  $('#main').innerHTML = `
    <div class="head"><div><h1 class="serif">Accounts</h1><p>Every account in your teams with its primary report. Click an account to open it; <b>double-click</b> its name, accountable SE, sold or customer cell to change it right here.</p></div>
      <div class="tools">${can('calculator.use') ? `<a class="btn primary" href="/calculator">${icon('plus')}New in calculator</a>` : ''}</div></div>
    <div class="panel">
      <div class="flex">
        <div class="search">${icon('search')}<input id="q" placeholder="Search accounts, SEs, Salesforce ids" /></div>
        <div>${teamSelect('team', focus)}</div>
        <div><select id="owner"><option value="">Every SE</option>${owners.map(([id, name]) => `<option value="${esc(id)}"${id === params.get('owner') ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
        <div><select id="status"><option value="">Any status</option><option value="muted">Muted from the forecast</option><option value="nosf">Missing Salesforce link</option><option value="noreport">No report yet</option><option value="notshared">Report not shared</option><option value="shared">Shared with customer</option><option value="unsold">Projected, nothing sold yet</option><option value="partly">Partly sold</option><option value="sold">Fully sold</option><option value="noprimary">No primary marked</option></select></div>
        <span class="spacer"></span><span class="muted small" id="count"></span>
      </div>
      <div class="tw mt"><table><thead><tr>
        <th class="sort" data-k="name">Account</th><th class="sort" data-k="owner">Accountable SE</th><th>Salesforce</th><th class="sort num" data-k="credits">Total credits</th><th class="sort num" data-k="sold">Sold</th><th class="sort num" data-k="remaining">Still needed</th><th class="sort num" data-k="reports">Reports</th><th>Customer</th><th class="sort" data-k="last">Last report</th>${can('calculator.use') || can('forecast.mute') ? '<th></th>' : ''}
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
      .filter((a) => status !== 'muted' || a.muted)
      .filter((a) => !status || status === 'muted' || ['unsold', 'partly', 'sold'].includes(status) || (status === 'nosf' ? !a.salesforceUrl : status === 'noreport' ? !a.primary : status === 'notshared' ? a.primary && !a.sharedCount : status === 'shared' ? a.sharedCount > 0 : a.primary && a.primary.how !== 'marked'))
      .sort((a, b) => (val(a, sort.key) > val(b, sort.key) ? 1 : val(a, sort.key) < val(b, sort.key) ? -1 : 0) * sort.dir);
    $('#count').textContent = `${num(list.length)} of ${num(accounts.length)} accounts`;
    $('#rows').innerHTML = list.length
      ? list.map((a) => `<tr class="click${a.muted ? ' muted-row' : ''}" data-account="${esc(a.id)}">
        <td data-edit="name" title="Double-click to rename"><b>${esc(a.name)}</b>${a.muted ? ` <span class="chip muted-chip" title="Muted from the forecast by ${esc(a.mutedBy)}${a.mutedAt ? `, ${esc(date(a.mutedAt))}` : ''}: left out of the dashboards">Muted</span>` : ''}<span class="sub">${esc(a.teamPath)}</span></td>
        <td data-edit="owner" title="Double-click to change the accountable SE"><div class="flex"><span class="avatar sm">${esc(initials(a.owner))}</span>${esc(a.owner)}</div></td>
        <td>${sfChip(a)}</td>
        <td class="num">${a.primary ? `<span class="credits big">${num(Math.round(a.primary.totalCredits))}</span><span class="sub">T&amp;R ${num(Math.round(a.primary.trCredits ?? 0))} · Fusion ${num(Math.round(a.primary.fusionCredits ?? 0))}${a.primary.how === 'latest' ? ' · latest' : ''}</span>` : '<span class="muted">No report</span>'}</td>
        <td class="num" data-edit="sold" title="Double-click to record a sale">${soldCell(a)}</td>
        <td class="num">${a.remaining === null ? '—' : a.remaining === 0 && a.sold ? '<span class="chip ok"><i></i>Done</span>' : num(a.remaining)}</td>
        <td class="num">${num(a.reportCount)}</td>
        <td data-edit="shared" title="Double-click: the primary report shared with the customer (to whom), or not">${a.sharedCount ? `<span class="chip ok"><i></i>${num(a.sharedCount)} shared</span>${a.primary?.sharedWith?.length ? `<span class="sub">${esc(a.primary.sharedWith.join(', '))}</span>` : ''}` : a.reportCount ? '<span class="chip warn"><i></i>Not shared</span>' : '<span class="chip"><i></i>—</span>'}</td>
        <td>${esc(ago(a.lastReportAt))}</td>
        ${can('calculator.use') || can('forecast.mute') ? `<td class="actions">${can('forecast.mute') ? `<button type="button" class="sm ${a.muted ? '' : 'ghost'} mute-btn" data-mute="${a.muted ? 'off' : 'on'}" title="${a.muted ? 'Bring it back into the dashboards' : 'Leave it out of the dashboards (it stays here, marked muted)'}">${a.muted ? 'Unmute' : 'Mute'}</button>` : ''}${can('calculator.use') ? `<a class="btn sm primary calc-open" href="/calculator?team=${encodeURIComponent(a.teamId ?? '')}&amp;account=${encodeURIComponent(a.id)}" title="Open ${esc(a.name)} in the calculator">${icon('calc')}Open</a>` : ''}</td>` : ''}</tr>`).join('')
      : `<tr><td colspan="${can('calculator.use') || can('forecast.mute') ? 10 : 9}"><div class="empty"><b>No accounts match</b>Change the filters, or add one in the calculator.</div></td></tr>`;
    for (const b of $$('#rows [data-mute]')) {
      b.onclick = async (e) => {
        e.stopPropagation();
        const a = accounts.find((x) => x.id === b.closest('tr').dataset.account);
        const on = b.dataset.mute === 'on';
        try {
          await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/mute`, { method: 'POST', body: { muted: on } });
          toast(on ? `${a.name} is muted from the forecast: the dashboards leave it out.` : `${a.name} is back in the forecast.`, 'ok');
          await reload();
        } catch (error) {
          toast(error.message, 'bad');
        }
      };
    }
    // One click opens the account; a double-click edits the cell (the click waits a moment to tell them apart).
    for (const el of $$('[data-account]')) {
      let timer = null;
      el.onclick = (e) => {
        if (e.target.closest('a, input, select, button, .cell-edit')) return;
        clearTimeout(timer);
        timer = setTimeout(() => go(`/accounts/${encodeURIComponent(el.dataset.account)}`), 260);
      };
      el.ondblclick = (e) => {
        clearTimeout(timer);
        const cell = e.target.closest('[data-edit]');
        if (cell && !cell.querySelector('.cell-edit')) editCell(accounts.find((a) => a.id === el.dataset.account), cell);
      };
    }
  };
  const reload = async () => {
    ({ accounts } = await api(listUrl));
    render();
  };
  /** A cell edited in place: Enter or leaving it saves, Esc puts it back. */
  async function editCell(a, cell) {
    const kind = cell.dataset.edit;
    const before = cell.innerHTML;
    const restore = () => (cell.innerHTML = before);
    const done = async (fn, msg) => {
      try {
        await fn();
        toast(msg, 'ok');
        await reload();
      } catch (error) {
        toast(error.message, 'bad');
        restore();
      }
    };
    if (kind === 'name') {
      cell.innerHTML = `<input class="cell-edit" maxlength="120" value="${esc(a.name)}" aria-label="Account name, as in Salesforce" />`;
      const input = cell.querySelector('input');
      input.focus();
      input.select();
      let gone = false;
      const save = () => {
        if (gone) return;
        gone = true;
        const v = input.value.trim();
        if (!v || v === a.name) return restore();
        done(() => api(`/api/cc/accounts/${encodeURIComponent(a.id)}`, { method: 'PUT', body: { name: v } }), `Renamed to ${v}.`);
      };
      input.onkeydown = (e) => (e.key === 'Enter' ? save() : e.key === 'Escape' && ((gone = true), restore()));
      input.onblur = save;
    }
    if (kind === 'owner') {
      let members = [];
      try {
        members = (await api(`/api/cc/accounts/${encodeURIComponent(a.id)}`)).members;
      } catch (error) {
        return toast(error.message, 'bad');
      }
      cell.innerHTML = `<select class="cell-edit" aria-label="Accountable SE">${members.map((m) => `<option value="${esc(m.id)}"${m.id === a.ownerId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;
      const sel = cell.querySelector('select');
      sel.focus();
      sel.onchange = () => done(() => api(`/api/cc/accounts/${encodeURIComponent(a.id)}`, { method: 'PUT', body: { ownerId: sel.value } }), `Accountable SE: ${sel.selectedOptions[0].textContent}.`);
      sel.onblur = () => setTimeout(() => cell.querySelector('select') === sel && restore(), 150);
      sel.onkeydown = (e) => e.key === 'Escape' && restore();
    }
    if (kind === 'sold') {
      if (!can('sales.record')) return toast('Recording sales needs the permission to record them.', 'bad');
      if (!a.primary) return toast('No projection yet: generate a report first, then record what was sold against it.', 'bad');
      const opp = a.salesforceKind === 'opportunity';
      cell.innerHTML = `<div class="cell-edit sale-inline"><input type="number" min="1" step="1" placeholder="Credits sold now" aria-label="Credits sold" />${opp ? '' : '<input type="url" placeholder="Opportunity link (006…)" aria-label="Salesforce opportunity link" />'}<button type="button" class="sm primary">Record</button><button type="button" class="sm ghost" data-x>✕</button></div>`;
      const [credits, link] = cell.querySelectorAll('input');
      credits.focus();
      const save = () => done(() => api(`/api/cc/accounts/${encodeURIComponent(a.id)}/sales`, { method: 'POST', body: { credits: Number(credits.value), date: new Date().toISOString().slice(0, 10), opportunityUrl: opp ? a.salesforceUrl : link.value, reportId: a.primary.id } }), `${num(Number(credits.value))} credits recorded as sold for ${a.name}.`);
      cell.querySelector('.primary').onclick = save;
      cell.querySelector('[data-x]').onclick = restore;
      cell.onkeydown = (e) => (e.key === 'Enter' ? save() : e.key === 'Escape' && restore());
    }
    if (kind === 'shared') {
      if (!can('reports.share')) return toast('Marking reports shared needs the permission to share them.', 'bad');
      if (!a.primary) return toast('No report yet to share.', 'bad');
      // In the cell itself, as the name is: how and to whom, then ✓; or, when shared, undo it.
      const shared = Boolean(a.primary.sharedAt);
      const url = `/api/cc/reports/${encodeURIComponent(a.primary.id)}/shared`;
      if (!shared) return shareInline(cell, a.primary.id, { onDone: reload });
      cell.innerHTML = `<div class="cell-edit share-inline"><span class="muted small">Shared ${esc(date(a.primary.sharedAt))}${a.primary.sharedWith?.length ? ` with ${esc(a.primary.sharedWith.join(', '))}` : ''}</span><button type="button" class="sm" data-ok>Not shared</button><button type="button" class="sm ghost" data-x>✕</button></div>`;
      cell.querySelector('[data-ok]').focus();
      const save = () => done(() => api(url, { method: 'POST', body: { shared: false } }), 'No longer marked shared.');
      cell.querySelector('[data-ok]').onclick = save;
      cell.querySelector('[data-x]').onclick = restore;
      cell.onkeydown = (e) => (e.key === 'Enter' ? save() : e.key === 'Escape' && restore());
    }
  }
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
    <div class="head compact"><div><h1 class="serif">${esc(a.name)}</h1><p class="acct-meta">${a.salesforceUrl ? `<a class="chip sf" href="${esc(a.salesforceUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.salesforceKind === 'opportunity' ? 'Opportunity' : 'Account')} <span class="mono">${esc(a.salesforceId)}</span> ↗</a>` : '<span class="chip warn"><i></i>No Salesforce link</span>'}<span>SE <b>${esc(a.owner)}</b></span>${a.cxone ? `<span class="chip ok" title="Last read ${esc(a.cxone.lastReadAt ? ago(a.cxone.lastReadAt) : 'never')}"><i></i>Checkmarx One key kept · ${esc(a.cxone.tenant)}</span>` : ''}${a.impactEnabled ? `<span class="chip">Impact ${esc(a.impactCurrency)}</span>` : ''}</p></div>
      <div class="tools">${d.can.edit ? `<a class="btn primary" href="${esc(calcHref)}">${icon('calc')}Open in calculator</a>` : ''}</div></div>
    ${a.salesforceUrl ? '' : `<div class="callout warn">This account has no Salesforce opportunity or account link: no report can be generated until it is given.${d.can.edit ? ' Add it under Account details.' : ''}</div>`}
    <div class="acct-strip mt">
      <div class="as-main"><small>Primary report · ${p ? (p.how === 'marked' ? 'marked' : 'the latest (none marked)') : 'none yet'}</small>${p ? `<span class="credits big serif" id="bigc"></span><span class="sub">T&amp;R ${num(Math.round(p.trCredits ?? 0))} · Fusion ${num(Math.round(p.fusionCredits ?? 0))}${p.extraPercent ? ` · +${num(p.extraPercent, 1)}%` : ''}${p.bundles ? ` · ${num(p.bundles)} bundle${p.bundles === 1 ? '' : 's'}` : ''} · ${esc(date(p.createdAt))} by ${esc(p.createdBy)}</span>` : `<b>—</b><span class="sub">Open the account in the calculator and generate one.</span>`}</div>
      <div><small>Shared with the customer</small>${p ? (p.sharedAt ? `<b class="ok-t">✓ ${esc(date(p.sharedAt))}</b>${p.sharedWith?.length ? `<span class="sub">with ${esc(p.sharedWith.join(', '))}</span>` : ''}` : `<b class="warn-t">Not yet</b>${d.can.share ? `<button class="sm" id="share-primary">${icon('send')}Mark shared</button>` : ''}`) : '<b>—</b>'}</div>
      <div><small>Sold</small><b class="sold-t">${num(a.sold)}</b><span class="sub">${p ? `${Math.min(100, Math.round((a.sold / Math.max(1, p.totalCredits)) * 100))}% of the projection` : ''}</span></div>
      <div><small>Still needed</small><b>${a.remaining === null ? '—' : num(a.remaining)}</b></div>
      <div><small>Reports</small><b>${num(a.reportCount)}</b><span class="sub">${num(a.sharedCount)} shared</span></div>
    </div>
    <details class="panel mt acct-edit"${a.salesforceUrl ? '' : ' open'}><summary><h2>Account details <small>Salesforce link, accountable SE, team, Checkmarx One key, Impact</small></h2></summary>
        <form class="form" id="acct">
          <label class="f">Salesforce opportunity or account link <b>required</b><input name="sf" type="url" value="${esc(a.salesforceUrl)}" placeholder="https://yourorg.lightning.force.com/lightning/r/Opportunity/006…/view" ${d.can.edit ? '' : 'disabled'} /></label>
          <div class="row">
            <label class="f">Accountable SE<select name="owner" ${d.can.edit || d.can.assign ? '' : 'disabled'}>${d.members.map((m) => `<option value="${esc(m.id)}"${m.id === a.ownerId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
            <label class="f">Team${teamSelect('acct-team', a.teamId, { all: false }).replace('<select', `<select name="team" ${d.can.edit ? '' : 'disabled'}`)}</label>
          </div>
          ${d.can.edit ? '<div class="flex"><button class="primary" type="submit">Save</button><span class="err" id="err"></span></div>' : ''}
        </form>
        ${a.salesforceUrl ? `<dl class="kv mt"><dt>Created</dt><dd>${esc(dateTime(a.createdAt))} by ${esc(a.createdBy)}</dd><dt>Updated</dt><dd>${esc(dateTime(a.updatedAt))}</dd><dt>Checkmarx One</dt><dd>${a.cxone ? `Key kept for <b>${esc(a.cxone.tenant)}</b> by ${esc(a.cxone.savedBy)} · ${a.cxone.lastReadAt ? `last read ${esc(ago(a.cxone.lastReadAt))}` : 'not read since'}${d.can.edit ? ` · <a href="${esc(calcHref)}&amp;refresh=1">↻ Refresh in the calculator</a> · <a href="#" id="forget-key">Forget the key</a>` : ''}` : 'No key kept: tick "Remember this key" when connecting in the calculator, to refresh in one click later.'}</dd><dt>Impact <span class="chip star">beta</span></dt><dd>${a.impactEnabled ? `On · soft savings in ${esc(a.impactCurrency)} go into its reports` : 'Off: turn it on in the calculator for soft savings in the reports'}</dd></dl>` : ''}
        ${d.can.deleteAccount ? '<div class="mt"><button class="danger sm" id="del-acct">Delete account and its reports</button></div>' : ''}
    </details>
    ${salesPanel(a, d)}
    <div class="panel mt"><h2>Reports <small>download them from the calculator's Saved reports list</small>${d.can.edit ? `<label class="btn sm file-btn">⇪ Upload the customer's version<input type="file" id="cv-file" accept=".html,.htm,text/html" hidden /></label>` : ''}</h2>
      ${d.reports.length ? `<div class="tw"><table><thead><tr><th></th><th>Made</th><th>By</th><th class="num">T&amp;R</th><th class="num">Fusion</th><th class="num">Total</th><th>Shared with customer</th><th></th></tr></thead><tbody>${d.reports.map((r) => {
        const primary = a.primary?.id === r.id;
        return `<tr data-id="${esc(r.id)}"><td>${primary ? `<span class="chip star">${icon('star')}${a.primary.how === 'marked' ? 'Primary' : 'Latest'}</span>` : ''}${r.source === 'previous' ? `<span class="chip" title="A report made before, brought in${r.importedAt ? ` ${esc(date(r.importedAt))}` : ''}">Previous quote</span>` : ''}${r.source === 'customer' ? `<span class="chip sf" title="${esc(r.changes.join('\n') || 'No changes')}">Customer's version</span><span class="sub">${r.sentTotal ? `${r.totalCredits - r.sentTotal > 0 ? '+' : ''}${num(Math.round(r.totalCredits - r.sentTotal))} vs sent` : ''}${r.changes.length ? ` · ${num(r.changes.length)} change${r.changes.length === 1 ? '' : 's'}` : ''}</span>` : ''}</td><td>${esc(dateTime(r.createdAt))}</td><td>${esc(r.createdBy)}</td><td class="num">${num(Math.round(r.trCredits ?? 0))}</td><td class="num">${num(Math.round(r.fusionCredits ?? 0))}</td><td class="num credits">${num(Math.round(r.totalCredits))}</td><td class="shared-cell">${r.sharedAt ? `<span class="chip ok"><i></i>${esc(date(r.sharedAt))}</span><span class="sub">${sharedTo(r) ? `with ${esc(sharedTo(r))} · ` : ''}by ${esc(r.sharedByName)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="actions">${d.can.share ? `${a.primaryReportId === r.id ? '<button class="sm ghost" data-act="unprimary">Unmark primary</button>' : `<button class="sm" data-act="primary">${icon('star')}Make primary</button>`}${r.sharedAt ? '<button class="sm ghost" data-act="unshare">Unmark shared</button>' : `<button class="sm" data-act="share">${icon('send')}Mark shared</button>`}` : ''}${d.can.sell ? `<button class="sm ghost" data-sell="${esc(r.id)}" title="Record credits sold against this report">Sold…</button>` : ''}<button class="sm ghost icon" data-act="delete" title="Delete report">${icon('trash')}</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty"><b>No reports yet</b></div>'}
    </div>`;
  if (p) countUp($('#bigc'), Math.round(p.totalCredits), ' credits');
  if ($('#share-primary')) $('#share-primary').onclick = () => shareInline($('#share-primary').parentElement, p.id, { onDone: () => viewAccount(a.id) });
  wireSales(a, d);
  if ($('#forget-key')) $('#forget-key').onclick = async (e) => {
    e.preventDefault();
    if (!confirm(`Forget the Checkmarx One key kept for ${a.name}?`)) return;
    await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/cxone`, { method: 'DELETE' }).catch((x) => toast(x.message, 'bad'));
    viewAccount(a.id);
  };
  if ($('#cv-file')) $('#cv-file').onchange = (e) => customerVersion(a, e.target.files[0]);
  const form = $('#acct');
  // Leaders and above without the calculator: the accountable SE alone, saved as it is chosen.
  if (form && !d.can.edit && d.can.assign) form.elements.owner.onchange = async (e) => {
    try {
      await api(`/api/cc/accounts/${encodeURIComponent(a.id)}`, { method: 'PUT', body: { ownerId: e.target.value } });
      toast(`Accountable SE: ${e.target.selectedOptions[0].textContent}.`, 'ok');
      viewAccount(a.id);
    } catch (error) {
      toast(error.message, 'bad');
    }
  };
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
      if (act === 'share') return shareInline(b.closest('tr').querySelector('.shared-cell'), rid, { onDone: () => viewAccount(a.id) });
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
    <div class="sold-bar wide"><span class="track"><i data-w="${p}"></i></span><small>${projected ? `${num(a.sold)} of ${num(projected)} credits sold · ${p}%` : 'No projection yet: the primary report sets it'}${projected && a.sold > projected ? ` · ${num(a.sold - projected)} more than projected` : ''}</small></div>
    ${d.can.sell ? `<details class="sale-fold mt"><summary class="btn sm">${icon('plus')}Record a sale</summary><form class="form sale-form mt" id="sale"><div class="row">
      <label class="f">Credits sold<input name="credits" type="number" min="1" step="1" required placeholder="e.g. 50000" /></label>
      <label class="f">Date of the sale<input name="date" type="date" value="${today}" max="${today}" required /></label>
      <label class="f">Salesforce opportunity link <b>required</b><input name="opportunityUrl" type="url" required value="${a.salesforceKind === 'opportunity' ? esc(a.salesforceUrl) : ''}" placeholder="https://yourorg.lightning.force.com/lightning/r/Opportunity/006…/view" /><small class="sf-hint" id="sale-sf-hint">${a.salesforceKind === 'opportunity' ? `✓ Opportunity ${esc(a.salesforceId)} (the account’s own link)` : 'The opportunity this sale was won on'}</small></label>
      <label class="f">Order number <span class="muted">optional</span><input name="reference" maxlength="120" placeholder="Order or PO number" /></label>
      <label class="f">Against the report <span class="muted">optional</span><select name="reportId"><option value="">None in particular</option>${d.reports.map((r) => `<option value="${esc(r.id)}"${r.id === a.primary?.id ? ' selected' : ''}>${esc(date(r.createdAt))} · ${esc(num(Math.round(r.totalCredits)))} credits${r.id === a.primary?.id ? ' (primary)' : ''}</option>`).join('')}</select></label></div>
      <label class="f">Note <span class="muted">optional</span><input name="note" maxlength="300" placeholder="First year of a 3-year deal, bundle of 5…" /></label>
      <div class="flex"><button class="primary" type="submit">${icon('plus')}Record the sale</button>${a.remaining ? `<button type="button" class="ghost" id="sale-rest">Fill in what is still needed (${num(a.remaining)})</button>` : ''}<span class="err" id="sale-err"></span></div></form></details>` : ''}
    ${d.sales.length ? `<div class="tw mt"><table><thead><tr><th>Date</th><th class="num">Credits</th><th>Opportunity / order</th><th>Against</th><th>Note</th><th>Recorded by</th><th></th></tr></thead><tbody>${d.sales.map((x) => `<tr data-sale="${esc(x.id)}"><td>${esc(date(x.date))}</td><td class="num credits">${num(x.credits)}</td><td class="small">${x.opportunityUrl ? `<a href="${esc(x.opportunityUrl)}" target="_blank" rel="noopener noreferrer" class="mono">${esc(x.opportunityId)} ↗</a>` : ''}${x.reference ? `<span class="sub mono">${esc(x.reference)}</span>` : x.opportunityUrl ? '' : '—'}</td><td class="small">${x.reportId ? esc(reportName(x.reportId)) : '—'}</td><td class="small">${esc(x.note || '')}</td><td class="small">${esc(x.by)}<span class="sub">${esc(ago(x.at))}</span></td><td class="actions">${d.can.removeAnySale || x.byId === d.can.me ? `<button class="sm ghost icon" data-unsell title="Remove this sale">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td><b>Total</b></td><td class="num credits">${num(a.sold)}</td><td colspan="5"></td></tr></tfoot></table></div>` : '<p class="muted small mt">No sales recorded yet.</p>'}
  </div>`;
}
function wireSales(a, d) {
  const form = $('#sale');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/sales`, { method: 'POST', body: { credits: Number(f.get('credits')), date: f.get('date'), opportunityUrl: f.get('opportunityUrl'), reference: f.get('reference'), note: f.get('note'), reportId: f.get('reportId') || null } });
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
      <label class="f">Temporary password <span class="muted">blank: one is made</span><span class="flex nowrap"><input name="password" autocomplete="off" spellcheck="false" placeholder="They choose their own at first sign-in" data-nodraft /><button type="button" class="sm" id="gen">Generate</button></span></label></div>
      <label class="check"><input type="checkbox" name="welcome" ${d.mail ? 'checked' : 'disabled'} /><span>Email them a welcome<small>${d.mail ? 'Where to sign in, and how to set their password with "Forgot your password?". The temporary password is never emailed.' : 'Needs the email server (Settings → Email).'}</small></span></label>
      <div class="flex"><button class="primary" type="submit">Add person</button><button type="button" class="ghost" id="add-cancel">Cancel</button><span class="err" id="add-err"></span></div><div id="add-secret"></div></form>` : ''}
    <div class="flex mt"><div class="search">${icon('search')}<input id="q" placeholder="Search people, emails, titles" /></div>
      <select id="f-role"><option value="">All roles</option>${d.roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select>
      <select id="f-team"><option value="">All teams</option>${teams.map((t) => `<option value="${esc(t.id)}">${esc(t.path)}</option>`).join('')}</select>
      <select id="f-status"><option value="">Any status</option>${Object.entries(STATUS).map(([k, [, l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <span class="spacer"></span><span class="muted small" id="count"></span></div>
    ${manage ? `<div class="bulk" id="bulk" hidden><b id="bulk-n"></b>
      <label class="bulk-f">Role<select id="bulk-role"><option value="">—</option>${roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>
      <label class="bulk-f">Team<select id="bulk-team"><option value="">—</option>${teams.map((t) => `<option value="${esc(t.id)}">${esc(t.path)}</option>`).join('')}</select></label>
      <button type="button" class="sm" data-bulk="on">Access on</button><button type="button" class="sm" data-bulk="off">Access off</button>
      ${d.mail ? '<button type="button" class="sm" data-bulk="welcome">Send welcome</button>' : ''}
      <button type="button" class="sm" data-bulk="reset">Reset passwords</button><button type="button" class="sm" data-bulk="signout">Sign out everywhere</button><button type="button" class="sm" data-bulk="unlock">Unlock</button>
      <button type="button" class="sm danger" data-bulk="remove">Remove</button><button type="button" class="sm ghost" id="bulk-clear">Clear</button><span class="muted small" id="bulk-out"></span></div>` : ''}
    <div class="tw mt"><table class="people"><thead><tr>${manage ? '<th class="sel"><input type="checkbox" id="sel-all" title="Select everyone shown by the filters" aria-label="Select everyone shown by the filters" /></th>' : ''}<th>Person</th><th>Role</th><th>Team</th><th>Sign-in</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
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
        ${can('users.impersonate') && !state.me.impersonating && u.id !== state.me.user.id && u.active ? `<button type="button" data-act="impersonate">Sign in as ${esc(u.name)}</button>` : ''}
        <button type="button" data-act="reset">Reset password</button>
        ${u.status === 'locked' ? '<button type="button" data-act="unlock">Unlock now</button>' : ''}
        ${u.sessions ? `<button type="button" data-act="signout">Sign out everywhere (${num(u.sessions)})</button>` : ''}
        <button type="button" data-act="toggle">${u.active ? 'Turn access off' : 'Turn access on'}</button>
        <button type="button" data-act="remove" class="danger">Remove</button></div></details>` : '';
      const self = u.id === state.me.user.id;
      const roleCell = u.manageable && !self ? `<select class="inline-sel" data-inline="role" title="Change ${esc(u.name)}’s role">${roles.some((r) => r.id === u.role) ? '' : `<option value="${esc(u.role)}" selected>${esc(u.roleName)}</option>`}${roles.map((r) => `<option value="${esc(r.id)}"${r.id === u.role ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : `<span class="chip role">${esc(u.roleName)}</span>`;
      const teamCell = u.manageable ? `<select class="inline-sel" data-inline="team" title="Move ${esc(u.name)} to another team">${teams.map((t) => `<option value="${esc(t.id)}"${t.id === u.teamId ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select>` : esc(u.team || '—');
      return `<tr data-id="${esc(u.id)}" class="${selected.has(u.id) ? 'picked' : ''}">${manage ? `<td class="sel">${u.manageable && !self ? `<input type="checkbox" data-sel ${selected.has(u.id) ? 'checked' : ''} aria-label="Select ${esc(u.name)}" />` : ''}</td>` : ''}<td><div class="flex nowrap">${avatar(u.name, u.picture)}<div><b>${esc(u.name)}</b>${u.id === state.me.user.id ? ' <span class="chip">You</span>' : ''}<span class="sub">${esc(u.email)}${u.title ? ` · ${esc(u.title)}` : ''}</span></div></div></td>
        <td data-v="${esc(u.roleName)}">${roleCell}${u.leads.length ? `<span class="sub">Leads ${esc(u.leads.join(', '))}</span>` : ''}</td><td title="${esc(u.teamPath)}" data-v="${esc(u.team || '—')}">${teamCell}</td>
        <td class="small">${u.signIn === 'sso' ? 'Single sign-on' : 'Password'}</td><td><span class="chip ${kind}"><i></i>${label}</span>${u.lockedUntil ? `<span class="sub">until ${esc(new Date(u.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>` : ''}</td>
        <td class="small">${esc(ago(u.lastSignInAt))}</td><td class="actions">${acts}</td></tr>`;
    }).join('') || `<tr><td colspan="${manage ? 8 : 7}"><div class="empty"><b>Nobody matches</b></div></td></tr>`;
    for (const b of $$('[data-act]')) b.onclick = () => personAction(d, d.people.find((u) => u.id === b.closest('tr').dataset.id), b.dataset.act);
    // Role and team, changed right in the row.
    for (const sel of $$('#rows [data-inline]')) {
      sel.onchange = async () => {
        const u = d.people.find((x) => x.id === sel.closest('tr').dataset.id);
        const body = sel.dataset.inline === 'role' ? { role: sel.value } : { teamId: sel.value };
        try {
          await api(`/api/people/${encodeURIComponent(u.id)}`, { method: 'PUT', body });
          toast(`${u.name}: ${sel.dataset.inline === 'role' ? 'role' : 'team'} changed to ${sel.selectedOptions[0].textContent}.`, 'ok');
          d.people = (await peopleList()).people;
          render();
        } catch (error) {
          toast(error.message, 'bad');
          sel.value = sel.dataset.inline === 'role' ? u.role : u.teamId;
        }
      };
    }
    for (const box of $$('#rows [data-sel]')) {
      box.onchange = () => {
        const id = box.closest('tr').dataset.id;
        if (box.checked) selected.add(id);
        else selected.delete(id);
        box.closest('tr').classList.toggle('picked', box.checked);
        bulkBar();
      };
    }
    if ($('#sel-all')) {
      const pickable = all.filter((u) => u.manageable && u.id !== state.me.user.id);
      $('#sel-all').checked = pickable.length > 0 && pickable.every((u) => selected.has(u.id));
      $('#sel-all').indeterminate = !$('#sel-all').checked && pickable.some((u) => selected.has(u.id));
      $('#sel-all').onchange = (e) => {
        for (const u of pickable) e.target.checked ? selected.add(u.id) : selected.delete(u.id);
        render();
      };
    }
    bulkBar();
  };
  // ---- Many at once: the people ticked (across pages and filters), each change made and audited one by one ----
  const selected = new Set();
  const bulkBar = () => {
    if (!$('#bulk')) return;
    $('#bulk').hidden = selected.size === 0;
    $('#bulk-n').textContent = `${num(selected.size)} selected`;
  };
  const runBulk = async (label, fn, { reload = true } = {}) => {
    const people = d.people.filter((u) => selected.has(u.id));
    const failed = [];
    const out = [];
    let n = 0;
    for (const u of people) {
      $('#bulk-out').textContent = `${label}: ${++n} of ${people.length}…`;
      try {
        out.push({ u, r: await fn(u) });
      } catch (error) {
        failed.push(`${u.name}: ${error.message}`);
      }
    }
    $('#bulk-out').textContent = '';
    toast(failed.length ? `${label}: ${num(out.length)} done, ${num(failed.length)} not: ${failed.slice(0, 3).join(' · ')}${failed.length > 3 ? '…' : ''}` : `${label}: done for ${num(out.length)} ${out.length === 1 ? 'person' : 'people'}.`, failed.length ? 'bad' : 'ok', failed.length ? 12000 : 5000);
    if (reload) {
      d.people = (await peopleList()).people;
      for (const id of [...selected]) if (!d.people.some((u) => u.id === id)) selected.delete(id);
      render();
    }
    return out;
  };
  if ($('#bulk')) {
    const P = (u) => `/api/people/${encodeURIComponent(u.id)}`;
    $('#bulk-role').onchange = async (e) => {
      if (!e.target.value) return;
      const name = e.target.selectedOptions[0].textContent;
      if (confirm(`Give ${num(selected.size)} ${selected.size === 1 ? 'person' : 'people'} the role ${name}?`)) await runBulk(`Role → ${name}`, (u) => api(P(u), { method: 'PUT', body: { role: e.target.value } }));
      e.target.value = '';
    };
    $('#bulk-team').onchange = async (e) => {
      if (!e.target.value) return;
      const name = e.target.selectedOptions[0].textContent;
      if (confirm(`Move ${num(selected.size)} ${selected.size === 1 ? 'person' : 'people'} to ${name}?`)) await runBulk(`Team → ${name}`, (u) => api(P(u), { method: 'PUT', body: { teamId: e.target.value } }));
      e.target.value = '';
    };
    $('#bulk-clear').onclick = () => (selected.clear(), render());
    $('#bulk').addEventListener('click', async (e) => {
      const act = e.target.closest('[data-bulk]')?.dataset.bulk;
      if (!act) return;
      const n = `${num(selected.size)} ${selected.size === 1 ? 'person' : 'people'}`;
      if (act === 'on') return runBulk('Access on', (u) => api(P(u), { method: 'PUT', body: { active: true } }));
      if (act === 'off' && confirm(`Turn off access for ${n}? They are signed out at once; their accounts and reports stay with their teams.`)) return runBulk('Access off', (u) => api(P(u), { method: 'PUT', body: { active: false } }));
      if (act === 'welcome' && confirm(`Email a welcome to ${n}?`)) return runBulk('Welcome sent', (u) => api(`${P(u)}/welcome`, { method: 'POST', body: {} }), { reload: false });
      if (act === 'signout' && confirm(`Sign ${n} out on every device?`)) return runBulk('Signed out', (u) => api(`${P(u)}/signout`, { method: 'POST', body: {} }));
      if (act === 'unlock') return runBulk('Unlocked', (u) => api(`${P(u)}/unlock`, { method: 'POST', body: {} }));
      if (act === 'remove' && confirm(`Remove ${n}? Their accounts and reports stay with their teams. This cannot be undone.`)) {
        await runBulk('Removed', (u) => api(P(u), { method: 'DELETE' }));
        return;
      }
      if (act === 'reset' && confirm(`Give ${n} a new temporary password? Their current ones stop working and they are signed out everywhere. The new ones download once, as a sheet.`)) {
        const done = await runBulk('Passwords reset', (u) => api(`${P(u)}/reset`, { method: 'POST', body: {} }));
        if (done.length) {
          const csv = ['Name,Email,Temporary password', ...done.map(({ u, r }) => [u.name, u.email, r.temporary].map(csvCell).join(','))].join('\r\n');
          const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `temporary-passwords-${new Date().toISOString().slice(0, 10)}.csv` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
      }
    });
  }
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
    if (act === 'impersonate') {
      if (!confirm(`Sign in as ${u.name}? You see and work as they do for up to an hour; everything you do is recorded as you acting as them. Their password, profile and sessions stay theirs.`)) return;
      const r = await api(`${path}/impersonate`, { method: 'POST', body: {} });
      location.href = r.home === 'calculator' ? '/calculator' : `/#/${r.home || 'overview'}`;
      if (r.home !== 'calculator') location.reload();
      return;
    }
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
    <div class="tw mt matrix-wrap"><table class="matrix"><thead><tr><th>Permission</th>${d.roles.map((r) => `<th class="rc" title="${esc(r.description)}">${esc(r.name)}<span class="sub">${num(r.holders)} ${r.holders === 1 ? 'person' : 'people'} · home: ${esc(HOME_PAGES.find(([id]) => id === r.home)?.[1] ?? 'Overview')}</span>${edit ? `<button class="sm ghost" data-role-edit="${esc(r.id)}" title="${r.builtin ? 'Rename this role (its permissions stay as ticked below)' : 'Rename, describe or remove this role'}">${r.builtin ? 'Rename' : 'Edit'}</button>` : ''}</th>`).join('')}</tr></thead><tbody id="mx"></tbody></table></div></div>`;
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
        for (const r of changed()) await api(`/api/roles/${encodeURIComponent(r.id)}`, { method: 'PUT', body: { name: r.name, description: r.description, home: r.home, permissions: [...draft[r.id]] } });
        toast('Roles saved.', 'ok');
        viewPeople('roles');
      } catch (error) {
        toast(error.message, 'bad');
      }
    };
    const roleForm = (r) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form class="form" id="rf"><div class="dh"><h2>${r ? `${r.builtin ? 'Rename' : 'Edit'} ${esc(r.name)}` : 'New role'}</h2><p class="small muted">${r ? (r.locked ? 'The name everyone sees. This role always holds every permission.' : 'The name everyone sees, on People, invitations and the import sheet. Who holds it and what it allows stay the same.') : 'Then tick its permissions in the matrix.'}</p></div><div class="db form"><label class="f">Name<input name="name" required maxlength="60" value="${esc(r?.name ?? '')}" /></label><label class="f">Description<input name="desc" maxlength="300" value="${esc(r?.description ?? '')}" /></label><label class="f">Home page <small class="muted">where people with this role land after signing in</small><select name="home">${HOME_PAGES.map(([id, label]) => `<option value="${id}"${(r?.home ?? 'overview') === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>${r ? '' : `<label class="f">Start from<select name="from"><option value="">Nothing</option>${d.roles.filter((x) => !x.locked).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>`}<div class="err" id="rerr"></div></div>
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
          await api(`/api/roles/${encodeURIComponent(r?.id ?? 'new')}`, { method: 'PUT', body: { name: f.get('name'), description: f.get('desc'), home: f.get('home'), permissions: r ? [...draft[r.id]] : (from?.permissions ?? []).filter((p) => can(p) && !d.permissions.find((x) => x.id === p)?.special) } });
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
/**
 * A settings form that saves as it is typed in: `save(form)` is called after a pause (text) or at once (a choice),
 * and when it fails the form shows the last good values again. The status is in `status`.
 */
function autosave(form, save, { status, delay = 700, keep = [] } = {}) {
  const snap = () => Object.fromEntries([...form.elements].filter((el) => el.name && !keep.includes(el.name) && el.type !== 'password' && el.type !== 'file').map((el) => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
  let good = snap();
  let timer = null;
  const say = (t, cls = '') => {
    if (!status) return;
    status.textContent = t;
    status.className = `saved-foot ${cls}`;
  };
  const run = async () => {
    clearTimeout(timer);
    say('Saving…');
    // What is sent now becomes the last good setting once saved (not what is typed meanwhile).
    const sent = snap();
    try {
      const msg = await save(form);
      good = sent;
      say(msg || `All changes are saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (error) {
      // The last good setting stays: on the server, and in the form.
      for (const [name, v] of Object.entries(good)) {
        const el = form.elements[name];
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = v;
        else el.value = v;
      }
      say(`${error.message}${/back\.|kept\./.test(error.message) ? '' : ' The last good setting is kept.'}`, 'bad');
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  form.addEventListener('input', (e) => {
    if (['checkbox', 'radio', 'select-one', 'file'].includes(e.target.type)) return;
    clearTimeout(timer);
    timer = setTimeout(run, e.target.tagName === 'TEXTAREA' ? 1200 : delay);
  });
  form.addEventListener('change', (e) => {
    if (e.target.type === 'file') return;
    run();
  });
  return { run };
}
const SAVES_AS_YOU_TYPE = '<div class="saved-banner">✓ Changes save as you type.</div>';
const ADMIN_TABS = [
  ['general', 'General', 'settings.manage'],
  ['branding', 'Branding', 'settings.manage'],
  ['email', 'Email (SMTP)', 'settings.manage'],
  ['sso', 'Single sign-on', 'security.sso'],
  ['https', 'HTTPS', 'security.https'],
  ['updates', 'Updates', 'system.update'],
  ['backups', 'Backups & health', 'backup.manage'],
  ['help', 'Get help', 'settings.manage'],
  // About: for whoever sees Settings (everyone else finds it at the foot of the menu).
  ['about', 'About', null],
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
  const tabs = ADMIN_TABS.filter(([, , p]) => p && can(p)).length ? ADMIN_TABS.filter(([, , p]) => !p || can(p)) : [];
  if (!tabs.length) return go(home());
  adminTab = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  if (location.hash !== `#/admin/${adminTab}`) history.replaceState(null, '', `#/admin/${adminTab}`);
  shell('admin', `<div class="head compact"><div class="ht"><h1 class="serif">Settings</h1><span class="crumbs">for the whole command center \u00b7 Admins only</span></div></div>
    <nav class="tabs" role="tablist">${tabs.map(([id, label]) => `<a role="tab" href="#/admin/${id}" class="${id === adminTab ? 'on' : ''}" aria-selected="${id === adminTab}">${esc(label)}</a>`).join('')}</nav><div id="tab">${loading()}</div>`);
  try {
    await ADMIN_VIEWS[adminTab]();
  } catch (error) {
    if (error.status !== 401) $('#tab').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
  }
}

const ADMIN_VIEWS = {
  // Get help: where support cases and enhancement requests go (saved as they change; a refused one goes back).
  async help() {
    const me = await api('/api/me');
    const sup = me.support ?? { mode: 'portal', email: 'bhawani.singh@checkmarx.com' };
    $('#tab').innerHTML = `<div class="saved-banner">✓ Changes save as you type.</div>
      <div class="panel"><h2>Get help <small>where support cases and enhancement requests go when people use Get help in the menu</small></h2>
      <form class="form" id="supf" autocomplete="off">
        <label class="check"><input type="radio" name="mode" value="portal" ${sup.mode !== 'email' ? 'checked' : ''} /><span><b>Support portal in the command center</b><small>A form, a numbered queue (SUP-0001, ENH-0001) and email updates. Every new request and answer is emailed to the address below; people with “Answer support cases &amp; enhancements” answer them here.</small></span></label>
        <label class="check"><input type="radio" name="mode" value="email" ${sup.mode === 'email' ? 'checked' : ''} /><span><b>Email</b><small>Get help opens each person’s own email app, addressed to the address below, with the details filled in. For a server that cannot send email.</small></span></label>
        <label class="f">Send requests to<input type="email" name="email" value="${esc(sup.email)}" placeholder="support@company.com" /></label>
        <p class="muted small">In the portal, the emails go out through the email server (Settings → Email (SMTP)); until it is set up and tested, requests are kept here and the page says the email could not be sent.</p>
      </form><div class="saved-foot" id="supsaved">All changes are saved.</div></div>`;
    autosave($('#supf'), async (form) => {
      const r = await api('/api/settings/support', { method: 'PUT', body: { mode: form.querySelector('input[name=mode]:checked')?.value ?? 'portal', email: form.elements.email.value } });
      state.me.support = r;
    }, { status: $('#supsaved') });
  },
  async about() {
    $('#tab').innerHTML = await aboutHtml();
  },
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
    $('#tab').innerHTML = SAVES_AS_YOU_TYPE + smtpPanel(m).replace('<div class="panel mt">', '<div class="panel">');
    wireSmtp(m);
  },

  async sso() {
    const x = await api('/api/settings/sso');
    const chip = x.ready ? '<span class="chip ok"><i></i>On</span>' : x.enabled ? '<span class="chip warn"><i></i>On, but PUBLIC_URL is missing</span>' : '<span class="chip"><i></i>Off</span>';
    $('#tab').innerHTML = `${SAVES_AS_YOU_TYPE}<div class="grid g2">
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
        </form><div class="saved-foot" id="ssosaved">All changes are saved.</div></div>
      <div class="panel"><h2>This service, for the identity provider</h2>
        ${x.sp ? `<dl class="kv"><dt>Entity ID (audience)</dt><dd class="mono">${esc(x.sp.entityId)}</dd><dt>Reply URL (ACS)</dt><dd class="mono">${esc(x.sp.acs)}</dd><dt>Sign-on URL</dt><dd class="mono">${esc(x.sp.login)}</dd><dt>Metadata</dt><dd><a href="/saml/metadata" target="_blank" rel="noopener">${esc(x.sp.metadata)}</a></dd><dt>Name ID</dt><dd class="mono">emailAddress</dd></dl>
        <div class="callout mt">In your identity provider, add an enterprise application (SAML) with the Entity ID and Reply URL above, send the work email as the NameID or the email attribute, and assign the Sales Engineers and leaders. Then paste its SSO URL and signing certificate here.</div>` : '<div class="callout warn">Set <b>PUBLIC_URL</b> to the https address people use, and restart: the identity provider needs it.</div>'}
      </div></div>`;
    autosave($('#ssof'), async (form) => {
      const f = new FormData(form);
      const body = { entryPoint: f.get('entryPoint'), idpIssuer: f.get('idpIssuer'), emailAttribute: f.get('emailAttribute'), nameAttribute: f.get('nameAttribute'), wantResponseSigned: f.get('wantResponseSigned') === 'on', label: f.get('label'), jit: f.get('jit') === 'on', jitRole: f.get('jitRole'), jitTeamId: f.get('jitTeamId'), passwordSignIn: f.get('passwordSignIn'), enabled: f.get('enabled') === 'on' };
      if (String(f.get('idpCert') ?? '').trim()) body.idpCert = f.get('idpCert');
      await api('/api/settings/sso', { method: 'PUT', body });
      if (form.elements.idpCert) form.elements.idpCert.value = '';
    }, { status: $('#ssosaved') });
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
        </form><div class="saved-foot" id="hardsaved">Saved as you change it.</div>
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
    autosave($('#hard'), async (form) => {
      const f = new FormData(form);
      await api('/api/https/hardening', { method: 'POST', body: { minVersion: f.get('minVersion'), hsts: { enabled: f.get('hsts') === 'on', includeSubDomains: f.get('sub') === 'on', maxAge: Number(f.get('maxAge')) } } });
    }, { status: $('#hardsaved') });
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
          <div class="ur-card"><small>Latest published</small><b>${newest ? esc(label(newest.version)) : u.lastCheck?.newest ? esc(label(u.lastCheck.newest)) : '—'}</b><span>${avail ? `${esc(label(avail.version))} is ready.` : 'Up to date.'} ${u.lastCheck?.at ? `Checked ${esc(dateTime(u.lastCheck.at))}` : 'Not checked yet'}</span>${avail ? `<button class="sm primary mt" data-update-now="${esc(avail.version)}">Update now</button>` : ''}${u.lastCheck?.error && u.lastCheck.failedAt > (u.lastCheck.at ?? '') ? `<span class="bad-t">Last try: ${esc(u.lastCheck.error)}</span>` : ''}</div>
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
          return `<div class="tw"><table class="versions" id="versions-t"><thead><tr><th>Version</th><th>SHA-256 (kept)</th><th>First seen</th><th>State</th><th></th></tr></thead><tbody>${all.map((v, idx) => {
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
            // The newest three, and the running one; older ones folded away.
            return `<tr data-v="${esc(v)}"${idx >= 3 && !running ? ' class="v-older"' : ''}><td><b>${esc(v)}</b>${r?.publishedAt ? `<span class="sub">published ${esc(date(r.publishedAt))}</span>` : ''}${notes}</td><td>${t ? `<code class="small" title="${esc(t.sha256)}">${esc(t.sha256.slice(0, 12))}…${esc(t.sha256.slice(-6))}</code>` : '<span class="muted small">—</span>'}</td><td class="small">${t ? esc(dateTime(t.firstSeen)) : ''}</td><td>${state}</td><td class="actions">${action}</td></tr>`;
          }).join('')}</tbody></table></div>${all.filter((v, i) => i >= 3 && v !== u.running).length ? `<button type="button" class="link mt" id="v-more">Show ${all.filter((v, i) => i >= 3 && v !== u.running).length} older versions \u25be</button>` : ''}`;
        })()}
        <p class="muted small mt">Always on the newest version: a newer release is installed and switched to by itself. <b>Roll back to this</b> moves to an older one (a backup is taken first, and there is no restart); the version you left is then not put back by itself until a newer release comes.</p></div>
      <div class="panel"><h2>Recent events</h2>${u.events.length ? `<div class="tw"><table><tbody>${u.events.map((e) => `<tr><td class="small">${esc(dateTime(e.at))}</td><td><span class="chip ${/fail|refused|rolled|changed/.test(e.type) ? 'bad' : 'ok'}"><i></i>${esc(ev[e.type] ?? e.type)}</span></td><td class="small">${esc([e.version, e.from && `from ${e.from}`, e.to && `to ${e.to}`, e.why || e.error || e.reason, e.by && `by ${e.by}`].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing yet.</p>'}</div>
    </div>`;
    const busy = (b, text) => {
      b.disabled = true;
      b.innerHTML = `<span class="spinner"></span>${esc(text)}`;
    };
    $('#v-more')?.addEventListener('click', (e) => {
      const t = $('#versions-t');
      t.classList.toggle('show-all');
      e.target.textContent = t.classList.contains('show-all') ? 'Show only the newest \u25b4' : e.target.textContent.replace('\u25b4', '\u25be');
    });
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
    <p class="muted small">Used for "Forgot your password?" links and welcome emails. Saved as you type and tested with the mail server at once; settings that fail give way to the last ones that worked. The password is kept encrypted and never shown again.</p>
    <form class="form" id="smtp" data-nodraft data-password-set="${x.passwordSet ? '1' : ''}">
      <div class="row"><label class="f">Mail server<input name="host" value="${esc(x.host)}" placeholder="smtp.office365.com" autocomplete="off" /></label><label class="f">Port<input name="port" type="number" min="1" max="65535" value="${esc(x.port)}" /></label></div>
      <div class="row"><label class="check"><input type="checkbox" name="secure" ${x.secure ? 'checked' : ''} /><span>Implicit TLS<small>On for port 465. Off for 587 and 25, where STARTTLS is required whenever a password is sent.</small></span></label>
      <label class="check"><input type="checkbox" name="rejectUnauthorized" ${x.rejectUnauthorized !== false ? 'checked' : ''} /><span>Check the mail server's certificate<small>Leave on. For a private CA, set NODE_EXTRA_CA_CERTS on the server instead.</small></span></label></div>
      <label class="check"><input type="checkbox" name="requireAuth" ${x.requireAuth ? 'checked' : ''} /><span>The server needs a sign-in</span></label>
      <div class="row"><label class="f">User name<input name="user" value="${esc(x.user)}" autocomplete="off" /></label><label class="f">Password<input name="password" type="password" autocomplete="new-password" placeholder="${x.passwordSet ? 'Kept: type to replace' : ''}" /></label></div>
      <div class="row"><label class="f">From name<input name="fromName" value="${esc(x.fromName)}" /></label><label class="f">From address<input name="fromAddress" type="email" value="${esc(x.fromAddress)}" placeholder="Same as the user name" /></label></div>
      <div class="row"><label class="f">Who may reset a forgotten password by email<select name="passwordReset"><option value="everyone"${m.passwordReset === 'everyone' ? ' selected' : ''}>Everyone</option><option value="not-admins"${m.passwordReset === 'not-admins' ? ' selected' : ''}>Everyone but those who manage people</option><option value="off"${m.passwordReset === 'off' ? ' selected' : ''}>Nobody: Admins reset passwords</option></select></label>
      <label class="f">Links in emails point at<input value="${esc(m.publicUrl || 'PUBLIC_URL is not set')}" disabled /></label></div>
      ${m.reset.ready ? '<div class="callout">"Forgot your password?" is working.</div>' : `<div class="callout warn">"Forgot your password?" is not available yet: ${m.reset.missing.map(esc).join(' ')}</div>`}
      <div class="flex"><button type="button" id="smtp-test">Test connection</button><input id="smtp-to" type="email" placeholder="Send a test to (you by default)" class="grow" /><button type="button" id="smtp-send">Send test email</button></div>
      <div class="small" id="smtp-msg" aria-live="polite"></div>
    </form><div class="saved-foot" id="smtpsaved">All changes are saved.</div></div>`;
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
  // Saved as typed, and tested with the mail server at once: settings that fail give way to the last ones that worked.
  autosave(form, async () => {
    const f = new FormData(form);
    const smtp = { host: f.get('host'), port: Number(f.get('port')), secure: f.get('secure') === 'on', requireAuth: f.get('requireAuth') === 'on', rejectUnauthorized: f.get('rejectUnauthorized') === 'on', user: f.get('user'), fromName: f.get('fromName'), fromAddress: f.get('fromAddress') };
    if (f.get('password')) smtp.password = f.get('password');
    const ready = smtp.host && (!smtp.requireAuth || (smtp.user && (f.get('password') || form.dataset.passwordSet === '1')));
    await api('/api/settings/smtp', { method: 'PUT', body: { smtp, passwordReset: f.get('passwordReset'), test: Boolean(ready) } });
    if (f.get('password')) form.elements.password.value = '';
    return ready ? 'All changes are saved \u2713 and the mail server answered: email can be sent.' : 'All changes are saved \u2713 (give the server and sign-in, and it is tested at once).';
  }, { status: $('#smtpsaved'), delay: 1200 });
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
  const VERDICT = { failed: ['bad', 'Needs attention'], recovered: ['ok', 'Recovered by itself'], expected: ['', 'Expected'] };
  const why = (x) => (x ? `<details class="why ${x.verdict}"><summary><span class="chip ${VERDICT[x.verdict][0]}"><i></i>${VERDICT[x.verdict][1]}</span> ${esc(x.why)}</summary><b>Done:</b> ${esc(x.done)}<br /><b>Next time:</b> ${esc(x.next)}</details>` : '');
  const row = (e) => `<tr class="${e.ok === false ? (e.explain && e.explain.verdict !== 'failed' ? 'recovered' : 'refused') : ''}"><td class="small nowrap">${esc(dateTime(e.at))}</td><td>${esc(e.user?.name ?? '—')}<span class="sub">${esc(e.user?.email ?? '')}</span></td><td><span class="chip ${e.ok === false ? 'bad' : e.kind === 'report' ? 'ok' : ''}"><i></i>${esc(ACT_KINDS.find(([k]) => k === e.kind)?.[1] ?? e.kind)}</span></td><td class="mono small">${esc(e.tenant ?? '')}</td><td>${e.account ? `<a href="#/accounts/${encodeURIComponent(e.account.id)}">${esc(e.account.name)}</a>` : '<span class="muted">—</span>'}</td><td class="mono small">${e.method ? `${esc(e.method)} ${esc(e.path ?? '')}` : esc(e.detail ?? '')}</td><td class="small nowrap">${e.status ? `<b>${esc(e.status)}</b> · ` : ''}${e.ms !== undefined ? `${num(e.ms)} ms` : ''}${e.method && e.detail ? `<span class="sub">${esc(e.detail)}</span>` : ''}${why(e.explain)}</td></tr>`;
  $('#main').innerHTML = `<div class="head"><div><div class="crumbs">Work</div><h1 class="serif">CxOne API audit</h1><p>Every call made to a customer’s Checkmarx One tenant, on whose behalf and for which account, with its result and time; and every connection, tenant read and report generated. You see your own and that of the teams you see.</p></div>
      <div class="tools"><label class="switch"><input type="checkbox" id="onlyme" ${onlyMe ? 'checked' : ''} /><span>Only me</span></label></div></div>
    <div class="kpis five">
      <div class="kpi"><div class="k">API calls · 30 days</div><div class="v">${num(sm.calls)}</div><div class="s">${num(sm.avgMs)} ms on average</div></div>
      <div class="kpi ${sm.attention ? 'warn' : ''}"><div class="k">Failures needing attention</div><div class="v">${num(sm.attention)}</div><div class="s">${num(sm.recovered)} recovered by themselves · ${num(sm.avoided ?? 0)} avoided (learned)</div></div>
      <div class="kpi"><div class="k">Tenants</div><div class="v">${num(sm.tenants)}</div><div class="s">${num(sm.connects)} connection${sm.connects === 1 ? '' : 's'}</div></div>
      <div class="kpi"><div class="k">Tenant reads</div><div class="v">${num(sm.reads)}</div><div class="s">finished</div></div>
      <div class="kpi"><div class="k">Reports generated</div><div class="v">${num(sm.reports)}</div><div class="s">in the calculator</div></div>
    </div>
    ${d.analysis?.length ? `<details class="panel why-panel"${sm.attention ? ' open' : ''}><summary><h2>Why calls did not succeed <small>${sm.attention ? `${num(sm.attention)} need${sm.attention === 1 ? 's' : ''} attention · ` : 'nothing needs attention · '}each kind, with what was done and what happens next time · last 30 days</small></h2></summary>
      <div class="tw"><table class="why-table"><thead><tr><th>Verdict</th><th>Request</th><th class="num">Calls</th><th>Why</th><th>What was done</th><th>Next time</th><th>Last</th></tr></thead><tbody>${d.analysis.map((g) => `<tr class="${g.verdict === 'failed' ? 'refused' : ''}"><td data-v="${esc(VERDICT[g.verdict][1])}"><span class="chip ${VERDICT[g.verdict][0]}"><i></i>${VERDICT[g.verdict][1]}</span></td><td class="mono small">${esc(g.method)} ${esc(g.path)} <b>${esc(g.status)}</b><span class="sub">${esc(g.tenants.join(', '))}</span></td><td class="num">${num(g.count)}</td><td class="small">${esc(g.why)}</td><td class="small">${esc(g.done)}</td><td class="small">${esc(g.next)}</td><td class="small nowrap" data-sort="${esc(g.last)}">${esc(ago(g.last))}</td></tr>`).join('')}</tbody></table></div>
      ${d.learned?.length ? `<div class="learned mt">${d.learned.map((t) => `<span class="chip ok"><i></i><b class="mono">${esc(t.tenant)}</b>&nbsp;learned: ${num(t.noSastMeta)} scan${t.noSastMeta === 1 ? '' : 's'} without SAST metadata${t.skipped.length ? ` · ${num(t.skipped.length)} optional API${t.skipped.length === 1 ? '' : 's'} not offered` : ''}${t.slow ? ' · asked to slow down once' : ''} · ${num(t.avoided)} call${t.avoided === 1 ? '' : 's'} avoided</span>`).join(' ')}</div>` : ''}</details>` : ''}
    <div class="panel"><form class="filters" id="actf">
      ${multiPick('who', 'People', d.people.map((p) => [p.id, p.id === d.me ? `${p.name} (me)` : p.name]), new Set([...f.who].map((x) => (x === 'me' ? d.me : x))))}
      ${multiPick('tenant', 'Tenant', d.tenants.map((t) => [t, t]), f.tenant)}
      ${multiPick('kind', 'What', ACT_KINDS, f.kind)}
      ${multiPick('account', 'Account', d.accounts.map((a) => [a.id, a.name]), f.account)}
      <label class="f">Outcome<select name="outcome"><option value="">All</option><option value="ok"${f.outcome === 'ok' ? ' selected' : ''}>Succeeded</option><option value="attention"${f.outcome === 'attention' ? ' selected' : ''}>Needs attention</option><option value="recovered"${f.outcome === 'recovered' ? ' selected' : ''}>Recovered by itself</option><option value="failed"${f.outcome === 'failed' ? ' selected' : ''}>Any that did not succeed</option></select></label>
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
  // Filters apply as they change; Apply stays for a change made midway.
  let applyTimer = null;
  $('#actf').addEventListener('change', () => {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 450);
  });
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
/** About, as CxMissionZero lays it out: one panel of facts and the terms card, then every version. */
async function aboutHtml() {
  const me = state.me;
  const b = state.branding ?? {};
  const log = await fetch('/legal/changelog').then((r) => r.text()).catch(() => '');
  const versions = log.replace(/^# .*\n/, '').split(/\n(?=## )/).filter((x) => x.startsWith('## '));
  const accepted = me.terms?.accepted;
  return `<div class="panel about">
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
}
async function viewAbout(params) {
  // Whoever sees Settings finds About there, with the other tabs.
  if (ADMIN_TABS.some(([, , p]) => p && can(p)) && !params?.get?.('doc')) return go('/admin/about');
  shell('', loading());
  $('#main').innerHTML = `<div class="head compact"><div class="ht"><h1 class="serif">About</h1></div></div>${await aboutHtml()}`;
  if (params?.get?.('doc')) openDoc(params.get('doc'));
}
// ---- Fusion engines & rates: the Admin's list and default engine; each team's own (leaders and above) -------------
const rateText = (n) => (n === null || n === undefined || n === '' ? '' : String(n));
async function viewRates(params) {
  shell('rates', loading());
  let d;
  try {
    d = await api('/api/fusion-rates');
  } catch (error) {
    $('#main').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
    return;
  }
  const teamId = d.teams.some((t) => t.id === params?.get?.('team')) ? params.get('team') : d.teams.some((t) => t.id === d.myTeamId) ? d.myTeamId : d.teams[0]?.id;
  const team = d.teams.find((t) => t.id === teamId);
  const adminRows = d.admin.models.map((m, i) => `<tr data-i="${i}"><td><input name="name" maxlength="80" value="${esc(m.name)}" placeholder="Engine, as Checkmarx One names it" /></td>
      <td class="num"><input name="rate" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(rateText(m.creditsPer10k))}" placeholder="needs a rate" class="${m.creditsPer10k ? '' : 'need'}" /></td>
      <td class="c"><input type="radio" name="default" value="${i}" ${m.name === d.admin.defaultModel ? 'checked' : ''} aria-label="Default engine" /></td>
      <td class="actions"><button type="button" class="sm ghost icon" data-del title="Remove this engine">${icon('trash')}</button></td></tr>`).join('');
  const detected = d.detected.length
    ? `<div class="panel mt"><h2>Seen without a rate <small>engines a customer’s Checkmarx One offers that have no rate yet: until one is set, Fusion counts them at 0</small></h2>
      <div class="tw"><table><thead><tr><th>Engine</th><th>First seen</th><th>Last seen</th><th>Tenant</th><th>By</th>${d.canAdmin ? '<th class="num">Rate for everyone</th>' : ''}${d.canTeams && team ? `<th class="num">Rate for ${esc(team.name)}</th>` : ''}</tr></thead><tbody>${d.detected.map((x) => `<tr data-name="${esc(x.name)}"><td><b>${esc(x.name)}</b><span class="chip warn"><i></i>needs a rate</span></td><td data-sort="${esc(x.firstSeen)}">${esc(dateTime(x.firstSeen))}</td><td data-sort="${esc(x.lastSeen)}">${esc(ago(x.lastSeen))}</td><td class="mono small">${esc(x.tenant || '—')}</td><td>${esc(x.by || '—')}</td>${d.canAdmin ? '<td class="num"><input type="number" min="0" step="0.1" class="det-admin" placeholder="credits / 10K LOC" /></td>' : ''}${d.canTeams && team ? '<td class="num"><input type="number" min="0" step="0.1" class="det-team" placeholder="credits / 10K LOC" /></td>' : ''}</tr>`).join('')}</tbody></table></div></div>`
    : '';
  const eff = team?.effective;
  const own = team?.own?.rates ?? {};
  const keyOf = (n) => String(n ?? '').toLowerCase().replace(/\b(claude|anthropic)\b/g, '').replace(/[^a-z0-9]+/g, '');
  const teamRows = eff ? eff.models.map((m) => {
    const mine = own[keyOf(m.name)];
    const from = m.from === 'team' ? (m.fromTeam?.id === team.id ? `<span class="chip ok"><i></i>${esc(team.name)}’s own</span>` : `<span class="chip"><i></i>from ${esc(m.fromTeam?.name ?? 'a team above')}</span>`) : m.creditsPer10k ? '<span class="chip"><i></i>the Admin’s</span>' : '<span class="chip warn"><i></i>no rate</span>';
    return `<tr data-name="${esc(m.name)}"><td><b>${esc(m.name)}</b>${m.name === eff.defaultModel ? ' <span class="chip star">Default</span>' : ''}</td><td class="num">${m.admin ? num(m.admin, 3) : '—'}</td>
      <td class="num"><input type="number" min="0" step="0.1" class="team-rate" value="${esc(rateText(mine?.creditsPer10k))}" placeholder="${esc(m.creditsPer10k && !mine ? `${num(m.creditsPer10k, 3)} (as now)` : 'Admin’s')}" ${d.canTeams ? '' : 'disabled'} /></td>
      <td class="num credits" data-sort="${m.creditsPer10k ?? 0}">${m.creditsPer10k ? num(m.creditsPer10k, 3) : '—'}</td><td>${from}</td>
      <td class="actions">${mine && d.canTeams ? '<button type="button" class="sm ghost" data-back>↺ Back to the Admin’s rate</button>' : ''}</td></tr>`;
  }).join('') : '';
  $('#main').innerHTML = `
    <div class="head compact"><div class="ht"><h1 class="serif">Fusion engines &amp; rates</h1><span class="crumbs">credits per 10K lines of code for each AI engine · the calculator applies them by itself, and they can still be changed there for one customer</span></div>
      <div class="tools"><a class="btn primary" href="/calculator">${icon('calc')}Open calculator</a></div></div>
    <div class="saved-banner">✓ Changes save as you type; a change that does not work goes back to the last good one.</div>
    ${d.canAdmin ? `<div class="panel"><h2>For everyone <small>the Admin’s rates and the default engine for Fusion; leaders may set their team’s own below</small></h2>
      <form id="rates-admin" class="form" autocomplete="off" data-nodraft><div class="tw"><table class="rates"><thead><tr><th>Engine</th><th class="num">Credits per 10K LOC</th><th class="c">Default engine</th><th></th></tr></thead><tbody>${adminRows}</tbody></table></div>
      <div class="flex mt"><button type="button" class="sm" id="add-engine">${icon('plus')}Add an engine</button><span class="muted small">Name it as Checkmarx One does (“Opus 5.5”, “claude-opus-5-5” and “Claude Opus 5.5” are the same engine).</span></div></form>
      <div class="saved-foot" id="rates-saved">All changes are saved.</div></div>`
    : `<div class="panel"><h2>The Admin’s rates <small>for everyone, unless a team sets its own</small></h2><div class="tw"><table><thead><tr><th>Engine</th><th class="num">Credits per 10K LOC</th></tr></thead><tbody>${d.admin.models.map((m) => `<tr><td><b>${esc(m.name)}</b>${m.name === d.admin.defaultModel ? ' <span class="chip star">Default</span>' : ''}</td><td class="num">${m.creditsPer10k ? num(m.creditsPer10k, 3) : '<span class="chip warn"><i></i>needs a rate</span>'}</td></tr>`).join('')}</tbody></table></div></div>`}
    <div class="panel mt"><h2>Triage &amp; remediation credits <small>per finding, for everyone: ${d.canAdmin ? 'only you (the Admin) can change them; the calculator and the reports show them as they are' : 'set by the Admin; the calculator and the reports use them as they are'}</small></h2>
      <form id="tr-rates" class="form" autocomplete="off" data-nodraft><div class="tw"><table class="rates"><thead><tr><th>Severity</th><th class="num">Credits to triage one</th><th class="num">Credits to remediate one</th></tr></thead><tbody>${['Critical', 'High', 'Medium', 'Low'].map((sv) => `<tr><td><b>${sv}</b></td><td class="num">${d.canAdmin ? `<input type="number" min="0" max="1000" step="0.5" name="t-${sv}" value="${esc(d.trRates.triageCost[sv])}" aria-label="${sv}: credits to triage one finding" />` : num(d.trRates.triageCost[sv], 3)}</td><td class="num">${d.canAdmin ? `<input type="number" min="0" max="1000" step="0.5" name="r-${sv}" value="${esc(d.trRates.remediationCost[sv])}" aria-label="${sv}: credits to remediate one finding" />` : num(d.trRates.remediationCost[sv], 3)}</td></tr>`).join('')}</tbody></table></div></form>
      ${d.canAdmin ? '<div class="saved-foot" id="tr-saved">All changes are saved.</div>' : ''}</div>
    ${team ? `<div class="panel mt"><h2>For a team <small>leaders and above: your team’s own rate, used by its people and the teams below it (unless they set theirs)</small></h2>
      <div class="row"><label class="f">Team<select id="rates-team">${d.teams.map((t) => `<option value="${esc(t.id)}"${t.id === team.id ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select></label>
      <label class="f">Default engine for Fusion<select id="team-default" ${d.canTeams ? '' : 'disabled'}><option value="">The Admin’s${eff.defaultFrom === 'admin' || !team.own?.defaultModel ? '' : ''} (${esc(d.admin.defaultModel || 'none')})</option>${eff.models.map((m) => `<option${team.own?.defaultModel === m.name ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label></div>
      <div class="tw mt"><table><thead><tr><th>Engine</th><th class="num">Admin’s rate</th><th class="num">${esc(team.name)}’s own</th><th class="num">Applies</th><th>From</th><th></th></tr></thead><tbody id="team-rows">${teamRows}</tbody></table></div>
      <div class="saved-foot" id="team-saved">${team.own ? 'This team has its own rates.' : 'This team uses the Admin’s rates.'}</div></div>` : ''}
    ${detected}`;
  // ---- the Admin's list: saved as typed; a change the server refuses goes back to what it had ----
  const form = $('#rates-admin');
  if (form) {
    let good = d.admin;
    let timer = null;
    const read = () => {
      const rows = [...form.querySelectorAll('tbody tr')];
      const models = rows.map((r) => ({ name: r.querySelector('[name=name]').value.trim(), creditsPer10k: r.querySelector('[name=rate]').value })).filter((m) => m.name);
      const di = rows.findIndex((r) => r.querySelector('[name=default]').checked);
      return { models, defaultModel: di >= 0 ? rows[di].querySelector('[name=name]').value.trim() : '' };
    };
    const say = (t, bad) => {
      $('#rates-saved').textContent = t;
      $('#rates-saved').classList.toggle('bad', Boolean(bad));
    };
    const save = async () => {
      clearTimeout(timer);
      say('Saving…');
      try {
        const r = await api('/api/fusion-rates', { method: 'PUT', body: read() });
        good = r.admin;
        say(`All changes are saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        say(`${error.message} The last good rates are kept.`, true);
        setTimeout(() => viewRates(new URLSearchParams(team ? `team=${team.id}` : '')).then(() => say(`${error.message} The last good rates are kept.`, true)), 1600);
        void good;
      }
    };
    form.addEventListener('input', (e) => {
      if (e.target.type === 'radio') return;
      e.target.classList.toggle('need', e.target.name === 'rate' && !e.target.value);
      clearTimeout(timer);
      timer = setTimeout(save, 700);
    });
    form.addEventListener('change', (e) => e.target.type === 'radio' && save());
    form.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      const row = del.closest('tr');
      if (!confirm(`Remove ${row.querySelector('[name=name]').value || 'this engine'} from the list? Teams’ own rates for it are kept.`)) return;
      row.remove();
      save();
    });
    $('#add-engine').onclick = () => {
      const body = form.querySelector('tbody');
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><input name="name" maxlength="80" placeholder="Engine, as Checkmarx One names it" /></td><td class="num"><input name="rate" type="number" min="0" step="0.1" inputmode="decimal" placeholder="needs a rate" class="need" /></td><td class="c"><input type="radio" name="default" aria-label="Default engine" /></td><td class="actions"><button type="button" class="sm ghost icon" data-del title="Remove this engine">' + icon('trash') + '</button></td>';
      body.append(tr);
      tr.querySelector('input').focus();
    };
  }
  // ---- triage & remediation credits: the Admin's, saved as typed; a refused change goes back to the last good one ----
  if (d.canAdmin && $('#tr-rates')) {
    autosave($('#tr-rates'), async (form) => {
      const body = { triageCost: {}, remediationCost: {} };
      for (const sv of ['Critical', 'High', 'Medium', 'Low']) {
        body.triageCost[sv] = form.elements[`t-${sv}`].value;
        body.remediationCost[sv] = form.elements[`r-${sv}`].value;
      }
      await api('/api/tr-rates', { method: 'PUT', body });
    }, { status: $('#tr-saved') });
  }
  // ---- a team's own: each rate saved as typed; "Back to the Admin's rate" removes it ----
  const teamSay = (t, bad) => {
    if (!$('#team-saved')) return;
    $('#team-saved').textContent = t;
    $('#team-saved').classList.toggle('bad', Boolean(bad));
  };
  const saveTeam = async (body, again = true) => {
    teamSay('Saving…');
    try {
      await api(`/api/fusion-rates/teams/${encodeURIComponent(team.id)}`, { method: 'PUT', body });
      if (again) await viewRates(new URLSearchParams(`team=${team.id}`));
      teamSay(`All changes are saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (error) {
      await viewRates(new URLSearchParams(`team=${team.id}`));
      teamSay(`${error.message} The last good rates are kept.`, true);
    }
  };
  if ($('#rates-team')) $('#rates-team').onchange = (e) => viewRates(new URLSearchParams(`team=${e.target.value}`));
  if ($('#team-default')) $('#team-default').onchange = (e) => saveTeam({ defaultModel: e.target.value });
  if ($('#team-rows')) {
    const timers = new Map();
    $('#team-rows').addEventListener('input', (e) => {
      if (!e.target.classList.contains('team-rate')) return;
      const name = e.target.closest('tr').dataset.name;
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(() => saveTeam({ rates: { [name]: e.target.value === '' ? null : e.target.value } }, false), 800));
    });
    $('#team-rows').addEventListener('click', (e) => {
      if (!e.target.closest('[data-back]')) return;
      saveTeam({ rates: { [e.target.closest('tr').dataset.name]: null } });
    });
  }
  // ---- engines seen without a rate: one typed here is set for everyone, or for the team ----
  for (const input of $$('.det-admin, .det-team')) {
    input.addEventListener('change', async () => {
      const name = input.closest('tr').dataset.name;
      if (!input.value) return;
      if (input.classList.contains('det-team')) return saveTeam({ rates: { [name]: input.value } });
      try {
        await api('/api/fusion-rates', { method: 'PUT', body: { models: [...d.admin.models, { name, creditsPer10k: input.value }], defaultModel: d.admin.defaultModel } });
        toast(`${name}: ${input.value} credits per 10K LOC, for everyone.`, 'ok');
      } catch (error) {
        toast(error.message, 'bad');
      }
      viewRates(new URLSearchParams(team ? `team=${team.id}` : ''));
    });
  }
}

// ---- Get help: support cases and enhancement requests ---------------------------------------------------------------
// Everyone raises their own and follows them; the support team ("Answer support cases & enhancements") sees them all,
// answers, and moves each one on. Every new request and answer is emailed to the support address (Settings → Get help).
const HELP_STATUS = { new: ['New', ''], 'in-progress': ['In progress', 'ok'], waiting: ['Waiting for reply', 'warn'], completed: ['Completed', 'ok'], declined: ['Declined', ''] };
const HELP_KIND = { case: 'Support case', enhancement: 'Enhancement' };
const HELP_PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const helpChip = (st) => `<span class="chip ${HELP_STATUS[st]?.[1] ?? ''}"><i></i>${esc(HELP_STATUS[st]?.[0] ?? st)}</span>`;
const helpState = { filter: { kind: '', status: 'open', whose: 'mine' }, justRaised: '', emailed: null };
function supportMailto(kind) {
  const isCase = kind === 'case';
  const me = state.me.user;
  const body = [isCase ? 'What happened:' : 'What I would like:', '', '', isCase ? 'What I expected:' : 'Who it helps, and how I would use it:', '', '', ...(isCase ? ['Steps to see it:', '', '', 'Priority (low, normal, high, urgent): normal', ''] : []), '---', `From: ${me.name} <${me.email}>`, `Version: ${state.me.versionLabel}`, `Server: ${location.origin}`].join('\n');
  return `mailto:${state.me.support.email}?subject=${encodeURIComponent(isCase ? 'Support case: ' : 'Enhancement request: ')}&body=${encodeURIComponent(body)}`;
}
async function viewHelp(view) {
  shell('help', loading());
  const byEmail = state.me.support?.mode === 'email';
  let d;
  try {
    d = await api('/api/support');
  } catch (error) {
    $('#main').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
    return;
  }
  if (d.team && !helpState.teamSeen) {
    helpState.filter.whose = 'all';
    helpState.teamSeen = true;
  }
  const caseHref = byEmail ? supportMailto('case') : '#/help/case';
  const enhHref = byEmail ? supportMailto('enhancement') : '#/help/enhancement';
  $('#main').innerHTML = `
    <div class="head compact"><div class="ht"><h1 class="serif">Get help</h1><span class="crumbs">support cases and enhancement requests${byEmail ? ` · by email to ${esc(state.me.support.email)}` : ' · each gets a number, and you follow it here'}</span></div>
      <div class="tools"><a class="btn primary" href="${esc(caseHref)}">${icon('help')}Submit a support case</a><a class="btn" href="${esc(enhHref)}">Request an enhancement</a></div></div>
    <div class="help-grid">
      <section class="panel help-queue"><div class="flex help-filters">
        <select id="hf-kind"><option value="">Cases and enhancements</option><option value="case">Support cases</option><option value="enhancement">Enhancements</option></select>
        <select id="hf-status"><option value="open">Open</option><option value="">Any status</option>${Object.entries(HELP_STATUS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
        ${d.team ? '<select id="hf-whose"><option value="all">Everyone’s</option><option value="mine">Mine</option></select>' : ''}
      </div><h2 id="hq-title" class="mt"></h2><div id="hq-list"></div></section>
      <section class="panel help-detail" id="help-detail"></section>
    </div>`;
  const f = helpState.filter;
  $('#hf-kind').value = f.kind;
  $('#hf-status').value = f.status;
  if ($('#hf-whose')) $('#hf-whose').value = f.whose;
  const renderList = () => {
    const everyone = d.team && f.whose === 'all';
    const rows = d.requests.filter((r) => (!f.kind || r.kind === f.kind) && (!f.status || (f.status === 'open' ? !['completed', 'declined'].includes(r.status) : r.status === f.status)) && (everyone || r.mine));
    $('#hq-title').innerHTML = `${everyone ? 'Support queue' : 'My requests'} <small>${num(rows.length)} shown</small>`;
    $('#hq-list').innerHTML = rows.length
      ? `<ul class="help-rows">${rows.map((r) => `<li><a class="help-row${r.id === view.toUpperCase() ? ' on' : ''}" href="#/help/${esc(r.id)}"><span class="help-row-top"><b class="mono">${esc(r.id)}</b>${helpChip(r.status)}${r.priority === 'urgent' || r.priority === 'high' ? `<span class="chip bad"><i></i>${HELP_PRIORITY[r.priority]}</span>` : ''}</span><span class="help-row-title">${esc(r.subject)}</span><span class="sub">${r.mine ? '' : `${esc(r.requester.name || r.requester.email)} · `}${esc(dateTime(r.updatedAt))}</span></a></li>`).join('')}</ul>`
      : `<p class="muted small">${d.requests.length ? 'Nothing matches these filters.' : byEmail ? 'Requests go by email here, so none are listed.' : 'No requests yet. Raise one with the buttons above.'}</p>`;
  };
  for (const [id, key] of [['#hf-kind', 'kind'], ['#hf-status', 'status'], ['#hf-whose', 'whose']]) if ($(id)) $(id).onchange = (e) => ((f[key] = e.target.value), renderList());
  renderList();
  const box = $('#help-detail');
  const v = String(view ?? '');
  if (byEmail && !/^(SUP|ENH)-\d+$/i.test(v)) {
    box.innerHTML = `<div class="empty"><b>Get help by email</b>Support here is by email. Your email app opens, addressed to <b>${esc(state.me.support.email)}</b>, with a short template to fill in; the answers come back by email.<div class="flex mt"><a class="btn primary" href="${esc(caseHref)}">Email a support case</a><a class="btn" href="${esc(enhHref)}">Email an enhancement request</a></div></div>`;
    return;
  }
  if (v === 'case' || v === 'enhancement') {
    const isCase = v === 'case';
    box.innerHTML = `<form class="form" id="help-form" autocomplete="off"><h2>${isCase ? 'Submit a support case' : 'Request an enhancement'}</h2>
      <p class="muted small">${isCase ? 'Tell the support team what is not working, or where you are stuck. You get an email with the case number, and every answer.' : 'Describe the feature or improvement you would like, and why it helps. You get an email with its number, and can follow it until it is done.'}</p>
      <label class="f">Title<input name="subject" maxlength="200" required placeholder="In a few words" /></label>
      <label class="f">Description<textarea name="text" rows="8" maxlength="10000" required placeholder="${isCase ? 'What happened, what you expected, and the steps to see it' : 'What you would like, who it helps, and how you would use it'}"></textarea></label>
      ${isCase ? '<label class="f">Priority<select name="priority"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="urgent">Urgent: work is blocked</option></select></label>' : ''}
      <div class="flex"><button class="primary" type="submit">Submit</button><a class="btn ghost" href="#/help">Cancel</a><span class="err" id="help-err"></span></div></form>`;
    $('#help-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      e.target.querySelector('button[type=submit]').disabled = true;
      try {
        const r = await api('/api/support', { method: 'POST', body: { kind: v, subject: fd.get('subject'), text: fd.get('text'), priority: fd.get('priority') || 'normal', page: document.referrer ? '' : location.hash } });
        helpState.justRaised = r.request.id;
        helpState.emailed = r.emailed;
        go(`/help/${r.request.id}`);
      } catch (error) {
        $('#help-err').textContent = error.message;
        e.target.querySelector('button[type=submit]').disabled = false;
      }
    };
    return;
  }
  if (/^(SUP|ENH)-\d+$/i.test(v)) return helpRequest(v.toUpperCase());
  box.innerHTML = '<div class="empty"><b>Get help</b>Raise a support case when something does not work, or request an enhancement for something new. Each gets a number, sent to you by email, and you can follow it here until it is done.</div>';
}
const helpNote = (emailed) => (emailed?.error ? `Saved, but an email could not be sent: ${esc(emailed.error)}` : emailed?.sent ? 'Saved, and emailed.' : 'Saved.');
async function helpRequest(id) {
  const box = $('#help-detail');
  box.innerHTML = loading();
  let res;
  try {
    res = await api(`/api/support/${encodeURIComponent(id)}`);
  } catch (error) {
    box.innerHTML = `<div class="empty"><b>${esc(error.message)}</b></div>`;
    return;
  }
  const { request: r, team } = res;
  const raised = helpState.justRaised === r.id;
  const emailed = helpState.emailed;
  helpState.justRaised = '';
  box.innerHTML = `${raised ? `<div class="callout ok"><b>Thank you. Your number is ${esc(r.id)}.</b> ${r.kind === 'case' ? 'The support team has been told. You get an email with every answer.' : 'It is now in the list of enhancements. You get an email whenever its status changes.'}${emailed?.error ? `<br /><span class="bad-t">The email with your number could not be sent: ${esc(emailed.error)}</span>` : ''}</div>` : ''}
    <div class="flex help-head"><b class="mono">${esc(r.id)}</b><span class="chip">${HELP_KIND[r.kind]}</span>${helpChip(r.status)}${r.priority ? `<span class="muted small">Priority: ${HELP_PRIORITY[r.priority] ?? esc(r.priority)}</span>` : ''}</div>
    <h2 class="help-subject">${esc(r.subject)}</h2>
    <p class="muted small">Raised by ${esc(r.requester.name || r.requester.email)} · ${esc(dateTime(r.createdAt))}${r.version ? ` · ${esc(r.version)}` : ''}</p>
    <ol class="help-thread">${r.conversation.map((m) => `<li class="help-msg${m.team ? ' team' : ''}${m.mine ? ' mine' : ''}"><div class="help-msg-head"><b>${esc(m.name)}</b>${m.team ? '<span class="chip ok">Support team</span>' : ''}<span class="muted small">${esc(dateTime(m.at))}</span></div><div class="help-msg-text">${esc(m.text)}</div></li>`).join('')}</ol>
    <form class="form help-reply" id="help-reply"><label class="f">${r.mine ? 'Add to your request' : 'Answer'}<textarea name="text" rows="4" maxlength="10000" required placeholder="${r.mine ? 'More detail, or an answer to the support team' : 'Your answer: it is emailed to the person who raised it'}"></textarea></label><div class="flex"><button class="primary" type="submit">Send</button></div></form>
    ${team ? `<div class="flex help-set"><label class="f">Status<select id="help-status-set">${Object.entries(HELP_STATUS).map(([k, [l]]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" id="help-status-go">Update status</button><span class="muted small">The person who raised it gets an email with the new status.</span></div>` : ''}
    <p class="small" id="help-view-status"></p>
    <details class="help-history"><summary>Status history</summary><ul>${r.history.map((h) => `<li>${helpChip(h.status)} ${esc(h.name)} · ${esc(dateTime(h.at))}</li>`).join('')}</ul></details>`;
  $('#help-reply').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const out = await api(`/api/support/${encodeURIComponent(r.id)}/messages`, { method: 'POST', body: { text: new FormData(e.target).get('text') } });
      await helpRequest(r.id);
      $('#help-view-status').innerHTML = helpNote(out.emailed);
    } catch (error) {
      $('#help-view-status').textContent = error.message;
      btn.disabled = false;
    }
  };
  if ($('#help-status-go')) $('#help-status-go').onclick = async () => {
    try {
      const out = await api(`/api/support/${encodeURIComponent(r.id)}/status`, { method: 'POST', body: { status: $('#help-status-set').value } });
      await viewHelp(r.id);
      $('#help-view-status').innerHTML = helpNote(out.emailed);
    } catch (error) {
      $('#help-view-status').textContent = error.message;
    }
  };
}

// ---- Your profile, as CxMissionZero has it: who you are here, and how the command center appears to you ---------------
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'ILS', 'TRY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'ZAR', 'NGN', 'KES', 'EGP', 'JPY', 'CNY', 'HKD', 'SGD', 'AUD', 'NZD', 'KRW', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'CAD', 'MXN', 'BRL', 'ARS', 'CLP', 'COP'];
async function viewProfile() {
  state.me = await api('/api/me');
  const me = state.me;
  const pr = me.prefs ?? {};
  const imp = pr.impact ?? {};
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Every zone this browser knows, with this computer's and the one chosen, and today's names of renamed ones.
  const zones = [...new Set([...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []), here, pr.timeZone, 'Asia/Kolkata', 'Asia/Kathmandu', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh'].filter(Boolean))].sort();
  const offset = (z) => {
    try {
      return new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value ?? '';
    } catch {
      return '';
    }
  };
  const own = state.branding?.letChoose !== false;
  shell('profile', `<div class="head compact"><div class="ht"><h1 class="serif">Your profile</h1><span class="crumbs">how the command center appears to you · only you can change it, in every browser you sign in from</span></div></div>
    <div class="saved-banner">✓ Changes save as you type.</div>
    <div class="panel profile">
      <div class="prof-top">
        <div class="prof-pic">${avatar(me.user.name, me.picture, 'xl')}<div class="flex"><label class="btn sm">${me.picture ? 'Change picture' : 'Add a picture'}<input type="file" id="pf-pic" accept="image/png,image/jpeg,image/webp" hidden /></label>${me.picture ? '<button type="button" class="sm ghost" id="pf-pic-rm">Remove</button>' : ''}</div></div>
        <dl class="kv prof-facts"><dt>Email</dt><dd>${esc(me.user.email)}</dd><dt>Role</dt><dd>${esc(me.role.name)}</dd><dt>Team</dt><dd>${esc(me.team?.path ?? '—')}</dd><dt>Signed in with</dt><dd>${me.user.signIn === 'sso' ? 'Single sign-on' : 'Email and password'}</dd><dt>Last sign-in</dt><dd>${esc(dateTime(me.user.lastSignInAt))}</dd><dt>Signed in on</dt><dd>${num(me.sessions)} browser${me.sessions === 1 ? '' : 's'} <button type="button" class="link" id="pf-others" ${me.sessions > 1 ? '' : 'hidden'}>sign out everywhere else</button></dd></dl>
      </div>
      <form class="form" id="pf" autocomplete="off" data-nodraft>
        <label class="f">Name<input name="name" maxlength="120" value="${esc(me.user.name)}" /></label>
        <div class="sep-line"></div>
        <h3>Time zone</h3>
        <label class="check"><input type="checkbox" name="tzAuto" ${pr.timeZone ? '' : 'checked'} /><span>Use this computer’s time zone</span></label>
        <p class="muted small">Detected on this computer: <b>${esc(here)} (${esc(offset(here))})</b></p>
        <label class="f">Time zone<select name="timeZone" ${pr.timeZone ? '' : 'disabled'}>${zones.map((z) => `<option value="${esc(z)}"${(pr.timeZone || here) === z ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <p class="muted small">Dates and times on these pages are shown in this time zone.</p>
        <div class="sep-line"></div>
        <h3>Your Impact figures</h3>
        <p class="muted small">Where you turn Impact on for an account, it starts from these (the account can then have its own).</p>
        <div class="row4">
          <label class="f">Currency<select name="currency"><option value="">The account’s, suggested when you turn Impact on</option>${CURRENCIES.map((c) => `<option${imp.currency === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="f">Developers’ hourly rate<input name="hourlyRate" type="number" min="0" step="1" value="${esc(imp.hourlyRate ?? '')}" placeholder="50" /></label>
          <label class="f">Minutes to triage a finding by hand<input name="triageMinutes" type="number" min="0" step="1" value="${esc(imp.triageMinutes ?? '')}" placeholder="30" /></label>
          <label class="f">Minutes to fix a finding by hand<input name="fixMinutes" type="number" min="0" step="1" value="${esc(imp.fixMinutes ?? '')}" placeholder="120" /></label>
        </div>
      </form>
      ${own ? `<div class="sep-line"></div><h3>Your look</h3><div class="flex"><button type="button" id="pf-theme">${icon('theme')}Choose your theme…</button><span class="muted small">Light, dark or your computer’s, in one of the looks; the Admin’s look when you choose none.</span></div>` : ''}
      ${me.user.signIn === 'sso' ? '' : `<div class="sep-line"></div><h3>Password</h3>
      <form class="form row4" id="pw2" autocomplete="off" data-nodraft><label class="f">Current password<input type="password" name="current" autocomplete="current-password" required /></label><label class="f">New password<input type="password" name="next" autocomplete="new-password" minlength="12" required /></label><label class="f">New password again<input type="password" name="again" autocomplete="new-password" minlength="12" required /></label><div class="f"><span>&nbsp;</span><button class="primary" type="submit">Change password</button></div></form><p class="err" id="pw2-err"></p>`}
    </div>
    <div class="saved-foot" id="pfsaved">All changes are saved.</div>`);
  const say = (t, bad) => {
    $('#pfsaved').textContent = t;
    $('#pfsaved').classList.toggle('bad', Boolean(bad));
  };
  const save = async (patch) => {
    say('Saving…');
    try {
      const r = await api('/api/me/profile', { method: 'PUT', body: patch });
      state.me.user = { ...state.me.user, ...r.user };
      state.me.prefs = r.prefs;
      state.me.picture = r.picture;
      say(`All changes are saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      return r;
    } catch (error) {
      say(`${error.message} What was saved before is kept.`, true);
      return null;
    }
  };
  const f = $('#pf');
  let timer = null;
  f.elements.name.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => save({ name: f.elements.name.value }), 600);
  });
  f.elements.tzAuto.addEventListener('change', () => {
    f.elements.timeZone.disabled = f.elements.tzAuto.checked;
    save({ timeZone: f.elements.tzAuto.checked ? '' : f.elements.timeZone.value });
  });
  f.elements.timeZone.addEventListener('change', () => save({ timeZone: f.elements.timeZone.value }));
  const impact = () => ({ currency: f.elements.currency.value, hourlyRate: f.elements.hourlyRate.value, triageMinutes: f.elements.triageMinutes.value, fixMinutes: f.elements.fixMinutes.value });
  for (const n of ['currency', 'hourlyRate', 'triageMinutes', 'fixMinutes']) f.elements[n].addEventListener('change', () => save({ impact: impact() }));
  f.onsubmit = (e) => e.preventDefault();
  $('#pf-pic').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 200 * 1024) return say(`${file.name} is ${Math.round(file.size / 1024)} KB: at most 200 KB.`, true);
    if (await save({ picture: await fileToBase64(file) })) viewProfile();
  };
  if ($('#pf-pic-rm')) $('#pf-pic-rm').onclick = async () => (await save({ picture: null })) && viewProfile();
  if ($('#pf-theme')) $('#pf-theme').onclick = themePicker;
  $('#pf-others').onclick = async () => {
    try {
      await api('/api/me/signout-others', { method: 'POST', body: {} });
      toast('Signed out everywhere else; this browser stays signed in.', 'ok');
      viewProfile();
    } catch (error) {
      toast(error.message, 'bad');
    }
  };
  if ($('#pw2')) $('#pw2').onsubmit = async (e) => {
    e.preventDefault();
    const g = new FormData(e.target);
    if (g.get('next') !== g.get('again')) return ($('#pw2-err').textContent = 'The two new passwords are not the same.');
    try {
      await api('/api/me/password', { method: 'POST', body: { current: g.get('current'), next: g.get('next') } });
      e.target.reset();
      $('#pw2-err').textContent = '';
      toast('Password changed. Other browsers are signed out.', 'ok');
    } catch (error) {
      $('#pw2-err').textContent = error.message;
    }
  };
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
/** Fields that hold a secret (a password, token or key) are never kept as a draft, whatever their type. */
const SECRET_FIELD = /pass(word)?|token|secret|api.?key|^key$/i;
const draftable = (el) => el.form && el.name && !el.closest('[data-nodraft], .filters, .mpick') && !['password', 'file', 'hidden', 'submit', 'button', 'search'].includes(el.type) && !SECRET_FIELD.test(el.name) && !el.form.matches('#sf, #bf, #auto, #af, #actf');
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
    if (path === '/rates') return await viewRates(params);
    if (path === '/admin') return await viewAdmin();
    if (path.startsWith('/admin/')) return await viewAdmin(path.slice('/admin/'.length));
    if (path === '/audit') return await viewAudit(params);
    if (path === '/activity') return await viewActivity(params);
    if (path === '/guide') return viewGuide(params);
    if (path === '/help') return await viewHelp('');
    if (path.startsWith('/help/')) return await viewHelp(decodeURIComponent(path.slice('/help/'.length)));
    if (path === '/profile') return viewProfile();
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
