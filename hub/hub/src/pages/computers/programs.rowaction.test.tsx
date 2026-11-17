// The Programs tab's rows open nothing (each program's actions are in its row menu), so they must not look
// like they open: no pointer and no data-row-opens (DataTable onRowAction={false}), and a click changes nothing.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const PATH = '/computers?sel=atlas.00a1&tab=programs';

describe('computers: Programs tab rows', () => {
  it('have no open affordance, and a click leaves the page where it was', async () => {
    const r = await renderPage(page, { path: PATH });
    const table = await screen.findByRole('table', { name: strings['prog.title'] }, { timeout: 8000 });
    const row = await within(table).findByRole('row', { name: /^web/ });
    expect(row).not.toHaveAttribute('data-row-opens');
    expect(row.className).not.toMatch(/clickable/);
    const before = r.router.state.location.href;
    await userEvent.click(within(row).getAllByRole('cell')[0]!);
    expect(r.router.state.location.href).toBe(before);
  });
});
