// Each shell control whose words are not its purpose is named by
// the words it shows first, then by what it is for: the realm, computer and phone context triggers ("Lab, Realm"), the
// search button (its words and key hint) and the sidebar's badged links ("Notifications 26 unread"). The shown words
// must start the name (axe label-content-name-mismatch in the browser: shell/labelInName.spec.ts).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider as TanstackRouter } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';
import { ComputerSwitcher, PhoneContext, RealmSwitcher } from './Switchers';
import { TopBar } from './TopBar';

vi.mock('@core', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useCan: () => true }));
vi.mock('../ask', () => ({ useAskWaiting: () => false, useAskActivityLabel: () => ({ activity: null, label: '' }) }));

const pg = (id: string, title = id) => ({ id, path: `/${id}`, title, strings: { [title]: title }, status: 'ready', nav: { group: 'main', order: 0 } }) as unknown as PageManifest;
const REALM = '6b00000000000000000000c3';
const OTHER = '6b00000000000000000000d4';
const ONE = '6a00000000000000000000a1';
const base: ShellData = {
  realms: [{ id: REALM, name: 'Lab' }, { id: OTHER, name: 'Home' }],
  realmId: REALM,
  computers: [{ id: ONE, name: 'box-one', running: true, flag: '🇸🇬', location: 'Singapore' }],
  computerId: ONE,
  setRealm: () => undefined,
  setComputer: () => undefined,
} as unknown as ShellData;

const words = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function mount(ui: ReactElement, data: Partial<ShellData> = {}) {
  return render(
    <RouterProvider navigate={() => undefined}>
      <PagesProvider pages={[pg('computers'), pg('realms')]}>
        <ShellDataProvider value={{ ...base, ...data }}>{ui}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}

const trigger = (which: 'realm' | 'computer' | 'context') => document.querySelector(`[data-hub-switch="${which}"]`) as HTMLElement;

afterEach(cleanup);

describe('switcher triggers: shown words, then what they are for', () => {
  it('realm: "Lab Realm"', () => {
    mount(<RealmSwitcher />);
    expect(trigger('realm')).toHaveAccessibleName('Lab Realm');
    expect(screen.getByRole('button', { name: 'Lab Realm' })).toBe(trigger('realm'));
  });

  it('realm, All realms shown: "All realms Realm"', () => {
    mount(<RealmSwitcher />, { realmId: 'all' });
    expect(trigger('realm')).toHaveAccessibleName('All realms Realm');
  });

  it('realm while switching: the shown realm, then where it is going', () => {
    mount(<RealmSwitcher />, { switchingTo: OTHER });
    expect(trigger('realm')).toHaveAccessibleName('Lab Realm, switching to Home');
  });

  it('phone chip while switching: the shown name, then where it is going', () => {
    mount(<PhoneContext />, { switchingTo: OTHER });
    expect(trigger('context')).toHaveAccessibleName('box-one Realm and computer, switching to Home');
  });

  it('computer: "box-one Computer"; its description tells the facts without the name again', () => {
    mount(<ComputerSwitcher />);
    const el = trigger('computer');
    expect(el).toHaveAccessibleName('box-one Computer');
    expect(el).toHaveAccessibleDescription('Lab, 🇸🇬 Singapore, Running');
  });

  it('computer, list loading: the loading words, then "Computer", and no description', () => {
    mount(<ComputerSwitcher />, { computers: [], computerId: undefined, computersRead: 'loading', retryComputers: () => undefined } as Partial<ShellData>);
    const el = trigger('computer');
    expect(el).toHaveAccessibleName('Loading computers… Computer');
    expect(el).not.toHaveAttribute('aria-describedby');
  });

  it('phone context chip: "box-one Realm and computer"', () => {
    mount(<PhoneContext />);
    expect(trigger('context')).toHaveAccessibleName('box-one Realm and computer');
  });

  it('phone context chip, no computer: the realm, then "Realm and computer"', () => {
    mount(<PhoneContext />, { computers: [], computerId: undefined });
    expect(trigger('context')).toHaveAccessibleName('Lab Realm and computer');
  });

  it('each trigger name starts with the words it shows', () => {
    for (const [ui, which] of [[<RealmSwitcher key="r" />, 'realm'], [<ComputerSwitcher key="c" />, 'computer'], [<PhoneContext key="p" />, 'context']] as const) {
      mount(ui);
      const el = trigger(which);
      const shown = words(el.querySelector('[class*="triggerText"]'));
      expect(shown.length).toBeGreaterThan(0);
      expect(el).toHaveAccessibleName(new RegExp(`^${shown.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
      cleanup();
    }
  });
});

async function showRouted(ui: () => ReactElement, data: Partial<ShellData>) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], ...data } as ShellData}>
        <TanstackRouter router={router} />
      </ShellDataProvider>,
    );
    await router.load();
  });
}

describe('search button: its words and key hint', () => {
  it('names itself by what it shows, the key hint included', async () => {
    await showRouted(() => <PagesProvider pages={[pg('home')]}><TopBar onOpenPalette={() => {}} onOpenShortcuts={() => {}} /></PagesProvider>, {});
    const btn = await screen.findByRole('button', { name: /^Search or jump to/ });
    expect(btn).toHaveAccessibleName(words(btn));
    expect(words(btn)).toMatch(/^Search or jump to… (Ctrl K|⌘K)$/);
  });
});

describe('sidebar badges: label and count, then the words', () => {
  const PAGES = [pg('home', 'Home'), pg('notifications', 'Notifications'), pg('bots', 'Bots')];
  const side = () => (
    <PagesProvider pages={PAGES}>
      <Sidebar pages={PAGES} collapsed={false} onToggleCollapsed={() => {}} onNavigate={() => {}} />
    </PagesProvider>
  );
  it('unread: "Notifications 26 unread", shown as "Notifications 26"', async () => {
    await showRouted(side, { unread: 26 });
    const link = screen.getByRole('link', { name: 'Notifications 26 unread' });
    expect(words(link)).toBe('Notifications 26');
  });
  it('unread past 99: "Notifications 99+ unread"', async () => {
    await showRouted(side, { unread: 140 });
    const link = screen.getByRole('link', { name: 'Notifications 99+ unread' });
    expect(words(link)).toBe('Notifications 99+');
  });
  it('waiting: "Bots 3 waiting for you"', async () => {
    await showRouted(side, { botsWaiting: 3 });
    expect(words(screen.getByRole('link', { name: 'Bots 3 waiting for you' }))).toBe('Bots 3');
  });
  it('waiting, a lower bound: "Bots 99+, at least 99 waiting for you"', async () => {
    await showRouted(side, { botsWaiting: 140, botsWaitingAtLeast: true });
    expect(words(screen.getByRole('link', { name: 'Bots 99+, at least 99 waiting for you' }))).toBe('Bots 99+');
  });
});
