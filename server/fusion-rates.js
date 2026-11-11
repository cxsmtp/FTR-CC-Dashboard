/**
 * Fusion's AI engines and their rates (credits per 10K lines of code), for the calculator to apply by itself.
 *
 *   - The Admin keeps the organisation's list: each engine's rate, and the default engine for Fusion.
 *   - Leaders and above (users.manage) may set their own team's rate for any engine, and its default engine; a team
 *     below takes the nearest team's choice above it, else the Admin's. "Back to the Admin's rate" removes their own.
 *   - An engine a customer's Checkmarx One offers that has no rate yet is listed (detected), for a rate to be set.
 *
 * The calculator gets each engine's rate when it reads Checkmarx One, and the whole rated list (with the default engine
 * first) for an account that has none yet, so Fusion is always worked out; a rate stays changeable in the calculator.
 */
import { fail } from './store.js';

/** The organisation's starting list (Settings may change every figure). */
export const DEFAULT_FUSION_RATES = {
  models: [
    { name: 'Opus 5.5', creditsPer10k: 2 },
    { name: 'Opus 4.7', creditsPer10k: 2.5 },
    { name: 'Haiku 4.5', creditsPer10k: 1.5 },
    // In the calculator's own list too (the calculator’s CHECKMARX_MODELS): shown as needing a rate until one is set.
    { name: 'Opus 5.0', creditsPer10k: null },
    { name: 'Mythos 5.1', creditsPer10k: null },
  ],
  defaultModel: 'Opus 5.5',
};

/** One engine, however a tenant or a person writes it: "Opus 5.5", "claude-opus-5-5", "Claude Opus 5.5" are the same. */
export const engineKey = (name) => String(name ?? '').toLowerCase().replace(/\b(claude|anthropic)\b/g, '').replace(/[^a-z0-9]+/g, '');

const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
/** A rate: a positive number of credits per 10K LOC, at most 10,000; '' or null for none. */
function cleanRate(v, { allowNone = false } = {}) {
  if ((v === '' || v === null || v === undefined) && allowNone) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 10000) throw fail(400, 'A rate is a number of credits per 10K lines of code, above 0.');
  return Math.round(n * 1000) / 1000;
}

export class FusionRates {
  /** `doc`: the settings Doc (its value holds fusionRates, fusionTeams and fusionDetected). */
  constructor(doc) {
    this.doc = doc;
  }

  get admin() {
    const v = this.doc.value.fusionRates;
    return v && Array.isArray(v.models) ? v : DEFAULT_FUSION_RATES;
  }
  get teams() {
    return this.doc.value.fusionTeams ?? {};
  }
  get detected() {
    const known = new Set(this.admin.models.filter((m) => m.creditsPer10k).map((m) => engineKey(m.name)));
    return (this.doc.value.fusionDetected ?? []).filter((d) => !known.has(engineKey(d.name)));
  }

  /** The Admin's list and default engine, replaced whole. */
  setAdmin({ models, defaultModel }) {
    if (!Array.isArray(models)) throw fail(400, 'Give the engines as a list.');
    const seen = new Set();
    const list = [];
    for (const m of models.slice(0, 40)) {
      const name = cleanName(m?.name);
      if (!name) continue;
      const key = engineKey(name);
      if (!key || seen.has(key)) throw fail(400, `${name || 'An engine'} is listed twice.`);
      seen.add(key);
      list.push({ name, creditsPer10k: cleanRate(m?.creditsPer10k, { allowNone: true }) });
    }
    const def = cleanName(defaultModel);
    if (def && !list.some((m) => engineKey(m.name) === engineKey(def))) throw fail(400, 'The default engine must be one of the engines listed.');
    const before = this.admin;
    this.doc.value.fusionRates = { models: list, defaultModel: def || list.find((m) => m.creditsPer10k)?.name || '' };
    this.doc.save();
    return { before, after: this.doc.value.fusionRates };
  }

  /** A team's own rates ({ engine name: rate | null }) and default engine ('' for the Admin's). null removes its own. */
  setTeam(teamId, { rates = {}, defaultModel } = {}) {
    const own = { rates: { ...(this.teams[teamId]?.rates ?? {}) }, defaultModel: this.teams[teamId]?.defaultModel ?? '' };
    for (const [name, rate] of Object.entries(rates ?? {}).slice(0, 60)) {
      const key = engineKey(name);
      if (!key) continue;
      const value = cleanRate(rate, { allowNone: true });
      if (value === null) delete own.rates[key];
      else own.rates[key] = { name: cleanName(name), creditsPer10k: value };
    }
    if (defaultModel !== undefined) own.defaultModel = cleanName(defaultModel);
    this.doc.value.fusionTeams = { ...this.teams };
    if (!Object.keys(own.rates).length && !own.defaultModel) delete this.doc.value.fusionTeams[teamId];
    else this.doc.value.fusionTeams[teamId] = own;
    this.doc.save();
    return own;
  }

