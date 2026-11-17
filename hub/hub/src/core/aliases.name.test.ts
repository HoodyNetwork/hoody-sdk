// aliases.name.test.ts: the alias name rules shared by Computers and Scripts.
import { describe, expect, it } from 'vitest';
import { ALIAS_RE, aliasProblem, suggestAliasName, validAlias } from './index';

describe('alias names: the API’s rule', () => {
  it('3 to 61 characters, lowercase letters, digits and dashes, no dash at an end', () => {
    expect(validAlias('abc')).toBe(true);
    expect(validAlias('a'.repeat(61))).toBe(true);
    expect(ALIAS_RE.test('abc')).toBe(true);
    for (const bad of ['ab', 'a'.repeat(62), '-abc', 'abc-', 'ABC', 'a_b', 'a.b', '']) expect(aliasProblem(bad)).toBe('rule');
  });
  it('names the API keeps for the platform: service labels whole or before a dash, `containers` exactly, host shapes', () => {
    const hex = 'a'.repeat(24);
    for (const r of ['egress', 'egress-web', 'workspaces', 'workspace-demo', 'os-app', 'containers', `${hex}-${hex}`, `proxy-${hex}-${hex}`]) expect(aliasProblem(r)).toBe('reserved');
    for (const ok of ['egressmyapp', 'containers-my-app', 'osmium', 'my-os']) expect(validAlias(ok)).toBe(true);
  });
  it('suggestions are valid names with a long random ending, so they cannot be found by trying names', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = suggestAliasName();
      expect(validAlias(n)).toBe(true);
      expect(n).toMatch(/^[a-z]+-[a-z]+-[0-9a-z]{16}$/);
      seen.add(n);
    }
    expect(seen.size).toBe(200);
    const fixed = (v: number) => (k: number) => new Uint8Array(k).fill(v);
    expect(suggestAliasName(fixed(1))).not.toBe(suggestAliasName(fixed(2)));
  });
});
