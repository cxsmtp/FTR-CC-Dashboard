import { esc, num, state } from './core.js';
// ---- Multi-select: a dropdown of checkboxes with a search, for filters everywhere --------------------------------------
/** options: [[value, label]]; selected: a Set of values. The chosen values are read with pickValues(root). */
export function multiPick(name, label, options, selected = new Set()) {
  const n = selected.size;
  return `<details class="mpick" data-name="${esc(name)}"><summary><span class="mp-l">${esc(label)}</span><b class="mp-v">${n ? (n === 1 ? esc(options.find(([v]) => selected.has(v))?.[1] ?? '1 chosen') : `${n} chosen`) : 'All'}</b></summary>
    <div class="mp-menu">${options.length > 8 ? '<input class="mp-q" placeholder="Find…" />' : ''}<div class="mp-acts"><button type="button" class="link" data-mp="all">All</button><button type="button" class="link" data-mp="none">None</button></div>
    <div class="mp-list">${options.map(([v, l]) => `<label><input type="checkbox" value="${esc(v)}" ${selected.has(v) ? 'checked' : ''} /><span>${esc(l)}</span></label>`).join('') || '<span class="muted small">Nothing to choose yet</span>'}</div></div></details>`;
}
export function wirePicks(root = document, onChange = () => {}) {
  for (const d of root.querySelectorAll('.mpick')) {
    if (d.dataset.wired) continue;
    d.dataset.wired = '1';
    const update = () => {
      const on = [...d.querySelectorAll('.mp-list input:checked')];
      d.querySelector('.mp-v').textContent = on.length === 0 ? 'All' : on.length === 1 ? on[0].nextElementSibling.textContent : `${on.length} chosen`;
      d.classList.toggle('active', on.length > 0);
      onChange(d);
    };
    d.classList.toggle('active', d.querySelectorAll('.mp-list input:checked').length > 0);
    d.addEventListener('change', (e) => e.target.matches('.mp-list input') && update());
    d.querySelector('.mp-q')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      for (const l of d.querySelectorAll('.mp-list label')) l.hidden = !l.textContent.toLowerCase().includes(q);
    });
    d.addEventListener('click', (e) => {
      const act = e.target.closest('[data-mp]')?.dataset.mp;
      if (!act) return;
      for (const i of d.querySelectorAll('.mp-list label:not([hidden]) input')) i.checked = act === 'all';
      update();
    });
  }
  // One open at a time; a click elsewhere closes them.
  if (!document.body.dataset.mpWired) {
    document.body.dataset.mpWired = '1';
    document.addEventListener('click', (e) => {
      for (const d of document.querySelectorAll('.mpick[open]')) if (!d.contains(e.target)) d.open = false;
    });
  }
}
export const pickValues = (root, name) => [...(root.querySelector(`.mpick[data-name="${name}"]`)?.querySelectorAll('.mp-list input:checked') ?? [])].map((i) => i.value);

