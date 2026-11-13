/**
 * What each Fusion project's scans used (Labs → Fusion results): the model its latest Fusion scan ran with,
 * its lines of code, how many AI scans it had over a period, and the Checkmarx One credits it used then.
 *
 *   - Scan type: Fusion when the latest scan ran the AI engine with Fusion on (scan.config.ai.fusionEnabled, in the
 *     scan's own settings), LAST when it ran it with Fusion off (LLM-based scanning), none otherwise.
 *   - Model: the latest scan's own configuration when it says (`llmModel`); else what Checkmarx One resolved for
 *     that scan (GET /api/configuration/scan), with where it was set: the project, the tenant, or Checkmarx One's
 *     own ("Environment"). Each is said with where it came from.
 *   - What the AI added: the scan's steps (GET /api/scans/{id}/workflow): "Deduplicated 47 out of 273 total
 *     results" is 273 found, 47 already found by the traditional engine, 226 added.
 *   - Lines of code and files: the latest scan's SAST details and metadata (GET /api/sast-metadata?scan-ids=…).
 *   - AI scans: the completed scans over the period that ran the AI engine, Fusion's and LAST's apart.
 *   - The tenant's credits (GET /api/credits/info) and AI settings (GET /api/configuration/tenant).
 *   - Credits: GET /api/credits/consumption?viewBy=project (as CxCreditGuard reads it): each project's credits
 *     over the period, with how many AI Triage and AI Remediation actions it took. The rest (at 1 credit a
 *     triage and 3 a remediation) is what its Fusion scans used, an estimate the page says is one.
 * Read-only; a part Checkmarx One does not answer (no permission, an older tenant) is left unknown, never 0.
 */
import { isProbeMiss } from './cxone/discovery.js';

const text = (v, max = 120) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));

const quiet = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    if (isProbeMiss(error) || [400, 401, 403].includes(error.status)) return null;
    throw error;
  }
};

/** The models a "LLM Model" setting offers (its valuetypeparams: "opus-4.7,haiku-4.5,…"). */
export function modelChoices(entry) {
  return [...new Set(String(entry?.valuetypeparams ?? '').split(',').map((m) => text(m, 60).trim()).filter(Boolean))].slice(0, 20);
}

/** Every page of credit consumption by project over the period (null when Checkmarx One does not answer). */
async function consumption(client, period, trace) {
  const items = [];
  for (let page = 1; page <= 50; page += 1) {
    const body = await quiet(() => client.request('/api/credits/consumption', { query: { viewBy: 'project', period, page, size: 100, sort_by: 'creditsUsed', sort_order: 'desc' }, retries: 1, background: true, trace }));
    if (!body) return page === 1 ? null : items;
    const rows = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
    items.push(...rows);
    const pages = Number(body?.totalPages);
    if (!rows.length || (Number.isFinite(pages) ? page >= pages : rows.length < 100)) break;
  }
  return items;
}

