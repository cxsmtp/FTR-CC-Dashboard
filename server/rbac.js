/**
 * Who may do what, and over which accounts.
 *
 * Two things decide it, as in CxMissionZero (src/iam.js):
 *
 *  1. The role: a set of permissions. Five are built in (Admin, Executive, Leader, Sales Engineer, Viewer);
 *     an Admin can add others. Nobody can hand out more than they hold.
 *  2. The team structure: teams form a tree (Global → EMEA → EMEA North …). Every person belongs to one team;
 *     a team has one or more leaders. Accounts (customers) belong to a team.
 *
 * What a person sees and works on:
 *   - their own team's accounts: everyone in a team can open and generate projections for every account in it;
 *   - every team below the teams they lead (a leader sees all their SEs and the leaders under them);
 *   - everything, with "See every team" (Admin, Executive);
 *   - never another team's accounts otherwise.
 */
import { fail } from './store.js';

export const PERMISSIONS = [
  { id: 'calculator.use', group: 'Projections', label: 'Use the calculator', description: 'Open the Cx Credits Calculator, add accounts and generate projection reports for the accounts of the teams they work in.' },
  { id: 'reports.share', group: 'Projections', label: 'Mark reports shared and primary', description: 'Mark which report is the primary one for an account and record when a report was shared with the customer.' },
  { id: 'sales.record', group: 'Projections', label: 'Record credits sold', description: 'Record the credits actually sold for an account (one or many sales), so what is still needed against its projection is known. People remove their own records; with "Delete any report" anyone\u2019s.' },
  { id: 'reports.delete', group: 'Projections', label: 'Delete any report', description: 'Delete projection reports of the teams in scope. Without it, people can delete only their own reports not yet shared with a customer.' },
  { id: 'accounts.delete', group: 'Projections', label: 'Delete accounts', description: 'Delete an account and every report made for it.' },
  { id: 'dashboard.view', group: 'Dashboards', label: 'See the dashboards', description: 'The overview, teams, people and accounts in their scope.' },
  { id: 'dashboard.export', group: 'Dashboards', label: 'Export', description: 'Download the accounts and reports in scope as CSV.' },
  { id: 'scope.all', group: 'Scope', label: 'See every team', description: 'Every team and account, whatever team they are in (Executives, Admins).' },
  { id: 'teams.manage', group: 'Administration', label: 'Manage teams', description: 'Create, rename, move and remove teams and choose their leaders.' },
  { id: 'users.manage', group: 'Administration', label: 'Manage people', description: 'Invite people into the teams in their scope, give them a role and a team, reset their password, unlock them, sign them out, turn them off; never beyond their own permissions.' },
  { id: 'roles.manage', group: 'Administration', label: 'Manage roles', description: 'Create and change roles; never with permissions they do not hold.' },
  { id: 'audit.view', group: 'Administration', label: 'See the audit log', description: 'Who signed in, who changed what, every report generated and shared.' },
  { id: 'security.https', group: 'Administration', label: 'HTTPS and certificates', description: 'Upload and replace the server certificate, get one from Let\u2019s Encrypt, and move the server from http to HTTPS only. Admin only.', special: true },
  { id: 'security.sso', group: 'Administration', label: 'Single sign-on (SAML)', description: 'Connect the company identity provider for sign-in. Admin only.', special: true },
  { id: 'system.update', group: 'Administration', label: 'Updates and rollback', description: 'Install new versions (checked against their checksums), turn on auto-update and roll back. Admin only.', special: true },
  { id: 'backup.manage', group: 'Administration', label: 'Backups and restore', description: 'Take, download and restore backups (they hold every account, person and key). Admin only.', special: true },
  { id: 'settings.manage', group: 'Administration', label: 'Settings', description: 'Organisation name, the hosts the server may call, the email server and the troubleshooting report. Admin only.', special: true },
];
export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);

