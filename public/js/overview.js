import { countUp } from './accounts.js';
import { $, $$, api, can, esc, go, icon, initials, num, pct, state } from './core.js';
import { loading, shell } from './shell.js';
// ---- Overview ---------------------------------------------------------------------------------------------
export function teamSelect(id, selected, { all = true } = {}) {
  const teams = [...(state.me.scopeTeams ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  return `<select id="${id}">${all ? '<option value="">All my teams</option>' : ''}${teams.map((t) => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.path)}</option>`).join('')}</select>`;
}

// ---- The Overview's cards: small, each with a picture of its number; everyone chooses which they see ------------------
export const ring = (p, kind = '') => `<span class="ring ${kind}" data-css="--p:${Math.max(0, Math.min(100, p))}"><b>${p}%</b></span>`;
export const glyph = (name, kind = '') => `<span class="glyph ${kind}">${icon(name)}</span>`;
export const OV_CARDS = [
  ['projected', 'Projected credits', (t) => ({ v: num(Math.round(t.credits)), s: `T&R ${num(Math.round(t.trCredits))} · Fusion ${num(Math.round(t.fusionCredits))}${t.credits - t.trCredits - t.fusionCredits >= 1 ? ` · extra ${num(Math.round(t.credits - t.trCredits - t.fusionCredits))}` : ''}`, g: '', hero: true })],
  ['sold', 'Credits sold', (t) => ({ v: num(Math.round(t.sold)), s: `${num(t.accountsWithSales)} account${t.accountsWithSales === 1 ? '' : 's'}`, g: ring(pct(t.sold, t.credits), 'ok') })],
  ['needed', 'Still needed', (t) => ({ v: num(Math.round(t.remaining)), s: 'projected, not sold yet', g: ring(pct(t.remaining, t.credits), 'need') })],
  ['accounts', 'Accounts', (t) => ({ v: num(t.accounts), s: `${num(t.withReport)} with a report`, g: ring(pct(t.withReport, t.accounts)) })],
  ['reports', 'Reports', (t) => ({ v: num(t.reports), s: `${num(t.primaryMarked)} with a primary`, g: glyph('send') })],
  ['shared', 'Shared', (t) => ({ v: num(t.sharedReports), s: `${num(t.accountsShared)} of ${num(t.accounts)} accounts`, g: ring(pct(t.accountsShared, t.accounts)) })],
  ['missing', 'No Salesforce link', (t) => ({ v: num(t.missingSalesforce), s: t.missingSalesforce ? 'no report possible yet' : 'all tied to Salesforce', g: glyph('ext', t.missingSalesforce ? 'bad' : 'ok'), warn: t.missingSalesforce > 0 })],
];
/** Shown until a person chooses: credits sold and still needed are a click away in Cards ▾. */
export const DEFAULT_CARDS = ['projected', 'accounts', 'reports', 'shared', 'missing'];
/** The cards this person shows, in their order. */
export const myCards = () => (Array.isArray(state.me.prefs?.cards) && state.me.prefs.cards.length ? state.me.prefs.cards : DEFAULT_CARDS).filter((id) => OV_CARDS.some(([c]) => c === id));
export const cardOf = (id) => OV_CARDS.find(([c]) => c === id);
export function overviewTiles(t) {
  return `<div class="tiles">${myCards().map(cardOf).map(([id, label, f]) => {
    const c = f(t);
    return `<div class="tile${c.hero ? ' hero' : ''}${c.warn ? ' warn' : ''}" data-card="${id}">${c.g ? `<div class="tile-g">${c.g}</div>` : ''}<div class="tile-t"><span class="k">${esc(label)}</span><b class="v">${c.v}</b><span class="s">${c.s}</span></div></div>`;
  }).join('')}</div>`;
}
export function cardsPicker(onDone) {
  document.querySelector('.cards-pop')?.remove();
  const shown = myCards();
  const chosen = new Set(shown);
  // The chosen cards first, in their order; then the others.
  const order = [...shown, ...OV_CARDS.map(([id]) => id).filter((id) => !chosen.has(id))];
  const pop = document.createElement('div');
  pop.className = 'cards-pop mp-menu';
  pop.innerHTML = `<b>Cards on your Overview</b><span class="muted small">Tick to show; drag ⠿ or use ▲ ▼ to order them.</span><div class="mp-list cards-order">${order.map((id) => `<div class="co-row" draggable="true" data-id="${id}"><span class="co-grip" aria-hidden="true">⠿</span><label><input type="checkbox" value="${id}" ${chosen.has(id) ? 'checked' : ''} /><span>${esc(cardOf(id)[1])}</span></label><button type="button" class="link" data-up title="Move up" aria-label="Move up">▲</button><button type="button" class="link" data-down title="Move down" aria-label="Move down">▼</button></div>`).join('')}</div><div class="mp-acts"><button type="button" class="link" data-all>All</button><button type="button" class="link" data-default>Default</button><span class="muted small">Saved for you, on every device</span></div>`;
  document.body.append(pop);
  const r = $('#cards-btn').getBoundingClientRect();
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${Math.max(8, window.scrollX + r.right - pop.offsetWidth)}px`;
  const save = async () => {
    const cards = [...pop.querySelectorAll('.co-row input:checked')].map((i) => i.value);
    state.me.prefs = { ...(state.me.prefs ?? {}), cards };
    onDone();
    try {
      await api('/api/me/prefs', { method: 'PUT', body: { cards } });
    } catch {}
  };
  pop.addEventListener('change', save);
  pop.querySelector('[data-all]').onclick = () => {
    for (const i of pop.querySelectorAll('input')) i.checked = true;
    save();
  };
  const list = pop.querySelector('.cards-order');
  pop.querySelector('[data-default]').onclick = () => {
    const rows = new Map([...list.children].map((r) => [r.dataset.id, r]));
    for (const id of [...DEFAULT_CARDS, ...OV_CARDS.map(([c]) => c).filter((c) => !DEFAULT_CARDS.includes(c))]) list.append(rows.get(id));
    for (const i of list.querySelectorAll('input')) i.checked = DEFAULT_CARDS.includes(i.value);
    save();
  };
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.co-row');
    if (!row) return;
    if (e.target.closest('[data-up]') && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    else if (e.target.closest('[data-down]') && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    else return;
    save();
  });
  let dragged = null;
  list.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.co-row');
    dragged?.classList.add('dragging');
  });
  list.addEventListener('dragover', (e) => {
    const over = e.target.closest('.co-row');
    if (!dragged || !over || over === dragged) return;
    e.preventDefault();
    const r = over.getBoundingClientRect();
    list.insertBefore(dragged, e.clientY > r.top + r.height / 2 ? over.nextElementSibling : over);
  });
  list.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    dragged = null;
    save();
  });
  setTimeout(() => {
    const close = (e) => {
      if (pop.contains(e.target) || e.target.closest('#cards-btn')) return;
      pop.remove();
      document.removeEventListener('click', close);
    };
    document.addEventListener('click', close);
  });
}
/**
 * The Overview's teams: the team at the top (Global Solution Engineering: everything rolls up into it) as one fixed
 * line, then the three teams below it with the most projected credits, each with its share; the rest on Teams.
 */
