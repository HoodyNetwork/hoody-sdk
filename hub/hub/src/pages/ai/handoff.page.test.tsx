// Vitest, model picker: the AI page receives a model chooser's trip.
// `?connect=new&step=endpoint&handoff=<id>` opens Connect at the endpoint form with the band; a trip that is not this
// account's, realm's or computer's, or is unknown or expired, opens the page plainly and the param goes with a
// replace; Go back records "left" when nothing happened and returns to the origin with the trip id.
import { capture, chooseComputer, fixtureWorld, handoff, type Handoff } from '@core';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness to mount the page again under StrictMode, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness to mount the page again under StrictMode, not page code
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { links } from './links';
import page from './page';
import type * as Connect from './parts/Connect';
import strings from './strings.en.json';

// The page's band, observed as it renders: the computer core shows at each render of it. A render while core shows
// another computer than the trip's is a frame where Go back would write to the wrong entry.
const bandAt: (string | undefined)[] = [];
vi.mock('./parts/Connect', async (orig) => {
  const real = await orig<typeof Connect>();
  return {
    ...real,
    TripBand: (props: Parameters<typeof real.TripBand>[0]) => {
      bandAt.push(capture().target?.container.id);
      return real.TripBand(props);
    },
  };
});
const tick = (ms: number) =>
  act(async () => {
    await new Promise((ok) => setTimeout(ok, ms));
  });

// The page's own chunk (its load(), import('./tab')) loads once per file before the first visit: renderPage does not
// wait for it, and its cold transform at host load outlives SLOW, which is about the page, not the import.
beforeAll(async () => {
  await import('./tab');
}, 120_000);

const SLOW = { timeout: 5000 };
const ID = '0123456789abcdef';
const BAND = /^Setting up for New Bot on atlas\.$/;

async function open() {
  const r = await renderPage(page, { path: '/ai/models' });
  await screen.findByText(strings['def.helper'], undefined, SLOW);
  const c = capture();
  const computer = c.target?.container.id ?? '';
  // A trip an earlier test left for this computer goes (session storage outlives a render).
  handoff.removeHandoff(computer);
  const trip = (over: Partial<Handoff> = {}): Handoff => ({
    v: 1,
    id: ID,
    at: Date.now(),
    scope: { account: String(c.account), realm: c.realm, computer: 'p|c', gen: c.gen, boot: 'b-1' },
    origin: { page: 'bots', href: '/bots?drawer=new', label: 'New Bot', focus: 'model' },
    target: { computer, name: 'atlas' },
    dest: 'endpoint',
    ...over,
  });
  const go = async (href: string) => {
    await act(async () => {
      await r.router.navigate({ href } as never);
    });
  };
  const search = () => r.router.state.location.search as Record<string, unknown>;
  return { r, computer, trip, go, search };
}

