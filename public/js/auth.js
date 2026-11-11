import { $, api, applyMyTheme, brandHtml, can, esc, go, icon, state } from './core.js';
import { guideHtml, personaOf } from './guide.js';
import { signOut } from './shell.js';
// ---- Sign in --------------------------------------------------------------------------------------------
export function viewLogin() {
  $('#app').className = 'app bare';
  $('#app').innerHTML = `
  <div class="auth fade">
    <section class="card">
      <div class="auth-brand">${brandHtml()}</div>
      <h2>Sign in</h2>
      <form class="form" id="login" autocomplete="on">
        <label class="f">Work email<input type="email" name="email" autocomplete="username" required autofocus /></label>
        <label class="f">Password<input type="password" name="password" autocomplete="current-password" required /></label>
        <div class="err" id="err"></div>
        <button class="primary" type="submit">Sign in</button>
        <a href="#/forgot" class="small" id="forgot-link">Forgot your password?</a>
      </form>
      <div id="sso-box" hidden><div class="or"><span>or</span></div><a class="btn sso" id="sso-btn" href="/saml/login">${icon('people')}<span id="sso-label">Sign in with SSO</span></a></div>
      <p class="foot">Internal use only · <a href="#/legal" data-doc="terms">Terms of use &amp; license</a></p>
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
export function authCard(inner) {
  $('#app').className = 'app bare';
  $('#app').innerHTML = `<div class="auth fade"><section class="card"><div class="auth-brand">${brandHtml()}</div>${inner}<p class="foot">The link goes to your work email, works once and lasts 30 minutes.</p></section></div>`;
}
export async function viewForgot(params) {
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
export async function viewReset(params) {
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

export const firstStepsDone = () => state.me && !state.me.user.mustChangePassword && state.me.terms.accepted && state.me.guideSeen;
/**
 * A Salesforce link, read as the server reads it (server/accounts.js checkSalesforceUrl): https, an opportunity (006)
 * or an account (001) whose object in a Lightning link agrees, and an 18-character id whose last three letters check.
 */
export function sfRead(value) {
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
export const HOME_PAGES = [['overview', 'Overview'], ['calculator', 'Calculator'], ['accounts', 'Accounts'], ['activity', 'CxOne API audit'], ['guide', 'Quick guide']];
/** Where this person lands: their role's home page (set in Roles & permissions), if they may open it. */
export const home = () => {
  const h = state.me?.role?.home;
  if (h === 'calculator' && can('calculator.use')) return '/calculator';
  if ((h === 'overview' || h === 'accounts') && can('dashboard.view')) return `/${h}`;
  if (h === 'activity' || h === 'guide') return `/${h}`;
  return can('dashboard.view') ? '/overview' : '/guide';
};

// ---- First sign-in: password, terms, quick guide ----------------------------------------------------------
export async function viewWelcome() {
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
