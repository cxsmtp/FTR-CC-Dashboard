import { $, $$, api, can, esc, icon, num, state } from './core.js';
import { paint } from './overview.js';
import { peopleList } from './people.js';
import { loading, shell } from './shell.js';
// ---- Teams -----------------------------------------------------------------------------------------------
export async function viewTeams() {
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
