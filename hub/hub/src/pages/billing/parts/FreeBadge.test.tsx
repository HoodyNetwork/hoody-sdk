// The Free badge on a live page: the real core over a fake fetch, the real router. It shows only on a fresh, whole
// answer where every server is free; pressing it opens the offers; it reads and changes nothing but GETs.
/* eslint-disable no-restricted-globals -- the test plays core's retained purchases: the browser storage they live in */
// eslint-disable-next-line no-restricted-imports -- a test harness for the badge, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the badge, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, commerce } from '@core';
import { Icon } from '@kit';
import { queryClient } from '@core/query';
import { UID, boot, calls, onFetch, settle } from '@core/test/env';
import strings from '../strings.en.json';
import { FreeBadge } from './FreeBadge';
import { notifyUnknown } from '../data';
import { freeBadgeStateForTests, resetFreeBadgeForTests, useFreeVerdict, usePurchaseActivity } from './FreeBadge.data';

// A token session's reach is the pinned realm's: 'account' is never part of its access (core/token.ts capsAllow).
const session = { account: true };
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const realCan = real.useCan as (cap: string) => boolean;
  const useCan = (cap: string): boolean => {
    const held = realCan(cap);
    return cap === 'account' ? session.account : held;
  };
  return { ...real, useCan };
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};
const free = { id: 'a'.repeat(24), is_free_tier: true, status: 'active' };
const rented = { id: 'b'.repeat(24), is_free_tier: false, status: 'active' };
const serve = (rows: unknown[], subs: unknown[] = [], o: { subsTotal?: number; fail?: 'servers' | 'subs' } = {}) =>
  onFetch((c) => {
    const isSubs = c.url.includes('/subserver-subscriptions');
    if (o.fail === (isSubs ? 'subs' : 'servers')) return { status: 500, body: { message: 'down' } };
    return isSubs
      ? { status: 200, body: { data: subs, total: o.subsTotal ?? subs.length, limit: 200, offset: 0 } }
      : { status: 200, body: { data: rows } };
  });

let router: { state: { location: { pathname: string; hash: string; search: unknown } } };
// A stand-in for billing's checkout: it reports a purchase in flight while `buying.on` is true.
const buying = { on: false };
// Every verdict the badge's hook computed, one per render.
const verdicts: string[] = [];
function Probe() {
  verdicts.push(useFreeVerdict());
  return null;
}
function Page() {
  const [, tick] = useState(0);
  usePurchaseActivity(buying.on);
  return (
    <>
      <Probe />
      <button onClick={() => tick((n) => n + 1)}>{'refresh'}</button>
      <FreeBadge />
    </>
  );
}
const mount = async () => {
  const r = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/computers'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={r} />
      </QueryClientProvider>,
    );
    await r.load();
    router = r;
  });
  await act(flush);
};

beforeEach(() => {
  localStorage.clear();
  boot();
  queryClient.clear();
  session.account = true;
  buying.on = false;
  verdicts.length = 0;
  resetFreeBadgeForTests();
});

