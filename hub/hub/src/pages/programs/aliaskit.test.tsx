// A system (Hoody Kit) program never offers Create alias on its addresses. An alias
// would look private while the program's address still shows which computer it runs on. One quiet line says why;
// the person's own programs keep the offer.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';

const NOTE = 'No alias for system programs: their address still shows which computer they run on.';
/** Every Create alias offer: inline in a Ports row or in its Row actions menu (opened here, one row at a time). */
async function aliasOffers(): Promise<string[]> {
  const table = await screen.findByRole('table', { name: /^Ports of / });
  const names: string[] = [];
  for (const row of within(table).getAllByRole('row').filter((r) => r.querySelector('td'))) {
    names.push(...within(row).queryAllByRole('button', { name: /^Create alias/ }).map((b) => b.getAttribute('aria-label') ?? b.textContent ?? ''));
    const more = within(row).queryByRole('button', { name: 'Row actions' });
    if (!more) continue;
    await userEvent.click(more);
    const menu = await screen.findByRole('menu');
    // A menu item that opens something ends in its ellipsis ("Create alias for port 3000…"); the name is without it.
    names.push(...within(menu).queryAllByRole('menuitem').map((m) => (m.textContent ?? '').replace(/…$/, '')).filter((x) => x.startsWith('Create alias')));
    await userEvent.keyboard('{Escape}');
  }
  return names;
}

describe('Create alias is not offered on system programs', () => {
  it('a single-port system program (hoody-agent, port 15000): the address shows, no Create alias, the quiet line', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A100' });
    expect(await screen.findByText(NOTE)).toBeInTheDocument();
    expect(await aliasOffers()).toEqual([]);
    // The address itself stays: its Copy and Open still belong to the program.
    expect(screen.getAllByText(/15000/).length).toBeGreaterThan(0);
  });

  it('a system program with a port range (hoody-pool 16000-16002): no port offers it, the panel says why once', async () => {
    await renderPage(page, { state: 'system-range', path: '/programs?sel=prog%3A130' });
    const panel = (await screen.findByRole('heading', { name: 'Ports' })).closest('section') ?? document.body;
    expect(within(panel as HTMLElement).getByText(NOTE)).toBeInTheDocument();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(await aliasOffers()).toEqual([]);
  });

  it('the person\'s own program keeps the offer and shows no such line (web, port 3000)', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    expect(await aliasOffers()).toEqual(['Create alias for port 3000']);
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
