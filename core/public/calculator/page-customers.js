import { cleanEngines } from '../engines.js';

/**
 * The customers: the list, opening one, saving as you go, and the Customer menu.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupCustomers(d) {
  const {
    $, api, c, can, esc, handleAuthLoss, me, offline, OPEN_KEY, ROWS_FIRST, savedAt, setStatus, standalone,
    sure, toast,
  } = d;
  // ---- Customers ----------------------------------------------------------------------------

  async function load({ reopen = true, fresh = false } = {}) {
    d.gateImpact();
    let body;
    try {
      body = await api('/api/projections');
    } catch (error) {
      if (handleAuthLoss(error)) return;
      setStatus('calc-saved', error.message, 'error');
      return;
    }
    c.customers = body.customers ?? [];
    c.impactDefaults = body.impactDefaults ?? {};
    renderCustomers();
    renderOrg();
    if (!reopen && c.open && c.customers.some((x) => x.id === c.open.id)) return d.loadReports();
    // A fresh start (the command center's Calculator): no customer opened, nothing of the last one on the page.
    if (fresh) {
      show(null);
      return d.loadReports();
    }
    let last = '';
    try {
      last = localStorage.getItem(OPEN_KEY) || '';
    } catch {}
    const first = c.customers.find((x) => x.id === last) ?? c.customers[0];
    if (first) return open(first.id);
    show(null);
    // No customer yet (the first visit, a fresh download, or the last one deleted): one is made straight away,
    // in the organisation's name when it is known, so the page is never left with everything switched off.
    await create().catch((error) => handleAuthLoss(error) || toast(error.message, 'bad'));
  }

  function renderCustomers() {
    $('calc-empty').hidden = c.customers.length > 0;
    $('calc-customer').innerHTML = c.customers.map((x) => `<option value="${esc(x.id)}"${x.id === c.open?.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    // The Customer ▾ menu: the saved customers (the one open ticked, each with when it was saved), then New, Rename, Delete.
    $('calc-cust-current').textContent = c.open?.name ?? (c.customers.length ? 'Choose a customer' : 'None yet');
    $('calc-cust-list').innerHTML = c.customers
      .map((x) => `<button type="button" class="calc-cust-item${x.id === c.open?.id ? ' on' : ''}" role="menuitemradio" aria-checked="${x.id === c.open?.id}" data-customer="${esc(x.id)}"><span translate="no">${esc(x.name)}</span>${x.updatedAt ? `<small>saved ${savedAt(x.updatedAt)}</small>` : ''}</button>`)
      .join('');
    $('calc-cust-list').hidden = !c.customers.length;
    const named = c.open ? `“${c.open.name}”` : '';
    $('calc-rename').textContent = c.open ? `Rename ${named}…` : 'Rename…';
    $('calc-delete').textContent = c.open ? `Delete ${named}…` : 'Delete…';
    for (const id of ['calc-rename', 'calc-customer', 'calc-name', 'calc-delete', 'calc-generate', 'calc-extra', 'calc-bundle', 'calc-bundle-q', 'calc-horizon', 'calc-email-open', 'calc-restart', 'calc-scope-toggle', 'calc-scope-clear', 'calc-app-input', 'calc-project-input', 'calc-leave-no-code', 'calc-leave-no-findings', 'calc-all-branches', 'calc-max-projects']) $(id).disabled = !c.open;
  }

  function renderOrg() {
    const org = me()?.organisationName;
    // A customer still under its made-up name ("Customer 1") takes the organisation's name as it is typed;
    // a name someone chose is never replaced.
    const name = String(org ?? '').trim();
    if (name && c.open && /^Customer \d+$/.test(c.open.name) && !c.customers.some((x) => x.id !== c.open.id && x.name.toLowerCase() === name.toLowerCase())) {
      c.open.name = name;
      c.customers = c.customers.map((x) => (x.id === c.open.id ? { ...x, name } : x));
      save({ name });
      renderCustomers();
    }
    if (standalone) {
      $('calc-org-line').innerHTML = org ? `<span>Name on the reports:</span> <b translate="no">${esc(org)}</b>` : 'Give your organisation’s name at the top, for the reports.';
      return;
    }
    $('calc-org-line').innerHTML = org
      ? `<span>Name on the reports:</span> <b translate="no">${esc(org)}</b>`
      : can('settings.branding')
        ? 'Give your organisation’s name for the reports in <a href="#/settings/about">Settings → About &amp; terms</a>.'
        : 'Reports carry your organisation’s name once an Admin gives it (Settings → About &amp; terms).';
  }

  function show(customer) {
    // Leaving a customer that was filling in as the projects came in: it keeps what it had, and gets the read when it ends only if still open.
    if (d.reading.stream && c.open?.id === d.reading.customer && customer?.id !== d.reading.customer) {
      d.leaveStream();
      d.reading.stream = false;
      if (c.pending?.id === d.reading.customer) flush();
    }
    c.open = customer;
    c.remainingCredits = null;
    renderCustomers();
    for (const panel of document.querySelectorAll('#page-calculator .calc-panel')) panel.classList.toggle('calc-none', !customer);
    if (!customer) {
      $('calc-tr').innerHTML = '';
      $('calc-read').disabled = true;
      c.next = null;
      d.renderPending();
      return;
    }
    try {
      localStorage.setItem(OPEN_KEY, customer.id);
    } catch {}
    $('calc-name').value = customer.name;
    c.trCredits = null;
    c.fusionCredits = null;
    // Nothing waits for Apply in a customer just opened: the settings at the top are its own.
    c.next = null;
    d.renderTop();
    $('calc-email-form').hidden = true;
    $('calc-email-open').setAttribute('aria-expanded', 'false');
    d.rowsShown = ROWS_FIRST;
    saved('Saved', customer.updatedAt, 'muted');
    d.syncDraft();
    setStatus('calc-upload-status', '');
    // On its own, the calculator works from the two exports: they are always in view.
    // Folded to one line once the customer has figures (from Checkmarx One or the exports); open only for a customer with none and no tenant to read.
    $('calc-alt').open = offline() && !customer.tr?.totals;
    if (!d.reading.timer) setStatus('calc-read-note', '');
    $('calc-read').disabled = Boolean(d.reading.timer);
    d.fillImpact();
    d.renderTr();
    d.renderFusion();
    d.loadReports();
    d.autoRead();
    // Saved before engines were counted apart, with other engines, before SAST was kept apart (for Fusion's
    // extra findings), or with other scan origins: add them up again from the last read.
    const meta = customer.tr?.totals?.meta;
    const origins = (list) => [...(list ?? [])].sort().join('\n');
    if (meta?.source === 'cxone' && (cleanEngines(meta.engines).join() !== d.trEngines().join() || !customer.tr.totals.sast || origins(meta.origins) !== origins(d.scope().origins))) d.applyScope({ quiet: true });
  }

  async function open(id) {
    await flush();
    try {
      show((await api(`/api/projections/${encodeURIComponent(id)}`)).customer);
    } catch (error) {
      if (handleAuthLoss(error)) return;
      toast(error.message, 'bad');
      if (error.status === 404) load();
    }
  }

  function saved(label, at, kind = 'muted') {
    const el = $('calc-saved');
    el.className = `status ${kind}`;
    el.innerHTML = at ? `${esc(label)} ${savedAt(at)}` : esc(label);
  }

  /** What changed is saved a moment after the last change, quietly. */
  function save(patch) {
    if (!c.open) return;
    c.pending = { id: c.open.id, patch: { ...(c.pending?.id === c.open.id ? c.pending.patch : {}), ...patch } };
    saved('Saving…');
    clearTimeout(c.timer);
    c.timer = setTimeout(flush, 800);
  }

  async function flush() {
    clearTimeout(c.timer);
    while (c.saving) await c.saving;
    const job = c.pending;
    if (!job) return;
    // A customer filling in as Checkmarx One is read is saved when the read ends, with every project (settle).
    if (d.reading.stream && job.id === d.reading.customer) return void saved('Saved when the read is done', null, 'muted');
    c.pending = null;
    const run = (async () => {
      try {
        const { customer } = await api(`/api/projections/${encodeURIComponent(job.id)}`, { method: 'PUT', body: JSON.stringify(job.patch), quiet: true });
        c.customers = c.customers.map((x) => (x.id === customer.id ? customer : x));
        if (job.patch.name) renderCustomers();
        if (c.open?.id === job.id && !c.pending) saved('Saved', customer.updatedAt, 'ok');
      } catch (error) {
        if (handleAuthLoss(error)) return;
        if (c.open?.id === job.id) {
          saved('Not saved:', null, 'error');
          $('calc-saved').append(` ${error.message}`);
        }
        if (![404, 413].includes(error.status) && !c.pending) c.pending = job;
      }
    })();
    c.saving = run;
    try {
      await run;
    } finally {
      if (c.saving === run) c.saving = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  $('calc-customer').addEventListener('change', () => open($('calc-customer').value));

  // ---- The Customer ▾ menu ----------------------------------------------------------------
  const custMenu = $('calc-cust-menu');
  const custBtn = $('calc-cust-btn');
  function custMenuOpen(on) {
    custMenu.hidden = !on;
    custBtn.setAttribute('aria-expanded', String(on));
    if (on) (custMenu.querySelector('.calc-cust-item.on') ?? custMenu.querySelector('button:not([disabled])'))?.focus();
  }
  custBtn.addEventListener('click', () => custMenuOpen(custMenu.hidden));
  custMenu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-customer]');
    if (!item) return;
    custMenuOpen(false);
    if (item.dataset.customer === c.open?.id) return;
    $('calc-customer').value = item.dataset.customer;
    $('calc-customer').dispatchEvent(new Event('change'));
  });
  // New, Rename and Delete close the menu first; their own handlers below do the work.
  for (const id of ['calc-new', 'calc-rename', 'calc-delete']) $(id).addEventListener('click', () => custMenuOpen(false), { capture: true });
  document.addEventListener('click', (event) => {
    if (!custMenu.hidden && !event.target.closest('.calc-cust-pick')) custMenuOpen(false);
  });
  custMenu.addEventListener('keydown', (event) => {
    const items = [...custMenu.querySelectorAll('button:not([disabled])')];
    const at = items.indexOf(document.activeElement);
    if (event.key === 'Escape') { custMenuOpen(false); custBtn.focus(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  });
  /** Rename: the name field shows beside the menu; Enter or leaving it puts it away. */
  function renameOpen(on) {
    $('calc-rename-field').hidden = !on;
    if (on) {
      $('calc-name').value = c.open?.name ?? '';
      $('calc-name').focus();
      $('calc-name').select();
    }
  }
  $('calc-rename').addEventListener('click', () => c.open && renameOpen(true));
  $('calc-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); renameOpen(false); custBtn.focus(); }
  });
  $('calc-name').addEventListener('blur', () => renameOpen(false));

  $('calc-name').addEventListener('input', () => {
    const name = $('calc-name').value.trim();
    if (!c.open || !name) return;
    c.open.name = name;
    c.customers = c.customers.map((x) => (x.id === c.open.id ? { ...x, name } : x));
    save({ name });
  });
  $('calc-name').addEventListener('change', renderCustomers);
  /** A new customer: named after the organisation given when the terms were first accepted, while no customer has that name. */
  async function create() {
    await flush();
    const org = String(me()?.organisationName ?? '').trim();
    const name = org && !c.customers.some((x) => x.name.trim().toLowerCase() === org.toLowerCase()) ? org : `Customer ${c.customers.length + 1}`;
    const { customer } = await api('/api/projections', { method: 'POST', body: JSON.stringify({ name }) });
    c.customers = [...c.customers, { id: customer.id, name: customer.name, updatedAt: customer.updatedAt }];
    show(customer);
    return customer;
  }
  $('calc-new').addEventListener('click', async () => {
    try {
      await create();
      renameOpen(true);
    } catch (error) {
      if (!handleAuthLoss(error)) toast(error.message, 'bad');
    }
  });
  $('calc-delete').addEventListener('click', async () => {
    if (!c.open || !await sure(`Delete this customer?\n\n${c.open.name}\n\nTheir uploads, plan and Fusion projects go with them. Reports already made are kept.`)) return;
    const { id } = c.open;
    if (c.pending?.id === id) c.pending = null;
    try {
      await api(`/api/projections/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      if (handleAuthLoss(error)) return;
      if (error.status !== 404) return toast(error.message, 'bad');
    }
    c.customers = c.customers.filter((x) => x.id !== id);
    c.open = null;
    if (c.customers[0]) open(c.customers[0].id);
    else await create().catch((error) => handleAuthLoss(error) || toast(error.message, 'bad'));
  });

  return {
    flush, load, renderOrg, save, show,
  };
}
