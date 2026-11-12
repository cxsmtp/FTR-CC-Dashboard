import { $$, can, esc, go, state } from './core.js';
import { shell } from './shell.js';
// ---- Quick guides: one per persona, six steps each, animated; people open their own and the ones below them -------
export const GUIDE_ART = {
  calc: '<rect x="14" y="8" width="36" height="48" rx="6"/><rect x="20" y="14" width="24" height="10" rx="2"/><path d="M21 32h4M30 32h4M39 32h4M21 40h4M30 40h4M39 40h4M21 48h4M30 48h13"/>',
  link: '<rect x="8" y="12" width="48" height="40" rx="6"/><path d="M8 22h48"/><circle cx="14" cy="17" r="1.5"/><circle cx="19" cy="17" r="1.5"/><path d="M27 38l-3 3a5 5 0 0 1-7-7l3-3M37 32l3-3a5 5 0 0 0-7-7l-3 3M28 36l8-8"/>',
  data: '<ellipse cx="32" cy="14" rx="18" ry="6"/><path d="M14 14v12c0 3.3 8 6 18 6s18-2.7 18-6V14M14 26v12c0 3.3 8 6 18 6s18-2.7 18-6V26"/><path d="M42 50l6 6 10-12"/>',
  report: '<path d="M18 6h20l12 12v38a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M38 6v12h12"/><path d="M24 46V38M31 46V30M38 46V34M45 46V26"/>',
  star: '<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z"/>',
  coins: '<ellipse cx="24" cy="18" rx="14" ry="6"/><path d="M10 18v10c0 3.3 6.3 6 14 6s14-2.7 14-6V18"/><ellipse cx="40" cy="38" rx="14" ry="6"/><path d="M26 38v10c0 3.3 6.3 6 14 6s14-2.7 14-6V38"/>',
  overview: '<rect x="8" y="8" width="20" height="24" rx="3"/><rect x="36" y="8" width="20" height="14" rx="3"/><rect x="36" y="30" width="20" height="26" rx="3"/><rect x="8" y="40" width="20" height="16" rx="3"/>',
  tree: '<circle cx="32" cy="12" r="6"/><circle cx="14" cy="50" r="6"/><circle cx="32" cy="50" r="6"/><circle cx="50" cy="50" r="6"/><path d="M32 18v14M14 44v-6h36v6M32 32v12"/>',
  flag: '<path d="M14 58V8M14 10h32l-6 10 6 10H14"/><circle cx="46" cy="48" r="8"/><path d="M46 44v5M46 52h0"/>',
  people: '<circle cx="24" cy="22" r="8"/><path d="M8 54c2-10 8-15 16-15s14 5 16 15"/><circle cx="44" cy="24" r="6"/><path d="M42 38c7 0 12 5 14 14"/>',
  chart: '<path d="M8 56h48M8 56V8"/><path d="M14 46l12-12 9 7 17-21"/><path d="M44 20h8v8"/>',
  sheet: '<rect x="10" y="8" width="44" height="48" rx="5"/><path d="M10 20h44M10 32h44M10 44h44M26 8v48"/><path d="M38 50l4 4 8-9"/>',
  key: '<circle cx="22" cy="40" r="10"/><path d="M29 33l21-21M44 18l6 6M38 24l5 5"/>',
  shield: '<path d="M32 6l20 8v16c0 13-8.5 22-20 28C20.5 52 12 43 12 30V14z"/><path d="M24 32l6 6 11-12"/>',
  refresh: '<path d="M50 22A20 20 0 0 0 14 24M14 42a20 20 0 0 0 36-2"/><path d="M50 10v12H38M14 54V42h12"/>',
  audit: '<rect x="14" y="10" width="36" height="46" rx="5"/><rect x="24" y="6" width="16" height="8" rx="2"/><path d="M22 26h20M22 34h20M22 42h12"/><circle cx="46" cy="48" r="7"/><path d="M51 53l5 5"/>',
};
export const GUIDES = {
  se: {
    name: 'Sales Engineer',
    tagline: 'From a customer’s name to a projection they can trust, in six steps.',
    steps: [
      ['calc', 'Open the Calculator', 'Pick your team (region) at the top. An account is yours, and the Admins’, while you work on it; your team sees it once you generate its first report.', '/calculator', 'Open the calculator'],
      ['link', 'Name it as in Salesforce', 'Type the customer’s name as Salesforce has it, paste the opportunity or account link, and press Enter: an account needs both. It is kept once you bring in its data.', '/calculator', 'Start an account'],
      ['data', 'Bring in the data', 'A Checkmarx One customer: paste their API key and Connect; tick Remember to refresh in one click later. A read takes every project of the tenant, up to 1,000,000. A prospect: their cloc-fusion report, or their git token. You can leave while it reads.', '/calculator', 'Connect'],
      ['report', 'Generate the report', 'Check the credits, then Generate projection report: the HTML for the customer and the PDF summary to present. Make as many as you need.', '/calculator', 'Generate'],
      ['star', 'Mark primary and shared', 'On the account page, star the report that stands for the account (else the latest counts) and mark the ones you sent to the customer.', '/accounts', 'Your accounts'],
      ['coins', 'Record credits sold', 'Each sale against the account, one or many. The dashboards then show sold so far and what is still needed.', '/accounts', 'Record a sale'],
    ],
  },
  leader: {
    name: 'Leader',
    tagline: 'Your teams at a glance, and where to step in.',
    steps: [
      ['overview', 'See your whole picture', 'Overview rolls up every team below you: the credits projected from each primary report, credits sold and still needed.', '/overview', 'Overview'],
      ['tree', 'Dive into teams and people', 'Click a team in the tree, or an SE, to see their accounts and reports. All my teams ▾ narrows everything to one team.', '/overview', 'Your teams'],
      ['flag', 'Spot what needs attention', 'Accounts filters: missing Salesforce link, no report yet, not shared with the customer, no primary marked.', '/accounts', 'Accounts'],
      ['coins', 'Projection against sales', 'Each account shows what was projected, sold and still needed. Export the accounts or reports as CSV for a forecast call.', '/accounts', 'Credits sold'],
      ['people', 'Look after your people', 'Add people or import a whole region from a sheet, reset a password, unlock, or sign someone out everywhere.', '/people', 'People'],
      ['calc', 'Work alongside your SEs', 'You can open any account of your teams in the calculator once its SE has generated a first report, refresh it from Checkmarx One, and generate a projection yourself.', '/calculator', 'Calculator'],
    ],
  },
  admin: {
    name: 'Admin',
    tagline: 'Set the command center up once; it looks after itself.',
    steps: [
      ['tree', 'Build the team tree', 'Teams: from the top down (Global › EMEA › …), with each team’s region and leaders. Leaders see every team below theirs.', '/teams', 'Teams'],
      ['sheet', 'Bring everyone in', 'People → Import: one sheet with names, emails, roles and teams. You get an Excel sheet of temporary passwords. Or turn on single sign-on.', '/people', 'Import people'],
      ['key', 'Roles and their names', 'Roles & permissions: rename any role, tick what each may do, or make new ones. The Admin-only settings stay with Admins.', '/people/roles', 'Roles'],
      ['shield', 'Email, sign-on and HTTPS', 'Settings: the email server for password resets, SAML single sign-on, and HTTPS with your certificate or Let’s Encrypt.', '/admin', 'Settings'],
      ['refresh', 'Updates and backups', 'New versions are found every 15 minutes, checked against their checksums and switched to without a restart. Backups run nightly and before every switch.', '/admin/updates', 'Updates'],
      ['audit', 'Every action, on record', 'The audit log keeps every action and everything refused, chained so a changed entry is found. Filter it, check it, export it.', '/audit', 'Audit log'],
    ],
  },
};
/** What the calculator cannot do, said where it matters: shown under the steps of the guides that use it. */
export const LIMITS = [
  'A Checkmarx One read takes every project of the tenant, up to 1,000,000 (Projects to read, in Projection settings, sets fewer). A very large tenant takes longer: you can leave while it reads.',
  'An account keeps up to 32 MB of data, roughly 100,000 projects. A tenant bigger than that cannot be saved whole: read fewer projects, or narrow the projects at the top of Projection settings.',
  'A key connects to one account: reading another customer needs that customer’s own key.',
  'An uploaded report brings its backlog month by month, not week by week: read Checkmarx One again for the weekly detail.',
];
export const GUIDE_ORDER = ['se', 'leader', 'admin'];
/** Whose guide this is: Admins, then those who lead or oversee (and sales, who do not use the calculator), then SEs. */
export function personaOf(me = state.me) {
  if (me.role?.id === 'admin' || can('settings.manage')) return 'admin';
  if ((me.leads?.length ?? 0) > 0 || can('scope.all') || can('users.manage') || !can('calculator.use')) return 'leader';
  return 'se';
}
/** Theirs and every guide below it. */
export const guidesFor = (persona) => GUIDE_ORDER.slice(0, GUIDE_ORDER.indexOf(persona) + 1).reverse();
export function guideHtml(persona, { first = false, tabs = [] } = {}) {
  const g = GUIDES[persona];
  const art = (k) => `<svg viewBox="0 0 64 64" aria-hidden="true">${GUIDE_ART[k] ?? ''}</svg>`;
  return `<div class="gx" data-persona="${persona}">
    <div class="gx-hero">
      <div class="gx-orbit" aria-hidden="true"><i></i><i></i><i></i><span>${art(g.steps[0][0])}</span></div>
      <div class="gx-intro"><span class="chip star">${first ? 'Welcome · step 3 of 3' : 'Quick guide'}</span><h1 class="serif">${first ? `Welcome, ${esc(state.me.user.name.split(' ')[0])}` : `The ${esc(g.name)} guide`}</h1>
      <p>${esc(g.tagline)}</p><p class="muted small">${esc(state.me.role.name)} · ${esc(state.me.team?.path ?? 'no team yet')}</p></div>
    </div>
    ${tabs.length > 1 ? `<div class="gx-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" data-guide="${t}" aria-selected="${t === persona}" class="${t === persona ? 'on' : ''}">${esc(GUIDES[t].name)}${t === personaOf() ? ' <small>yours</small>' : ''}</button>`).join('')}</div>` : ''}
    <ol class="gx-steps">${g.steps.map(([k, t, p, href, cta], i) => `<li class="gx-step" data-css="--i:${i}"><div class="gx-art">${art(k)}<b class="gx-n">${i + 1}</b></div><h3>${esc(t)}</h3><p>${esc(p)}</p>${first ? '' : `<a class="gx-go" href="${href.startsWith('/calculator') ? href : `#${href}`}">${esc(cta)} →</a>`}</li>`).join('')}</ol>
    ${persona === 'admin' ? '' : `<div class="panel mt gx-limits"><h2>Limits to know</h2><ul>${LIMITS.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`}
    <div class="callout mt">Figures are supporting information worked out from the customer’s data at a moment in time; Checkmarx’s own records are authoritative. Paste a customer’s key only into the Calculator, and use read-only git tokens.</div>
  </div>`;
}
export function viewGuide(params) {
  const mine = personaOf();
  const tabs = guidesFor(mine);
  const want = params?.get?.('for');
  const persona = tabs.includes(want) ? want : mine;
  shell('guide', `<div class="head"><div></div><div class="tools"><button type="button" data-doc="guide">Full user guide</button><button type="button" class="ghost" data-doc="terms">Terms &amp; license</button></div></div><div class="panel gx-panel">${guideHtml(persona, { tabs })}</div>`);
  for (const b of $$('[data-guide]')) b.onclick = () => go(`/guide?for=${b.dataset.guide}`);
}