describe('Free badge', () => {
  it('shows when every server is a free one, from two user-wide GETs and nothing else', async () => {
    serve([free, { ...free, id: 'c'.repeat(24) }]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls.map((c) => c.url.split('?')[0]?.replace(/^.*\/api\/v1/, '')).sort()).toEqual(['/servers', '/subserver-subscriptions']);
  });

  it("draws the plan's mark, the seedling, before the plan's name; the mark is decoration and the name stays the whole name", async () => {
    serve([free]);
    await mount();
    const badge = await screen.findByRole('button', { name: strings['free.badge'] });
    const mark = badge.querySelector('svg');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    const seedling = render(<Icon name="sprout" />).container.querySelector('path')?.getAttribute('d');
    expect(seedling).toBeTruthy();
    expect(mark?.querySelector('path')?.getAttribute('d')).toBe(seedling);
    // The mark first, then the words (the button's only text).
    expect(badge.firstElementChild).toBe(mark);
    expect(badge).toHaveTextContent(new RegExp(`^${strings['free.badge']}$`));
    expect(badge).toHaveAccessibleName(strings['free.badge']);
  });

  it('hides when a rented server is among them', async () => {
    serve([free, rented]);
    await mount();
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
  });

  it('hides for a paid subscription that GET /servers does not list', async () => {
    serve([free], [{ id: 's', state: 'active' }]);
    await mount();
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
  });

  it('hides when either list cannot be read, or the subscriptions are cut short', async () => {
    for (const o of [{ fail: 'servers' as const }, { fail: 'subs' as const }, { subsTotal: 500 }]) {
      queryClient.clear();
      serve([free], [], o);
      await mount();
      expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
      document.body.innerHTML = '';
    }
  });

  it('goes away when a refresh fails after it showed (older data is not a fresh answer)', async () => {
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    serve([free], [], { fail: 'servers' });
    await act(async () => {
      await queryClient.refetchQueries();
      await flush();
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull());
  });

  it('goes away when a server is rented, on the next read', async () => {
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    serve([free, rented]);
    await act(async () => {
      await queryClient.refetchQueries();
      await flush();
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull());
  });

  it('opens the offers, and See plans goes to the plans in billing', async () => {
    serve([free]);
    await mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['free.badge'] }));
    expect(await screen.findByText(strings['free.title'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['free.market'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['free.plans'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/billing'));
    // `why` is read by no view (live dropped it from plansFor), so See plans sends the Plans view alone.
    expect(router.state.location.search).toEqual({ view: 'plans' });
    // ...landing on #plans, so focus moves to the plans heading.
    expect(router.state.location.hash).toBe('plans');
  });

  it('Browse servers goes to the market', async () => {
    serve([free]);
    await mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['free.badge'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['free.market'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/market'));
  });

  it('stays off and reads nothing in a token session, which sees only its pinned realm', async () => {
    session.account = false;
    serve([free]);
    await mount();
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    expect(calls.length).toBe(0);
  });

  it('re-reads when the window is focused again, and shows the change', async () => {
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    serve([free, rented]);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flush();
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull());
  });

  it('hides while a purchase of this browser is out, and returns only on a read made after it ended', async () => {
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    // The purchase is out; the reads that finish meanwhile (still before it commits) must not bring the badge back.
    buying.on = true;
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await act(flush);
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    await act(async () => {
      await queryClient.refetchQueries();
      await flush();
    });
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    // It ended: the account now holds a paid server, and the read after it says so.
    serve([free, rented]);
    buying.on = false;
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await act(flush);
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    // And when nothing was bought, the same read brings it back.
    serve([free]);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flush();
    });
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
  });

  it('does not show retained answers while the reads after the window was focused are still out', async () => {
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    onFetch(() => new Promise(() => undefined));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flush();
    });
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
  });

  it('does not count answers older than the freshness window, however nothing else moved', async () => {
    // The badge's 30 s clock tick, caught so the test can fire it after time has passed.
    const ticks: Array<() => void> = [];
    const real = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === 30_000) ticks.push(fn);
      return real(fn, ms, ...(rest as []));
    }) as typeof setInterval);
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    expect(ticks.length).toBeGreaterThan(0);
    const now = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => now() + 10 * 60_000);
    try {
      await act(async () => {
        ticks.forEach((t) => t());
        await flush();
      });
      expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('does not count a read made before a purchase ended, even a first read still out when it did', async () => {
    const held: Array<() => void> = [];
    onFetch(
      (c) =>
        new Promise((res) => {
          held.push(() => res(c.url.includes('/subserver-subscriptions') ? { status: 200, body: { data: [], total: 0, limit: 200, offset: 0 } } : { status: 200, body: { data: [free] } }));
        }),
    );
    await mount();
    const first = calls.length;
    buying.on = true;
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await act(flush);
    buying.on = false;
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await act(flush);
    // The purchase ended: the badge asks again (new requests), instead of taking the first ones' answers.
    expect(calls.length).toBeGreaterThan(first);
    await act(async () => {
      held.splice(0, first).forEach((f) => f());
      await flush();
    });
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
  });

  it('two cutoffs in one millisecond are still two', async () => {
    serve([free]);
    await mount();
    vi.spyOn(Date, 'now').mockReturnValue(5_000_000_000_000);
    try {
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await flush();
      });
      const one = freeBadgeStateForTests().cutoff;
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await flush();
      });
      expect(freeBadgeStateForTests().cutoff).toBeGreaterThan(one);
      // The reads after it, answered in that same millisecond, are current: free-only still shows.
      expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('is not held back by a clock set back after a cutoff', async () => {
    serve([free]);
    await mount();
    // A cutoff made at the real time first, then the clock goes back an hour.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flush();
    });
    const real = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => real() - 3_600_000);
    try {
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await flush();
      });
      expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// A purchase that is still retained by core (its checkout may be closed, or it is read back outside any checkout) keeps
