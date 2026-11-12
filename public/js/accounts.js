import { $, $$, ago, api, can, date, dateTime, esc, go, icon, initials, num, state, toast } from './core.js';
import { paint, teamSelect } from './overview.js';
import { peopleList } from './people.js';
import { loading, shell } from './shell.js';
// ---- Accounts --------------------------------------------------------------------------------------------
/** Email addresses typed for "shared with": one or more, comma or space between; null when one is not an address. */
export function emailList(value) {
  const list = String(value ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  return list.length && list.every((e) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(e)) ? list : null;
}
/** Who it went to, for a table cell. */
export const sharedTo = (r) => (r?.sharedWith?.length ? r.sharedWith.join(', ') : r?.sharedNote || '');
/**
 * Shared with the customer, typed where the click was: the email address(es) of whom it was shared with, then ✓.
 * Enter saves, Esc puts the place back. `onDone` runs once it is saved.
 */
export function shareInline(host, reportId, { onDone, onCancel, suggest = [] } = {}) {
  const before = host.innerHTML;
  host.innerHTML = `<span class="cell-edit share-inline"><input type="text" inputmode="email" autocomplete="off" spellcheck="false" placeholder="Shared with: name@customer.com" aria-label="Email address of whom it was shared with"${suggest.length ? ' list="share-suggest"' : ''} />${suggest.length ? `<datalist id="share-suggest">${suggest.map((e) => `<option value="${esc(e)}"></option>`).join('')}</datalist>` : ''}<button type="button" class="sm primary" data-ok>✓ Shared</button><button type="button" class="sm ghost" data-x title="Cancel">✕</button></span>`;
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

// The list as it stands (its team and how to read it again): an account opens beside it, and closes back onto it.
let listState = null;
let focusNext = '';
const listUp = () => Boolean(listState && $('#main')?.dataset.page === 'accounts' && $('#rows') && $('#count'));
/** Close the account's side panel: back on the list, read again as the account may have changed. */
function closeAccount({ quiet = false } = {}) {
  const wrap = $('#acct-drawer');
  if (!wrap) return;
  wrap.remove();
  if (quiet || !listUp()) return;
  history.replaceState(null, '', `#/accounts${listState.focus ? `?team=${encodeURIComponent(listState.focus)}` : ''}`);
  listState.reload().catch(() => {});
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !$('#acct-drawer') || e.target.closest?.('.cell-edit, .share-inline')) return;
  if (document.querySelector('.reader, dialog[open]')) return;
  closeAccount();
});

