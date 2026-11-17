// hub_ask_v1 when the page's shared.js does not register it (a cached older shared.js): partitioned() throws
// STORE_UNREGISTERED. Ask must still open and run, only without remembering: the read is an empty store and
// the write is a quiet no-op that reports false (not kept), never an exception into the engine or the panel.
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';

const seen = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  partitioned: () => {
    seen.calls++;
    throw Object.assign(new Error('STORE_UNREGISTERED'), { code: 'STORE_UNREGISTERED' });
  },
}));

import { readStore, writeStore } from './data';
import type { AskStore } from './logic';

const ACCT = 'acct-1';

describe('hub_ask_v1 missing from the storage registry', () => {
  it('reads as an empty store', () => {
    expect(readStore(ACCT)).toEqual({ v: 1, a: {} });
    expect(seen.calls).toBeGreaterThan(0);
  });

  it('a write (set or remove) is a quiet no-op', () => {
    const full = { v: 1, a: { [ACCT]: [{ p: 'p1' }] } } as unknown as AskStore;
    const empty: AskStore = { v: 1, a: {} };
    const before = seen.calls;
    expect(writeStore(ACCT, full)).toBe(false);   // not kept: the engine keeps what it meant to write
    expect(writeStore(ACCT, empty)).toBe(false);
    expect(seen.calls).toBe(before + 2);
  });

  it('every call asks again, so a registry that appears later is used', () => {
    const before = seen.calls;
    readStore(ACCT);
    readStore(ACCT);
    expect(seen.calls).toBe(before + 2);
  });
});
