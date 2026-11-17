// The shell's passcode wiring, against a controllable engine:
// - keys.ts and runPageKeys run nothing while locked (Ctrl/⌘K, ?, g-jumps and page keys);
// - Lock now: in the account menu and the palette only while a passcode is set; it calls lockNow();
// - LockNotices: the sanitised purge-failed / suspended panels, only while locked;
// - base.css: the body rule hides every body child but the lock host, with no media query (print too).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider as TanRouter } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import type * as CoreShell from '@core/shell';

const eng = vi.hoisted(() => ({
  locked: false,
  set: false,
  lockNow: vi.fn(() => true),
  logout: vi.fn(),
  endTokenSession: vi.fn(),
  lifecycle: new Set<(e: unknown) => unknown>(),
  lockListeners: new Set<() => void>(),
  setLocked(v: boolean) { this.locked = v; for (const l of [...this.lockListeners]) l(); },
}));

vi.mock('@core', () => ({ useCan: () => true, useCore: () => ({ identity: null }) }));
vi.mock('@core/shell', async (orig) => {
  const real = await orig<typeof CoreShell>();
  const { useSyncExternalStore } = await import('react');
  return {
    ...real,
    isLocked: () => eng.locked,
    useLocked: () => useSyncExternalStore((l) => { eng.lockListeners.add(l); return () => { eng.lockListeners.delete(l); }; }, () => eng.locked),
    lockSettings: () => (eng.set ? { set: true, digits: false, idleMin: 5, onLeave: false } : null),
    lockNow: () => eng.lockNow(),
    logout: () => eng.logout(),
    endTokenSession: (r: unknown) => eng.endTokenSession(r),
    onLifecycle: (l: (e: unknown) => unknown) => { eng.lifecycle.add(l); return () => { eng.lifecycle.delete(l); }; },
  };
});

import { CommandPalette } from './CommandPalette';
import { ShellDataProvider } from './context';
import { useGlobalKeys } from './keys';
import { LockNotices, resetLockNoticesForTests, setLockBootPanel } from './LockNotices';
import { LockTitle } from './LockRoot';
import { PagesProvider } from './pageLinks';
import { type PageShortcut, usePageShortcuts } from './pageShortcuts';
import { AccountMenu } from './Switchers';

const HERE = dirname(fileURLToPath(import.meta.url));
const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready', nav: { icon: 'home', group: 'main' } }) as unknown as PageManifest;

beforeEach(() => {
  eng.locked = false;
  eng.set = false;
  eng.lockNow.mockClear();
  eng.logout.mockClear();
  eng.endTokenSession.mockClear();
  eng.lockListeners.clear();
});
afterEach(() => cleanup());

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(e); });
  return e;
};