export const DEFAULT_ROLES = {
  admin: { name: 'Admin', description: 'Everything: people, teams, roles, settings and every account.', permissions: PERMISSION_IDS, builtin: true, locked: true, home: 'overview' },
  executive: { name: 'Executive', description: 'Every team and account: work on them, export, and manage people, teams and roles everywhere. Not the Admin settings.', permissions: ['calculator.use', 'reports.share', 'sales.record', 'reports.delete', 'accounts.delete', 'dashboard.view', 'dashboard.export', 'scope.all', 'audit.view', 'users.manage', 'teams.manage', 'roles.manage'], builtin: true, home: 'overview' },
  leader: { name: 'Leader', description: 'Their own team and every team below the ones they lead: dashboards, projections, primary and shared reports, and their people (invite, change, reset, turn off).', permissions: ['calculator.use', 'reports.share', 'sales.record', 'reports.delete', 'accounts.delete', 'dashboard.view', 'dashboard.export', 'users.manage'], builtin: true, home: 'overview' },
  se: { name: 'Sales Engineer', description: 'Their team’s accounts: generate projections, mark the primary report and record what was shared with the customer.', permissions: ['calculator.use', 'reports.share', 'sales.record', 'dashboard.view'], builtin: true, home: 'calculator' },
  // For when the sales team joins: what was projected and sold for their teams' accounts, and recording sales.
  sales: { name: 'Sales', description: 'Account executives: the dashboards and accounts of their team, every projection and report, and recording the credits sold. Not the calculator.', permissions: ['dashboard.view', 'dashboard.export', 'sales.record'], builtin: true, home: 'accounts' },
  salesLeader: { name: 'Sales Leader', description: 'Sales leaders: what Sales sees for every team below the ones they lead, recording sales, and managing their sales people.', permissions: ['dashboard.view', 'dashboard.export', 'sales.record', 'users.manage'], builtin: true, home: 'overview' },
  viewer: { name: 'Viewer', description: 'Read only: the dashboards of their team (and teams they lead).', permissions: ['dashboard.view'], builtin: true, home: 'overview' },
};

export const cleanPermissions = (list) => [...new Set((Array.isArray(list) ? list : []).filter((p) => PERMISSION_IDS.includes(p)))];
/** Held by the Admin role alone (HTTPS, single sign-on, updates, backups, settings): never by another role, not even a leader's. */
export const ADMIN_ONLY = PERMISSIONS.filter((p) => p.special).map((p) => p.id);

/** The teams as a tree: children by parent. */
export function teamTree(teams) {
  const children = new Map();
  for (const t of teams) {
    const key = t.parentId ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(t);
  }
  return children;
}

/** A team and every team below it. */
export function subtree(teams, rootId) {
  const children = teamTree(teams);
  const out = new Set();
  const walk = (id) => {
    if (out.has(id)) return;
    out.add(id);
    for (const c of children.get(id) ?? []) walk(c.id);
  };
  if (teams.some((t) => t.id === rootId)) walk(rootId);
  return out;
}

/** The path from the top to a team: [Global, EMEA, EMEA North]. */
export function teamPath(teams, id) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const out = [];
  for (let t = byId.get(id), n = 0; t && n < 50; t = byId.get(t.parentId), n++) out.unshift(t);
  return out;
}

/** Would making `parentId` the parent of `id` make a loop? */
export function wouldLoop(teams, id, parentId) {
  if (!parentId) return false;
  return subtree(teams, id).has(parentId);
}

/**
 * The teams a person works in: their own team, every team below each team they lead, or every team.
 * The same set decides what they see and what they may work on (with the calculator permission).
 */
export function scopeOf(user, permissions, teams) {
  if (!user) return new Set();
  if (permissions.has('scope.all')) return new Set(teams.map((t) => t.id));
  const out = new Set();
  if (user.teamId && teams.some((t) => t.id === user.teamId)) out.add(user.teamId);
  for (const t of teams) if ((t.leaderIds ?? []).includes(user.id)) for (const id of subtree(teams, t.id)) out.add(id);
  return out;
}

/** The people a person can see: everyone in the teams in their scope, and themselves. */
export function peopleInScope(user, scope, users) {
  return users.filter((u) => u.id === user.id || scope.has(u.teamId));
}

/** Refuse unless the permission is held. */
export function need(permissions, id) {
  if (!permissions.has(id)) throw fail(403, 'Your role does not allow that.');
}

/** Refuse a team outside the scope. */
export function needTeam(scope, teamId) {
  if (!teamId || !scope.has(teamId)) throw fail(403, 'That team is not one you work in.');
}

/** Where a role lands after signing in (Roles & permissions → Home page). */
export const HOMES = ['overview', 'calculator', 'accounts', 'activity', 'guide'];
/** A role's home page: its own, else what its built-in kind would have (an SE works in the calculator). */
export const homeOf = (id, role) => (HOMES.includes(role?.home) ? role.home : id === 'se' ? 'calculator' : id === 'sales' ? 'accounts' : role?.permissions?.includes?.('dashboard.view') ? 'overview' : 'guide');
