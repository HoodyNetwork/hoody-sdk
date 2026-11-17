// Vitest: the email drawer's pending banner holds everything about the held send, the
// "nothing was dismissed" note included: a warned Start over that freed nothing says so inside the banner, not in a
// separate line under it. Core's hold is a fake here (a hold another tab settled, so the free finds nothing).
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const core = vi.hoisted(() => ({ dismissed: 0, held: true, dropOnFree: false, rev: 0, subs: new Set<() => void>() }));
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  const row = { hold: 'h1', at: 1, identity: { email: 'ada.new@example.com' }, account: 'acct' };
  return {
    ...data,
    useEmailStart: () => {
      useSyncExternalStore(
        (f) => (core.subs.add(f), () => core.subs.delete(f)),
        () => core.rev,
      );
      return {
      run: async () => ({ outcome: 'pending' as const }),
      running: false,
      pending: core.held,
      holds: [row],
      heldNow: () => [row],
      readBack: async () => false,
      dismissRows: async () => {
        core.dismissed++;
        // Another tab settled the hold while this free ran: the hold is gone, and this free freed nothing.
        if (core.dropOnFree) {
          core.held = false;
          core.rev++;
          core.subs.forEach((f) => f());
        }
        return false;
      },
      };
    },
  };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
  core.dismissed = 0;
  core.held = true;
  core.dropOnFree = false;
});

const openDialog = (): Promise<HTMLElement> =>
  waitFor(
    () => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!d) throw new Error('no open dialog');
      return d;
    },
    { timeout: 8000 },
  );

describe('the email drawer held by core', () => {
  it('a Start over that freed nothing says so inside the pending banner, beside the warning', async () => {
    await renderPage(page, { path: '/account?sheet=email' });
    const d = await openDialog();
    const banner = () => within(d).getByRole('alert');
    expect(banner()).toHaveTextContent(strings['err.pending']);
    expect(banner()).not.toHaveTextContent(strings['check.nothing']);
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    await userEvent.click(await within(d).findByRole('button', { name: strings['check.startOver'] }));
    await waitFor(() => expect(core.dismissed).toBe(1));
    await waitFor(() => expect(banner()).toHaveTextContent(strings['check.nothing']));
    expect(banner()).toHaveTextContent(strings['check.dismissWarn']);
    // Said once: no second copy outside the banner.
    expect(within(d).getAllByText(strings['check.nothing'], { exact: false })).toHaveLength(1);
  });
});

describe('the hold goes away while the free runs', () => {
  it('the drawer unlocks and still says nothing was stopped, in a live line that was already there', async () => {
    core.dropOnFree = true;
    await renderPage(page, { path: '/account?sheet=email' });
    const d = await openDialog();
    await userEvent.click(within(d).getByRole('button', { name: strings['check.again'] }));
    await userEvent.click(await within(d).findByRole('button', { name: strings['check.startOver'] }));
    await waitFor(() => expect(within(d).getByLabelText(strings['e.new'])).not.toBeDisabled());
    expect(within(d).queryByRole('alert')).toBeNull();
    const note = await within(d).findByText(strings['check.nothing']);
    expect(note.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getAllByText(strings['check.nothing'])).toHaveLength(1);
  });
});
