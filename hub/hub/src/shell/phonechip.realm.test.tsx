// A design exception: with a computer
// the phone context chip shows the realm as its square alone and the computer's name; the realm's name is in the sheet.
// With no computer the chip names the realm, by the top bar's one rule (shownRealmName).
import { cleanup, render } from '@testing-library/react';
import { RouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import strings from './strings.en.json';
import { PhoneContext } from './Switchers';

vi.mock('@core', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useCan: () => true }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: { [id]: id }, status: 'ready', nav: { group: 'main', order: 0 } }) as unknown as PageManifest;
const REALM = '6b00000000000000000000c3';
const ONE = '6a00000000000000000000a1';
const base: ShellData = {
  realms: [{ id: REALM, name: 'Lab', color: 'blue' }],
  realmId: REALM,
  computers: [{ id: ONE, name: 'box-one', running: true, color: '#3B82F6' }],
  computerId: ONE,
  setRealm: () => undefined,
  setComputer: () => undefined,
} as unknown as ShellData;

function mount(data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={() => undefined}>
      <PagesProvider pages={[pg('computers'), pg('realms')]}>
        <ShellDataProvider value={{ ...base, ...data }}>
          <PhoneContext />
        </ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
  return document.querySelector('[data-hub-switch="context"]') as HTMLElement;
}

/** The words the chip shows, in order (what a sighted person reads; hidden marks left out). */
function shown(el: HTMLElement): string[] {
  return [...el.querySelectorAll<HTMLElement>('[class*="triggerText"]')].map((n) => (n.textContent ?? '').trim());
}

afterEach(cleanup);

describe('phone context chip: the realm square with the computer, the realm named only without one', () => {
  it('with a computer: the square, no realm name, the computer alone in the words and the name', () => {
    const chip = mount();
    expect(shown(chip)).toEqual(['box-one']);
    expect(chip.querySelector('[class*="realmDot"]')).not.toBeNull();
    expect(chip.querySelector('[class*="phoneRealm"]')).toBeNull();
    expect(chip.textContent).not.toContain('Lab');
    expect(chip).toHaveAccessibleName(`box-one ${strings['top.context']}`);
  });

  it('All realms or an unlisted realm with a computer: still the computer alone', () => {
    for (const realmId of ['all', '6b00000000000000000000ff', 'global']) {
      const chip = mount({ realmId });
      expect(shown(chip)).toEqual(['box-one']);
      expect(chip).toHaveAccessibleName(`box-one ${strings['top.context']}`);
      cleanup();
    }
  });

  it('while switching: the computer, then where it is going', () => {
    const chip = mount({ switchingTo: 'all' } as Partial<ShellData>);
    expect(shown(chip)).toEqual(['box-one']);
    expect(chip).toHaveAccessibleName(`box-one ${strings['top.contextSwitching'].replace('{{realm}}', strings['top.realmAll'])}`);
  });

  it('while switching to an unnamed realm: the computer, then the unnamed switching words', () => {
    const chip = mount({ switchingTo: '6b00000000000000000000ff' } as Partial<ShellData>);
    expect(chip).toHaveAccessibleName(`box-one ${strings['top.contextSwitchingUnnamed']}`);
  });

  it('no computer: the realm, once', () => {
    const chip = mount({ computers: [], computerId: undefined });
    expect(shown(chip)).toEqual(['Lab']);
    expect(chip).toHaveAccessibleName(`Lab ${strings['top.context']}`);
  });

  it('no realm listed and All realms: the computer alone', () => {
    const chip = mount({ realms: [], realmId: 'all' });
    expect(shown(chip)).toEqual(['box-one']);
    expect(chip).toHaveAccessibleName(`box-one ${strings['top.context']}`);
  });
});
