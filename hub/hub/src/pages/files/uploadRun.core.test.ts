// A refusal after the batch's hold is stored, over core's real attempts store. holdAttempt
// starts this tab's sending stamp; the refusal must end it before its free, or core refuses the free and the hold
// beats on, holding every Files change on the computer while the tab stays open.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { heldAttempts } from '@core';
import { setIdentity } from '@core/ctx';
import { boot, R1, UID } from '@core/test/env';
import type * as Data from './data';

const gate = vi.fn((..._a: unknown[]): string | null => null);
vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), uploadGate: (c: string) => gate(c), refreshFolders: vi.fn() }));
const { uploadLock } = await import('./data');
const { useUpload, resetUploads } = await import('./uploadRun');
const C = { id: 'c1', name: 'atlas' } as never;

beforeEach(() => { boot({ realm: R1 }); setIdentity({ id: UID, banned: false }); resetUploads(); gate.mockReset().mockReturnValue(null); });

describe('a refusal after the hold is stored (real core)', () => {
  it('the hold is freed, no stamp left beating: nothing holds the computer, nothing was sent', async () => {
    // Before the hold: none. After it is stored: a Files change was admitted meanwhile.
    gate.mockReturnValueOnce(null).mockReturnValue('HELD_OVERLAP');
    const up = renderHook(() => useUpload()).result.current;
    const b = await up.start(C, '/tmp', [{ as: 'a.txt', file: new Blob(['abc']) }]);
    expect(b).toMatchObject({ phase: 'notSent', code: 'HELD_OVERLAP' });
    await vi.waitFor(() => expect(heldAttempts(uploadLock('c1'))).toEqual([]));
  });
});
