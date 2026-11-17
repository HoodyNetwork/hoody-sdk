// Vitest: editable Tabs (as on the Board): rename by double-click, F2 or the menu; reorder by drag, by
// Alt+Shift+Arrow and by the menu's Move left/right (mouse, keyboard and touch parity); a per-tab ⋯ menu.
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
  { id: 'c', label: 'Logs' },
];

function setup(extra: { menu?: (id: string) => { id: string; label: string; onAction: () => void }[] } = {}) {
  const onRename = vi.fn();
  const onMove = vi.fn();
  render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename, onMove, ...extra }} />);
  return { onRename, onMove };
}

describe('Tabs, editable', () => {
  it('a double-click renames in place; Enter keeps the new name', async () => {
    const { onRename } = setup();
    await userEvent.dblClick(screen.getByText('Builds'));
    const input = screen.getByRole('textbox', { name: /Rename Builds/ });
    await userEvent.clear(input);
    await userEvent.type(input, 'Deploys{Enter}');
    expect(onRename).toHaveBeenCalledWith('b', 'Deploys');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('F2 on the focused tab renames; Escape drops the edit; an empty or unchanged name sends nothing', async () => {
    const { onRename } = setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{F2}');
    const input = screen.getByRole('textbox', { name: /Rename Overview/ });
    await userEvent.type(input, 'x{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{F2}');
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.keyboard('{Enter}');
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{F2}{Enter}');
    expect(onRename).not.toHaveBeenCalled();
  });

  it('Alt+Shift+Arrow moves the focused tab one place; never past either end', async () => {
    const { onMove } = setup();
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}');
    expect(onMove).toHaveBeenLastCalledWith('a', 1);
    await userEvent.keyboard('{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}');
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it("the ⋯ menu of the open tab renames and moves, and carries the page's own items", async () => {
    const dup = vi.fn();
    const { onMove } = setup({ menu: (id) => [{ id: 'dup', label: `Duplicate ${id}`, onAction: dup }] });
    await userEvent.click(screen.getByRole('button', { name: 'Tab actions: Overview' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Rename/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Move left/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(menu).getByRole('menuitem', { name: /Duplicate a/ })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Move right/ }));
    expect(onMove).toHaveBeenCalledWith('a', 1);
  });

  it('a right-click (a long press on touch) opens the menu of the tab under it', async () => {
    const { onRename } = setup();
    fireEvent.contextMenu(screen.getByText('Logs'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Move right/ })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Rename/ }));
    const input = await screen.findByRole('textbox', { name: /Rename Logs/ });
    await userEvent.type(input, ' 2{Enter}');
    expect(onRename).toHaveBeenCalledWith('c', 'Logs 2');
  });

  it('a tab dropped on the far half of another takes its place', () => {
    const { onMove } = setup();
    const data = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' };
    // happy-dom has no DragEvent and draws no boxes: x 0 is the far half of a zero-width tab.
    const at = (kind: 'dragOver' | 'drop') => {
      const ev = createEvent[kind](screen.getByText('Logs'), { dataTransfer: data });
      Object.defineProperty(ev, 'clientX', { value: 0 });
      fireEvent(screen.getByText('Logs'), ev);
    };
    fireEvent.dragStart(screen.getByText('Overview'), { dataTransfer: data });
    at('dragOver');
    at('drop');
    expect(onMove).toHaveBeenCalledWith('a', 2);
  });

  it('without `edit` the bar stays plain: no ⋯, no rename, nothing draggable', async () => {
    render(<Tabs label="Board" items={VIEWS} value="a" />);
    expect(screen.queryByRole('button', { name: /Tab actions/ })).toBeNull();
    await userEvent.dblClick(screen.getByText('Builds'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Builds').closest('[draggable="true"]')).toBeNull();
  });

  it('focus comes back to the open tab after a rename ends, and the field is not inside a tab (hrefs 1a, 1b)', async () => {
    setup();
    await userEvent.dblClick(screen.getByText('Builds'));
    const input = screen.getByRole('textbox', { name: /Rename Builds/ });
    expect(input.closest('[role="tab"]')).toBeNull();
    await userEvent.type(input, '{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Overview' })));
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{F2}{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Overview' })));
  });

  it('a menu opened on a tab gives focus back to the open tab, never the ⋯ button or another tab (hrefs 2)', async () => {
    setup();
    fireEvent.contextMenu(screen.getByText('Logs'));
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Overview' })));
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });
});
