import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * How the calculator's page is put together for the browser (server/calculator.js builds the hosted page with it):
 * its modules in the order they are bundled, each wrapped as a function scope (no bundler, nothing installed), its
 * markup (public/calculator.html), and the script a generated report carries so its levers work on their own.
 */

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** The calculator's modules, in the order they are bundled (each one's imports come before it). The last is the page's entry. */
export const MODULES = ['engines.js', 'look.js', 'i18n.js', 'help-tips.js', 'speedsters.js', 'calculator/model.js', 'calculator/charts.js', 'calculator/explain.js', 'calculator/report.js', 'calculator/slides.js', 'calculator/levers.js', 'calculator/profiles.js', 'calculator/page.js', 'links.js', 'calculator/hosted.js'];

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const EXPORT_DECL = /^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * One ES module as a function scope: its imports read from the modules before it, its exports
 * returned. The app's modules only use named imports and `export function|const|let|class`; anything
 * else is refused, so a module written another way fails the build rather than the file.
 */
export function wrapModule(file, source, index) {
  const names = [];
  let code = source.replace(IMPORT, (_, list, from) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), from));
    if (!index.has(target)) throw new Error(`${file}: imports ${from}, which is not bundled`);
    const bindings = list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
    return `const { ${bindings.join(', ')} } = __m[${index.get(target)}];`;
  });
  code = code.replace(EXPORT_DECL, (_, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`${file}: an import or export the bundler does not handle`);
  return `__m[${index.get(file)}] = (() => {\n${code}\nreturn { ${names.join(', ')} };\n})();`;
}

/** The calculator's page (public/calculator.html): its own <div>, shown. */
export function calculatorMarkup(indexHtml) {
  const start = indexHtml.indexOf('<div id="page-calculator"');
  if (start < 0) throw new Error('calculator.html has no calculator page');
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(indexHtml); m; m = tag.exec(indexHtml)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return indexHtml.slice(start, tag.lastIndex).replace(/^<div id="page-calculator" class="page calc-page" hidden>/, '<div id="page-calculator" class="page calc-page">');
  }
  throw new Error('The calculator page in calculator.html does not close');
}

/** The page's words where they speak of the app's server: on its own, the two exports, or the launcher, are the way in. */
export function standaloneMarkup(markup, { launcher = false } = {}) {
  const swaps = [
    ['<summary>Use the two Checkmarx One exports instead</summary>', launcher ? '<summary>Or the two Checkmarx One exports</summary>' : '<summary>The two Checkmarx One exports</summary>'],
    ['<p class="hint">For a prospect whose tenant this server is not connected to: drop their two weekly exports from Checkmarx One → Analytics on the boxes below.</p>', launcher ? '<p class="hint">Without an API key: drop the customer\'s two weekly exports from Checkmarx One → Analytics on the boxes below. <b>Load sample data</b> shows how it works.</p>' : '<p class="hint">Drop the customer\'s two weekly exports from Checkmarx One → Analytics on the boxes below, or click a box to choose the file. <b>Load sample data</b> shows how it works.</p>'],
    ['<p class="hint" id="calc-rows-empty">No projects yet. <strong>Read from Checkmarx One</strong> lists every project in this tenant with its lines of code, criticality and how often it is scanned; or add projects by hand for a prospect.</p>', launcher ? '<p class="hint" id="calc-rows-empty">No projects yet. Connect with an API key at the top, then <strong>Read from Checkmarx One</strong> lists every project in the tenant with its lines of code, criticality and how often it is scanned; or add projects by hand.</p>' : '<p class="hint" id="calc-rows-empty">No projects yet: add them by hand, with their lines of code. To read them from Checkmarx One with an API key, use the launcher, <code>cx-credits-calculator.mjs</code>.</p>'],
    // Count from git: in the launcher, this computer's git fetches and counts (the file on its own says it cannot, and points to cloc-fusion).
    ['is fetched from git into a temporary folder on this server,', launcher ? 'is fetched from git into a temporary folder on this computer,' : 'is fetched from git into a temporary folder on this server,'],
  ];
  let out = markup;
  for (const [from, to] of swaps) {
    if (!out.includes(from)) throw new Error(`The calculator page no longer says: ${from.slice(0, 60)}`);
    out = out.replace(from, to);
  }
  return out;
}

const scriptText = (s) => s.replace(/\r\n?/g, '\n').replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const cache = new Map();
const contentHash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// The script a projection report made with its levers carries (public/calculator/report-live.js and what it imports).
const REPORT_RUNTIME = ['engines.js', 'look.js', 'calculator/model.js', 'calculator/charts.js', 'calculator/explain.js', 'calculator/report.js', 'calculator/slides.js', 'calculator/levers.js', 'calculator/report-live.js'];

/**
 * That script, as written into the report, and the CSP source that allows it alone: the calculator asks for it
 * when it makes a report (GET /calculator/report-live, and the standalone files carry it). Built once per start.
 */
export function reportRuntime({ root = PUBLIC } = {}) {
  const key = `runtime\u0000${root}`;
  if (cache.has(key)) return cache.get(key);
  const index = new Map(REPORT_RUNTIME.map((file, i) => [file, i]));
  const bundle = REPORT_RUNTIME.map((file) => wrapModule(file, fs.readFileSync(path.join(root, file), 'utf8'), index)).join('\n\n');
  const text = `\n${scriptText(`(() => {\n'use strict';\nconst __m = [];\n${bundle}\n})();`)}\n`;
  // Every quoted text in the report's modules: the calculator passes on the translations it has of them.
  const phrases = new Set();
  for (const file of REPORT_RUNTIME) {
    for (const m of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
      const phrase = (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
      if (/\p{L}{2}/u.test(phrase) && /\s/.test(phrase.trim()) || /^[A-Z][a-z]+$/.test(phrase)) phrases.add(phrase);
    }
  }
  const runtime = { text, hash: contentHash(text), phrases: [...phrases] };
  cache.set(key, runtime);
  return runtime;
}