describe('keys while locked', () => {
  function Shell({ acts, keys }: { acts: Parameters<typeof useGlobalKeys>[1]; keys: PageShortcut[] }) {
    useGlobalKeys([pg('home')], acts);
    usePageShortcuts(keys);
    return null;
  }
  const mount = () => {
    const acts = { palette: vi.fn(), shortcuts: vi.fn(), toggleSidebar: vi.fn(), toggleAsk: vi.fn(), go: vi.fn() };
    const run = vi.fn();
    render(<Shell acts={acts} keys={[{ key: 'x', label: 'Close tile', run }]} />);
    return { acts, run };
  };

  it('unlocked: Ctrl+K, ?, g h and a page key run (the control)', () => {
    const { acts, run } = mount();
    press('k', { ctrlKey: true });
    press('?', { shiftKey: true });
    press('g'); press('h');
    press('x');
    expect(acts.palette).toHaveBeenCalledTimes(1);
    expect(acts.shortcuts).toHaveBeenCalledTimes(1);
    expect(acts.go).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('locked: none of them runs, and nothing claims the event (the lock field types normally)', () => {
    const { acts, run } = mount();
    eng.locked = true;
    const k = press('k', { ctrlKey: true });
    press('?', { shiftKey: true });
    press('g'); press('h');
    const x = press('x');
    expect(acts.palette).not.toHaveBeenCalled();
    expect(acts.shortcuts).not.toHaveBeenCalled();
    expect(acts.go).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(k.defaultPrevented).toBe(false);
    expect(x.defaultPrevented).toBe(false);
  });

  it('page keys alone (no global keys mounted) run nothing while locked either', () => {
    const run = vi.fn();
    function Page() { usePageShortcuts([{ key: 'x', label: 'Close tile', run }]); return null; }
    render(<Page />);
    eng.locked = true;
    press('x');
    expect(run).not.toHaveBeenCalled();
    eng.locked = false;
    press('x');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('Lock now', () => {
  function mountMenu(node: ReactNode) {
    render(
      <RouterProvider navigate={vi.fn()}>
        <PagesProvider pages={[pg('account')]}>
          <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>{node}</ShellDataProvider>
        </PagesProvider>
      </RouterProvider>,
    );
  }
  const openMenu = async () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Account menu' })); });

  it('account menu, no passcode: no Lock now', async () => {
    mountMenu(<AccountMenu />);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Lock now' })).toBeNull();
  });

  it('account menu, a passcode set after the menu rendered: Lock now right before Sign out; it locks', async () => {
    mountMenu(<AccountMenu />);
    eng.set = true;
    await openMenu();
    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent?.trim());
    expect(items.indexOf('Lock now')).toBe(items.indexOf('Sign out') - 1);
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Lock now' })); });
    expect(eng.lockNow).toHaveBeenCalledTimes(1);
  });

  async function mountPalette(isOpen: boolean, onOpenChange = vi.fn()) {
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <CommandPalette pages={[pg('home')]} isOpen={isOpen} onOpenChange={onOpenChange} /> }),
      history: createMemoryHistory({ initialEntries: ['/home'] }),
    });
    await act(async () => {
      render(<TanRouter router={router} />);
      await router.load();
    });
    return onOpenChange;
  }

  it('palette, no passcode: no Lock now', async () => {
    await mountPalette(true);
    expect(screen.queryByRole('menuitem', { name: 'Lock now' })).toBeNull();
  });

  it('palette, a passcode set: Lock now under Commands; choosing it closes the palette and locks', async () => {
    eng.set = true;
    const onOpenChange = await mountPalette(true);
    const item = screen.getByRole('menuitem', { name: 'Lock now' });
    expect(item.closest('section, [role="group"]')?.textContent).toContain('Commands');
    await act(async () => { fireEvent.click(item); });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(eng.lockNow).toHaveBeenCalledTimes(1);
  });
});

describe('LockNotices', () => {
  const emit = (e: unknown) => act(() => { for (const l of [...eng.lifecycle]) l(e); });
  // The module subscribes at load and keeps the last panel; each test reads its own emission.

  it('a boot that ended purge-failed: nothing while unlocked; the purge message and Try again (logout) while locked', async () => {
    resetLockNoticesForTests();
    setLockBootPanel({ state: 'purge-failed' });
    render(<LockNotices />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => eng.setLocked(true));
    expect(screen.getByRole('alert').textContent).toContain("Sign-out didn't finish");
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(eng.logout).toHaveBeenCalledTimes(1);
  });

  it("a token session's purge failure: Try again ends it again with its own reason", async () => {
    eng.locked = true;
    render(<LockNotices />);
    emit({ kind: 'token-panel', panel: 'purgeFailed', again: 'expired' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(eng.endTokenSession).toHaveBeenCalledWith('expired');
    expect(eng.logout).not.toHaveBeenCalled();
  });

  it('suspended: the title and body only, no links and no Sign out (they are on the app screen after unlock)', () => {
    eng.locked = true;
    render(<LockNotices />);
    emit({ kind: 'suspended' });
    const panel = screen.getByRole('alert');
    expect(panel.textContent).toContain('Your account is suspended');
    expect(panel.querySelectorAll('a, button').length).toBe(0);
  });
});

describe('the locked tab title: owned by the lock root, so it does not wait for a page to mount', () => {
  it('locked: "Locked · Hub" with no page frame mounted (an unmatched route, a page chunk still loading); unlock puts the old title back', async () => {
    document.title = 'Files · Hub';
    render(<LockTitle />);
    expect(document.title).toBe('Files · Hub');
    await act(async () => { eng.setLocked(true); });
    expect(document.title).toBe('Locked · Hub');
    await act(async () => { eng.setLocked(false); });
    expect(document.title).toBe('Files · Hub');
  });

  it('a page that set its own title by unlock keeps it (the lock root restores only its own lock title)', async () => {
    document.title = 'Files · Hub';
    eng.locked = true;
    render(<LockTitle />);
    expect(document.title).toBe('Locked · Hub');
    document.title = 'Keys · Hub';
    await act(async () => { eng.setLocked(false); });
    expect(document.title).toBe('Keys · Hub');
  });
});

describe('base.css', () => {
  it('one rule hides every body child but the lock host while locked, outside any media query', () => {
    const css = readFileSync(join(HERE, '../kit/base.css'), 'utf8');
    const at = css.indexOf('body[data-hub-locked] > :not(#hub-lock-host) {\n  display: none !important;\n}');
    expect(at).toBeGreaterThan(-1);
    // Every block before it is closed: the rule is at the top level, so it applies in print as on screen.
    const before = css.slice(0, at);
    expect((before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length).toBe(0);
  });
});
