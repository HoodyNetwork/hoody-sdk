// Vitest: a refusal shown in the end-session dialog is about the session it was pressed on; when the link moves the
// dialog to another session, that dialog opens without it.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore } from '@core';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import page from './page';
import { locks } from './parts/locks';
import strings from './strings.en.json';

type Row = { hold: string; at: number; identity: unknown; account: string };
const A = '5e55c0ffee00000000000002';
const B = '5e55c0ffee00000000000001';
const row = (identity: unknown, hold: string): Row => ({ hold, at: 1, identity, account: 'acct' });

const core = vi.hoisted(() => ({
  one: [] as Row[],
  others: [] as Row[],
  proves: false,
  next: [] as ('pending' | 'done' | 'failed')[],
  subs: new Set<() => void>(),
  rev: 0,
  delay: 0,
  inflight: false,
  runs: 0,
}));
const tick = () => {
  core.rev++;
  core.subs.forEach((f) => f());
};
const useFake = (which: 'one' | 'others') => {
  useSyncExternalStore(
    (f) => (core.subs.add(f), () => core.subs.delete(f)),
    () => core.rev,
  );
  const holds = [...core[which]];
  return {
    run: async (vars?: { id: string }) => {
      const outcome = core.next.shift() ?? 'pending';
      core.runs++;
      core.inflight = true;
      if (core.delay) await new Promise((r) => setTimeout(r, core.delay));
      core.inflight = false;
      if (outcome === 'pending') {
        core[which].push(row(vars?.id ?? 'endOthers', 'h' + (vars?.id ?? 'O') + core.rev));
        tick();
        return { outcome };
      }
      if (outcome === 'failed') return { outcome, code: 'TOKEN_REVOKED', status: 403 };
      return { outcome, data: { alreadyEnded: false } };
    },
    running: false,
    pending: holds.length > 0,
    holds,
    readBack: async () => {
      if (core.proves) {
        core[which] = [];
        tick();
      }
      return core.proves;
    },
    heldNow: () => [...core[which]],
    dismissRows: async () => true,
  };
};
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return { ...data, useEndSession: () => useFake('one'), useEndOthers: () => useFake('others') };
});
beforeEach(() => {
  bootFixtureCore();
  locks.clear();
  core.one = [];
  core.others = [];
  core.proves = false;
  core.next = [];
  core.delay = 0;
  core.inflight = false;
  core.runs = 0;
});

const dialogIn = (): Promise<HTMLElement> =>
  waitFor(
    () => {
      const d = document.querySelector<HTMLElement>('[role="alertdialog"]');
      if (!d) throw new Error('no dialog');
      return d;
    },
    { timeout: 8000 },
  );

describe("a refusal belongs to the session it was shown for", () => {
  it("Back to another session's dialog drops the earlier refusal", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    let d = await dialogIn();
    core.next = ['failed'];
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await within(d).findByText(strings['err.generic'])).toBeInTheDocument();
    router.history.push(`/account?end=${B}`);
    d = await dialogIn();
    await waitFor(() => expect(within(d).getByRole('heading', { name: strings['s.endTitle'] })).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(strings['err.generic'])).toBeNull());
  });

  it("a refusal that returns after a link moved the dialog to another session is not shown there", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    let d = await dialogIn();
    core.next = ['failed'];
    core.delay = 600;
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    router.history.push(`/account?end=${B}`);
    await new Promise((r) => setTimeout(r, 1200));
    d = await dialogIn();
    expect((router.state.location.search as Record<string, unknown>).end).toBe(B);
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
  });

  it("an end that lands done after a link moved the dialog to another session leaves that dialog open", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    core.next = ['done'];
    core.delay = 600;
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    router.history.push(`/account?end=${B}`);
    expect(await screen.findByText(strings['s.endedOne'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).end).toBe(B);
  });

  it("while that send is out, the other session's dialog is not shown busy", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    let d = await dialogIn();
    core.next = ['done'];
    core.delay = 4000;
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    // Busy shows as a Cancel that cannot be pressed (the dialog refuses to close while its send is out).
    const cancel = (el: HTMLElement) => within(el).getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel(d)).toBeDisabled());
    router.history.push(`/account?end=${B}`);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).end).toBe(B));
    d = await dialogIn();
    await waitFor(() => expect(within(d).getByText(strings['s.endTitle'])).toBeInTheDocument());
    // The send is still out: only its own dialog may show it.
    expect(core.inflight).toBe(true);
    expect(cancel(d)).not.toBeDisabled();
    // Its End waits for the send that is out, and says why.
    const end = within(d).getByRole('button', { name: strings['s.end'] });
    expect(end).toHaveAttribute('aria-disabled', 'true');
    expect(end).toHaveAccessibleDescription(expect.stringContaining(strings['s.endWait']));
    await userEvent.click(end);
    expect(core.runs).toBe(1);
  });

});
