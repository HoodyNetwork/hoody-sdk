// Vitest: editable Tabs. `edit.menuButton: false` drops the ⋯ button after the tabs; the tab menu
// still opens on a tab (right-click, Shift+F10, the menu key) with the same rows, has the same name, gives focus back
// to the open tab, and drops from the tab it is about (ActionMenu `anchor`). The default keeps the button, as every page has it today.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
  { id: 'c', label: 'Logs' },
];
afterEach(() => vi.restoreAllMocks());

function setup(menuButton?: boolean) {
  const onRename = vi.fn();
  const onMove = vi.fn();
  const dup = vi.fn();
  render(<Tabs label="Board" items={VIEWS} value="a" edit={{ onRename, onMove, menu: (id) => [{ id: 'dup', label: `Duplicate ${id}`, onAction: () => dup(id) }], ...(menuButton === undefined ? {} : { menuButton }) }} />);
  return { onRename, onMove, dup };
}

describe('Tabs, edit.menuButton', () => {
  it('default and menuButton: true draw the ⋯ button of the open tab, as before', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Tab actions: Overview' })).toBeInTheDocument();
  });

  it('menuButton: true is the default', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Tab actions: Overview' })).toBeInTheDocument();
  });

  it('menuButton: false draws no ⋯ button and nothing reachable in its place', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: /Tab actions/ })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('without the button a right-click still opens that tab menu, named for that tab, with every row', async () => {
    const { onMove, dup } = setup(false);
    fireEvent.contextMenu(screen.getByText('Builds'));
    const menu = await screen.findByRole('menu', { name: 'Tab actions: Builds' });
    expect(within(menu).getByRole('menuitem', { name: /Rename/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Move left/ })).not.toHaveAttribute('aria-disabled');
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Duplicate b/ }));
    expect(dup).toHaveBeenCalledWith('b');
    expect(onMove).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('Shift+F10 on the focused tab opens its menu; Escape gives focus back to the open tab', async () => {
    setup(false);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await screen.findByRole('menu', { name: 'Tab actions: Overview' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Overview' })));
  });

  it('the ContextMenu key on the focused tab opens its menu too', async () => {
    setup(false);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Builds' }).focus();
    await user.keyboard('{ContextMenu}');
    expect(await screen.findByRole('menu', { name: 'Tab actions: Builds' })).toBeInTheDocument();
  });

  it('a Rename chosen in that menu starts the rename in place and the field keeps focus', async () => {
    const { onRename } = setup(false);
    fireEvent.contextMenu(screen.getByText('Logs'));
    const menu = await screen.findByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Rename/ }));
    const input = await screen.findByRole('textbox', { name: /Rename Logs/ });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await userEvent.type(input, ' 2{Enter}');
    expect(onRename).toHaveBeenCalledWith('c', 'Logs 2');
  });

  it('the menu drops from the tab it is about', async () => {
    const real = HTMLElement.prototype.getBoundingClientRect;
    const at = { x: 260, y: 180, left: 260, top: 180, right: 330, bottom: 212, width: 70, height: 32, toJSON: () => ({}) } as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'tab' && this.textContent?.includes('Logs') ? at : real.call(this);
    });
    setup(false);
    fireEvent.contextMenu(screen.getByText('Logs'));
    const menu = await screen.findByRole('menu');
    const pop = menu.parentElement?.closest<HTMLElement>('[style]');
    await waitFor(() => expect(parseFloat(pop?.style.top ?? '0')).toBeGreaterThanOrEqual(at.bottom));
  });
});
