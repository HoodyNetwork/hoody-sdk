// The root of the fixture computer lists bin, usr and more, and the fixture tree must hold each of those
// folders, or opening the first row says "This folder isn't there any more". Every folder the root lists exists.
import { expect, test } from 'bun:test';
import { ATLAS_TREE } from './fixtures';

// Left out on purpose: /root (the page's tests read it as a refused folder) and /copy (their gone folder at the root).
const NOT_THERE = ['/root', '/copy'];

test('every folder the root of the fixture computer lists can be opened', () => {
  const missing = ATLAS_TREE['/']!.dir.map((n) => `/${n}`).filter((p) => !NOT_THERE.includes(p) && !(p in ATLAS_TREE));
  expect(missing).toEqual([]);
  // One level down, for the folders this fix added: nothing they list is missing either.
  for (const top of ['/bin', '/usr', '/var', '/etc']) {
    expect(ATLAS_TREE[top]!.dir.map((n) => `${top}/${n}`).filter((p) => !(p in ATLAS_TREE))).toEqual([]);
  }
});
