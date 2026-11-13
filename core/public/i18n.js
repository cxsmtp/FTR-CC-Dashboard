// The page in the reader's language: menus, options, buttons and hints.
//
// English is the source. Each other language is one file, public/i18n/<code>.json, mapping the
// English wording to the translation; it is fetched only when that language is chosen, so in
// English nothing here runs beyond reading the saved choice. The page is written in English as
// before, and the words are swapped as they appear: once for the whole page, then for whatever
// the app adds or changes. Anything marked translate="no" (names, findings, logs, code, the
// terms of use) is left exactly as it is, and wording with no translation stays in English.
//
// A sentence with inline markup (<b>, <code>, a link…) is translated as one piece, so its word
// order can follow the language; numbers in a sentence become {0}, {1}… in the key, so
// "Take back 5 unused credits" and "Take back 12 unused credits" share one translation.

export const LANGUAGES = [
  ['en', 'English'],
  ['ja', '日本語'],
  ['zh-TW', '繁體中文（台灣）'],
  ['zh-CN', '简体中文'],
  ['ko', '한국어'],
  ['es', 'Español'],
  ['pt-BR', 'Português (Brasil)'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['ar', 'العربية'],
  ['vi', 'Tiếng Việt'],
  ['th', 'ไทย'],
  ['ms', 'Bahasa Melayu'],
  ['id', 'Bahasa Indonesia'],
  ['he', 'עברית'],
];
const CODES = new Set(LANGUAGES.map(([code]) => code));
/** Written right to left: the page mirrors (dir="rtl"). */
export const RTL = new Set(['ar', 'he']);
/** Offered only where an activation code unlocked them (the server says which, see setAvailable). */
export const GATED = new Set(['he']);
let unlocked = new Set();
/** The gated languages this server offers (from /api/health). Returns whether the current one is still allowed. */
export function setAvailable(codes = []) {
  unlocked = new Set(codes.filter((code) => GATED.has(code)));
  return isAvailable(lang);
}
export const isAvailable = (code) => CODES.has(code) && (!GATED.has(code) || unlocked.has(code));

export const norm = (text) => String(text).replace(/\s+/g, ' ').trim();
const LETTER = /\p{L}/u;
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-label', 'label'];
// Never translated: code and anything typed by or shown for a person.
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'PRE', 'CODE', 'KBD', 'SAMP', 'svg', 'SVG', 'math']);
// Phrasing elements that may sit inside a translated sentence.
const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'A', 'SPAN', 'BR', 'SMALL', 'ABBR', 'SUB', 'SUP', 'MARK', 'U', 'S', 'Q', 'TIME', 'WBR', 'CODE', 'KBD']);

let lang = 'en';
let dict = null; // Map: English → translation
const textDone = new WeakMap(); // Text node → { src, out }
const attrDone = new WeakMap(); // Element → Map(attribute → { src, out })
const htmlDone = new WeakMap(); // Element → { src, out }

export const currentLanguage = () => lang;

/**
 * The translation of `text` in `strings` (a Map), or null when there is none: the exact
 * wording first, then with its numbers as {0}, {1}…; with a context ("date"), its own
 * entry ("date|To") first, then the plain one.
 */
export function translate(strings, text, context = '') {
  if (!strings) return null;
  if (context) {
    const own = translate(strings, `${context}|${text}`);
    if (own != null) return own;
  }
  const hit = strings.get(text);
  if (hit !== undefined) return hit;
  if (!/\d/.test(text)) return null;
  const numbers = [];
  const key = text.replace(/\d+/g, (digits) => `{${numbers.push(digits) - 1}}`);
  const pattern = strings.get(key);
  if (pattern !== undefined) return pattern.replace(/\{(\d+)\}/g, (whole, i) => numbers[i] ?? whole);
  // "43.3 h" or "19,151": a number with decimals or thousands separators is one {0} too.
  if (!/\d[.,\u00a0\u202f]\d/.test(text)) return null;
  const whole = [];
  const grouped = strings.get(text.replace(/\d+(?:[.,\u00a0\u202f]\d+)*/g, (n) => `{${whole.push(n) - 1}}`));
  return grouped === undefined ? null : grouped.replace(/\{(\d+)\}/g, (all, i) => whole[i] ?? all);
}
const lookup = (text) => translate(dict, text);

