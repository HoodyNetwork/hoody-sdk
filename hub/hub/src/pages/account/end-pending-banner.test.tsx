// Vitest: the page's banner for a session revoke whose outcome is unknown. A later done message never takes its place,
// and its Check again answers with the proof, so a leave toast closes only on a proven read. The dialog's Check again answers the same way. A saved agent sign-in leaves no empty
// footer, and a refusal in the confirmation (nothing typed) never blames a password or code.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore } from '@core';
import type * as Kit from '@kit';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { errorKey } from './logic';
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
  next: [] as ('pending' | 'done')[],
  subs: new Set<() => void>(),
  rev: 0,
  checks: { banner: undefined as undefined | (() => unknown), dialog: undefined as undefined | (() => unknown) },
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
      if (outcome === 'pending') {
        core[which].push(row(vars?.id ?? 'endOthers', 'h' + (vars?.id ?? 'O') + core.rev));
        tick();
        return { outcome };
      }
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
// The Check again each place hands the kit: the same function the kit's leave toast runs.
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    OutcomeBanner: (p: Parameters<typeof kit.OutcomeBanner>[0]) => {
      if (p.kind === 'pending') core.checks.banner = p.onCheck;
      return kit.OutcomeBanner(p);
    },
    ConfirmDialog: (p: Parameters<typeof kit.ConfirmDialog>[0]) => {
      if (p.overlayId === 'account-sessions-end-confirm') core.checks.dialog = p.onCheck;
      return kit.ConfirmDialog(p);
    },
  };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
  core.one = [];
  core.others = [];
  core.proves = false;
  core.next = [];
  core.checks.banner = undefined;
  core.checks.dialog = undefined;
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
const pendingBanner = () => screen.queryAllByText(strings['err.pending']).length > 0;

describe('the pending revoke banner', () => {
  it('stays when a later revoke is done: the done message shows beside it', async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    let d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    await within(d).findByRole('button', { name: strings['check.startOver'] });
    core.next = ['done'];
    router.history.push(`/account?end=${B}`);
    d = await dialogIn();
    await waitFor(() => expect(within(d).queryByRole('button', { name: strings['check.startOver'] })).toBeNull());
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    expect(await screen.findByText(strings['s.endedOne'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(pendingBanner()).toBe(true);
  });

  it("its Check again answers false while unproven and true once proven (a leave toast closes only on true)", async () => {
    const { router } = await renderPage(page, { path: `/account?end=${A}` });
    const d = await dialogIn();
    await userEvent.click(within(d).getByRole('button', { name: strings['s.end'] }));
    await within(d).findByRole('button', { name: strings['check.startOver'] });
    router.history.push('/account?section=sessions');
    await waitFor(() => expect(core.checks.banner).toBeTypeOf('function'), { timeout: 8000 });
    expect(await core.checks.banner!()).toBe(false);
    core.proves = true;
    expect(await core.checks.banner!()).toBe(true);
    await waitFor(() => expect(pendingBanner()).toBe(false));
  });
});

describe("the session dialog's Check again", () => {
  it('answers false while unproven and true once proven', async () => {
    core.one = [row(B, 'hB')];
    await renderPage(page, { path: `/account?end=${B}` });
    await dialogIn();
    await waitFor(() => expect(core.checks.dialog).toBeTypeOf('function'));
    expect(await core.checks.dialog!()).toBe(false);
    core.proves = true;
    expect(await core.checks.dialog!()).toBe(true);
  });
});

describe('the confirmation has nothing typed', () => {
  it('a 401 there is not blamed on a password or code', () => {
    expect(errorKey({ status: 401 }, 'none')).toBe('err.generic');
  });
});

describe('agent sign-in save', () => {
  it('says it was saved, then the footer goes', async () => {
    await renderPage(page, { path: '/account?section=agent-sign-in' });
    const input = await screen.findByRole('textbox', { name: strings['ag.days'] }, { timeout: 8000 });
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: strings['ag.save'] }));
    expect(await screen.findByText(strings['ag.saved'])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['ag.save'] })).toBeNull(), { timeout: 6000 });
  });

  it('a refusal goes when the value is edited back', async () => {
    await renderPage(page, { path: '/account?section=agent-sign-in' });
    const input = await screen.findByRole('textbox', { name: strings['ag.days'] }, { timeout: 8000 });
    const saved = (input as HTMLInputElement).value;
    await userEvent.clear(input);
    await userEvent.type(input, '0');
    await userEvent.click(screen.getByRole('button', { name: strings['ag.save'] }));
    expect(await screen.findByText(strings['ag.bad'])).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, saved);
    await waitFor(() => expect(screen.queryByText(strings['ag.bad'])).toBeNull());
  });
});
