import { $, $$, ago, api, dateTime, esc, icon, num, toast } from './core.js';
import { autosave } from './settings.js';
import { loading, shell } from './shell.js';
// ---- Fusion engines & rates: the Admin's list and default engine; each team's own (leaders and above) -------------
export const rateText = (n) => (n === null || n === undefined || n === '' ? '' : String(n));
export async function viewRates(params) {
  shell('rates', loading());
  let d;
  try {
    d = await api('/api/fusion-rates');
  } catch (error) {
    $('#main').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
    return;
  }
  const teamId = d.teams.some((t) => t.id === params?.get?.('team')) ? params.get('team') : d.teams.some((t) => t.id === d.myTeamId) ? d.myTeamId : d.teams[0]?.id;
  const team = d.teams.find((t) => t.id === teamId);
  const adminRows = d.admin.models.map((m, i) => `<tr data-i="${i}"><td><input name="name" maxlength="80" value="${esc(m.name)}" placeholder="Engine, as Checkmarx One names it" /></td>
      <td class="num"><input name="rate" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(rateText(m.creditsPer10k))}" placeholder="needs a rate" class="${m.creditsPer10k ? '' : 'need'}" /></td>
      <td class="c"><input type="radio" name="default" value="${i}" ${m.name === d.admin.defaultModel ? 'checked' : ''} aria-label="Default engine" /></td>
      <td class="actions"><button type="button" class="sm ghost icon" data-del title="Remove this engine">${icon('trash')}</button></td></tr>`).join('');
  const detected = d.detected.length
    ? `<div class="panel mt"><h2>Seen without a rate <small>engines a customer’s Checkmarx One offers that have no rate yet: until one is set, Fusion counts them at 0</small></h2>
      <div class="tw"><table><thead><tr><th>Engine</th><th>First seen</th><th>Last seen</th><th>Tenant</th><th>By</th>${d.canAdmin ? '<th class="num">Rate for everyone</th>' : ''}${d.canTeams && team ? `<th class="num">Rate for ${esc(team.name)}</th>` : ''}</tr></thead><tbody>${d.detected.map((x) => `<tr data-name="${esc(x.name)}"><td><b>${esc(x.name)}</b><span class="chip warn"><i></i>needs a rate</span></td><td data-sort="${esc(x.firstSeen)}">${esc(dateTime(x.firstSeen))}</td><td data-sort="${esc(x.lastSeen)}">${esc(ago(x.lastSeen))}</td><td class="mono small">${esc(x.tenant || '—')}</td><td>${esc(x.by || '—')}</td>${d.canAdmin ? '<td class="num"><input type="number" min="0" step="0.1" class="det-admin" placeholder="credits / 10K LOC" /></td>' : ''}${d.canTeams && team ? '<td class="num"><input type="number" min="0" step="0.1" class="det-team" placeholder="credits / 10K LOC" /></td>' : ''}</tr>`).join('')}</tbody></table></div></div>`
    : '';
  const eff = team?.effective;
  const own = team?.own?.rates ?? {};
  const keyOf = (n) => String(n ?? '').toLowerCase().replace(/\b(claude|anthropic)\b/g, '').replace(/[^a-z0-9]+/g, '');
  const teamRows = eff ? eff.models.map((m) => {
    const mine = own[keyOf(m.name)];
    const from = m.from === 'team' ? (m.fromTeam?.id === team.id ? `<span class="chip ok"><i></i>${esc(team.name)}’s own</span>` : `<span class="chip"><i></i>from ${esc(m.fromTeam?.name ?? 'a team above')}</span>`) : m.creditsPer10k ? '<span class="chip"><i></i>the Admin’s</span>' : '<span class="chip warn"><i></i>no rate</span>';
    return `<tr data-name="${esc(m.name)}"><td><b>${esc(m.name)}</b>${m.name === eff.defaultModel ? ' <span class="chip star">Default</span>' : ''}</td><td class="num">${m.admin ? num(m.admin, 3) : '—'}</td>
      <td class="num"><input type="number" min="0" step="0.1" class="team-rate" value="${esc(rateText(mine?.creditsPer10k))}" placeholder="${esc(m.creditsPer10k && !mine ? `${num(m.creditsPer10k, 3)} (as now)` : 'Admin’s')}" ${d.canTeams ? '' : 'disabled'} /></td>
      <td class="num credits" data-sort="${m.creditsPer10k ?? 0}">${m.creditsPer10k ? num(m.creditsPer10k, 3) : '—'}</td><td>${from}</td>
      <td class="actions">${mine && d.canTeams ? '<button type="button" class="sm ghost" data-back>↺ Back to the Admin’s rate</button>' : ''}</td></tr>`;
  }).join('') : '';
  $('#main').innerHTML = `
    <div class="head compact"><div class="ht"><h1 class="serif">Fusion engines &amp; rates</h1><span class="crumbs">credits per 10K lines of code for each AI engine · the calculator applies them by itself, and they can still be changed there for one customer</span></div>
      <div class="tools"><a class="btn primary" href="/calculator">${icon('calc')}Open calculator</a></div></div>
    ${d.canAdmin ? '<div class="saved-banner">✓ Changes save as you type; a change that does not work goes back to the last good one.</div>' : '<p class="muted small">The Admin sets these rates for everyone: you see them as the calculator uses them.</p>'}
    ${d.canAdmin ? `<div class="panel"><h2>For everyone <small>the Admin’s rates and the default engine for Fusion: the same for every team</small></h2>
      <form id="rates-admin" class="form" autocomplete="off" data-nodraft><div class="tw"><table class="rates"><thead><tr><th>Engine</th><th class="num">Credits per 10K LOC</th><th class="c">Default engine</th><th></th></tr></thead><tbody>${adminRows}</tbody></table></div>
      <div class="flex mt"><button type="button" class="sm" id="add-engine">${icon('plus')}Add an engine</button><span class="muted small">Name it as Checkmarx One does (“Opus 5.5”, “claude-opus-5-5” and “Claude Opus 5.5” are the same engine).</span></div></form>
      <div class="saved-foot" id="rates-saved">All changes are saved.</div></div>`
    : `<div class="panel"><h2>The Admin’s rates <small>the same for everyone</small></h2><div class="tw"><table><thead><tr><th>Engine</th><th class="num">Credits per 10K LOC</th></tr></thead><tbody>${d.admin.models.map((m) => `<tr><td><b>${esc(m.name)}</b>${m.name === d.admin.defaultModel ? ' <span class="chip star">Default</span>' : ''}</td><td class="num">${m.creditsPer10k ? num(m.creditsPer10k, 3) : '<span class="chip warn"><i></i>needs a rate</span>'}</td></tr>`).join('')}</tbody></table></div></div>`}
    <div class="panel mt"><h2>Triage &amp; remediation credits <small>per finding, for everyone: ${d.canAdmin ? 'only you (the Admin) can change them; the calculator and the reports show them as they are' : 'set by the Admin; the calculator and the reports use them as they are'}</small></h2>
      <form id="tr-rates" class="form" autocomplete="off" data-nodraft><div class="tw"><table class="rates"><thead><tr><th>Severity</th><th class="num">Credits to triage one</th><th class="num">Credits to remediate one</th></tr></thead><tbody>${['Critical', 'High', 'Medium', 'Low'].map((sv) => `<tr><td><b>${sv}</b></td><td class="num">${d.canAdmin ? `<input type="number" min="0" max="1000" step="0.5" name="t-${sv}" value="${esc(d.trRates.triageCost[sv])}" aria-label="${sv}: credits to triage one finding" />` : num(d.trRates.triageCost[sv], 3)}</td><td class="num">${d.canAdmin ? `<input type="number" min="0" max="1000" step="0.5" name="r-${sv}" value="${esc(d.trRates.remediationCost[sv])}" aria-label="${sv}: credits to remediate one finding" />` : num(d.trRates.remediationCost[sv], 3)}</td></tr>`).join('')}</tbody></table></div></form>
      ${d.canAdmin ? '<div class="saved-foot" id="tr-saved">All changes are saved.</div>' : ''}</div>
    ${team ? `<div class="panel mt"><h2>For a team <small>leaders and above: your team’s own rate, used by its people and the teams below it (unless they set theirs)</small></h2>
      <div class="row"><label class="f">Team<select id="rates-team">${d.teams.map((t) => `<option value="${esc(t.id)}"${t.id === team.id ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select></label>
      <label class="f">Default engine for Fusion<select id="team-default" ${d.canTeams ? '' : 'disabled'}><option value="">The Admin’s${eff.defaultFrom === 'admin' || !team.own?.defaultModel ? '' : ''} (${esc(d.admin.defaultModel || 'none')})</option>${eff.models.map((m) => `<option${team.own?.defaultModel === m.name ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label></div>
      <div class="tw mt"><table><thead><tr><th>Engine</th><th class="num">Admin’s rate</th><th class="num">${esc(team.name)}’s own</th><th class="num">Applies</th><th>From</th><th></th></tr></thead><tbody id="team-rows">${teamRows}</tbody></table></div>
      <div class="saved-foot" id="team-saved">${team.own ? 'This team has its own rates.' : 'This team uses the Admin’s rates.'}</div></div>` : ''}
    ${detected}`;
  // ---- the Admin's list: saved as typed; a change the server refuses goes back to what it had ----
  const form = $('#rates-admin');
  if (form) {
    let good = d.admin;
    let timer = null;
    const read = () => {
      const rows = [...form.querySelectorAll('tbody tr')];
      const models = rows.map((r) => ({ name: r.querySelector('[name=name]').value.trim(), creditsPer10k: r.querySelector('[name=rate]').value })).filter((m) => m.name);
      const di = rows.findIndex((r) => r.querySelector('[name=default]').checked);
      return { models, defaultModel: di >= 0 ? rows[di].querySelector('[name=name]').value.trim() : '' };
    };
    const say = (t, bad) => {
      $('#rates-saved').textContent = t;
      $('#rates-saved').classList.toggle('bad', Boolean(bad));
    };
    const save = async () => {
      clearTimeout(timer);
      say('Saving…');
      try {
        const r = await api('/api/fusion-rates', { method: 'PUT', body: read() });
        good = r.admin;
        say(`All changes are saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        say(`${error.message} The last good rates are kept.`, true);
        setTimeout(() => viewRates(new URLSearchParams(team ? `team=${team.id}` : '')).then(() => say(`${error.message} The last good rates are kept.`, true)), 1600);
        void good;
      }
    };
    form.addEventListener('input', (e) => {
      if (e.target.type === 'radio') return;
      e.target.classList.toggle('need', e.target.name === 'rate' && !e.target.value);
      clearTimeout(timer);
      timer = setTimeout(save, 700);
    });
    form.addEventListener('change', (e) => e.target.type === 'radio' && save());
    form.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      const row = del.closest('tr');
      if (!confirm(`Remove ${row.querySelector('[name=name]').value || 'this engine'} from the list?`)) return;
      row.remove();
      save();
    });
    $('#add-engine').onclick = () => {
      const body = form.querySelector('tbody');
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><input name="name" maxlength="80" placeholder="Engine, as Checkmarx One names it" /></td><td class="num"><input name="rate" type="number" min="0" step="0.1" inputmode="decimal" placeholder="needs a rate" class="need" /></td><td class="c"><input type="radio" name="default" aria-label="Default engine" /></td><td class="actions"><button type="button" class="sm ghost icon" data-del title="Remove this engine">' + icon('trash') + '</button></td>';
      body.append(tr);
      tr.querySelector('input').focus();
    };
  }
  // ---- triage & remediation credits: the Admin's, saved as typed; a refused change goes back to the last good one ----
  if (d.canAdmin && $('#tr-rates')) {
    autosave($('#tr-rates'), async (form) => {
      const body = { triageCost: {}, remediationCost: {} };
      for (const sv of ['Critical', 'High', 'Medium', 'Low']) {
        body.triageCost[sv] = form.elements[`t-${sv}`].value;
        body.remediationCost[sv] = form.elements[`r-${sv}`].value;
      }
      await api('/api/tr-rates', { method: 'PUT', body });
    }, { status: $('#tr-saved') });
  }
  // ---- a team's own: each rate saved as typed; "Back to the Admin's rate" removes it ----
  const teamSay = (t, bad) => {
    if (!$('#team-saved')) return;
    $('#team-saved').textContent = t;
    $('#team-saved').classList.toggle('bad', Boolean(bad));
  };
  const saveTeam = async (body, again = true) => {
    teamSay('Saving…');
    try {
      await api(`/api/fusion-rates/teams/${encodeURIComponent(team.id)}`, { method: 'PUT', body });
      if (again) await viewRates(new URLSearchParams(`team=${team.id}`));
      teamSay(`All changes are saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (error) {
      await viewRates(new URLSearchParams(`team=${team.id}`));
      teamSay(`${error.message} The last good rates are kept.`, true);
    }
  };
  if ($('#rates-team')) $('#rates-team').onchange = (e) => viewRates(new URLSearchParams(`team=${e.target.value}`));
  if ($('#team-default')) $('#team-default').onchange = (e) => saveTeam({ defaultModel: e.target.value });
  if ($('#team-rows')) {
    const timers = new Map();
    $('#team-rows').addEventListener('input', (e) => {
      if (!e.target.classList.contains('team-rate')) return;
      const name = e.target.closest('tr').dataset.name;
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(() => saveTeam({ rates: { [name]: e.target.value === '' ? null : e.target.value } }, false), 800));
    });
    $('#team-rows').addEventListener('click', (e) => {
      if (!e.target.closest('[data-back]')) return;
      saveTeam({ rates: { [e.target.closest('tr').dataset.name]: null } });
    });
  }
  // ---- engines seen without a rate: one typed here is set for everyone, or for the team ----
  for (const input of $$('.det-admin, .det-team')) {
    input.addEventListener('change', async () => {
      const name = input.closest('tr').dataset.name;
      if (!input.value) return;
      if (input.classList.contains('det-team')) return saveTeam({ rates: { [name]: input.value } });
      try {
        await api('/api/fusion-rates', { method: 'PUT', body: { models: [...d.admin.models, { name, creditsPer10k: input.value }], defaultModel: d.admin.defaultModel } });
        toast(`${name}: ${input.value} credits per 10K LOC, for everyone.`, 'ok');
      } catch (error) {
        toast(error.message, 'bad');
      }
      viewRates(new URLSearchParams(team ? `team=${team.id}` : ''));
    });
  }
}
