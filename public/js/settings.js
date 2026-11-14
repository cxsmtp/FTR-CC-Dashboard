import { aboutHtml, md } from './about.js';
import { home } from './auth.js';
import { $, $$, api, applyMyTheme, can, date, dateTime, esc, go, icon, LOGO, lookOf, num, state, sure, THEMES, toast } from './core.js';
import { loading, shell } from './shell.js';
// ---- Settings: one tab per area, each only for those whose role allows it (the special ones are Admin-only) -------------
export let adminTab = 'general';
export const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
/**
 * A settings form that saves as it is typed in: `save(form)` is called after a pause (text) or at once (a choice),
 * and when it fails the form shows the last good values again. The status is in `status`.
 */
export function autosave(form, save, { status, delay = 700, keep = [] } = {}) {
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
export const SAVES_AS_YOU_TYPE = '<div class="saved-banner">✓ Changes save as you type.</div>';
export const ADMIN_TABS = [
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
export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error(`${file.name} could not be read.`));
    r.readAsDataURL(file);
  });
export async function download(path, fallbackName) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The server answered ${res.status}.`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function viewAdmin(tab = adminTab) {
  const tabs = ADMIN_TABS.filter(([, , p]) => p && can(p)).length ? ADMIN_TABS.filter(([, , p]) => !p || can(p)) : [];
  if (!tabs.length) return go(home());
  adminTab = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  if (location.hash !== `#/admin/${adminTab}`) history.replaceState(null, '', `#/admin/${adminTab}`);
  shell('admin', `<div class="head compact"><div class="ht"><h1 class="serif">${esc(tabs.find(([id]) => id === adminTab)?.[1] ?? 'Settings')}</h1><span class="crumbs">for the whole command center \u00b7 Admins only</span></div></div>
    <div id="tab">${loading()}</div>`);
  try {
    await ADMIN_VIEWS[adminTab]();
  } catch (error) {
    if (error.status !== 401) $('#tab').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
  }
}

