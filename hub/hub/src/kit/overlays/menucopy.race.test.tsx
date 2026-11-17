// ActionMenu copy items and closing. A copy item writes to the clipboard,
// then says Copied and closes the menu COPIED_MS later. The write is async: when the menu closes (Escape) before it
// resolves, its late answer belongs to a menu that is gone. It must not mark the reopened menu Copied, nor arm the
// timer that would close it. A write that resolves while the menu is still open closes it as before.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPIED_MS } from './Menu';
import { ActionMenu } from './Overlays';
import strings from './strings.en.json';

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const escape = async () => {
  const el = document.activeElement ?? document.body;
  await act(async () => {
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyUp(el, { key: 'Escape' });
  });
};
const wait = (ms = 30) => act(async () => new Promise((r) => window.setTimeout(r, ms)));
const trigger = () => screen.getByRole('button', { name: 'Row actions' });

/** A clipboard whose writes the test settles by hand, in order. */
function deferredClipboard() {
  const pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })) },
  });
  const next = () => pending.shift()!;
  return {
    count: () => pending.length,
    resolve: async () => act(async () => next().resolve()),
    reject: async () => act(async () => next().reject(new Error('denied'))),
  };
}

const ITEM = 'Copy terminal URL';
async function mount(onAction = () => undefined) {
  await inRouter(() => <ActionMenu label="Row actions" items={[{ id: 'url', label: ITEM, icon: 'copy', copy: 'https://example.com/t', onAction }]} />);
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
/** The close timer is faked from just before the write settles, so the COPIED_MS deadline is exact, not wall-clock. */
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
const advance = async (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
/** Back on real timers, the closed menu's exit settles. */
const settleReal = async () => {
  vi.useRealTimers();
  await wait(100);
};

describe('ActionMenu: a copy that settles after the menu closed', () => {
  it('copy, close, reopen, then the write resolves: the reopened menu stays open and is not marked Copied', async () => {
    const clip = deferredClipboard();
    const done = vi.fn();
    await mount(done);
    await press(trigger());
    await press(screen.getByRole('menuitem', { name: ITEM }));
    expect(clip.count(), 'the write is in flight').toBe(1);
    await escape();
    expect(screen.queryByRole('menu')).toBeNull();
    await press(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await clip.resolve();
    expect(done, 'the copy went through, so its action still runs').toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: strings.copied }), 'the reopened menu is not marked Copied').toBeNull();
    await wait(COPIED_MS + 200);
    expect(screen.queryByRole('menu'), 'no late timer closes the reopened menu').toBeInTheDocument();
  });

  it('a failed write that settles after the close arms no timer either: the reopened menu stays open, unmarked', async () => {
    const clip = deferredClipboard();
    await mount();
    await press(trigger());
    await press(screen.getByRole('menuitem', { name: ITEM }));
    await escape();
    await press(trigger());
    await clip.reject();
    expect(screen.queryByText(strings.copyFailed)).toBeNull();
    await wait(COPIED_MS + 200);
    expect(screen.queryByRole('menu')).toBeInTheDocument();
  });

  it('a write that resolves while the menu is open says Copied, then closes it COPIED_MS later (as before)', async () => {
    const clip = deferredClipboard();
    const done = vi.fn();
    await mount(done);
    await press(trigger());
    await press(screen.getByRole('menuitem', { name: ITEM }));
    await wait(100);
    expect(screen.getByRole('menu'), 'open while the write is in flight').toBeInTheDocument();
    fakeTimers();
    await clip.resolve();
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menuitem', { name: strings.copied })).toBeInTheDocument();
    await advance(COPIED_MS - 1);
    expect(screen.getByRole('menu'), 'still open just before COPIED_MS').toBeInTheDocument();
    await advance(1);
    await settleReal();
    expect(screen.queryByRole('menu'), 'closed at COPIED_MS').toBeNull();
  });

  it('a write that fails while the menu is open shows the warning, then closes it COPIED_MS later (as before)', async () => {
    const clip = deferredClipboard();
    const done = vi.fn();
    await mount(done);
    await press(trigger());
    await press(screen.getByRole('menuitem', { name: ITEM }));
    fakeTimers();
    await clip.reject();
    expect(done, 'a failed copy runs no action').not.toHaveBeenCalled();
    expect(screen.getByText(strings.copyFailed)).toBeInTheDocument();
    await advance(COPIED_MS - 1);
    expect(screen.getByRole('menu'), 'still open just before COPIED_MS').toBeInTheDocument();
    await advance(1);
    await settleReal();
    expect(screen.queryByRole('menu'), 'closed at COPIED_MS').toBeNull();
  });
});
