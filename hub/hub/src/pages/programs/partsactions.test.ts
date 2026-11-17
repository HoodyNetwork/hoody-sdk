// A range program's per-port Stop in the inspector sends one stop of that port only (the Ports table keeps it in each
// row's Row actions menu at every width; partsactions.spec.ts shows them in a real layout). The request is read as the fixture API
// receives it: the stop route, program 2, port 8000, never the whole range.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { FixtureRequest } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { routes } from './data';
import { opsStore } from './parts/ops';
import page from './page';

// Every stop the fixture API receives, answered as the 'system-range' state answers it (a 5xx: not told).
const sent = vi.hoisted(() => ({ stops: [] as FixtureRequest[], other: [] as string[] }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      // data.ts imports '@core' itself, so its routes are read here, at boot (after both modules loaded).
      const record = real.reply(routes.stop, (req) => {
        sent.stops.push(req);
        return real.answers.pending5xx();
      });
      const others = [routes.start, routes.restart].map((x) =>
        real.reply(x, (req) => {
          sent.other.push(req.route.id);
          return real.answers.pending5xx();
        }),
      );
      return real.bootFixtureCore({ ...o, rules: [record, ...others, ...(o.rules ?? [])] });
    },
  };
});

describe('the inspector Ports table sends a single port', () => {
  beforeEach(() => {
    opsStore.reset();
    sent.stops.length = 0;
    sent.other.length = 0;
  });

  it('Stop port 8000 of api sends one stop of program 2, port 8000', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A2' });
    const ports = await screen.findByRole('table', { name: 'Ports of api' });
    const row = within(ports).getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.trim() === '8000') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Stop port 8000 of api' }));
    await waitFor(() => expect(sent.stops).toHaveLength(1));
    const req = sent.stops[0] as FixtureRequest;
    expect({ method: req.method, path: req.path, query: req.query, body: req.body }).toEqual({
      method: 'POST',
      path: '/api/v1/daemon/programs/2/stop',
      query: {},
      body: { port: 8000 },
    });
    expect(sent.other).toEqual([]);
  });
});
