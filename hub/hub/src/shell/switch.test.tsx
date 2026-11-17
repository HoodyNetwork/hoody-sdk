// An account or realm switch leaves nothing of the old context in the shell's overlays: the palette
// closes (its next open starts empty) and a question a page handed the Ask dock is dropped, so it
// never shows under the new account or realm.
import { act, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropAskDraft, setAskForFixtures, useAskDock } from '@kit/ask';

const core = vi.hoisted(() => {
  let snap = { account: 'acct-a', realm: 'realm-1', target: null as unknown };
  const ls = new Set<() => void>();
  return {
    get: () => snap,
    set(next: Partial<typeof snap>) {
      snap = { ...snap, ...next };
      for (const l of ls) l();
    },
    sub(l: () => void) {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
});
vi.mock('@core', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useCore: () => useSyncExternalStore(core.sub, core.get, core.get) };
});

const { ContextOutlet, useOnContextSwitch } = await import('./switch');

afterEach(() => {
  act(() => core.set({ account: 'acct-a', realm: 'realm-1', target: null }));
  dropAskDraft();
  setAskForFixtures(false);
});

describe('context switch', () => {
  it('runs the reset on an account switch and on a realm switch, not on mount or a computer change', () => {
    const reset = vi.fn();
    renderHook(() => useOnContextSwitch(reset));
    expect(reset).not.toHaveBeenCalled();
    act(() => core.set({ target: { container: 'c2' } }));
    expect(reset).not.toHaveBeenCalled();
    act(() => core.set({ realm: 'realm-2' }));
    expect(reset).toHaveBeenCalledTimes(1);
    act(() => core.set({ account: 'acct-b' }));
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('the palette closes on a switch', () => {
    function Frame() {
      const [open, setOpen] = useState(true);
      useOnContextSwitch(() => setOpen(false));
      return <p>{open ? 'palette open' : 'palette closed'}</p>;
    }
    render(<Frame />);
    expect(screen.getByText('palette open')).toBeInTheDocument();
    act(() => core.set({ account: 'acct-b' }));
    expect(screen.getByText('palette closed')).toBeInTheDocument();
  });

  it('a question handed to the Ask dock under the old account is gone after the switch', () => {
    setAskForFixtures(true);
    const { result } = renderHook(() => {
      useOnContextSwitch(dropAskDraft);
      return useAskDock();
    });
    act(() => result.current.open({ text: 'why is old-box down?', source: 'home' }));
    expect(result.current.draft?.text).toBe('why is old-box down?');
    act(() => core.set({ account: 'acct-b' }));
    expect(result.current.draft).toBeUndefined();
    expect(result.current.takeDraft()).toBeUndefined();
    act(() => result.current.close());
  });

  it('the page remounts on a realm or account switch: an open drawer is gone, a computer change keeps it', () => {
    function Page() {
      const [drawer, setDrawer] = useState(false);
      return drawer ? <p>drawer open</p> : <button onClick={() => setDrawer(true)}>open drawer</button>;
    }
    render(
      <ContextOutlet>
        <Page />
      </ContextOutlet>,
    );
    act(() => screen.getByRole('button', { name: 'open drawer' }).click());
    act(() => core.set({ target: { container: 'c2' } }));
    expect(screen.getByText('drawer open')).toBeInTheDocument();
    act(() => core.set({ realm: 'realm-2' }));
    expect(screen.queryByText('drawer open')).toBeNull();
    act(() => screen.getByRole('button', { name: 'open drawer' }).click());
    act(() => core.set({ account: 'acct-b' }));
    expect(screen.queryByText('drawer open')).toBeNull();
  });
});
