import { viewAbout } from './about.js';
import { viewAccount, viewAccounts } from './accounts.js';
import { viewActivity } from './activity.js';
import { viewAudit } from './audit.js';
import { firstStepsDone, home, viewForgot, viewLogin, viewReset, viewWelcome } from './auth.js';
import { $, api, applyMyTheme, esc, go, state, toast } from './core.js';
import { viewGuide } from './guide.js';
import { viewHelp } from './help.js';
import { viewOverview } from './overview.js';
import { viewPeople } from './people.js';
import { viewProfile } from './profile.js';
import { viewRates } from './rates.js';
import { viewAdmin } from './settings.js';
import { viewTeams } from './teams.js';
// ---- Router ---------------------------------------------------------------------------------------------------
// One page at a time: a page that is still loading finishes before the next one starts, so a slow page can never write
// into (or over) the page opened after it. Clicks made meanwhile are not lost: the last place asked for is opened next.
let routing = false;
let again = false;
export async function route() {
  if (routing) return void (again = true);
  routing = true;
  try {
    await show();
  } finally {
    routing = false;
    if (again) {
      again = false;
      route();
    }
  }
}
async function show() {
  const [pathPart, query = ''] = location.hash.replace(/^#/, '').split('?');
  const path = pathPart || '/';
  const params = new URLSearchParams(query);
  // An account's side panel belongs to the Accounts list: leaving for another page takes it away.
  if (!path.startsWith('/accounts')) document.getElementById('acct-drawer')?.remove();
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
