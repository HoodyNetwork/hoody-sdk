// The computer menu ends with Get a computer (the computers page's
// `?get=1` drawer; none while that page is hidden), also with no computer yet and on
// the phone sheet, never for a session that cannot create one; the account menu links Ways to connect (the guide's
// #connect section). Shell menu footers: Share this realm and New realm, and Get a computer, sit in
// a "Menu actions" footer that stays at the bottom of each menu; Rename realms ends the realm list.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { menuSearchClass } from '@kit/overlays/Menu';
import { menuFooterClass } from '@kit/overlays/MenuFooter';
import { SEARCH_ABOVE } from '@kit/pickers/PickerPanel';
import { ShellDataProvider, type ShellData, type ShellRealm } from './context';
import { Icon } from '@kit/icons';
import supportStrings from '../pages/support/strings.en.json';
import { PagesProvider } from './pageLinks';
import { AccountMenu, ComputerSwitcher, PhoneContext, RealmSwitcher } from './Switchers';

let canAccount = true;
vi.mock('@core', () => ({ useCan: (cap: string) => cap === 'account' && canAccount }));
// Rename realms opens the provider's dialog; here only whether it is offered and opened matters.
let renameOpen: (() => void) | null = null;
vi.mock('./RenameRealms', () => ({ useRenameRealms: () => renameOpen }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
// Production-shaped ids: 24 hex characters.
const ONE = '6a00000000000000000000a1';
const TWO = '6a00000000000000000000b2';
const boxes = [
  { id: ONE, name: 'box-one', running: true, flag: '', location: 'Paris' },
  { id: TWO, name: 'box-two', running: false, flag: '', location: 'Oslo' },
];
const navigate = vi.fn();

function mount(node: ReactNode, pages: PageManifest[], data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: boxes, computerId: TWO, account: { name: 'Ada' }, ...data }}>{node}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
/** Every menu row in DOM order, selectable or not. */
const menuItems = () => Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'));
const openComputers = async () => press(screen.getByRole('button', { name: / Computer$/ }));

beforeEach(() => {
  canAccount = true;
  renameOpen = null;
});
afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
});

