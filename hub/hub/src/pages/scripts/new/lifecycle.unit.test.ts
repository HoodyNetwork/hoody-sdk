// Vitest (New script): draft memory follows the account. An account that ends (sign-out, another
// account) drops every draft held in this tab, whether or not the New script page is mounted; a realm switch keeps only the
// drafts of the account and realm shown after it.
import { afterAll, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ bump: null as null | ((reason: string, gen: number) => void), shown: { account: 'acct1', realm: 'global' } }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, onBump: (l: (reason: string, gen: number) => void) => { io.bump = l; return () => undefined; }, capture: () => ({ ...io.shown }) };
});

import { draftCount, getDraft, newDraft, putDraft } from './draft';
import './Flow';

// The mock above is bound into every module this file loaded (ask/drafts registers its own onBump at load). In a shared
// worker (isolate: false) those modules stay cached for the next file, which would then hold a listener that never fires.
afterAll(() => { vi.resetModules(); });

describe('New script drafts: account lifecycle', () => {
  it('a realm switch keeps only the shown account and realm\'s drafts; an ended account drops every one', async () => {
    putDraft('acct1', 'global', newDraft('aaaaaaaaaa', 'ai'));
    putDraft('acct1', 'f1f1f1f1f1f1f1f1f1f1f1f1', newDraft('bbbbbbbbbb', 'write'));
    expect(draftCount()).toBe(2);
    io.shown = { account: 'acct1', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1' };
    io.bump?.('switch', 2);
    await Promise.resolve();
    expect(getDraft('acct1', 'global', 'aaaaaaaaaa')).toBeUndefined();
    expect(getDraft('acct1', 'f1f1f1f1f1f1f1f1f1f1f1f1', 'bbbbbbbbbb')).toBeTruthy();
    io.bump?.('signout', 3);
    expect(draftCount()).toBe(0);
  });
});
