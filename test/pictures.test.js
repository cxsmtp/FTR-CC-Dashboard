import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { imageFrom } from '../server/branding.js';
import { Iam } from '../server/iam.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('profile pictures: each a file of its own; one kept in the people file by an older version moves out, unchanged', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-pic-'));
  const iam = new Iam(dataDir);
  const { user: admin } = await iam.create({ email: 'a@corp.example', name: 'A', role: 'admin', password: 'A-long-password-for-tests-1' });
  const { user: se } = await iam.create({ email: 's@corp.example', name: 'S', role: 'admin', password: 'A-long-password-for-tests-2' });

  // Set now: the bytes are in pictures/<id>, and the people file has no image data.
  iam.setPicture(se, imageFrom(PNG));
  assert.deepEqual(fs.readFileSync(path.join(dataDir, 'pictures', se.id)), PNG);
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, 'iam.json'), 'utf8'), /iVBORw0KGgo/);
  assert.deepEqual(iam.pictureOf(se).bytes, PNG);
  assert.equal(iam.pictureOf(se).type, 'image/png');

  // As an older version left it (or a restored backup of one): inside the people file.
  const doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'iam.json'), 'utf8'));
  const old = imageFrom(PNG);
  doc.users.find((u) => u.id === admin.id).picture = old;
  fs.writeFileSync(path.join(dataDir, 'iam.json'), JSON.stringify(doc));
  const next = new Iam(dataDir);
  const moved = next.byId(admin.id);
  assert.equal(moved.picture.data, undefined);
  assert.equal(moved.picture.at, old.at); // the same picture: its address (…?v=at) does not change
  assert.deepEqual(next.pictureOf(moved).bytes, PNG);
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, 'iam.json'), 'utf8'), /iVBORw0KGgo/);

  // Taken away, and gone with the person.
  next.setPicture(moved, null);
  assert.equal(next.pictureOf(moved), null);
  assert.equal(fs.existsSync(path.join(dataDir, 'pictures', admin.id)), false);
  next.remove(se.id);
  assert.equal(fs.existsSync(path.join(dataDir, 'pictures', se.id)), false);
});
