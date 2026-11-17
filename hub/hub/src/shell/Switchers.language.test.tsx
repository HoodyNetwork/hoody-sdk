// The account menu has a Language row beside Appearance: the globe, "Language", the language in use and a chevron.
// It opens the kit's language menu in the account menu's place: sixteen languages, English checked, the others coming
// soon. Nothing is stored, nothing is sent, and Escape gives focus back to the avatar.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Icon } from '@kit/icons';
import languageStrings from '@kit/pickers/LanguageMenu.strings.en.json';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { AccountMenu } from './Switchers';

// The kit menu closes when its context ends (core's bump): none happens here.
vi.mock('@core', () => ({ useCan: () => true, onBump: () => () => undefined }));
vi.mock('./RenameRealms', () => ({ useRenameRealms: () => null }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const navigate = vi.fn();
function mount(pages: PageManifest[] = [pg('account')]) {
  render(
    <RouterProvider navigate={navigate}>
      <PagesProvider pages={pages}>
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' }, signOut: () => undefined }}>
          <AccountMenu />
        </ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const avatar = () => screen.getByRole('button', { name: 'Account menu' });
const languages = () => screen.getAllByRole('menuitemradio');

let setItem: ReturnType<typeof vi.spyOn>;
let fetched: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setItem = vi.spyOn(Storage.prototype, 'setItem');
  fetched = vi.fn(() => Promise.reject(new Error('no request expected')));
  vi.stubGlobal('fetch', fetched);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigate.mockReset();
});

describe('account menu: Language', () => {
  it('a row with the globe, the language in use and a chevron, after Appearance and before Keyboard shortcuts', async () => {
    mount();
    await press(avatar());
    const row = screen.getByRole('menuitem', { name: 'Language: English' });
    expect(row).toHaveTextContent('LanguageEnglish');
    const globe = render(<Icon name="globe" size="sm" />).container.querySelector('svg');
    const chevron = render(<Icon name="chevron-right" size="sm" />).container.querySelector('svg');
    const icons = [...row.querySelectorAll('svg')].map((x) => x.innerHTML);
    expect(icons).toEqual([globe?.innerHTML, chevron?.innerHTML]);
    const names = [...screen.getByRole('menu').querySelectorAll('[role^="menuitem"]')].map((x) => x.textContent);
    expect(names.indexOf('LanguageEnglish')).toBe(names.indexOf('Performance mode') + 1);
    expect(names.indexOf('Keyboard shortcuts?')).toBe(names.indexOf('LanguageEnglish') + 1);
    // A block of its own: a separator on each side, so it does not read as part of Appearance.
    expect(row.previousElementSibling).toHaveAttribute('role', 'separator');
    expect(row.nextElementSibling).toHaveAttribute('role', 'separator');
  });

  it('it shows on every load, also one that serves no account page', async () => {
    mount([]);
    await press(avatar());
    expect(screen.getByRole('menuitem', { name: 'Language: English' })).toBeInTheDocument();
  });

  it('pressing it opens the list: sixteen languages, only English to choose, the others coming soon', async () => {
    mount();
    await press(avatar());
    await press(screen.getByRole('menuitem', { name: 'Language: English' }));
    const menu = await screen.findByRole('menu', { name: 'Language' });
    const rows = within(menu).getAllByRole('menuitemradio');
    expect(rows).toHaveLength(16);
    expect(rows.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual(['English']);
    const soon = rows.filter((r) => r.getAttribute('aria-disabled') === 'true');
    expect(soon).toHaveLength(15);
    for (const r of soon) expect(r).toHaveAccessibleDescription(languageStrings['language.note']);
    expect(within(menu).getByText('The Hub is in English for now. More languages are coming soon.')).toBeInTheDocument();
    // The account menu itself is closed: one menu on screen.
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('a coming-soon language does nothing: nothing stored, nothing sent, no navigation', async () => {
    mount();
    await press(avatar());
    await press(screen.getByRole('menuitem', { name: 'Language: English' }));
    await screen.findByRole('menu', { name: 'Language' });
    await press(screen.getByRole('menuitemradio', { name: 'Deutsch' }));
    await press(screen.getByRole('menuitemradio', { name: '日本語' }));
    expect(screen.getByRole('menu', { name: 'Language' })).toBeInTheDocument();
    expect(languages().filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual(['English']);
    expect(setItem).not.toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute('lang') ?? '').not.toBe('de');
  });

  it('keyboard: Enter on the row opens the list, arrows move through it, Escape closes it and focus is on the avatar', async () => {
    mount();
    avatar().focus();
    await userEvent.keyboard('{Enter}');
    const row = await screen.findByRole('menuitem', { name: 'Language: English' });
    row.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: 'Language' });
    await waitFor(() => expect(within(menu).getByRole('menuitemradio', { name: 'English' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'Português (Brasil)' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Language' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(avatar()).toHaveFocus());
  });
});
