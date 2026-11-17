// Vitest: a change in flight is read again every 15 s, about ten minutes in all (40 beats), and the count is per change:
// once nothing is in flight it starts again, so a later change in the same visit is polled too.
import { act, renderPage, screen } from '@app/testing';
import { useMemo, useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

// `busy`: the default fixture list, whose new server is being set up; idle: the same list with nothing running.
const ctl = vi.hoisted(() => {
  const subs = new Set<() => void>();
  const c = { busy: true, reads: 0, subs };
  return {
    c,
    set(busy: boolean) {
      c.busy = busy;
      for (const f of subs) f();
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
});
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  return {
    ...real,
    useSubs: () => {
      const q = real.useSubs();
      const busy = useSyncExternalStore(ctl.subscribe, () => ctl.c.busy);
      const data = useMemo(
        () => (q.data && !busy ? { ...q.data, subs: q.data.subs.map((s) => ({ ...s, state: s.state === 'provisioning' ? 'active' : s.state, active_operation_id: null })) } : q.data),
        [q.data, busy],
      );
      const { refetch } = q;
      return useMemo(() => ({ ...q, data, refetch: (...a: Parameters<typeof refetch>) => (ctl.c.reads++, refetch(...a)) }), [q, data, refetch]);
    },
  };
});

const beat = async (n: number) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
  }
};

afterEach(() => {
  vi.useRealTimers();
  ctl.c.busy = true;
  ctl.c.reads = 0;
});

describe('subscriptions: polling a change in flight', () => {
  it('stops after 40 beats, and a later change in the same visit is polled again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    await renderPage(page, { path: '/billing?view=wallet' });
    await screen.findByRole('heading', { name: strings['subs.heading'] });
    await screen.findAllByText('fra-7');
    ctl.c.reads = 0;
    await beat(41);
    expect(ctl.c.reads).toBe(40);
    await beat(2);
    expect(ctl.c.reads).toBe(40);
    // The change settles: nothing is in flight. Then another one starts in the same visit.
    act(() => ctl.set(false));
    await beat(1);
    expect(ctl.c.reads).toBe(40);
    act(() => ctl.set(true));
    await beat(3);
    expect(ctl.c.reads).toBe(43);
  });
});
