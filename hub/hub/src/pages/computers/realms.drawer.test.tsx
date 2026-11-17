// The Realms drawer of a computer says what realms are and shows each one recognisably: its colour, how many
// computers it holds, and which one the top bar shows now; a running summary says how many realms the computer will
// show in. (Fixture world: atlas is in Personal, the realm the top bar shows.)
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { interpolate } from '@kit';
import { realmColor } from './logic';
import page from './page';
import strings from './strings.en.json';

const inRealm = (id: string) => fixtureWorld.computers.filter((c) => c.realm_ids.includes(id)).length;
const plural = (key: 'realmsd.count' | 'realmsd.summary', count: number) => interpolate(strings[`${key}_${count === 1 ? 'one' : 'other'}`], { count, name: 'atlas' });

async function openDrawer() {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
  await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'atlas') }, { timeout: 8000 }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.realms'] }));
  return screen.findByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) });
}
// A realm's row is the picker's checkbox: its dot, name and facts are inside it.
const rowOf = (d: HTMLElement, name: string) => within(d).getByRole('checkbox', { name: new RegExp(`^${name}`) });

describe('computers: the Realms drawer explains and shows each realm', () => {
  it('each realm has its colour, its computer count, and the realm shown now is marked', async () => {
    const d = await openDrawer();
    expect(d).toHaveTextContent(strings['realmsd.lede']);
    for (const r of fixtureWorld.realms) {
      const row = rowOf(d, r.name);
      expect(row.querySelector('[data-realm-color]')?.getAttribute('data-realm-color')).toBe(r.tint);
      expect(row).toHaveTextContent(plural('realmsd.count', inRealm(r.id)));
    }
    expect(rowOf(d, 'Personal')).toHaveTextContent(strings['realmsd.now']);
    expect(rowOf(d, 'Lab')).not.toHaveTextContent(strings['realmsd.now']);
  });

  it('a summary says how many realms the computer will show in, and follows the ticks', async () => {
    const d = await openDrawer();
    expect(d).toHaveTextContent(plural('realmsd.summary', 1));
    await userEvent.click(within(d).getByRole('checkbox', { name: /^Lab/ }));
    expect(d).toHaveTextContent(plural('realmsd.summary', 2));
    await userEvent.click(within(d).getByRole('checkbox', { name: /^Lab/ }));
    await userEvent.click(within(d).getByRole('checkbox', { name: /^Personal/ }));
    expect(d).toHaveTextContent(strings['realmsd.atLeastOne']);
  });

  it('a realm colour is used only when it is a palette name', () => {
    expect(realmColor('teal')).toBe('teal');
    for (const bad of ['', 'Teal ', 'blue), url(x)', 'var(--x)', 'magenta']) expect(realmColor(bad)).toBeNull();
  });
});
