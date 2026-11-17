// Vitest: a row's Restart promises a new access code only to an app that asks for one. A terminal app such as htop
// has no code: its menu entry is plain Restart. JupyterLab asks for a code: its entry says Restart gets a new one.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { harness as page } from './launch/harness';
import strings from './strings.en.json';

// The page opens on its Opened list when a launch is chosen in the address (htop b2c3d4, JupyterLab a1b2c3).
async function menuOf(name: RegExp, key: string) {
  await renderPage(page, { path: `/apps?appsel=${key}` });
  const table = await screen.findByRole('table', { name: strings['tab.open'] });
  const row = await within(table).findByRole('row', { name });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
}

describe('apps: the Restart entry of a row menu', () => {
  it('an app without a code: plain Restart, no promise of a code', async () => {
    const menu = await menuOf(/htop/, 'b2c3d4');
    expect(within(menu).getByRole('menuitem', { name: strings['menu.restart'] })).toBeTruthy();
    expect(within(menu).queryByRole('menuitem', { name: strings['act.restart'] })).toBeNull();
  });

  it('an app that asks for a code: Restart to get a new code', async () => {
    const menu = await menuOf(/JupyterLab/, 'a1b2c3');
    expect(within(menu).getByRole('menuitem', { name: strings['act.restart'] })).toBeTruthy();
    expect(within(menu).queryByRole('menuitem', { name: strings['menu.restart'] })).toBeNull();
  });
});