// the badge off; it returns only on a read after the purchase was cleared.
describe('Free badge with a retained purchase', () => {
  const at = Date.now();
  const stored = {
    buy: ['hub_money_pending', [{ kind: 'buy', user_id: UID, key: 'k'.repeat(20), max_charge_cents: 1200, at, title: 't', family_id: 'c'.repeat(24), plan_id: 'plan1' }]],
    pay: ['hub_money_pending', [{ kind: 'pay', user_id: UID, key: 'k'.repeat(20), max_charge_cents: 1200, at, title: 't', sub_id: 's' }]],
    upgrade: ['hub_money_upgrade', [{ kind: 'upgrade', user_id: UID, key: 'u'.repeat(20), max_charge_cents: 1, at, sub_id: 's', plan_id: 'p2' }]],
    reserve: ['hub_market_pending', [{ user_id: UID, offer_id: 'o', days: '30', ceiling: 5, key: 'm'.repeat(20), at }]],
    rent: ['hub.v3.rent_pending', [{ user_id: UID, server_id: 'srv', name: 'x', days: '30', at, dismissed: false, sending: false, attempt: 'a'.repeat(20) }]],
  } as const;

  for (const [name, [key, rows]] of Object.entries(stored)) {
    it(`stays off while a ${name} is retained, and returns after it was cleared and the lists were read again`, async () => {
      localStorage.setItem(key, JSON.stringify(rows));
      serve([free]);
      await mount();
      expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
      // The purchase committed while it was retained; clearing it must bring a new read, not the older answers.
      serve([free], [{ id: 's', state: 'active' }]);
      localStorage.removeItem(key);
      const before = calls.length;
      await act(async () => {
        notifyUnknown(); // billing's own notice that a retained purchase changed
        await flush();
      });
      expect(calls.length).toBeGreaterThan(before);
      expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
      // Nothing was bought after all: the next read brings it back.
      serve([free]);
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await flush();
      });
      expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    });
  }

  it('never computes free in the render that sees the purchase cleared, before the re-read is asked for', async () => {
    localStorage.setItem(stored.buy[0], JSON.stringify(stored.buy[1]));
    serve([free]);
    await mount();
    // The retained purchase goes (no notice reaches the badge); the next render is only an ordinary one.
    serve([free], [{ id: 's', state: 'active' }]);
    localStorage.removeItem(stored.buy[0]);
    verdicts.length = 0;
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await act(flush);
    expect(verdicts.length).toBeGreaterThan(0);
    expect(verdicts).not.toContain('free');
  });

  it('hears another tab buying and clearing between two looks (a storage event, nothing was ever seen pending)', async () => {
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    // The other tab started and finished a purchase; this tab only gets the events once storage is empty again.
    serve([free], [{ id: 's', state: 'active' }]);
    const before = calls.length;
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'hub_money_pending' }));
      await flush();
    });
    expect(calls.length).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    // A key that is not the Hub's moves nothing.
    const after = calls.length;
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
      await flush();
    });
    expect(calls.length).toBe(after);
  });

  it("does not hide for another account's retained purchase in the same storage", async () => {
    localStorage.setItem('hub_money_pending', JSON.stringify([{ ...stored.buy[1][0], user_id: `${UID}-other` }]));
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
  });

  it("stays off while core holds a rent, even after a /rentals read finds it active (a read releases nothing)", async () => {
    // The hold lives in core (commerce.rentPendingFor); only its subscription tells the badge it changed.
    localStorage.setItem(stored.rent[0], JSON.stringify(stored.rent[1]));
    let active = false;
    const answer = (c: { url: string }) => {
      if (c.url.includes('/rentals')) return { status: 200, body: { data: active ? [{ id: 'r', status: 'active', server_id: 'srv' }] : [] } };
      if (c.url.includes('/subserver-subscriptions')) return { status: 200, body: { data: [], total: 0, limit: 200, offset: 0 } };
      return { status: 200, body: { data: [free] } };
    };
    onFetch(answer);
    await mount();
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    // An active rental is evidence only: core's read never releases the hold, so the badge
    // stays off (the rent may have gone through) however often the page reads again.
    active = true;
    await act(async () => {
      expect(await commerce.checkRentPending(capture(), 'srv')).toBe('active');
      await flush();
    });
    expect(commerce.rentPendingFor(capture())).toHaveLength(1);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await flush();
    });
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
  });

  it('re-reads when the tab becomes visible again', async () => {
    serve([free]);
    await mount();
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
    serve([free], [{ id: 's', state: 'active' }]);
    const before = calls.length;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
    });
    expect(calls.length).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
  });

  it('hears another tab clearing it (storage event)', async () => {
    localStorage.setItem(...(['hub_money_pending', JSON.stringify(stored.buy[1])] as const));
    serve([free]);
    await mount();
    serve([free], [{ id: 's', state: 'active' }]);
    localStorage.removeItem('hub_money_pending');
    const before = calls.length;
    await act(async () => {
      window.dispatchEvent(new Event('storage'));
      await flush();
    });
    expect(calls.length).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
  });
});
