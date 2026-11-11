import { $, ago, api, dateTime, esc, go, num } from './core.js';
import { loading, shell } from './shell.js';
import { multiPick, pickValues, wirePicks } from './widgets.js';
// ---- Checkmarx One activity: every call to a customer's tenant, reads, connections, reports generated --------------
export const ACT_KINDS = [['call', 'API call'], ['connect', 'Connected'], ['disconnect', 'Disconnected'], ['read', 'Tenant read'], ['report', 'Report generated']];
export async function viewActivity(params) {
  shell('activity', loading());
  const get = (k) => new Set((params.get(k) ?? '').split(',').filter(Boolean));
  const f = { who: get('who'), tenant: get('tenant'), kind: get('kind'), account: get('account'), outcome: params.get('outcome') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const qs = () => new URLSearchParams(Object.entries(f).map(([k, v]) => [k, v instanceof Set ? [...v].join(',') : v]).filter(([, v]) => v)).toString();
  const d = await api(`/api/activity${qs() ? `?${qs()}` : ''}`);
  const onlyMe = f.who.size === 1 && (f.who.has('me') || f.who.has(d.me));
  const sm = d.summary;
  const VERDICT = { failed: ['bad', 'Needs attention'], recovered: ['ok', 'Recovered by itself'], expected: ['', 'Expected'] };
  const why = (x) => (x ? `<details class="why ${x.verdict}"><summary><span class="chip ${VERDICT[x.verdict][0]}"><i></i>${VERDICT[x.verdict][1]}</span> ${esc(x.why)}</summary><b>Done:</b> ${esc(x.done)}<br /><b>Next time:</b> ${esc(x.next)}</details>` : '');
  const row = (e) => `<tr class="${e.ok === false ? (e.explain && e.explain.verdict !== 'failed' ? 'recovered' : 'refused') : ''}"><td class="small nowrap">${esc(dateTime(e.at))}</td><td>${esc(e.user?.name ?? '—')}<span class="sub">${esc(e.user?.email ?? '')}</span></td><td><span class="chip ${e.ok === false ? 'bad' : e.kind === 'report' ? 'ok' : ''}"><i></i>${esc(ACT_KINDS.find(([k]) => k === e.kind)?.[1] ?? e.kind)}</span></td><td class="mono small">${esc(e.tenant ?? '')}</td><td>${e.account ? `<a href="#/accounts/${encodeURIComponent(e.account.id)}">${esc(e.account.name)}</a>` : '<span class="muted">—</span>'}</td><td class="mono small">${e.method ? `${esc(e.method)} ${esc(e.path ?? '')}` : esc(e.detail ?? '')}</td><td class="small nowrap">${e.status ? `<b>${esc(e.status)}</b> · ` : ''}${e.ms !== undefined ? `${num(e.ms)} ms` : ''}${e.method && e.detail ? `<span class="sub">${esc(e.detail)}</span>` : ''}${why(e.explain)}</td></tr>`;
  $('#main').innerHTML = `<div class="head"><div><div class="crumbs">Work</div><h1 class="serif">CxOne API audit</h1><p>Every call made to a customer’s Checkmarx One tenant, on whose behalf and for which account, with its result and time; and every connection, tenant read and report generated. You see your own and that of the teams you see.</p></div>
      <div class="tools"><label class="switch"><input type="checkbox" id="onlyme" ${onlyMe ? 'checked' : ''} /><span>Only me</span></label></div></div>
    <div class="kpis five">
      <div class="kpi"><div class="k">API calls · 30 days</div><div class="v">${num(sm.calls)}</div><div class="s">${num(sm.avgMs)} ms on average</div></div>
      <div class="kpi ${sm.attention ? 'warn' : ''}"><div class="k">Failures needing attention</div><div class="v">${num(sm.attention)}</div><div class="s">${num(sm.recovered)} recovered by themselves · ${num(sm.avoided ?? 0)} avoided (learned)</div></div>
      <div class="kpi"><div class="k">Tenants</div><div class="v">${num(sm.tenants)}</div><div class="s">${num(sm.connects)} connection${sm.connects === 1 ? '' : 's'}</div></div>
      <div class="kpi"><div class="k">Tenant reads</div><div class="v">${num(sm.reads)}</div><div class="s">finished</div></div>
      <div class="kpi"><div class="k">Reports generated</div><div class="v">${num(sm.reports)}</div><div class="s">in the calculator</div></div>
    </div>
    ${d.analysis?.length ? `<details class="panel why-panel"${sm.attention ? ' open' : ''}><summary><h2>Why calls did not succeed <small>${sm.attention ? `${num(sm.attention)} need${sm.attention === 1 ? 's' : ''} attention · ` : 'nothing needs attention · '}each kind, with what was done and what happens next time · last 30 days</small></h2></summary>
      <div class="tw"><table class="why-table"><thead><tr><th>Verdict</th><th>Request</th><th class="num">Calls</th><th>Why</th><th>What was done</th><th>Next time</th><th>Last</th></tr></thead><tbody>${d.analysis.map((g) => `<tr class="${g.verdict === 'failed' ? 'refused' : ''}"><td data-v="${esc(VERDICT[g.verdict][1])}"><span class="chip ${VERDICT[g.verdict][0]}"><i></i>${VERDICT[g.verdict][1]}</span></td><td class="mono small">${esc(g.method)} ${esc(g.path)} <b>${esc(g.status)}</b><span class="sub">${esc(g.tenants.join(', '))}</span></td><td class="num">${num(g.count)}</td><td class="small">${esc(g.why)}</td><td class="small">${esc(g.done)}</td><td class="small">${esc(g.next)}</td><td class="small nowrap" data-sort="${esc(g.last)}">${esc(ago(g.last))}</td></tr>`).join('')}</tbody></table></div>
      ${d.learned?.length ? `<div class="learned mt">${d.learned.map((t) => `<span class="chip ok"><i></i><b class="mono">${esc(t.tenant)}</b>&nbsp;learned: ${num(t.noSastMeta)} scan${t.noSastMeta === 1 ? '' : 's'} without SAST metadata${t.skipped.length ? ` · ${num(t.skipped.length)} optional API${t.skipped.length === 1 ? '' : 's'} not offered` : ''}${t.slow ? ' · asked to slow down once' : ''} · ${num(t.avoided)} call${t.avoided === 1 ? '' : 's'} avoided</span>`).join(' ')}</div>` : ''}</details>` : ''}
    <div class="panel"><form class="filters" id="actf">
      ${multiPick('who', 'People', d.people.map((p) => [p.id, p.id === d.me ? `${p.name} (me)` : p.name]), new Set([...f.who].map((x) => (x === 'me' ? d.me : x))))}
      ${multiPick('tenant', 'Tenant', d.tenants.map((t) => [t, t]), f.tenant)}
      ${multiPick('kind', 'What', ACT_KINDS, f.kind)}
      ${multiPick('account', 'Account', d.accounts.map((a) => [a.id, a.name]), f.account)}
      <label class="f">Outcome<select name="outcome"><option value="">All</option><option value="ok"${f.outcome === 'ok' ? ' selected' : ''}>Succeeded</option><option value="attention"${f.outcome === 'attention' ? ' selected' : ''}>Needs attention</option><option value="recovered"${f.outcome === 'recovered' ? ' selected' : ''}>Recovered by itself</option><option value="failed"${f.outcome === 'failed' ? ' selected' : ''}>Any that did not succeed</option></select></label>
      <label class="f">From<input type="date" name="from" value="${esc(f.from)}" /></label>
      <label class="f">To<input type="date" name="to" value="${esc(f.to)}" /></label>
      <div class="flex"><button class="primary">Apply</button>${qs() ? '<a class="btn ghost" href="#/activity">Clear</a>' : ''}</div>
    </form>
    <div class="tw mt"><table class="audit"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Tenant</th><th>Account</th><th>Request</th><th>Result</th></tr></thead><tbody id="actrows">${d.events.map(row).join('') || '<tr><td colspan="7"><div class="empty"><b>No activity yet</b>Connections to Checkmarx One, reads and reports generated in the calculator show here.</div></td></tr>'}</tbody></table></div>
    <div class="flex mt"><button id="actmore" ${d.more ? '' : 'hidden'}>Older entries</button><span class="muted small" id="actcount">${d.events.length} shown</span></div></div>`;
  wirePicks($('#main'));
  const apply = () => {
    const form = $('#actf');
    const out = new URLSearchParams();
    for (const k of ['who', 'tenant', 'kind', 'account']) {
      const v = pickValues(form, k);
      if (v.length) out.set(k, v.join(','));
    }
    for (const k of ['outcome', 'from', 'to']) if (form.elements[k].value) out.set(k, form.elements[k].value);
    go(`/activity${out.toString() ? `?${out}` : ''}`);
  };
  $('#actf').onsubmit = (e) => {
    e.preventDefault();
    apply();
  };
  // Filters apply as they change; Apply stays for a change made midway.
  let applyTimer = null;
  $('#actf').addEventListener('change', () => {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 450);
  });
  $('#onlyme').onchange = (e) => {
    const out = new URLSearchParams(qs());
    if (e.target.checked) out.set('who', 'me');
    else out.delete('who');
    go(`/activity${out.toString() ? `?${out}` : ''}`);
  };
  let last = d.events.at(-1)?.at ?? '';
  let shown = d.events.length;
  $('#actmore').onclick = async (e) => {
    e.target.disabled = true;
    const next = await api(`/api/activity?${new URLSearchParams([...new URLSearchParams(qs()), ['before', last]])}`);
    $('#actrows').insertAdjacentHTML('beforeend', next.events.map(row).join(''));
    last = next.events.at(-1)?.at ?? last;
    shown += next.events.length;
    $('#actcount').textContent = `${shown} shown`;
    e.target.disabled = false;
    e.target.hidden = !next.more;
  };
}
