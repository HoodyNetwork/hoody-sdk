// Jump to leaves out the deep places a page's view does not draw now: the
// shell loads the page's searchHide reader while the palette is open and drops what it names, before the row limit.
// While the reader loads, if its load fails or it throws, and while it answers null, nothing is left out.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest, SearchHide } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import type { DeepEntry } from './search/types';

const deep = vi.hoisted(() => ({ list: [] as DeepEntry[] }));
vi.mock('./search/deep', () => ({ loadDeep: () => Promise.resolve(deep.list) }));

const BASE: DeepEntry[] = [
  { page: 'account', kind: 'section', label: 'Passcode lock', to: '?section=passcode', words: '' },
  { page: 'account', kind: 'setting', label: 'Passcode on', to: '?section=passcode', under: 'Passcode lock', words: '' },
  { page: 'account', kind: 'section', label: 'Passcode sessions', to: '?section=sessions', words: '' },
  { page: 'account', kind: 'faq', label: 'Passcode question', to: '#faq-lock', words: '' },
  { page: 'home', kind: 'section', label: 'Passcode tips', to: '?section=tips', words: '' },
];

// The reader's answer, settable from a test: it follows its store as a page's reader follows its context.
let answer: SearchHide | null | 'throw' = null;
const subs = new Set<() => void>();
const setAnswer = (a: typeof answer) => {
  answer = a;
  subs.forEach((f) => f());
};
function useHide(): SearchHide | null {
  const a = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => answer);
  if (a === 'throw') throw new Error('reader broke');
  return a;
}

function pagesWith(load?: () => Promise<{ default: () => SearchHide | null }>, o: { commands?: boolean } = {}): PageManifest[] {
  // Two commands into Account, matched by the same word as its places.
  const commands = o.commands
    ? { commands: [{ id: 'password', label: 'cmd.pw', to: '/account?sheet=password' }, { id: 'sessions', label: 'cmd.ss', to: '/account#sessions' }] }
    : {};
  const strings = { title: 'Account', 'cmd.pw': 'Passcode password sheet', 'cmd.ss': 'Passcode devices' };
  return [
    { id: 'home', path: '/home', title: 'home', strings: { home: 'Home' }, status: 'ready', nav: { icon: 'home', group: 'main' } },
    { id: 'account', path: '/account', title: 'title', strings, status: 'ready', nav: { icon: 'home', group: 'account' }, ...commands, ...(load && { searchHide: { load } }) },
  ] as unknown as PageManifest[];
}

async function open(pages: PageManifest[]) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={() => {}} /> }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

// The arrowed row (React Aria marks the virtually focused item), by its label.
const active = () => screen.getAllByRole('menuitem').find((e) => e.getAttribute('data-focused') === 'true')?.textContent?.replace(/Account.*|Home.*/, '');
const focusedRows = () => screen.getAllByRole('menuitem').filter((e) => e.getAttribute('data-focused') === 'true');
const listed = () => screen.queryAllByRole('menuitem').map((e) => e.textContent?.replace(/Account.*|Home.*/, '') ?? '');

async function typeAndSettle(text: string) {
  await userEvent.type(screen.getByRole('searchbox'), text);
  await act(async () => {}); // the index and the reader have answered (both resolve at once here)
}

beforeEach(() => {
  vi.restoreAllMocks();
  deep.list = BASE;
  setAnswer(null);
});