export async function viewAccounts(params) {
  const focus = params.get('team') ?? '';
  // Back from an account's side panel (the browser's Back): the list is still there, with its filters.
  if ($('#acct-drawer') && listUp() && listState.focus === focus) {
    closeAccount({ quiet: true });
    return listState.reload();
  }
  closeAccount({ quiet: true });
  shell('accounts', loading());
  const listUrl = `/api/accounts${focus ? `?team=${encodeURIComponent(focus)}` : ''}`;
  let [{ accounts }, people] = await Promise.all([api(listUrl), peopleList()]);
  const owners = [...new Map(accounts.map((a) => [a.ownerId, a.owner])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  void people;
  let sort = { key: 'credits', dir: -1 };
  $('#main').innerHTML = `
    <div class="head"><div><h1 class="serif">Accounts</h1><p>Every account in your teams with its primary report. Click an account to open it; the pencil in a cell, or the row’s menu, changes it right here.</p></div>
      <div class="tools">${can('calculator.use') ? `<a class="btn primary" href="/calculator">${icon('plus')}New in calculator</a>` : ''}</div></div>
    <div id="out-of-step"></div>
    <div class="panel">
      <div class="flex">
        <div class="search">${icon('search')}<input id="q" placeholder="Search accounts, SEs, Salesforce ids" /></div>
        <div>${teamSelect('team', focus)}</div>
        <div><select id="owner"><option value="">Every SE</option>${owners.map(([id, name]) => `<option value="${esc(id)}"${id === params.get('owner') ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
        <div><select id="status"><option value="">Any status</option><option value="muted">Muted from the forecast</option><option value="nosf">Missing Salesforce link</option><option value="noreport">No report yet</option><option value="notshared">Report not shared</option><option value="shared">Shared with customer</option><option value="unsold">Projected, nothing sold yet</option><option value="partly">Partly sold</option><option value="sold">Fully sold</option><option value="noprimary">No primary marked</option></select></div>
        <span class="spacer"></span><span class="muted small" id="count"></span>
      </div>
      <div class="tw mt"><table><thead><tr>
        <th class="sort" data-k="name">Account</th><th class="sort" data-k="owner">Accountable SE</th><th class="sort num" data-k="credits">Credits</th><th class="sort num" data-k="sold">Sold</th><th class="sort num" data-k="remaining">Still needed</th><th>Customer</th><th class="sort" data-k="last">Last</th><th></th>
      </tr></thead><tbody id="rows"></tbody></table></div>
    </div>`;
  const val = (a, k) => ({ team: String(a.team ?? '').toLowerCase(), name: a.name.toLowerCase(), owner: String(a.owner).toLowerCase(), tr: a.primary?.trCredits ?? -1, fusion: a.primary?.fusionCredits ?? -1, credits: a.primary?.totalCredits ?? -1, reports: a.reportCount, sold: a.sold ?? 0, remaining: a.remaining ?? -1, last: a.lastReportAt ?? '' })[k];
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
      ? list.map((a) => {
        const pen = (kind, label) => `<button type="button" class="cell-pen" data-pen="${kind}" title="${label}" aria-label="${label}">${icon('edit')}</button>`;
        // 515,661 as 516K, 1,411,873 as 1.41M: the exact figures are in the cell's tip and in the account.
        const short = (n) => new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(Math.round(Number(n) || 0));
        const split = a.primary ? `T&R ${num(Math.round(a.primary.trCredits ?? 0))} · Fusion ${num(Math.round(a.primary.fusionCredits ?? 0))}${a.primary.how === 'latest' ? ' · the latest report (none marked primary)' : ''}` : '';
        const total = Number(a.primary?.totalCredits) || 0;
        const soldNote = a.sold ? `${total ? `${Math.min(100, Math.round((a.sold / total) * 100))}% of the projection` : ''}${a.salesCount > 1 ? ` · ${num(a.salesCount)} sales` : ''}` : 'Nothing sold yet';
        const shared = a.sharedCount ? `<span class="chip ok" title="${esc(a.primary?.sharedWith?.length ? `Shared with ${a.primary.sharedWith.join(', ')}` : 'Shared with the customer')}"><i></i>${num(a.sharedCount)} shared</span>` : a.reportCount ? '<span class="chip warn"><i></i>Not shared</span>' : '<span class="muted">—</span>';
        const menu = [
          ['open', 'Open the account', true],
          ['calc', 'Open in the calculator', can('calculator.use')],
          ['name', 'Rename', can('calculator.use')],
          ['owner', 'Change the accountable SE', can('calculator.use') || can('users.manage')],
          ['contacts', 'Account team & emails…', true],
          ['sold', 'Record a sale', can('sales.record') && Boolean(a.primary)],
          ['shared', a.primary?.sharedAt ? 'No longer shared with the customer' : 'Shared with the customer…', can('reports.share') && Boolean(a.primary)],
          ['mute', a.muted ? 'Bring back into the forecast' : 'Mute from the forecast', can('forecast.mute')],
          // Deleting an account from the list is the Admin's: it takes every report and sale of the account with it.
          ['reset', 'Remove all calculations…', state.me?.role?.id === 'admin'],
          ['delete', 'Delete the account…', state.me?.role?.id === 'admin' && can('accounts.delete')],
        ].filter((x) => x[2]);
        return `<tr class="click${a.muted ? ' muted-row' : ''}" data-account="${esc(a.id)}">
        <td data-edit="name" class="acc-name" data-v="${esc(a.name)}"><span class="cell-line"><b title="${esc(a.name)}">${esc(a.name)}</b>${a.draft ? '<span class="chip draft" title="A draft: only its SE and the Admins see it until a report is generated for it">Draft</span>' : ''}${a.salesforceUrl ? `<a class="sf-link" href="${esc(a.salesforceUrl)}" target="_blank" rel="noopener noreferrer" title="Open the ${a.salesforceKind === 'opportunity' ? 'opportunity' : 'account'} in Salesforce (new tab)" aria-label="Open in Salesforce">${icon('ext')}</a>` : '<span class="chip bad" title="No Salesforce link yet: nothing is generated until one is saved">No link</span>'}${a.muted ? `<span class="chip muted-chip" title="Muted from the forecast by ${esc(a.mutedBy)}${a.mutedAt ? `, ${esc(date(a.mutedAt))}` : ''}: left out of the dashboards">Muted</span>` : ''}${pen('name', 'Rename')}</span></td>
        <td data-edit="owner" class="acc-owner"><span class="cell-line"><span class="avatar sm">${esc(initials(a.owner))}</span><span class="clip" title="${esc(`${a.owner} · ${a.teamPath}`)}">${esc(a.owner)}</span>${pen('owner', 'Change the accountable SE')}</span></td>
        <td class="num" data-sort="${a.primary ? Math.round(a.primary.totalCredits) : -1}" data-v="${a.primary ? num(Math.round(a.primary.totalCredits)) : 'No report'}" title="${esc(`${split}${a.reportCount ? ` · ${a.reportCount} report${a.reportCount === 1 ? '' : 's'}` : ''}`)}">${a.primary ? `<span class="credits">${num(Math.round(a.primary.totalCredits))}</span><span class="acc-split">T&amp;R ${short(a.primary.trCredits)} · Fusion ${short(a.primary.fusionCredits)}</span>` : '<span class="muted">No report</span>'}</td>
        <td class="num" data-edit="sold" title="${esc(soldNote)}"><span class="cell-line end">${a.sold ? num(Math.round(a.sold)) : '<span class="muted">—</span>'}${can('sales.record') && a.primary ? pen('sold', 'Record a sale') : ''}</span></td>
        <td class="num">${a.remaining === null ? '—' : a.remaining === 0 && a.sold ? '<span class="chip ok"><i></i>Done</span>' : num(a.remaining)}</td>
        <td data-edit="shared"><span class="cell-line">${shared}${can('reports.share') && a.primary ? pen('shared', 'Shared with the customer, or not') : ''}</span></td>
        <td class="acc-last" data-sort="${esc(a.lastReportAt ?? '')}">${esc(ago(a.lastReportAt))}</td>
        <td class="actions">${can('calculator.use') ? `<a class="btn sm icon-btn calc-open" href="/calculator?team=${encodeURIComponent(a.teamId ?? '')}&amp;account=${encodeURIComponent(a.id)}" title="Open ${esc(a.name)} in the calculator" aria-label="Open in the calculator">${icon('calc')}</a>` : ''}<details class="menu row-menu"><summary class="btn sm icon-btn" aria-label="More for ${esc(a.name)}">⋯</summary><div class="menu-list">${menu.map(([id, label]) => `<button type="button" data-row="${id}"${id === 'delete' || id === 'reset' ? ' class="danger"' : ''}>${label}</button>`).join('')}</div></details></td></tr>`;
      }).join('')
      : `<tr><td colspan="8"><div class="empty"><b>No accounts match</b>Change the filters, or add one in the calculator.</div></td></tr>`;
    const mute = async (a) => {
      const on = !a.muted;
      try {
        await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/mute`, { method: 'POST', body: { muted: on } });
        toast(on ? `${a.name} is muted from the forecast: the dashboards leave it out.` : `${a.name} is back in the forecast.`, 'ok');
        await reload();
      } catch (error) {
        toast(error.message, 'bad');
      }
    };
    const removeAccount = async (a) => {
      const reports = a.reportCount ? `its ${num(a.reportCount)} report${a.reportCount === 1 ? '' : 's'}` : 'no reports';
      const sales = a.sold ? ` and ${num(Math.round(a.sold))} credits of recorded sales` : '';
      if (!confirm(`Delete ${a.name}, with ${reports}${sales}? This cannot be undone.`)) return;
      try {
        await api(`/api/cc/accounts/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
        toast(`${a.name} is deleted.`, 'ok');
        await reload();
      } catch (error) {
        toast(error.message, 'bad');
      }
    };
    // A click on the row opens the account; the pencil in a cell, or the row's menu, changes it.
    for (const el of $$('[data-account]')) {
      const a = accounts.find((x) => x.id === el.dataset.account);
      el.onclick = (e) => {
        const penBtn = e.target.closest('[data-pen]');
        const rowBtn = e.target.closest('[data-row]');
        if (penBtn) {
          const cell = penBtn.closest('[data-edit]');
          if (!cell.querySelector('.cell-edit')) editCell(a, cell);
          return;
        }
        if (rowBtn) {
          rowBtn.closest('details').open = false;
          const act = rowBtn.dataset.row;
          if (act === 'open') return go(`/accounts/${encodeURIComponent(a.id)}`);
          if (act === 'calc') return void (location.href = `/calculator?team=${encodeURIComponent(a.teamId ?? '')}&account=${encodeURIComponent(a.id)}`);
          if (act === 'mute') return mute(a);
          if (act === 'delete') return removeAccount(a);
          if (act === 'reset') return resetAccount(a, reload);
          if (act === 'contacts') {
            focusNext = 'contacts';
            return go(`/accounts/${encodeURIComponent(a.id)}`);
          }
          const cell = el.querySelector(`[data-edit="${act}"]`);
          if (cell && !cell.querySelector('.cell-edit')) editCell(a, cell);
          return;
        }
        if (e.target.closest('a, input, select, button, summary, .cell-edit, .menu-list')) return;
        go(`/accounts/${encodeURIComponent(a.id)}`);
      };
    }
  };
  const reload = async () => {
    ({ accounts } = await api(listUrl));
    render();
  };
  // Accounts follow their accountable SE. Any that are still in another team than their SE (from before that was the
  // rule) are listed here, to move in one click.
  const outOfStep = async () => {
    const box = $('#out-of-step');
    if (!box || !can('users.manage')) return;
    let list = [];
    try {
      ({ accounts: list } = await api('/api/cc/accounts-out-of-step'));
    } catch {}
    if (!list.length) return void (box.innerHTML = '');
    const one = list.length === 1;
    box.innerHTML = `<div class="panel follow-panel"><div class="flex"><div><b>${num(list.length)} account${one ? ' is' : 's are'} in another team than ${one ? 'its' : 'their'} accountable SE.</b>
      <span class="muted small">Accounts follow their SE; ${one ? 'this one was' : 'these were'} left behind when the SE changed team.</span></div><span class="spacer"></span>
      <button type="button" class="ghost sm" id="follow-show">Show ${one ? 'it' : 'them'}</button><button type="button" class="primary sm" id="follow-all">Move ${one ? 'it' : `all ${num(list.length)}`} to the SE’s team</button></div>
      <div class="tw mt" id="follow-list" hidden><table><thead><tr><th>Account</th><th>Accountable SE</th><th>Now in</th><th>Goes to</th><th></th></tr></thead><tbody>${list.map((x) => `<tr data-id="${esc(x.id)}"><td><b>${esc(x.name)}</b></td><td>${esc(x.owner)}</td><td>${esc(x.from)}</td><td>${esc(x.to)}</td><td class="actions"><button type="button" class="sm" data-follow="${esc(x.id)}">Move</button></td></tr>`).join('')}</tbody></table></div></div>`;
    const move = async (ids) => {
      try {
        const r = await api('/api/cc/accounts-follow', { method: 'POST', body: ids ? { ids } : {} });
        toast(`${num(r.moved.length)} account${r.moved.length === 1 ? '' : 's'} moved to ${r.moved.length === 1 ? 'its' : 'their'} SE’s team.`, 'ok');
        await reload();
        await outOfStep();
      } catch (error) {
        toast(error.message, 'bad');
      }
    };
    $('#follow-show').onclick = () => ($('#follow-list').hidden = !$('#follow-list').hidden);
    $('#follow-all').onclick = () => move(null);
    for (const b of $$('#follow-list [data-follow]')) b.onclick = () => move([b.dataset.follow]);
  };
  outOfStep();
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
  listState = { focus, reload: async () => { await reload(); outOfStep(); } };
}

export async function viewAccount(id) {
  // Beside the list, not instead of it: the list is drawn first when the account is opened from a link.
  if (!listUp()) await viewAccounts(new URLSearchParams());
  let wrap = $('#acct-drawer');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'acct-drawer';
    wrap.className = 'drawer-wrap';
    wrap.innerHTML = `<div class="drawer-shade" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Account"><button type="button" class="drawer-close" data-close title="Close (Esc)" aria-label="Close the account">✕</button><div id="acct-body">${loading()}</div></aside>`;
    wrap.addEventListener('click', (e) => e.target.matches('[data-close]') && closeAccount());
    $('#app').append(wrap);
  }
  const drawer = wrap.querySelector('.drawer');
  const at = wrap.dataset.account === id ? drawer.scrollTop : 0;
  wrap.dataset.account = id;
  let d;
  try {
    d = await api(`/api/cc/accounts/${encodeURIComponent(id)}`);
  } catch (error) {
    if ($('#acct-body')) $('#acct-body').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
    return;
  }
  if (!$('#acct-body') || wrap.dataset.account !== id) return;
  const a = d.account;
  const p = a.primary;
  const calcHref = `/calculator?team=${encodeURIComponent(a.teamId)}&account=${encodeURIComponent(a.id)}`;
  $('#acct-body').innerHTML = `
    <div class="crumbs">${esc(a.teamPath)}</div>
    <div class="head compact"><div><h1 class="serif">${esc(a.name)}</h1><p class="acct-meta">${a.salesforceUrl ? `<a class="chip sf" href="${esc(a.salesforceUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.salesforceKind === 'opportunity' ? 'Opportunity' : 'Account')} <span class="mono">${esc(a.salesforceId)}</span> ↗</a>` : '<span class="chip warn"><i></i>No Salesforce link</span>'}<span>SE <b>${esc(a.owner)}</b></span>${a.cxone ? `<span class="chip ok" title="Last read ${esc(a.cxone.lastReadAt ? ago(a.cxone.lastReadAt) : 'never')}"><i></i>Checkmarx One key kept · ${esc(a.cxone.tenant)}</span>` : ''}${a.impactEnabled ? `<span class="chip">Impact ${esc(a.impactCurrency)}</span>` : ''}</p></div>
      <div class="tools">${d.can.edit ? `<a class="btn primary" href="${esc(calcHref)}">${icon('calc')}Open in calculator</a>` : ''}</div></div>
    ${d.draft ? '<div class="callout draft-note"><b>Draft.</b> Only its Sales Engineer and the Admins see this account until a report is generated for it; then its team does.</div>' : ''}
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
        ${d.can.deleteAccount || state.me?.role?.id === 'admin' ? `<div class="mt flex">${state.me?.role?.id === 'admin' ? '<button class="danger sm" id="reset-acct">Remove all calculations…</button>' : ''}${d.can.deleteAccount ? '<button class="danger sm" id="del-acct">Delete account and its reports</button>' : ''}</div>` : ''}
    </details>
    ${contactsPanel(d)}
    ${salesPanel(a, d)}
    <div class="panel mt"><h2>Reports${d.can.edit ? `<label class="btn sm file-btn">⇪ Upload the customer's version<input type="file" id="cv-file" accept=".html,.htm,text/html" hidden /></label>` : ''}</h2>
      ${d.reports.length ? `<div class="tw"><table class="rep-table"><thead><tr><th></th><th>Made</th><th>By</th><th class="num">T&amp;R</th><th class="num">Fusion</th><th class="num">Total</th><th>Shared with customer</th><th></th></tr></thead><tbody>${d.reports.map((r) => {
        const primary = a.primary?.id === r.id;
        return `<tr data-id="${esc(r.id)}"><td>${primary ? `<span class="chip star">${icon('star')}${a.primary.how === 'marked' ? 'Primary' : 'Latest'}</span>` : ''}${r.source === 'previous' ? `<span class="chip" title="A report made before, brought in${r.importedAt ? ` ${esc(date(r.importedAt))}` : ''}">Previous quote</span>` : ''}${r.source === 'customer' ? `<span class="chip sf" title="${esc(r.changes.join('\n') || 'No changes')}">Customer's version</span><span class="sub">${r.sentTotal ? `${r.totalCredits - r.sentTotal > 0 ? '+' : ''}${num(Math.round(r.totalCredits - r.sentTotal))} vs sent` : ''}${r.changes.length ? ` · ${num(r.changes.length)} change${r.changes.length === 1 ? '' : 's'}` : ''}</span>` : ''}</td><td>${esc(dateTime(r.createdAt))}</td><td>${esc(r.createdBy)}</td><td class="num">${num(Math.round(r.trCredits ?? 0))}</td><td class="num">${num(Math.round(r.fusionCredits ?? 0))}</td><td class="num credits">${num(Math.round(r.totalCredits))}</td><td class="shared-cell">${r.sharedAt ? `<span class="chip ok"><i></i>${esc(date(r.sharedAt))}</span><span class="sub">${sharedTo(r) ? `with ${esc(sharedTo(r))} · ` : ''}by ${esc(r.sharedByName)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="actions">${d.can.share ? `${a.primaryReportId === r.id ? '<button class="sm ghost" data-act="unprimary">Unmark primary</button>' : `<button class="sm" data-act="primary">${icon('star')}Make primary</button>`}${r.sharedAt ? '<button class="sm ghost" data-act="unshare">Unmark shared</button>' : `<button class="sm" data-act="share">${icon('send')}Mark shared</button>`}` : ''}<button class="sm ghost icon" data-act="download" title="Download this report (the file the customer gets)" aria-label="Download this report">${icon('download')}</button>${d.can.sell ? `<button class="sm ghost" data-sell="${esc(r.id)}" title="Record credits sold against this report">Sold…</button>` : ''}<button class="sm ghost icon" data-act="delete" title="Delete report">${icon('trash')}</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty"><b>No reports yet</b></div>'}
    </div>`;
  drawer.scrollTop = at;
  wireContacts(a, d);
  if (focusNext === 'contacts') {
    focusNext = '';
    $('#contacts')?.scrollIntoView({ block: 'start' });
    $('#contact-add input[name=email]')?.focus();
  }
  if (p) countUp($('#bigc'), Math.round(p.totalCredits), ' credits');
  if ($('#share-primary')) $('#share-primary').onclick = () => shareInline($('#share-primary').parentElement, p.id, { onDone: () => viewAccount(a.id), suggest: customerEmails(d) });
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
  if ($('#reset-acct')) $('#reset-acct').onclick = () => resetAccount({ id: a.id, name: a.name, reportCount: d.reports.length }, () => viewAccount(a.id));
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
      if (act === 'download') {
        const ds = document.documentElement.dataset;
        const file = await api(`/api/cc/reports/${encodeURIComponent(rid)}/file?accent=${encodeURIComponent(ds.accent ?? '')}&theme=${encodeURIComponent(ds.theme ?? '')}&ops=${encodeURIComponent(ds.ops ?? '')}`);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([file.html], { type: 'text/html' }));
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        return toast(`Downloaded ${file.name}.`, 'ok');
      }
      if (act === 'primary' || act === 'unprimary') await api(`/api/cc/reports/${encodeURIComponent(rid)}/primary`, { method: 'POST', body: { primary: act === 'primary' } });
      if (act === 'share') return shareInline(b.closest('tr').querySelector('.shared-cell'), rid, { onDone: () => viewAccount(a.id), suggest: customerEmails(d) });
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

// ---- The Admin cleanses an account: every calculation, and its reports when asked -----------------------------------
export function resetAccount(a, done) {
  document.getElementById('reset-dlg')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'reset-dlg';
  const n = a.reportCount ?? 0;
  dlg.innerHTML = `<form method="dialog" class="form"><div class="dh"><h2>Remove all calculations from ${esc(a.name)}</h2></div><div class="db">
    <p>The backlog read or uploaded, its trend, Fusion's projects, the code counted from git or cloc-fusion, the scope and the totals go. The account, its Salesforce link, its SE, team, contacts and sales stay.</p>
    <label class="check"><input type="checkbox" name="reports" ${n ? 'checked' : 'disabled'} /><span>Also delete its ${n ? `${num(n)} report${n === 1 ? '' : 's'}` : 'reports (it has none)'}<small>Then it is a draft again: only its SE and the Admins see it until a new report is generated.</small></span></label>
    <p class="muted small">This cannot be undone. It is recorded in the audit log.</p><div class="err" id="reset-err"></div></div>
    <div class="df"><button type="button" class="ghost" value="cancel" id="reset-cancel">Cancel</button><button type="button" class="danger" id="reset-go">Remove all calculations</button></div></form>`;
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('#reset-cancel').onclick = () => (dlg.close(), dlg.remove());
  dlg.querySelector('#reset-go').onclick = async () => {
    const reports = dlg.querySelector('[name=reports]').checked;
    try {
      const r = await api(`/api/cc/accounts/${encodeURIComponent(a.id)}/reset`, { method: 'POST', body: { reports } });
      dlg.close();
      dlg.remove();
      toast(`Every calculation is out of ${a.name}${r.reportsRemoved ? `, with its ${num(r.reportsRemoved)} report${r.reportsRemoved === 1 ? '' : 's'}` : ''}.`, 'ok');
      done?.();
    } catch (error) {
      dlg.querySelector('#reset-err').textContent = error.message;
    }
  };
}

// ---- The account's team and contacts: our people on it, the customer's, and the addresses reports were shared with -----
const customerEmails = (d) => [...new Set([...(d.contacts ?? []).filter((c) => c.side !== 'us').map((c) => c.email), ...(d.usedEmails ?? []).map((u) => u.email)])];
function contactsPanel(d) {
  const list = [...(d.contacts ?? [])].sort((x, y) => (x.side === y.side ? 0 : x.side === 'us' ? -1 : 1));
  const usedAt = new Map((d.usedEmails ?? []).map((u) => [u.email, u.at]));
  const known = new Set(list.map((c) => c.email));
  const loose = (d.usedEmails ?? []).filter((u) => !known.has(u.email));
  const may = d.can.contacts;
  return `<div class="panel mt" id="contacts"><h2>Account team &amp; emails <small>our people, the customer’s contacts, and whom reports were shared with</small></h2>
    ${list.length ? `<div class="tw"><table class="contacts-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Side</th><th>Report shared</th><th></th></tr></thead><tbody>${list.map((c) => `<tr data-email="${esc(c.email)}"><td>${c.name ? `<b>${esc(c.name)}</b>` : '<span class="muted">—</span>'}</td><td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td><td>${c.role ? esc(c.role) : '<span class="muted">—</span>'}</td><td>${c.side === 'us' ? '<span class="chip">Our team</span>' : '<span class="chip sf">Customer</span>'}</td><td data-sort="${esc(usedAt.get(c.email) ?? '')}">${usedAt.get(c.email) ? esc(date(usedAt.get(c.email))) : '<span class="muted">—</span>'}</td><td class="actions">${may ? `<button type="button" class="sm ghost icon" data-contact-remove title="Take ${esc(c.email)} off the list" aria-label="Remove ${esc(c.email)}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted small">Nobody is listed yet.${may ? ' Add the account team and the customer’s contacts below.' : ''}</p>`}
    ${loose.length ? `<div class="contact-used"><span class="muted small">Used when a report was shared, not on the list yet:</span>${loose.map((u) => `<span class="chip" title="Shared ${esc(date(u.at))}">${esc(u.email)}${may ? `<button type="button" class="chip-add" data-contact-use="${esc(u.email)}" title="Add ${esc(u.email)} to the list" aria-label="Add ${esc(u.email)}">+</button>` : ''}</span>`).join('')}${may && loose.length > 1 ? '<button type="button" class="sm ghost" data-contact-use-all>Add all</button>' : ''}</div>` : ''}
    ${may ? `<form class="contact-add" id="contact-add" data-nodraft><input name="email" type="text" inputmode="email" autocomplete="off" spellcheck="false" placeholder="Email (several: comma between)" aria-label="Email address, or several with a comma between" required /><input name="name" type="text" placeholder="Name" aria-label="Name" maxlength="80" /><input name="role" type="text" placeholder="Role (AE, CSM, AppSec lead…)" aria-label="Role" maxlength="60" /><select name="side" aria-label="Our team or the customer"><option value="customer">Customer</option><option value="us">Our team</option></select><button type="submit" class="sm primary">${icon('plus')}Add</button><span class="err" id="contact-err"></span></form>` : ''}
  </div>`;
}
function wireContacts(a, d) {
  const box = $('#contacts');
  if (!box || !d.can.contacts) return;
  const save = async (contacts, said) => {
    try {
      await api(`/api/cc/accounts/${encodeURIComponent(a.id)}`, { method: 'PUT', body: { contacts } });
      toast(said, 'ok');
      focusNext = 'contacts';
      viewAccount(a.id);
    } catch (error) {
      if ($('#contact-err')) $('#contact-err').textContent = error.message;
      else toast(error.message, 'bad');
    }
  };
  const now = d.contacts ?? [];
  for (const b of box.querySelectorAll('[data-contact-remove]')) b.onclick = () => {
    const email = b.closest('tr').dataset.email;
    save(now.filter((c) => c.email !== email), `${email} is off the list.`);
  };
  for (const b of box.querySelectorAll('[data-contact-use]')) b.onclick = () => save([...now, { email: b.dataset.contactUse, side: 'customer' }], `${b.dataset.contactUse} added.`);
  const all = box.querySelector('[data-contact-use-all]');
  if (all) all.onclick = () => {
    const have = new Set(now.map((c) => c.email));
    const add = (d.usedEmails ?? []).filter((u) => !have.has(u.email)).map((u) => ({ email: u.email, side: 'customer' }));
    save([...now, ...add], `${num(add.length)} addresses added.`);
  };
  const form = $('#contact-add');
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const emails = emailList(String(f.get('email') ?? ''));
    if (!emails) return void ($('#contact-err').textContent = 'Type an email address (several: a comma between).');
    const have = new Set(now.map((c) => c.email));
    const add = emails.filter((x) => !have.has(x.toLowerCase())).map((email) => ({ email, name: emails.length === 1 ? f.get('name') : '', role: f.get('role'), side: f.get('side') }));
    if (!add.length) return void ($('#contact-err').textContent = 'Already on the list.');
    save([...now, ...add], add.length === 1 ? `${add[0].email} added.` : `${num(add.length)} contacts added.`);
  };
}

// ---- Credits sold: one or many sales per account, against the projection of its primary report --------------------
export function salesPanel(a, d) {
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
export function wireSales(a, d) {
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
export async function customerVersion(a, file) {
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

export function countUp(el, to, suffix = '') {
  if (!el) return;
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / 700);
    el.textContent = `${num(Math.round(to * (1 - (1 - k) ** 3)))}${suffix}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function ask(title, hint, value = '') {
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
