// Cx Credits Calculator (#/calculator): customers, each with a triage & remediation projection
// (two Checkmarx One exports and a plan per severity) and a Fusion projection (how many Fusion
// scans each project needs, and what they cost), and the projection reports made from them.
// Saved on the server as you go (src/projections.js). The arithmetic is model.js; the charts
// charts.js; the downloaded report report.js.
//
// This file holds what the whole page shares (the customer open, the helpers) and puts the page together from its
// parts, one file each: page-customers.js, page-tr.js (triage & remediation), page-fusion.js, page-code.js (code
// counted, not in Checkmarx One), page-git.js, page-cloc.js, page-scope.js (the settings at the top and Apply),
// page-read.js (reading Checkmarx One) and page-reports.js. Each is `setup<Part>(d)`: `d` gives it what the page
// holds, by name, looked up when used. A new part goes in the bundle's list too (core/src/calculator-bundle.js).

import { FREQUENCIES, creditSummary, fusionTotal } from './model.js';
import { buildReport } from './report.js';
import { leverData } from './levers.js';
import { RTL, currentLanguage, t } from '../i18n.js';
import { setupReports } from './page-reports.js';
import { setupRead } from './page-read.js';
import { setupScope } from './page-scope.js';
import { setupCloc } from './page-cloc.js';
import { setupGit } from './page-git.js';
import { setupCode } from './page-code.js';
import { setupFusion } from './page-fusion.js';
import { setupTr } from './page-tr.js';
import { setupCustomers } from './page-customers.js';

const OPEN_KEY = 'mz-calc-customer';
const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.id, f.label]));
const FROM_LABEL = { default: 'Default', frequency: 'Scan frequency', criticality: 'Criticality', project: 'Set here' };
const SOURCE_LABEL = {
  'sast-metadata': 'Counted by the last scan (SAST scan metadata)',
  scan: 'Counted by the last scan (the scan’s SAST details)',
  none: 'Its last scan did not count lines of code: type them in',
  manual: 'Added by hand',
};

/** The look the app is in, for the report: next-gen or classic, the theme chosen and the accent. */
function appLook() {
  const { ui, look, theme, accent } = document.documentElement.dataset;
  // In the FTR Credits Command Center (html[data-cc]): its theme, light or dark as the maker has it, and Command Center's colour.
  if ('cc' in document.documentElement.dataset) return { look: `cc-${accent || 'aurora'}`, ui: 'nextgen', theme: theme === 'dark' ? 'dark' : 'light', accent: accent === 'command' ? document.documentElement.dataset.ops || 'green' : '' };
  // html[data-look] is "studio", or "signal cabin" for the looks drawn on Signal's pages: the look is its last word.
  return { look: ui === 'nextgen' ? String(look ?? '').split(' ').pop() || 'nextgen' : 'classic', ui: ui === 'nextgen' ? 'nextgen' : 'classic', theme: theme ?? 'auto', accent: accent ?? 'indigo' };
}

/**
 * `standalone`: the calculator on its own, as one HTML file (src/standalone-calculator.js): it never reads
 * Checkmarx One (the two exports stand in), keeps everything in the browser, and asks for the names on the
 * reports itself. `sampleFile(name)` gives the sample exports there, as a Response. `canGit()`: the new
 * customer tab may count code from git (on the server, or in the launcher on its computer; never in the
 * HTML file on its own, which can reach nothing).
 */