describe('computer menu: Get a computer', () => {
  it('a served computers page: Get a computer comes last and opens its drawer inside the Hub, switching nothing', async () => {
    const setComputer = vi.fn();
    mount(<ComputerSwitcher />, [pg('computers')], { setComputer });
    expect(screen.getByRole('button', { name: / Computer$/ })).toHaveAttribute('data-hub-switch', 'computer');
    await openComputers();
    const items = menuItems();
    expect(items.map((i) => i.textContent)).toEqual(['box-oneParis', 'box-twoOslo', 'Get a computer']);
    const get = screen.getByRole('menuitem', { name: 'Get a computer' });
    expect(get).toHaveAttribute('href', '/computers?get=1');
    await press(get);
    expect(navigate).toHaveBeenCalledWith('/computers?get=1', undefined);
    expect(setComputer).not.toHaveBeenCalled();
  });

  it('the chosen computer is the one checked', async () => {
    mount(<ComputerSwitcher />, [pg('computers')]);
    await openComputers();
    expect(screen.getByRole('menuitemradio', { name: 'box-two Oslo' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'box-one Paris' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a hidden computers page: no Get a computer item, the computers still switch', async () => {
    mount(<ComputerSwitcher />, [pg('home')]);
    await openComputers();
    expect(screen.queryByRole('menuitem', { name: 'Get a computer' })).toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'box-one Paris' })).toBeInTheDocument();
  });

  it('the keyboard reaches it: End, then Enter opens the drawer', async () => {
    const user = userEvent.setup();
    mount(<ComputerSwitcher />, [pg('computers')]);
    await openComputers();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Get a computer' }));
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/computers?get=1', undefined);
  });

  it('no computer yet: the switcher still shows, with Get a computer as its only item', async () => {
    mount(<ComputerSwitcher />, [pg('computers')], { computers: [], computerId: undefined });
    const trigger = screen.getByRole('button', { name: / Computer$/ });
    expect(trigger.textContent).toMatch(/No computers yet/);
    await press(trigger);
    expect(menuItems().map((m) => m.textContent)).toEqual(['Get a computer']);
  });

  it('picking a computer switches to it and navigates nowhere', async () => {
    const setComputer = vi.fn();
    mount(<ComputerSwitcher />, [pg('computers')], { setComputer });
    await openComputers();
    await press(screen.getByRole('menuitemradio', { name: 'box-one Paris' }));
    expect(setComputer).toHaveBeenCalledWith(ONE);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a session that cannot create a computer (token session) is offered no Get a computer', async () => {
    canAccount = false;
    mount(<ComputerSwitcher />, [pg('computers')]);
    await openComputers();
    expect(screen.queryByRole('menuitem', { name: 'Get a computer' })).toBeNull();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
  });

  it('a token session with no computer gets no computer switcher at all', () => {
    canAccount = false;
    mount(<ComputerSwitcher />, [pg('computers')], { computers: [], computerId: undefined });
    expect(screen.queryByRole('button', { name: / Computer$/ })).toBeNull();
  });

  it('the phone sheet ends its computer list with Get a computer, which opens the drawer and closes the sheet, switching nothing', async () => {
    const setComputer = vi.fn();
    const setRealm = vi.fn();
    mount(<PhoneContext />, [pg('computers')], { setComputer, setRealm });
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    const link = screen.getByRole('link', { name: 'Get a computer' });
    const rows = Array.from(link.closest('ul')?.querySelectorAll('li') ?? []).map((li) => li.textContent);
    expect(rows).toEqual(['box-oneParis', 'box-twoOslo', 'Get a computer']);
    expect(link).toHaveAttribute('href', '/computers?get=1');
    await press(link);
    expect(navigate).toHaveBeenCalledWith('/computers?get=1', undefined);
    expect(setComputer).not.toHaveBeenCalled();
    expect(setRealm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Realm and computer' })).toBeNull();
  });

  it('the phone sheet with Computers hidden offers no Get a computer', async () => {
    mount(<PhoneContext />, [pg('home')], { computers: [], computerId: undefined });
    const chip = screen.queryByRole('button', { name: / Realm and computer$/ });
    if (chip) await press(chip);
    expect(screen.queryByRole('link', { name: 'Get a computer' })).toBeNull();
  });

  it('a token session\'s phone sheet offers no Get a computer', async () => {
    canAccount = false;
    mount(<PhoneContext />, [pg('computers')]);
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    expect(screen.queryByRole('link', { name: 'Get a computer' })).toBeNull();
  });
});

describe('account menu: Ways to connect', () => {
  it('a served guide page: the item links its Ways to connect section and opens it inside the Hub', async () => {
    mount(<AccountMenu />, [pg('guide')]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    const item = screen.getByRole('menuitem', { name: 'Ways to connect' });
    expect(item).toHaveAttribute('href', '/guide#connect');
    await press(item);
    expect(navigate).toHaveBeenCalledWith('/guide#connect', undefined);
  });

  it('a hidden guide page: no Ways to connect item', async () => {
    mount(<AccountMenu />, [pg('home')]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Ways to connect' })).toBeNull();
  });
});

// Support is reachable from the account menu as well as from the sidebar's Help
// group: the support page's own nav label, icon and link, and only while this load serves the page.
// Its manifest's nav entry, on its own strings (the real manifest pulls @core, mocked here; accountmenu.spec.ts opens it).
const supportPage = { ...pg('support'), strings: supportStrings, nav: { group: 'help', order: 20, icon: 'mail', label: 'nav' } } as unknown as PageManifest;
describe('account menu: Support', () => {
  it('a served support page: the item carries its nav label and icon, links /support and opens it inside the Hub', async () => {
    mount(<AccountMenu />, [supportPage]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    const item = screen.getByRole('menuitem', { name: 'Support' });
    expect(item).toHaveAttribute('href', '/support');
    const icon = render(<Icon name="mail" size="sm" />).container.querySelector('svg');
    expect(item.querySelector('svg')?.innerHTML, 'the nav icon').toBe(icon?.innerHTML);
    await press(item);
    expect(navigate).toHaveBeenCalledWith('/support', undefined);
  });

  it('a served support page alone: the item stands above its own separator, before Appearance', async () => {
    mount(<AccountMenu />, [supportPage]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    const menu = screen.getByRole('menu');
    const rows = [...menu.querySelectorAll('[role="menuitem"], [role="separator"], [role="group"]')].map((e) => e.getAttribute('role') + (e.getAttribute('role') === 'menuitem' ? `:${e.textContent}` : ''));
    expect(rows.slice(0, 3)).toEqual(['menuitem:Support', 'separator', 'group']);
  });

  it('after Ways to connect, in the links block', async () => {
    mount(<AccountMenu />, [pg('guide'), supportPage]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    const names = menuItems().map((i) => i.textContent);
    expect(names.indexOf('Support')).toBe(names.indexOf('Ways to connect') + 1);
  });

  it('a load that does not serve the support page: no Support item', async () => {
    mount(<AccountMenu />, [pg('guide')]);
    await press(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Support' })).toBeNull();
    // No row at all for it: not an unnamed one, and nothing that links /support.
    expect(document.querySelector('[role="menuitem"][href="/support"]')).toBeNull();
    expect(menuItems().filter((i) => !i.textContent?.trim()), 'no unnamed row').toEqual([]);
    expect(menuItems()[0]?.textContent, 'the links block is only Ways to connect').toBe('Ways to connect');
  });
});

// The realms page is the New realm flow (path /realms/new); the Keys page serves Share this realm.
const realmsPage = { ...pg('realms'), path: '/realms/new' } as PageManifest;
const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
const realms: ShellRealm[] = [
  { id: R1, name: 'Acme client', color: 'blue' },
  { id: R2, name: 'Personal', color: 'green' },
];
/** The menu's top-level sections, in order. */
const sections = (menu: HTMLElement) => [...menu.querySelectorAll<HTMLElement>(':scope > [role="group"], :scope > section')];
const footerOf = (menu: HTMLElement) => {
  const all = sections(menu);
  return all[all.length - 1] as HTMLElement;
};
const openRealms = async () => press(screen.getByRole('button', { name: / Realm$/ }));
const openSheet = async () => press(screen.getByRole('button', { name: / Realm and computer$/ }));

describe('menu footers', () => {
  it('realm menu: Share and New realm are the footer, its last section named "Menu actions"; Rename realms ends the list', async () => {
    renameOpen = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms, realmId: R2, setRealm: vi.fn() });
    await openRealms();
    const menu = screen.getByRole('menu');
    expect(menuItems().map((i) => i.textContent)).toEqual(['All realms', 'Acme client', 'Personal', 'Rename realms…', 'Share this realm…', 'New realm…']);
    const foot = footerOf(menu);
    expect(foot.getAttribute('aria-label')).toBe('Menu actions');
    expect(foot.className).toContain(menuFooterClass);
    expect(within(foot).getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Share this realm…', 'New realm…']);
    expect(within(foot).queryByRole('menuitem', { name: 'Rename realms…' })).toBeNull();
    expect(sections(menu).filter((x) => x.getAttribute('aria-label') === 'Menu actions')).toHaveLength(1);
  });

  it('realm menu: Rename realms in the list still opens the dialog, switching nothing', async () => {
    const open = vi.fn();
    renameOpen = open;
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms, realmId: R2, setRealm });
    await openRealms();
    await press(screen.getByRole('menuitem', { name: 'Rename realms…' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(setRealm).not.toHaveBeenCalled();
  });

  it('realm menu: the keyboard reaches the footer (End, arrows, typeahead) and Enter opens New realm, focus back on the trigger', async () => {
    const user = userEvent.setup();
    renameOpen = vi.fn();
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms, realmId: R2, setRealm });
    const trigger = screen.getByRole('button', { name: / Realm$/ });
    await openRealms();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New realm…' }));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Share this realm…' }));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename realms…' }));
    await user.keyboard('{Home}n');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New realm…' }));
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/realms/new', undefined);
    expect(setRealm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('realm menu: no Share and no New realm (a token session) draws no footer', async () => {
    canAccount = false;
    renameOpen = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms, realmId: R2, setRealm: vi.fn() });
    await openRealms();
    const menu = screen.getByRole('menu');
    expect(menu.querySelector('[aria-label="Menu actions"]')).toBeNull();
    expect(menuItems().map((i) => i.textContent)).toEqual(['All realms', 'Acme client', 'Personal', 'Rename realms…']);
  });

  it('computer menu: Get a computer alone is the footer; Try again stays in the list', async () => {
    mount(<ComputerSwitcher />, [pg('computers')], { computers: [], computerId: undefined, computersRead: 'unknown', retryComputers: vi.fn() });
    await press(screen.getByRole('button', { name: / Computer$/ }));
    const menu = screen.getByRole('menu');
    expect(menuItems().map((i) => i.textContent)).toEqual(['Try again', 'Get a computer']);
    const foot = footerOf(menu);
    expect(foot.getAttribute('aria-label')).toBe('Menu actions');
    expect(foot.className).toContain(menuFooterClass);
    expect(within(foot).getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Get a computer']);
  });

  it('computer menu: the loading line stays in the list, and without Get a computer there is no footer', async () => {
    canAccount = false;
    mount(<ComputerSwitcher />, [pg('computers')], { computers: [], computerId: undefined, computersRead: 'loading', retryComputers: vi.fn() });
    await press(screen.getByRole('button', { name: / Computer$/ }));
    const menu = screen.getByRole('menu');
    expect(menuItems().map((i) => i.textContent)).toEqual(['Loading computers…']);
    expect(menu.querySelector('[aria-label="Menu actions"]')).toBeNull();
  });

  it('phone sheet: a "Menu actions" group of real links holds Share and New realm; Rename ends the realm list, Get a computer the computer list', async () => {
    renameOpen = vi.fn();
    mount(<PhoneContext />, [pg('keys'), realmsPage, pg('computers')], { realms, realmId: R2, setRealm: vi.fn() });
    await openSheet();
    const foot = screen.getByRole('group', { name: 'Menu actions' });
    expect(foot.className).toContain(menuFooterClass);
    const links = within(foot).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Share this realm…', 'New realm…']);
    expect(links[0]).toHaveAttribute('href', `/keys/shared?share=1&open_realm=${R2}`);
    expect(links[1]).toHaveAttribute('href', '/realms/new');
    expect(within(foot).queryByRole('link', { name: 'Get a computer' })).toBeNull();
    const lists = screen.getByRole('dialog', { name: 'Realm and computer' }).querySelectorAll('ul');
    expect(Array.from(lists[0]?.querySelectorAll('li') ?? []).map((li) => li.textContent)).toEqual(['All realms', 'Acme client', 'Personal', 'Rename realms…']);
    expect(Array.from(lists[1]?.querySelectorAll('li') ?? []).map((li) => li.textContent)).toEqual(['box-oneParis', 'box-twoOslo', 'Get a computer']);
  });

  it('phone sheet: Tab goes through the lists, then the footer; a footer link opens its page and closes the sheet', async () => {
    const user = userEvent.setup();
    mount(<PhoneContext />, [pg('keys'), realmsPage, pg('computers')], { realms, realmId: R2, setRealm: vi.fn() });
    await openSheet();
    await act(async () => { screen.getByRole('link', { name: 'Get a computer' }).focus(); });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Share this realm…' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'New realm…' }));
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/realms/new', undefined);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Realm and computer' })).toBeNull());
  });

  it('phone sheet: no Share and no New realm draws no footer group', async () => {
    canAccount = false;
    mount(<PhoneContext />, [pg('keys'), realmsPage, pg('computers')], { realms, realmId: R2, setRealm: vi.fn() });
    await openSheet();
    expect(screen.queryByRole('group', { name: 'Menu actions' })).toBeNull();
  });
});

