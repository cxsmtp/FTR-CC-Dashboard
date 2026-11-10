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

// ---- Theme ----------------------------------------------------------------------------------------------
const THEME_KEY = 'cxcalc-theme';
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}
try {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
} catch {
  applyTheme('dark');
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
}

// ---- Shell ----------------------------------------------------------------------------------------------
function shell(active, content) {
  const me = state.me;
  const link = (path, name, label, show = true) => (show ? `<a href="#${path}" class="${active === name ? 'on' : ''}">${icon(name)}<span>${label}</span></a>` : '');
  const admin = can('users.manage') || can('teams.manage') || can('roles.manage') || can('settings.manage') || can('audit.view');
  $('#app').className = 'app';
  $('#app').innerHTML = `
    <aside class="side">
      <div class="brand"><div class="logo">${LOGO}</div><div><b>FTR Credits</b><span>Command Center</span></div></div>
      <nav class="nav">
        <div class="label">Insight</div>
        ${link('/overview', 'overview', 'Overview', can('dashboard.view'))}
        ${link('/accounts', 'accounts', 'Accounts', can('dashboard.view'))}
        ${link('/people', 'people', 'People')}
        <div class="label">Work</div>
        ${can('calculator.use') ? `<a href="/calculator">${icon('calc')}<span>Calculator</span></a>` : ''}
        ${link('/guide', 'guide', 'Quick guide')}
        ${admin ? '<div class="label">Administration</div>' : ''}
        ${link('/teams', 'teams', 'Teams', can('teams.manage') || can('dashboard.view'))}
        ${link('/admin', 'admin', 'Settings & roles', can('settings.manage') || can('roles.manage'))}
        ${link('/audit', 'audit', 'Audit log', can('audit.view'))}
      </nav>
      <div class="me">
        <div class="who"><div class="avatar">${esc(initials(me.user.name))}</div><div><b>${esc(me.user.name)}</b><small>${esc(me.role.name)}${me.team ? ` · ${esc(me.team.name)}` : ''}</small></div></div>
        <div class="row"><button class="ghost sm" id="theme" title="Light or dark">${icon('theme')}Theme</button><button class="ghost sm" id="signout">${icon('out')}Sign out</button></div>
      </div>
    </aside>
    <main class="main fade" id="main">${content}</main>`;
  $('#theme').onclick = toggleTheme;
  $('#signout').onclick = signOut;
}
async function signOut() {
  try {
    await api('/api/auth/signout', { method: 'POST', body: {} });
  } catch {}
  state.me = null;
  go('/login');
}
const loading = () => '<div class="loading"><span class="spinner"></span>Loading…</div>';