export function topTeams(roots, kids) {
  const top = [...roots].sort((a, b) => b.credits - a.credits)[0];
  const below = roots.length > 1 ? roots.filter((x) => x !== top) : kids(top.id);
  const three = [...below].sort((a, b) => b.credits - a.credits).slice(0, 3);
  const more = below.length - three.length;
  const total = Math.max(1, top.credits);
  const meta = (n) => `${num(n.people)} ${n.people === 1 ? 'person' : 'people'} · ${num(n.accounts)} account${n.accounts === 1 ? '' : 's'} · ${num(n.shared)} shared · <span class="sold-t">${num(Math.round(n.sold))} sold</span> · ${num(Math.round(n.remaining))} to go`;
  return `<div class="team-top" data-team="${esc(top.id)}"><div><b>${esc(top.name)}</b><small>${top.leaders.length ? ` · led by ${esc(top.leaders.join(', '))}` : ''}</small><div class="meta">${meta(top)}</div></div><span class="credits">${num(Math.round(top.credits))}</span></div>
    ${three.length ? `<div class="team-three">${three.map((n, i) => `<div class="node" data-team="${esc(n.id)}"><div class="t3-head"><span class="rank">${i + 1}</span><b title="${esc(n.name)}">${esc(n.name)}</b><span class="credits">${num(Math.round(n.credits))}<small>${pct(n.credits, total)}%</small></span></div>${n.leaders.length ? `<small class="t3-lead">led by ${esc(n.leaders.join(', '))}</small>` : ''}<div class="meta">${num(n.people)} ${n.people === 1 ? 'person' : 'people'} · ${num(n.accounts)} account${n.accounts === 1 ? '' : 's'} · ${num(n.shared)} shared<br /><span class="sold-t">${num(Math.round(n.sold))} sold</span> · ${num(Math.round(n.remaining))} to go</div><div class="bar"><div class="track"><i data-w="${pct(n.credits, total)}"></i></div></div></div>`).join('')}</div>` : ''}
    ${more > 0 ? `<a class="small team-more" href="#/teams">+${num(more)} more team${more === 1 ? '' : 's'} on Teams →</a>` : ''}`;
}

