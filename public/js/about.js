import { $, can, dateTime, esc, go, state } from './core.js';
import { openDoc } from './profile.js';
import { ADMIN_TABS } from './settings.js';
import { loading, shell } from './shell.js';
// ---- About: the version, what is new, the licence ------------------------------------------------------------------
/** Markdown from this repository's own files (CHANGELOG.md), as safe HTML: headings, lists, bold and code only. */
export function md(text) {
  const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  // Blocks first: a heading, a list item (with how far in it sits) or a paragraph. A line that only carries on the
  // one before it (a long item or paragraph wrapped in the file) is joined to it, not made a paragraph of its own.
  const blocks = [];
  for (const line of String(text).split('\n')) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^(\s*)[-*]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (h) blocks.push({ kind: 'h', level: h[1].length + 1, text: h[2] });
    else if (li) blocks.push({ kind: 'li', depth: li[1].length >= 2 ? 1 : 0, text: li[2] });
    else if (!line.trim()) blocks.push({ kind: 'gap' });
    else if (last && (last.kind === 'li' || last.kind === 'p')) last.text += ` ${line.trim()}`;
    else blocks.push({ kind: 'p', text: line.trim() });
  }
  const out = [];
  let depth = -1; // -1: not in a list; 0: in a list; 1: in a list inside an item
  const close = (to) => {
    for (; depth > to; depth--) out.push(depth === 1 ? '</ul></li>' : '</li></ul>');
  };
  for (const b of blocks) {
    if (b.kind === 'li') {
      if (depth < 0) (out.push('<ul>'), (depth = 0));
      else if (b.depth === 1 && depth === 0) (out.push('<ul>'), (depth = 1));
      else if (b.depth === 0 && depth === 1) (out.push('</ul></li>'), (depth = 0));
      else out.push('</li>');
      out.push(`<li>${inline(b.text)}`);
      continue;
    }
    if (b.kind === 'gap') continue;
    close(-1);
    out.push(b.kind === 'h' ? `<h${b.level}>${inline(b.text)}</h${b.level}>` : `<p>${inline(b.text)}</p>`);
  }
  close(-1);
  return out.join('');
}
/** One version of the release notes, folded or open. */
const versionHtml = (v, open) => `<details ${open ? 'open' : ''}><summary>${esc(v.split('\n')[0].replace(/^## /, ''))}</summary><div class="md">${md(v.split('\n').slice(1).join('\n'))}</div></details>`;
/** The versions not shown yet: the latest three are open, the earlier ones come ten at a time when asked for. */
let earlier = [];
const SHOWN_OPEN = 3;
const MORE = 10;
const moreButton = () => (earlier.length ? `<button type="button" class="sm" data-more-versions>Show ${Math.min(MORE, earlier.length)} earlier version${Math.min(MORE, earlier.length) === 1 ? '' : 's'} <span class="muted">· ${earlier.length} more</span></button>` : '');
document.addEventListener('click', (e) => {
  const button = e.target.closest?.('[data-more-versions]');
  if (!button) return;
  const next = earlier.splice(0, MORE);
  button.insertAdjacentHTML('beforebegin', next.map((v) => versionHtml(v, false)).join(''));
  button.outerHTML = moreButton();
});
/** About: one panel of facts and the terms card, then every version. */
export async function aboutHtml() {
  const me = state.me;
  const b = state.branding ?? {};
  const log = await fetch('/legal/changelog').then((r) => r.text()).catch(() => '');
  const versions = log.replace(/^# .*\n/, '').split(/\n(?=## )/).filter((x) => x.startsWith('## '));
  earlier = versions.slice(SHOWN_OPEN);
  const accepted = me.terms?.accepted;
  return `<div class="panel about">
      <h2>About ${esc(b.appName ?? 'FTR Credits')} ${esc(b.tagline ?? 'Command Center')}</h2>
      <p class="muted">Where every Sales Engineer works out the credits an account needs, keeps each projection report and what was shared with the customer, and where leaders see the whole picture across every team and region.</p>
      <dl class="about-facts">
        <div><dt>Version</dt><dd>${esc(me.versionLabel)} <span class="muted">(${esc(me.version)})</span>${can('system.update') ? ' · <a href="#/admin/updates">Versions and updates</a>' : ''}</dd></div>
        <div><dt>Licence</dt><dd>PolyForm Internal Use 1.0.0 · <button type="button" class="link" data-doc="license">read it</button></dd></div>
        <div><dt>Project</dt><dd><a href="https://github.com/cxsmtp/FTR-CC-Dashboard" target="_blank" rel="noopener noreferrer">github.com/cxsmtp/FTR-CC-Dashboard</a></dd></div>
        <div><dt>Terms accepted</dt><dd>${accepted ? `Version ${esc(me.terms.version)}${me.terms.at ? `, ${esc(dateTime(me.terms.at))}` : ''}` : 'Not yet'}</dd></div>
        <div><dt>Organisation</dt><dd>${esc(me.organisationName ?? '')}</dd></div>
      </dl>
      <p class="onprem-note"><b>On premise, your data stays yours.</b> The command center runs on your own server and sends your data to no one: it connects only to what you connect it to (customers’ Checkmarx One tenants with their keys, your email server, the git hosts an SE counts code from, and GitHub for its own updates). No telemetry, no analytics.</p>
      <div class="terms-card"><h3>Terms of use &amp; license</h3>
        <p class="muted small">An independent project, not a Checkmarx product, for internal business use under the PolyForm Internal Use License 1.0.0. Figures are supporting information worked out from data at a moment in time: Checkmarx’s own records are authoritative, and a projection is not a quote.</p>
        <div class="flex"><button type="button" class="primary" data-doc="terms">Read the terms of use &amp; license</button><button type="button" data-doc="guide">Read the user guide</button></div></div>
    </div>
    <div class="panel mt"><h2>What is new <small>the latest three versions; earlier ones ten at a time</small></h2>
      <div class="versions-log">${versions.slice(0, SHOWN_OPEN).map((v) => versionHtml(v, true)).join('')}${moreButton()}</div></div>`;
}
export async function viewAbout(params) {
  // Whoever sees Settings finds About there, with the other tabs.
  if (ADMIN_TABS.some(([, , p]) => p && can(p)) && !params?.get?.('doc')) return go('/admin/about');
  shell('', loading());
  $('#main').innerHTML = `<div class="head compact"><div class="ht"><h1 class="serif">About</h1></div></div>${await aboutHtml()}`;
  if (params?.get?.('doc')) openDoc(params.get('doc'));
}