// ---- Every table: sort low to high and back, and filter each column by its values (multi-select) -------------------
/** What a cell sorts and filters by: data-sort / data-v, else its text without the small print under it. */
export function cellText(td) {
  if (!td) return '';
  if (td.dataset.v !== undefined) return td.dataset.v;
  const c = td.cloneNode(true);
  for (const x of c.querySelectorAll('.sub, button, .actions, svg, .avatar, .tx-tools')) x.remove();
  return c.textContent.replace(/\s+/g, ' ').trim();
}
export const YEAR = new Date().getFullYear();
export function sortKey(td) {
  if (td?.dataset.sort !== undefined) {
    const n = Number(td.dataset.sort);
    return Number.isFinite(n) ? n : td.dataset.sort.toLowerCase();
  }
  const t = cellText(td);
  if (!t || t === '—') return null;
  const num = /^[-+]?[€$£₹]?\s?[\d,]*\.?\d+\s*(%|ms|s|credits|KB|MB|GB)?$/i.exec(t.split(' · ')[0]);
  if (num) return Number(t.split(' · ')[0].replace(/[^\d.+-]/g, ''));
  if (/\d{1,2}:\d{2}|\b(19|20)\d{2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(t)) {
    const d = Date.parse(t) || Date.parse(t.replace(/^(\w{3} \d{1,2}),/, `$1 ${YEAR}`)) || Date.parse(`${t} ${YEAR}`);
    if (Number.isFinite(d)) return d;
  }
  return t.toLowerCase();
}
export const dataRows = (tbody) => [...tbody.rows].filter((r) => !(r.cells.length === 1 && r.cells[0].colSpan > 1) && !r.classList.contains('grp'));
export function enhanceTable(table) {
  if (table.dataset.tx || table.classList.contains('matrix') || table.dataset.plain !== undefined || !table.tHead || !table.tBodies[0]) return;
  table.dataset.tx = '1';
  const tbody = table.tBodies[0];
  const heads = [...table.tHead.rows[0].cells];
  const state = { col: -1, dir: 0, filters: new Map() };
  const bar = document.createElement('div');
  bar.className = 'tx-bar';
  bar.hidden = true;
  table.closest('.tw')?.before(bar) ?? table.before(bar);
  let observer;
  const apply = () => {
    observer?.disconnect();
    const rows = dataRows(tbody);
    let shown = 0;
    for (const r of rows) {
      const ok = [...state.filters].every(([i, set]) => set.has(cellText(r.cells[i])));
      r.hidden = !ok;
      if (ok) shown++;
    }
    if (state.dir) {
      const dir = state.dir;
      const keyed = rows.map((r, i) => [r, sortKey(r.cells[state.col]), i]);
      // A column of numbers sorts as numbers; words in it ("No report", "—") go last either way.
      const nums = keyed.filter(([, k]) => typeof k === 'number').length;
      if (nums && nums >= keyed.filter(([, k]) => k !== null).length / 2) for (const x of keyed) if (typeof x[1] !== 'number') x[1] = null;
      const sorted = keyed.sort((a, b) => {
        if (a[1] === null && b[1] === null) return a[2] - b[2];
        if (a[1] === null) return 1;
        if (b[1] === null) return -1;
        if (typeof a[1] === typeof b[1]) return (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2]) * dir;
        return (typeof a[1] === 'number' ? -1 : 1) * dir;
      });
      for (const [r] of sorted) tbody.append(r);
    }
    for (const [i, th] of heads.entries()) {
      th.classList.toggle('tx-asc', state.col === i && state.dir === 1);
      th.classList.toggle('tx-desc', state.col === i && state.dir === -1);
      th.classList.toggle('tx-filtered', state.filters.has(i));
      th.setAttribute('aria-sort', state.col === i && state.dir ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    }
    bar.hidden = !state.filters.size;
    if (state.filters.size) bar.innerHTML = `Showing <b>${num(shown)}</b> of ${num(rows.length)} · ${[...state.filters.keys()].map((i) => esc(heads[i].dataset.txLabel)).join(', ')} filtered <button type="button" class="link" data-tx-clear>Clear filters</button>`;
    observer?.observe(tbody, { childList: true });
  };
  bar.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tx-clear]')) return;
    state.filters.clear();
    apply();
  });
  // Rows drawn again (a search, Older entries…): sorted and filtered the same way.
  observer = new MutationObserver(() => apply());
  observer.observe(tbody, { childList: true });
  for (const [i, th] of heads.entries()) {
    const label = th.childNodes[0]?.textContent?.trim() || th.textContent.trim();
    if (!label || th.colSpan > 1) continue;
    th.dataset.txLabel = label;
    th.classList.add('tx-th');
    const tools = document.createElement('span');
    tools.className = 'tx-tools';
    tools.innerHTML = `<button type="button" class="tx-sort" title="Sort: low to high, then high to low" aria-label="Sort by ${esc(label)}"></button><button type="button" class="tx-filter" title="Filter ${esc(label)}" aria-label="Filter by ${esc(label)}">⏷</button>`;
    th.append(tools);
    const sortIt = () => {
      state.dir = state.col === i ? (state.dir === 1 ? -1 : state.dir === -1 ? 0 : 1) : 1;
      state.col = state.dir ? i : -1;
      apply();
    };
    tools.querySelector('.tx-sort').onclick = (e) => {
      e.stopPropagation();
      sortIt();
    };
    th.addEventListener('click', (e) => {
      if (e.target.closest('.tx-tools, button, a, input, select')) return;
      sortIt();
    });
    tools.querySelector('.tx-filter').onclick = (e) => {
      e.stopPropagation();
      openColumnFilter(th, i, label);
    };
  }
  function openColumnFilter(th, i, label) {
    document.querySelector('.tx-pop')?.remove();
    const counts = new Map();
    for (const r of dataRows(tbody)) {
      const v = cellText(r.cells[i]);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const values = [...counts.keys()].sort((a, b) => {
      const ka = sortKey(Object.assign(document.createElement('td'), { textContent: a }));
      const kb = sortKey(Object.assign(document.createElement('td'), { textContent: b }));
      return ka === kb ? 0 : ka === null ? 1 : kb === null ? -1 : typeof ka === typeof kb ? (ka < kb ? -1 : 1) : typeof ka === 'number' ? -1 : 1;
    });
    const chosen = state.filters.get(i);
    const pop = document.createElement('div');
    pop.className = 'tx-pop mp-menu';
    pop.innerHTML = `<div class="tx-pop-h"><b>${esc(label)}</b><span class="tx-sorts"><button type="button" class="sm ghost" data-dir="1">Low to high</button><button type="button" class="sm ghost" data-dir="-1">High to low</button></span></div>
      ${values.length > 8 ? '<input class="mp-q" placeholder="Find…" />' : ''}<div class="mp-acts"><button type="button" class="link" data-mp="all">All</button><button type="button" class="link" data-mp="none">None</button></div>
      <div class="mp-list">${values.slice(0, 500).map((v) => `<label><input type="checkbox" value="${esc(v)}" ${!chosen || chosen.has(v) ? 'checked' : ''} /><span>${esc(v || '(empty)')}</span><em>${num(counts.get(v))}</em></label>`).join('')}</div>`;
    document.body.append(pop);
    const r = th.getBoundingClientRect();
    pop.style.top = `${window.scrollY + r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8))}px`;
    const update = () => {
      const on = [...pop.querySelectorAll('.mp-list input')].filter((x) => x.checked).map((x) => x.value);
      if (on.length === values.length) state.filters.delete(i);
      else state.filters.set(i, new Set(on));
      apply();
    };
    pop.addEventListener('change', update);
    pop.addEventListener('click', (e) => {
      const act = e.target.closest('[data-mp]')?.dataset.mp;
      if (act) {
        for (const x of pop.querySelectorAll('.mp-list label:not([hidden]) input')) x.checked = act === 'all';
        update();
      }
      const dir = e.target.closest('[data-dir]')?.dataset.dir;
      if (dir) {
        state.col = i;
        state.dir = Number(dir);
        apply();
      }
    });
    pop.querySelector('.mp-q')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      for (const l of pop.querySelectorAll('.mp-list label')) l.hidden = !l.textContent.toLowerCase().includes(q);
    });
    setTimeout(() => {
      const close = (e) => {
        if (pop.contains(e.target)) return;
        pop.remove();
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    });
  }
  apply();
}
// ---- Every page keeps your work: what you type in a form is kept as you type, until the form is sent -----------------
// Settings save on the server as they change; everything else (a person being added, a sale being recorded, a team
// being made…) is kept in this browser, so leaving the page, a reload or a dropped connection loses nothing.
export const DRAFT = 'cc-draft:';
/** Fields that hold a secret (a password, token or key) are never kept as a draft, whatever their type. */
export const SECRET_FIELD = /pass(word)?|token|secret|api.?key|^key$/i;
export const draftable = (el) => el.form && el.name && !el.closest('[data-nodraft], .filters, .mpick') && !['password', 'file', 'hidden', 'submit', 'button', 'search'].includes(el.type) && !SECRET_FIELD.test(el.name) && !el.form.matches('#sf, #bf, #auto, #af, #actf, #acct');
/** A draft is its writer's: the person signed in is part of its name, so it is never shown to the next one on a shared browser. */
export const draftKey = (el) => `${DRAFT}${state.me?.user?.id ?? 'nobody'}:${location.hash.split('?')[0]}:${el.form.id || el.form.className}:${el.name}`;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!draftable(el)) return;
  try {
    localStorage.setItem(draftKey(el), JSON.stringify(el.type === 'checkbox' ? el.checked : el.value));
    el.form.dataset.drafted = '1';
  } catch {}
}, true);
document.addEventListener('submit', (e) => {
  try {
    for (const el of e.target.elements ?? []) if (draftable(el)) localStorage.removeItem(draftKey(el));
  } catch {}
}, true);
export function restoreDrafts(root) {
  for (const el of root.querySelectorAll('form input, form textarea, form select')) {
    if (!draftable(el) || el.dataset.draftChecked) continue;
    el.dataset.draftChecked = '1';
    let v;
    try {
      v = localStorage.getItem(draftKey(el));
    } catch {}
    if (v === null || v === undefined) continue;
    const value = JSON.parse(v);
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
    el.classList.add('drafted');
    el.title = 'Kept from what you typed before';
  }
}
/** Tables appear as pages draw: each is given sorting and filters once. */
new MutationObserver(() => {
  for (const t of document.querySelectorAll('#app table:not([data-tx])')) enhanceTable(t);
  // Dialogs are added to the page itself, beside the app: what was typed in them is kept and brought back too.
  restoreDrafts(document.body);
}).observe(document.body, { childList: true, subtree: true });
window.addEventListener('hashchange', () => document.querySelector('.tx-pop')?.remove());