export async function viewOverview(params) {
  const focus = params.get('team') ?? '';
  shell('overview', loading());
  const d = await api(`/api/dashboard${focus ? `?team=${encodeURIComponent(focus)}` : ''}`);
  const t = d.totals;
  const scopeName = focus ? state.me.scopeTeams.find((x) => x.id === focus)?.path : can('scope.all') ? 'Every team' : 'Your teams';
  const maxTeam = Math.max(1, ...d.teams.map((x) => x.credits));
  const sePeople = d.people.filter((x) => x.accounts > 0 || x.reports > 0).sort((a, b) => b.credits - a.credits);
  const maxPerson = Math.max(1, ...sePeople.map((x) => x.credits));
  const roots = d.teams.filter((x) => !x.parentId);
  const kids = (id) => d.teams.filter((x) => x.parentId === id);
  const treeRows = [];
  const walk = (node, depth) => {
    treeRows.push({ node, depth });
    for (const k of kids(node.id).sort((a, b) => b.credits - a.credits)) walk(k, depth + 1);
  };
  for (const r of roots.sort((a, b) => b.credits - a.credits)) walk(r, 0);
  $('#main').innerHTML = `
    <div class="head compact"><div class="ht"><h1 class="serif">Overview</h1><span class="crumbs">${esc(scopeName)}</span></div>
      <div class="tools">${teamSelect('focus', focus)}<button type="button" class="ghost" id="cards-btn" title="Choose the cards you see">${icon('overview')}Cards ▾</button>${can('dashboard.export') ? `<a class="btn ghost" href="/api/export/accounts.csv" download title="Every account, as a spreadsheet">${icon('download')}Accounts</a><a class="btn ghost" href="/api/export/reports.csv" download title="Every report, as a spreadsheet">${icon('download')}Reports</a>` : ''}${can('calculator.use') ? `<a class="btn primary" href="/calculator">${icon('calc')}Open calculator</a>` : ''}</div></div>
    ${overviewTiles(t)}
    <div>
      <div class="panel"><h2>Teams <small>credits from primary reports, teams below rolled up</small></h2>
        ${treeRows.length ? topTeams(roots, kids) : '<div class="empty"><b>No teams yet</b>An Admin sets them up under Teams.</div>'}
      </div>

    </div>
    <div class="ov-duo mt">
      <div class="panel ov-list"><h2>Sales Engineers <small>by projected credits</small></h2>
        ${sePeople.length ? `<ol class="rank-list">${sePeople.slice(0, 6).map((p) => `<li class="click" data-person="${esc(p.id)}"><span class="avatar sm">${esc(initials(p.name))}</span><div class="rl-main"><div class="rl-top"><b>${esc(p.name)}</b><span class="rl-val">${num(Math.round(p.credits))}</span></div><div class="rl-bar"><i data-w="${pct(p.credits, maxPerson)}"></i></div><small>${esc(p.team)} · ${num(p.accounts)} account${p.accounts === 1 ? '' : 's'} · ${num(p.shared)} shared${p.sold ? ` · <span class="sold-t">${num(Math.round(p.sold))} sold</span>` : ''}</small></div></li>`).join('')}</ol>${sePeople.length > 6 ? `<a class="rl-more" href="#/accounts">All ${num(sePeople.length)} SEs’ accounts →</a>` : ''}` : '<div class="empty"><b>No accounts yet</b>They appear once Sales Engineers add accounts in the calculator.</div>'}
      </div>
      <div class="panel ov-list"><h2>Largest projections <small>primary report per account</small></h2>
        ${d.top.length ? `<ol class="rank-list">${d.top.slice(0, 6).map((a) => { const tot = Math.round(a.primary.totalCredits); const maxTop = Math.max(1, ...d.top.map((x) => x.primary.totalCredits)); return `<li class="click" data-account="${esc(a.id)}"><span class="rl-rank">${esc(initials(a.name))}</span><div class="rl-main"><div class="rl-top"><b>${esc(a.name)}</b><span class="rl-val">${num(tot)}</span></div><div class="rl-bar"><i data-w="${pct(a.primary.totalCredits, maxTop)}"></i>${a.sold ? `<i class="rl-sold" data-w="${pct(Math.min(a.sold, a.primary.totalCredits), maxTop)}"></i>` : ''}</div><small>${esc(a.owner)} · ${esc(a.team)}${a.sold ? ` · <span class="sold-t">${pct(a.sold, a.primary.totalCredits)}% sold</span>` : ''}</small></div></li>`; }).join('')}</ol><a class="rl-more" href="#/accounts">Every account →</a>` : '<div class="empty"><b>No reports yet</b>Generate the first one in the calculator.</div>'}
      </div>
    </div>`;
  paint();
  $('#cards-btn').onclick = (e) => {
    e.stopPropagation();
    cardsPicker(() => {
      const el = document.querySelector('#main .tiles');
      if (el) el.outerHTML = overviewTiles(t);
    });
  };
  $('#focus').onchange = (e) => go(`/overview${e.target.value ? `?team=${encodeURIComponent(e.target.value)}` : ''}`);
  for (const el of $$('[data-team]')) el.onclick = () => go(`/accounts?team=${encodeURIComponent(el.dataset.team)}`);
  for (const el of $$('[data-person]')) el.onclick = () => go(`/accounts?owner=${encodeURIComponent(el.dataset.person)}`);
  for (const el of $$('[data-account]')) el.onclick = () => go(`/accounts/${encodeURIComponent(el.dataset.account)}`);
}

/** Widths and indents set through the CSSOM (no style attributes: the page's policy allows none). */
export function paint() {
  // The figures count up from zero as the page appears (not for people who asked for less motion).
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const el of $$('.kpi .v')) {
      const to = Number(el.textContent.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(to) && to > 0) countUp(el, to);
    }
  }
  requestAnimationFrame(() => {
    for (const el of $$('[data-w]')) el.style.width = `${Math.max(Number(el.dataset.w) || 0, 0.5)}%`;
    for (const el of $$('[data-indent]')) el.style.width = `${Number(el.dataset.indent) * 18}px`;
  });
}

