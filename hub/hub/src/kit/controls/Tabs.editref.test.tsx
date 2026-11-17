// Vitest: editable Tabs. `editRef.rename(id)` starts the same in-place rename as F2, from outside
// the bar (a page menu's Rename): the field opens over that tab with focus, after the menu it was chosen in hands focus
// back; Enter keeps the name, Escape drops it. A disabled tab, or tabs without `onRename`, start nothing.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu } from '../overlays/Overlays';
import { Tabs, type TabsEditHandle } from './Tabs';

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
  { id: 'c', label: 'Logs', isDisabled: true },
];

function setup(onRename: ((id: string, name: string) => void) | null = vi.fn()) {
  const ref = createRef<TabsEditHandle>();
  render(
    <div>
      <ActionMenu label="Page menu" items={[{ id: 'r', label: 'Rename Builds', onAction: () => ref.current?.rename('b') }]} />
      <Tabs label="Board" items={VIEWS} value="a" edit={{ ...(onRename ? { onRename } : {}), onMove: vi.fn() }} editRef={ref} />
    </div>,
  );
  return { ref, onRename };
}

describe('Tabs, editRef', () => {
  it('rename(id) opens the rename field over that tab with focus; Enter keeps the name', async () => {
    const { ref, onRename } = setup();
    ref.current?.rename('b');
    const input = await screen.findByRole('textbox', { name: /Rename Builds/ });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await userEvent.clear(input);
    await userEvent.type(input, 'Deploys{Enter}');
    expect(onRename).toHaveBeenCalledWith('b', 'Deploys');
  });

  it("chosen in a page's own menu, the field keeps focus after the menu closes", async () => {
    boot();
    const { onRename } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Page menu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename Builds' }));
    const input = await screen.findByRole('textbox', { name: /Rename Builds/ });
    await new Promise((r) => setTimeout(r, 80));
    expect(document.activeElement).toBe(input);
    await userEvent.type(input, '{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a disabled tab starts nothing', async () => {
    const { ref } = setup();
    ref.current?.rename('c');
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('without onRename it starts nothing', async () => {
    const { ref } = setup(null);
    ref.current?.rename('b');
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('the tabs changing before the deferred start: the rename opens on the tab as it is then, by its latest name', async () => {
    const ref = createRef<TabsEditHandle>();
    const onRename = vi.fn();
    const { rerender } = render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename }} editRef={ref} />);
    ref.current?.rename('b');
    rerender(<Tabs label="Board" items={VIEWS.map((x) => (x.id === 'b' ? { ...x, label: 'Deploys' } : x))} value="a" edit={{ onRename }} editRef={ref} />);
    const input = await screen.findByRole('textbox', { name: /Rename Deploys/ });
    expect((input as HTMLInputElement).value).toBe('Deploys');
  });

  it('a tab gone before the deferred start starts nothing', async () => {
    const ref = createRef<TabsEditHandle>();
    const { rerender } = render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename: vi.fn() }} editRef={ref} />);
    ref.current?.rename('b');
    rerender(<Tabs label="Board" items={VIEWS.filter((x) => x.id !== 'b')} value="a" edit={{ onRename: vi.fn() }} editRef={ref} />);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('unmounted between the call and its frames: nothing starts and nothing is warned', async () => {
    const ref = createRef<TabsEditHandle>();
    const err = vi.spyOn(console, 'error');
    const { unmount } = render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename: vi.fn() }} editRef={ref} />);
    const handle = ref.current!;
    handle.rename('b');
    unmount();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
