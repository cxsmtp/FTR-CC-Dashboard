/**
 * The terms of use (TERMS.md), as CxMissionZero asks for them (src/terms.js): each person accepts the version in
 * force before they first use the command center, and again whenever its text changes (acceptance is tied to the
 * text's hash). Every acceptance is also in the audit log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { Doc } from './store.js';

export class Terms {
  constructor({ dataDir, textFile }) {
    this.text = fs.readFileSync(textFile, 'utf8');
    this.version = this.text.match(/^Version ([\w.]+)/m)?.[1] ?? '1';
    this.hash = createHash('sha256').update(this.text).digest('hex').slice(0, 16);
    this.doc = new Doc(path.join(dataDir, 'terms.json'), () => ({ users: {} }));
  }
  acceptedBy(userId) {
    return this.doc.value.users[userId]?.hash === this.hash;
  }
  accept(userId, ip = '') {
    this.doc.value.users[userId] = { version: this.version, hash: this.hash, at: new Date().toISOString(), ip };
    this.doc.save();
  }
}
