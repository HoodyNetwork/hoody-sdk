// The top bar's actions as drawn: AI, the bell, the account menu, in that order, each a button; the
// bell names its unread count and carries the count mark, hidden from assistive tech; beside the worded plates the
// bell is a framed kit icon button (secondary), on the phone the frameless one (ghost); below 1024 the icon-only AI is
// framed as well.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import strings from './strings.en.json';
import { TopBar } from './TopBar';

vi.mock('../ask', () => ({
  useAskWaiting: () => false,
  useAskActivityLabel: () => ({ activity: null, label: '' }),
}));

// matchMedia answers the width queries against `vw` (TopBar.askfocus.test.tsx does the same).
let vw = 1440;
vi.stubGlobal('matchMedia', (q: string) => {
  const m = /\(width\s*(<|>=)\s*(\d+)px\)/.exec(q);
  return {
    get matches() {
      return m ? (m[1] === '<' ? vw < Number(m[2]) : vw >= Number(m[2])) : false;
    },
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  };
});

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
async function show(width: number, unread?: number, unreadCapped?: boolean) {
  vw = width;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <PagesProvider pages={[pg('home'), pg('notifications')]}><TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} /></PagesProvider> }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], unread, unreadCapped }}>
        <RouterProvider router={router} />
      </ShellDataProvider>,
    );
    await router.load();
  });
}
const named = (count: string) => strings['top.notificationsCount'].replace('{{count}}', count);
const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => {
  cleanup();
  vw = 1440;
});

describe('top bar actions', () => {
  it('AI, the bell and the account menu are buttons, in that order', async () => {
    await show(1440, 6);
    const ai = screen.getByRole('button', { name: strings['top.ask'] });
    const bell = screen.getByRole('button', { name: named('6') });
    const account = screen.getByRole('button', { name: strings['top.account'] });
    expect(after(ai, bell)).toBe(true);
    expect(after(bell, account)).toBe(true);
  });

  it('the bell names its unread count; the count mark beside it is hidden from assistive tech', async () => {
    await show(1440, 6);
    const bell = screen.getByRole('button', { name: named('6') });
    const mark = bell.closest('header')?.querySelector('[data-count-badge]');
    expect(mark).toHaveTextContent('6');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveAttribute('data-count-badge', 'accent');
  });

  it('a lower bound reads "N+" in the name and on the mark; no unread: the plain name and no mark', async () => {
    await show(1440, 26, true);
    const bell = screen.getByRole('button', { name: named('26+') });
    expect(bell.closest('header')?.querySelector('[data-count-badge]')).toHaveTextContent('26+');
    cleanup();
    await show(1440, 0);
    const quiet = screen.getByRole('button', { name: strings['top.notifications'] });
    expect(quiet.closest('header')?.querySelector('[data-count-badge]')).toBeNull();
  });

  it('beside the worded plates the bell is a framed plate (secondary), never the frameless ghost', async () => {
    for (const width of [1440, 1024, 900, 768]) {
      await show(width, 6);
      const bell = screen.getByRole('button', { name: named('6') });
      expect(bell.className, String(width)).toMatch(/secondary/);
      expect(bell.className, String(width)).not.toMatch(/ghost/);
      cleanup();
    }
  });

  it('on the phone, where nothing in the bar has a frame, the bell is the frameless icon button', async () => {
    await show(390, 6);
    const bell = screen.getByRole('button', { name: named('6') });
    expect(bell.className).toMatch(/ghost/);
    expect(bell.className).not.toMatch(/secondary/);
  });

  it('below 1024 the icon-only AI is a framed plate too', async () => {
    await show(900);
    const ai = screen.getByRole('button', { name: strings['top.ask'] });
    expect(ai.className).toMatch(/iconOnly/);
    expect(ai.className).toMatch(/secondary/);
  });
});
