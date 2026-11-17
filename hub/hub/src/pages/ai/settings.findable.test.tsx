// Settings is a switcher destination of its own with
// an index that names Models & keys, Connections & MCP and Rules & hooks, beside the gear (which keeps the same three
// links); the two pages' titles and subtitles name MCP and hooks. Under All realms, Rules & hooks never just vanishes:
// every hooks route takes one realm (settings/rules/routes.ts realm:'realm'), so for a computer in several realms (no one
// realm to tell, aiRealm.ts) the page lists the realms inline and one press switches the shell's realm; then the realm's
// rules and hooks show.
// The fixture side of core's seam (pageFixtures): the models page reads its fixtures through it, and this harness renders
// the tab without app/testing (which loads it), so without this /ai/models draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient, type FixtureRule } from '@core';
import { setRealm as coreSetRealm } from '@core/ctx';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name and the realm switch, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import AiTab from './tab';
import { computerRealms } from './realmRules.testing';
import { links } from './links';
import { chatRules } from './parts/fixtures.chats';
import paneStrings from './parts/Pane.strings.en.json';
import strings from './strings.en.json';
import hookStrings from './settings/rules/Hooks.strings.en.json';

const SLOW = { timeout: 5000 };
const atlas = fixtureWorld.computers[0]!;
const PERSONAL = fixtureWorld.realms[0]!;
const ps = paneStrings as Record<string, string>;
const as = strings as Record<string, string>;
/** A string the page must have: fails loudly instead of matching `undefined`. */
const said = (k: string): string => {
  const v = as[k];
  if (v === undefined) throw new Error(`missing string ${k}`);
  return v;
};
const hrefOf = (a: HTMLElement) => a.getAttribute('href')?.replace(/^#/, '');

// The tab's chunks load once per file before the first visit (a cold transform outlives SLOW).
beforeAll(async () => {
  await import('./tab');
  await import('./safety');
}, 120_000);

async function open(path: string, o: { width?: number; realm?: string; setRealm?: (id: string) => void; rules?: FixtureRule[] } = {}) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => o.width ?? 1300 });
  bootFixtureCore({ rules: [...(o.rules ?? []), ...chatRules({})], ...(o.realm ? { realm: o.realm } : {}) });
  act(() => chooseComputer(atlas));
  const shell: ShellData = {
    realms: [], realmId: o.realm ?? PERSONAL.id, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'],
    ...(o.setRealm ? { setRealm: o.setRealm } : {}),
  };
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: AiTab });
  const router = createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={shell}>
        <main id="hub-main">
          <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
        </main>
      </ShellDataProvider>,
    );
    await router.load();
  });
  return router;
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the words name MCP and hooks', () => {
  it('the three settings pages are named Models & keys, Connections & MCP and Rules & hooks, in the index, the gear and the page titles', () => {
    expect(ps['settings.label']).toBe('Settings');
    expect(ps['switch.settings']).toBe('Settings');
    expect([ps['settings.models'], ps['settings.connections'], ps['settings.rules']]).toEqual(['Models & keys', 'Connections & MCP', 'Rules & hooks']);
    expect([ps['gear.models'], ps['gear.connections'], ps['gear.rules']]).toEqual(['Models & keys', 'Connections & MCP', 'Rules & hooks']);
    expect([as['models.title'], as['connections.title'], as['rules.title']]).toEqual(['Models & keys', 'Connections & MCP', 'Rules & hooks']);
  });

  it('the subtitles say what each page holds: MCP servers on Connections & MCP, rules and hooks on Rules & hooks', () => {
    expect(as['connections.subtitle']).toMatch(/\bMCP servers\b/);
    expect(as['rules.subtitle']).toMatch(/\brules\b/i);
    expect(as['rules.subtitle']).toMatch(/\bhooks\b/);
  });

  it('under All realms the one realm picker names hooks too, and both bodies still name the realm menu and the phone square', () => {
    expect(said('rules.checked.allRealms.title')).toMatch(/\bhooks\b/);
    for (const k of ['rules.checked.allRealms.body', 'rules.checked.allRealms.bodyPick']) {
      expect(as[k]).toMatch(/\bhooks\b/);
      expect(as[k]).toContain('realm menu at the top');
      expect(as[k]).toContain('(on a phone, tap the realm square)');
    }
  });
});