// ---- Sign in --------------------------------------------------------------------------------------------
function viewLogin() {
  $('#app').className = 'app bare';
  $('#app').innerHTML = `
  <div class="auth fade">
    <section class="pitch">
      <div class="brand"><div class="logo">${LOGO}</div><div><b>FTR Credits</b><span>Command Center</span></div></div>
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
      <p class="foot">First time? Your Admin sent you a one-time password: sign in with it and you will choose your own, accept the terms of use and see a quick guide.<br/>Internal use only · <a href="/legal/terms" target="_blank" rel="noopener">Terms of use</a> · <a href="/legal/license" target="_blank" rel="noopener">PolyForm Internal Use License</a></p>
    </section>
  </div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#err').textContent = '';
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      await api('/api/auth/signin', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } });
      state.me = await api('/api/me');
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
  $('#app').innerHTML = `<div class="auth fade"><section class="pitch"><div class="brand"><div class="logo">${LOGO}</div><div><b>FTR Credits</b><span>Command Center</span></div></div><h1 class="serif">Back in, <em>safely.</em></h1><p>A link to choose a new password goes to your own work email. It works once, for 30 minutes, and every place you were signed in is signed out when you use it.</p></section><section class="card">${inner}</section></div>`;
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
  $('#app').innerHTML = `<div class="wizard fade">${steps}<div class="panel">${guideHtml(true)}<div class="flex mt"><button class="primary" id="done">Get started</button><a class="btn ghost" href="/legal/guide" target="_blank" rel="noopener">Full user guide</a></div></div></div>`;
  $('#done').onclick = async () => {
    await api('/api/me/guide', { method: 'POST', body: {} }).catch(() => {});
    state.me = await api('/api/me');
    go(home());
  };
}

function guideHtml(first = false) {
  const leader = (state.me.leads?.length ?? 0) > 0 || can('scope.all');
  const se = can('calculator.use');
  const steps = [
    se && ['Open the Calculator', 'Pick your team (region) at the top. Every account in your team is shared with your teammates: anyone in the team can open it and generate projections.'],
    se && ['Add the account and its Salesforce link', 'Click New, name the account, then paste the Salesforce opportunity or account link and Save. It is required: no report can be generated without it.'],
    se && ['Bring in the data', "A Checkmarx One customer: paste their API key and Connect (it is kept in memory for your session only). A prospect not on Checkmarx One: Fusion · from Git with a read-only token, or send them cloc-fusion and import its report in Fusion · cloc-fusion."],
    se && ['Generate the report', 'Check the credits, then Generate projection report. Download the HTML and the PDF summary to send to the customer. Make as many as you need.'],
    se && ['Mark primary and shared', 'On the account page, star the report that stands for the account (otherwise the latest counts) and mark which reports you shared with the customer, with a note.'],
    leader && ['Watch your teams', 'Overview rolls up every team below you: projected credits from each primary report, reports made and shared, and accounts still missing a Salesforce link. Click any team, person or account to dive in.'],
    ['Ask for help', 'People shows who is in your team and who leads it. An Admin can reset your password, move you to another team or change your role.'],
  ].filter(Boolean);
  return `<h1 class="serif">${first ? 'Step 3 of 3 · ' : ''}Quick guide</h1>
    <p class="muted">${esc(state.me.role.name)} in ${esc(state.me.team?.path ?? 'no team yet')}. Here is how the command center works for you.</p>
    <div class="guide mt">${steps.map(([t, p], i) => `<div class="step"><div class="n">${i + 1}</div><b>${esc(t)}</b><p>${esc(p)}</p></div>`).join('')}</div>
    <div class="callout mt">Figures are supporting information worked out from the customer's data at a moment in time; Checkmarx's own records are authoritative. Never paste a customer's key anywhere but the Calculator, and use read-only git tokens.</div>`;
}
function viewGuide() {
  shell('guide', `<div class="head"><div></div><div class="tools"><a class="btn" href="/legal/guide" target="_blank" rel="noopener">Full user guide</a><a class="btn ghost" href="/legal/terms" target="_blank" rel="noopener">Terms of use</a><a class="btn ghost" href="/legal/license" target="_blank" rel="noopener">License</a></div></div><div class="panel">${guideHtml()}</div>`);
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
      <div class="kpi"><div class="k">Accounts</div><div class="v">${num(t.accounts)}</div><div class="s">${num(t.withReport)} with a report</div><div class="meter"><i data-w="${pct(t.withReport, t.accounts)}"></i></div></div>
      <div class="kpi"><div class="k">Reports generated</div><div class="v">${num(t.reports)}</div><div class="s">${num(t.primaryMarked)} account${t.primaryMarked === 1 ? '' : 's'} with a primary marked</div></div>
      <div class="kpi"><div class="k">Shared with customers</div><div class="v">${num(t.sharedReports)}</div><div class="s">${num(t.accountsShared)} of ${num(t.accounts)} accounts</div><div class="meter"><i data-w="${pct(t.accountsShared, t.accounts)}"></i></div></div>
      <div class="kpi ${t.missingSalesforce ? 'warn' : ''}"><div class="k">Missing Salesforce link</div><div class="v">${num(t.missingSalesforce)}</div><div class="s">${t.missingSalesforce ? 'No report can be made for them yet' : 'Every account is tied to Salesforce'}</div></div>
    </div>
    <div class="grid g3">
      <div class="panel"><h2>Teams <small>credits from primary reports, teams below rolled up</small></h2>
        ${treeRows.length ? `<div class="tree">${treeRows.map(({ node, depth }) => `<div class="node" data-team="${esc(node.id)}"><div class="t"><span class="indent" data-indent="${depth}"></span>${depth ? '<span class="twig"></span>' : ''}<div><b>${esc(node.name)}</b><small>${node.leaders.length ? ` · led by ${esc(node.leaders.join(', '))}` : ''}</small><div class="bar"><div class="track"><i data-w="${pct(node.credits, maxTeam)}"></i></div></div></div></div><span class="m">${num(node.people)} people</span><span class="m">${num(node.accounts)} accounts · ${num(node.shared)} shared</span><span class="credits">${num(Math.round(node.credits))}</span></div>`).join('')}</div>` : '<div class="empty"><b>No teams yet</b>An Admin sets them up under Teams.</div>'}
      </div>
      <div class="panel chart"><h2>Activity <small>last 12 months</small></h2>${monthsChart(d.months)}<div class="legend"><span><i class="lg-a"></i>Reports generated</span><span><i class="lg-b"></i>Shared with customer</span></div></div>
    </div>
    <div class="grid g2 mt">
      <div class="panel"><h2>Sales Engineers <small>accounts they are accountable for</small></h2>
        ${sePeople.length ? `<div class="bars">${sePeople.slice(0, 12).map((p) => `<div class="bar click" data-person="${esc(p.id)}"><div class="name"><div class="flex"><span class="avatar sm">${esc(initials(p.name))}</span><div>${esc(p.name)}<small>${esc(p.team)} · ${num(p.accounts)} accounts · ${num(p.reports)} reports · ${num(p.shared)} shared${p.missingSalesforce ? ` · <span class="warn-t">${num(p.missingSalesforce)} no SF</span>` : ''}</small></div></div></div><div class="track"><i data-w="${pct(p.credits, maxPerson)}"></i></div><div class="val">${num(Math.round(p.credits))}</div></div>`).join('')}</div>${sePeople.length > 12 ? `<a class="more" href="#/accounts">${num(sePeople.length - 12)} more: see every account →</a>` : ''}` : '<div class="empty"><b>No accounts yet</b>They appear once Sales Engineers add accounts in the calculator.</div>'}
      </div>
      <div class="panel"><h2>Largest projections <small>primary report per account</small></h2>
        ${d.top.length ? `<div class="tw"><table><thead><tr><th>Account</th><th>SE</th><th class="num">Credits</th><th></th></tr></thead><tbody>${d.top.map((a) => `<tr class="click" data-account="${esc(a.id)}"><td><b>${esc(a.name)}</b><span class="sub">${esc(a.team)}</span></td><td>${esc(a.owner)}</td><td class="num"><span class="credits big">${num(Math.round(a.primary.totalCredits))}</span></td><td>${sfChip(a)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No reports yet</b>Generate the first one in the calculator.</div>'}
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
        <div><select id="status"><option value="">Any status</option><option value="nosf">Missing Salesforce link</option><option value="noreport">No report yet</option><option value="notshared">Report not shared</option><option value="shared">Shared with customer</option><option value="noprimary">No primary marked</option></select></div>
        <span class="spacer"></span><span class="muted small" id="count"></span>
      </div>
      <div class="tw mt"><table><thead><tr>
        <th class="sort" data-k="name">Account</th><th class="sort" data-k="owner">Accountable SE</th><th>Salesforce</th><th class="sort num" data-k="tr">T&amp;R</th><th class="sort num" data-k="fusion">Fusion</th><th class="sort num" data-k="credits">Total credits</th><th class="sort num" data-k="reports">Reports</th><th>Customer</th><th class="sort" data-k="last">Last report</th>
      </tr></thead><tbody id="rows"></tbody></table></div>
    </div>`;
  const val = (a, k) => ({ name: a.name.toLowerCase(), owner: String(a.owner).toLowerCase(), tr: a.primary?.trCredits ?? -1, fusion: a.primary?.fusionCredits ?? -1, credits: a.primary?.totalCredits ?? -1, reports: a.reportCount, last: a.lastReportAt ?? '' })[k];
  const render = () => {
    const q = $('#q').value.trim().toLowerCase();
    const owner = $('#owner').value;
    const status = $('#status').value;
    const list = accounts
      .filter((a) => !q || [a.name, a.owner, a.team, a.salesforceId].some((s) => String(s ?? '').toLowerCase().includes(q)))
      .filter((a) => !owner || a.ownerId === owner)
      .filter((a) => !status || (status === 'nosf' ? !a.salesforceUrl : status === 'noreport' ? !a.primary : status === 'notshared' ? a.primary && !a.sharedCount : status === 'shared' ? a.sharedCount > 0 : a.primary && a.primary.how !== 'marked'))
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
        <td class="num">${num(a.reportCount)}</td>
        <td>${a.sharedCount ? `<span class="chip ok"><i></i>${num(a.sharedCount)} shared</span>` : a.reportCount ? '<span class="chip warn"><i></i>Not shared</span>' : '<span class="chip"><i></i>—</span>'}</td>
        <td>${esc(ago(a.lastReportAt))}</td></tr>`).join('')
      : '<tr><td colspan="9"><div class="empty"><b>No accounts match</b>Change the filters, or add one in the calculator.</div></td></tr>';
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
        ${a.salesforceUrl ? `<dl class="kv mt"><dt>Salesforce</dt><dd>${esc(a.salesforceKind === 'opportunity' ? 'Opportunity' : 'Account')} <span class="mono">${esc(a.salesforceId)}</span></dd><dt>Created</dt><dd>${esc(dateTime(a.createdAt))} by ${esc(a.createdBy)}</dd><dt>Updated</dt><dd>${esc(dateTime(a.updatedAt))}</dd></dl>` : ''}
        ${d.can.deleteAccount ? '<div class="mt"><button class="danger sm" id="del-acct">Delete account and its reports</button></div>' : ''}
      </div>
    </div>
    <div class="panel mt"><h2>Reports <small>download them from the calculator's Saved reports list</small></h2>
      ${d.reports.length ? `<div class="tw"><table><thead><tr><th></th><th>Made</th><th>By</th><th class="num">T&amp;R</th><th class="num">Fusion</th><th class="num">Total</th><th>Shared with customer</th><th></th></tr></thead><tbody>${d.reports.map((r) => {
        const primary = a.primary?.id === r.id;
        return `<tr data-id="${esc(r.id)}"><td>${primary ? `<span class="chip star">${icon('star')}${a.primary.how === 'marked' ? 'Primary' : 'Latest'}</span>` : ''}</td><td>${esc(dateTime(r.createdAt))}</td><td>${esc(r.createdBy)}</td><td class="num">${num(Math.round(r.trCredits ?? 0))}</td><td class="num">${num(Math.round(r.fusionCredits ?? 0))}</td><td class="num credits">${num(Math.round(r.totalCredits))}</td><td>${r.sharedAt ? `<span class="chip ok"><i></i>${esc(date(r.sharedAt))}</span><span class="sub">${esc(r.sharedByName)}${r.sharedNote ? ` · ${esc(r.sharedNote)}` : ''}</span>` : '<span class="muted">—</span>'}</td>
        <td class="actions">${d.can.share ? `${a.primaryReportId === r.id ? '<button class="sm ghost" data-act="unprimary">Unmark primary</button>' : `<button class="sm" data-act="primary">${icon('star')}Make primary</button>`}${r.sharedAt ? '<button class="sm ghost" data-act="unshare">Unmark shared</button>' : `<button class="sm" data-act="share">${icon('send')}Mark shared</button>`}` : ''}<button class="sm ghost icon" data-act="delete" title="Delete report">${icon('trash')}</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty"><b>No reports yet</b></div>'}
    </div>`;
  if (p) countUp($('#bigc'), Math.round(p.totalCredits), ' credits');
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
async function viewPeople() {
  shell('people', loading());
  const d = await peopleList();
  const manage = can('users.manage');
  $('#main').innerHTML = `
    <div class="head"><div><h1 class="serif">People</h1><p>${manage ? 'Invite Sales Engineers and leaders, give them a role and a team, reset passwords and turn access off.' : 'The people in your teams and the teams you lead.'}</p></div>
      <div class="tools">${manage ? `<button class="primary" id="invite">${icon('plus')}Invite someone</button>` : ''}</div></div>
    <div class="panel"><div class="flex"><div class="search">${icon('search')}<input id="q" placeholder="Search people" /></div><span class="spacer"></span><span class="muted small">${num(d.people.length)} people</span></div>
      <div class="tw mt"><table><thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Leads</th><th>Last sign-in</th><th>Status</th>${manage ? '<th></th>' : ''}</tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const render = () => {
    const q = $('#q').value.trim().toLowerCase();
    $('#rows').innerHTML = d.people
      .filter((u) => !q || [u.name, u.email, u.team, u.roleName].some((s) => String(s).toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => `<tr data-id="${esc(u.id)}"><td><div class="flex"><span class="avatar sm">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><span class="sub">${esc(u.email)}${u.title ? ` · ${esc(u.title)}` : ''}</span></div></div></td><td>${esc(u.roleName)}</td><td title="${esc(u.teamPath)}">${esc(u.team || "—")}</td><td>${esc(u.leads.join(', ') || '—')}</td><td>${esc(ago(u.lastSignInAt))}</td><td>${!u.active ? '<span class="chip bad"><i></i>Off</span>' : u.mustChangePassword ? '<span class="chip warn"><i></i>Invited</span>' : '<span class="chip ok"><i></i>Active</span>'}</td>${manage ? `<td class="actions"><button class="sm" data-act="edit">Edit</button></td>` : ''}</tr>`)
      .join('');
    for (const b of $$('[data-act="edit"]')) b.onclick = () => editPerson(d, d.people.find((u) => u.id === b.closest('tr').dataset.id));
  };
  $('#q').oninput = render;
  if ($('#invite')) $('#invite').onclick = () => editPerson(d, null);
  render();
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

// ---- Settings and roles ------------------------------------------------------------------------------------------
async function viewAdmin() {
  shell('admin', loading());
  const [s, d, m] = await Promise.all([can('settings.manage') ? api('/api/settings') : null, peopleList(), can('settings.manage') ? api('/api/settings/smtp') : null]);
  const groups = [...new Set(d.permissions.map((p) => p.group))];
  $('#main').innerHTML = `<div class="head"><div><h1 class="serif">Settings &amp; roles</h1><p>The organisation's name on reports, the hosts the server may call, roles and their permissions, and backups.</p></div>${s ? `<div class="tools"><a class="btn" href="/api/backup" download="ftr-cc-backup.json">${icon('download')}Download backup</a></div>` : ''}</div>
    ${s ? `<div class="panel"><h2>Organisation &amp; hosts</h2><form class="form" id="sf">
      <label class="f">Organisation name on the reports<input name="org" maxlength="120" value="${esc(s.organisationName)}" /></label>
      <div class="row"><label class="f">Salesforce hosts${s.fromEnvironment.salesforce ? ' (set by SALESFORCE_HOSTS)' : ''}<textarea name="sfh" rows="3" ${s.fromEnvironment.salesforce ? 'disabled' : ''}>${esc(s.effective.salesforce.join('\n'))}</textarea></label>
      <label class="f">Checkmarx One hosts${s.fromEnvironment.cxone ? ' (set by CXONE_ALLOWED_HOSTS)' : ''}<textarea name="cxh" rows="3" ${s.fromEnvironment.cxone ? 'disabled' : ''}>${esc(s.effective.cxone.join('\n'))}</textarea></label>
      <label class="f">Git hosts${s.fromEnvironment.git ? ' (set by GIT_ALLOWED_HOSTS)' : ''}<textarea name="gh" rows="3" ${s.fromEnvironment.git ? 'disabled' : ''}>${esc(s.effective.git.join('\n'))}</textarea></label></div>
      <p class="muted small">A host here also allows every name below it (force.com allows acme.lightning.force.com). Private and link-local addresses are never called, whatever is listed.</p>
      <div class="flex"><button class="primary" type="submit">Save</button><span class="err" id="serr"></span></div></form></div>` : ''}
    ${m ? smtpPanel(m) : ''}
    ${can('roles.manage') ? `<div class="panel mt"><h2>Roles <small>nobody can give permissions they do not hold</small><button class="sm" id="newrole">${icon('plus')}New role</button></h2>
      <div class="tw"><table><thead><tr><th>Role</th><th>Permissions</th><th></th></tr></thead><tbody>${d.roles.map((r) => `<tr data-id="${esc(r.id)}"><td><b>${esc(r.name)}</b><span class="sub">${esc(r.description)}</span></td><td class="small">${r.permissions.map((p) => esc(d.permissions.find((x) => x.id === p)?.label ?? p)).join(' · ')}</td><td class="actions">${r.locked ? '<span class="chip">Locked</span>' : '<button class="sm" data-act="role">Edit</button>'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  if (m) wireSmtp(m);
  if ($('#sf')) $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { organisationName: f.get('org') };
    if (!s.fromEnvironment.salesforce) body.salesforceHosts = f.get('sfh');
    if (!s.fromEnvironment.cxone) body.cxoneHosts = f.get('cxh');
    if (!s.fromEnvironment.git) body.gitHosts = f.get('gh');
    try {
      await api('/api/settings', { method: 'PUT', body });
      toast('Settings saved.', 'ok');
    } catch (error) {
      $('#serr').textContent = error.message;
    }
  };
  const editRole = (r) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form class="form" id="rf"><div class="dh"><h2>${r ? `Edit ${esc(r.name)}` : 'New role'}</h2></div><div class="db form">
      <div class="row"><label class="f">Name<input name="name" required maxlength="60" value="${esc(r?.name ?? '')}" /></label><label class="f">Description<input name="desc" maxlength="300" value="${esc(r?.description ?? '')}" /></label></div>
      ${groups.map((g) => `<div><div class="muted small">${esc(g)}</div><div class="checks">${d.permissions.filter((p) => p.group === g).map((p) => `<label class="check"><input type="checkbox" name="p" value="${esc(p.id)}" ${r?.permissions.includes(p.id) ? 'checked' : ''} ${can(p.id) ? '' : 'disabled'} /><span>${esc(p.label)}<small>${esc(p.description)}</small></span></label>`).join('')}</div></div>`).join('')}
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
        viewAdmin();
      } catch (error) {
        $('#rerr', dlg).textContent = error.message;
      }
    };
    if ($('#rdel', dlg)) $('#rdel', dlg).onclick = async () => {
      try {
        await api(`/api/roles/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
        close();
        viewAdmin();
      } catch (error) {
        $('#rerr', dlg).textContent = error.message;
      }
    };
  };
  if ($('#newrole')) $('#newrole').onclick = () => editRole(null);
  for (const b of $$('[data-act="role"]')) b.onclick = () => editRole(d.roles.find((x) => x.id === b.closest('tr').dataset.id));
}

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
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const smtp = { host: f.get('host'), port: Number(f.get('port')), secure: f.get('secure') === 'on', requireAuth: f.get('requireAuth') === 'on', rejectUnauthorized: f.get('rejectUnauthorized') === 'on', user: f.get('user'), fromName: f.get('fromName'), fromAddress: f.get('fromAddress') };
    if (f.get('password')) smtp.password = f.get('password');
    try {
      await api('/api/settings/smtp', { method: 'PUT', body: { smtp, passwordReset: f.get('passwordReset') } });
      toast('Saved. Now Test connection: nothing is sent until it succeeds.', 'ok');
      viewAdmin();
    } catch (error) {
      msg(error.message);
    }
  };
  $('#smtp-test').onclick = async () => {
    msg('Testing…', true);
    try {
      const r = await api('/api/settings/smtp/test', { method: 'POST', body: {} });
      toast(r.message, 'ok');
      viewAdmin();
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
async function viewAudit(params) {
  shell('audit', loading());
  const q = params.get('q') ?? '';
  const { events } = await api(`/api/audit${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  $('#main').innerHTML = `<div class="head"><div><h1 class="serif">Audit log</h1><p>Sign-ins, every account and report made, marked primary or shared, and every change to people, teams, roles and settings. Newest first.</p></div></div>
    <div class="panel"><form class="flex" id="af"><div class="search">${icon('search')}<input name="q" value="${esc(q)}" placeholder="Search events" /></div><button>Search</button></form>
    <div class="tw mt"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>On</th><th>Details</th></tr></thead><tbody>${events.map((e) => `<tr><td class="small">${esc(dateTime(e.at))}</td><td>${esc(e.actor?.name ?? '—')}<span class="sub">${esc(e.actor?.email ?? e.ip ?? '')}</span></td><td><span class="chip">${esc(e.action)}</span></td><td>${esc(e.target)}</td><td class="small mono">${esc(Object.keys(e.details ?? {}).length ? JSON.stringify(e.details) : '')}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty"><b>No events</b></div></td></tr>'}</tbody></table></div></div>`;
  $('#af').onsubmit = (e) => {
    e.preventDefault();
    go(`/audit?q=${encodeURIComponent(new FormData(e.target).get('q'))}`);
  };
}

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
  if (path === '/login') return go(firstStepsDone() ? home() : '/welcome');
  if (!firstStepsDone()) return viewWelcome();
  try {
    if (path === '/' || path === '/welcome') return go(home());
    if (path === '/overview') return await viewOverview(params);
    if (path === '/accounts') return await viewAccounts(params);
    if (path.startsWith('/accounts/')) return await viewAccount(decodeURIComponent(path.slice('/accounts/'.length)));
    if (path === '/people') return await viewPeople();
    if (path === '/teams') return await viewTeams();
    if (path === '/admin') return await viewAdmin();
    if (path === '/audit') return await viewAudit(params);
    if (path === '/guide') return viewGuide();
    go(home());
  } catch (error) {
    if (error.status === 401) return;
    if ($('#main')) $('#main').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
    else toast(error.message, 'bad');
  }
}

window.addEventListener('hashchange', route);
route();
