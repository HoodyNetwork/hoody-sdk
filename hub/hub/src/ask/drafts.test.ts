// Drafts live in memory only, keyed account|slot: they go when the account goes, even with the dock closed. A
// computer switch or fallback keeps them.
import { describe, expect, it } from 'vitest';
import { bump } from '../core/ctx';
import { draftCount, draftGet, draftSet, purgeDrafts } from './drafts';

describe('drafts', () => {
  it('a sign-out, an account change or a suspension drops every draft; a switch or a fallback keeps them', () => {
    for (const reason of ['account', 'signout', 'logout', 'suspended']) {
      draftSet('a|p|c', 'secret plan');
      draftSet('b|p|c', 'other');
      bump('switch');
      bump('fallback');
      expect(draftGet('a|p|c')).toBe('secret plan');
      bump(reason);
      expect(draftCount()).toBe(0);
    }
  });
  it('the mounted panel keeps only the current account\'s drafts, none while signing out', () => {
    draftSet('a|p|c', 'x');
    draftSet('b|p|c', 'y');
    purgeDrafts('a');
    expect(draftGet('a|p|c')).toBe('x');
    expect(draftGet('b|p|c')).toBeUndefined();
    purgeDrafts(null);
    expect(draftCount()).toBe(0);
  });
});
