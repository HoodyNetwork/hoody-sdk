// Settings is an address param and the Bot pane is not keyed per Bot, so Back or Forward
// from ?sel=A&settings=… to ?sel=B&settings=… keeps the drawer mounted. A Reload on A must not count for B: B's form
// still takes its trip draft (a trip seeds only at count 0), and coming back to A keeps A's count.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useReloadCount } from './parts/SettingsDrawer';

describe('Settings reload count', () => {
  it('is kept per Bot while the drawer stays open, and starts again when it opens anew', () => {
    const r = renderHook(({ bot, open }) => useReloadCount(bot, open), { initialProps: { bot: 'A', open: true } });
    act(() => r.result.current[1]());
    expect(r.result.current[0]).toBe(1);
    // Another Bot in the same drawer: its count is 0, so its trip draft seeds its form.
    r.rerender({ bot: 'B', open: true });
    expect(r.result.current[0]).toBe(0);
    // Back to A: A was reloaded, so its trip does not seed again.
    r.rerender({ bot: 'A', open: true });
    expect(r.result.current[0]).toBe(1);
    // Closing the drawer forgets every count; the next opening starts at 0.
    r.rerender({ bot: 'A', open: false });
    r.rerender({ bot: 'A', open: true });
    expect(r.result.current[0]).toBe(0);
  });
});
