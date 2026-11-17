// "All realms" in the realm menu: the first choice of the realm menu and of the phone
// sheet's realm list, which switches the shell to 'all' through the same path as any realm pick. Hidden for a pinned
// token session (it has no setRealm: it cannot switch), and with no realm listed (there is nothing to widen to).
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { PhoneContext, RealmSwitcher } from './Switchers';

vi.mock('@core', () => ({ useCan: () => true }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
const realms = [
  { id: R1, name: 'Acme client', color: 'blue' },
  { id: R2, name: 'Personal', color: 'green' },
];
const navigate = vi.fn();

function mount(node: ReactNode, data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={[pg('home')]}>
        <ShellDataProvider value={{ realms, realmId: R2, computers: [], account: { name: 'Ada' }, ...data } as ShellData}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const radios = () => Array.from(document.querySelectorAll('[role="menuitemradio"]'));
const openRealms = async () => press(screen.getByRole('button', { name: / Realm$/ }));
const openSheet = async () => press(screen.getByRole('button', { name: / Realm and computer$/ }));
const sheetRows = () => Array.from(screen.getByRole('heading', { name: 'Realm' }).nextElementSibling?.querySelectorAll('li') ?? []);

afterEach(() => {
  navigate.mockReset();
});

describe('realm menu: All realms', () => {
  it('is the first realm choice and switches to all', async () => {
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, { setRealm });
    await openRealms();
    expect(radios().map((i) => i.textContent)).toEqual(['All realms', 'Acme client', 'Personal']);
    expect(screen.getByRole('menuitemradio', { name: 'All realms' })).toHaveAttribute('aria-checked', 'false');
    await press(screen.getByRole('menuitemradio', { name: 'All realms' }));
    expect(setRealm).toHaveBeenCalledTimes(1);
    expect(setRealm).toHaveBeenCalledWith('all');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is the checked one while the shell shows all realms', async () => {
    const user = userEvent.setup();
    mount(<RealmSwitcher />, { setRealm: vi.fn(), realmId: 'all' });
    await user.click(screen.getByRole('button', { name: / Realm$/ }));
    const all = screen.getByRole('menuitemradio', { name: 'All realms' });
    expect(all).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Personal' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a pinned token session (no setRealm) is not offered it', async () => {
    mount(<RealmSwitcher />);
    await openRealms();
    expect(screen.queryByRole('menuitemradio', { name: 'All realms' })).toBeNull();
    expect(radios().map((i) => i.textContent)).toEqual(['Acme client', 'Personal']);
  });

  it('one listed realm still offers it', async () => {
    // The shown realm is the listed one (as the phone case below): an unlisted shown realm is named through core.
    mount(<RealmSwitcher />, { setRealm: vi.fn(), realms: [realms[0]!] as ShellData['realms'], realmId: R1 });
    await openRealms();
    expect(radios().map((i) => i.textContent)).toEqual(['All realms', 'Acme client']);
  });
});

describe('phone sheet: All realms', () => {
  it('is the first row of the realm list; it switches to all and closes the sheet', async () => {
    const setRealm = vi.fn();
    mount(<PhoneContext />, { setRealm });
    await openSheet();
    expect(sheetRows().map((li) => li.textContent)).toEqual(['All realms', 'Acme client', 'Personal']);
    const all = screen.getByRole('button', { name: 'All realms' });
    expect(all).not.toHaveAttribute('aria-current');
    expect(all.querySelectorAll('svg')).toHaveLength(1); // its realm icon, no check
    await press(all);
    expect(setRealm).toHaveBeenCalledWith('all');
    expect(screen.queryByRole('dialog', { name: 'Realm and computer' })).toBeNull();
  });

  it('marks the row current while the shell shows all realms', async () => {
    mount(<PhoneContext />, { setRealm: vi.fn(), realmId: 'all' });
    await openSheet();
    expect(screen.getByRole('button', { name: 'All realms' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'All realms' }).querySelectorAll('svg')).toHaveLength(2); // icon + check
    expect(screen.getByRole('button', { name: 'Personal' })).not.toHaveAttribute('aria-current');
  });

  it('a pinned token session (no setRealm) is not offered it', async () => {
    mount(<PhoneContext />);
    await openSheet();
    expect(screen.queryByRole('button', { name: 'All realms' })).toBeNull();
  });

  it('one listed realm still offers it', async () => {
    mount(<PhoneContext />, { setRealm: vi.fn(), realms: [realms[0]!] as ShellData['realms'], realmId: R1 });
    await openSheet();
    expect(sheetRows().map((li) => li.textContent)).toEqual(['All realms', 'Acme client']);
  });

  it('with no realm listed (the sheet still opens for a computer) there is no All realms row', async () => {
    mount(<PhoneContext />, { setRealm: vi.fn(), realms: [], realmId: 'all', computers: [{ id: 'a1', name: 'alpha', running: true }] });
    await openSheet();
    expect(screen.queryByRole('button', { name: 'All realms' })).toBeNull();
  });
});
