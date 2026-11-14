import { t } from '../i18n.js';

/**
 * Counting from git: the tokens (one per platform or organisation, kept in memory only), finding the repositories, and counting them.
 *
 * Part of the calculator's page (page.js), which calls it with `d`: what the page holds (the customer open, its
 * helpers and the other parts' functions), read when used. What is named at the top is there before this runs; the
 * rest is read as `d.name` where it is used.
 */
export function setupGit(d) {
  const {
    $, api, bytes, c, cleanUrl, esc, fnew, fnewEstimate, fnewKpi, FREQ_LABEL, fusion, git, GIT_ADDRESS,
    handleAuthLoss, hostSwitched, num, renderFusionNew, saveFnew, setStatus, showError, showWay, standalone,
    toast, upsertMeasured,
  } = d;
  // ---- Several git tokens, one per platform or organisation: kept in this page's memory only, never saved ----
  git.tokens = [];
  const PROVIDER_NAMES = { github: 'GitHub', gitlab: 'GitLab', azure: 'Azure DevOps', bitbucket: 'Bitbucket' };
  /** The platform a token is for, from how it starts (Azure DevOps tokens have no mark: picked by hand). */
  const detectProvider = (token) =>
    /^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(token) ? 'github' : /^(glpat-|gldt-|glptt-|glrt-)/.test(token) ? 'gitlab' : /^(ATBB|ATCTT|ATATT)/.test(token) ? 'bitbucket' : null;
  const masked = (token) => (token.length > 10 ? `${token.slice(0, 4)}••••${token.slice(-4)}` : '••••');
  const hostOf = (x) => { try { return new URL(x.address || GIT_ADDRESS[x.provider]).host; } catch { return x.address || x.provider; } };
  $('calc-git-secret').addEventListener('input', () => {
    const found = detectProvider($('calc-git-secret').value.trim());
    if (found && $('calc-git-provider').value !== found) {
      $('calc-git-provider').value = found;
      $('calc-git-address').placeholder = GIT_ADDRESS[found];
    }
    $('calc-git-detected').textContent = found ? `${PROVIDER_NAMES[found]} detected` : $('calc-git-secret').value.trim() ? 'Pick the git host above (Azure DevOps tokens do not say which platform they are for)' : '';
  });
  /** The token in the field, added to the list (the field is cleared for the next one). */
  function addTypedToken() {
    const token = $('calc-git-secret').value.trim();
    if (!token) return false;
    const entry = { provider: $('calc-git-provider').value, address: $('calc-git-address').value.trim(), token };
    if (!git.tokens.some((x) => x.token === token && x.provider === entry.provider && x.address === entry.address)) git.tokens.push(entry);
    $('calc-git-secret').value = '';
    $('calc-git-detected').textContent = '';
    renderTokens();
    return true;
  }
  function renderTokens() {
    const box = $('calc-git-tokens');
    box.hidden = !git.tokens.length;
    box.innerHTML = git.tokens.length
      ? `<div class="calc-git-tokens-head">${git.tokens.length === 1 ? '1 token' : `${num(git.tokens.length)} tokens`}: each one's organisations are found and counted; a repository two can see is counted once.</div>` +
        git.tokens.map((x, i) => `<div class="calc-git-token-row"><span class="calc-fh-pill ok">${esc(PROVIDER_NAMES[x.provider] ?? x.provider)}</span><code translate="no">${esc(masked(x.token))}</code><span translate="no">${esc(hostOf(x))}</span><button type="button" class="link" data-token-remove="${i}">Remove</button></div>`).join('')
      : '';
    git.onTokens?.();
  }
  /**
   * A token given beside the API key (the standalone calculator's head): added to the same list, ready on
   * Fusion · from Git. The platform from how the token starts, else the one picked. Returns the platform, or null.
   */
  function addGitToken({ provider = '', address = '', token = '' } = {}) {
    const value = String(token).trim();
    if (!value) return null;
    const kind = detectProvider(value) ?? (PROVIDER_NAMES[provider] ? provider : null);
    if (!kind) return null;
    const entry = { provider: kind, address: String(address).trim(), token: value };
    if (!git.tokens.some((x) => x.token === entry.token && x.provider === entry.provider && x.address === entry.address)) git.tokens.push(entry);
    git.chosen = new Set([...(git.chosen ?? []), 'token']);
    const box = $('calc-git-hosts').querySelector('input[value="token"]');
    renderTokens();
    if (box) {
      box.checked = true;
      hostSwitched();
    }
    return kind;
  }
  const gitTokens = () => git.tokens.map((x) => ({ provider: x.provider, platform: PROVIDER_NAMES[x.provider] ?? x.provider, masked: masked(x.token), host: hostOf(x) }));
  function removeGitToken(i) {
    git.tokens.splice(Number(i), 1);
    renderTokens();
    if ($('calc-git-hosts').querySelector('input[value="token"]')) hostSwitched();
  }
  $('calc-git-token-add').addEventListener('click', () => {
    if (!addTypedToken()) return setStatus('calc-git-status', 'Paste the token first (1 · Where the code is).', 'error');
    hostSwitched();
  });
  $('calc-git-tokens').addEventListener('click', (event) => {
    const i = event.target.closest('[data-token-remove]')?.dataset.tokenRemove;
    if (i === undefined) return;
    removeGitToken(i);
  });
  /** The tokens typed, as the server takes them (each sent only with the requests for its own host, never kept). */
  function typedTokens() {
    if (!git.chosen?.has('token')) return [];
    addTypedToken();
    if (!git.tokens.length) throw new Error('Paste a token first (1 · Where the code is).');
    return git.tokens.map((x) => ({ provider: x.provider, address: x.address, token: x.token }));
  }
  /** Where the code is: the connections ticked and the tokens typed; at least one. */
  function access() {
    const connections = [...(git.chosen ?? [])].filter((id) => id !== 'token' && git.connections?.some((x) => x.id === id));
    const tokens = typedTokens();
    if (!connections.length && !tokens.length) throw new Error('Tick where the code is first (1 · Where the code is).');
    return { connections, tokens };
  }
  /** One request per access: the Admin's connections together, then each token on its own. */
  const accessParts = (how) => [...(how.connections.length ? [{ key: null, body: { connections: how.connections } }] : []), ...how.tokens.map((token, i) => ({ key: `token:${i}`, index: i, token, body: { connections: [], token } }))];

  /** What to list of a source: the organizations ticked and typed, and Everything this token can see. */
  function askOf(key) {
    const found = git.orgs[key];
    const typed = $('calc-git-owner').value.split(',').map((s) => s.trim()).filter(Boolean);
    const orgs = [...new Set([...(found ? [...found.ticked] : []), ...typed])];
    return { ...(orgs.length ? { orgs } : {}), everything: Boolean(found?.everything) };
  }

  $('calc-git-orgs-find').addEventListener('click', () => findOrgs());
  /** Find each source's organizations (a token: Everything this token can see, ticked to start with). True when found. */
  async function findOrgs() {
    let how;
    try {
      how = access();
    } catch (error) {
      setStatus('calc-git-status', error.message, 'error');
      return false;
    }
    setStatus('calc-git-status', 'Finding the organizations…', 'muted');
    $('calc-git-orgs-find').disabled = true;
    try {
      git.orgs = {};
      for (const part of accessParts(how)) {
        const found = await api('/api/projections/git/organizations', { method: 'POST', body: JSON.stringify(part.body), quiet: true });
        for (const s of found.sources ?? []) {
          // Each token's organisations kept apart: its own key, and which token in the label.
          const key = s.source === 'token' && part.key ? part.key : s.source;
          const label = s.source === 'token' && part.key && how.tokens.length > 1 ? `${s.label} · token ${part.index + 1}` : s.label;
          const own = git.connections?.find((x) => x.id === s.source)?.owner ?? '';
          const ticked = new Set((s.organizations ?? []).filter((o) => own && o.id.toLowerCase() === own.toLowerCase()).map((o) => o.id));
          git.orgs[key] = { ...s, source: key, label, ticked, everything: s.source === 'token' };
        }
      }
      renderOrgs();
      setStatus('calc-git-status', '');
      return true;
    } catch (error) {
      if (!handleAuthLoss(error)) showError('calc-git-status', error);
      return false;
    } finally {
      $('calc-git-orgs-find').disabled = false;
    }
  }

  function renderOrgs() {
    const sets = Object.values(git.orgs);
    const box = $('calc-git-orgs');
    box.hidden = !sets.length;
    box.innerHTML = sets
      .map((s) => `<fieldset class="calc-git-org-set" data-source="${esc(s.source)}"><legend><span translate="no">${esc(`${s.label} · ${s.host}`)}</span>${s.who ? ` <small>${esc(t('signed in as {0}').replace('{0}', s.who))}</small>` : ''}</legend>
        <label class="calc-git-everything"><input type="checkbox" data-org-all${s.everything ? ' checked' : ''} /> <span>Everything this token can see</span></label>
        <div class="calc-git-org-list">${(s.organizations ?? []).map((o) => `<label><input type="checkbox" data-org="${esc(o.id)}"${s.ticked.has(o.id) || s.everything ? ' checked' : ''}${s.everything ? ' disabled' : ''} /> ${o.id === '@me' ? '<span>My own repositories</span>' : `<span translate="no">${esc(o.id)}</span>`}</label>`).join('') || '<span class="hint">No organizations listed: type one below, or tick Everything this token can see.</span>'}</div>
        ${s.problem ? `<small class="calc-warn">${esc(s.problem)}</small>` : ''}
      </fieldset>`)
      .join('');
  }
  $('calc-git-orgs').addEventListener('change', (event) => {
    const set = git.orgs[event.target.closest('[data-source]')?.dataset.source];
    if (!set) return;
    if (event.target.matches('[data-org-all]')) {
      set.everything = event.target.checked;
      renderOrgs();
    } else if (event.target.dataset.org !== undefined) {
      if (event.target.checked) set.ticked.add(event.target.dataset.org);
      else set.ticked.delete(event.target.dataset.org);
    }
  });

  $('calc-git-list').addEventListener('click', () => listRepos());
  /** List the repositories of what is ticked; those not archived and not forks ticked to start with. True when any. */
  async function listRepos() {
    let how;
    try {
      how = access();
    } catch (error) {
      setStatus('calc-git-status', error.message, 'error');
      return false;
    }
    setStatus('calc-git-status', 'Listing the repositories…', 'muted');
    $('calc-git-list').disabled = true;
    try {
      const found = { repositories: [], problems: [], more: false };
      for (const part of accessParts(how)) {
        const body = part.key
          ? { connections: [], token: { ...part.token, ...askOf(part.key) } }
          : { connections: how.connections.map((id) => ({ id, ...askOf(id) })) };
        const got = await api('/api/projections/git/repositories', { method: 'POST', body: JSON.stringify(body), quiet: true });
        found.repositories.push(...(got.repositories ?? []).map((r) => (part.key ? { ...r, tokenIndex: part.index } : r)));
        found.problems.push(...(got.problems ?? []));
        found.more ||= Boolean(got.more);
      }
      // A repository two tokens can see is listed (and counted) once.
      found.repositories = [...new Map(found.repositories.map((r) => [cleanUrl(r.url), r])).values()];
      // Ticked to start with: each one not archived and not a fork, up to the repositories a run takes.
      let ticked = 0;
      git.repos = (found.repositories ?? []).map((r) => ({ ...r, ticked: !r.archived && !r.fork && (ticked += 1) <= git.limit }));
      git.filter = '';
      renderRepos();
      const problems = (found.problems ?? []).map((p) => (p.org ? `${p.org}: ${p.error}` : p.error));
      if (!git.repos.length) setStatus('calc-git-status', problems.length ? problems.join(' · ') : 'No repositories there that this access may read.', 'warn');
      else if (found.more) setStatus('calc-git-status', `The first ${num(git.repos.length)} repositories are listed: paste the addresses of any others.`, 'warn');
      else if (problems.length) setStatus('calc-git-status', problems.join(' · '), 'warn');
      else setStatus('calc-git-status', '');
      return git.repos.some((r) => r.ticked);
    } catch (error) {
      if (!handleAuthLoss(error)) showError('calc-git-status', error);
      return false;
    } finally {
      $('calc-git-list').disabled = false;
    }
  }

  /** The steps (where the code is, which repositories, the engine), folded behind one link once counted on their own. */
  function foldGitSteps(folded) {
    const steps = $('calc-git-steps');
    let open = $('calc-git-steps-open');
    if (!open) {
      open = Object.assign(document.createElement('button'), { type: 'button', className: 'link calc-git-steps-open', id: 'calc-git-steps-open', textContent: 'Change what is counted' });
      open.addEventListener('click', () => foldGitSteps(false));
      steps.before(open);
    }
    git.stepsFolded = folded;
    steps.hidden = folded;
    open.hidden = !folded;
  }
  // On its own the calculator counts by itself once a token is given beside the API key: the steps start folded.
  if (standalone) foldGitSteps(true);

  /**
   * Count everything the tokens can see, in one go (a token given beside the API key): find the organizations, list the
   * repositories, count them. A count already running: this one follows when it ends.
   */
  async function autoCount() {
    if (!c.open || !git.tokens.length) return;
    if (git.run || git.autoBusy) return void (git.autoAgain = true);
    git.autoBusy = true;
    try {
      git.chosen = new Set([...(git.chosen ?? []), 'token']);
      setStatus('calc-git-status', 'Counting from git: finding each token\'s organizations…', 'muted');
      if (!(await findOrgs())) return;
      setStatus('calc-git-status', 'Counting from git: listing the repositories…', 'muted');
      if (!(await listRepos())) return;
      git.autoFold = true;
      $('calc-git-count').click();
    } finally {
      git.autoBusy = false;
    }
  }

  function renderRepos() {
    const box = $('calc-git-repos');
    box.hidden = !git.repos.length;
    const tags = (r) => [r.branch ? ` <span class="calc-git-tag" translate="no">${esc(r.branch)}</span>` : '', r.archived ? ' <span class="calc-git-tag">archived</span>' : '', r.fork ? ' <span class="calc-git-tag">fork</span>' : '', r.empty ? ' <span class="calc-git-tag">empty</span>' : ''].join('');
    box.innerHTML = git.repos.length
      ? `<div class="calc-git-repos-head"><span></span><input type="search" class="calc-git-filter" data-git-filter placeholder="Filter" aria-label="Filter the repositories" value="${esc(git.filter)}" /><button type="button" class="link" data-git-all>Tick all shown</button><button type="button" class="link" data-git-none>Tick none</button></div>` +
        git.repos
          .map((r, i) => `<label data-git-row="${i}"><input type="checkbox" data-git-repo="${i}"${r.ticked ? ' checked' : ''} /><span><span translate="no">${esc(r.path)}</span>${tags(r)}${git.tokens.length > 1 && Number.isInteger(r.tokenIndex) ? ` <span class="calc-git-tag">token ${r.tokenIndex + 1}</span>` : ''}</span><span class="calc-git-size">${r.sizeBytes === null || r.sizeBytes === undefined ? '' : esc(bytes(r.sizeBytes))}</span></label>`)
          .join('')
      : '';
    filterRepos();
    countLabel();
  }
  /** Only the repositories whose path has what is typed in the filter. */
  function filterRepos() {
    const words = git.filter.toLowerCase().split(/\s+/).filter(Boolean);
    for (const row of $('calc-git-repos').querySelectorAll('label[data-git-row]')) {
      const r = git.repos[Number(row.dataset.gitRow)];
      row.classList.toggle('calc-git-hidden', words.length > 0 && !words.every((w) => r.path.toLowerCase().includes(w)));
    }
  }
  $('calc-git-repos').addEventListener('input', (event) => {
    if (!event.target.matches('[data-git-filter]')) return;
    git.filter = event.target.value;
    filterRepos();
  });
  $('calc-git-repos').addEventListener('change', (event) => {
    const i = event.target.dataset.gitRepo;
    if (i === undefined || !git.repos[Number(i)]) return;
    git.repos[Number(i)].ticked = event.target.checked;
    countLabel();
  });
  $('calc-git-repos').addEventListener('click', (event) => {
    const all = event.target.closest('[data-git-all]');
    if (!all && !event.target.closest('[data-git-none]')) return;
    for (const row of $('calc-git-repos').querySelectorAll('label[data-git-row]')) {
      const r = git.repos[Number(row.dataset.gitRow)];
      if (!all) r.ticked = false;
      else if (!row.classList.contains('calc-git-hidden')) r.ticked = true;
    }
    renderRepos();
  });

  /** The repositories ticked (with what discovery said of them) and pasted, each once. */
  function wanted() {
    const out = git.repos.filter((r) => r.ticked).map(({ source, url, fullName, id, org, project, branch, createdAt, tokenIndex }) => ({ source, url, fullName, id, org, project, branch, createdAt, tokenIndex }));
    // A pasted address goes with the token for its host, when one is typed for it.
    const byHost = (url) => { try { const h = new URL(url).host; const i = git.tokens.findIndex((x) => hostOf(x) === h); return i >= 0 ? i : undefined; } catch { return undefined; } };
    for (const line of $('calc-git-paste').value.split(/\r?\n/)) if (line.trim()) out.push({ url: line.trim(), tokenIndex: byHost(line.trim()) });
    return [...new Map(out.map((r) => [cleanUrl(r.url), r])).values()];
  }
  function countLabel() {
    const n = wanted().length;
    const button = $('calc-git-count');
    button.textContent = n === 1 ? 'Count code lines (1 repository)' : n ? `Count code lines (${num(n)} repositories)` : 'Count code lines';
    button.disabled = !n || Boolean(git.run) || !c.open;
    const head = $('calc-git-repos').querySelector('.calc-git-repos-head span');
    if (head) head.textContent = `${num(git.repos.filter((r) => r.ticked).length)} of ${num(git.repos.length)} ticked`;
  }
  $('calc-git-paste').addEventListener('input', countLabel);
  $('calc-git-count').addEventListener('click', () => {
    const items = wanted();
    if (items.length > git.limit) return setStatus('calc-git-status', `At most ${num(git.limit)} repositories a run: tick fewer, and count the rest after.`, 'error');
    let how;
    try {
      how = access();
    } catch (error) {
      return setStatus('calc-git-status', error.message, 'error');
    }
    // One run for the Admin's connections, then one for each token's repositories, one after another.
    const strip = ({ tokenIndex, ...item }) => item;
    const runs = [];
    const viaConnections = items.filter((r) => !Number.isInteger(r.tokenIndex) && (how.connections.length || !how.tokens.length));
    const loose = items.filter((r) => !Number.isInteger(r.tokenIndex) && !how.connections.length && how.tokens.length);
    if (viaConnections.length) runs.push({ items: viaConnections.map(strip), how: { connections: how.connections, token: null } });
    how.tokens.forEach((token, i) => {
      const mine = items.filter((r) => r.tokenIndex === i).concat(i === 0 ? loose : []);
      if (mine.length) runs.push({ items: mine.map(strip), how: { connections: [], token } });
    });
    git.queue = runs.slice(1);
    git.queueDone = { done: 0, failed: 0, runs: runs.length };
    if (runs[0]) startCount(runs[0].items, { how: runs[0].how });
  });

  /** Count again: the project's repository at its latest commit, with the connection it was counted with when it is still there. */
  function countAgain(p) {
    d.way = 'git';
    showWay(d.way);
    const known = git.connections?.some((x) => x.id === p.git.connection);
    startCount([{ url: p.git.url, ...(known ? { source: p.git.connection } : {}) }], { projectId: p.id, connection: known ? p.git.connection : null });
  }

  /** Start a run, then follow it: each repository becomes a project of the customer open when it started. */
  async function startCount(items, { projectId = null, connection = null, how: given = null } = {}) {
    if (!c.open || git.run || !items.length) return;
    let how;
    try {
      if (given) how = given;
      else if (connection) how = { connections: [connection], token: null };
      else {
        const all = access();
        how = { connections: all.connections, token: all.tokens[0] ?? null };
      }
    } catch (error) {
      return setStatus('calc-git-status', error.message, 'error');
    }
    setStatus('calc-git-status', 'Starting the count…', 'muted');
    git.run = { id: null, customer: c.open.id, projectId, applied: new Map(), rows: [], seq: 0, summary: null };
    countLabel();
    let job;
    try {
      job = await api('/api/projections/git/count', { method: 'POST', body: JSON.stringify({ connections: how.connections, ...(how.token ? { token: how.token } : {}), engine: $('calc-git-engine').value, repositories: items }), quiet: true });
    } catch (error) {
      git.run = null;
      countLabel();
      if (!handleAuthLoss(error)) showError('calc-git-status', error);
      return;
    }
    git.run.id = job.id;
    setStatus('calc-git-status', '');
    followCount(job);
  }

  /** A view of the run: only the repositories changed since the last one are in it, merged here. */
  function mergeRun(job) {
    const run = git.run;
    if (!run) return;
    for (const r of job.repositories ?? []) run.rows[r.i] = r;
    run.seq = Math.max(run.seq, job.seq ?? 0);
    run.summary = job.summary;
    run.engine = job.engine;
  }

  function followCount(job) {
    mergeRun(job);
    renderProgress();
    applyCounted();
    renderGitSummary();
    if (job.state !== 'running') return finishCount();
    setTimeout(async () => {
      if (!git.run) return;
      let next;
      try {
        next = await api(`/api/projections/git/count?id=${encodeURIComponent(git.run.id)}&after=${git.run.seq}`, { quiet: true });
      } catch (error) {
        git.run = null;
        countLabel();
        if (!handleAuthLoss(error)) showError('calc-git-status', error);
        return;
      }
      followCount(next);
    }, 1200);
  }

  /** Each repository measured: a project (the one of the same repository, or the one counted again, is replaced). */
  function applyCounted() {
    const run = git.run;
    if (!run || !c.open || c.open.id !== run.customer) return;
    let added = 0;
    for (const r of run.rows) {
      if (!r || r.state !== 'done' || run.applied.has(r.url)) continue;
      const made = upsertMeasured(
        {
          name: r.name,
          path: r.path,
          file: '',
          langs: Object.fromEntries(Object.entries(r.languages ?? {}).map(([lang, v]) => [lang, v.code])),
          locOverride: null,
          git: { host: r.host, path: r.path, url: r.url, branch: r.branch, commit: r.commit, countedAt: r.countedAt, connection: r.source && r.source !== 'token' ? r.source : '' },
          activity: { commits: r.commits, windowDays: r.windowDays, lastCommitAt: r.lastCommitAt, frequency: r.frequency, devs90: r.devs90, engine: r.engine },
        },
        { projectId: run.projectId, key: String(r.i) },
      );
      run.applied.set(r.url, made.id);
      added += 1;
    }
    if (added) {
      saveFnew();
      renderFusionNew();
    }
  }

  function finishCount() {
    const run = git.run;
    git.run = null;
    countLabel();
    const rows = (run?.rows ?? []).filter(Boolean);
    const done = rows.filter((r) => r.state === 'done').length;
    const failed = rows.length - done;
    if (run && c.open?.id !== run.customer) { git.queue = []; return toast('The count ended while another customer was open: open that customer and count again.', 'warn', 9000); }
    // Several tokens: the next token's run starts; the end says what all of them counted.
    if (git.queueDone) {
      git.queueDone.done += done;
      git.queueDone.failed += failed;
    }
    if (git.queue?.length) {
      const next = git.queue.shift();
      setStatus('calc-git-status', `${num(git.queueDone.done)} counted so far; the next token's repositories now…`, 'muted');
      return startCount(next.items, { how: next.how });
    }
    // Counted on its own: the steps fold away, the tiles and the projects stay; Change what is counted opens them.
    if (git.autoFold && !git.queue?.length) {
      git.autoFold = false;
      foldGitSteps(true);
    }
    // A token added while this count ran: its repositories are counted now.
    if (git.autoAgain) {
      git.autoAgain = false;
      setTimeout(autoCount, 0);
    }
    if (git.queueDone && git.queueDone.runs > 1) {
      const all = git.queueDone;
      git.queueDone = null;
      if (!all.failed) return setStatus('calc-git-status', `${num(all.done)} counted with ${num(all.runs)} tokens: each is a project below.`, 'ok');
      return setStatus('calc-git-status', `${num(all.done)} counted, ${num(all.failed)} not, with ${num(all.runs)} tokens: each says why under Repository by repository.`, all.done ? 'warn' : 'error');
    }
    git.queueDone = null;
    if (!failed) setStatus('calc-git-status', done === 1 ? 'Counted: it is a project below.' : `${num(done)} counted: each is a project below.`, 'ok');
    else setStatus('calc-git-status', `${num(done)} counted, ${num(failed)} not: each says why under Repository by repository.`, done ? 'warn' : 'error');
  }

  /** The run's figures: repositories measured, their code lines (the languages counted), developers (each once), Fusion scans. */
  function renderGitSummary() {
    const run = git.run;
    const box = $('calc-git-summary');
    if (!run?.summary || !c.open) return;
    const ids = new Set(run.applied.values());
    const rows = fnewEstimate().rows.filter((r) => ids.has(r.id));
    const s = run.summary;
    const fromRule = rows.filter((r) => r.scansFrom === 'frequency' || r.scansFrom === 'criticality').length;
    box.hidden = false;
    box.innerHTML = [
      fnewKpi('Repositories', num(s.measured), esc(`of ${num(s.repositories)}${s.failed ? ` · ${num(s.failed)} not counted` : ''}`)),
      fnewKpi('Lines of code', num(rows.reduce((n, r) => n + (r.lines ?? 0), 0)), esc(`${num(s.commits)} commits in the last ${num(365)} days`)),
      fnewKpi('Developers', num(s.developers), esc(`Committed in the last ${num(s.developerDays ?? 90)} days, each once, bots left out`)),
      fnewKpi('Fusion scans', num(rows.reduce((n, r) => n + (r.included && r.units ? r.scans : 0), 0)), esc(`Over ${num(fusion().periodMonths ?? 12)} months · ${num(fromRule)} by change frequency`), 'calc-gold'),
    ].join('');
  }

  /** While a count runs: a small card at the right, with how far it is and what it is on. It goes by itself when the run ends. */
  let flashLive = false;
  let flashTimer = null;
  function gitFlash(rows, { done, failed, left }) {
    let el = document.getElementById('calc-git-flash');
    if (!rows.length || (!left && !flashLive)) {
      if (!rows.length) {
        el?.remove();
        flashLive = false;
      }
      return;
    }
    clearTimeout(flashTimer);
    if (!el) {
      el = document.createElement('div');
      el.id = 'calc-git-flash';
      el.className = 'calc-git-flash';
      el.setAttribute('role', 'status');
      el.innerHTML = '<b></b><span class="calc-git-flash-n"></span><span class="calc-git-flash-bar"><i></i></span><small translate="no"></small><button type="button" class="link">Details</button>';
      el.querySelector('button').addEventListener('click', () => {
        const d = $('calc-git-details');
        d.open = true;
        d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      document.body.append(el);
    }
    flashLive = left > 0;
    const now = rows.find((r) => !['done', 'failed', 'waiting', 'queued', undefined].includes(r.state)) ?? rows.find((r) => r.state !== 'done' && r.state !== 'failed');
    const doing = { counting: now?.total ? `counting ${num(now.done)} of ${num(now.total)} files` : 'counting', files: 'fetching its files', history: 'reading its commits', clone: 'fetching', fetching: 'fetching' }[now?.state] ?? 'waiting';
    el.querySelector('b').textContent = left ? 'Counting from git' : failed ? 'Counted from git, some not' : 'Counted from git';
    el.querySelector('.calc-git-flash-n').textContent = `${num(done + failed)} of ${num(rows.length)}${failed ? ` · ${num(failed)} not counted` : ''}`;
    el.querySelector('i').style.width = `${Math.round(((done + failed) / rows.length) * 100)}%`;
    el.querySelector('small').textContent = now ? `${now.path || String(now.url ?? '').replace(/^https?:\/\/[^/]+\//, '')}: ${doing}` : '';
    el.classList.toggle('calc-git-flash-bad', !left && failed > 0);
    if (!left) flashTimer = setTimeout(() => el.remove(), failed ? 9000 : 5000);
  }

  /** One line a repository: waiting, fetching, its commits, counting n of m files, what it found, or why not. */
  function renderProgress() {
    const box = $('calc-git-progress');
    const rows = (git.run?.rows ?? []).filter(Boolean);
    box.hidden = !rows.length;
    // The list stays folded at the bottom, for whoever wants a repository's detail: its heading says how the run stands.
    const done = rows.filter((r) => r.state === 'done').length;
    const failed = rows.filter((r) => r.state === 'failed').length;
    const left = rows.length - done - failed;
    const sum = $('calc-git-details-sum');
    sum.textContent = rows.length ? `Repository by repository: ${num(done)} counted${failed ? `, ${num(failed)} not` : ''}${left ? `, ${num(left)} to go` : ''} · how it is measured` : 'How it is measured';
    sum.classList.toggle('calc-warn', failed > 0);
    // Nothing counted in this session: the fold is not shown at all (how it is measured is told with a run's list).
    $('calc-git-details').toggleAttribute('data-empty', !rows.length);
    gitFlash(rows, { done, failed, left });
    const out = new Set(fnew()?.leftOut ?? []);
    box.innerHTML = rows
      .map((r) => {
        const where = r.path || r.url.replace(/^https?:\/\/[^/]+\//, '');
        const tag = r.branch || r.commit ? ` <span class="calc-git-tag" translate="no">${esc([r.branch, r.commit].filter(Boolean).join(' · '))}</span>` : '';
        let state;
        if (r.state === 'done') {
          const langs = Object.keys(r.languages ?? {}).filter((lang) => !out.has(lang));
          const lines = langs.reduce((n, lang) => n + r.languages[lang].code, 0);
          const how = [`${num(r.commits)} commits`, FREQ_LABEL[r.frequency] ?? '', `${num(r.devs90)} developers`].filter(Boolean).join(' · ');
          state = `<span class="calc-git-state done">✓ ${esc(`${num(lines)} lines`)}${langs.length ? ` · <span translate="no">${esc(langs.slice(0, 3).join(', '))}</span>` : ''} · ${esc(how)}</span>`;
        } else if (r.state === 'failed') state = `<span class="calc-git-state bad">✗ ${esc(r.error)}</span>`;
        else if (r.state === 'counting') state = `<span class="calc-git-state">${esc(r.total ? `Counting… ${num(r.done)} of ${num(r.total)} files` : 'Counting…')}</span>`;
        else if (r.state === 'files') state = `<span class="calc-git-state">${esc(git.run?.engine === 'api' ? 'Reading its archive…' : 'Fetching the files to count…')}</span>`;
        else if (r.state === 'history') state = '<span class="calc-git-state">Reading its commits…</span>';
        else if (r.state === 'clone' || r.state === 'fetching') state = '<span class="calc-git-state">Fetching the default branch…</span>';
        else state = '<span class="calc-git-state">Waiting</span>';
        return `<div class="calc-git-row"><span><span translate="no">${esc(where)}</span>${tag}</span>${state}</div>`;
      })
      .join('');
  }

  return { addGitToken, autoCount, countAgain, countLabel, detectProvider, gitTokens, removeGitToken, renderOrgs,
    renderRepos };
}
