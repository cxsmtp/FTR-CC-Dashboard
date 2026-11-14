import { $, $$, api, dateTime, esc, num, once, state, toast } from './core.js';
import { loading, shell } from './shell.js';
import { stuckHtml } from './auth.js';

// ---- Vulnerability estimate (the Admins' board) ------------------------------------------------------------------
// Findings and triage & remediation credits for code that Checkmarx One has not scanned, from what this
// installation's own accounts show (server/estimate.js). The Admin sees what the accounts say, sets each account's
// industry, freezes the figures or works them out again, types a standard for an industry, and decides whether SEs
// get the estimate in the calculator and in reports (both beta, both off until turned on).
const SEVS = ['Critical', 'High', 'Medium', 'Low'];
const one = (n, d = 2) => (Number.isFinite(n) ? num(n, d) : '—');
const times = (r) => (r > 0 ? `×${num(Math.max(r, 1 / r), 1)} ${r >= 1 ? 'more' : 'fewer'}` : '—');

export async function viewEstimate() {
  if (state.me?.role?.id !== 'admin') {
    shell('estimate', stuckHtml('The vulnerability estimate is for Admins.'));
    return;
  }
  if (!$('#est')) shell('estimate', loading());
  const d = await api('/api/estimate');
  const b = d.benchmark;
  const fz = d.frozen;
  const off = b.backtest.length ? `${num(b.within2)} of ${num(b.backtest.length)} accounts land within 2× of what the others predict, ${num(b.within3)} within 3×; the widest miss is ×${one(b.worst, 1)}.` : 'With fewer than 3 accounts there is nothing to test it against yet.';
  const verdict = !b.backtest.length ? '' : b.within3 / b.backtest.length >= 0.75 ? '<span class="chip ok"><i></i>Usable as a range</span>' : b.within3 / b.backtest.length >= 0.5 ? '<span class="chip warn"><i></i>Wide: quote the range, not a number</span>' : '<span class="chip bad"><i></i>Too scattered to rely on</span>';
  const testOf = new Map(b.backtest.map((x) => [x.id, x]));
  const industryPick = (value, attrs = '') => `<select ${attrs}><option value="">Not set</option>${d.industries.map((n) => `<option${n === value ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const inUse = fz ? fz.all : b;
  $('#main').innerHTML = `
    <div class="head compact"><div><h1 class="serif">Vulnerability estimate</h1><p class="acct-meta"><span class="chip warn"><i></i>Admins’ board</span><span>What a first scan is likely to report, for code that has only been counted.</span></p></div></div>
    <div class="callout">It comes from your own accounts: their lines of code against their open findings in Checkmarx One. Lines of code set the backlog; how much of the code is still being changed (its commits) sets the findings still to come; the developers are shown beside it. Codebases of one size differ widely, so it is a range, and it stands only until the code is scanned.</div>

    <div class="panel mt"><h2>The figures in use ${fz ? '<span class="chip ok"><i></i>Frozen</span>' : '<span class="chip"><i></i>Following the accounts</span>'}</h2>
      <div class="ur-cards">
        <div class="ur-card"><small>Findings per 1,000 lines</small><b>${one(inUse.density.typical)}</b><span>typical · ${one(inUse.density.low)} low · ${one(inUse.density.high)} high</span></div>
        <div class="ur-card"><small>New findings a month</small><b>${inUse.addedPct.typical === null ? '—' : `${one(inUse.addedPct.typical, 1)}%`}</b><span>of the backlog, on the code that still changes</span></div>
        <div class="ur-card"><small>${fz ? 'Frozen' : 'Drawn from'}</small><b>${num(inUse.accounts)} accounts</b><span>${fz ? `${esc(dateTime(fz.at))} by ${esc(fz.by)}` : b.enough ? 'They change as accounts are read' : `${num(b.minAccounts)} are needed to estimate from`}</span></div>
      </div>
      <p class="muted small mt">${fz ? `Every estimate uses these figures until you work them out again. Your accounts today say ${one(b.density.typical)} per 1,000 lines (${num(b.accounts)} accounts).` : 'Freeze them to quote from one set of figures: a new account then changes nothing until you work them out again.'}</p>
      <div class="actions"><button type="button" class="primary sm" id="est-freeze" ${b.enough ? '' : 'disabled'}>${fz ? 'Work out again from the accounts, and freeze' : 'Freeze these figures'}</button>${fz ? '<button type="button" class="sm" id="est-unfreeze">Follow the accounts again</button>' : ''}</div>
    </div>

    <div class="panel mt"><h2>Where SEs see it <span class="chip star">beta</span></h2>
      <form id="est-beta" data-nodraft>
        <label class="check"><input type="checkbox" name="calculator" ${d.beta.calculator ? 'checked' : ''} /> In the calculator, for an account whose code was only counted (Fusion only): the SE picks the customer’s industry and sees the estimate from all accounts beside the industry’s standard</label>
        <label class="check"><input type="checkbox" name="report" ${d.beta.report ? 'checked' : ''} ${d.beta.calculator ? '' : 'disabled'} /> In the report of such an account, when its SE ticks it: a section of its own, marked as an estimate, never part of the credits required</label>
      </form>
    </div>

    <div class="panel mt"><h2>What your accounts say ${verdict}</h2>
      <p class="muted small"><b>The test:</b> each account is predicted from the others (their typical findings per 1,000 lines, times its own lines) and compared with what it really has. ${esc(off)}</p>
      ${d.accounts.length ? `<div class="tw mt"><table><thead><tr><th>Account</th><th>Industry</th><th class="num">Lines of code</th><th class="num">Open findings</th><th class="num">Per 1,000 lines</th><th class="num">Predicted from the others</th><th>Really has</th></tr></thead><tbody>
        ${d.accounts.map((a) => { const t = testOf.get(a.id); const bad = t?.ratio > 0 && Math.max(t.ratio, 1 / t.ratio) > 3; return `<tr><td data-v="${esc(a.name)}"><b>${esc(a.name)}</b> <span class="muted small">${a.from === 'read' ? 'read' : 'from a report'}</span></td><td data-v="${esc(a.industry || 'Not set')}">${industryPick(a.industry, `data-industry="${esc(a.id)}" aria-label="Industry of ${esc(a.name)}"`)}</td><td class="num" data-sort="${a.lines}">${num(a.lines)}</td><td class="num" data-sort="${a.total}">${num(a.total)}</td><td class="num" data-sort="${a.density}">${one(a.density)}</td><td class="num" data-sort="${t?.predicted ?? -1}">${t ? num(t.predicted) : '—'}</td><td data-sort="${t?.ratio ?? 0}"><span class="chip ${bad ? 'bad' : t ? 'ok' : ''}"><i></i>${t ? esc(times(t.ratio)) : '—'}</span></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty mt"><b>No account can be used yet.</b><span>An account counts once it has its projects’ lines of code and its backlog from Checkmarx One.</span></div>'}
    </div>

    <div class="panel mt"><h2>Industry standards</h2>
      <p class="muted small">An industry’s own figures count from ${num(d.minIndustry)} of its accounts. Until then, or to use a figure of your own, type its findings per 1,000 lines: what you type is used first. Empty: none.</p>
      <div class="tw mt"><table><thead><tr><th>Industry</th><th class="num">Its accounts</th><th class="num">Their typical per 1,000 lines</th><th>In use</th>${SEVS.map((s) => `<th class="num">${s}</th>`).join('')}</tr></thead><tbody>
        ${d.byIndustry.map((x) => `<tr data-std="${esc(x.name)}"><td><b>${esc(x.name)}</b></td><td class="num" data-sort="${x.accounts}">${num(x.accounts)}</td><td class="num" data-sort="${x.density?.typical ?? -1}">${x.density ? one(x.density.typical) : '—'}</td><td>${x.typed ? '<span class="chip ok"><i></i>Your standard</span>' : x.enough ? '<span class="chip ok"><i></i>Its accounts</span>' : '<span class="chip"><i></i>None yet</span>'}</td>${SEVS.map((s) => `<td class="num"><input type="number" min="0" step="0.01" class="est-std" data-sev="${s}" value="${x.typed ? esc(x.typed[s]) : ''}" placeholder="${x.densityBySeverity ? one(x.densityBySeverity[s].typical) : '—'}" aria-label="${s} per 1,000 lines, ${esc(x.name)}" /></td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
    </div>

    <div class="panel mt"><h2>Estimate for code not scanned yet</h2>
      <form class="form" id="est" data-nodraft>
        <div class="row">
          <label class="f">An account with counted code<select name="accountId"><option value="">Type the lines of code instead</option>${d.counted.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${num(c.lines)} lines in ${num(c.repositories)} repositories${c.scanned ? ' (also scanned)' : ''}</option>`).join('')}</select></label>
          <label class="f">Lines of code<input name="lines" type="number" min="1000" step="1000" placeholder="For example 2,500,000" /></label>
          <label class="f">Industry${industryPick('', 'name="industry"')}</label>
          <label class="f">Over how many months<input name="months" type="number" min="1" max="60" value="12" /></label>
          <label class="f">Used a SAST tool before?<select name="prior"><option value="yes">Yes: quote the typical figure</option><option value="no">No: quote the high figure</option></select></label>
        </div>
        <label class="check"><input type="checkbox" name="includeNew" checked /> Count the findings still to come over those months, on the code that is still being changed</label>
        <details class="mt"><summary>Use findings per 1,000 lines of your own for this one estimate</summary>
          <p class="muted small">For a customer neither your accounts nor an industry resemble. Leave a severity empty to keep your accounts’ figure.</p>
          <div class="row">${SEVS.map((s) => `<label class="f">${s}<input name="d-${s}" type="number" min="0" step="0.01" placeholder="${one(inUse.densityBySeverity[s].typical)}" /></label>`).join('')}</div>
        </details>
        <div class="actions"><button class="primary" type="submit">Estimate</button><span class="err" id="est-err"></span></div>
      </form>
      <div id="est-out"></div>
    </div>`;

  const put = once(async (body, said) => {
    try {
      await api('/api/estimate/settings', { method: 'PUT', body });
      toast(said, 'ok');
    } catch (error) {
      toast(error.message, 'bad', 9000);
    }
    await viewEstimate();
  });
  $('#est-freeze').onclick = () => put({ freeze: true }, 'Frozen: every estimate uses these figures until you work them out again.');
  if ($('#est-unfreeze')) $('#est-unfreeze').onclick = () => put({ freeze: false }, 'The figures follow the accounts again.');
  $('#est-beta').onchange = (e) => put({ beta: { [e.target.name]: e.target.checked } }, 'Saved.');
  for (const sel of $$('[data-industry]')) sel.onchange = once(async () => {
    try {
      await api(`/api/cc/accounts/${encodeURIComponent(sel.dataset.industry)}`, { method: 'PUT', body: { industry: sel.value } });
      toast(sel.value ? `Industry: ${sel.value}.` : 'Industry cleared.', 'ok');
    } catch (error) {
      toast(error.message, 'bad', 9000);
    }
    await viewEstimate();
  });
  for (const input of $$('.est-std')) input.onchange = () => {
    const row = input.closest('tr');
    const values = Object.fromEntries([...row.querySelectorAll('.est-std')].map((i) => [i.dataset.sev, i.value]));
    // Saved as it is typed, without drawing the page again under the next box (the row says what is in use).
    api('/api/estimate/settings', { method: 'PUT', body: { standards: { [row.dataset.std]: values } } }).then(
      () => {
        const typed = Object.values(values).some((v) => Number(v) > 0);
        const cell = row.children[3];
        if (cell) cell.innerHTML = typed ? '<span class="chip ok"><i></i>Your standard</span>' : '<span class="chip"><i></i>Saved: none typed</span>';
        toast(`Standard for ${row.dataset.std} saved.`, 'ok');
      },
      (error) => toast(error.message, 'bad', 9000),
    );
  };

  const form = $('#est');
  form.accountId.onchange = () => {
    const c = d.counted.find((x) => x.id === form.accountId.value);
    form.lines.value = c ? c.lines : '';
    form.lines.disabled = Boolean(c);
    if (c?.industry) form.industry.value = c.industry;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    $('#est-err').textContent = '';
    const f = new FormData(form);
    const byHand = Object.fromEntries(SEVS.map((s) => [s, f.get(`d-${s}`)]).filter(([, v]) => v !== '' && v !== null));
    const density = Object.keys(byHand).length ? Object.fromEntries(SEVS.map((s) => [s, byHand[s] ?? inUse.densityBySeverity[s].typical ?? 0])) : null;
    const body = { months: Number(f.get('months')) || 12, includeNew: f.get('includeNew') === 'on', industry: form.industry.value, ...(form.accountId.value ? { accountId: form.accountId.value } : { lines: Number(form.lines.value) }), ...(density ? { density } : {}) };
    let r;
    try {
      r = await api('/api/estimate', { method: 'POST', body });
    } catch (error) {
      $('#est-err').textContent = error.message;
      return;
    }
    $('#est-out').innerHTML = estimateTables(r, f.get('prior') === 'no' ? 'high' : 'typical');
    toast('Estimated.', 'ok');
  };
}

/** The estimates of one run, each as a table of low, typical and high (the line to quote marked). */
function estimateTables(r, quote) {
  const table = (title, e, { single = false } = {}) => {
    if (!e) return '';
    const row = (level, label) => {
      const x = e[level];
      return `<tr class="${level === quote ? 'strong' : ''}"><td>${label}${level === quote ? ' <span class="chip ok"><i></i>to quote</span>' : ''}</td>${SEVS.map((s) => `<td class="num">${num(x.open[s])}</td>`).join('')}<td class="num"><b>${num(x.total)}</b></td><td class="num">${e.includeNew ? num(x.newMonthly) : '—'}</td><td class="num"><b>${num(x.credits)}</b></td></tr>`;
    };
    return `<h3 class="mt">${title}</h3><div class="tw"><table><thead><tr><th>Estimate</th>${SEVS.map((s) => `<th class="num">${s}</th>`).join('')}<th class="num">Open findings</th><th class="num">New a month</th><th class="num">T&amp;R credits</th></tr></thead><tbody>${single ? row('typical', 'At these figures') : `${row('low', 'Low')}${row('typical', 'Typical')}${row('high', 'High')}`}</tbody></table></div>`;
  };
  const code = r.code ? ` ${num(r.code.repositories)} repositories, ${num(r.code.commits)} commits a year, ${num(r.code.developers)} developers in the last 90 days${r.code.activeShare === null ? '' : `; ${num(r.code.activeShare * 100)}% of the code is still being changed, and the findings still to come are counted on that part`}.` : '';
  return `<div class="callout warn mt"><b>An estimate, not a scan.</b> ${esc(r.account ? `${r.account.name}: ` : '')}${num(r.lines)} lines of code over ${num(r.months)} months.${esc(code)}${r.frozenAt ? ` Figures frozen ${esc(dateTime(r.frozenAt))}.` : ''} The first scan replaces it.</div>
    ${table(`From all your accounts <small>${r.own ? `${num(r.own.accounts)} accounts` : ''}</small>`, r.own)}
    ${r.own ? '' : `<p class="muted small mt">From all your accounts: not yet (${num(r.have)} of the ${num(r.needed)} accounts needed).</p>`}
    ${table(`Industry standard: ${esc(r.industry)} <small>${r.standard?.source === 'typed' ? 'the standard you typed' : r.standard ? `${num(r.standard.accounts)} accounts of this industry` : ''}</small>`, r.standard, { single: r.standard?.source === 'typed' })}
    ${r.industry && !r.standard ? `<p class="muted small mt">Industry standard for ${esc(r.industry)}: none yet (too few of its accounts, and no standard typed above).</p>` : ''}
    ${table('At the figures you typed for this estimate', r.typed, { single: true })}
    <p class="muted small mt">Credits: every finding triaged and the true ones remediated, at the triage and remediation credits set under Engines &amp; rates. Fusion is not in it.</p>`;
}
