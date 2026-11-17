// Vitest: the Ready step's key (`gh=`): a library program by its id, any other repository by its address after
// github.com, read back through parseRepo only; an id needs the library, and a key that names nothing shows nothing.
import { describe, expect, it } from 'vitest';
import { parseRepo } from '../github';
import type { Library } from './library';
import { keyFor, readyOf, repoPath } from './ready';

const prog = { id: 'uptime-kuma', name: 'Uptime Kuma', owner: 'louislam', repo: 'uptime-kuma', category: 'monitoring', tagline: 't', why: 'w', kind: 'web', port: 3001, stack: 'Node', license: 'MIT', tags: [], popular: true, homepage: null } as const;
const lib: Library = { categories: [{ id: 'monitoring', label: 'Monitoring', blurb: 'b' }], programs: [prog] };
const ready = { kind: 'ready', lib } as const;

describe('the Ready key', () => {
  it('a library repository is keyed by its program id; any other, or one with a ref, by its address', () => {
    expect(keyFor({ owner: 'LouisLam', name: 'Uptime-Kuma' }, lib)).toBe('uptime-kuma');
    expect(keyFor({ owner: 'louislam', name: 'uptime-kuma', ref: 'v2' }, lib)).toBe('louislam/uptime-kuma/tree/v2');
    expect(keyFor({ owner: 'octo', name: 'demo' }, lib)).toBe('octo/demo');
    expect(keyFor({ owner: 'louislam', name: 'uptime-kuma' }, null)).toBe('louislam/uptime-kuma');
  });

  it('an address key reads back as the same repository (ref and path kept)', () => {
    for (const a of ['octo/demo', 'octo/demo/tree/main', 'octo/demo/tree/v1.2/apps/web']) {
      const parsed = parseRepo(`github.com/${a}`);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(repoPath(parsed.repo)).toBe(a);
      const shown = readyOf(a, ready);
      expect(shown.kind === 'ready' && repoPath(shown.repo)).toBe(a);
    }
  });

  it('an id is its program while the library holds it; it waits while the library loads; anything else names nothing', () => {
    expect(readyOf('uptime-kuma', ready)).toEqual({ kind: 'ready', repo: { owner: 'louislam', name: 'uptime-kuma' }, program: prog });
    expect(readyOf('louislam/uptime-kuma', ready)).toEqual({ kind: 'ready', repo: { owner: 'louislam', name: 'uptime-kuma' }, program: prog });
    expect(readyOf('uptime-kuma', { kind: 'loading' })).toEqual({ kind: 'wait' });
    expect(readyOf('uptime-kuma', { kind: 'failed', error: new Error('x') })).toEqual({ kind: 'none' });
    expect(readyOf('octo/demo', { kind: 'loading' })).toEqual({ kind: 'ready', repo: { owner: 'octo', name: 'demo' }, program: undefined });
    for (const bad of [undefined, '', 'no-such', 'Uptime-Kuma', 'octo', 'octo/demo?x=1', 'octo/demo@evil', '../etc', 'https://github.com/octo/demo', 'octo/demo/blob/main', 'octo/..']) {
      expect(readyOf(bad, ready)).toEqual({ kind: 'none' });
    }
  });
});
