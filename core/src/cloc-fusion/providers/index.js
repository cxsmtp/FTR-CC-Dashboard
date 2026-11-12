// From cloc-fusion 1.4.1 (commit 6a7fbb96f50b), MIT licence; this product's own copy.
import github from './github.js';
import gitlab from './gitlab.js';
import azure from './azure.js';
import bitbucket from './bitbucket.js';
import bitbucketServer from './bitbucket-server.js';
import generic from './generic.js';

export const PROVIDERS = [github, gitlab, azure, bitbucket, bitbucketServer, generic];

export function providerOf(id) {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown provider "${id}" (expected one of: ${PROVIDERS.map((x) => x.id).join(', ')})`);
  return p;
}