describe('the AI page on a model chooser trip', () => {
  it('opens the endpoint form with the band; connect and step go, the trip id stays', async () => {
    const p = await open();
    expect(handoff.writeHandoff(p.trip())).toBe(true);
    await p.go(links.handoff(ID, 'endpoint'));
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    expect(within(dialog).getByText(BAND)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(new RegExp(strings['ep.address']))).toBeInTheDocument();
    await waitFor(() => expect(p.search()).toEqual({ handoff: ID }), SLOW);
    // The page itself carries the band too (it stays when the drawer closes).
    expect(screen.getAllByText(BAND)).toHaveLength(2);
  });

  for (const [why, over] of [
    ['another account', (t: Handoff) => ({ scope: { ...t.scope, account: 'someone-else' } })],
    ['another realm', (t: Handoff) => ({ scope: { ...t.scope, realm: 'r-other' } })],
    ['expired', (t: Handoff) => ({ at: t.at - handoff.HANDOFF_TTL_MS - 1000 })],
  ] as const) {
    it(`a trip for ${why} opens the page plainly and the param goes`, async () => {
      const p = await open();
      const t = p.trip();
      expect(handoff.writeHandoff({ ...t, ...over(t) })).toBe(true);
      await p.go(`/ai?handoff=${ID}`);
      await waitFor(() => expect(p.search().handoff).toBeUndefined(), SLOW);
      expect(screen.queryByText(BAND)).toBeNull();
    });
  }

  it('an unknown trip id opens the page plainly; the endpoint form still opens', async () => {
    const p = await open();
    expect(handoff.writeHandoff(p.trip())).toBe(true);
    await p.go(links.handoff('ffffffffffffffff', 'endpoint'));
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    expect(within(dialog).getByLabelText(new RegExp(strings['ep.address']))).toBeInTheDocument();
    await waitFor(() => expect(p.search()).toEqual({}), SLOW);
    expect(screen.queryByText(BAND)).toBeNull();
  });

  it('Go back records "left" when nothing happened and returns to the origin with the trip id', async () => {
    const p = await open();
    expect(handoff.writeHandoff(p.trip({ dest: 'claude' }))).toBe(true);
    await p.go(links.handoff(ID, 'claude'));
    await screen.findByText(BAND, undefined, SLOW);
    await act(async () => {
      screen.getByRole('button', { name: strings['ho.back'] }).click();
    });
    await waitFor(() => expect(p.r.router.state.location.href).toBe(`/bots?drawer=new&handoff=${ID}`), SLOW);
    expect(handoff.readHandoff(p.computer, ID)?.result).toEqual({ status: 'left' });
  });

  it('Go back keeps a result already recorded', async () => {
    const p = await open();
    expect(handoff.writeHandoff(p.trip({ result: { status: 'created', provider: 'my-ep' } }))).toBe(true);
    await p.go(`/ai?handoff=${ID}`);
    await screen.findByText(BAND, undefined, SLOW);
    await act(async () => {
      screen.getByRole('button', { name: strings['ho.back'] }).click();
    });
    await waitFor(() => expect(p.r.router.state.location.pathname).toBe('/bots'), SLOW);
    expect(handoff.readHandoff(p.computer, ID)?.result).toEqual({ status: 'created', provider: 'my-ep' });
  });

  it('another computer chosen on the AI page ends the trip there: the band and the param go', async () => {
    const p = await open();
    expect(handoff.writeHandoff(p.trip())).toBe(true);
    await p.go(`/ai?handoff=${ID}`);
    await screen.findByText(BAND, undefined, SLOW);
    const other = fixtureWorld.computers.find((c) => c.id !== p.computer);
    expect(other, 'the fixture world has a second computer').toBeTruthy();
    bandAt.length = 0;
    await act(async () => {
      chooseComputer(other!);
    });
    await waitFor(() => expect(screen.queryByText(BAND)).toBeNull(), SLOW);
    await waitFor(() => expect(p.search().handoff).toBeUndefined(), SLOW);
    expect(bandAt.filter((c) => c !== p.computer), 'no frame shows the band once another computer is chosen').toEqual([]);
  });

  it('another computer chosen while it loads ends the trip for good: switching back before it loaded stays plain', async () => {
    const p = await open();
    p.r.unmount();
    // Reads held 2.5 s, so the other computer is still loading when the person switches back.
    const r = await renderPage(page, { path: '/ai/models', latency: 'slow' });
    await screen.findByText(strings['def.helper'], undefined, { timeout: 10000 });
    expect(handoff.writeHandoff(p.trip())).toBe(true);
    const search = () => r.router.state.location.search as Record<string, unknown>;
    await act(async () => {
      await r.router.navigate({ href: `/ai?handoff=${ID}` } as never);
    });
    await screen.findByText(BAND, undefined, SLOW);
    const home = fixtureWorld.computers.find((c) => c.id === p.computer)!;
    const other = fixtureWorld.computers.find((c) => c.id !== p.computer)!;
    await act(async () => {
      chooseComputer(other);
    });
    // The param goes at once, while the other computer is still loading.
    await waitFor(() => expect(search().handoff).toBeUndefined(), { timeout: 1500 });
    expect(screen.queryByText(BAND)).toBeNull();
    await act(async () => {
      chooseComputer(home);
    });
    await screen.findByText(strings['def.helper'], undefined, { timeout: 10000 });
    await tick(500);
    expect(screen.queryByText(BAND)).toBeNull();
    expect(search().handoff).toBeUndefined();
  }, 30000);

  it('a provider link with a trip that is not valid: both params go and the drawer opens at that provider', async () => {
    const p = await open();
    // Every URL the page goes to: a consumed connect must never come back (a stale drop would put it back, and a
    // reload would then open the drawer again).
    const seen: string[] = [];
    const stop = p.r.router.history.subscribe(() => seen.push(p.r.router.history.location.search));
    try {
      // Models & keys itself: an old /ai? link first moves here, which is one more URL carrying connect.
      await p.go(`${links.list}?connect=google&handoff=ffffffffffffffff`);
      await screen.findByRole('dialog', undefined, SLOW);
      await waitFor(() => expect(p.search()).toEqual({}), SLOW);
      await tick(300);
    } finally {
      stop();
    }
    expect(seen.filter((q) => q.includes('connect=')), 'connect shows only in the link itself').toHaveLength(1);
    expect(screen.queryByText(BAND)).toBeNull();
  });

  it('a page mounted again under StrictMode with its reads cached opens the endpoint form on a trip', async () => {
    const p = await open();
    expect(handoff.writeHandoff(p.trip())).toBe(true);
    // Leave the page, keep its cached reads, then mount it again straight on the trip URL with StrictMode's double effects.
    p.r.unmount();
    p.r.router.history.replace(links.handoff(ID, 'endpoint'));
    // The router reads the new URL now (nothing is mounted to follow the history; the race bounds a load that waits).
    await act(async () => {
      await Promise.race([p.r.router.load(), new Promise((ok) => setTimeout(ok, 3000))]);
    });
    render(
      <StrictMode>
        <QueryClientProvider client={p.r.queryClient}>
          <RouterProvider router={p.r.router} />
        </QueryClientProvider>
      </StrictMode>,
    );
    const dialog = await screen.findByRole('dialog', undefined, SLOW);
    expect(within(dialog).getByLabelText(new RegExp(strings['ep.address']))).toBeInTheDocument();
    expect(within(dialog).getByText(BAND)).toBeInTheDocument();
    await waitFor(() => expect(p.r.router.state.location.search).toEqual({ handoff: ID }), SLOW);
  });

  it('Go back still returns to the origin when the result cannot be stored', async () => {
    const p = await open();
    expect(handoff.writeHandoff(p.trip())).toBe(true);
    await p.go(`/ai?handoff=${ID}`);
    await screen.findByText(BAND, undefined, SLOW);
    // eslint-disable-next-line no-restricted-properties -- the test plays a browser refusing writes (as holds.test.tsx)
    const refuse = vi.spyOn(globalThis.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      await userEvent.click(screen.getByRole('button', { name: strings['ho.back'] }));
      await waitFor(() => expect(p.r.router.state.location.pathname).toBe('/bots'), SLOW);
      expect(refuse, 'the result write was tried and refused').toHaveBeenCalled();
    } finally {
      refuse.mockRestore();
    }
  });

  it('while the page first loads no band shows and the trip id stays; the band comes with the loaded page', async () => {
    const p = await open();
    p.r.unmount();
    // A fresh page straight on the trip URL, its reads held for 2.5 s (renderPage boots a fresh core, so the trip is
    // written once it runs): the trip waits for the page's own model, the param with it.
    const r = await renderPage(page, { path: `/ai?handoff=${ID}`, latency: 'slow' });
    expect(handoff.writeHandoff(p.trip())).toBe(true);
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 300));
    });
    expect(screen.queryByText(strings['def.helper']), 'still loading').toBeNull();
    expect(screen.queryByText(BAND)).toBeNull();
    expect((r.router.state.location.search as Record<string, unknown>).handoff).toBe(ID);
    await screen.findByText(strings['def.helper'], undefined, { timeout: 10000 });
    expect(await screen.findByText(BAND, undefined, SLOW)).toBeInTheDocument();
  }, 20000);

  it('links name the three trips', () => {
    expect(links.handoff(ID, 'endpoint')).toBe(`/ai?connect=new&step=endpoint&handoff=${ID}`);
    expect(links.handoff(ID, 'claude')).toBe(`/ai?section=claude&handoff=${ID}`);
    expect(links.handoff(ID, 'connect', 'openai')).toBe(`/ai?connect=openai&handoff=${ID}`);
  });
});