describe('Settings in the switcher', () => {
  it('the switcher lists Settings last, opening Models & keys', async () => {
    await open('/ai');
    const sw = await screen.findByRole('list', { name: ps['switch.label'] }, SLOW);
    expect(within(sw).getAllByRole('link').map((a) => a.textContent)).toEqual([ps['switch.chats'], ps['switch.agents'], ps['switch.auto'], ps['switch.knowledge'], ps['switch.settings']]);
    expect(hrefOf(within(sw).getByRole('link', { name: ps['switch.settings'] }))).toBe(links.list);
    expect(within(sw).getByRole('link', { name: ps['switch.settings'] })).not.toHaveAttribute('aria-current');
    // The chat routes draw no settings index.
    expect(screen.queryByRole('list', { name: ps['settings.label'] })).toBeNull();
  });

  it.each([
    [links.list, 'models'],
    [links.connections, 'connections'],
    [links.rules, 'rules'],
  ])('on %s Settings is current and its index marks the shown page, one link per page', async (path, shown) => {
    await open(path);
    const sw = await screen.findByRole('list', { name: ps['switch.label'] }, SLOW);
    expect(within(sw).getByRole('link', { name: ps['switch.settings'] })).toHaveAttribute('aria-current', 'page');
    const index = await screen.findByRole('list', { name: ps['settings.label'] }, SLOW);
    const items = within(index).getAllByRole('link');
    expect(items.map((a) => a.textContent)).toEqual([ps['settings.models'], ps['settings.connections'], ps['settings.rules']]);
    expect(items.map(hrefOf)).toEqual([links.list, links.connections, links.rules]);
    for (const [i, id] of ['models', 'connections', 'rules'].entries()) {
      if (id === shown) expect(items[i]).toHaveAttribute('aria-current', 'page');
      else expect(items[i]).not.toHaveAttribute('aria-current');
    }
  });

  it('on a phone (390 px) the settings index is above the page, with no pane', async () => {
    await open(links.rules, { width: 390 });
    const index = await screen.findByRole('list', { name: ps['settings.label'] }, SLOW);
    expect(screen.queryByRole('navigation', { name: ps['pane.label'] })).toBeNull();
    expect(within(index).getByRole('link', { name: ps['settings.rules'] })).toHaveAttribute('aria-current', 'page');
    const title = await screen.findByRole('heading', { level: 1, name: as['rules.title'] }, SLOW);
    expect(index.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the gear keeps the same three pages beside Pause and Stop everything', async () => {
    await open('/ai');
    await userEvent.click(await screen.findByRole('button', { name: ps['gear.label'] }, SLOW));
    for (const k of ['gear.models', 'gear.connections', 'gear.rules']) expect(await screen.findByRole('menuitem', { name: ps[k] })).toBeInTheDocument();
  });

  it('Connections & MCP and Rules & hooks show those titles as their page heading', async () => {
    await open(links.connections);
    expect(await screen.findByRole('heading', { level: 1, name: 'Connections & MCP' }, SLOW)).toBeInTheDocument();
    cleanup();
    await open(links.rules);
    expect(await screen.findByRole('heading', { level: 1, name: 'Rules & hooks' }, SLOW)).toBeInTheDocument();
  });
});

// atlas in two realms: under All realms the page has no one realm to tell, so it asks.
const SEVERAL = (): FixtureRule[] => [computerRealms(atlas.id, [fixtureWorld.realms[0]!.id, fixtureWorld.realms[1]!.id])];

describe('Rules & hooks under All realms, a computer in several realms', () => {
  it('lists every realm inline as a named group of buttons; one press switches the shell realm, and then that realm\'s hooks show', async () => {
    const pick = vi.fn((id: string) => { act(() => coreSetRealm(id)); });
    await open(links.rules, { realm: 'all', setRealm: pick, rules: SEVERAL() });
    const list = await screen.findByRole('group', { name: said('rules.checked.allRealms.pick') }, SLOW);
    const names = within(list).getAllByRole('button').map((b) => (b.textContent ?? '').trim());
    expect(screen.getByText(said('rules.checked.allRealms.bodyPick'))).toBeInTheDocument();
    expect(names).toEqual(fixtureWorld.realms.map((r) => r.name));
    // Nothing of the realm's rules or hooks is drawn while no realm is chosen.
    expect(screen.queryByText(hookStrings.title)).toBeNull();
    await userEvent.click(within(list).getByRole('button', { name: PERSONAL.name }));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledWith(PERSONAL.id);
    expect((await screen.findAllByText(hookStrings.title, {}, SLOW)).length).toBeGreaterThan(0);
    expect(screen.queryByText(said('rules.checked.allRealms.title'))).toBeNull();
    expect(screen.queryByRole('group', { name: said('rules.checked.allRealms.pick') })).toBeNull();
  });

  it('without a realm switch (a pinned session, or no shell) it says to pick a realm and offers no buttons', async () => {
    await open(links.rules, { realm: 'all', rules: SEVERAL() });
    expect(await screen.findByText(said('rules.checked.allRealms.title'), {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText(said('rules.checked.allRealms.body'))).toBeInTheDocument();
    expect(screen.queryByText(said('rules.checked.allRealms.bodyPick'))).toBeNull();
    expect(screen.queryByRole('group', { name: said('rules.checked.allRealms.pick') })).toBeNull();
  });
});
