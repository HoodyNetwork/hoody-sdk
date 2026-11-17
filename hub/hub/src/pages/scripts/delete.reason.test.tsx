// Vitest: a script row's Delete, off on a computer that runs an older Scripts program, says why in the menu (the kit's
// disabled-reason line), so the reason is there even when the list has one computer and no group note.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

describe('the scripts row menu: Delete on an older Scripts program', () => {
  it('is disabled with its reason', async () => {
    await renderPage(page);
    const tbl = await screen.findByRole('table', { name: strings.title }, { timeout: 20000 });
    await within(tbl).findAllByRole('row', { name: /Weather lookup/ }, { timeout: 20000 });
    const del = new RegExp(`^${strings['menu.delete'].replace('…', '')}`);
    let seen = 0;
    for (const b of within(tbl).getAllByRole('button', { name: 'Row actions' })) {
      await userEvent.click(b);
      const menu = await screen.findByRole('menu');
      const item = within(menu).getByRole('menuitem', { name: del });
      if (item.getAttribute('aria-disabled') === 'true') {
        expect(item).toHaveAccessibleDescription(strings['group.problem.old']);
        seen++;
        break;
      }
      await userEvent.keyboard('{Escape}');
    }
    expect(seen).toBeGreaterThan(0);
  }, 60000);

  it('stays enabled, with no old-program reason, on a current Scripts program', async () => {
    await renderPage(page);
    const tbl = await screen.findByRole('table', { name: strings.title }, { timeout: 20000 });
    await within(tbl).findAllByRole('row', { name: /Weather lookup/ }, { timeout: 20000 });
    const del = new RegExp(`^${strings['menu.delete'].replace('…', '')}`);
    let seen = 0;
    for (const b of within(tbl).getAllByRole('button', { name: 'Row actions' })) {
      await userEvent.click(b);
      const menu = await screen.findByRole('menu');
      const item = within(menu).getByRole('menuitem', { name: del });
      if (item.getAttribute('aria-disabled') !== 'true') {
        expect(item).not.toHaveAccessibleDescription(strings['group.problem.old']);
        seen++;
        break;
      }
      await userEvent.keyboard('{Escape}');
    }
    expect(seen).toBeGreaterThan(0);
  }, 60000);
});
