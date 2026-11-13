// Takes out of a stylesheet the rules that nothing in the product can match any more: a rule is dead when every one
// of its selectors names a class, an id or a data- attribute that appears nowhere in what the product ships (its
// markup and its scripts). It errs on the side of keeping: a name that appears anywhere as a word counts as used,
// names built in a script (`calc-fh-${kind}`) keep everything that starts the same way, and :not() / :is() / :where()
// are never a reason to remove a rule.
//
//   node scripts/prune-css.mjs <stylesheet> [...more]        prints what would go
//   node scripts/prune-css.mjs --write <stylesheet> [...]    rewrites them
//
// What the product ships is read from the hosted calculator's page as the server builds it (server/calculator.js),
// without its own <style>, and from the dashboard's scripts and page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function shipped() {
  const { calculatorPage } = await import('../server/calculator.js');
  const page = calculatorPage().html.replace(/<style>[\s\S]*?<\/style>/, '');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const more = [...walk(path.join(ROOT, 'public', 'js')), path.join(ROOT, 'public', 'index.html'), ...walk(path.join(ROOT, 'core', 'public', 'calculator')).filter((f) => f.endsWith('.js') && !f.includes('vendor'))].map((f) => fs.readFileSync(f, 'utf8'));
  return [page, ...more].join('\n');
}

/** The stylesheet as a list of items: comments, rules (`selector { … }`), at-rules with a block or without. */
function parse(css, from = 0, to = css.length) {
  const items = [];
  let i = from;
  while (i < to) {
    if (/\s/.test(css[i])) {
      i += 1;
      continue;
    }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? to : end + 2;
      items.push({ kind: 'comment', text: css.slice(i, stop) });
      i = stop;
      continue;
    }
    // The prelude runs to the first `{` or `;` outside brackets, strings and comments.
    let j = i;
    let depth = 0;
    let quote = '';
    for (; j < to; j++) {
      const ch = css[j];
      if (quote) {
        if (ch === '\\') j += 1;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (css.startsWith('/*', j)) j = css.indexOf('*/', j + 2) + 1;
      else if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth -= 1;
      else if (!depth && (ch === '{' || ch === ';')) break;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= to || css[j] === ';') {
      items.push({ kind: 'statement', text: css.slice(i, Math.min(j + 1, to)) });
      i = j + 1;
      continue;
    }
    // The block: to its matching `}`.
    let k = j + 1;
    let open = 1;
    quote = '';
    for (; k < to && open; k++) {
      const ch = css[k];
      if (quote) {
        if (ch === '\\') k += 1;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (css.startsWith('/*', k)) k = css.indexOf('*/', k + 2) + 1;
      else if (ch === '{') open += 1;
      else if (ch === '}') open -= 1;
    }
    const body = css.slice(j + 1, k - 1);
    if (prelude.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(prelude)[1];
      if (['media', 'supports', 'layer', 'container', 'document'].includes(name)) items.push({ kind: 'group', prelude, items: parse(css, j + 1, k - 1) });
      else items.push({ kind: 'at', name, prelude, body });
    } else items.push({ kind: 'rule', prelude, body });
    i = k;
  }
  return items;
}

/** A selector list, split on the commas that are not inside brackets. */
function selectors(prelude) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && !depth) {
      out.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(prelude.slice(start).trim());
  return out.filter(Boolean);
}

/** `selector` without what is inside :not(…), :is(…), :where(…), :has(…): those never make a rule dead here. */
function plain(selector) {
  let out = '';
  for (let i = 0; i < selector.length; i++) {
    const m = /^:(not|is|where|has|matches)\(/.exec(selector.slice(i, i + 10));
    if (!m) {
      out += selector[i];
      continue;
    }
    let depth = 0;
    let j = i + m[0].length - 1;
    for (; j < selector.length; j++) {
      if (selector[j] === '(') depth += 1;
      else if (selector[j] === ')' && !--depth) break;
    }
    i = j;
  }
  return out;
}

export async function prune(css, text = null) {
  const source = text ?? (await shipped());
  const words = new Set(source.match(/[A-Za-z0-9_-]+/g) ?? []);
  // Names built in a script keep everything that starts the same way: `calc-fh-${kind}`, 'calc-' + kind.
  const prefixes = [...new Set([...(source.match(/[A-Za-z][\w-]*-(?=\$\{)/g) ?? []), ...[...source.matchAll(/['"`]([A-Za-z][\w-]*-)['"`]\s*\+/g)].map((m) => m[1])])].filter((p) => p.length >= 3);
  const used = (name) => words.has(name) || prefixes.some((p) => name.startsWith(p));
  const camel = (name) => name.replace(/^data-/, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  const alive = (selector) => {
    const s = plain(selector.replace(/"[^"]*"|'[^']*'/g, '""'));
    for (const m of s.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) if (!used(m[1])) return false;
    for (const m of s.matchAll(/#(-?[A-Za-z_][\w-]*)/g)) if (!used(m[1])) return false;
    for (const m of s.matchAll(/\[\s*(data-[\w-]+)/g)) if (!used(m[1]) && !words.has(camel(m[1]))) return false;
    return true;
  };
  const gone = [];
  const walk = (items) => {
    const kept = [];
    for (const item of items) {
      if (item.kind === 'rule') {
        const all = selectors(item.prelude);
        const live = all.filter(alive);
        if (!live.length) {
          gone.push(item.prelude);
          continue;
        }
        kept.push(live.length === all.length ? item : { ...item, prelude: live.join(', ') });
      } else if (item.kind === 'group') {
        const inner = walk(item.items);
        if (inner.some((x) => x.kind !== 'comment')) kept.push({ ...item, items: inner });
      } else kept.push(item);
    }
    // A comment with no rule left under it (before the next comment, or the end) goes with them.
    return kept.filter((item, i) => item.kind !== 'comment' || (kept[i + 1] && kept[i + 1].kind !== 'comment') || /licen[cs]e|copyright|©/i.test(item.text));
  };
  let items = walk(parse(css));
  // Animations nothing plays any more.
  const print = (list, pad = '') => list.map((item) => (item.kind === 'comment' || item.kind === 'statement' ? `${pad}${item.text}` : item.kind === 'group' ? `${pad}${item.prelude} {\n${print(item.items, `${pad}  `)}\n${pad}}` : `${pad}${item.prelude} {${item.body}}`)).join('\n');
  let out = print(items);
  const dropFrames = (list) => list.filter((item) => {
    if (item.kind === 'group') item.items = dropFrames(item.items);
    if (item.kind !== 'at' || !/keyframes$/.test(item.name)) return true;
    const name = item.prelude.split(/\s+/)[1];
    const elsewhere = out.replace(new RegExp(`@(-webkit-)?keyframes\\s+${name}\\b`, 'g'), '');
    if (new RegExp(`\\b${name}\\b`).test(elsewhere) || used(name)) return true;
    gone.push(item.prelude);
    return false;
  });
  items = dropFrames(items);
  out = `${print(items)}\n`;
  return { css: out, gone };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const text = await shipped();
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const { css, gone } = await prune(before, text);
    console.log(`${file}: ${(before.length / 1e3).toFixed(0)} KB -> ${(css.length / 1e3).toFixed(0)} KB, ${gone.length} rules gone`);
    if (process.env.LIST) console.log(gone.slice(0, Number(process.env.LIST)).join('\n'));
    if (write) fs.writeFileSync(file, css);
  }
}
