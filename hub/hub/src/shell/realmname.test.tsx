// Every place in the top bar that names the shown realm uses one rule
// (shownRealmName): "All realms" only for that selection; a selected realm missing from the list (a deferred or failed
// list read) shows the name core keeps for it (alias, else short id), else "This realm". Never "All realms" while
// requests stay scoped to one realm, and never another realm's name.
import { cleanup, render } from '@testing-library/react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { shownRealmName } from './realmName';
import { PagesProvider } from './pageLinks';
import strings from './strings.en.json';
import { PhoneContext, RealmSwitcher } from './Switchers';

// One realm has an alias core keeps (as a rename would set it); every other id goes to core's own realmLabel.
const { ALIASED } = vi.hoisted(() => ({ ALIASED: '6b00000000000000000000aa' }));
vi.mock('@core', async (importOriginal) => {
  const core = await importOriginal<{ realmLabel: (id: string) => unknown } & Record<string, unknown>>();
  return { ...core, useCan: () => true, realmLabel: (id: string) => (id === ALIASED ? { kind: 'alias', text: 'Staging' } : core.realmLabel(id)) };
});

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: { [id]: id }, status: 'ready', nav: { group: 'main', order: 0 } }) as unknown as PageManifest;
const REALM = '6b00000000000000000000c3';
const UNLISTED = '6b00000000000000000000ff';
const ONE = '6a00000000000000000000a1';
const ALL = strings['top.realmAll'];
const THIS = strings['top.realmThis'];
const base: ShellData = {
  realms: [{ id: REALM, name: 'Lab', color: 'blue' }],
  realmId: REALM,
  computers: [{ id: ONE, name: 'box-one', running: true }],
  computerId: ONE,
  setRealm: () => undefined,
  setComputer: () => undefined,
} as unknown as ShellData;

function mount(ui: 'realm' | 'context', data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={() => undefined}>
      <PagesProvider pages={[pg('computers'), pg('realms')]}>
        <ShellDataProvider value={{ ...base, ...data }}>{ui === 'realm' ? <RealmSwitcher /> : <PhoneContext />}</ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
  return document.querySelector(`[data-hub-switch="${ui}"]`) as HTMLElement;
}

/** The words a trigger shows (its text spans, hidden marks left out). */
const shown = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[class*="triggerText"]')].map((n) => (n.textContent ?? '').trim());

afterEach(cleanup);

describe('shownRealmName: one rule for the shown realm', () => {
  const d = (realmId: string) => ({ ...base, realmId });
  it('All realms only for the all selection', () => {
    expect(shownRealmName(d('all'), ALL, THIS)).toBe(ALL);
  });
  it('a listed realm: its name', () => {
    expect(shownRealmName(d(REALM), ALL, THIS)).toBe('Lab');
  });
  it('an unlisted realm: the short id core keeps, never All realms or another realm', () => {
    expect(shownRealmName(d(UNLISTED), ALL, THIS)).toBe('6b00…00ff');
  });
  it('an unlisted realm with an alias core keeps: the alias', () => {
    expect(shownRealmName(d(ALIASED), ALL, THIS)).toBe('Staging');
  });
  it('a realm core has no name for: This realm', () => {
    expect(shownRealmName(d('global'), ALL, THIS)).toBe(THIS);
  });
});

describe('the triggers name an unlisted realm by that rule', () => {
  it('desktop realm trigger: the short id, not All realms', () => {
    const el = mount('realm', { realmId: UNLISTED });
    expect(shown(el)).toEqual(['6b00…00ff']);
    expect(el.textContent).not.toContain(ALL);
    expect(el).toHaveAccessibleName(`6b00…00ff ${strings['top.realm']}`);
  });

  it('desktop realm trigger: All realms for the all selection, a listed realm by its name', () => {
    expect(shown(mount('realm', { realmId: 'all' }))).toEqual([ALL]);
    cleanup();
    expect(shown(mount('realm'))).toEqual(['Lab']);
  });

  it('phone chip with no computer: the short id, not All realms', () => {
    const el = mount('context', { realmId: UNLISTED, computers: [], computerId: undefined });
    expect(shown(el)).toEqual(['6b00…00ff']);
    expect(el.textContent).not.toContain(ALL);
    expect(el).toHaveAccessibleName(`6b00…00ff ${strings['top.context']}`);
  });

  it('phone chip with no computer: All realms for the all selection, This realm for a realm core has no name for', () => {
    const none = { computers: [], computerId: undefined };
    const all = mount('context', { ...none, realmId: 'all' });
    expect(shown(all)).toEqual([ALL]);
    expect(all).toHaveAccessibleName(`${ALL} ${strings['top.context']}`);
    cleanup();
    const unnamed = mount('context', { ...none, realmId: 'global' });
    expect(shown(unnamed)).toEqual([THIS]);
    expect(unnamed.textContent).not.toContain(ALL);
    expect(unnamed).toHaveAccessibleName(`${THIS} ${strings['top.context']}`);
  });

  it('phone chip with a computer: the realm square alone, no realm name, whatever the realm', () => {
    for (const data of [{ realmId: UNLISTED }, { realms: [], realmId: UNLISTED }, { realmId: ALIASED }, { realmId: 'all' }, { realmId: 'global' }]) {
      const el = mount('context', data);
      expect(shown(el)).toEqual(['box-one']);
      expect(el).toHaveAccessibleName(`box-one ${strings['top.context']}`);
      cleanup();
    }
  });

  it('desktop trigger: an unlisted realm with an alias shows the alias', () => {
    const el = mount('realm', { realmId: ALIASED });
    expect(shown(el)).toEqual(['Staging']);
    expect(el).toHaveAccessibleName(`Staging ${strings['top.realm']}`);
  });

  it('phone chip with no computer: an unlisted realm with an alias shows the alias', () => {
    const el = mount('context', { realmId: ALIASED, computers: [], computerId: undefined });
    expect(shown(el)).toEqual(['Staging']);
    expect(el).toHaveAccessibleName(`Staging ${strings['top.context']}`);
  });
});
