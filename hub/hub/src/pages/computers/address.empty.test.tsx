// An alias the API answers without a url (data.ts maps it to '') shows a dash, not an address field with an empty Copy
// and an Open of about:blank.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import type * as dataModule from './data';
import page from './page';
import strings from './strings.en.json';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useAliases: (id: string | undefined) => {
      const q = real.useAliases(id);
      return { ...q, data: id ? [{ id: 'al0', name: 'blank', port: 3000, url: '', createdAt: '2026-10-20T10:00:00Z' }] : undefined };
    },
  };
});

describe('computers: an alias with no url', () => {
  it('shows a dash in the address cell and no address buttons', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
    const aliases = await screen.findByRole('table', { name: strings['alias.title'] }, { timeout: 8000 });
    const name = await within(aliases).findByText('blank');
    const row = name.closest('tr');
    if (!row) throw new Error('no row');
    await waitFor(() => expect(within(row).getByText('—')).toBeInTheDocument());
    expect(within(row).queryByRole('button', { name: `Copy ${strings['ports.col.address']}` })).toBeNull();
    expect(within(row).queryByRole('button', { name: `Open ${strings['ports.col.address']} in a new tab` })).toBeNull();
  });
});
