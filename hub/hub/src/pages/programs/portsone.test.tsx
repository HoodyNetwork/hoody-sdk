// Item 100: a port range of one port reads as that port ("8080"), never "8080-8080", in the list's PORTS column and
// the inspector's Ports table; the inspector still gives that port its address (its row's expanded part).
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { routes } from './data';
import { many } from './fixtures';
import { rangeText } from './logic';
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

describe('a one-port range', () => {
  it('reads as its port; a wider range keeps both ends', () => {
    expect(rangeText({ start: 8080, end: 8080 })).toBe('8080');
    expect(rangeText({ start: 8000, end: 8003 })).toBe('8000-8003');
  });

  it('shows 8080 in the list and the inspector, with its address', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A77' });
    const hits = await screen.findAllByText('solo');
    const row = hits.map((n) => n.closest('tr')).find(Boolean) as HTMLElement;
    expect(row.textContent).not.toContain('8080-8080');
    expect(within(row).getByText(/^8080( ·|$)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('8080-8080');
    // Its address: the Ports table's one row, whose expanded part holds the kit AddressField's copy and open actions.
    const table = await screen.findByRole('table', { name: 'Ports of solo' });
    const portRow = within(table).getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.trim() === '8080') as HTMLElement;
    expect(within(table).getAllByRole('row').filter((r) => r.querySelector('td'))).toHaveLength(1);
    await userEvent.click(within(portRow).getByRole('button', { name: 'Show details' }));
    expect(await screen.findByRole('button', { name: 'Copy port 8080' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open port 8080 in a new tab' })).toBeInTheDocument();
  });
});