describe('CommandPalette and a page searchHide', () => {
  it('hide: leaves out the places whose tail starts with one, keeps the rest and other pages', async () => {
    setAnswer({ hide: ['?section=passcode'] });
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    expect(listed()).toEqual(['Passcode sessions', 'Passcode tips', 'Passcode question']);
  });

  it('only: keeps just the places whose tail starts with one (questions gone too)', async () => {
    setAnswer({ only: ['?section=sessions'] });
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    expect(listed()).toEqual(['Passcode sessions', 'Passcode tips']);
  });

  it('follows the reader: a change while open shows the places again, or leaves them out', async () => {
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    expect(listed()).toContain('Passcode lock');
    act(() => setAnswer({ hide: ['?section=passcode'] }));
    expect(listed()).not.toContain('Passcode lock');
    act(() => setAnswer(null));
    expect(listed()).toContain('Passcode lock');
    // The first row shown is the active one, so Enter acts on it after the list changed.
    expect(screen.getAllByRole('menuitem')[0]).toHaveAttribute('data-focused', 'true');
  });

  it('a reader answering keeps the arrowed row: one letter, an answer about deep places only', async () => {
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await typeAndSettle('p');
    await userEvent.keyboard('{ArrowDown}');
    const was = active();
    expect(was).toBeTruthy();
    expect(was).not.toBe(screen.getAllByRole('menuitem')[0]!.textContent);
    act(() => setAnswer({ hide: ['?section=passcode'] }));
    await act(async () => {});
    expect(active()).toBe(was);
  });

  it('a reader answering keeps the arrowed row when it drops another listed row', async () => {
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe('Passcode sessions');
    act(() => setAnswer({ hide: ['#faq-'] }));
    await act(async () => {});
    expect(listed()).not.toContain('Passcode question');
    expect(active()).toBe('Passcode sessions');
  });

  it('a reader answering that drops a lower row while the first row is active: the same list, its first row still active', async () => {
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    expect(active()).toBe('Passcode lock');
    const menu = screen.getByRole('menu');
    act(() => setAnswer({ hide: ['#faq-'] }));
    await act(async () => {});
    expect(listed()).not.toContain('Passcode question');
    // Not a new list: the Menu kept its node (a rebuild would remount it), and its first row is still the active one.
    expect(screen.getByRole('menu')).toBe(menu);
    expect(active()).toBe('Passcode lock');
    expect(focusedRows()).toHaveLength(1);
  });

  it('a kept arrowed row is the one Enter acts on: the field points at it, and Enter opens its place', async () => {
    const router = await open(pagesWith(async () => ({ default: useHide })));
    const navigate = vi.spyOn(router, 'navigate');
    await typeAndSettle('passcode');
    await userEvent.keyboard('{ArrowDown}');
    act(() => setAnswer({ hide: ['#faq-'] }));
    await act(async () => {});
    const [row] = focusedRows();
    expect(row?.textContent?.replace(/Account.*|Home.*/, '')).toBe('Passcode sessions');
    expect(screen.getByRole('searchbox')).toHaveAttribute('aria-activedescendant', row!.id);
    await userEvent.keyboard('{Enter}');
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/account?section=sessions' });
  });

  it('an answer of the same value while a row is arrowed: the row stays', async () => {
    setAnswer({ hide: ['#faq-'] });
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe('Passcode sessions');
    act(() => setAnswer({ hide: ['#faq-'] }));
    await act(async () => {});
    expect(active()).toBe('Passcode sessions');
    expect(focusedRows()).toHaveLength(1);
  });

  it('an answer that leaves out every place of the page: at most one active row, the other page stays', async () => {
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    await userEvent.keyboard('{ArrowDown}');
    act(() => setAnswer({ only: ['?nothing'] }));
    await act(async () => {});
    expect(listed()).toEqual(['Passcode tips']);
    expect(focusedRows().length).toBeLessThanOrEqual(1);
  });

  it('a reader answering that drops the arrowed row: the first row shown is the active one', async () => {
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe('Passcode sessions');
    act(() => setAnswer({ hide: ['?section=sessions'] }));
    await act(async () => {});
    expect(listed()).not.toContain('Passcode sessions');
    expect(screen.getAllByRole('menuitem')[0]).toHaveAttribute('data-focused', 'true');
    expect(screen.getAllByRole('menuitem').filter((e) => e.getAttribute('data-focused') === 'true')).toHaveLength(1);
  });

  it.each([
    ['null', async () => ({ default: useHide })],
    ['a reader that throws', async () => (setAnswer('throw'), { default: useHide })],
    ['a load that fails', () => Promise.reject(new Error('no chunk'))],
    ['no searchHide', undefined],
  ] as const)('%s: nothing is left out', async (_name, load) => {
    await open(pagesWith(load as (() => Promise<{ default: () => SearchHide | null }>) | undefined));
    await typeAndSettle('passcode');
    expect(listed()).toEqual(['Passcode lock', 'Passcode sessions', 'Passcode tips', 'Passcode on', 'Passcode question']);
  });

  it('the readers mount at the open (the empty field\'s Commands use them too): one load per page, kept while the text changes', async () => {
    const load = vi.fn(async () => ({ default: useHide }));
    setAnswer({ hide: ['?section=passcode'] });
    await open(pagesWith(load));
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    await typeAndSettle('pa');
    // The reader answers once it has loaded (until then the place shows: the trade-off the palette states).
    await waitFor(() => expect(listed()).not.toContain('Passcode lock'));
    // Clearing the field and typing again reads the loaded reader (one load per page).
    await userEvent.clear(screen.getByRole('searchbox'));
    await typeAndSettle('pa');
    expect(load).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(listed()).not.toContain('Passcode lock'));
  });

  it('commands at one letter: a command the reader names is left out from the first typed letter on', async () => {
    setAnswer({ hide: [], commands: ['password'] });
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await typeAndSettle('p');
    await waitFor(() => expect(listed()).not.toContain('Passcode password sheet'));
    expect(listed()).toContain('Passcode devices');
  });

  it('commands: a command the reader names is left out of typed results, the page\'s other commands stay', async () => {
    setAnswer({ hide: [], commands: ['password'] });
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await typeAndSettle('passcode');
    expect(listed()).toContain('Passcode devices');
    expect(listed()).not.toContain('Passcode password sheet');
    act(() => setAnswer(null));
    expect(listed()).toContain('Passcode password sheet');
  });

  it('a reader that breaks after it answered: what it left out shows again (its probe takes it back)', async () => {
    setAnswer({ hide: ['?section=passcode'] });
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    expect(listed()).not.toContain('Passcode lock');
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React reports the caught throw
    act(() => setAnswer('throw'));
    expect(listed()).toContain('Passcode lock');
    expect(listed()).toEqual(['Passcode lock', 'Passcode sessions', 'Passcode tips', 'Passcode on', 'Passcode question']);
  });

  it('a left-out place takes no row: the drawn ones past the row limit still show', async () => {
    // 60 hidden places that outrank the one drawn place (same words, kinds before its question).
    deep.list = [
      ...Array.from({ length: 60 }, (_, i): DeepEntry => ({ page: 'account', kind: 'section', label: `Passcode ${i}`, to: `?section=passcode-${i}`, words: '' })),
      { page: 'account', kind: 'faq', label: 'Passcode drawn question', to: '#faq-drawn', words: '' },
    ];
    setAnswer({ hide: ['?section=passcode'] });
    await open(pagesWith(async () => ({ default: useHide })));
    await typeAndSettle('passcode');
    expect(listed()).toEqual(['Passcode drawn question']);
  });
});