export const ADMIN_VIEWS = {
  // Get help: the address support cases and enhancement requests are emailed to (saved as it changes).
  async help() {
    const me = await api('/api/me');
    const sup = me.support ?? { email: '' };
    $('#tab').innerHTML = `<div class="saved-banner">✓ Changes save as you type.</div>
      <div class="panel"><h2>Get help <small>where the support cases and enhancement requests people send from Get help are emailed</small></h2>
      <form class="form" id="supf" autocomplete="off">
        <label class="f">Send requests to<input type="email" name="email" value="${esc(sup.email)}" placeholder="support@company.com" /></label>
        <p class="muted small">Each request is emailed here through the email server (Settings → Email (SMTP)); replying to it answers the person who asked. Until the email server is set up and tested, requests are kept and the page says the email did not go.</p>
      </form><div class="saved-foot" id="supsaved">All changes are saved.</div></div>`;
    autosave($('#supf'), async (form) => {
      const r = await api('/api/settings/support', { method: 'PUT', body: { mode: 'portal', email: form.elements.email.value } });
      state.me.support = r;
    }, { status: $('#supsaved') });
  },
  async about() {
    $('#tab').innerHTML = await aboutHtml();
  },
  async branding() {
    const [s, b] = await Promise.all([api('/api/settings'), api('/api/branding')]);
    const look = { accent: lookOf(b.look ?? 'aurora'), mode: b.mode ?? 'light' };
    $('#tab').innerHTML = `<div class="saved-banner">✓ Changes save as you type.</div>
      <div class="panel brand-page"><h2>Branding</h2>
      <form class="form" id="bf" autocomplete="off">
        <div class="brand-grid">
          <label class="f">App name<input name="appName" maxlength="40" value="${esc(b.appName)}" /></label>
          <label class="f">Under the name<input name="tagline" maxlength="40" value="${esc(b.tagline ?? '')}" placeholder="Command Center" /></label>
          <label class="f">Company name <small>on every report</small><input name="organisationName" maxlength="120" value="${esc(s.organisationName)}" /></label>
          <label class="f" hidden>Accent colour <small>${b.accent ? `<button type="button" class="link" id="accent-reset">the look’s own</button>` : 'the look’s own'}</small><span class="colour"><input type="color" name="accent" value="${esc(b.accent || '#22d3ee')}" /><span id="accent-v">${esc(b.accent || 'From the look')}</span></span></label>
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

      <label class="check"><input type="checkbox" name="proxy" ${s.trustProxy || s.trustProxyEnv ? 'checked' : ''} ${s.trustProxyEnv ? 'disabled' : ''} /><span>Behind a reverse proxy${s.trustProxyEnv ? ' (set by TRUST_PROXY)' : ''}<small>Tick it when a proxy or load balancer sits in front of this server: the audit log then shows each person’s own address (X-Forwarded-For) instead of the proxy’s, and browsers that came over HTTPS are told to keep to it (HSTS). Leave it unticked when people reach this server directly: anyone could then claim any address.</small></span></label>
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
      if (!s.trustProxyEnv) body.trustProxy = f.get('proxy') === 'on';
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
        if (!(/Confirm/.test(error.message) && await sure(error.message))) return err(error);
        try {
          await api('/api/https/mode', { method: 'POST', body: { mode, confirm: true } });
        } catch (again) {
          return err(again);
        }
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
        if (!(/Confirm|confirm/.test(error.message) && await sure(error.message))) return ($('#upres').textContent = error.message);
        try {
          await api('/api/https/certificate', { method: 'POST', body: { ...body, confirm: true } });
        } catch (again) {
          return ($('#upres').textContent = again.message);
        }
      }
      toast('Certificate in use.', 'ok');
      viewAdmin('https');
    };
    if ($('#prev')) $('#prev').onclick = async () => {
      try {
        await api('/api/https/certificate/previous', { method: 'POST', body: {} });
      } catch (error) {
        return err(error);
      }
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
    // A staging installation also takes candidate releases (pre-releases); any other only promoted ones.
    const takes = (r) => !r.prerelease || u.stage === 'staging';
    const newest = u.releases.find((r) => takes(r) && r.installable && !r.tampered);
    const avail = u.releases.find((r) => takes(r) && r.installable && !r.tampered && !r.failed && cmpVer(r.version, u.running) > 0);
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
        <form id="stage" class="stage-box" data-nodraft>
          <div class="stage-h"><b>This installation is</b>
            <span class="seg stage-seg" role="radiogroup" aria-label="What this installation is">
              ${[['', 'Not marked'], ['staging', 'Staging'], ['production', 'Production']].map(([v, l]) => `<label class="${(u.stage ?? '') === v ? 'on' : ''}"><input type="radio" name="stage" value="${v}" ${(u.stage ?? '') === v ? 'checked' : ''} />${l}</label>`).join('')}
            </span><span class="faint" id="stage-saved"></span></div>
          <p class="muted small">${u.stage === 'staging' ? '<b>Staging:</b> where new versions are tried first. It takes every release as soon as it is found, candidates included, and says “Staging” at the top of every page.' : u.stage === 'production' ? '<b>Production:</b> where people work. It takes only releases promoted after they ran on staging, and only in the hours below when they are set.' : 'Not marked: it takes every published release, as it always has. Mark it <b>Staging</b> while the software is still being shaped; mark the one people work on <b>Production</b> when it is ready (a staging one beside it then tries each version first).'}</p>
          <div class="stage-win"><span>Update by itself only between</span><input type="time" name="from" value="${esc(u.window?.from ?? '')}" aria-label="From" /><span>and</span><input type="time" name="to" value="${esc(u.window?.to ?? '')}" aria-label="To" />
            <span class="faint">server time, now ${esc(u.serverTime ?? '')}. Empty: at any time. Installing by hand is never held back.${u.window && !u.inWindow && avail ? ` <b>${esc(label(avail.version))} is waiting for these hours.</b>` : ''}</span></div>
        </form>
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
      if (b.dataset.rollback && !await sure(`Roll back to ${v}? A backup is taken first, and it takes over without a restart. Going back to an older version can leave newer data it does not know.`)) return;
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
      if (!await sure(`Switch to ${b.dataset.roll}? A backup is taken first. Going back to an older version can leave newer data it does not know.`)) return;
      try {
        const r = await api('/api/updates/switch', { method: 'POST', body: { version: b.dataset.roll, reason: 'rollback' } });
        waitForRestart(r.to);
      } catch (error) {
        toast(error.message, 'bad');
      }
    };
    // What this installation is marked as, and the hours it may update in: saved as they change.
    $('#stage').onsubmit = (e) => e.preventDefault();
    $('#stage').onchange = async (e) => {
      const f = new FormData($('#stage'));
      const body = e.target.name === 'stage' ? { stage: f.get('stage') } : { window: f.get('from') || f.get('to') ? { from: f.get('from'), to: f.get('to') } : null };
      // Both hours are needed before they mean anything: the first one typed waits for the second.
      if (body.window && !(body.window.from && body.window.to)) return ($('#stage-saved').textContent = 'Give both hours.');
      try {
        await api('/api/updates/auto', { method: 'PUT', body });
        state.me.stage = e.target.name === 'stage' ? f.get('stage') : state.me.stage;
        toast('Saved.', 'ok');
        viewAdmin('updates');
      } catch (x) {
        toast(x.message, 'bad');
        viewAdmin('updates');
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
      if (!await sure('Reload the server? It loads again beside the running one and takes over without a restart: nobody is signed out.')) return;
      await api('/api/system/restart', { method: 'POST', body: {} });
      waitForRestart(u.running);
    };
  },

  async backups() {
    const [b, v, rd] = await Promise.all([api('/api/backups'), can('audit.view') ? api('/api/audit/verify') : null, can('settings.manage') ? api('/api/system/readiness').catch(() => null) : null]);
    const RD = { ok: ['ok', 'Ready'], todo: ['bad', 'To do'], note: ['warn', 'Check'] };
    $('#tab').innerHTML = `<div class="grid g2">
      <div class="panel"><h2>Backups <small>nightly, before every version switch, and by hand · the newest 14 kept</small></h2>
        <p class="muted small">Everything: people, teams, accounts, reports, settings, certificates and the audit log. ${b.sealed ? (b.sealedBy === 'environment' ? 'Sealed with BACKUP_PASSPHRASE.' : 'Sealed with the passphrase set below.') : '<b class="warn-t">Not sealed:</b> anyone who gets a backup file can read everything in it. Set a passphrase below.'} Kept in <span class="mono">${esc(b.dir)}</span>.</p>
        ${b.separate ? '<div class="callout">Backups go to their own place (BACKUP_DIR), away from the data: losing one disk does not lose both.</div>' : '<div class="callout warn">Backups are in the data volume itself. Mount a second volume or a network share and set <b>BACKUP_DIR</b> to it, so losing one disk does not lose both.</div>'}
        ${b.last && !b.last.ok ? `<div class="callout warn mt">The last backup failed (${esc(dateTime(b.last.at))}): ${esc(b.last.error)}</div>` : ''}
        <div class="flex"><button class="primary" id="now">${icon('plus')}Back up now</button></div>
        ${b.sealedBy === 'environment' ? '' : `<form class="form mt" id="seal" data-nodraft><label class="f">${b.sealed ? 'Replace the passphrase' : 'Seal backups with a passphrase'} <span class="muted">at least 12 characters; from the next backup on</span><input type="password" name="pass" autocomplete="new-password" minlength="12" /></label>
          <p class="muted small">Keep it somewhere safe, away from this server: a sealed backup cannot be restored without it, and it is never shown again.${b.sealed ? ' Backups already made keep the passphrase they were sealed with.' : ''}</p>
          <div class="flex"><button class="primary sm" type="submit">${b.sealed ? 'Replace' : 'Seal backups'}</button>${b.sealed ? '<button type="button" class="ghost sm danger" id="unseal">Stop sealing</button>' : ''}<span class="err" id="seal-err"></span></div></form>`}
        <div class="tw mt"><table><tbody>${b.backups.map((x) => `<tr><td class="small mono">${esc(x.name)}</td><td class="small">${esc(dateTime(x.at))}</td><td class="num small">${esc((x.bytes / 1024).toFixed(0))} KB</td><td class="actions"><button class="sm ghost" data-dl="${esc(x.name)}">${icon('download')}Download</button></td></tr>`).join('') || '<tr><td><div class="empty"><b>No backups yet</b></div></td></tr>'}</tbody></table></div>
        <h3 class="mt">Restore</h3>
        <form class="form" id="rs"><label class="f">A backup file<input type="file" name="file" accept=".ccbackup" /></label><label class="f">Its passphrase <span class="muted">if sealed</span><input type="password" name="pass" autocomplete="off" /></label><div class="flex"><button type="submit" class="danger">Check and restore</button></div><div class="small" id="rsres"></div></form></div>
      <div class="panel"><h2>Health</h2>
        ${v ? `<p>${v.ok ? `<span class="chip ok"><i></i>Audit log intact</span> ${esc(v.events)} events, each chained to the one before.` : `<span class="chip bad"><i></i>Audit log broken</span> at event ${esc(v.brokenAt)}: ${esc(v.why)}.`}</p>` : ''}
        ${b.recovered?.length ? `<h3>Repaired at start</h3><ul class="small">${b.recovered.map((e) => `<li>${esc(dateTime(e.at))}: <span class="mono">${esc(e.target)}</span> ${e.action === 'recover.restored' ? `could not be read and was restored from ${esc(e.details.backup)}` : 'could not be read, was in no backup, and was set aside'} (the damaged file is kept as ${esc(e.details.kept)})</li>`).join('')}</ul>` : '<p class="small muted">Every data file is checked at start; one that cannot be read is restored from the newest backup that has it. Nothing needed repairing.</p>'}
        <p class="muted small">The troubleshooting report has versions, health, settings in force, update events, backups and recent errors, and no secrets, keys or customer data.</p>
        <div class="flex"><button id="diag">${icon('download')}Download troubleshooting report</button>${can('audit.view') ? `<a class="btn ghost" href="/api/audit/export.csv" download>${icon('download')}Audit log (CSV)</a>` : ''}</div></div>
    </div>
    ${rd ? `<div class="panel wide-panel mt" id="ready"><h2>Ready for production? <small>${rd.todo ? `${num(rd.todo)} to do` : 'nothing left to do'}${rd.notes ? ` · ${num(rd.notes)} to check` : ''}</small></h2>
      <p class="muted small">What to put right before the server is opened to more people, and where. Looking changes nothing.</p>
      <div class="tw"><table class="ready-table"><thead><tr><th>Check</th><th>State</th><th>What was found</th><th>Where</th></tr></thead><tbody>${rd.checks.map((c) => `<tr><td><b>${esc(c.title)}</b></td><td data-sort="${{ todo: 0, note: 1, ok: 2 }[c.state]}" data-v="${RD[c.state][1]}"><span class="chip ${RD[c.state][0]}"><i></i>${RD[c.state][1]}</span></td><td class="small">${esc(c.detail)}</td><td><span class="ready-act">${c.where && c.state !== 'ok' ? `<a class="btn ghost sm" href="#${esc(c.where)}">Open</a>` : ''}${c.canAccept && c.state !== 'ok' ? `<button class="ghost sm" data-accept="${esc(c.id)}" title="It is as you mean it: shown as ready until what was found changes">As meant</button>` : ''}${c.accepted ? `<span class="muted small">as meant: ${esc(c.accepted.by)}, ${esc(date(c.accepted.at))}</span><button class="ghost sm" data-ask="${esc(c.id)}">Ask again</button>` : ''}</span></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    for (const btn of $$('[data-accept], [data-ask]')) btn.onclick = async () => {
      await api(`/api/system/readiness/${encodeURIComponent(btn.dataset.accept ?? btn.dataset.ask)}`, { method: 'PUT', body: { accept: Boolean(btn.dataset.accept) } }).then(() => toast(btn.dataset.accept ? 'Kept as meant.' : 'It is asked again.', 'ok'), (x) => toast(x.message, 'bad'));
      viewAdmin('backups');
    };
    $('#now').onclick = async () => {
      await api('/api/backups', { method: 'POST', body: {} }).then(() => toast('Backed up.', 'ok'), (x) => toast(x.message, 'bad'));
      viewAdmin('backups');
    };
    for (const btn of $$('[data-dl]')) btn.onclick = () => download(`/api/backups/${encodeURIComponent(btn.dataset.dl)}`, btn.dataset.dl).catch((x) => toast(x.message, 'bad'));
    if ($('#seal')) $('#seal').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/backups/seal', { method: 'PUT', body: { passphrase: e.target.pass.value } });
        toast('Backups are sealed from the next one on. Keep the passphrase safe.', 'ok', 8000);
        viewAdmin('backups');
      } catch (error) {
        $('#seal-err').textContent = error.message;
      }
    };
    if ($('#unseal')) $('#unseal').onclick = async () => {
      if (!await sure('Stop sealing backups? From the next one on, anyone who gets a backup file can read everything in it.')) return;
      await api('/api/backups/seal', { method: 'PUT', body: { passphrase: '' } }).then(() => viewAdmin('backups'), (x) => toast(x.message, 'bad'));
    };
    $('#diag').onclick = () => download('/api/system/diagnostics', 'cc-troubleshooting.json').catch((x) => toast(x.message, 'bad'));
    $('#rs').onsubmit = async (e) => {
      e.preventDefault();
      const file = e.target.file.files[0];
      if (!file) return ($('#rsres').textContent = 'Choose a backup file.');
      const body = { data: await fileToBase64(file), passphrase: e.target.pass.value };
      try {
        const info = await api('/api/backups/inspect', { method: 'POST', body });
        if (!await sure(`Restore the backup of ${dateTime(info.at)} (${info.files} files: ${info.accounts} accounts, ${info.reports} reports)?\n\nEverything here is replaced. A backup of what is here now is taken first.`)) return;
        const r = await api('/api/backups/restore', { method: 'POST', body: { ...body, confirm: true } });
        $('#rsres').textContent = r.restarting ? 'Restored. The command center is loading it, without a restart…' : 'Restored. Restart the server to read it.';
        if (r.restarting) setTimeout(() => location.reload(), 6000);
      } catch (error) {
        $('#rsres').textContent = error.message;
      }
    };
  },

};

// ---- Email server (SMTP) ---------------------------------------------------------------
export function smtpPanel(m) {
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
      <div class="flex"><button type="button" class="primary" id="smtp-test">Test connection</button><input id="smtp-to" type="email" placeholder="Send a test to (you by default)" class="grow" /><button type="button" id="smtp-send">Send test email</button></div>
      <div class="small" id="smtp-msg" aria-live="polite"></div>
    </form><div class="saved-foot" id="smtpsaved">All changes are saved.</div></div>`;
}
export function wireSmtp() {
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
