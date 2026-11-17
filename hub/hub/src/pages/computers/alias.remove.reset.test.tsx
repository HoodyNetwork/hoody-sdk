// The remove-alias drawer stays mounted between openings. A removal the API refused says so in that drawer; opening
// it again (for this alias or another) starts clean, never showing the earlier refusal as this alias's outcome.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import type * as dataModule from './data';
import page from './page';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ sends: 0 }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useRemoveAlias: () => ({ ...real.useRemoveAlias(), mutateAsync: async () => { h.sends += 1; return { outcome: 'failed', code: 'SERVER_ERROR' }; } }),
  };
});

const SEL = '/computers?sel=atlas.00a1';
const title = interpolate(strings['aliasr.title'], { name: 'shop' });
const rowOf = (table: HTMLElement, cell: string) => {
  const row = within(table).getByText(cell, { selector: 'td, td *' }).closest('tr');
  if (!row) throw new Error(`no row ${cell}`);
  return row as HTMLElement;
};

async function openRemove() {
  const table = await screen.findByRole('table', { name: strings['alias.title'] }, { timeout: 30000 });
  await waitFor(() => expect(within(table).getByText('shop')).toBeInTheDocument());
  await userEvent.click(within(rowOf(table, 'shop')).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: `${strings['alias.remove']}…` }));
  return screen.findByRole('dialog', { name: title });
}

describe('computers: remove alias starts clean on every opening', () => {
  it('a refused removal is not shown again when the drawer opens next', async () => {
    await renderPage(page, { path: `${SEL}&tab=ports` });
    const fresh = (await openRemove()).textContent;
    const d = screen.getByRole('dialog', { name: title });
    const go = within(d).getAllByRole('button', { name: strings['alias.remove'] }).at(-1)!;
    await userEvent.click(go);
    await waitFor(() => expect(h.sends).toBe(1));
    await waitFor(() => expect(screen.getByRole('dialog', { name: title }).textContent).not.toBe(fresh));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull());
    const again = await openRemove();
    expect(again.textContent).toBe(fresh);
  });
});
