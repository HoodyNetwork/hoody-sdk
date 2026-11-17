// holds.test.tsx: the AI page's create holds, one pending queue per account+realm shared by every computer
// at once, over the real shared.js registry and the encrypted store.
/* eslint-disable no-restricted-globals -- the test plays a browser refusing writes (as pages/board/data.test.tsx);
   the page reaches storage only through core */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptIdleForTests, cryptReady, storedForTests } from '@core/cryptStore';
import { setIdentity } from '@core/ctx';
import { resetPrefs, usePrefUpdate } from '@core/prefs';
import { boot, R1, UID } from '@core/test/env';
import { holdNotKeptWarns, parseHolds } from './parts/EndpointStep';

const KEY = 'hub_ai_v1';
const hold = (id: string): ReturnType<typeof parseHolds>[string] => ({ plan: { id, idem: 'k-' + id, replay: false, body: { id, model_prefix: id, display_name: 'E ' + id, wire_format: 'chat_completions', base_url: 'https://x.example/v1', models: [{ model: 'm' }] } }, form: { name: 'E ' + id, address: 'https://x.example/v1', models: 'm', wire: 'chat_completions' } });
const settle = () => act(() => cryptIdleForTests());
let unblock: (() => void) | null = null;
afterEach(async () => { unblock?.(); await cryptIdleForTests(); });
beforeEach(async () => { boot(); resetPrefs(); setIdentity({ id: UID, banned: false }); await cryptReady(); await cryptIdleForTests(); });

describe('AI create holds: every computer of a realm shares one pending queue', () => {
  it('computer A holds a create while B releases its own, the store is refused: the warning comes (B\'s handler is the one told)', async () => {
    const told: [string, unknown][] = [];
    const warned: string[] = [];
    // As EndpointCreate: one handler per render, bound to the computer that render shows.
    const handler = (where: string) => (wanted: Record<string, unknown> | null) => { told.push([where, wanted]); if (holdNotKeptWarns(wanted)) warned.push(where); };
    const a = renderHook(() => usePrefUpdate(KEY, parseHolds, { scope: 'account+realm', part: R1, onUnsaved: handler('c1') }));
    const b = renderHook(() => usePrefUpdate(KEY, parseHolds, { scope: 'account+realm', part: R1, onUnsaved: handler('c2') }));
    act(() => { b.result.current.update((now) => ({ ...now, c2: hold('b') })); });
    await settle();
    expect(Object.keys(parseHolds(await storedForTests(KEY, R1)))).toEqual(['c2']);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    unblock = () => { spy.mockRestore(); unblock = null; };
    act(() => {
      a.result.current.update((now) => ({ ...now, c1: hold('a') })); // A's write is not stored yet when B's update comes
      b.result.current.update((now) => { const { c2: _gone, ...rest } = now; return rest; });
    });
    await settle();
    await settle();
    expect(told.map(([w]) => w)).toEqual(['c2']); // core tells the last update's handler once
    expect(Object.keys(told[0]?.[1] as object)).toEqual(['c1']); // with A's hold in what the page wanted
    expect(warned).toEqual(['c2']); // so the person is told A's hold is not kept
  });
});
