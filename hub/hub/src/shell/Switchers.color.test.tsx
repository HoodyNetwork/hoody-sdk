// The computer's own colour as a square mark between the live dot and the
// flag, in the wide trigger, each menu row, the phone chip and the phone sheet rows. All computers and a computer the
// list does not hold show none; a value that is not a hex colour never reaches a style.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider, type ShellComputer, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { ComputerSwitcher, PhoneContext } from './Switchers';

// The real core (ComputerMark normalises through computerColor); only the account capability is fixed.
vi.mock('@core', async (orig) => ({ ...(await orig<typeof CoreMod>()), useCan: () => true }));

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const R1 = '6a00000000000000000000c1';
const WEB: ShellComputer = { id: 'c1', name: 'web-prod-1', running: true, flag: '🇸🇬', color: '#E5484D' };
const DB: ShellComputer = { id: 'c2', name: 'db-1', running: false, flag: '🇩🇪', color: '#3E63DD' };
const PLAIN: ShellComputer = { id: 'c3', name: 'plain', running: true };

function mount(node: ReactNode, data: Partial<ShellData> = {}) {
  render(
    <RouterProvider navigate={vi.fn()}>
      <PagesProvider pages={[pg('computers')]}>
        <ShellDataProvider value={{ realms: [{ id: R1, name: 'Personal' }], realmId: R1, computers: [WEB, DB, PLAIN], computerId: 'c1', clearComputer: vi.fn(), setComputer: vi.fn(), ...data } as ShellData}>
          {node}
        </ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const marks = (el: Element) => Array.from(el.querySelectorAll('[data-computer-color]'));
const colorOf = (el: Element) => marks(el).map((m) => m.getAttribute('data-computer-color'));
const trigger = () => screen.getByRole('button', { name: / Computer$/ });
const chip = () => screen.getByRole('button', { name: / Realm and computer$/ });
// What a row or trigger draws, in order, from its own children: the live dot, the mark, the flag, the computer's name.
const NAMES = [WEB, DB, PLAIN].map((c) => c.name);
const orderOf = (el: Element) =>
  Array.from(el.children).flatMap((k) => {
    if (k.hasAttribute('data-computer-color')) return [`mark ${k.getAttribute('data-computer-color')}`];
    if (/live/.test(k.className)) return ['live'];
    if (/flag/.test(k.className)) return [`flag ${k.textContent}`];
    const name = NAMES.find((n) => k.textContent?.startsWith(n));
    return name ? [`name ${name}`] : [];
  });

describe('the computer colour in the top bar', () => {
  it('wide trigger: the shown computer\'s mark sits between the live dot and the flag, decorative', () => {
    mount(<ComputerSwitcher />);
    const [mark] = marks(trigger());
    expect(colorOf(trigger())).toEqual(['#E5484D']);
    expect(mark!.getAttribute('aria-hidden')).toBe('true');
    expect((mark as HTMLElement).style.getPropertyValue('--computer')).toBe('#E5484D');
    // Order: live dot, mark, flag, name.
    expect(mark!.previousElementSibling?.className).toMatch(/live/);
    expect(mark!.nextElementSibling?.textContent).toBe('🇸🇬');
    // The name stays the accessible name; the mark adds nothing to it.
    expect(trigger()).toHaveAccessibleName(/^web-prod-1 Computer$/);
  });

  it('wide trigger and phone chip show the SELECTED computer\'s mark, in order, not the first one\'s', () => {
    mount(<ComputerSwitcher />, { computerId: 'c2' });
    expect(orderOf(trigger())).toEqual(['live', 'mark #3E63DD', 'flag 🇩🇪', 'name db-1']);
    cleanup();
    mount(<PhoneContext />, { computerId: 'c2' });
    expect(orderOf(chip())).toEqual(['live', 'mark #3E63DD', 'flag 🇩🇪', 'name db-1']);
  });

  it('menu rows: each computer with a colour shows its own mark; one without shows none', async () => {
    mount(<ComputerSwitcher />);
    await press(trigger());
    const items = Array.from(document.querySelectorAll('[role="menu"] [role^="menuitem"]'));
    const row = (name: string) => items.find((m) => m.textContent?.includes(name))!;
    expect(colorOf(row('web-prod-1'))).toEqual(['#E5484D']);
    expect(colorOf(row('db-1'))).toEqual(['#3E63DD']);
    expect(colorOf(row('plain'))).toEqual([]);
    // Order in each row: live dot, mark, flag, name.
    expect(orderOf(row('web-prod-1'))).toEqual(['live', 'mark #E5484D', 'flag 🇸🇬', 'name web-prod-1']);
    expect(orderOf(row('db-1'))).toEqual(['live', 'mark #3E63DD', 'flag 🇩🇪', 'name db-1']);
    expect(orderOf(row('plain'))).toEqual(['live', 'flag ', 'name plain']);
  });

  it('All computers and a computer the list does not hold: no mark on the trigger', () => {
    mount(<ComputerSwitcher />, { computerId: undefined });
    expect(marks(trigger())).toHaveLength(0);
    cleanup();
    mount(<ComputerSwitcher />, { computerId: 'gone' });
    expect(marks(trigger())).toHaveLength(0);
  });

  it('phone chip and its sheet rows show the marks', async () => {
    mount(<PhoneContext />);
    expect(colorOf(chip())).toEqual(['#E5484D']);
    expect(orderOf(chip())).toEqual(['live', 'mark #E5484D', 'flag 🇸🇬', 'name web-prod-1']);
    await press(chip());
    const list = screen.getByRole('heading', { name: 'Computer' }).nextElementSibling as HTMLElement;
    const rows = Array.from(list.querySelectorAll('li'));
    const byName = (n: string) => rows.find((li) => li.textContent?.includes(n))!;
    expect(colorOf(byName('web-prod-1'))).toEqual(['#E5484D']);
    expect(colorOf(byName('db-1'))).toEqual(['#3E63DD']);
    expect(colorOf(byName('plain'))).toEqual([]);
    const button = (n: string) => byName(n).querySelector('button')!;
    expect(orderOf(button('web-prod-1'))).toEqual(['live', 'mark #E5484D', 'flag 🇸🇬', 'name web-prod-1']);
    expect(orderOf(button('db-1'))).toEqual(['live', 'mark #3E63DD', 'flag 🇩🇪', 'name db-1']);
    expect(orderOf(button('plain'))).toEqual(['live', 'flag ', 'name plain']);
  });

  it('phone chip: no mark for All computers, a computer the list does not hold, or one without a colour', () => {
    for (const computerId of [undefined, 'gone', 'c3']) {
      mount(<PhoneContext />, { computerId });
      expect(marks(chip())).toHaveLength(0);
      cleanup();
    }
  });

  it('a value that is not a hex colour, even handed straight to the shell, draws nothing', async () => {
    const bad: ShellComputer = { ...WEB, color: 'red;background:url(x)' };
    mount(<ComputerSwitcher />, { computers: [bad] });
    expect(marks(trigger())).toHaveLength(0);
    expect(trigger().innerHTML).not.toContain('url(');
  });
});
