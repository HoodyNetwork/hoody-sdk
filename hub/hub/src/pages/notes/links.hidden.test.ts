// Vitest: with the Computers page not served by this load, a note's row menu has no "Open computer".
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

vi.mock('@kit', async (orig: () => Promise<Record<string, unknown>>) => ({ ...(await orig()), usePageLink: () => null }));

describe('notes page with the Computers page hidden', () => {
  it('offers no Open computer in the row menu', async () => {
    await renderPage(page, {});
    const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    const row = await within(table).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await screen.findByRole('menuitem', { name: strings['action.openNote'] });
    expect(screen.queryByRole('menuitem', { name: strings['action.openComputer'] })).toBeNull();
  });
});
