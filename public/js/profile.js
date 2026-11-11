import { md } from './about.js';
import { $, api, avatar, dateTime, esc, icon, num, state, themePicker, toast } from './core.js';
import { fileToBase64 } from './settings.js';
import { shell } from './shell.js';
// ---- Your profile: who you are here, and how the command center appears to you ---------------
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'ILS', 'TRY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'ZAR', 'NGN', 'KES', 'EGP', 'JPY', 'CNY', 'HKD', 'SGD', 'AUD', 'NZD', 'KRW', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'CAD', 'MXN', 'BRL', 'ARS', 'CLP', 'COP'];
export async function viewProfile() {
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
export const DOCS = [['terms', 'Terms of use', '/legal/terms'], ['license', 'License', '/legal/license'], ['guide', 'User guide', '/legal/guide']];
export async function openDoc(which = 'terms') {
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
