// Every port of a program offers "Create alias" for exactly that port: it opens Computers' alias drawer
// (links.alias) for this computer and that port. The send, its lock and its held state are the drawer's own.
// It is an item of that port's row menu in the inspector's Ports table.
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { routes } from './data';
import { many } from './fixtures';
import page from './page';

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      // data.ts and fixtures.ts import '@core' themselves, so routes and many are read here, at boot.
      const one = { id: 77, name: 'solo', status: 'running', states_known: true, boot: false, autorestart: 'unexpected', hoody_kit: false, port_range: { start: 8080, end: 8080 }, instances: [{ port: 8080, status: 'running', uptime_s: 60 }] };
      const rule = real.reply(routes.overview, () => real.answers.ok({ ...many, programs: [...many.programs, one] }));
      return real.bootFixtureCore({ ...o, rules: [rule, ...(o.rules ?? [])] });
    },
  };
});

/** A port's row menu, opened: its Create alias item (or null). */
async function aliasItem(port: number): Promise<HTMLElement | null> {
  const row = await waitFor(() => {
    const r = screen.getAllByRole('row').find((x) => x.querySelector('td')?.textContent?.trim() === String(port));
    if (!r) throw new Error(`no Ports row for ${port}`);
    return r;
  });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  const item = within(await screen.findByRole('menu')).queryByRole('menuitem', { name: new RegExp(`^Create alias for port ${port}\\b`) });
  return item;
}

describe('Create alias for one port', () => {
  it('a one-port range: opens the alias drawer on Computers for this computer, port 8080', async () => {
    const { router } = await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A77' });
    await userEvent.click((await aliasItem(8080))!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    const q = router.state.location.search as Record<string, unknown>;
    expect(String(q.alias)).toBe('8080');
    expect(String(q.sel)).toMatch(/^[^.]+\.[0-9a-z]{4}$/i);
  });

  it('a single-port program: its one address offers it (port 3000)', async () => {
    const { router } = await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await aliasItem(3000))!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect(String((router.state.location.search as Record<string, unknown>).alias)).toBe('3000');
  });

  it('a wider range: each port its own (8001 opens 8001)', async () => {
    const { router } = await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A2' });
    for (const port of [8000, 8003]) {
      expect(await aliasItem(port)).not.toBeNull();
      await userEvent.keyboard('{Escape}');
    }
    await userEvent.click((await aliasItem(8001))!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect(String((router.state.location.search as Record<string, unknown>).alias)).toBe('8001');
  });
});
