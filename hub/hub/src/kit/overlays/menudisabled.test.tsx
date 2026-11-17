// ActionMenu disabled items: a disabled item stays in the arrow-key order, so a keyboard or
// screen-reader user reaches it and hears its reason (the item's accessible description); choosing it does nothing
// and leaves the menu open. Seen on Apps "Put on Board" when the Board refuses a tile.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu, type MenuEntry } from './Overlays';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const REASON = "The Board can't show it as a tile here";
const items = (put: () => void, open: () => void): MenuEntry[] => [
  { id: 'open', label: 'Open', onAction: open },
  { id: 'board', label: 'Put on Board', icon: 'board', isDisabled: true, disabledReason: REASON, onAction: put },
  { id: 'copy', label: 'Copy address', onAction: () => undefined },
];
const openMenu = async (entries: readonly MenuEntry[]) => {
  render(<ActionMenu label="App actions" items={entries} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'App actions' }));
  });
  return screen.getByRole('menu');
};
const item = (name: string) => screen.getByRole('menuitem', { name });

describe('ActionMenu: a disabled item is reachable, explained and inert', () => {
  it('arrow keys land on it (it is not skipped)', async () => {
    await openMenu(items(vi.fn(), vi.fn()));
    const user = userEvent.setup();
    item('Open').focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item('Put on Board'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item('Copy address'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(item('Put on Board'));
  });

  it('says it is unavailable and carries its reason as its accessible description', async () => {
    await openMenu(items(vi.fn(), vi.fn()));
    const board = item('Put on Board');
    expect(board).toHaveAttribute('aria-disabled', 'true');
    expect(board).toHaveAccessibleDescription(REASON);
    // An enabled item says neither.
    expect(item('Open')).not.toHaveAttribute('aria-disabled');
  });

  it('Enter, Space and a click on it do nothing, and the menu stays open', async () => {
    const put = vi.fn();
    await openMenu(items(put, vi.fn()));
    const user = userEvent.setup();
    item('Open').focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item('Put on Board'));
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.click(item('Put on Board'));
    expect(put).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('the enabled items still act and close the menu', async () => {
    const open = vi.fn();
    await openMenu(items(vi.fn(), open));
    await userEvent.setup().click(item('Open'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a disabled on/off item is reachable and does not toggle', async () => {
    const wrap = vi.fn();
    await openMenu([
      { id: 'scroll', label: 'Scroll', checked: true, onAction: () => undefined },
      { id: 'wrap', label: 'Wrap', checked: false, isDisabled: true, disabledReason: 'Not for this file', onAction: wrap },
    ]);
    const user = userEvent.setup();
    screen.getByRole('menuitemcheckbox', { name: 'Scroll' }).focus();
    await user.keyboard('{ArrowDown}');
    const w = screen.getByRole('menuitemcheckbox', { name: 'Wrap' });
    expect(document.activeElement).toBe(w);
    expect(w).toHaveAttribute('aria-disabled', 'true');
    expect(w).toHaveAccessibleDescription('Not for this file');
    await user.keyboard('{Enter}');
    expect(wrap).not.toHaveBeenCalled();
    expect(w).toHaveAttribute('aria-checked', 'false');
  });
});
