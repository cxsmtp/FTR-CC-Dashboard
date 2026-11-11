/**
 * People, roles, passwords and sessions. Passwords are hashed with scrypt as CxMissionZero does (src/iam.js);
 * sign-in is locked for 15 minutes after 5 wrong passwords; a new person, or one whose password an Admin reset,
 * signs in with a temporary password and must choose their own straight away. Sessions are random tokens in
 * an httpOnly cookie; only their SHA-256 is kept on disk, so a copy of the data folder cannot sign anyone in.
 */
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { Doc, fail } from './store.js';
import { ADMIN_ONLY, DEFAULT_ROLES, PERMISSION_IDS, cleanPermissions } from './rbac.js';

const scrypt = promisify(scryptCb);

export const MIN_PASSWORD_LENGTH = 12;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const EMAIL = /^(?=[^]{3,254}$)[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const norm = (v) => String(v ?? '').trim().toLowerCase();
export const clean = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** A strong temporary password that is easy to read out and type: 4 groups of 5. */
export function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return [...randomBytes(20)].map((b) => alphabet[b % alphabet.length]).join('').match(/.{5}/g).join('-');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function checkPassword(password, stored) {
  const [kind, N, r, p, salt, hash] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) {
    // The same work either way, so timing does not tell whether an account exists.
    await scrypt(String(password), 'no-such-user-salt', 32, { N: 16384, r: 8, p: 1 });
    return false;
  }
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

export function passwordProblem(password, email = '') {
  const text = String(password ?? '');
  if (text.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (text.length > 256) return 'That password is too long.';
  if (new Set(text).size < 5) return 'That password is too repetitive.';
  if (email && norm(text).includes(norm(email).split('@')[0]) && norm(email).split('@')[0].length > 3) return 'Do not use your email name in your password.';
  return '';
}

const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

export class Iam {
  constructor(dataDir) {
    this.doc = new Doc(path.join(dataDir, 'iam.json'), () => ({ roles: {}, users: [] }));
    this.sessions = new Doc(path.join(dataDir, 'sessions.json'), () => ({ sessions: {} }));
    this.#normalise();
    if (this.migrated) this.save();
  }

  #normalise() {
    const raw = this.doc.value;
    const roles = {};
    for (const [id, role] of Object.entries(DEFAULT_ROLES)) {
      const stored = raw.roles?.[id];
      roles[id] = { ...role, permissions: role.locked ? [...PERMISSION_IDS] : cleanPermissions(stored?.permissions ?? role.permissions).filter((p) => !ADMIN_ONLY.includes(p)), name: role.locked ? role.name : clean(stored?.name ?? role.name, 60) || role.name, description: stored?.description ?? role.description };
    }
    for (const [id, role] of Object.entries(raw.roles ?? {})) {
      if (DEFAULT_ROLES[id] || ['__proto__', 'constructor', 'prototype'].includes(id)) continue;
      roles[id] = { name: clean(role.name, 60) || id, description: clean(role.description, 300), permissions: cleanPermissions(role.permissions).filter((p) => !ADMIN_ONLY.includes(p)), builtin: false };
    }
    raw.roles = roles;
    raw.users = Array.isArray(raw.users) ? raw.users.filter((u) => u?.id && u?.email) : [];
    // Changes to the built-in roles a newer version makes, once each (as CxMissionZero migrates its roles).
    raw.migrations = Array.isArray(raw.migrations) ? raw.migrations : [];
    if (!raw.migrations.includes('cc-1.2-people')) {
      const add = (id, perms) => {
        if (roles[id]) roles[id].permissions = [...new Set([...roles[id].permissions, ...perms])];
      };
      add('leader', ['users.manage']);
      add('executive', ['users.manage', 'teams.manage', 'roles.manage', 'accounts.delete']);
      raw.migrations.push('cc-1.2-people');
      this.migrated = true;
    }
    if (!raw.migrations.includes('cc-1.3-sales')) {
      for (const id of ['executive', 'leader', 'se']) if (roles[id]) roles[id].permissions = [...new Set([...roles[id].permissions, 'sales.record'])];
      raw.migrations.push('cc-1.3-sales');
      this.migrated = true;
    }
  }

  save() {
    this.doc.save();
  }

  // ---- Roles ------------------------------------------------------------------------------------

  roles() {
    return this.doc.value.roles;
  }
  permissionsOf(user) {
    const role = this.doc.value.roles[user?.role];
    return new Set(user?.active === false ? [] : role?.permissions ?? []);
  }
  saveRole(id, { name, description, permissions }, granterPermissions) {
    const roles = this.doc.value.roles;
    const key = id ?? `role-${randomUUID().slice(0, 8)}`;
    // The Admin role can be renamed and described, but always holds every permission.
    if (roles[key]?.locked) {
      roles[key] = { ...roles[key], name: clean(name, 60) || roles[key].name, description: description === undefined ? roles[key].description : clean(description, 300) };
      this.save();
      return { id: key, ...roles[key] };
    }
    const wanted = cleanPermissions(permissions);
    if (wanted.some((p) => !granterPermissions.has(p))) throw fail(403, 'A role cannot be given permissions you do not hold.');
    if (wanted.some((p) => ADMIN_ONLY.includes(p))) throw fail(403, 'HTTPS, single sign-on, updates, backups and settings stay with the Admin role: no other role can hold them.');
    roles[key] = { ...(roles[key] ?? { builtin: false }), name: clean(name, 60) || roles[key]?.name || 'New role', description: clean(description, 300), permissions: wanted };
    this.save();
    return { id: key, ...roles[key] };
  }
  removeRole(id) {
    const role = this.doc.value.roles[id];
    if (!role) throw fail(404, 'That role no longer exists.');
    if (role.builtin) throw fail(400, 'Built-in roles cannot be removed.');
    if (this.users().some((u) => u.role === id)) throw fail(409, 'People still have that role: give them another first.');
    delete this.doc.value.roles[id];
    this.save();
  }
  /** Can someone holding `granter` give this role (all of its permissions are theirs)? */
  canGrant(roleId, granter) {
    const role = this.doc.value.roles[roleId];
    return Boolean(role) && role.permissions.every((p) => granter.has(p));
  }

  // ---- People -----------------------------------------------------------------------------------

  users() {
    return this.doc.value.users;
  }
  byId(id) {
    return this.users().find((u) => u.id === id) ?? null;
  }
  byEmail(email) {
    return this.users().find((u) => u.email === norm(email)) ?? null;
  }
  activeAdmins() {
    return this.users().filter((u) => u.active !== false && u.role === 'admin');
  }

  /** A new person with a temporary password, returned once: they choose their own at first sign-in. */
  async create({ email, name, role, teamId = null, title = '', password = '' }) {
    const address = norm(email);
    if (!EMAIL.test(address)) throw fail(400, 'Give a valid email address.');
    if (this.byEmail(address)) throw fail(409, 'Someone with that email already has access.');
    if (!this.doc.value.roles[role]) throw fail(400, 'Choose a role.');
    // A temporary password typed by whoever adds them (checked like any other), or one made here.
    if (password) {
      const problem = passwordProblem(password, address);
      if (problem) throw fail(400, `Temporary password: ${problem}`);
    }
    const temporary = password || generatePassword();
    const user = { id: randomUUID(), email: address, name: clean(name) || address.split('@')[0], title: clean(title), role, teamId, active: true, passwordHash: await hashPassword(temporary), mustChangePassword: true, createdAt: new Date().toISOString(), failed: 0, lockedUntil: 0, lastSignInAt: null, guideSeenAt: null };
    this.users().push(user);
    this.save();
    return { user, temporary };
  }

  update(id, patch) {
    const user = this.byId(id);
    if (!user) throw fail(404, 'That person no longer has access.');
    if (patch.name !== undefined) user.name = clean(patch.name) || user.name;
    if (patch.title !== undefined) user.title = clean(patch.title);
    if (patch.role !== undefined) {
      if (!this.doc.value.roles[patch.role]) throw fail(400, 'Choose a role.');
      if (user.role === 'admin' && patch.role !== 'admin' && this.activeAdmins().length <= 1 && user.active !== false) throw fail(409, 'There must always be at least one active Admin.');
      user.role = patch.role;
    }
    if (patch.teamId !== undefined) user.teamId = patch.teamId || null;
    if (patch.active !== undefined) {
      if (patch.active === false && user.role === 'admin' && this.activeAdmins().length <= 1) throw fail(409, 'There must always be at least one active Admin.');
      user.active = Boolean(patch.active);
      if (!user.active) this.endSessionsOf(user.id);
    }
    this.save();
    return user;
  }

  async resetPassword(id) {
    const user = this.byId(id);
    if (!user) throw fail(404, 'That person no longer has access.');
    const temporary = generatePassword();
    Object.assign(user, { passwordHash: await hashPassword(temporary), mustChangePassword: true, failed: 0, lockedUntil: 0 });
    this.save();
    this.endSessionsOf(user.id);
    return temporary;
  }

  async setPassword(id, current, next) {
    const user = this.byId(id);
    if (!user) throw fail(404, 'That person no longer has access.');
    if (!(await checkPassword(current, user.passwordHash))) throw fail(400, 'Your current password is not right.');
    const problem = passwordProblem(next, user.email);
    if (problem) throw fail(400, problem);
    if (await checkPassword(next, user.passwordHash)) throw fail(400, 'Choose a password different from the current one.');
    Object.assign(user, { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date().toISOString() });
    this.save();
  }

  /** A new password chosen through an emailed reset link: checked as any other, and not the current one. */
  async setPasswordFromLink(id, next) {
    const user = this.byId(id);
    if (!user) throw fail(404, 'That person no longer has access.');
    const problem = passwordProblem(next, user.email);
    if (problem) throw fail(400, problem);
    if (await checkPassword(next, user.passwordHash)) throw fail(400, 'Choose a password different from the current one.');
    Object.assign(user, { passwordHash: await hashPassword(next), mustChangePassword: false, failed: 0, lockedUntil: 0, passwordChangedAt: new Date().toISOString() });
    this.save();
  }

  /** After 5 wrong passwords an account waits 15 minutes; whoever manages it can lift that at once. */
  unlock(id) {
    const user = this.byId(id);
    if (!user) throw fail(404, 'That person no longer has access.');
    Object.assign(user, { failed: 0, lockedUntil: 0 });
    this.save();
  }

  sessionsOf(userId) {
    const now = Date.now();
    return Object.values(this.sessions.value.sessions).filter((s) => s.userId === userId && now - s.lastUsedAt <= s.idleMs).length;
  }

  markGuideSeen(id) {
    const user = this.byId(id);
    if (user) {
      user.guideSeenAt = new Date().toISOString();
      this.save();
    }
  }

  remove(id) {
    const user = this.byId(id);
    if (!user) throw fail(404, 'That person no longer has access.');
    if (user.role === 'admin' && this.activeAdmins().length <= 1) throw fail(409, 'There must always be at least one active Admin.');
    this.doc.value.users = this.users().filter((u) => u.id !== id);
    this.save();
    this.endSessionsOf(id);
  }

  /** Check an email and password. Locked for 15 minutes after 5 misses; the message never says which was wrong. */
  async signIn(email, password) {
    const user = this.byEmail(email);
    const wrong = fail(401, 'That email and password do not match.');
    if (!user) {
      await checkPassword(password, '');
      throw wrong;
    }
    if (user.lockedUntil > Date.now()) throw fail(429, 'Too many attempts: try again in 15 minutes, or ask an Admin to reset your password.');
    const ok = await checkPassword(password, user.passwordHash);
    if (!ok) {
      user.failed = (user.failed ?? 0) + 1;
      if (user.failed >= MAX_FAILED) Object.assign(user, { failed: 0, lockedUntil: Date.now() + LOCK_MS });
      this.save();
      throw wrong;
    }
    if (user.active === false) throw fail(403, 'Your access has been turned off. Ask an Admin.');
    Object.assign(user, { failed: 0, lockedUntil: 0, lastSignInAt: new Date().toISOString() });
    this.save();
    return user;
  }

  // ---- Sessions ---------------------------------------------------------------------------------

  openSession(userId, { idleMs, ip = '', agent = '' }) {
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    const now = Date.now();
    this.sessions.value.sessions[tokenHash(token)] = { id: randomUUID(), userId, csrf, createdAt: now, lastUsedAt: now, idleMs, ip, agent: String(agent).slice(0, 200) };
    this.#sweep();
    this.sessions.save();
    return { token, csrf };
  }

  session(token) {
    if (!token) return null;
    const key = tokenHash(token);
    const s = this.sessions.value.sessions[key];
    if (!s) return null;
    const now = Date.now();
    if (now - s.lastUsedAt > s.idleMs || now - s.createdAt > 7 * 24 * 3600 * 1000) {
      delete this.sessions.value.sessions[key];
      this.sessions.save();
      return null;
    }
    // Written at most once a minute: every request need not touch the disk.
    if (now - s.lastUsedAt > 60_000) {
      s.lastUsedAt = now;
      this.sessions.save();
    } else s.lastUsedAt = now;
    return s;
  }

  endSession(token) {
    delete this.sessions.value.sessions[tokenHash(token)];
    this.sessions.save();
  }

  endSessionsOf(userId, { except = null } = {}) {
    for (const [key, s] of Object.entries(this.sessions.value.sessions)) if (s.userId === userId && s.id !== except) delete this.sessions.value.sessions[key];
    this.sessions.save();
  }

  #sweep() {
    const now = Date.now();
    for (const [key, s] of Object.entries(this.sessions.value.sessions)) if (now - s.lastUsedAt > s.idleMs) delete this.sessions.value.sessions[key];
  }
}

/** What the browser may see of a person: never the password hash or lock state. */
/** How a person stands, as MZ shows it: active, locked (too many wrong passwords), off, or still to set their password. */
export const statusOf = (u, now = Date.now()) => (u.active === false ? 'disabled' : u.lockedUntil > now ? 'locked' : u.mustChangePassword ? 'pending' : 'active');
export const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.name, title: u.title ?? '', role: u.role, teamId: u.teamId ?? null, active: u.active !== false, mustChangePassword: Boolean(u.mustChangePassword), status: statusOf(u), lockedUntil: u.lockedUntil > Date.now() ? new Date(u.lockedUntil).toISOString() : null, signIn: u.lastSignInMethod ?? (u.ssoCreated ? 'sso' : 'password'), createdAt: u.createdAt, lastSignInAt: u.lastSignInAt ?? null } : null);
