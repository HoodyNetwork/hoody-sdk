// The shell's buttons with a keyboard shortcut tell it to assistive tech (aria-keyshortcuts on the
// element; React Aria's Button drops the prop, so kit/keyshortcuts.ts sets it): the realm (Alt+R) and computer (Alt+C)
// triggers, the search (Control+K), the Agent button (Control+J) and the sidebar's collapse button ([).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider as TanstackRouter } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';
import { ComputerSwitcher, RealmSwitcher } from './Switchers';
import { TopBar } from './TopBar';

vi.mock('@core', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useCan: () => true }));
vi.mock('../ask', () => ({ useAskWaiting: () => false, useAskActivityLabel: () => ({ activity: null, label: '' }) }));

const pg = (id: string, title = id) => ({ id, path: `/${id}`, title, strings: { [title]: title }, status: 'ready', nav: { group: 'main', order: 0 } }) as unknown as PageManifest;
const REALM = '6b00000000000000000000c3';
const ONE = '6a00000000000000000000a1';
const data = {
  realms: [{ id: REALM, name: 'Lab' }],
  realmId: REALM,
  computers: [{ id: ONE, name: 'box-one', running: true }],
  computerId: ONE,
  setRealm: () => undefined,
  setComputer: () => undefined,
} as unknown as ShellData;

afterEach(cleanup);

const trigger = (which: string) => document.querySelector(`[data-hub-switch="${which}"]`);
const mac = /Mac|iPhone|iPad/.test(navigator.platform);

describe('switcher triggers say their shortcut', () => {
  const mount = (ui: ReactElement) =>
    render(
      <RouterProvider navigate={() => undefined}>
        <PagesProvider pages={[pg('computers'), pg('realms')]}>
          <ShellDataProvider value={data}>{ui}</ShellDataProvider>
        </PagesProvider>
      </RouterProvider>,
    );
  it('realm: Alt+R', () => {
    mount(<RealmSwitcher />);
    expect(trigger('realm')).toHaveAttribute('aria-keyshortcuts', 'Alt+R');
  });
  it('computer: Alt+C', () => {
    mount(<ComputerSwitcher />);
    expect(trigger('computer')).toHaveAttribute('aria-keyshortcuts', 'Alt+C');
  });
});

async function routed(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [] } as unknown as ShellData}>
        <TanstackRouter router={router} />
      </ShellDataProvider>,
    );
    await router.load();
  });
}

describe('top bar and sidebar buttons say their shortcut', () => {
  it('search: Control+K (Meta+K on Apple)', async () => {
    await routed(() => <PagesProvider pages={[pg('home')]}><TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} /></PagesProvider>);
    expect(await screen.findByRole('button', { name: /^Search or jump to/ })).toHaveAttribute('aria-keyshortcuts', mac ? 'Meta+K' : 'Control+K');
  });
  it('AI (the Ask dock): Control+J (Meta+J on Apple), through the kit Button', async () => {
    await routed(() => <PagesProvider pages={[pg('home')]}><TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} /></PagesProvider>);
    expect(await screen.findByRole('button', { name: /^AI\b/ })).toHaveAttribute('aria-keyshortcuts', mac ? 'Meta+J' : 'Control+J');
  });
  it('sidebar collapse: [', async () => {
    const PAGES = [pg('home', 'Home')];
    await routed(() => (
      <PagesProvider pages={PAGES}>
        <Sidebar pages={PAGES} collapsed={false} onToggleCollapsed={() => {}} onNavigate={() => {}} />
      </PagesProvider>
    ));
    expect(await screen.findByRole('button', { name: /Collapse/ })).toHaveAttribute('aria-keyshortcuts', '[');
  });
});
