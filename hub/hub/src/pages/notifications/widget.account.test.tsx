// Vitest: the Home widget's failure line belongs to the account it was shown for: a Mark all read that fails after the
// account changed shows nothing on the new account.
import { bootFixtureCore } from '@core';
import { act, renderPage, screen, userEvent } from '@app/testing';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const shown = vi.hoisted(() => ({ account: 'acct-1', release: null as null | (() => void), subs: new Set<() => void>() }));
const setAccount = (id: string) => {
  shown.account = id;
  shown.subs.forEach((f) => f());
};
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    useAccountId: () => {
      const id = useSyncExternalStore(
        (f) => (shown.subs.add(f), () => shown.subs.delete(f)),
        () => shown.account,
      );
      return { data: { id } };
    },
    // A Mark all read whose answer (a refusal) arrives only when the test lets it.
    useMarkAllRead: () => ({
      ...data.useMarkAllRead(),
      run: () => new Promise((resolve) => (shown.release = () => resolve({ outcome: 'failed', code: 'REFUSED' }))),
    }),
  };
});

async function show() {
  await renderPage({ ...page, load: () => import('./widget') }, {});
}

describe('notifications widget across accounts', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
    shown.account = 'acct-1';
    shown.release = null;
  });

  it('a refusal that arrives after the account changed shows no failure line', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.readAll }));
    act(() => setAccount('acct-2'));
    await act(async () => {
      shown.release?.();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText(strings['widget.markFailed'])).toBeNull();
  });

  it('control: a refusal on the same account shows the failure line', async () => {
    await show();
    await userEvent.click(await screen.findByRole('button', { name: strings.readAll }));
    await act(async () => {
      shown.release?.();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(await screen.findByText(strings['widget.markFailed'])).toBeInTheDocument();
  });
});