  /**
   * What applies to a team: each engine's rate and where it comes from (the team's own, a team above, or the Admin's),
   * and the default engine. `path` is the team's path from the top (teamPath), the team itself last.
   */
  effective(path = []) {
    const rows = new Map(this.admin.models.map((m) => [engineKey(m.name), { name: m.name, creditsPer10k: m.creditsPer10k, admin: m.creditsPer10k, from: m.creditsPer10k ? 'admin' : null, fromTeam: null }]));
    let defaultModel = this.admin.defaultModel;
    let defaultFrom = 'admin';
    for (const team of path) {
      const own = this.teams[team.id];
      if (!own) continue;
      for (const [key, r] of Object.entries(own.rates ?? {})) {
        const row = rows.get(key) ?? { name: r.name, creditsPer10k: null, admin: null, from: null, fromTeam: null };
        rows.set(key, { ...row, creditsPer10k: r.creditsPer10k, from: 'team', fromTeam: { id: team.id, name: team.name } });
      }
      if (own.defaultModel) {
        defaultModel = own.defaultModel;
        defaultFrom = { id: team.id, name: team.name };
      }
    }
    return { models: [...rows.values()], defaultModel, defaultFrom };
  }

  /** Engines a tenant offers that have no rate anywhere yet: kept for the Admin and leaders to set. */
  noteDetected(names, { by = '', tenant = '' } = {}) {
    const known = new Set(this.admin.models.filter((m) => m.creditsPer10k).map((m) => engineKey(m.name)));
    const list = [...(this.doc.value.fusionDetected ?? [])];
    let changed = false;
    for (const raw of names) {
      const name = cleanName(raw);
      const key = engineKey(name);
      if (!key || known.has(key)) continue;
      const at = list.findIndex((d) => engineKey(d.name) === key);
      if (at >= 0) {
        list[at] = { ...list[at], lastSeen: new Date().toISOString(), times: (list[at].times ?? 1) + 1 };
      } else {
        list.push({ name, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), by, tenant, times: 1 });
      }
      changed = true;
    }
    if (changed) {
      this.doc.value.fusionDetected = list.slice(-100);
      this.doc.save();
    }
  }
}

/** The calculator's model entry for an engine of the organisation's list. */
const catalogModel = (m) => ({ id: `cc-${engineKey(m.name)}`.slice(0, 60), name: m.name, description: 'Rate from the FTR Credits Command Center', creditsPer10k: m.creditsPer10k, source: 'catalog' });

/**
 * The engines a read found, each with the rate that applies where it has none; with none found, the rated list.
 * The default engine goes first, so a projection without a default takes it.
 */
export function rateModels(found = [], eff) {
  const rates = new Map(eff.models.filter((m) => m.creditsPer10k).map((m) => [engineKey(m.name), m]));
  const list = found.length ? found.map((m) => ({ ...m, creditsPer10k: m.creditsPer10k ?? rates.get(engineKey(m.name))?.creditsPer10k ?? null })) : [...rates.values()].map(catalogModel);
  const def = engineKey(eff.defaultModel);
  return [...list.filter((m) => engineKey(m.name) === def), ...list.filter((m) => engineKey(m.name) !== def)];
}

/**
 * A projection as the calculator opens it: each engine without a rate gets the one that applies (a rate already there,
 * typed in the calculator, is kept); rated engines it does not list are added; with no default engine chosen yet, the
 * one that applies is set.
 */
export function withRates(projection, eff) {
  const f = projection?.fusion;
  if (!f || typeof f !== 'object') return projection;
  const models = Array.isArray(f.models) ? f.models : [];
  const rates = new Map(eff.models.filter((m) => m.creditsPer10k).map((m) => [engineKey(m.name), m]));
  const have = new Set(models.map((m) => engineKey(m.name)));
  const filled = models.map((m) => (Number(m.creditsPer10k) > 0 || !rates.has(engineKey(m.name)) ? m : { ...m, creditsPer10k: rates.get(engineKey(m.name)).creditsPer10k }));
  const added = [...rates.values()].filter((m) => !have.has(engineKey(m.name))).map(catalogModel);
  const list = [...filled, ...added].slice(0, 20);
  let defaultModel = f.defaultModel ?? null;
  // the calculator names a default by itself (its newest engine): until the account's Fusion is used, the one that applies here wins.
  const untouched = !(f.projects?.length) && !f.readAt;
  if (untouched || !defaultModel || !list.some((m) => m.id === defaultModel)) defaultModel = list.find((m) => engineKey(m.name) === engineKey(eff.defaultModel))?.id ?? defaultModel ?? null;
  const same = added.length === 0 && filled.every((m, i) => m === models[i]) && defaultModel === (f.defaultModel ?? null);
  return same ? projection : { ...projection, fusion: { ...f, models: list, defaultModel } };
}
