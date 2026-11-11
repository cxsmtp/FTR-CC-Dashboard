import { $, $$, ago, api, esc, state, toast } from './core.js';
import { loading, shell } from './shell.js';
// ---- Get help: one form. What is sent goes by email to the support address (Settings → Get help), which answers by
// email; what each person sent is listed below the form.
export const HELP_KIND = { case: 'Support case', enhancement: 'Enhancement' };
export async function viewHelp(view) {
  shell('help', loading());
  let d;
  try {
    d = await api('/api/support');
  } catch (error) {
    $('#main').innerHTML = `<div class="panel"><div class="empty"><b>${esc(error.message)}</b></div></div>`;
    return;
  }
  const kind = view === 'enhancement' ? 'enhancement' : 'case';
  const open = /^(SUP|ENH)-\d+$/i.test(view) ? view.toUpperCase() : '';
  $('#main').innerHTML = `
    <div class="head compact"><div class="ht"><h1 class="serif">Get help</h1><span class="crumbs">emailed to ${esc(state.me.support?.email ?? 'the support address')} · answered by email</span></div></div>
    <div class="panel help-form"><form id="hf" class="form" autocomplete="off">
      <div class="seg" id="hkind" role="radiogroup" aria-label="What is it?"><button type="button" role="radio" data-k="case" class="${kind === 'case' ? 'primary' : ''}">Something is not working</button><button type="button" role="radio" data-k="enhancement" class="${kind === 'enhancement' ? 'primary' : ''}">I would like something added or changed</button></div>
      <label class="f">In a few words<input name="subject" maxlength="200" required placeholder="${kind === 'case' ? 'The report stops at 40%' : 'A column for the renewal date'}" /></label>
      <label class="f">The details<textarea name="text" rows="6" maxlength="10000" required placeholder="What happened, what you expected, and the steps to see it"></textarea></label>
      <div class="flex"><label class="f" id="hprio-l">How urgent<select name="priority"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="urgent">Urgent: I cannot work</option></select></label>
        <span class="spacer"></span><span class="muted small" id="hsay" aria-live="polite"></span><button class="primary" type="submit">Send</button></div>
    </form></div>
    <div class="panel mt"><h2>${d.team ? 'Sent by everyone' : 'What you sent'} <small>${d.requests.length ? 'the latest first; click one to read it' : 'nothing yet'}</small></h2>
      ${d.requests.length ? `<div class="tw"><table><thead><tr><th>Number</th><th>Type</th><th>In a few words</th>${d.team ? '<th>From</th>' : ''}<th>Sent</th></tr></thead><tbody id="hrows">${d.requests.map((r) => `<tr class="click" data-id="${esc(r.id)}"><td class="mono">${esc(r.id)}</td><td>${esc(HELP_KIND[r.kind] ?? r.kind)}</td><td><b>${esc(r.subject)}</b></td>${d.team ? `<td>${esc(r.requester.name || r.requester.email)}</td>` : ''}<td data-sort="${esc(r.createdAt)}">${esc(ago(r.createdAt))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Requests you send are listed here.</div>'}
    </div>`;
  let chosen = kind;
  const form = $('#hf');
  const setKind = (k) => {
    chosen = k;
    for (const b of $$('#hkind [data-k]')) {
      b.classList.toggle('primary', b.dataset.k === k);
      b.setAttribute('aria-checked', String(b.dataset.k === k));
    }
    $('#hprio-l').hidden = k !== 'case';
  };
  setKind(kind);
  for (const b of $$('#hkind [data-k]')) b.onclick = () => setKind(b.dataset.k);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const send = form.querySelector('button[type=submit]');
    send.disabled = true;
    $('#hsay').textContent = 'Sending…';
    try {
      const r = await api('/api/support', { method: 'POST', body: { kind: chosen, subject: form.elements.subject.value, text: form.elements.text.value, priority: form.elements.priority.value, page: document.referrer ? '' : location.hash } });
      toast(r.emailed?.error ? `${r.request.id} is kept, but the email did not go: ${r.emailed.error}` : `${r.request.id} sent. The answer comes by email.`, r.emailed?.error ? 'bad' : 'ok');
      await viewHelp(r.request.id);
    } catch (error) {
      $('#hsay').textContent = error.message;
      send.disabled = false;
    }
  };
  // One sent before, opened in place: its own words.
  const show = async (row) => {
    const next = row.nextElementSibling;
    if (next?.classList.contains('help-detail')) return next.remove();
    for (const x of $$('#hrows .help-detail')) x.remove();
    try {
      const { request } = await api(`/api/support/${encodeURIComponent(row.dataset.id)}`);
      const tr = document.createElement('tr');
      tr.className = 'help-detail';
      tr.innerHTML = `<td colspan="${d.team ? 5 : 4}"><div class="help-text">${esc(request.conversation?.[0]?.text ?? '')}</div><span class="muted small">${esc(new Date(request.createdAt).toLocaleString())}${request.priority ? ` · ${esc(request.priority)}` : ''}${request.version ? ` · ${esc(request.version)}` : ''}${d.team ? ` · ${esc(request.requester.email)}` : ''}</span></td>`;
      row.after(tr);
    } catch (error) {
      toast(error.message, 'bad');
    }
  };
  for (const row of $$('#hrows tr[data-id]')) row.onclick = () => show(row);
  if (open) {
    const row = $(`#hrows tr[data-id="${CSS.escape(open)}"]`);
    if (row) show(row);
  }
}
