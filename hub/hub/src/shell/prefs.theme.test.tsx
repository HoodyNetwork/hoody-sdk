// The Hub's theme defaults to System. With no saved hub_theme_v1 the Hub draws the device's
// prefers-color-scheme (fouc.js before the first paint, prefs.ts after) and, while the choice is System, follows a
// change of it on the open page; a saved Light or Dark ignores it. The pick is saved in localStorage only: never a
// cookie. The account menu offers Light, Dark and System, with System checked when nothing is saved.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import foucSource from '../../../public/auth/fouc.js?raw';
import strings from './strings.en.json';

const root = document.documentElement;
const KEY = 'hub_theme_v1';

/** A device whose scheme the test sets and changes: matchMedia('(prefers-color-scheme: dark)') answers it, live. */
function device(dark: boolean) {
  const subs = new Set<(e: { matches: boolean }) => void>();
  const mql = (q: string) => ({
    get matches() { return /prefers-color-scheme:\s*dark/.test(q) ? dark : false; },
    media: q,
    addEventListener: (_: string, f: (e: { matches: boolean }) => void) => subs.add(f),
    removeEventListener: (_: string, f: (e: { matches: boolean }) => void) => subs.delete(f),
    addListener: (f: (e: { matches: boolean }) => void) => subs.add(f),
    removeListener: (f: (e: { matches: boolean }) => void) => subs.delete(f),
    onchange: null,
    dispatchEvent: () => true,
  });
  vi.stubGlobal('matchMedia', vi.fn(mql));
  return { set: (d: boolean) => { dark = d; for (const f of [...subs]) f({ matches: d }); } };
}
const fouc = () => new Function(foucSource as string)();
/** prefs.ts as a page load reads it: a fresh module. */
const loadPrefs = async () => { vi.resetModules(); return import('./prefs'); };
const theme = () => root.getAttribute('data-hx-theme');

let cookieWrites: string[];
beforeEach(() => {
  localStorage.clear();
  root.removeAttribute('data-hx-theme');
  cookieWrites = [];
  // Every cookie write is recorded (and kept out of the document): the theme must never write one.
  vi.spyOn(document, 'cookie', 'set').mockImplementation((v: string) => { cookieWrites.push(v); });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  root.removeAttribute('data-hx-theme');
  expect(cookieWrites).toEqual([]);
});

