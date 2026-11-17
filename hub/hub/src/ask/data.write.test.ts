// writeStore says whether the browser kept the write (storage full or blocked: false), so the engine
// keeps a verdict it could not store for the next save instead of losing it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';

const box = vi.hoisted(() => ({ list: null as unknown, setOk: true, removeOk: true }));
vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  partitioned: () => ({
    get: () => box.list,
    set: (v: unknown) => { if (box.setOk) box.list = v; return box.setOk; },
    remove: () => { if (box.removeOk) box.list = null; return box.removeOk; },
  }),
}));

import { writeStore } from './data';
import type { AskStore } from './logic';

const ACCT = 'acct-1';
const full = { v: 1, a: { [ACCT]: [{ p: 'p1' }] } } as unknown as AskStore;
const empty: AskStore = { v: 1, a: {} };

describe('writeStore reports whether the browser kept it', () => {
  beforeEach(() => { box.list = null; box.setOk = true; box.removeOk = true; });

  it('a kept write is true; a refused one (full storage) is false', () => {
    expect(writeStore(ACCT, full)).toBe(true);
    box.setOk = false;
    expect(writeStore(ACCT, full)).toBe(false);
  });

  it('removing: kept, or nothing of this account left to remove, is true; a list still there is false', () => {
    box.list = [{ p: 'p1' }];
    expect(writeStore(ACCT, empty)).toBe(true);
    box.removeOk = false;
    box.list = null;
    expect(writeStore(ACCT, empty)).toBe(true);
    box.list = [{ p: 'p1' }];
    expect(writeStore(ACCT, empty)).toBe(false);
  });
});
