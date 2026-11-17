// The account menu's name/email head opens Account inside the Hub (a plain
// heading only when this load hides Account); picking All computers, or a computer, closes the computer menu, also
// when the pick changes nothing.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { AccountMenu, ComputerSwitcher } from './Switchers';

vi.mock('@core', () => ({ useCan: () => true }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const ONE = '6a00000000000000000000a1';
const TWO = '6a00000000000000000000b2';
const boxes = [
  { id: ONE, name: 'box-one', running: true, flag: '', location: 'Paris' },
  { id: TWO, name: 'box-two', running: false, flag: '', location: 'Oslo' },
];
const navigate = vi.fn();
const account = { name: 'Ada Lovelace', detail: 'ada@example.com' };

function mount(node: ReactNode, pages: PageManifest[], data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: boxes, computerId: TWO, account, ...data }}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}

/** The switcher with live shell data: a pick changes what the next render shows, as in the shell. */
function LiveSwitcher({ start }: { start?: string }) {
  const [computerId, setId] = useState<string | undefined>(start);
  return (
    <ShellDataProvider value={{ realms: [], realmId: 'all', computers: boxes, computerId, setComputer: setId, clearComputer: () => setId(undefined) }}>
      <ComputerSwitcher />
    </ShellDataProvider>
  );
}

const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const openAccount = () => press(screen.getByRole('button', { name: 'Account menu' }));
const openComputers = () => press(screen.getByRole('button', { name: / Computer$/ }));
const menuOpen = () => screen.queryByRole('menu', { name: 'Computer' }) !== null;

afterEach(() => navigate.mockReset());

describe('account menu: the name/email head', () => {
  it('opens Account inside the Hub, as the first item of the menu', async () => {
    mount(<AccountMenu />, [pg('account')]);
    await openAccount();
    const head = screen.getByRole('menuitem', { name: 'Ada Lovelace' });
    expect(head).toHaveAttribute('href', '/account');
    expect(head).toHaveAccessibleDescription('ada@example.com');
    expect(screen.getAllByRole('menuitem')[0]).toBe(head);
    await press(head);
    expect(navigate).toHaveBeenCalledWith('/account', undefined);
  });

  it('the keyboard reaches it: Home, then Enter opens Account', async () => {
    const user = userEvent.setup();
    mount(<AccountMenu />, [pg('account')]);
    await openAccount();
    await user.keyboard('{End}{Home}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Ada Lovelace' }));
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/account', undefined);
  });

  it('a load that hides Account: the head stays a plain heading, no link', async () => {
    mount(<AccountMenu />, [pg('guide')]);
    await openAccount();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Ada Lovelace' })).toBeNull();
    expect(document.querySelector('a[href="/account"]')).toBeNull();
  });
});

describe('computer menu: a pick closes it', () => {
  it('All computers switches to all and closes the menu', async () => {
    render(<LiveSwitcher start={TWO} />);
    await openComputers();
    expect(menuOpen()).toBe(true);
    await press(screen.getByRole('menuitemradio', { name: 'All computers' }));
    expect(menuOpen()).toBe(false);
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveTextContent('All computers');
  });

  it('All computers when it is already the choice still closes the menu', async () => {
    render(<LiveSwitcher />);
    await openComputers();
    await press(screen.getByRole('menuitemradio', { name: 'All computers' }));
    expect(menuOpen()).toBe(false);
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveTextContent('All computers');
  });

  it('a computer, and the computer already shown, close the menu', async () => {
    render(<LiveSwitcher />);
    await openComputers();
    await press(screen.getByRole('menuitemradio', { name: 'box-one Paris' }));
    expect(menuOpen()).toBe(false);
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveTextContent('box-one');
    await openComputers();
    await press(screen.getByRole('menuitemradio', { name: 'box-one Paris' }));
    expect(menuOpen()).toBe(false);
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveTextContent('box-one');
  });
});
