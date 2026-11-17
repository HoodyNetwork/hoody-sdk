// The realm menu ends with "Share this realm…", which opens the Keys page's share
// drawer for the realm shown (`/keys/shared?share=1&open_realm=<id>`; "Share a realm…" with no realm in All realms). Only
// for account sessions, and only when this load serves the Keys page: the classic Hub keeps its own share item.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { PhoneContext, RealmSwitcher } from './Switchers';

let canAccount = true;
vi.mock('@core', () => ({ useCan: (cap: string) => cap === 'account' && canAccount }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
const realms = [
  { id: R1, name: 'Acme client', color: 'blue' },
  { id: R2, name: 'Personal', color: 'green' },
];
const navigate = vi.fn();

function mount(node: ReactNode, pages: PageManifest[], data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms, realmId: R2, computers: [], account: { name: 'Ada' }, ...data } as ShellData}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const menuItems = () => Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'));
const openRealms = async () => press(screen.getByRole('button', { name: / Realm$/ }));

beforeEach(() => {
  canAccount = true;
});
afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
});

describe('realm menu: Share this realm', () => {
  it('comes last and opens the share drawer for the realm shown, switching nothing', async () => {
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys')], { setRealm });
    await openRealms();
    expect(menuItems().map((i) => i.textContent)).toEqual(['All realms', 'Acme client', 'Personal', 'Share this realm…']);
    const share = screen.getByRole('menuitem', { name: 'Share this realm…' });
    expect(share).toHaveAttribute('href', `/keys/shared?share=1&open_realm=${R2}`);
    await press(share);
    expect(navigate).toHaveBeenCalledWith(`/keys/shared?share=1&open_realm=${R2}`, undefined);
    expect(setRealm).not.toHaveBeenCalled();
  });

  it('in All realms it is "Share a realm…" with no realm named', async () => {
    mount(<RealmSwitcher />, [pg('keys')], { realmId: 'all' });
    await openRealms();
    const share = screen.getByRole('menuitem', { name: 'Share a realm…' });
    expect(share).toHaveAttribute('href', '/keys/shared?share=1');
    expect(screen.queryByRole('menuitem', { name: 'Share this realm…' })).toBeNull();
  });

  it('picking a realm still switches to it, navigates nowhere, and the shown realm is the one checked', async () => {
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys')], { setRealm });
    await openRealms();
    expect(screen.getByRole('menuitemradio', { name: 'Personal' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Acme client' })).toHaveAttribute('aria-checked', 'false');
    await press(screen.getByRole('menuitemradio', { name: 'Acme client' }));
    expect(setRealm).toHaveBeenCalledWith(R1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opening the menu from the keyboard still lands on the realm shown (not the first row), and Enter keeps it', async () => {
    const user = userEvent.setup();
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys')], { setRealm });
    screen.getByRole('button', { name: / Realm$/ }).focus();
    await user.keyboard('{Enter}');
    // The menu's focus target is its one tabindex=0 row (happy-dom leaves DOM focus on the popover; a browser moves
    // it there): the realm shown, Personal, the second row.
    const personal = screen.getByRole('menuitemradio', { name: 'Personal' });
    await waitFor(() => expect(personal).toHaveAttribute('tabindex', '0'));
    expect(screen.getByRole('menuitemradio', { name: 'Acme client' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('menuitem', { name: 'Share this realm…' })).toHaveAttribute('tabindex', '-1');
    act(() => personal.focus());
    await user.keyboard('{Enter}');
    expect(setRealm).toHaveBeenCalledWith(R2);
    expect(setRealm).not.toHaveBeenCalledWith(R1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the keyboard reaches it: End, then Enter opens the drawer', async () => {
    const user = userEvent.setup();
    mount(<RealmSwitcher />, [pg('keys')]);
    await openRealms();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Share this realm…' }));
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith(`/keys/shared?share=1&open_realm=${R2}`, undefined);
  });

  it('a token session (no account) is offered no share', async () => {
    canAccount = false;
    mount(<RealmSwitcher />, [pg('keys')]);
    await openRealms();
    expect(menuItems().map((i) => i.textContent)).toEqual(['Acme client', 'Personal']);
  });

  it('a load that does not serve the Keys page offers no share (the classic Hub has its own)', async () => {
    mount(<RealmSwitcher />, [pg('home')]);
    await openRealms();
    expect(menuItems().map((i) => i.textContent)).toEqual(['Acme client', 'Personal']);
  });

  it('the phone sheet has it in the "Menu actions" footer after the realm list; it opens the drawer and closes the sheet, switching nothing', async () => {
    const setRealm = vi.fn();
    mount(<PhoneContext />, [pg('keys')], { setRealm });
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    const link = screen.getByRole('link', { name: 'Share this realm…' });
    expect(link.closest('[role="group"]')).toHaveAttribute('aria-label', 'Menu actions');
    expect(link.closest('ul')).toBeNull();
    expect(link).toHaveAttribute('href', `/keys/shared?share=1&open_realm=${R2}`);
    await press(link);
    expect(navigate).toHaveBeenCalledWith(`/keys/shared?share=1&open_realm=${R2}`, undefined);
    expect(setRealm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Realm and computer' })).toBeNull();
  });

  it('the phone sheet in All realms offers "Share a realm…" with no realm named', async () => {
    mount(<PhoneContext />, [pg('keys')], { realmId: 'all' });
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.getByRole('link', { name: 'Share a realm…' })).toHaveAttribute('href', '/keys/shared?share=1');
    expect(screen.queryByRole('link', { name: 'Share this realm…' })).toBeNull();
  });

  it('the phone sheet of a load that does not serve the Keys page has no share', async () => {
    mount(<PhoneContext />, [pg('home')]);
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.queryByRole('link', { name: /Share/ })).toBeNull();
  });

  it('the phone sheet of a token session has no share', async () => {
    canAccount = false;
    mount(<PhoneContext />, [pg('keys')]);
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.queryByRole('link', { name: /Share/ })).toBeNull();
  });
});
