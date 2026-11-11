import { $, can, dateTime, esc, go, state } from './core.js';
import { openDoc } from './profile.js';
import { ADMIN_TABS } from './settings.js';
import { loading, shell } from './shell.js';
// ---- About: the version, what is new, the licence ------------------------------------------------------------------
/** Markdown from this repository's own files (CHANGELOG.md), as safe HTML: headings, lists, bold and code only. */
export function md(text) {
  const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = false;
  for (const line of String(text).split('\n')) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!li && list) (out.push('</ul>'), (list = false));
    if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    else if (li) (list || (out.push('<ul>'), (list = true)), out.push(`<li>${inline(li[1])}</li>`));
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}
/** About: one panel of facts and the terms card, then every version. */
export async function aboutHtml() {
  const me = state.me;
  const b = state.branding ?? {};
  const log = await fetch('/legal/changelog').then((r) => r.text()).catch(() => '');
  const versions = log.replace(/^# .*\n/, '').split(/\n(?=## )/).filter((x) => x.startsWith('## '));
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
    <div class="panel mt"><h2>What is new <small>every version, newest first</small></h2>
      <div class="versions-log">${versions.map((v, i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(v.split('\n')[0].replace(/^## /, ''))}</summary><div class="md">${md(v.split('\n').slice(1).join('\n'))}</div></details>`).join('')}</div></div>`;
}
export async function viewAbout(params) {
  // Whoever sees Settings finds About there, with the other tabs.
  if (ADMIN_TABS.some(([, , p]) => p && can(p)) && !params?.get?.('doc')) return go('/admin/about');
  shell('', loading());
  $('#main').innerHTML = `<div class="head compact"><div class="ht"><h1 class="serif">About</h1></div></div>${await aboutHtml()}`;
  if (params?.get?.('doc')) openDoc(params.get('doc'));
}