describe('fouc.js: the first paint', () => {
  it('no saved theme under a dark device draws dark; under a light one, light', () => {
    device(true); fouc();
    expect(theme()).toBe('dark');
    device(false); fouc();
    expect(theme()).toBe('light');
  });
  it('a saved light under a dark device stays light; a saved dark under a light one stays dark', () => {
    device(true); localStorage.setItem(KEY, 'light'); fouc();
    expect(theme()).toBe('light');
    device(false); localStorage.setItem(KEY, 'dark'); fouc();
    expect(theme()).toBe('dark');
  });
  it('a saved system, or anything invalid, follows the device', () => {
    for (const v of ['system', 'Dark', 'blue', '']) {
      device(true); localStorage.setItem(KEY, v); fouc();
      expect(theme()).toBe('dark');
    }
  });
  it('refused storage follows the device too', () => {
    device(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    fouc();
    expect(theme()).toBe('dark');
  });
});

describe('prefs.ts: the theme after load', () => {
  it('no saved theme: System is the choice and the device draws it', async () => {
    device(true);
    const p = await loadPrefs();
    expect(renderHook(() => p.useShellPrefs()).result.current).toMatchObject({ choice: 'system', theme: 'dark' });
  });
  it('System follows the device live: an OS or browser switch flips the open page', async () => {
    const d = device(false);
    const p = await loadPrefs();
    p.applyTheme();
    expect(theme()).toBe('light');
    act(() => d.set(true));
    expect(theme()).toBe('dark');
    act(() => d.set(false));
    expect(theme()).toBe('light');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it('a device switch between the page load and the first reader is caught up: System draws the scheme the device has now', async () => {
    const d = device(false);
    const p = await loadPrefs();
    // Nothing watches the device yet (a module does nothing at load), so this switch reaches no listener.
    d.set(true);
    const hook = renderHook(() => p.useShellPrefs());
    expect(hook.result.current).toMatchObject({ choice: 'system', theme: 'dark' });
    expect(theme()).toBe('dark');
  });
  it('the catch-up leaves a saved theme and a fixture pin alone', async () => {
    localStorage.setItem(KEY, 'light');
    const d = device(false);
    const p = await loadPrefs();
    d.set(true);
    expect(renderHook(() => p.useShellPrefs()).result.current).toMatchObject({ choice: 'light', theme: 'light' });
    localStorage.clear();
    const q = await loadPrefs();
    q.pinTheme('light');
    expect(renderHook(() => q.useShellPrefs()).result.current.theme).toBe('light');
    expect(theme()).toBe('light');
  });
  it('a saved light under a dark device stays light, and ignores the device switching', async () => {
    localStorage.setItem(KEY, 'light');
    const d = device(true);
    const p = await loadPrefs();
    p.applyTheme();
    expect(theme()).toBe('light');
    act(() => d.set(false));
    act(() => d.set(true));
    expect(theme()).toBe('light');
  });
  it('a fixture pin (?theme=) is drawn as given and ignores the device', async () => {
    const d = device(false);
    const p = await loadPrefs();
    p.applyTheme();
    p.pinTheme('dark');
    expect(theme()).toBe('dark');
    act(() => d.set(false));
    act(() => d.set(true));
    act(() => d.set(false));
    expect(theme()).toBe('dark');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('the account menu: Light, Dark and System', () => {
  // The menu's module graph is large: its first transform alone can pass a case's timeout on a loaded host. Load it
  // once here, with a budget of its own; each case still imports a fresh graph (loadPrefs resets it), from the cache.
  beforeAll(async () => {
    await import('./Switchers');
  }, 120_000);
  // The menu and the prefs module it reads come from the same fresh module graph (loadPrefs reset it).
  async function mount() {
    const { ShellDataProvider } = await import('./context');
    const { PagesProvider } = await import('./pageLinks');
    const { AccountMenu } = await import('./Switchers');
    render(
      <RouterProvider navigate={vi.fn()}>
        <PagesProvider pages={[]}>
          <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>
            <AccountMenu />
          </ShellDataProvider>
        </PagesProvider>
      </RouterProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Account menu' })); });
  }
  const item = (k: 'theme.light' | 'theme.dark' | 'theme.system') => screen.getByRole('menuitemradio', { name: strings[k] });

  it('System is offered and checked when nothing is saved', async () => {
    vi.doMock('@core', () => ({ useCan: () => true }));
    device(true);
    await loadPrefs();
    await mount();
    expect(item('theme.system')).toHaveAttribute('aria-checked', 'true');
    expect(item('theme.light')).toHaveAttribute('aria-checked', 'false');
    expect(item('theme.dark')).toHaveAttribute('aria-checked', 'false');
  });
  it('picking Light saves light in localStorage only and stops following the device; picking System follows it again', async () => {
    vi.doMock('@core', () => ({ useCan: () => true }));
    const d = device(true);
    const p = await loadPrefs();
    p.applyTheme();
    await mount();
    await act(async () => { fireEvent.click(item('theme.light')); });
    expect(localStorage.getItem(KEY)).toBe('light');
    expect(theme()).toBe('light');
    act(() => d.set(false));
    act(() => d.set(true));
    expect(theme()).toBe('light');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Account menu' })); });
    await act(async () => { fireEvent.click(item('theme.system')); });
    expect(localStorage.getItem(KEY)).toBe('system');
    expect(theme()).toBe('dark');
    act(() => d.set(false));
    expect(theme()).toBe('light');
  });
});
