// Vitest: a delivered reservation's "View computers on this server" (there is no classic Hub link): with
// Computers hidden in this load there is no button (it could go nowhere); served, it opens Computers on that server
// inside the Hub.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from '../page';
import strings from './strings.en.json';

const hidden = new Set<string>();
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return { ...kit, usePageLink: (id: string) => (hidden.has(id) ? null : kit.usePageLink(id)) };
});
afterEach(() => hidden.clear());

describe('View computers on this server', () => {
  it('Computers hidden: no button', async () => {
    hidden.add('computers');
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r03' });
    // The delivered section is drawn (its server fact), and it has no button.
    await screen.findByText(strings['res.detail.delivered'], {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: strings['res.viewServer'] })).toBeNull();
  });

  it('Computers served: the button opens Computers on that server inside the Hub', async () => {
    const { router } = await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r03' });
    await userEvent.click(await screen.findByRole('button', { name: strings['res.viewServer'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect((router.state.location.search as Record<string, unknown>).server).toBeTruthy();
  });
});
