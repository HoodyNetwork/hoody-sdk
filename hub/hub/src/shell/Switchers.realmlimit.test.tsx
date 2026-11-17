// The realm menu and the account's Realm limit. The API reports use against the limit with the realm list; the menu
// shows it as one number at the end of New realm's line ("3/5"), whose hint says what it is and links the plans while a
// higher one exists. While the API says the limit is reached New realm is off (still reachable, with its reason).
// With no cap from the API the menu is exactly as before: nothing shown, nothing off.
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRealmCap, realmCapView, type RealmCapView } from '@core/realmLimit';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { PhoneContext, RealmSwitcher } from './Switchers';

let canAccount = true;
let cap: RealmCapView = { k: 'none' };
vi.mock('@core', () => ({ useCan: (c: string) => c === 'account' && canAccount }));
vi.mock('@core/realms', () => ({ useRealmCap: () => cap }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const realmsPage = { ...pg('realms'), path: '/realms/new' } as PageManifest;
const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
const realms = [
  { id: R1, name: 'Acme client', color: 'blue' },
  { id: R2, name: 'Personal', color: 'green' },
];
const navigate = vi.fn();
const setRealm = vi.fn();
const PAGES = [pg('keys'), realmsPage, pg('billing')];
const capOf = (c: unknown) => realmCapView(parseRealmCap({ cap: c }));

function mount(node: ReactNode, pages: PageManifest[] = PAGES, data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms, realmId: R2, computers: [], account: { name: 'Ada' }, setRealm, ...data } as ShellData}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const names = () => Array.from(document.querySelectorAll('[role="menuitem"]')).map((i) => i.textContent);
const openRealms = async () => press(screen.getByRole('button', { name: / Realm$/ }));
const num = () => document.querySelector('[data-realm-use] button');
const hint = async () => { await press(num()!); return document.querySelector('[role="dialog"][aria-labelledby="' + num()!.id + '"]')!; };
const newRealm = () => screen.getByRole('menuitem', { name: /New realm/ });

beforeEach(() => { canAccount = true; cap = { k: 'none' }; });
afterEach(() => { navigate.mockReset(); setRealm.mockReset(); });

describe('realm menu: the Realm limit', () => {
  it('no cap from the API: the menu is as before, nothing shown and nothing off', async () => {
    mount(<RealmSwitcher />);
    await openRealms();
    expect(names()).toEqual(['Share this realm…', 'New realm…']);
    expect(newRealm()).toHaveAttribute('href', '/realms/new');
    expect(newRealm()).not.toHaveAttribute('aria-disabled');
    expect(document.querySelector('[data-realm-use]')).toBeNull();
  });
  it('under the limit: one line, the number beside New realm, which still opens the flow', async () => {
    cap = capOf({ max: 5, used: 3, reached: false });
    mount(<RealmSwitcher />);
    await openRealms();
    expect(names()).toEqual(['Share this realm…', 'New realm…']);
    expect(num()!.textContent).toBe('3/5');
    expect(num()).toHaveAttribute('aria-label', '3 of 5 realms in use');
    expect(num()).not.toHaveAttribute('title');
    await press(newRealm());
    expect(navigate).toHaveBeenCalledWith('/realms/new', undefined);
  });
  it('the hint: what the number is, and Upgrade to Billing although the limit is not reached', async () => {
    cap = capOf({ max: 5, used: 1, reached: false });
    mount(<RealmSwitcher />);
    await openRealms();
    const tip = await hint();
    expect(tip.textContent).toBe('Realms in use. You can upgrade if you want more realms.Upgrade');
    expect(screen.getByRole('link', { name: 'Upgrade' }).getAttribute('href')).toMatch(/\/billing$/);
    expect(setRealm).not.toHaveBeenCalled();
  });
  it('at the limit: New realm is off but still there with its reason on the line; no Upgrade row', async () => {
    cap = capOf({ max: 5, used: 5, reached: true });
    mount(<RealmSwitcher />);
    await openRealms();
    expect(names()).toEqual(['Share this realm…', 'New realm…Realm limit reached.']);
    expect(num()!.textContent).toBe('5/5');
    expect(newRealm()).toHaveAttribute('aria-disabled', 'true');
    expect(newRealm()).not.toHaveAttribute('href');
    await press(newRealm());
    expect(navigate).not.toHaveBeenCalled();
    expect((await hint()).textContent).toContain('Upgrade');
  });
  it('over the limit (realms kept from before): the number as it is, and no word about removal', async () => {
    cap = capOf({ max: 5, used: 7, reached: true });
    mount(<RealmSwitcher />);
    await openRealms();
    expect(names()).toEqual(['Share this realm…', 'New realm…Realm limit reached.']);
    expect(num()!.textContent).toBe('7/5');
    expect(document.body.textContent).not.toMatch(/remov|delet|lose/i);
  });
  it('`used` absent: no number', async () => {
    cap = capOf({ max: 50, reached: false });
    mount(<RealmSwitcher />);
    await openRealms();
    expect(names()).toEqual(['Share this realm…', 'New realm…']);
    expect(num()).toBeNull();
  });
  it('`max` absent too and the limit reached: New realm off with the reason, no number', async () => {
    cap = capOf({ reached: true });
    mount(<RealmSwitcher />);
    await openRealms();
    expect(names()).toEqual(['Share this realm…', 'New realm…Realm limit reached.']);
    expect(num()).toBeNull();
  });
  it('the top plan: the hint says only what the number is', async () => {
    cap = capOf({ max: 1000, used: 12, reached: false });
    mount(<RealmSwitcher />);
    await openRealms();
    expect(num()!.textContent).toBe('12/1000');
    expect((await hint()).textContent).toBe('Realms in use.');
    expect(screen.queryByRole('link', { name: 'Upgrade' })).toBeNull();
  });
  it('a load that does not serve Billing, or a sign-in without the account: no Upgrade in the hint', async () => {
    cap = capOf({ max: 5, used: 5, reached: true });
    mount(<RealmSwitcher />, [pg('keys'), realmsPage]);
    await openRealms();
    expect((await hint()).textContent).toBe('Realms in use.');
  });
  it('a pinned token session has no New realm, so no number and no hint', async () => {
    cap = capOf({ max: 5, used: 5, reached: true });
    mount(<RealmSwitcher />, PAGES, { setRealm: undefined });
    await openRealms();
    expect(names().join('|')).not.toMatch(/New realm|Upgrade|limit/i);
    expect(num()).toBeNull();
  });
  it('the phone sheet: the same line', async () => {
    cap = capOf({ max: 5, used: 5, reached: true });
    mount(<PhoneContext />);
    await press(screen.getAllByRole('button')[0]!);
    const off = document.querySelector('[data-realm-limit]')!;
    expect(off).toHaveAttribute('aria-disabled', 'true');
    expect(off.textContent).toBe('New realm…Realm limit reached.');
    expect(num()!.textContent).toBe('5/5');
    expect(num()).toHaveAttribute('aria-label', '5 of 5 realms in use');
    expect(screen.queryByRole('link', { name: /Upgrade/ })).toBeNull();
  });
});
