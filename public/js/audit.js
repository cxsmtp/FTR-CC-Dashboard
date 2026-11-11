import { $, api, dateTime, esc, go, icon, num, toast } from './core.js';
import { loading, shell } from './shell.js';
// ---- Audit ------------------------------------------------------------------------------------------------------
export const AUDIT_GROUPS = { auth: 'Sign-in', user: 'People', people: 'People', team: 'Teams', teams: 'Teams', role: 'Roles', roles: 'Roles', account: 'Accounts', accounts: 'Accounts', report: 'Reports', reports: 'Reports', sale: 'Credits sold', cxone: 'Checkmarx One', git: 'Git', calculator: 'Calculator', settings: 'Settings', https: 'HTTPS', sso: 'Single sign-on', updates: 'Updates', backup: 'Backups', backups: 'Backups', audit: 'Audit log', system: 'System', export: 'Exports', terms: 'Terms', me: 'Own settings', setup: 'Setup', dashboard: 'Dashboard' };
export const AUDIT_NAMES = {
  'auth.signin': 'Signed in', 'auth.signout': 'Signed out', 'auth.failed': 'Sign-in failed', 'auth.password': 'Changed their password', 'auth.password.refused': 'Password change refused', 'auth.reset.sent': 'Password reset email sent', 'auth.reset.done': 'Reset their password by email', 'auth.reset.failed': 'Password reset failed', 'auth.reset.refused': 'Password reset refused', 'auth.sso.signin': 'Signed in with SSO', 'auth.sso.refused': 'SSO sign-in refused',
  'user.create': 'Added a person', 'user.create.sso': 'Added by SSO sign-in', 'user.update': 'Changed a person', 'user.remove': 'Removed a person', 'user.reset': 'Reset a password', 'user.unlock': 'Unlocked a person', 'user.signout': 'Signed a person out everywhere', 'user.welcome': 'Sent a welcome email', 'user.import': 'Imported people and teams',
  'team.create': 'Created a team', 'team.update': 'Changed a team', 'team.remove': 'Removed a team', 'role.save': 'Saved a role', 'role.remove': 'Removed a role',
  'account.create': 'Created an account', 'account.update': 'Changed an account', 'account.delete': 'Deleted an account', 'report.create': 'Generated a report', 'report.delete': 'Deleted a report', 'report.open': 'Opened a report', 'sale.record': 'Recorded credits sold', 'sale.remove': 'Removed a sale',
  'cxone.connect': 'Connected to Checkmarx One', 'cxone.key.saved': 'Kept a Checkmarx One key', 'cxone.key.used': 'Refreshed with the kept key', 'cxone.key.forgotten': 'Forgot the kept key', 'cxone.key.failed': 'Kept key refused', 'cxone.read.resumed': 'Read resumed after a reload', 'cxone.read.interrupted': 'Read cut off', 'git.count': 'Counted code from git',
  'settings.update': 'Changed settings', 'settings.smtp': 'Changed the email server', 'settings.smtp.test': 'Tested the email server', 'settings.sso': 'Changed single sign-on', 'terms.accept': 'Accepted the terms', 'me.prefs.update': 'Changed their theme', 'calculator.update': 'Saved an account in the calculator', 'calculator.read': 'Read Checkmarx One', 'cxone.disconnect': 'Disconnected from Checkmarx One', 'backups.create': 'Took a backup', 'report.open': 'Opened a report', 'setup.admin': 'First Admin created',
  'updates.check': 'Checked for updates', 'updates.install': 'Installed a version', 'updates.switch': 'Switched version', 'updates.auto': 'Changed auto-update', 'system.restart': 'Reloaded the server', 'system.diagnostics': 'Downloaded diagnostics',
  'backup.written': 'Backup written', 'backup.download': 'Downloaded a backup', 'backup.restore': 'Restored a backup', 'backup.failed': 'Backup failed', 'audit.verify': 'Checked the audit log', 'audit.export': 'Exported the audit log', 'export.accounts': 'Exported accounts', 'export.reports': 'Exported reports',
};
export const auditBase = (a) => String(a).replace(/^refused: /, '');
export const auditLabel = (a) => {
  const b = auditBase(a);
  const name = AUDIT_NAMES[b] ?? b.split('.').map((w, i) => (i === 0 ? AUDIT_GROUPS[w] ?? w : w.replace(/-/g, ' '))).join(' · ');
  return String(a).startsWith('refused: ') ? `Refused: ${name}` : name;
};
export const auditDetails = (d) =>
  Object.entries(d ?? {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `<span class="kvp"><i>${esc(k)}</i> ${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</span>`)
    .join(' ');
export async function viewAudit(params) {
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
