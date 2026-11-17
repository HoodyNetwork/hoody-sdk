// A load that hides Notifications has no inbox to open, so nothing in the shell offers one:
// no top-bar bell or unread badge, no notification hint whose Set up would only dismiss itself, and no
// browser alert whose click could open nothing. Served, each one is there.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import type * as EngineModule from './notify/engine';
import type { EngineDeps, UnreadRead } from './notify/engine';
import type * as CoreShell from '@core/shell';
import { AlertRunner, type NotificationSource } from './notify/AlertRunner';
import { NotifyHint } from './notify/NotifyHint';
import { PagesProvider } from './pageLinks';
import { TopBar } from './TopBar';

const engine = vi.hoisted(() => ({ deps: null as EngineDeps | null }));
vi.mock('./notify/engine', async (orig) => {
  const real = await orig<typeof EngineModule>();
  return {
    ...real,
    createAlertEngine: (d: EngineDeps) => {
      engine.deps = d;
      return { start: () => {}, stop: () => {}, handle: () => {}, visibility: () => {} };
    },
  };
});
// Browser alerts switched on for the alert tests only; the hint tests read the real status (a hint stays away while
// alerts are on).
const alerts = vi.hoisted(() => ({ on: false }));
vi.mock('@core/shell', async (orig) => {
  const real = await orig<typeof CoreShell>();
  return { ...real, currentStatus: (u: string) => (alerts.on ? { ...real.currentStatus(u), state: 'on' as const } : real.currentStatus(u)) };
});

const UID = fixtureWorld.account.id;
const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready', nav: { icon: 'apps', group: 'main' } }) as unknown as PageManifest;
const SERVED = [pg('home'), pg('notifications')];
const HIDDEN = [pg('home')];

async function inShell(pages: readonly PageManifest[], node: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <PagesProvider pages={pages}>{node}</PagesProvider> }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' }, unread: 3 }}>
        <RouterProvider router={router} />
      </ShellDataProvider>,
    );
    await router.load();
  });
}

const source: NotificationSource = { summary: () => null, refresh: () => {}, readSince: () => Promise.resolve({ state: 'failed' } as unknown as UnreadRead), onSummary: () => () => {} };

beforeEach(() => {
  window.localStorage.clear();
  engine.deps = null;
  alerts.on = false;
  vi.stubGlobal('Notification', Object.assign(function N() {}, { permission: 'default', requestPermission: () => Promise.resolve('default') }));
});
afterEach(() => vi.unstubAllGlobals());

describe('Notifications hidden', () => {
  it('the top bar draws no bell and no unread badge', async () => {
    await inShell(HIDDEN, <TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} />);
    expect(screen.queryByRole('button', { name: /notifications/i })).toBeNull();
    expect(screen.queryByText('3')).toBeNull();
  });

  it('served: the top bar draws the bell with the unread count', async () => {
    await inShell(SERVED, <TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} />);
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('a notification hint does not show (its Set up would open nothing), and nothing is marked dismissed', async () => {
    await inShell(HIDDEN, <NotifyHint kind="computer" />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(window.localStorage.getItem(`hub_notify:${UID}:hints`)).toBeNull();
  });

  it('a hint whose caller opens the section itself (the notifications page) still shows', async () => {
    await inShell(HIDDEN, <NotifyHint kind="computer" onGo={() => {}} />);
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('browser alerts stay off while there is no inbox to open', async () => {
    alerts.on = true;
    await inShell(HIDDEN, <AlertRunner source={source} />);
    expect(engine.deps?.alertsOn(UID)).toBe(false);
  });

  it('served: browser alerts follow the alert setting', async () => {
    alerts.on = true;
    await inShell(SERVED, <AlertRunner source={source} />);
    expect(engine.deps?.alertsOn(UID)).toBe(true);
  });
});