// ---- Menus inside a table: opened over the page, not inside the table's own scrolling -------------------------------
// A table scrolls in its box, which would cut a row's menu off (or give it a scroller of its own). An open menu in a
// table is placed against the window instead: under its button, or above it when there is no room below, and it
// closes when the table or the page scrolls, on a click outside, and on Esc.
function placeMenu(details) {
  const list = details.querySelector(':scope > .menu-list');
  const btn = details.querySelector(':scope > summary');
  if (!list || !btn) return;
  list.classList.add('menu-float');
  const b = btn.getBoundingClientRect();
  const h = list.offsetHeight;
  const w = list.offsetWidth;
  const below = window.innerHeight - b.bottom - 8;
  const top = h <= below || below >= b.top ? b.bottom + 6 : Math.max(8, b.top - 6 - h);
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, b.right - w));
  list.style.top = `${Math.round(top)}px`;
  list.style.left = `${Math.round(left)}px`;
  list.style.maxHeight = `${Math.round(window.innerHeight - top - 8)}px`;
  // Inside an animated or transformed part of the page, "fixed" is measured from that part, not the window: where the
  // menu landed is read back and the difference taken off, so it sits under its button and inside the window.
  const got = list.getBoundingClientRect();
  if (Math.abs(got.left - left) > 0.5) list.style.left = `${Math.round(left + (left - got.left))}px`;
  if (Math.abs(got.top - top) > 0.5) list.style.top = `${Math.round(top + (top - got.top))}px`;
}
const closeMenus = (but = null) => {
  for (const d of document.querySelectorAll('.tw details.menu[open]')) if (d !== but) d.open = false;
};
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.matches('.tw details.menu')) return;
  if (!d.open) return;
  closeMenus(d);
  placeMenu(d);
}, true);
// The page or the table scrolls: an open menu follows its button, and closes once the button is out of sight.
document.addEventListener('scroll', (e) => {
  if (e.target instanceof Element && e.target.closest('.menu-list')) return;
  for (const d of document.querySelectorAll('.tw details.menu[open]')) {
    const btn = d.querySelector(':scope > summary')?.getBoundingClientRect();
    const box = d.closest('.tw')?.getBoundingClientRect();
    if (!btn || !box || btn.bottom < box.top || btn.top > box.bottom || btn.bottom < 0 || btn.top > window.innerHeight) d.open = false;
    else placeMenu(d);
  }
}, true);
window.addEventListener('resize', () => closeMenus());
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('.tw details.menu')) closeMenus();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenus());
