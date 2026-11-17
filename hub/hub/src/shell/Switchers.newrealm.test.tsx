// The realm menu offers "New realm…", which opens the New realm flow (the realms page, /realms/new).
// Only for account sessions that may switch realms (not a pinned token session), and only when this load serves the
// realms page. An account with no realm yet still gets the switcher, so it can make its first one.
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { PhoneContext, RealmSwitcher } from './Switchers';

let canAccount = true;
vi.mock('@core', () => ({ useCan: (cap: string) => cap === 'account' && canAccount }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
// The realms page is the flow itself (path /realms/new).
const realmsPage = { ...pg('realms'), path: '/realms/new' } as PageManifest;
const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
const realms = [
  { id: R1, name: 'Acme client', color: 'blue' },
  { id: R2, name: 'Personal', color: 'green' },
];
const navigate = vi.fn();
const setRealm = vi.fn();

function mount(node: ReactNode, pages: PageManifest[], data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms, realmId: R2, computers: [], account: { name: 'Ada' }, setRealm, ...data } as ShellData}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const menuItems = () => Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')).map((i) => i.textContent);
const openRealms = async () => press(screen.getByRole('button', { name: / Realm$/ }));

beforeEach(() => {
  canAccount = true;
});
afterEach(() => {
  navigate.mockReset();
  setRealm.mockReset();
});

describe('realm menu: New realm', () => {
  it('comes last, after Share, and opens the New realm flow, switching nothing', async () => {
    mount(<RealmSwitcher />, [pg('keys'), realmsPage]);
    await openRealms();
    expect(menuItems()).toEqual(['All realms', 'Acme client', 'Personal', 'Share this realm…', 'New realm…']);
    const item = screen.getByRole('menuitem', { name: 'New realm…' });
    expect(item).toHaveAttribute('href', '/realms/new');
    await press(item);
    expect(navigate).toHaveBeenCalledWith('/realms/new', undefined);
    expect(setRealm).not.toHaveBeenCalled();
  });

  it('shows without Share too (a load without the Keys page)', async () => {
    mount(<RealmSwitcher />, [realmsPage]);
    await openRealms();
    expect(menuItems()).toEqual(['All realms', 'Acme client', 'Personal', 'New realm…']);
  });

  it('an account with no realm yet gets the switcher, with New realm alone', async () => {
    mount(<RealmSwitcher />, [realmsPage], { realms: [], realmId: 'all' });
    await openRealms();
    expect(menuItems()).toEqual(['New realm…']);
  });

  it('no realm and no New realm: no switcher, as before', () => {
    mount(<RealmSwitcher />, [pg('home')], { realms: [], realmId: 'all' });
    expect(screen.queryByRole('button', { name: / Realm$/ })).toBeNull();
  });

  it('not offered when the load does not serve the realms page', async () => {
    mount(<RealmSwitcher />, [pg('home')]);
    await openRealms();
    expect(menuItems()).toEqual(['All realms', 'Acme client', 'Personal']);
  });

  it('not offered to a session that cannot switch realms (pinned token: no setRealm)', async () => {
    mount(<RealmSwitcher />, [realmsPage], { setRealm: undefined });
    await openRealms();
    expect(menuItems()).toEqual(['Acme client', 'Personal']);
  });

  it('not offered to a session without an account', async () => {
    canAccount = false;
    mount(<RealmSwitcher />, [realmsPage]);
    await openRealms();
    expect(menuItems()).toEqual(['All realms', 'Acme client', 'Personal']);
  });

  it('the phone sheet ends its "Menu actions" footer with it, after Share; it opens the flow and closes the sheet', async () => {
    mount(<PhoneContext />, [pg('keys'), realmsPage]);
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    const link = screen.getByRole('link', { name: 'New realm…' });
    const foot = link.closest('[role="group"]');
    expect(foot).toHaveAttribute('aria-label', 'Menu actions');
    expect(Array.from(foot?.querySelectorAll('a') ?? []).map((a) => a.textContent)).toEqual(['Share this realm…', 'New realm…']);
    expect(link).toHaveAttribute('href', '/realms/new');
    await press(link);
    expect(navigate).toHaveBeenCalledWith('/realms/new', undefined);
    expect(setRealm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Realm and computer' })).toBeNull();
  });

  it('an account with no realm and no computer reaches New realm in the phone sheet', async () => {
    mount(<PhoneContext />, [realmsPage], { realms: [], realmId: 'all' });
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.getByRole('link', { name: 'New realm…' })).toHaveAttribute('href', '/realms/new');
  });
});
