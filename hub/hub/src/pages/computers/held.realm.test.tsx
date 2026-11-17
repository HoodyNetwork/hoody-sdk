// C9: only the holds of the realm shown count: a hold sent in another realm can neither be checked nor dismissed
// here, so it never blocks a send here (heldChanges(lock, { realm })).
// The runner is core's (core/storage/runner.ts): it reads holds from core's changes module, so the spy sits there.
import { bootFixtureCore, realmsView } from '@core';
import * as changes from '@core/changes';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeldOf, useRunner } from './parts/runner';

describe('computers: held changes are read for the realm shown', () => {
  beforeEach(() => bootFixtureCore({ rules: [] }));
  it('useHeldOf and useRunner ask core for the shown realm only', () => {
    const spy = vi.spyOn(changes, 'heldChanges');
    renderHook(() => useHeldOf('computer.run', () => true));
    renderHook(() => useRunner({ mutateAsync: () => Promise.resolve({ outcome: 'done' as const }) }, { lock: 'computer.create' }));
    const shown = realmsView().selected;
    const calls = spy.mock.calls.filter(([l]) => l === 'computer.run' || l === 'computer.create');
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) expect(c[1]).toEqual({ realm: shown });
    spy.mockRestore();
  });
});
