import { workbook } from '../xlsx-write.js';
import { HOME_PAGES } from './auth.js';
import { $, $$, ago, api, avatar, can, esc, icon, num, state, sure, toast } from './core.js';
import { csvCell, loading, shell } from './shell.js';
// ---- People -------------------------------------------------------------------------------------------
export async function peopleList() {
  state.people = await api('/api/people');
  return state.people;
}
// People, roles and sign-in: for Leaders (their teams), Executives and Admins (everyone).
export let peopleTab = 'people';
export const STATUS = { active: ['ok', 'Active'], locked: ['bad', 'Locked'], disabled: ['bad', 'Off'], pending: ['warn', 'Must set password'] };
export const PAGE = 25;
export async function viewPeople(tab = peopleTab) {
  peopleTab = ['people', 'roles', 'signin'].includes(tab) ? tab : 'people';
  if (peopleTab === 'signin' && !can('users.manage')) peopleTab = 'people';
  if (peopleTab === 'roles' && !(can('users.manage') || can('roles.manage'))) peopleTab = 'people';
  if (location.hash.split('?')[0] !== `#/people/${peopleTab}`) history.replaceState(null, '', `#/people/${peopleTab}`);
  const manage = can('users.manage');
  shell('people', loading());
  const d = await peopleList();
  const tabs = [['people', `People <em>${num(d.people.length)}</em>`], ...(manage || can('roles.manage') ? [['roles', `Roles &amp; permissions <em>${num(d.roles.length)}</em>`]] : []), ...(manage ? [['signin', 'Sign-in']] : [])];
  $('#main').innerHTML = `<div class="head"><div><h1 class="serif">People</h1><p>${manage ? (can('scope.all') ? 'Everyone who can sign in, and what they may do. You manage people in every team.' : 'The people in the teams you lead. You can invite them, change their role and team, reset passwords, unlock, sign out and turn access off, never beyond your own permissions.') : 'The people in your teams and the teams you lead.'}</p></div></div>
    <div id="ptab"></div>`;
  if (peopleTab === 'roles') return rolesMatrix(d);
  if (peopleTab === 'signin') return signInTab();
  return peopleTable(d);
}