// The empty field's Commands section leaves out a command its page's searchHide names (a command that would open
// nothing now: Turn on two-step sign-in while two-step is on), as typed results do. Before, the probes ran only from
// the first typed letter and the empty list listed every command.
describe('CommandPalette: the empty field and a page searchHide', () => {
  // jsdom does not run the field's autoFocus on a portal mount: put the caret there as the open does, so the arrow
  // keys reach the list (the typed cases get it from userEvent.type's click).
  const caret = () => userEvent.click(screen.getByRole('searchbox'));
  /** From the field, ArrowDown until `label` is the active row (the empty list starts with no active row). */
  async function arrowTo(label: string) {
    await caret();
    for (let i = 0; i < 8 && active() !== label; i++) await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(label);
  }

  it('a command the reader names is left out of the Commands section; the page\'s other commands stay', async () => {
    setAnswer({ hide: [], commands: ['password'] });
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await waitFor(() => expect(listed()).not.toContain('Passcode password sheet'));
    expect(listed()).toContain('Passcode devices');
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('follows the reader while the field stays empty: the command comes back, then goes again', async () => {
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await act(async () => {});
    // Positive control: nothing named, every command listed.
    expect(listed()).toContain('Passcode password sheet');
    act(() => setAnswer({ hide: [], commands: ['password'] }));
    await act(async () => {});
    expect(listed()).not.toContain('Passcode password sheet');
    act(() => setAnswer(null));
    await act(async () => {});
    expect(listed()).toContain('Passcode password sheet');
  });

  it('a reader answering with no row arrowed: the same list (no rebuild), no row made active', async () => {
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await act(async () => {});
    const menu = screen.getByRole('menu');
    act(() => setAnswer({ hide: [], commands: ['password'] }));
    await act(async () => {});
    expect(screen.getByRole('menu')).toBe(menu);
    expect(focusedRows()).toHaveLength(0);
  });

  it('a reader answering keeps the arrowed row when it drops a command above it', async () => {
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await act(async () => {});
    // Below the command the reader will drop (Home, Account, then the two commands).
    await arrowTo('Passcode devices');
    act(() => setAnswer({ hide: [], commands: ['password'] }));
    await act(async () => {});
    expect(listed()).not.toContain('Passcode password sheet');
    expect(active()).toBe('Passcode devices');
    expect(focusedRows()).toHaveLength(1);
  });

  it('a reader answering that drops the arrowed command: a new list on its first row, the field names that row', async () => {
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await act(async () => {});
    await arrowTo('Passcode password sheet');
    act(() => setAnswer({ hide: [], commands: ['password'] }));
    await act(async () => {});
    expect(listed()).not.toContain('Passcode password sheet');
    // As a typed list does when its arrowed row goes: the first row shown is the active one, so the field never names
    // a row that is gone and Enter acts on what is shown.
    const rows = focusedRows();
    expect(rows).toHaveLength(1);
    expect(screen.getAllByRole('menuitem')[0]).toBe(rows[0]);
    expect(screen.getByRole('searchbox')).toHaveAttribute('aria-activedescendant', rows[0]!.id);
  });

  it('after that, a text typed and cleared again: the empty field has no active row', async () => {
    await open(pagesWith(async () => ({ default: useHide }), { commands: true }));
    await act(async () => {});
    await arrowTo('Passcode password sheet');
    act(() => setAnswer({ hide: [], commands: ['password'] }));
    await act(async () => {});
    expect(focusedRows()).toHaveLength(1);
    await typeAndSettle('pa');
    await userEvent.clear(screen.getByRole('searchbox'));
    await act(async () => {});
    expect(focusedRows()).toHaveLength(0);
  });
});
