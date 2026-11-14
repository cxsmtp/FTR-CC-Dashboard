/**
 * Ready for production? What an Admin would want put right before the server is opened to more people, each with
 * where it is put right. It only reads: nothing is changed by looking.
 *
 * `facts` is what the app holds (see server/routes/diagnostics.js); the answer is a list of
 * { id, title, state: 'ok' | 'todo' | 'note', detail, where } ('note' is worth knowing, not a fault). An Admin can say
 * of a note that it is as meant (`f.accepted`: id → { detail, by, at }): it then reads as ready, until what was found
 * changes (another role, a new error), when it is asked again.
 */
const DAY = 24 * 3600 * 1000;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function readiness(f, now = Date.now()) {
  const out = [];
  const add = (id, title, state, detail, where = '') => out.push({ id, title, state, detail, where });

  // What is kept safe.
  const last = f.backups[0];
  const age = last ? now - new Date(last.at).getTime() : Infinity;
  add('backup.recent', 'A backup in the last day', age <= 26 * 3600 * 1000 ? 'ok' : 'todo', last ? `The newest is from ${new Date(last.at).toISOString().slice(0, 16).replace('T', ' ')} UTC.` : 'There is no backup yet: take one now.', '/admin/backups');
  add('backup.separate', 'Backups kept away from the data', f.backupSeparate ? 'ok' : 'todo', f.backupSeparate ? 'They go to their own place (BACKUP_DIR).' : 'They are in the data volume itself: losing that disk loses both. Mount a second volume or a share and set BACKUP_DIR.', '/admin/backups');
  add('backup.sealed', 'Backups sealed with a passphrase', f.backupSealed ? 'ok' : 'todo', f.backupSealed ? 'A backup cannot be read without its passphrase.' : 'Anyone who gets a backup file can read it. Set a passphrase.', '/admin/backups');
  add('backup.restored', 'A restore tried', f.restores ? 'ok' : 'note', f.restores ? `${plural(f.restores, 'restore')} in the audit log.` : 'No restore is in the audit log. Try one of your backups on a second copy of the server, so the first time is not the day it is needed.', '/admin/backups');
  add('audit.intact', 'The audit log is intact', f.audit.ok ? 'ok' : 'todo', f.audit.ok ? `${f.audit.events} events, each chained to the one before.` : `Broken at event ${f.audit.brokenAt}: ${f.audit.why}.`, '/audit');

  // How it is reached and kept up to date.
  add('https.trusted', 'A certificate browsers trust', f.https.mode === 'http' ? 'todo' : f.https.selfSigned ? 'todo' : 'ok', f.https.mode === 'http' ? 'It answers over plain http: turn HTTPS on.' : f.https.selfSigned ? 'It is self-signed: every browser warns, and pages are not kept between visits. Upload your own, or get one from Let’s Encrypt.' : 'The certificate is not self-signed.', '/admin/https');
  add('updates.launcher', 'Updates without a restart', f.supervised ? 'ok' : 'todo', f.supervised ? 'It runs under the launcher: a new version takes over with the port open.' : 'It was started without the launcher (npm start does it): an update would need a restart.', '/admin/updates');
  const stage = f.auto?.stage ?? '';
  add('updates.stage', 'Marked Staging or Production', stage ? 'ok' : 'note', stage === 'production' ? `Production${f.auto?.window ? `: updates between ${f.auto.window.from} and ${f.auto.window.to}` : ': updates at any hour (give it update hours for a quiet time)'}.` : stage === 'staging' ? 'Staging: it takes every release as soon as it is out, release candidates too.' : 'Not marked: it takes every release as soon as it is out.', '/admin/updates');
  add('email.ready', 'Email is set up', f.mailReady ? 'ok' : 'todo', f.mailReady ? 'Invitations and password resets can be sent.' : 'Without it nobody can reset a forgotten password by themselves, and invitations are handed over by hand.', '/admin/email');
  if (f.disk) add('disk.free', 'Room on the disk', f.disk.freeMB > 1024 ? 'ok' : 'todo', `${f.disk.freeMB.toLocaleString('en')} MB free of ${f.disk.totalMB.toLocaleString('en')} MB.`, '/admin/backups');

  // The people and what they are given.
  const admins = f.users.filter((u) => u.role === 'admin' && u.active !== false);
  add('people.admins', 'More than one Admin', admins.length >= 2 ? 'ok' : 'todo', admins.length >= 2 ? `${admins.length} Admins.` : 'One Admin only: if they are away or locked out, nobody can manage the server.', '/people/people');
  const stale = f.users.filter((u) => u.active !== false && u.mustChangePassword && !u.lastSignInAt && now - new Date(u.createdAt ?? 0).getTime() > 14 * DAY);
  add('people.invites', 'No invitation left unanswered', stale.length ? 'todo' : 'ok', stale.length ? `${plural(stale.length, 'person', 'people')} invited more than two weeks ago never signed in: invite them again, or remove them (each is a way in with a password that was sent by email).` : 'Nobody invited more than two weeks ago is still to sign in.', '/people/people');
  const leaderless = f.teams.filter((t) => !(t.leaderIds ?? []).some((id) => f.users.some((u) => u.id === id && u.active !== false)));
  add('teams.leaders', 'Every team has a leader', leaderless.length ? 'todo' : 'ok', leaderless.length ? `Without one: ${leaderless.slice(0, 6).map((t) => t.name).join(', ')}${leaderless.length > 6 ? '…' : ''}.` : `${plural(f.teams.length, 'team')}, each with a leader.`, '/teams');
  const holds = (ids) => Object.entries(f.roles).filter(([id, role]) => id !== 'admin' && ids.some((p) => (role.permissions ?? []).includes(p)) && f.users.some((u) => u.role === id && u.active !== false)).map(([, role]) => role.name);
  const broad = holds(['settings.manage', 'system.update', 'backup.manage', 'roles.manage', 'users.impersonate', 'security.https', 'security.sso']);
  add('roles.broad', 'Only Admins hold the server’s own settings', broad.length ? 'note' : 'ok', broad.length ? `People in these roles can also change settings, updates, backups, roles or sign in as someone else: ${broad.join(', ')}. Check that each is meant to.` : 'Nobody else can change settings, updates, backups or roles, or sign in as someone else.', '/people/roles');
  const wide = holds(['scope.all']);
  add('roles.wide', 'Who sees every team is meant to', wide.length ? 'note' : 'ok', wide.length ? `People in these roles see every team, account and customer contact: ${wide.join(', ')}. Narrow any that should see their own teams only.` : 'Only Admins see every team.', '/people/roles');

  // What the figures rest on.
  add('rates.engines', 'Every engine seen has a rate', f.unrated.length ? 'todo' : 'ok', f.unrated.length ? `No rate yet for: ${f.unrated.slice(0, 6).join(', ')}${f.unrated.length > 6 ? '…' : ''}. A projection on one of these uses the default engine’s rate.` : 'Every engine a customer’s Checkmarx One offered has a rate.', '/rates');
  const errors = f.recentErrors.filter((e) => now - new Date(e.at).getTime() < DAY);
  add('errors.recent', 'No errors in the last day', errors.length ? 'note' : 'ok', errors.length ? `${plural(errors.length, 'line')} in the server’s log since yesterday that say error or failed; the newest: ${errors.at(-1).line.slice(0, 160)}` : 'None since yesterday (or since it last started).', '/admin/backups');

  for (const c of out) {
    const yes = f.accepted?.[c.id];
    if (c.state === 'note') c.canAccept = true;
    if (c.state === 'note' && yes && yes.detail === c.detail) Object.assign(c, { state: 'ok', accepted: { by: yes.by, at: yes.at } });
  }
  return { checks: out, todo: out.filter((c) => c.state === 'todo').length, notes: out.filter((c) => c.state === 'note').length };
}
