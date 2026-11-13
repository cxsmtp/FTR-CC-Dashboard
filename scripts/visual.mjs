// A safety net for changes that must not change how anything looks (removing unused styles, splitting files): every
// page and every calculator tab is photographed, and compared with the photographs taken before the change.
//
//   node scripts/visual.mjs take   <folder>              photograph into <folder>
//   node scripts/visual.mjs check  <before> <after>      photograph into <after>, compare with <before>
//   node scripts/visual.mjs compare <before> <after>     compare two folders already taken
//
// It needs Playwright (not a dependency of the product: a development tool) and a server to look at:
//   BASE (default http://localhost:8089), EMAIL, PASSWORD, LOOK (another look, as mode:accent, e.g. dark:command), and optionally ACCOUNT (an account's name, opened in the
//   calculator and as a side panel). Run it against a copy of the data, never the live one: it only reads, but it
//   signs in.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8089';
const EMAIL = process.env.EMAIL ?? 'admin@corp.example';
const PASSWORD = process.env.PASSWORD ?? '';
const WIDTH = Number(process.env.WIDTH ?? 1440);
/** How much of a picture may differ before it counts (clocks and "2 h ago" move a little between runs). */
const ALLOW = Number(process.env.ALLOW ?? 0.002);

const PAGES = ['overview', 'accounts', 'people/people', 'people/roles', 'people/signin', 'teams', 'rates', 'audit', 'activity', 'admin/general', 'admin/branding', 'admin/email', 'admin/sso', 'admin/https', 'admin/updates', 'admin/backups', 'guide', 'help', 'about', 'profile'];

async function take(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Nothing that moves or blinks: the same picture every time.
  const still = () => page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } .toast { display: none !important; }' }).catch(() => {});
  const shot = async (name) => {
    await still();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
  };
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('input[name=email]');
  await shot('00-login');
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('#main h1', { timeout: 30000 });
  await page.waitForTimeout(1500);
  // LOOK=dark:command photographs another look (mode:accent), set as the signed-in person's own.
  if (process.env.LOOK) {
    const [mode, accent] = process.env.LOOK.split(':');
    await page.evaluate(async ([m, a]) => {
      const me = await (await fetch('/api/me')).json();
      await fetch('/api/me/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf }, body: JSON.stringify({ mode: m, ...(a ? { accent: a } : {}) }) });
    }, [mode, accent]);
    await page.reload();
    await page.waitForSelector('#main h1', { timeout: 30000 });
  }
  const accounts = await page.evaluate(async () => (await (await fetch('/api/accounts')).json()).accounts ?? []);
  const wanted = accounts.find((a) => a.name === (process.env.ACCOUNT ?? '')) ?? accounts[0];
  for (const [i, pg] of PAGES.entries()) {
    await page.goto(`${BASE}/#/${pg}`);
    await page.waitForTimeout(1200);
    await shot(`${String(i + 1).padStart(2, '0')}-${pg.replace(/\//g, '-')}`);
  }
  if (wanted) {
    await page.goto(`${BASE}/#/accounts/${wanted.id}`);
    await page.waitForSelector('#acct-body h1', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    await shot('30-account-panel');
    await page.goto(`${BASE}/calculator?team=${wanted.teamId}&account=${wanted.id}`);
    await page.waitForTimeout(5000);
    for (const tab of await page.$$eval('[data-ptabs="calculator"] [data-pt]', (x) => x.filter((e) => !e.hidden).map((e) => e.dataset.pt))) {
      await page.click(`[data-ptabs="calculator"] [data-pt="${tab}"]`).catch(() => {});
      await page.waitForTimeout(900);
      await shot(`40-calculator-${tab}`);
      // Everything folded is opened once, so what sits inside is compared too.
      await page.evaluate(() => document.querySelectorAll('[data-ptpanel]:not([hidden]) details').forEach((d) => (d.open = true)));
      await page.waitForTimeout(400);
      await shot(`41-calculator-${tab}-open`);
    }
    await page.goto(`${BASE}/calculator`);
    await page.waitForTimeout(3000);
    await shot('50-calculator-fresh');
  }
  await browser.close();
  return errors;
}

async function compare(before, after) {
  const names = fs.readdirSync(before).filter((f) => f.endsWith('.png')).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = [];
  for (const name of names) {
    const b = path.join(after, name);
    if (!fs.existsSync(b)) {
      out.push({ name, missing: true });
      continue;
    }
    const [x, y] = [fs.readFileSync(path.join(before, name)).toString('base64'), fs.readFileSync(b).toString('base64')];
    // Compared in the browser (its own canvas): no picture library needed.
    const r = await page.evaluate(async ([p, q]) => {
      const load = (d) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `data:image/png;base64,${d}`; });
      const [a, c] = await Promise.all([load(p), load(q)]);
      const w = Math.max(a.width, c.width);
      const h = Math.max(a.height, c.height);
      const data = (img) => { const cv = new OffscreenCanvas(w, h); const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
      const [d1, d2] = [data(a), data(c)];
      let diff = 0;
      let top = h;
      let bottom = 0;
      for (let i = 0; i < d1.length; i += 4) {
        if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 48) {
          diff += 1;
          const row = Math.floor(i / 4 / w);
          if (row < top) top = row;
          if (row > bottom) bottom = row;
        }
      }
      return { share: diff / (w * h), sizeChanged: a.width !== c.width || a.height !== c.height, from: [a.width, a.height], to: [c.width, c.height], rows: diff ? [top, bottom] : null };
    }, [x, y]);
    out.push({ name, ...r });
  }
  await browser.close();
  return out;
}

const [mode, one, two] = process.argv.slice(2);
if (mode === 'take') {
  const errors = await take(one);
  console.log(`Photographed into ${one}${errors.length ? `; page errors: ${errors.slice(0, 5).join(' | ')}` : ''}`);
} else if (mode === 'check' || mode === 'compare') {
  const errors = mode === 'check' ? await take(two) : [];
  const results = await compare(one, two);
  const changed = results.filter((r) => r.missing || r.sizeChanged || r.share > ALLOW);
  for (const r of results) {
    const mark = r.missing ? 'MISSING' : r.sizeChanged ? `SIZE ${r.from.join('x')} -> ${r.to.join('x')}` : r.share > ALLOW ? `DIFFERS ${(r.share * 100).toFixed(2)}% (rows ${r.rows.join('-')})` : 'same';
    if (mark !== 'same' || process.env.ALL) console.log(`${r.name.padEnd(44)} ${mark}`);
  }
  console.log(`${results.length - changed.length} of ${results.length} pictures the same${errors.length ? `; page errors: ${errors.slice(0, 5).join(' | ')}` : ''}`);
  process.exitCode = changed.length ? 1 : 0;
} else {
  console.log('node scripts/visual.mjs take <folder> | check <before> <after> | compare <before> <after>');
  process.exitCode = 2;
}
