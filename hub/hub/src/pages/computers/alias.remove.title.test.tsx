// The remove-alias drawer names the alias, never its id: once the list no longer holds the alias (a removal checked
// back, a read still loading) the title keeps the name it showed, or a plain "Remove" when it never knew one.
import { expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { queryClient } from '@core';
import { interpolate } from '@kit';
import type * as dataModule from './data';
import page from './page';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ hide: false, ids: [] as string[] }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useAliases: (id?: string) => {
      const q = real.useAliases(id);
      for (const a of q.data ?? []) if (!h.ids.includes(a.id)) h.ids.push(a.id);
      return h.hide ? { ...q, data: undefined } : q;
    },
  };
});

it('the list read gone while the drawer is open: the title keeps the name, never the id', async () => {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
  const table = await screen.findByRole('table', { name: strings['alias.title'] }, { timeout: 30000 });
  await waitFor(() => expect(within(table).getByText('shop')).toBeInTheDocument());
  const row = within(table).getByText('shop', { selector: 'td, td *' }).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: `${strings['alias.remove']}…` }));
  const title = interpolate(strings['aliasr.title'], { name: 'shop' });
  const d = await screen.findByRole('dialog', { name: title });
  // The list read goes (here: a refetch whose answer the hook no longer serves); the drawer redraws.
  await act(async () => { h.hide = true; await queryClient.invalidateQueries(); });
  await new Promise((r) => setTimeout(r, 300));
  expect(screen.getByRole('dialog', { name: title })).toBe(d);
  for (const id of h.ids) expect(d.querySelector('h2')?.textContent ?? '').not.toContain(id);
}, 40000);
