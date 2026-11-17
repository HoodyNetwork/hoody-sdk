// The two frozen files stand in for a tab of an earlier release (persist.v1-frozen.ts, the old parser; persist.v1-types.ts,
// the Board types it was written against, the computer under `container`). Their bytes are pinned: a change to either means the
// "the Hub reads what an earlier release wrote" proofs no longer test an earlier release. The two boards.ts functions the frozen parser calls through
// persist.v1-types.ts are the very same functions, only their declared types are the old ones.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as boards from './boards';
import * as v1 from './persist.v1-types';

const sha = (name: string): string => createHash('sha256').update(readFileSync(join(import.meta.dirname, name))).digest('hex');

describe('the frozen old-Hub files', () => {
  it('keep their bytes', () => {
    expect(sha('persist.v1-frozen.ts')).toBe('1a8c2c16287c70ccfa85a85fbb8d224a15e355cd261bbaa656d593fc1bdb63bd');
    expect(sha('persist.v1-types.ts')).toBe('187723d15fbfca882fd549a0fed3f1911a11538275d30c2e50211b4de92774e0');
  });
  it('keep an old tab\'s own limit of 6 slots, whatever boards.ts allows', () => {
    expect(readFileSync(join(import.meta.dirname, 'persist.v1-frozen.ts'), 'utf8')).toMatch(/^const MAX_SLOTS = 6;$/m);
    expect(boards.MAX_SLOTS).toBeGreaterThan(6);
  });
  it('call the same boards.ts functions, under the old types only', () => {
    expect(v1.freshRealm).toBe(boards.freshRealm);
    expect(v1.isProgramTile).toBe(boards.isProgramTile);
  });
  it('a fresh realm holds no tile, so it reads the same in the old shape and the new', () => {
    const r = boards.freshRealm(() => 0.5);
    expect(r.recents).toEqual([]);
    expect(r.boards.flatMap((b) => Object.values(b.tiles))).toEqual([null]);
  });
  it('isProgramTile reads only whether a tile names a program, whatever its computer field is called', () => {
    expect(v1.isProgramTile({ project: 'p1', container: 'c1', program: 'terminal', session: 1 })).toBe(true);
    expect(v1.isProgramTile({ project: 'p1', container: 'c1', protocol: 'http', port: 80 })).toBe(false);
    expect(v1.isProgramTile({ url: 'https://example.com' })).toBe(false);
    expect(v1.isProgramTile(null)).toBe(false);
  });
});