export function initCalculator({ api, $, esc, toast, setStatus, showError, handleAuthLoss, fmtDateTime, me, can, standalone = false, sampleFile = null, canRead = () => !standalone, canGit = () => !standalone, impactOn = () => false, estimateOf = () => null, sure = async (message) => window.confirm(message) }) {
  // What the parts of the page that live in their own files (page-*.js) read from it: each thing by name, looked up
  // when it is used (so one made further down is found too), and set where a part changes it.
  const d = {
    get $() { return $; },
    get api() { return api; },
    get appLook() { return appLook; },
    get applyAll() { return applyAll; },
    get applyScope() { return applyScope; },
    get autoRead() { return autoRead; },
    get BASES() { return BASES; },
    get basis() { return basis; },
    get blocksWhy() { return blocksWhy; },
    get bytes() { return bytes; },
    get c() { return c; },
    get can() { return can; },
    get canGit() { return canGit; },
    get cleanUrl() { return cleanUrl; },
    get countAgain() { return countAgain; },
    get countLabel() { return countLabel; },
    get counts() { return counts; },
    get download() { return download; },
    get esc() { return esc; },
    get estimate() { return estimate; },
    get estimateOf() { return estimateOf; },
    get fillImpact() { return fillImpact; },
    get flush() { return flush; },
    get fmtDateTime() { return fmtDateTime; },
    get fnew() { return fnew; },
    get fnewCounts() { return fnewCounts; },
    get fnewEstimate() { return fnewEstimate; },
    get fnewKpi() { return fnewKpi; },
    get fnewOff() { return fnewOff; },
    get FREQ_LABEL() { return FREQ_LABEL; },
    get FROM_LABEL() { return FROM_LABEL; },
    get fusion() { return fusion; },
    get fusionCounts() { return fusionCounts; },
    get fusionOff() { return fusionOff; },
    get fusionOn() { return fusionOn; },
    get gateImpact() { return gateImpact; },
    get git() { return git; },
    get GIT_ADDRESS() { return GIT_ADDRESS; },
    get handleAuthLoss() { return handleAuthLoss; },
    get horizon() { return horizon; },
    get hostSwitched() { return hostSwitched; },
    get impactOn() { return impactOn; },
    get knownOrigins() { return knownOrigins; },
    get lastMade() { return lastMade; },
    set lastMade(v) { lastMade = v; },
    get leaveStream() { return leaveStream; },
    get leftOutCounts() { return leftOutCounts; },
    get loadReports() { return loadReports; },
    get me() { return me; },
    get modelOptions() { return modelOptions; },
    get modelsWarn() { return modelsWarn; },
    get narrowed() { return narrowed; },
    get next() { return next; },
    get num() { return num; },
    get offline() { return offline; },
    get OPEN_KEY() { return OPEN_KEY; },
    get placeFusion() { return placeFusion; },
    get readCxOne() { return readCxOne; },
    get readFinished() { return readFinished; },
    get reading() { return reading; },
    get recountBacklog() { return recountBacklog; },
    get renderBasis() { return renderBasis; },
    get renderFusion() { return renderFusion; },
    get renderFusionNew() { return renderFusionNew; },
    get renderHorizon() { return renderHorizon; },
    get renderKpis() { return renderKpis; },
    get renderOrgs() { return renderOrgs; },
    get renderPending() { return renderPending; },
    get renderProjects() { return renderProjects; },
    get renderReadNote() { return renderReadNote; },
    get renderRepos() { return renderRepos; },
    get renderRules() { return renderRules; },
    get renderScope() { return renderScope; },
    get renderSummary() { return renderSummary; },
    get renderTop() { return renderTop; },
    get renderTr() { return renderTr; },
    get reportData() { return reportData; },
    get reportHtml() { return reportHtml; },
    get ROWS_FIRST() { return ROWS_FIRST; },
    get ROWS_PAGE() { return ROWS_PAGE; },
    get rowsShown() { return rowsShown; },
    set rowsShown(v) { rowsShown = v; },
    get sampleFile() { return sampleFile; },
    get save() { return save; },
    get savedAt() { return savedAt; },
    get saveFnew() { return saveFnew; },
    get saveFusion() { return saveFusion; },
    get scope() { return scope; },
    get scoped() { return scoped; },
    get setNext() { return setNext; },
    get setStatus() { return setStatus; },
    get show() { return show; },
    get showError() { return showError; },
    get shown() { return shown; },
    get showWay() { return showWay; },
    get sortedRows() { return sortedRows; },
    get SOURCE_LABEL() { return SOURCE_LABEL; },
    get standalone() { return standalone; },
    get sure() { return sure; },
    get syncDraft() { return syncDraft; },
    get toast() { return toast; },
    get totals() { return totals; },
    get tr() { return tr; },
    get trEngines() { return trEngines; },
    get trFigures() { return trFigures; },
    get trShareOf() { return trShareOf; },
    get upsertMeasured() { return upsertMeasured; },
    get way() { return way; },
    set way(v) { way = v; },
    get WAY_STORE() { return WAY_STORE; },
    get WAYS() { return WAYS; },
  };
  // On its own with no way to Checkmarx One (the HTML file opened from disk): the two exports are the way in.
  const offline = () => standalone && !canRead();
  const c = { customers: [], open: null, pending: null, timer: null, saving: null, draft: {}, dirty: {}, present: false, remainingCredits: null, reports: [] };
  const num = (n, digits = 0) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits }));
  const pct = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  // The report is written in the language the page is in.
  // The report generated last, for its PDF summary (only while its customer is open).
  let lastMade = null;
  // The script a report carries for its levers (report-live.js, bundled): in the standalone files, kept in
  // the page; on the server, asked for once. Without it (or for a report made before the levers) the report has none.
  let runtime = null;
  const runtimeReady = () => {
    runtime ??= (async () => {
      const kept = document.getElementById('cx-report-runtime');
      return kept ? JSON.parse(kept.textContent) : api('/api/projections/report-runtime', { quiet: true });
    })().catch(() => (runtime = null));
    return runtime;
  };
  /** The report's own phrases in the page's language: those translated, for its script to write them again. */
  const reportWords = (phrases = []) => (currentLanguage() === 'en' ? {} : Object.fromEntries(phrases.map((p) => [p, t(p)]).filter(([en, out]) => out && out !== en)));
  /** The report's file, in the page's language: with its levers when its data keeps them. */
  const reportHtml = async (data, generatedAt) => {
    const view = { t, lang: currentLanguage(), dir: RTL.has(currentLanguage()) ? 'rtl' : 'ltr', look: appLook() };
    const script = data.levers ? await runtimeReady() : null;
    if (!script) return buildReport({ ...data, generatedAt }, view);
    const { levers, summary, tr, fusion, ...rest } = data;
    const base = { ...rest, generatedAt, tr: null, fusion: null, impact: data.impact ? true : null };
    const now = leverData(base, levers);
    return buildReport(now, { ...view, live: { inputs: levers, sentInputs: levers, sentTotal: creditSummary(now.tr?.totals?.credits ?? null, fusionTotal(now.fusion, now.fusionNew), now.summary?.settings).total, base, words: reportWords(script.phrases), runtime: { text: script.text, hash: script.hash } } });
  };
  const savedAt = (iso) => `<time datetime="${esc(iso)}" translate="no">${esc(new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</time>`;

  // Kept here, before the page's parts (page-*.js): each is changed in more than one of them.
  // The projects table opens short (the page stays light with thousands of projects); each press shows many more.
  const ROWS_FIRST = 25;
  let rowsShown = ROWS_FIRST;
  // How code not in Checkmarx One is counted: from git, a cloc-fusion report, or cloc results (remembered in this browser).
  const WAY_STORE = 'mz-calc-fnew-way';
  const WAYS = ['git', 'report', 'cloc'];
  let way = (() => {
    try {
      const saved = localStorage.getItem(WAY_STORE);
      return WAYS.includes(saved) ? saved : 'git';
    } catch {
      return 'git';
    }
  })();

  // ---- Customers ----------------------------------------------------------------------------
  const {
    flush, load, renderOrg, save, show,
  } = setupCustomers(d);

  // ---- Triage & remediation -----------------------------------------------------------------
  const {
    fusionCounts, fusionOff, fusionOn, horizon, renderTr, syncDraft, tr, trEngines, trFigures, trShareOf,
  } = setupTr(d);

  // ---- Fusion -------------------------------------------------------------------------------
  const {
    blocksWhy, counts, estimate, fusion, leftOutCounts, modelOptions, modelsWarn, narrowed, renderFusion,
    renderKpis, renderProjects, renderRules, ROWS_PAGE, saveFusion, scope, scoped, shown, sortedRows,
  } = setupFusion(d);

  // ---- Fusion — new customer: code not in Checkmarx One yet, its lines counted from git or with cloc
  const {
    BASES, basis, bytes, cleanUrl, fnew, fnewCounts, fnewEstimate, fnewKpi, fnewOff, git, GIT_ADDRESS,
    hostSwitched, placeFusion, renderBasis, renderFusionNew, saveFnew, showWay, upsertMeasured,
  } = setupCode(d);

  // ---- Several git tokens, one per platform or organisation: kept in this page's memory only, never saved ----
  const { addGitToken, autoCount, countAgain, countLabel, detectProvider, gitTokens, removeGitToken, renderOrgs, renderRepos } = setupGit(d);

  // ---- cloc-fusion: its one-file page to download, and its report to import --------------------------
  const {
    renderHorizon,
  } = setupCloc(d);

  // ---- Scope: which projects count, for both parts (as narrowing the Dashboard) --------------
  const {
    applyAll, applyScope, knownOrigins, next, recountBacklog, renderPending, renderScope, renderTop, setNext,
  } = setupScope(d);

  // ---- Reading Checkmarx One: both tabs come from the tenant's projects and their scans ----------
  const {
    autoRead, leaveStream, readCxOne, readFinished, reading, renderReadNote,
  } = setupRead(d);

  // ---- Projection reports -------------------------------------------------------------------
  const { download, fillImpact, gateImpact, loadReports, renderSummary, reportData, totals } = setupReports(d);
  return {
    load,
    renderOrg,
    // Read Checkmarx One now (Connect): after a read this page is starting by itself, never a second one.
    read: async () => {
      for (let i = 0; i < 50 && reading.starting; i += 1) await new Promise((r) => setTimeout(r, 100));
      if (!reading.timer && c.open) applyAll({ read: true });
    },
    refresh: () => c.open && show(c.open),
    // Close the customer open (the command center's + New): nothing of it stays on the page; it stays saved.
    close: () => {
      if (c.pending) flush();
      show(null);
      const picker = $('calc-customer');
      if (picker) picker.value = '';
    },
    autoRead,
    git: { add: addGitToken, count: () => autoCount(), counting: () => Boolean(git.run || git.autoBusy), list: gitTokens, remove: removeGitToken, detect: detectProvider, onChange: (fn) => (git.onTokens = fn), open: () => document.querySelector('[data-ptabs] [data-pt="fusion-git"]')?.click() },
  };
}