/** n realms with production-shaped ids, named Realm 01..n, plus one "Acme client" first (a local fixture). */
const ACME = '6a00000000000000000000d0';
const many = (n: number): ShellRealm[] => [
  { id: ACME, name: 'Acme client', color: 'blue' },
  ...Array.from({ length: n - 1 }, (_, i) => ({ id: `6a0000000000000000000${String(i + 1).padStart(3, '0')}`, name: `Realm ${String(i + 1).padStart(2, '0')}`, color: 'green' as const })),
];
const realmRows = () => menuItems().map((i) => i.textContent ?? '').filter((x) => x === 'Acme client' || x.startsWith('Realm '));

describe('realm menu search', () => {
  it(`no search row at ${SEARCH_ABOVE} realms; above that, a "Search realms" field above the menu takes focus`, async () => {
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(SEARCH_ABOVE), realmId: ACME, setRealm: vi.fn() });
    await openRealms();
    expect(screen.queryByRole('searchbox')).toBeNull();
    cleanup();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(SEARCH_ABOVE + 1), realmId: ACME, setRealm: vi.fn() });
    await openRealms();
    const box = screen.getByRole('searchbox', { name: 'Search realms' });
    await waitFor(() => expect(document.activeElement).toBe(box));
    const row = box.closest(`.${menuSearchClass}`) as HTMLElement;
    expect(row).not.toBeNull();
    // The search row comes before the menu in the popover, so the menu scrolls under it.
    expect(row.compareDocumentPosition(screen.getByRole('menu')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('typing filters the realm choices by name (case and accents aside); Rename and the footer stay', async () => {
    const user = userEvent.setup();
    renameOpen = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(12), realmId: ACME, setRealm: vi.fn() });
    await openRealms();
    expect(realmRows()).toHaveLength(12);
    await user.keyboard('ACMÉ');
    expect(menuItems().map((i) => i.textContent)).toEqual(['Acme client', 'Rename realms…', 'Share this realm…', 'New realm…']);
    await user.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}realm 1');
    expect(realmRows()).toEqual(['Realm 10', 'Realm 11']);
    expect(screen.queryByRole('menuitemradio', { name: 'All realms' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Rename realms…' })).toBeInTheDocument();
  });

  it('a search that matches nothing shows "No realm matches" (disabled), with Rename and the footer still there', async () => {
    const user = userEvent.setup();
    renameOpen = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(12), realmId: ACME, setRealm: vi.fn() });
    await openRealms();
    await user.keyboard('zzz');
    expect(menuItems().map((i) => i.textContent)).toEqual(['No realm matches', 'Rename realms…', 'Share this realm…', 'New realm…']);
    expect(screen.getByRole('menuitemradio', { name: 'No realm matches' })).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(screen.queryByRole('menuitemradio', { name: 'No realm matches' })).toBeNull();
  });

  it('Enter picks the first match; Escape clears the search first, then closes with focus back on the trigger', async () => {
    const user = userEvent.setup();
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(12), realmId: ACME, setRealm });
    const trigger = screen.getByRole('button', { name: / Realm$/ });
    await openRealms();
    await user.keyboard('realm 07{Enter}');
    expect(setRealm).toHaveBeenCalledWith('6a0000000000000000000007');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // Reopened, the search starts empty.
    await openRealms();
    const box = screen.getByRole('searchbox', { name: 'Search realms' });
    expect(box).toHaveValue('');
    await user.keyboard('acme');
    expect(realmRows()).toEqual(['Acme client']);
    await user.keyboard('{Escape}');
    expect(box).toHaveValue('');
    expect(realmRows()).toHaveLength(12);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it('Enter with no match picks nothing and runs no other row; a row reached with the keys keeps Enter', async () => {
    const user = userEvent.setup();
    const setRealm = vi.fn();
    renameOpen = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(12), realmId: ACME, setRealm });
    await openRealms();
    const box = screen.getByRole('searchbox', { name: 'Search realms' });
    const rename = screen.getByRole('menuitem', { name: 'Rename realms…' });
    await user.keyboard('zzz');
    // React Aria's virtual focus skips the disabled row to Rename: Enter must still run nothing.
    await waitFor(() => expect(box).toHaveAttribute('aria-activedescendant', rename.id));
    await user.keyboard('{Enter}');
    expect(setRealm).not.toHaveBeenCalled();
    expect(renameOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(box).toHaveValue('zzz');
    // A row the person moves to with the keys keeps Enter.
    await user.keyboard('{End}');
    await waitFor(() => expect(box).toHaveAttribute('aria-activedescendant', screen.getByRole('menuitem', { name: 'New realm…' }).id));
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/realms/new', undefined);
    expect(renameOpen).not.toHaveBeenCalled();
    expect(setRealm).not.toHaveBeenCalled();
  });

  it('Enter picks the first match after a paste or a deletion too; a row reached with the arrows keeps Enter', async () => {
    const user = userEvent.setup();
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(12), realmId: ACME, setRealm });
    const trigger = screen.getByRole('button', { name: / Realm$/ });
    await openRealms();
    await user.paste('realm 07');
    expect(realmRows()).toEqual(['Realm 07']);
    await user.keyboard('{Enter}');
    expect(setRealm).toHaveBeenLastCalledWith('6a0000000000000000000007');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await openRealms();
    await user.keyboard('realm 11x');
    expect(realmRows()).toEqual([]);
    await user.keyboard('{Backspace}');
    expect(realmRows()).toEqual(['Realm 11']);
    await user.keyboard('{Enter}');
    expect(setRealm).toHaveBeenLastCalledWith('6a0000000000000000000011');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await openRealms();
    await user.keyboard('realm 1');
    expect(realmRows()).toEqual(['Realm 10', 'Realm 11']);
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search realms' })).toHaveAttribute('aria-activedescendant', screen.getByRole('menuitemradio', { name: /^Realm 11/ }).id));
    await user.keyboard('{Enter}');
    expect(setRealm).toHaveBeenLastCalledWith('6a0000000000000000000011');
    expect(setRealm).toHaveBeenCalledTimes(3);
  });
  it('an IME composition keeps its Enter and arrows; Shift+End selecting text is no navigation', async () => {
    const user = userEvent.setup();
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(12), realmId: ACME, setRealm });
    await openRealms();
    const box = screen.getByRole('searchbox', { name: 'Search realms' });
    await user.paste('realm 07');
    // A composition's arrow and Enter (isComposing) neither navigate nor pick.
    fireEvent.keyDown(box, { key: 'ArrowDown', isComposing: true });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(setRealm).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // No row focused after the paste: Shift+End selects text, so the next Enter still picks the first match.
    await user.keyboard('{Shift>}{End}{/Shift}{Enter}');
    expect(setRealm).toHaveBeenCalledWith('6a0000000000000000000007');
    expect(setRealm).toHaveBeenCalledTimes(1);
  });

  it('Shift+End right after typing moves to the last row when a row is focused, and Enter runs that row', async () => {
    const user = userEvent.setup();
    const setRealm = vi.fn();
    mount(<RealmSwitcher />, [pg('keys'), realmsPage], { realms: many(12), realmId: ACME, setRealm });
    await openRealms();
    // Forward typing focuses the first match at once; the field's aria-activedescendant follows a moment later. No wait
    // between the keys: Shift+End must count as navigation from React Aria's focus, not from the attribute.
    await user.type(screen.getByRole('searchbox', { name: 'Search realms' }), 'realm 0');
    await user.keyboard('{Shift>}{End}{/Shift}{Enter}');
    expect(setRealm).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/realms/new', undefined);
  });
});
