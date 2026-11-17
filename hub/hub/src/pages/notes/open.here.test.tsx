// Vitest: each Notes row's "..." menu offers Open here, which does what clicking the row does: the note opens beside
// the table (the same ?sel= as a row click), never a new tab. The open note's own menu does not offer it again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

afterEach(() => { vi.restoreAllMocks(); });

async function weeklyPlanRow() {
  const r = await renderPage(page);
  const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
  const row = await within(table).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
  return { r, row };
}
const sel = (r: Awaited<ReturnType<typeof renderPage>>) => new URLSearchParams(r.router.state.location.searchStr).get('sel');

describe('Notes: Open here in the row menu', () => {
  it('is the first entry of the row menu, before the new-tab Open note', async () => {
    const user = userEvent.setup();
    const { row } = await weeklyPlanRow();
    await user.click(within(row).getByRole('button', { name: 'Row actions' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items[0]).toHaveAccessibleName(strings['action.openHere']);
    expect(items[1]).toHaveAccessibleName(strings['action.openNote']);
  });

  it('opens the note beside the table exactly as a row click does, in this tab', async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    const clicked = await weeklyPlanRow();
    await user.click(within(clicked.row).getByText('Weekly plan'));
    await screen.findByRole('button', { name: strings['action.openNoteTab'] });
    const byClick = sel(clicked.r);
    expect(byClick).toBeTruthy();
    clicked.r.unmount();

    const pressed = await weeklyPlanRow();
    expect(sel(pressed.r)).toBeNull();
    await user.click(within(pressed.row).getByRole('button', { name: 'Row actions' }));
    await user.click(await screen.findByRole('menuitem', { name: strings['action.openHere'] }));
    expect(await screen.findByRole('button', { name: strings['action.openNoteTab'] })).toBeInTheDocument();
    expect(sel(pressed.r)).toBe(byClick);
    expect(opened).not.toHaveBeenCalled();
  });

  it('the open note\'s own menu does not offer Open here (or the new-tab Open note: its button does that)', async () => {
    const user = userEvent.setup();
    const { row } = await weeklyPlanRow();
    await user.click(within(row).getByText('Weekly plan'));
    const tab = await screen.findByRole('button', { name: strings['action.openNoteTab'] });
    const detail = tab.closest('section, aside, [role="dialog"], [role="region"]') as HTMLElement | null;
    expect(detail).not.toBeNull();
    const more = within(detail!).queryAllByRole('button', { name: /actions|more/i });
    expect(more.length).toBeGreaterThan(0);
    await user.click(more[0]!);
    const names = (await screen.findAllByRole('menuitem')).map((m) => m.textContent ?? '');
    expect(names).not.toContain(strings['action.openHere']);
    expect(names).not.toContain(strings['action.openNote']);
  });
});
