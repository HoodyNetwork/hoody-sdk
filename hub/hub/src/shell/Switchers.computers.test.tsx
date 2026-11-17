// The computer switcher never says "No computers yet" for a list it does not know. A list
// still loading reads as loading; a read that failed (or an empty page of a longer list) reads as not loaded, with
// Try again; "No computers yet" only for a whole list that answered zero.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { ComputerSwitcher, PhoneContext } from './Switchers';

// A token session has no account capability: no Get a computer (the classic Hub's link included).
const cap = vi.hoisted(() => ({ account: true }));
vi.mock('@core', () => ({ useCan: () => cap.account }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
const navigate = vi.fn();

function mount(node: ReactNode, data: Partial<ShellData> = {}, pages: PageManifest[] = [pg('computers')]) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms: [{ id: R1, name: 'Personal' }], realmId: R1, computers: [], clearComputer: vi.fn(), ...data } as ShellData}>
          {node}
        </ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
// The provider moves to loading when Try again is pressed, as live.tsx does (refetch: fetching).
function Retrying({ children, data = {}, onRetry, initial = 'unknown' }: { children: ReactNode; data?: Partial<ShellData>; onRetry?: () => void; initial?: 'loading' | 'unknown' }) {
  const [read, setRead] = useState<'loading' | 'unknown'>(initial);
  const value = { realms: [{ id: R1, name: 'Personal' }], realmId: R1, computers: [], computersRead: read, retryComputers: () => { onRetry?.(); setRead('loading'); }, ...data } as ShellData;
  return (
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={[pg('computers')]}>
        <ShellDataProvider value={value}>{children}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const trigger = () => screen.getByRole('button', { name: / Computer$/ });
const menuItems = () => Array.from(document.querySelectorAll('[role="menu"] [role^="menuitem"]')).map((m) => m.textContent);
const openSheet = async () => press(screen.getByRole('button', { name: / Realm and computer$/ }));
const computerList = () => screen.getByRole('heading', { name: 'Computer' }).nextElementSibling as HTMLElement;
const computerRows = () => Array.from(computerList().querySelectorAll('li')).map((li) => li.textContent);

afterEach(() => {
  navigate.mockReset();
  cap.account = true;
});

describe('computer switcher: a list it does not know is never "none"', () => {
  it('loading: the trigger reads as loading (busy mark, named as loading), never "No computers yet"', async () => {
    mount(<ComputerSwitcher />, { computersRead: 'loading' });
    expect(trigger()).toHaveTextContent('Loading computers…');
    expect(trigger()).not.toHaveTextContent('No computers yet');
    expect(trigger()).toHaveAccessibleName('Loading computers… Computer');
    expect(trigger().querySelector('[data-hub-list-busy]')).not.toBeNull();
    await press(trigger());
    expect(menuItems()).toEqual(['Loading computers…', 'Get a computer']);
  });

  it('not loaded: the trigger says so, and the menu starts with Try again, which asks for the list once', async () => {
    const retryComputers = vi.fn();
    mount(<ComputerSwitcher />, { computersRead: 'unknown', retryComputers });
    expect(trigger()).toHaveTextContent('Computers not loaded');
    expect(trigger()).toHaveAccessibleName('Computers not loaded Computer');
    expect(trigger().querySelector('[data-hub-list-busy]')).toBeNull();
    await press(trigger());
    expect(menuItems()).toEqual(['Try again', 'Get a computer']);
    await press(screen.getByRole('menuitem', { name: 'Try again' }));
    expect(retryComputers).toHaveBeenCalledTimes(1);
  });

  it('not loaded without Get a computer (a token session): the switcher still shows, so Try again stays reachable', async () => {
    const retryComputers = vi.fn();
    cap.account = false;
    mount(<ComputerSwitcher />, { computersRead: 'unknown', retryComputers });
    await press(trigger());
    expect(menuItems()).toEqual(['Try again']);
  });

  it('a known empty list still says "No computers yet"', async () => {
    mount(<ComputerSwitcher />);
    expect(trigger()).toHaveTextContent('No computers yet');
    expect(trigger()).toHaveAccessibleName('No computers yet Computer');
  });

  it('listed computers win over a read state: no Try again, no busy mark (a refetch of a known list)', async () => {
    mount(<ComputerSwitcher />, { computersRead: 'unknown', retryComputers: vi.fn(), computers: [{ id: 'a1', name: 'alpha', running: true }], computerId: 'a1' });
    expect(trigger()).toHaveTextContent('alpha');
    expect(trigger()).not.toHaveTextContent('Computers not loaded');
    await press(trigger());
    expect(menuItems()).toEqual(['All computers', 'alpha', 'Get a computer']);
  });

  it('listed computers win over loading: the caret stays, no busy mark', () => {
    mount(<ComputerSwitcher />, { computersRead: 'loading', computers: [{ id: 'a1', name: 'alpha', running: true }], computerId: 'a1' });
    expect(trigger().querySelector('[data-hub-list-busy]')).toBeNull();
  });
});

describe('Try again keeps the switcher while the list reads again', () => {
  it('desktop, without Get a computer (a token session): the trigger stays and reads as loading', async () => {
    cap.account = false;
    render(<Retrying><ComputerSwitcher /></Retrying>);
    await press(trigger());
    await press(screen.getByRole('menuitem', { name: 'Try again' }));
    expect(trigger()).toHaveTextContent('Loading computers…');
    await press(trigger());
    expect(menuItems()).toEqual(['Loading computers…']);
  });

  it('phone, no realm and no Get a computer: Enter on Try again keeps the sheet open, reads as loading, focus stays on it', async () => {
    const user = userEvent.setup();
    const asked = vi.fn();
    cap.account = false;
    render(<Retrying data={{ realms: [], realmId: 'all' }} onRetry={asked}><PhoneContext /></Retrying>);
    await openSheet();
    const again = screen.getByRole('button', { name: 'Try again' });
    await act(async () => again.focus());
    await user.keyboard('{Enter}');
    const sheet = screen.getByRole('dialog', { name: 'Realm and computer' });
    expect(computerRows()).toEqual(['Loading computers…', 'Try again']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try again' }));
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute('aria-disabled', 'true');
    // Pending: a second press while the list reads asks for nothing.
    await user.keyboard('{Enter}');
    expect(asked).toHaveBeenCalledTimes(1);
    expect(computerRows()).toEqual(['Loading computers…', 'Try again']);
  });

  it('phone: a first read nobody asked for has no Try again, even with a retry on hand', async () => {
    render(<Retrying initial="loading"><PhoneContext /></Retrying>);
    await openSheet();
    expect(computerRows()).toEqual(['Loading computers…', 'Get a computer']);
  });

  it('phone, no realm and no Get a computer: a first read keeps the chip, and the sheet reads as loading', async () => {
    cap.account = false;
    render(<Retrying data={{ realms: [], realmId: 'all' }} initial="loading"><PhoneContext /></Retrying>);
    await openSheet();
    expect(computerRows()).toEqual(['Loading computers…']);
  });

  it('phone: after Try again in one realm, another realm\'s load has no Try again', async () => {
    const two = { realms: [{ id: R1, name: 'Personal' }, { id: R2, name: 'Work' }] } as Partial<ShellData>;
    const { rerender } = render(<Retrying data={two}><PhoneContext /></Retrying>);
    await openSheet();
    await press(screen.getByRole('button', { name: 'Try again' }));
    expect(computerRows()).toEqual(['Loading computers…', 'Try again', 'Get a computer']);
    rerender(<Retrying data={{ ...two, realmId: R2 }}><PhoneContext /></Retrying>);
    expect(computerRows()).toEqual(['Loading computers…', 'Get a computer']);
  });

  it('phone with a realm: focus stays on Try again inside the sheet while the list reads again', async () => {
    const user = userEvent.setup();
    render(<Retrying><PhoneContext /></Retrying>);
    await openSheet();
    await act(async () => screen.getByRole('button', { name: 'Try again' }).focus());
    await user.keyboard('{Enter}');
    expect(computerRows()).toEqual(['Loading computers…', 'Try again', 'Get a computer']);
    expect(screen.getByRole('dialog', { name: 'Realm and computer' }).contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try again' }));
  });
});

describe('phone sheet: the computer list it does not know', () => {
  it('loading: a plain "Loading computers…" row before Get a computer', async () => {
    mount(<PhoneContext />, { computersRead: 'loading' });
    await openSheet();
    expect(computerRows()).toEqual(['Loading computers…', 'Get a computer']);
    expect(computerList().querySelectorAll('button')).toHaveLength(0);
  });

  it('not loaded: says so, with a Try again button that asks for the list once', async () => {
    const retryComputers = vi.fn();
    mount(<PhoneContext />, { computersRead: 'unknown', retryComputers });
    await openSheet();
    expect(computerRows()).toEqual(['Computers not loaded', 'Try again', 'Get a computer']);
    await press(screen.getByRole('button', { name: 'Try again' }));
    expect(retryComputers).toHaveBeenCalledTimes(1);
  });

  it('listed computers win: no loading or not-loaded line, no Try again', async () => {
    mount(<PhoneContext />, { computersRead: 'unknown', retryComputers: vi.fn(), computers: [{ id: 'a1', name: 'alpha', running: true }], computerId: 'a1' });
    await openSheet();
    expect(computerRows()).toEqual(['All computers', 'alpha', 'Get a computer']);
  });

  it('not loaded with no realm and no Get a computer (a token session): the chip still shows, so Try again is reachable', async () => {
    const retryComputers = vi.fn();
    cap.account = false;
    mount(<PhoneContext />, { realms: [], realmId: 'all', computersRead: 'unknown', retryComputers });
    await openSheet();
    expect(computerRows()).toEqual(['Computers not loaded', 'Try again']);
  });
});