export function peopleTable(d) {
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
      <select id="f-manager" title="Everyone under this person, at every level"><option value="">Reports to: anyone</option><option value="-">Reports to nobody</option>${d.people.filter((u) => u.reports?.length).sort((a, b) => a.name.localeCompare(b.name)).map((u) => `<option value="${esc(u.id)}">Under ${esc(u.name)}</option>`).join('')}</select>
      <select id="f-status"><option value="">Any status</option>${Object.entries(STATUS).map(([k, [, l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <span class="spacer"></span><span class="muted small" id="count"></span></div>
    ${manage ? `<div class="bulk" id="bulk" hidden><b id="bulk-n"></b>
      <label class="bulk-f">Role<select id="bulk-role"><option value="">—</option>${roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>
      <label class="bulk-f">Team<select id="bulk-team"><option value="">—</option>${teams.map((t) => `<option value="${esc(t.id)}">${esc(t.path)}</option>`).join('')}</select></label>
      <label class="bulk-f">Reports to<select id="bulk-manager"><option value="">—</option><option value="-">Nobody</option>${(d.managers ?? []).map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
      <button type="button" class="sm" data-bulk="on">Access on</button><button type="button" class="sm" data-bulk="off">Access off</button>
      ${d.mail ? '<button type="button" class="sm" data-bulk="welcome">Send welcome</button>' : ''}
      <button type="button" class="sm" data-bulk="reset">Reset passwords</button><button type="button" class="sm" data-bulk="signout">Sign out everywhere</button><button type="button" class="sm" data-bulk="unlock">Unlock</button>
      <button type="button" class="sm danger" data-bulk="remove">Remove</button><button type="button" class="sm ghost" id="bulk-clear">Clear</button><span class="muted small" id="bulk-out"></span></div>` : ''}
    <div class="tw mt"><table class="people"><thead><tr>${manage ? '<th class="sel"><input type="checkbox" id="sel-all" title="Select everyone shown by the filters" aria-label="Select everyone shown by the filters" /></th>' : ''}<th>Person</th><th>Role</th><th>Team</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="flex pager" id="pager"><span class="muted small" id="pinfo"></span><span class="spacer"></span><button class="sm" id="prev">Previous</button><button class="sm" id="next">Next</button></div></div>`;
  const list = () => {
    const q = $('#q').value.trim().toLowerCase();
    const [role, team, status, boss] = [$('#f-role').value, $('#f-team').value, $('#f-status').value, $('#f-manager').value];
    // Under someone: everyone who reports to them, directly or through others.
    const under = new Set();
    if (boss && boss !== '-') {
      const add = (id) => {
        for (const u of d.people) if (u.managerId === id && !under.has(u.id)) (under.add(u.id), add(u.id));
      };
      add(boss);
    }
    return d.people
      .filter((u) => !boss || (boss === '-' ? !u.managerId : under.has(u.id)))
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
      const acts = u.manageable ? `<button type="button" class="btn sm" data-manage aria-label="Manage ${esc(u.name)}">Manage</button>` : '';
      const self = u.id === state.me.user.id;
      const roleCell = u.manageable && !self ? `<select class="inline-sel" data-inline="role" title="Change ${esc(u.name)}’s role">${roles.some((r) => r.id === u.role) ? '' : `<option value="${esc(u.role)}" selected>${esc(u.roleName)}</option>`}${roles.map((r) => `<option value="${esc(r.id)}"${r.id === u.role ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : `<span class="chip role">${esc(u.roleName)}</span>`;
      const teamCell = u.manageable ? `<select class="inline-sel" data-inline="team" title="Move ${esc(u.name)} to another team">${teams.map((t) => `<option value="${esc(t.id)}"${t.id === u.teamId ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select>` : esc(u.team || '—');
      return `<tr data-id="${esc(u.id)}" class="${selected.has(u.id) ? 'picked' : ''}">${manage ? `<td class="sel">${u.manageable && !self ? `<input type="checkbox" data-sel ${selected.has(u.id) ? 'checked' : ''} aria-label="Select ${esc(u.name)}" />` : ''}</td>` : ''}<td><div class="flex nowrap">${avatar(u.name, u.picture)}<div><b>${esc(u.name)}</b>${u.id === state.me.user.id ? ' <span class="chip">You</span>' : ''}<span class="sub">${esc(u.email)}${u.title ? ` · ${esc(u.title)}` : ''}</span></div></div></td>
        <td data-v="${esc(u.roleName)}">${roleCell}${u.leads.length ? `<span class="sub">Leads ${esc(u.leads.join(', '))}</span>` : ''}</td><td title="${esc(u.teamPath)}" data-v="${esc(u.team || '—')}">${teamCell}${u.manager ? `<span class="sub">Reports to ${esc(u.manager)}</span>` : ''}</td>
        <td title="Signs in with ${u.signIn === 'sso' ? 'single sign-on' : 'a password'}"><span class="chip ${kind}"><i></i>${label}</span>${u.lockedUntil ? `<span class="sub">until ${esc(new Date(u.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>` : ''}</td>
        <td class="small">${esc(ago(u.lastSignInAt))}</td><td class="actions">${acts}</td></tr>`;
    }).join('') || `<tr><td colspan="${manage ? 8 : 7}"><div class="empty"><b>Nobody matches</b></div></td></tr>`;
    for (const b of $$('#rows [data-manage]')) b.onclick = () => openPerson(d, d.people.find((u) => u.id === b.closest('tr').dataset.id));
    // Role and team, changed right in the row.
    for (const sel of $$('#rows [data-inline]')) {
      sel.onchange = async () => {
        const u = d.people.find((x) => x.id === sel.closest('tr').dataset.id);
        const body = sel.dataset.inline === 'role' ? { role: sel.value } : { teamId: sel.value };
        try {
          const r = await api(`/api/people/${encodeURIComponent(u.id)}`, { method: 'PUT', body });
          toast(`${u.name}: ${sel.dataset.inline === 'role' ? 'role' : 'team'} changed to ${sel.selectedOptions[0].textContent}.${r.accountsMoved ? ` Their ${num(r.accountsMoved)} account${r.accountsMoved === 1 ? '' : 's'} moved with them.` : ''}`, 'ok');
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
      if (await sure(`Give ${num(selected.size)} ${selected.size === 1 ? 'person' : 'people'} the role ${name}?`)) await runBulk(`Role → ${name}`, (u) => api(P(u), { method: 'PUT', body: { role: e.target.value } }));
      e.target.value = '';
    };
    $('#bulk-team').onchange = async (e) => {
      if (!e.target.value) return;
      const name = e.target.selectedOptions[0].textContent;
      if (await sure(`Move ${num(selected.size)} ${selected.size === 1 ? 'person' : 'people'} to ${name}?`)) await runBulk(`Team → ${name}`, (u) => api(P(u), { method: 'PUT', body: { teamId: e.target.value } }));
      e.target.value = '';
    };
    $('#bulk-manager').onchange = async (e) => {
      if (!e.target.value) return;
      const name = e.target.selectedOptions[0].textContent;
      const managerId = e.target.value === '-' ? null : e.target.value;
      if (await sure(`${num(selected.size)} ${selected.size === 1 ? 'person reports' : 'people report'} to ${managerId ? name : 'nobody'}?`)) await runBulk(`Reports to → ${name}`, (u) => api(P(u), { method: 'PUT', body: { managerId } }));
      e.target.value = '';
    };
    $('#bulk-clear').onclick = () => (selected.clear(), render());
    $('#bulk').addEventListener('click', async (e) => {
      const act = e.target.closest('[data-bulk]')?.dataset.bulk;
      if (!act) return;
      const n = `${num(selected.size)} ${selected.size === 1 ? 'person' : 'people'}`;
      if (act === 'on') return runBulk('Access on', (u) => api(P(u), { method: 'PUT', body: { active: true } }));
      if (act === 'off' && await sure(`Turn off access for ${n}? They are signed out at once; their accounts and reports stay with their teams.`)) return runBulk('Access off', (u) => api(P(u), { method: 'PUT', body: { active: false } }));
      if (act === 'welcome' && await sure(`Email a welcome to ${n}?`)) return runBulk('Welcome sent', (u) => api(`${P(u)}/welcome`, { method: 'POST', body: {} }), { reload: false });
      if (act === 'signout' && await sure(`Sign ${n} out on every device?`)) return runBulk('Signed out', (u) => api(`${P(u)}/signout`, { method: 'POST', body: {} }));
      if (act === 'unlock') return runBulk('Unlocked', (u) => api(`${P(u)}/unlock`, { method: 'POST', body: {} }));
      if (act === 'remove' && await sure(`Remove ${n}? Their accounts and reports stay with their teams. This cannot be undone.`)) {
        await runBulk('Removed', (u) => api(P(u), { method: 'DELETE' }));
        return;
      }
      if (act === 'reset' && await sure(`Give ${n} a new temporary password? Their current ones stop working and they are signed out everywhere. The new ones download once, as a sheet.`)) {
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
  for (const id of ['#q', '#f-role', '#f-team', '#f-manager', '#f-status']) $(id)[id === '#q' ? 'oninput' : 'onchange'] = () => ((page = 0), render());
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
export const saveBlob = (blob, name) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
};
export const HEADERS = { email: /^(e-?mail|work e-?mail|email address)$/, name: /^(name|full name|person)$/, title: /^(title|job title|position)$/, role: /^(role|access)$/, team: /^(team|team path|region|team \(path\))$/, leads: /^(leads?|leader|leads (the |their )?team|team leader)$/ };
export function sheetRows(sheet) {
  const rows = sheet.rows.filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  if (!rows.length) return [];
  const head = rows[0].map((c) => String(c ?? '').trim().toLowerCase());
  const at = Object.fromEntries(Object.entries(HEADERS).map(([k, re]) => [k, head.findIndex((h) => re.test(h))]));
  if (at.email < 0) throw new Error('The sheet needs an Email column (download the template to see the columns).');
  return rows.slice(1).map((r) => Object.fromEntries(Object.entries(at).map(([k, i]) => [k, i < 0 ? '' : String(r[i] ?? '').trim()])));
}
export function downloadTemplate(d) {
  const top = state.me.scopeTeams.find((t) => !t.parentId)?.name ?? 'Global Sales Engineering';
  const teams = [...d.teams].sort((a, b) => a.path.localeCompare(b.path)).map((t) => [t.path.replace(/ › /g, ' > '), t.leaders.map((l) => l.name).join(', '), t.members]);
  saveBlob(workbook([
    { name: 'People', widths: [32, 24, 22, 18, 52, 12], rows: [['Email', 'Name', 'Title', 'Role', 'Team', 'Leads team'], [`regional.lead@yourcompany.com`, 'Regional Lead', 'SE Director, EMEA', 'Leader', `${top} > EMEA Sales Engineering`, 'yes'], [`first.se@yourcompany.com`, 'First SE', 'Sales Engineer', 'Sales Engineer', `${top} > EMEA Sales Engineering`, ''], [`second.se@yourcompany.com`, 'Second SE', 'Sales Engineer', 'Sales Engineer', `${top} > EMEA Sales Engineering > EMEA North`, '']] },
    { name: 'How to fill it', widths: [22, 90], rows: [['Column', 'What to put'], ['Email', 'Their work email: how they sign in. Required.'], ['Name', 'Their name, as shown everywhere.'], ['Title', 'Optional: Sales Engineer, SE Director…'], ['Role', `One of: ${d.roles.filter((r) => r.grantable).map((r) => r.name).join(', ')}. Blank: Sales Engineer.`], ['Team', 'The path from the top team to theirs, with > between teams, e.g. Global SE > EMEA SE > EMEA North. Teams that do not exist yet are created (Executives and Admins).'], ['Leads team', 'yes if they lead that team: they see it and every team below it (Executives and Admins set this).'], ['', ''], ['Afterwards', 'You get a sheet with each new person\u2019s temporary password. Give each one to its person over a channel only they read; they choose their own password at first sign-in. People who already have access are left as they are.']] },
    { name: 'Teams now', widths: [60, 30, 10], rows: [['Team (path)', 'Leaders', 'People'], ...teams] },
  ]), 'command-center-people-template.xlsx');
}
export function importPeople(d) {
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

/** A person, beside the list: who they are, their name, role and team to change, and everything that can be done for them. */
export function openPerson(d, u) {
  document.getElementById('person-drawer')?.remove();
  const self = u.id === state.me.user.id;
  const roles = d.roles.filter((x) => x.grantable || x.id === u.role);
  const teams = [...d.teams].sort((a, b) => a.path.localeCompare(b.path));
  const [kind, label] = STATUS[u.status] ?? STATUS.active;
  const action = (act, title, what, cls = '') => `<button type="button" class="person-act ${cls}" data-person-act="${act}"><b>${title}</b><span>${what}</span></button>`;
  const wrap = document.createElement('div');
  wrap.id = 'person-drawer';
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = `<div class="drawer-shade" data-close></div><aside class="drawer half" role="dialog" aria-modal="true" aria-label="Manage ${esc(u.name)}">
    <button type="button" class="drawer-close" data-close title="Close (Esc)" aria-label="Close">✕</button>
    <div class="person-head">${avatar(u.name, u.picture)}<div><h1 class="serif">${esc(u.name)}${self ? ' <span class="chip">You</span>' : ''}</h1><p class="muted">${esc(u.email)}${u.title ? ` · ${esc(u.title)}` : ''}</p>
      <p class="person-meta"><span class="chip ${kind}"><i></i>${label}</span><span class="chip role">${esc(u.roleName)}</span><span>${esc(u.teamPath || u.team || 'No team')}</span><span class="muted">Last sign-in ${esc(ago(u.lastSignInAt))} · ${u.signIn === 'sso' ? 'single sign-on' : 'password'}</span></p>
      <p class="person-meta">${u.manager ? `<span>Reports to <b>${esc(u.manager)}</b></span>` : '<span class="muted">Reports to nobody yet</span>'}${u.reports?.length ? `<span class="muted">· ${num(u.reports.length)} ${u.reports.length === 1 ? 'person reports' : 'people report'} to them: ${esc(u.reports.slice(0, 6).map((x) => x.name).join(', '))}${u.reports.length > 6 ? '…' : ''}</span>` : ''}</p></div></div>
    <div class="panel mt"><h2>Name, role, team and manager</h2>
      <form class="form" id="person-form" data-nodraft>
        <div class="row"><label class="f">Name<input name="name" required maxlength="120" value="${esc(u.name)}" /></label><label class="f">Title<input name="title" maxlength="120" value="${esc(u.title ?? '')}" placeholder="Sales Engineer" /></label></div>
        <div class="row"><label class="f">Role<select name="role"${self ? ' disabled title="Your own role is changed by someone else"' : ''}>${roles.map((x) => `<option value="${esc(x.id)}"${x.id === u.role ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="f">Team<select name="team" required>${teams.map((t) => `<option value="${esc(t.id)}"${t.id === u.teamId ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select></label></div>
        <label class="f">Reports to <span class="muted">their manager: sets the hierarchy of sales, SE and CSM leadership</span><select name="manager"><option value="">Nobody</option>${(d.managers ?? []).filter((m) => m.id !== u.id).map((m) => `<option value="${esc(m.id)}"${m.id === u.managerId ? ' selected' : ''}>${esc(m.name)}${m.title ? ` · ${esc(m.title)}` : ''}</option>`).join('')}${u.managerId && !(d.managers ?? []).some((m) => m.id === u.managerId) ? `<option value="${esc(u.managerId)}" selected>${esc(u.manager)}</option>` : ''}</select></label>
        <p class="muted small" id="person-role-says">${esc(roles.find((x) => x.id === u.role)?.description ?? '')}</p>
        <p class="muted small">Their accounts follow them to the new team.</p>
        <div class="flex"><button class="primary" type="submit">Save</button><span class="err" id="person-err"></span></div>
      </form></div>
    <div class="panel mt"><h2>Sign-in and access</h2><div class="person-acts">
      ${can('users.impersonate') && !state.me.impersonating && !self && u.active ? action('impersonate', `Sign in as ${esc(u.name)}`, 'See and work as they do for up to an hour. Everything is recorded as you acting as them.') : ''}
      ${action('reset', 'Reset password', 'A new temporary password, shown once. Their current one stops working and they are signed out everywhere.')}
      ${u.status === 'locked' ? action('unlock', 'Unlock now', 'Locked after too many wrong passwords: let them try again at once.') : ''}
      ${u.sessions ? action('signout', `Sign out everywhere (${num(u.sessions)})`, 'End every session they have open, on every device.') : ''}
      ${self ? '' : action('toggle', u.active ? 'Turn access off' : 'Turn access on', u.active ? 'They are signed out at once and cannot sign in. Their accounts and reports stay with their team.' : 'They can sign in again, with the role and team above.')}
      ${self ? '' : action('remove', 'Remove', 'Delete this person. Their accounts and reports stay with their team. This cannot be undone.', 'danger')}
    </div></div></aside>`;
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => e.target.matches('[data-close]') && close());
  wrap.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  $('#app').append(wrap);
  wrap.querySelector('.drawer-close').focus();
  const form = wrap.querySelector('#person-form');
  form.elements.role.onchange = () => (wrap.querySelector('#person-role-says').textContent = roles.find((x) => x.id === form.elements.role.value)?.description ?? '');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      const res = await api(`/api/people/${encodeURIComponent(u.id)}`, { method: 'PUT', body: { name: f.get('name'), title: f.get('title'), role: self ? u.role : f.get('role'), teamId: f.get('team'), ...((f.get('manager') || null) !== (u.managerId ?? null) ? { managerId: f.get('manager') || null } : {}) } });
      close();
      toast(res.accountsMoved ? `Saved. Their ${num(res.accountsMoved)} account${res.accountsMoved === 1 ? '' : 's'} moved with them to the new team.` : 'Saved.', 'ok');
      viewPeople('people');
    } catch (error) {
      wrap.querySelector('#person-err').textContent = error.message;
    }
  };
  for (const b of wrap.querySelectorAll('[data-person-act]')) b.onclick = () => personAction(d, u, b.dataset.personAct);
}

export async function personAction(d, u, act) {
  const path = `/api/people/${encodeURIComponent(u.id)}`;
  try {
    if (act === 'impersonate') {
      if (!await sure(`Sign in as ${u.name}? You see and work as they do for up to an hour; everything you do is recorded as you acting as them. Their password, profile and sessions stay theirs.`)) return;
      const r = await api(`${path}/impersonate`, { method: 'POST', body: {} });
      location.href = r.home === 'calculator' ? '/calculator' : `/#/${r.home || 'overview'}`;
      if (r.home !== 'calculator') location.reload();
      return;
    }
    if (act === 'reset') {
      if (!await sure(`Give ${u.name} a new temporary password? Their current one stops working and they are signed out everywhere.`)) return;
      const r = await api(`${path}/reset`, { method: 'POST', body: {} });
      return showTemporary(u.email, r.temporary);
    }
    if (act === 'unlock') await api(`${path}/unlock`, { method: 'POST', body: {} });
    if (act === 'signout') {
      if (!await sure(`Sign ${u.name} out on every device?`)) return;
      await api(`${path}/signout`, { method: 'POST', body: {} });
    }
    if (act === 'toggle') {
      if (u.active && !await sure(`Turn off ${u.name}'s access? They are signed out at once; their accounts and reports stay with their team.`)) return;
      await api(path, { method: 'PUT', body: { active: !u.active } });
    }
    if (act === 'remove') {
      if (!await sure(`Remove ${u.name}? Their accounts and reports stay with their team.`)) return;
      await api(path, { method: 'DELETE' });
    }
    toast('Done.', 'ok');
    viewPeople('people');
  } catch (error) {
    toast(error.message, 'bad');
  }
}
export function showTemporary(email, temporary) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog"><div class="dh"><h2>New temporary password</h2></div><div class="db"><p class="small muted">For ${esc(email)}. Give it to them over a channel only they read: it is shown once, and they choose their own at sign-in.</p><div class="secret">${esc(temporary)}</div></div><div class="df"><button value="ok" class="primary">Done</button></div></form>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => (dlg.remove(), viewPeople('people')));
  dlg.showModal();
}

/** Roles as columns, permissions as rows: tick, compare, save; never a permission you do not hold. */
export function rolesMatrix(d) {
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

export async function signInTab() {
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

