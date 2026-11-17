// Vitest: useStoredBoards under core's 'oversized' mark (data.ts contract): it shows a value only while core says that
// value is this page's own copy of a write it refused (pref pageCopy); the mark without that copy is unknown (null).
// Core's status and pageCopy are driven here at the pref seam; everything else is the real core.
import { bootFixtureCore, FIXTURE_REALM } from '@core';
import type * as Core from '@core';
import { cryptIdleForTests, writeSealedForTests } from '@core/cryptStore';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARDS_KEY, resetBoardsForTests, useStoredBoards } from './data';
import { addTile, freshRealm, isRefusal, onActive, type RealmBoards } from './model/boards';
import { toStored } from './model/persist';

const H = vi.hoisted(() => ({ status: null as string | null, copy: null as boolean | null, subs: new Set<() => void>() }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    accountPref: ((...args: Parameters<typeof real.accountPref>) => {
      const p = real.accountPref(...args);
      return {
        ...p,
        status: (part?: string) => (H.status ?? p.status(part)) as ReturnType<typeof p.status>,
        pageCopy: (part?: string) => H.copy ?? p.pageCopy(part),
        subscribe: (fn: () => void) => { H.subs.add(fn); const off = p.subscribe(fn); return () => { H.subs.delete(fn); off(); }; },
      };
    }) as typeof real.accountPref,
  };
});
const drive = (status: string | null, copy: boolean | null) => act(() => { H.status = status; H.copy = copy; H.subs.forEach((f) => f()); });
const rnd = () => 0.5;

afterEach(() => { vi.useRealTimers(); });
beforeEach(async () => {
  H.status = null; H.copy = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetBoardsForTests();
  bootFixtureCore({ rules: [] });
  await act(() => cryptIdleForTests());
});
/** Stores one Board with one tile, as another tab would (core opens the account once a reader is mounted). */
async function storeOne() {
  const one = onActive(freshRealm(rnd), (b) => { const x = addTile(b, { project: 'p1', computer: 'c1', program: 'terminal', session: 1 }, rnd); return isRefusal(x) ? x : x.board; });
  if (isRefusal(one)) throw new Error('refused');
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(one as RealmBoards));
    // eslint-disable-next-line no-restricted-globals -- another tab's write is played through the storage event, as data.test does
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}

describe('useStoredBoards under the oversized mark', () => {
  it('shows the value while it is this page\'s own copy, and nothing (unknown) once the mark has no copy', async () => {
    const { result } = renderHook(() => useStoredBoards());
    await act(() => cryptIdleForTests());
    await storeOne();
    expect(result.current?.boards[0]?.tiles).not.toEqual({});
    drive('oversized', true);
    expect(result.current).not.toBeNull();
    drive('oversized', false);
    expect(result.current).toBeNull();
    drive(null, false);
    expect(result.current).not.toBeNull();
  });
});
