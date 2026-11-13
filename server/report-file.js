// A saved report as the file the calculator downloads: the same builder, the same levers, made here so the account's
// page can hand it over without opening the calculator.
import { buildReport, reportFileName } from '../core/public/calculator/report.js';
import { leverData } from '../core/public/calculator/levers.js';
import { creditSummary, fusionTotal } from '../core/public/calculator/model.js';

const t = (text) => text;

/** `{ name, html }` for a stored report, in the look the person uses (Standard or Command Center, light or dark). */
export async function reportFile(report, { accent = 'aurora', theme = 'light', ops = 'green' } = {}) {
  const data = report.data;
  const generatedAt = report.createdAt;
  const command = accent === 'command';
  const view = { t, lang: 'en', dir: 'ltr', look: { look: `cc-${command ? 'command' : 'aurora'}`, ui: 'nextgen', theme: theme === 'dark' ? 'dark' : 'light', accent: command ? ops : '' } };
  const name = reportFileName(report.customer, generatedAt);
  let script = null;
  if (data.levers) {
    try {
      script = (await import('../core/src/calculator-bundle.js')).reportRuntime();
    } catch {
      script = null;
    }
  }
  if (!script) return { name, html: buildReport({ ...data, generatedAt }, view) };
  const { levers, summary, tr, fusion, ...rest } = data;
  void summary, tr, fusion;
  const base = { ...rest, generatedAt, tr: null, fusion: null, impact: data.impact ? true : null };
  const now = leverData(base, levers);
  const sentTotal = creditSummary(now.tr?.totals?.credits ?? null, fusionTotal(now.fusion, now.fusionNew), now.summary?.settings).total;
  return { name, html: buildReport(now, { ...view, live: { inputs: levers, sentInputs: levers, sentTotal, base, words: {}, runtime: { text: script.text, hash: script.hash } } }) };
}
