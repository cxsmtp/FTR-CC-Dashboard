import { $, api, esc, num, state, toast } from './core.js';
import { loading, shell } from './shell.js';

// ---- Vulnerability estimate (Admins only, internal) -------------------------------------------------------------
// Findings and triage & remediation credits for code that Checkmarx One has not scanned, from what this
// installation's own accounts show (server/estimate.js). Never in a report, never shown to anyone but Admins.
const SEVS = ['Critical', 'High', 'Medium', 'Low'];
const one = (n, d = 2) => (Number.isFinite(n) ? num(n, d) : '—');
const times = (r) => (r > 0 ? `×${num(Math.max(r, 1 / r), 1)} ${r >= 1 ? 'more' : 'fewer'}` : '—');

export async function viewEstimate() {
  if (state.me?.role?.id !== 'admin') {
    shell('estimate', '<div class="panel"><div class="empty"><b>The estimate is for Admins.</b></div></div>');
    return;
  }
  shell('estimate', loading());
  const d = await api('/api/estimate');
  const b = d.benchmark;
  const off = b.backtest.length ? `${num(b.within2)} of ${num(b.backtest.length)} accounts land within 2× of what the others predict, ${num(b.within3)} within 3×; the widest miss is ×${one(b.worst, 1)}.` : 'With fewer than 3 accounts there is nothing to test it against yet.';
  const verdict = !b.backtest.length ? '' : b.within3 / b.backtest.length >= 0.75 ? '<span class="chip ok"><i></i>Usable as a range</span>' : b.within3 / b.backtest.length >= 0.5 ? '<span class="chip warn"><i></i>Wide: quote the range, not a number</span>' : '<span class="chip bad"><i></i>Too scattered to rely on</span>';
  const testOf = new Map(b.backtest.map((x) => [x.id, x]));
  $('#main').innerHTML = `
    <div class="head compact"><div><h1 class="serif">Vulnerability estimate</h1><p class="acct-meta"><span class="chip warn"><i></i>Admins only</span><span>Internal: never in a report, never shown to anyone else.</span></p></div></div>
    <div class="callout">An estimate of the findings a first scan would report, for code that has only been counted (a cloc-fusion report, a git count). It comes from your own accounts: their lines of code against their open findings in Checkmarx One. Codebases of the same size differ widely, so it is a range, and it stands only until the code is scanned.</div>

    <div class="panel mt"><h2>What your accounts say ${verdict}</h2>
      <div class="ur-cards">
        <div class="ur-card"><small>Accounts it is drawn from</small><b>${num(b.accounts)}</b><span>${b.enough ? 'Enough to estimate from' : `${num(b.minAccounts)} are needed (with ${num(b.minLines)} lines or more and findings from Checkmarx One)`}</span></div>
        <div class="ur-card"><small>Findings per 1,000 lines</small><b>${one(b.density.typical)}</b><span>typical · ${one(b.density.low)} low · ${one(b.density.high)} high</span></div>
        <div class="ur-card"><small>New findings a month</small><b>${b.addedPct.typical === null ? '—' : `${one(b.addedPct.typical, 1)}%`}</b><span>of the backlog, typical${b.addedPct.low === null ? '' : ` · ${one(b.addedPct.low, 1)}% to ${one(b.addedPct.high, 1)}%`}</span></div>
      </div>
      <p class="muted small mt"><b>The test:</b> each account is predicted from the others (their typical findings per 1,000 lines, times its own lines) and compared with what it really has. ${esc(off)}</p>
      ${d.accounts.length ? `<div class="tw mt"><table><thead><tr><th>Account</th><th class="num">Lines of code</th><th class="num">Open findings</th><th class="num">Per 1,000 lines</th><th class="num">Predicted from the others</th><th>Really has</th></tr></thead><tbody>
        ${d.accounts.map((a) => { const t = testOf.get(a.id); const bad = t?.ratio > 0 && Math.max(t.ratio, 1 / t.ratio) > 3; return `<tr><td data-v="${esc(a.name)}"><b>${esc(a.name)}</b> <span class="muted small">${a.from === 'read' ? 'read' : 'from a report'}</span></td><td class="num" data-sort="${a.lines}">${num(a.lines)}</td><td class="num" data-sort="${a.total}">${num(a.total)}</td><td class="num" data-sort="${a.density}">${one(a.density)}</td><td class="num" data-sort="${t?.predicted ?? -1}">${t ? num(t.predicted) : '—'}</td><td data-sort="${t?.ratio ?? 0}"><span class="chip ${bad ? 'bad' : t ? 'ok' : ''}"><i></i>${t ? esc(times(t.ratio)) : '—'}</span></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty mt"><b>No account can be used yet.</b><span>An account counts once it has its projects’ lines of code and its backlog from Checkmarx One.</span></div>'}
    </div>

    <div class="panel mt"><h2>Estimate for code not scanned yet</h2>
      <form class="form" id="est" data-nodraft>
        <div class="row">
          <label class="f">An account with counted code<select name="accountId"><option value="">Type the lines of code instead</option>${d.counted.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${num(c.lines)} lines in ${num(c.repositories)} repositories${c.scanned ? ' (also scanned)' : ''}</option>`).join('')}</select></label>
          <label class="f">Lines of code<input name="lines" type="number" min="1000" step="1000" placeholder="For example 2,500,000" /></label>
          <label class="f">Over how many months<input name="months" type="number" min="1" max="60" value="12" /></label>
          <label class="f">Has the customer used a SAST tool before?<select name="prior"><option value="yes">Yes: quote the typical figure</option><option value="no">No: quote the high figure (an untouched codebase)</option></select></label>
        </div>
        <label class="check"><input type="checkbox" name="includeNew" checked /> Count the findings still to come over those months, at your accounts’ typical pace</label>
        <details class="mt"><summary>Use your own findings per 1,000 lines instead</summary>
          <p class="muted small">For a customer your accounts do not resemble, or while they are too few. Leave a severity empty to keep your accounts’ figure.</p>
          <div class="row">${SEVS.map((s) => `<label class="f">${s}<input name="d-${s}" type="number" min="0" step="0.01" placeholder="${one(b.densityBySeverity[s].typical)}" /></label>`).join('')}</div>
        </details>
        <div class="actions"><button class="primary" type="submit">Estimate</button><span class="err" id="est-err"></span></div>
      </form>
      <div id="est-out"></div>
    </div>`;

  const form = $('#est');
  form.accountId.onchange = () => {
    const c = d.counted.find((x) => x.id === form.accountId.value);
    form.lines.value = c ? c.lines : '';
    form.lines.disabled = Boolean(c);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    $('#est-err').textContent = '';
    const f = new FormData(form);
    const byHand = Object.fromEntries(SEVS.map((s) => [s, f.get(`d-${s}`)]).filter(([, v]) => v !== '' && v !== null));
    const density = Object.keys(byHand).length ? Object.fromEntries(SEVS.map((s) => [s, byHand[s] ?? b.densityBySeverity[s].typical ?? 0])) : null;
    const body = { months: Number(f.get('months')) || 12, includeNew: f.get('includeNew') === 'on', ...(form.accountId.value ? { accountId: form.accountId.value } : { lines: Number(form.lines.value) }), ...(density ? { density } : {}) };
    let r;
    try {
      r = await api('/api/estimate', { method: 'POST', body });
    } catch (error) {
      $('#est-err').textContent = error.message;
      return;
    }
    const quote = f.get('prior') === 'no' ? 'high' : 'typical';
    const row = (level, label) => {
      const x = r[level];
      return `<tr class="${level === quote ? 'strong' : ''}"><td>${label}${level === quote ? ' <span class="chip ok"><i></i>to quote</span>' : ''}</td>${SEVS.map((s) => `<td class="num">${num(x.open[s])}</td>`).join('')}<td class="num"><b>${num(x.total)}</b></td><td class="num">${r.includeNew ? num(x.newMonthly) : '—'}</td><td class="num"><b>${num(x.credits)}</b></td></tr>`;
    };
    $('#est-out').innerHTML = `<div class="callout warn mt"><b>An estimate, not a scan.</b> ${esc(r.account ? `${r.account.name}: ` : '')}${num(r.lines)} lines of code over ${num(r.months)} months${r.byHand ? ', at your own findings per 1,000 lines' : `, from ${num(r.accounts)} accounts`}. Quote the range; the first scan replaces it.</div>
      <div class="tw mt"><table><thead><tr><th>Estimate</th>${SEVS.map((s) => `<th class="num">${s}</th>`).join('')}<th class="num">Open findings</th><th class="num">New a month</th><th class="num">T&amp;R credits</th></tr></thead><tbody>${r.byHand ? row('typical', 'At your figures') : `${row('low', 'Low')}${row('typical', 'Typical')}${row('high', 'High')}`}</tbody></table></div>
      <p class="muted small mt">Credits: every finding triaged and the true ones remediated, at the triage and remediation credits set under Engines &amp; rates${r.includeNew ? ', with the findings still to come' : ''}. Fusion is not in it.${r.newLeftOut ? ' The findings still to come are left out: their pace comes from your accounts, and there are too few yet.' : ''}</p>`;
    toast('Estimated.', 'ok');
  };
}
