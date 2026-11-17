// The passcode lock wipes like a page hide: every useWipeOn place drops its secret when the tab locks, not when it
// unlocks.
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';

const lock = vi.hoisted(() => ({ locked: false, listeners: new Set<() => void>() }));
vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  isLocked: () => lock.locked,
  onLockChange: (l: () => void) => { lock.listeners.add(l); return () => { lock.listeners.delete(l); }; },
}));

import { useWipeOn } from './wipe';

const setLocked = (v: boolean) => { lock.locked = v; for (const l of [...lock.listeners]) l(); };

function Place({ wipe }: { wipe: () => void }) {
  useWipeOn(wipe);
  return null;
}

afterEach(() => { lock.locked = false; });

describe('useWipeOn and the passcode lock', () => {
  it('wipes when the tab locks, not when it unlocks, and stops listening once unmounted', () => {
    const wipe = vi.fn();
    const r = render(<Place wipe={wipe} />);
    expect(wipe).not.toHaveBeenCalled();
    setLocked(true);
    expect(wipe).toHaveBeenCalledTimes(1);
    setLocked(false);
    expect(wipe).toHaveBeenCalledTimes(1);
    r.unmount();
    setLocked(true);
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it('listens to nothing when disabled', () => {
    const wipe = vi.fn();
    function Off() { useWipeOn(wipe, undefined, false); return null; }
    render(<Off />);
    setLocked(true);
    expect(wipe).not.toHaveBeenCalled();
  });
});
