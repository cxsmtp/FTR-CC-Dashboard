/** The team structure: a tree of teams (Global → regions → sub-teams), each with its leaders. */
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { Doc, fail } from './store.js';
import { wouldLoop } from './rbac.js';

const clean = (v, max = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export class Teams {
  constructor(dataDir) {
    this.doc = new Doc(path.join(dataDir, 'teams.json'), () => ({ teams: [] }));
  }
  list() {
    return this.doc.value.teams;
  }
  get(id) {
    return this.list().find((t) => t.id === id) ?? null;
  }
  create({ name, parentId = null, region = '', leaderIds = [] }) {
    const label = clean(name);
    if (!label) throw fail(400, 'Give the team a name.');
    if (parentId && !this.get(parentId)) throw fail(400, 'The team above it no longer exists.');
    const team = { id: randomUUID(), name: label, region: clean(region, 60), parentId: parentId || null, leaderIds: [...new Set(leaderIds)].slice(0, 20), createdAt: new Date().toISOString() };
    this.list().push(team);
    this.doc.save();
    return team;
  }
  update(id, { name, parentId, region, leaderIds }) {
    const team = this.get(id);
    if (!team) throw fail(404, 'That team no longer exists.');
    if (name !== undefined) team.name = clean(name) || team.name;
    if (region !== undefined) team.region = clean(region, 60);
    if (parentId !== undefined) {
      if (parentId && !this.get(parentId)) throw fail(400, 'The team above it no longer exists.');
      if (parentId === id || wouldLoop(this.list(), id, parentId)) throw fail(400, 'A team cannot sit below itself or one of its own teams.');
      team.parentId = parentId || null;
    }
    if (leaderIds !== undefined) team.leaderIds = [...new Set((Array.isArray(leaderIds) ? leaderIds : []).map(String))].slice(0, 20);
    this.doc.save();
    return team;
  }
  remove(id, { hasMembers, hasAccounts }) {
    const team = this.get(id);
    if (!team) throw fail(404, 'That team no longer exists.');
    if (this.list().some((t) => t.parentId === id)) throw fail(409, 'Move or remove the teams below it first.');
    if (hasMembers) throw fail(409, 'Move its people to another team first.');
    if (hasAccounts) throw fail(409, 'Move its accounts to another team first.');
    this.doc.value.teams = this.list().filter((t) => t.id !== id);
    this.doc.save();
  }
  /** Someone removed: no longer leads anything. */
  forget(userId) {
    let changed = false;
    for (const t of this.list()) {
      if (t.leaderIds?.includes(userId)) {
        t.leaderIds = t.leaderIds.filter((x) => x !== userId);
        changed = true;
      }
    }
    if (changed) this.doc.save();
  }
}
