// Vitest: a subscription row's ⋯ menu says why its auto-renew item is disabled, in the page's own words: "still being
// saved" while this row's change is out; "may have gone through" once its answer is unknown, and for a change core
// still holds from an earlier visit; the suspended account's words when banned. Core's auto-renew hook is faked at the
// page's data seam as core behaves: during this tab's own send only `running` is set (the lock is busy, not held), and
// the hold (`pending`) is set only by an answer that may have gone through. Every row starts with auto-renew off, so
// its switch sends at once (no confirm dialog).
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const fake = vi.hoisted(() => ({
  run: vi.fn(),
  renewPending: false,
  /** Frees core's hold from elsewhere (another tab's read-back or Stop tracking): `pending` then reads false. */
  freeHold: () => undefined as void,
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    useAutoRenew: () => {
      // Like core: no hold while this tab's send is out; an answer that may have gone through leaves one.
      const [pending, setPending] = useState(fake.renewPending);
      const [running, setRunning] = useState(false);
      useEffect(() => {
        fake.freeHold = () => setPending(false);
      }, []);
      return {
        running,
        pending,
        run: async (v: unknown) => {
          setRunning(true);
          try {
            const r = await fake.run(v);
            if (r?.outcome === 'pending') setPending(true);
            return r;
          } finally {
            setRunning(false);
          }
        },
        readBack: async () => false,
        settle: vi.fn(),
        discard: vi.fn(),
        holds: async () => [],
        dismissHeld: async () => false,
      };
    },
    useSubs: () => {
      const r = a.useSubs();
      const data = r.data ? { ...r.data, subs: r.data.subs.map((s: any) => ({ ...s, auto_renew: false })) } : r.data;
      return { ...r, data };
    },
  };
});

const REASONS = { busy: strings['subs.renewBusy'], unknown: strings.renewUnknown, banned: strings['mkt.suspended'] };

beforeEach(() => {
  fake.run.mockReset();
  fake.renewPending = false;
  fake.freeHold = () => undefined;
});

/** The n-th renewable row: its auto-renew switch and the row it sits in. */
async function nthRow(n: number) {
  const all = await screen.findAllByRole('switch', { name: /auto-renew for/i });
  expect(all.length).toBeGreaterThan(n);
  const sw = all[n] as HTMLElement;
  const row = (sw.closest('tr') ?? sw.closest('[role="row"]')) as HTMLElement;
  expect(row).not.toBeNull();
  return { sw, row };
}
const firstRow = () => nthRow(0);

/** Opens the row's ⋯ menu and returns its text with the auto-renew item's state. */
async function renewItem(row: HTMLElement) {
  await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
  const menu = await screen.findByRole('menu');
  const item = within(menu).getByRole('menuitem', { name: new RegExp(strings['subs.renewOn'], 'i') });
  const out = { text: menu.textContent ?? '', disabled: item.getAttribute('aria-disabled') === 'true' };
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  return out;
}

function onlyReason(text: string, want: keyof typeof REASONS) {
  for (const [k, words] of Object.entries(REASONS)) {
    if (k === want) expect(text).toContain(words);
    else expect(text).not.toContain(words);
  }
}

describe('auto-renew menu item: disabled reason', () => {
  it('an enabled item says no reason', async () => {
    await renderPage(page, { path: '/billing?view=wallet' });
    const { row } = await firstRow();
    const { text, disabled } = await renewItem(row);
    expect(disabled).toBe(false);
    for (const words of Object.values(REASONS)) expect(text).not.toContain(words);
  });

  it("this row's change being sent: still being saved", async () => {
    fake.run.mockImplementation(() => new Promise(() => undefined));
    await renderPage(page, { path: '/billing?view=wallet' });
    const { sw, row } = await firstRow();
    await userEvent.click(sw);
    await waitFor(() => expect(fake.run).toHaveBeenCalledTimes(1));
    const { text, disabled } = await renewItem(row);
    expect(disabled).toBe(true);
    onlyReason(text, 'busy');
  });

  it("this row's answer unknown: may have gone through", async () => {
    fake.run.mockResolvedValue({ outcome: 'pending' });
    await renderPage(page, { path: '/billing?view=wallet' });
    const { sw, row } = await firstRow();
    await userEvent.click(sw);
    await screen.findByText(strings.renewUnknown);
    const { text, disabled } = await renewItem(row);
    expect(disabled).toBe(true);
    onlyReason(text, 'unknown');
  });

  it('a hold core kept from an earlier visit: may have gone through, before anything is pressed', async () => {
    fake.renewPending = true;
    await renderPage(page, { path: '/billing?view=wallet' });
    const { row } = await firstRow();
    const { text, disabled } = await renewItem(row);
    expect(disabled).toBe(true);
    onlyReason(text, 'unknown');
    expect(fake.run).not.toHaveBeenCalled();
  });

  it("two rows: A's answer unknown (its hold freed elsewhere), then B being sent: A may have gone through, B saving", async () => {
    fake.run.mockResolvedValueOnce({ outcome: 'pending' }).mockImplementationOnce(() => new Promise(() => undefined));
    await renderPage(page, { path: '/billing?view=wallet' });
    const a = await nthRow(0);
    await userEvent.click(a.sw);
    await screen.findByText(strings.renewUnknown);
    // The hold is freed elsewhere: core holds nothing now, but A's own answer is still unknown on this page.
    act(() => fake.freeHold());
    const b = await nthRow(1);
    await waitFor(() => expect(b.sw).toBeEnabled());
    await userEvent.click(b.sw);
    await waitFor(() => expect(fake.run).toHaveBeenCalledTimes(2));
    const ofA = await renewItem(a.row);
    expect(ofA.disabled).toBe(true);
    onlyReason(ofA.text, 'unknown');
    const ofB = await renewItem(b.row);
    expect(ofB.disabled).toBe(true);
    onlyReason(ofB.text, 'busy');
  });

  it("a suspended account: the suspended words, not a lock's", async () => {
    await renderPage(page, { state: 'banned', path: '/billing?view=wallet' });
    const { row } = await firstRow();
    const { text, disabled } = await renewItem(row);
    expect(disabled).toBe(true);
    onlyReason(text, 'banned');
  });
});