/** Translate English wording for code that builds text itself (dialogs, the busy line). */
export function t(text) {
  if (lang === 'en' || text == null) return text;
  const source = String(text);
  const key = norm(source);
  if (!key) return source;
  const out = lookup(key);
  if (out != null) return out;
  // A message of several lines: each line on its own.
  return source.includes('\n') ? source.split('\n').map((line) => (norm(line) ? lookup(norm(line)) ?? line : line)).join('\n') : source;
}

/** Is everything inside this element plain text and inline markup, without ids (which the app looks up)? */
function inlineOnly(el) {
  for (const child of el.childNodes) {
    if (child.nodeType === 1) {
      if (!INLINE.has(child.tagName) || child.id || child.getAttribute('translate') === 'no' || !inlineOnly(child)) return false;
    } else if (child.nodeType !== 3 && child.nodeType !== 8) return false;
  }
  return true;
}

/** A sentence with markup in it, translated whole: it has its own words and at least one inline element. */
function isSentence(el) {
  if (SKIP.has(el.tagName) || INLINE.has(el.tagName) && el.tagName !== 'SPAN' && el.tagName !== 'A') return false;
  let element = false;
  let words = false;
  for (const child of el.childNodes) {
    if (child.nodeType === 1) element = true;
    else if (child.nodeType === 3 && LETTER.test(child.nodeValue)) words = true;
  }
  return element && words && inlineOnly(el);
}

// A word that means two things ("To": an email's recipients, or the end of a date range) is told
// apart by data-i18n-ctx on an element around it: "date|To" is looked up first, then "To".
const contextOf = (el) => el?.closest?.('[data-i18n-ctx]')?.dataset.i18nCtx ?? '';

// What a translated sentence may hold: the inline elements above, with these attributes. Anything
// else in a translation (a script or image element, an event handler, a javascript: link…) is shown as
// text or dropped, so a translation file, or a report's words from a server or this browser's
// storage, can change wording only.
const SAFE_TAGS = new Set([...INLINE].map((tag) => tag.toLowerCase()));

/**
 * Every piece of English the page would translate under `root`, as it would look it up: for
 * building and checking the translation files (scripts/i18n-collect.mjs).
 */
export function collect(root = document.documentElement) {
  const found = [];
  const add = (text, kind, el) => {
    if (!text || !LETTER.test(text)) return;
    const ctx = contextOf(el);
    const key = ctx ? `${ctx}|${text}` : text;
    const heading = el?.closest?.('section, fieldset, details, dialog, .panel, .card')?.querySelector?.('h1, h2, h3, legend, summary');
    found.push({ key, kind, tag: el?.tagName?.toLowerCase() ?? '', near: heading ? norm(heading.textContent).slice(0, 80) : '' });
  };
  const visit = (node) => {
    if (node.nodeType === 3) return add(norm(node.nodeValue), 'text', node.parentElement);
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
    if (node.getAttribute('translate') === 'no') {
      for (const yes of node.querySelectorAll('[translate="yes"]')) if (yes.parentElement.closest('[translate]') === node) visit(yes);
      return;
    }
    for (const name of ATTRS) if (node.getAttribute(name)) add(norm(node.getAttribute(name)), `attr:${name}`, node);
    if (isSentence(node)) {
      add(norm(node.innerHTML), 'html', node);
      for (const child of node.querySelectorAll('*')) for (const name of ATTRS) if (child.getAttribute(name)) add(norm(child.getAttribute(name)), `attr:${name}`, child);
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  };
  visit(root);
  return found;
}
