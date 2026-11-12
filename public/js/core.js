import { route } from './main.js';

// FTR Credits Command Center: the dashboard. One page, routes in the hash (#/overview, #/accounts/<id>…), every
// figure from the server's /api, everything written into the page escaped.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const num = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
export const compact = (n) => (!Number.isFinite(Number(n)) ? '—' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : num(Math.round(n)));
/** The time zone dates are shown in: the person's own (Your profile), else this computer's. */
export const tz = () => (typeof state !== 'undefined' && state.me?.prefs?.timeZone) || undefined;
export const date = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz() }) : '—');
export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz() }) : '—');
export const ago = (iso) => {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(iso);
};
export const initials = (name) => String(name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
/** A person's avatar: their picture (Your profile), else their initials. */
export const avatar = (name, picture, cls = 'sm') => (picture ? `<span class="avatar ${cls} pic"><img src="${esc(picture)}" alt="" /></span>` : `<span class="avatar ${cls}">${esc(initials(name))}</span>`);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export const ICONS = {
  help: '<path d="M4 5h16v11H8l-4 4z"/><path d="M9 9h6"/><path d="M9 12h4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
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
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
export const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17 9 10l4 3 7-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- State and requests ---------------------------------------------------------------------------------

export const state = { me: null, people: null };

/**
 * The lists most pages show (accounts, people, the dashboard), kept in memory for 30 seconds: going from page to page
 * shows them at once instead of waiting on the network each time. Anything changed here clears them; nothing is kept
 * once the tab is closed (never written to the device).
 */
const KEPT = new Map();
const KEPT_MS = 30_000;
const keepable = (path) => /^\/api\/(accounts|people|dashboard)(\?|$)/.test(path);
export const forgetKept = () => KEPT.clear();
/** Ask for the lists in the background, so the next page has them already. */
export function warm(paths) {
  for (const p of paths) if (!KEPT.has(p)) api(p).catch(() => {});
}
export async function api(path, { method = 'GET', body } = {}) {
  if (method === 'GET' && keepable(path)) {
    const hit = KEPT.get(path);
    if (hit && Date.now() - hit.at < KEPT_MS) return structuredClone(await hit.data);
    const data = fetchApi(path, { method, body });
    KEPT.set(path, { at: Date.now(), data });
    data.catch(() => KEPT.delete(path));
    return structuredClone(await data);
  }
  const out = await fetchApi(path, { method, body });
  if (method !== 'GET') KEPT.clear();
  return out;
}
async function fetchApi(path, { method = 'GET', body } = {}) {
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

export let toastTimer;
export function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5500);
}

export const can = (p) => state.me?.permissions?.includes(p);
export const go = (path) => {
  if (path === '/calculator') return location.assign('/calculator');
  if (location.hash !== `#${path}`) location.hash = `#${path}`;
  else route();
};

// ---- Themes: light, dark or the system's, and six palettes; each person's own, else the organisation's ---------------
export const THEME_KEY = 'cxcalc-theme';
export const ACCENT_KEY = 'cc-accent';
export const THEMES = [
  ['aurora', 'Standard', 'Calm and plain: the command center\u2019s own'],
  ['command', 'Command Center', 'The war room: phosphor green and amber, radar, DEFCON status'],
];
/** A look from before (Ocean, Emerald, Sunset, Royal, Graphite) is now the standard one. */
export const lookOf = (accent) => (THEMES.some(([id]) => id === accent) ? accent : 'aurora');
export const OPS = [['green', '#39ff88'], ['cyan', '#00e5ff'], ['blue', '#4d9fff'], ['amber', '#ffb000'], ['red', '#ff4d4d'], ['violet', '#be82ff']];
export const OPS_KEY = 'cc-ops';
/** Command Center's phosphor colour (green unless chosen). */
export function applyOps(ops) {
  const v = OPS.some(([id]) => id === ops) ? ops : 'green';
  document.documentElement.dataset.ops = v;
  try {
    localStorage.setItem(OPS_KEY, v);
  } catch {}
}
try {
  applyOps(localStorage.getItem(OPS_KEY));
} catch {}
export const media = matchMedia('(prefers-color-scheme: dark)');
export let themeMode = 'light';
export function applyTheme(mode = themeMode, accent) {
  themeMode = ['light', 'dark', 'system'].includes(mode) ? mode : 'light';
  document.documentElement.dataset.theme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
  if (accent) accent = lookOf(accent);
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
export function applyMyTheme() {
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
export const TEJAS_LINE = 'Tejas \u2014 built for speed, engineered for dominance. Every projection here is a sortie in Checkmarx\u2019s growth: one customer, one codebase, one credit at a time.';
export const brandHtml = () => {
  const b = state.branding ?? {};
  // The default logo is Tejas: pointed at, it shows itself, larger, with its line.
  const tejas = String(b.logo ?? '').includes('v=default');
  return `<div class="brand"><div class="logo${b.logo ? ' img' : ''}${tejas ? ' tejas' : ''}"${tejas ? ` title="${esc(TEJAS_LINE)}" aria-label="${esc(TEJAS_LINE)}"` : ''}>${b.logo ? `<img src="${esc(b.logo)}" alt="" />` : LOGO}${tejas ? `<span class="tejas-card" role="tooltip"><img src="${esc(b.logo)}" alt="" /><span>${esc(TEJAS_LINE)}</span></span>` : ''}</div><div><b>${esc(b.appName ?? 'FTR Credits')}</b><span>${esc(b.tagline ?? 'Command Center')}</span></div></div>`;
};
export function applyBranding(b = state.branding) {
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
export function themePicker() {
  const me = state.me;
  const dlg = document.createElement('dialog');
  const cur = { mode: me.prefs?.mode ?? me.theme?.mode ?? 'light', accent: lookOf(me.prefs?.accent ?? me.theme?.accent ?? 'aurora') };
  dlg.innerHTML = `<form method="dialog"><div class="dh"><h2>Theme</h2><p class="muted small">Yours, on every device you sign in on.</p></div><div class="db">
    <div class="seg" id="modes">${['light', 'dark', 'system'].map((m) => `<button type="button" data-m="${m}" class="${cur.mode === m ? 'primary' : ''}">${m[0].toUpperCase()}${m.slice(1)}</button>`).join('')}</div>
    <div class="swatches mt">${THEMES.map(([id, name, note]) => `<button type="button" class="swatch${cur.accent === id ? ' on' : ''}" data-a="${id}"><span class="sw sw-${id}"></span><b>${name}</b><small>${note}</small></button>`).join('')}</div>
    <div class="ops-pick" id="ops-pick"${cur.accent === 'command' ? '' : ' hidden'}><span class="muted small">Command Center colour</span>${OPS.map(([id, c]) => `<button type="button" data-o="${id}" data-css="--c:${c}" class="${(me.prefs?.ops ?? 'green') === id ? 'on' : ''}" title="${id[0].toUpperCase()}${id.slice(1)}" aria-label="${id}"></button>`).join('')}</div></div>
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

// ---- Values a piece of the page carries into its style (a ring's share, a split's height, a swatch's colour) ----
// The page's content policy runs no style written into the HTML, so they are given as data-css="--name:value" and set
// here, as each piece arrives.
export function applyCss(root = document) {
  for (const el of root.querySelectorAll?.('[data-css]') ?? []) {
    for (const part of el.dataset.css.split(';')) {
      const i = part.indexOf(':');
      if (i > 0) el.style.setProperty(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
    el.removeAttribute('data-css');
  }
}
// Once per frame, however much of the page arrived (a table of people is thousands of pieces).
let cssQueued = false;
new MutationObserver(() => {
  if (cssQueued) return;
  cssQueued = true;
  requestAnimationFrame(() => {
    cssQueued = false;
    applyCss(document);
  });
}).observe(document.documentElement, { childList: true, subtree: true });
