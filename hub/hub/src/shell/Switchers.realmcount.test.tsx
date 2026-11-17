// The realm menu (and the phone sheet's realm list) shows how many computers each realm holds, from
// the realm list's usage, filled in when it arrives. A count not known yet shows nothing (never 0); a known 0 shows.
// The count is the row's description: the row's name stays the realm's name.
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { PhoneContext, RealmSwitcher } from './Switchers';

vi.mock('@core', () => ({ useCan: () => true }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
const R3 = '6a00000000000000000000c3';
const counted = [
  { id: R1, name: 'Acme client', color: 'blue', computers: 3 },
  { id: R2, name: 'Personal', color: 'green', computers: 1 },
  { id: R3, name: 'Empty', computers: 0 },
] as ShellData['realms'];
const unknown = [
  { id: R1, name: 'Acme client', color: 'blue', computers: null },
  { id: R2, name: 'Personal', color: 'green' },
] as ShellData['realms'];

function shell(node: ReactNode, realms: ShellData['realms'], more: Partial<ShellData> = {}) {
  return (
    <RouterProvider navigate={() => {}}>
      <PagesProvider pages={[pg('home')]}>
        <ShellDataProvider value={{ realms, realmId: R2, computers: [], account: { name: 'Ada' }, setRealm: () => {}, ...more } as ShellData}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });

describe('realm menu: computers per realm', () => {
  it('each realm row says how many computers it holds; its name stays the realm name', async () => {
    render(shell(<RealmSwitcher />, counted));
    await press(screen.getByRole('button', { name: / Realm$/ }));
    const acme = screen.getByRole('menuitemradio', { name: 'Acme client' });
    expect(acme).toHaveTextContent('3');
    expect(acme).toHaveAccessibleDescription('3 computers');
    expect(screen.getByRole('menuitemradio', { name: 'Personal' })).toHaveAccessibleDescription('1 computer');
    expect(screen.getByRole('menuitemradio', { name: 'Empty' })).toHaveAccessibleDescription('0 computers');
  });

  it('a count not known yet shows nothing, never 0; it fills in when the list answers', async () => {
    const { rerender } = render(shell(<RealmSwitcher />, unknown));
    await press(screen.getByRole('button', { name: / Realm$/ }));
    const acme = screen.getByRole('menuitemradio', { name: 'Acme client' });
    expect(acme.textContent).toBe('Acme client');
    expect(acme).toHaveAccessibleDescription('');
    expect(screen.getByRole('menuitemradio', { name: 'Personal' }).textContent).toBe('Personal');
    rerender(shell(<RealmSwitcher />, counted));
    expect(screen.getByRole('menuitemradio', { name: 'Acme client' })).toHaveAccessibleDescription('3 computers');
  });

  it('the phone sheet lists the same counts, unknown ones left out', async () => {
    const { unmount } = render(shell(<PhoneContext />, counted));
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    const acme = screen.getByRole('button', { name: 'Acme client' });
    expect(acme).toHaveAccessibleDescription('3 computers');
    expect(screen.getByRole('button', { name: 'Empty' })).toHaveAccessibleDescription('0 computers');
    unmount();
    render(shell(<PhoneContext />, unknown));
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    const row = screen.getByRole('button', { name: 'Acme client' });
    expect(row.textContent).toBe('Acme client');
    expect(row).toHaveAccessibleDescription('');
  });
});

describe('realm counts stay fresh (rent or delete a computer, then open the menu)', () => {
  it('opening the realm menu reads the realm list again, once per open; closed, nothing is read', async () => {
    const refreshRealms = vi.fn();
    render(shell(<RealmSwitcher />, counted, { refreshRealms }));
    expect(refreshRealms).not.toHaveBeenCalled();
    await press(screen.getByRole('button', { name: / Realm$/ }));
    expect(refreshRealms).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }); });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(refreshRealms).toHaveBeenCalledTimes(1);
    await press(screen.getByRole('button', { name: / Realm$/ }));
    expect(refreshRealms).toHaveBeenCalledTimes(2);
  });

  it('opening the phone sheet reads the realm list again', async () => {
    const refreshRealms = vi.fn();
    render(shell(<PhoneContext />, counted, { refreshRealms }));
    expect(refreshRealms).not.toHaveBeenCalled();
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(refreshRealms).toHaveBeenCalledTimes(1);
  });

  it('a count that changes while the menu is open shows the new number (3 -> 4, 0 -> 1)', async () => {
    const { rerender } = render(shell(<RealmSwitcher />, counted));
    await press(screen.getByRole('button', { name: / Realm$/ }));
    expect(screen.getByRole('menuitemradio', { name: 'Acme client' })).toHaveAccessibleDescription('3 computers');
    const after = counted.map((r) => (r.id === R1 ? { ...r, computers: 4 } : r.id === R3 ? { ...r, computers: 1 } : r));
    rerender(shell(<RealmSwitcher />, after));
    expect(screen.getByRole('menuitemradio', { name: 'Acme client' })).toHaveAccessibleDescription('4 computers');
    expect(screen.getByRole('menuitemradio', { name: 'Empty' })).toHaveAccessibleDescription('1 computer');
  });

  it('the phone sheet: a count that arrives while it is open fills in and describes the row (unknown -> 0 -> 3)', async () => {
    const zero = counted.map((r) => (r.id === R1 ? { ...r, computers: 0 } : r));
    const { rerender } = render(shell(<PhoneContext />, unknown));
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.getByRole('button', { name: 'Acme client' })).toHaveAccessibleDescription('');
    rerender(shell(<PhoneContext />, zero));
    expect(screen.getByRole('button', { name: 'Acme client' })).toHaveAccessibleDescription('0 computers');
    rerender(shell(<PhoneContext />, counted));
    expect(screen.getByRole('button', { name: 'Acme client' })).toHaveAccessibleDescription('3 computers');
  });
});
