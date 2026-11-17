// Vitest: Home's setup retry and core's retrySetup keep one minute per account: a press on Home starts the minute
// core reports, a send through core's retrySetup makes Home's next press wait, a request that never went out gives
// its minute back, and one whose answer was lost keeps it.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retrySetup, retrySetupWait } from '@core';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { resetActionHolds } from './data';
import { sent } from './fixtures';
import { POLL_MS, POLLS } from './logic';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

// `retry` replaces the answer of the next retry request: 'unsent' is refused before anything goes out, 'lost' goes
// out (counted) and its answer never comes back.
const forced = vi.hoisted(() => ({ provisioning: false, retry: null as null | 'unsent' | 'lost' }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const real = core.useSetupState as (o?: { enabled?: boolean }) => { data?: unknown };
  const realApi = core.api as (route: unknown, input?: unknown) => Promise<unknown>;
  return {
    ...core,
    useSetupState: (o?: { enabled?: boolean }) => { const r = real(o); return forced.provisioning && r.data ? { ...r, data: { kind: 'provisioning' } } : r; },
    api: (route: unknown, input?: unknown) => {
      const how = route === core.retrySetupRoute ? forced.retry : null;
      if (!how) return realApi(route, input);
      forced.retry = null;
      if (how === 'unsent') return Promise.reject({ kind: 'not_sent', notSent: true, code: 'FRAMED_ACTION_REFUSED' });
      sent.retry += 1;
      return Promise.reject({ kind: 'pending', pending: true });
    },
  };
});

beforeEach(() => {
  forced.provisioning = false;
  forced.retry = null;
  sent.retry = 0;
  resetActionHolds();
});
afterEach(() => vi.useRealTimers());

async function stalled() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  forced.provisioning = true;
  await renderPage(page, { state: 'stalledBlocked', realm: 'all' });
  await screen.findByText(strings['setup.provisioning.title']);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * (POLLS + 1));
  });
  await screen.findByText(strings['setup.stalled.title']);
}

describe('one setup-retry minute for Home and core', () => {
  it('a press on Home starts the minute core reports for the account', async () => {
    await stalled();
    expect(retrySetupWait()).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    await waitFor(() => expect(sent.retry).toBe(1));
    expect(retrySetupWait()).toBeGreaterThan(59000);
    // core's own retry inside the minute sends nothing
    expect(await retrySetup()).toMatchObject({ outcome: 'not_sent', reason: 'cooldown' });
    expect(sent.retry).toBe(1);
  });

  it('a retry sent through core makes the next Home press wait, sending nothing', async () => {
    await stalled();
    expect(await retrySetup()).toMatchObject({ outcome: 'done' });
    expect(sent.retry).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    expect(await screen.findByText(strings['setup.retryWait'])).toBeInTheDocument();
    expect(sent.retry).toBe(1);
  });

  it('a retry that never went out gives the minute back: the next press sends', async () => {
    await stalled();
    forced.retry = 'unsent';
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    await waitFor(() => expect(forced.retry).toBeNull());
    await waitFor(() => expect(retrySetupWait()).toBe(0));
    expect(sent.retry).toBe(0);
    await userEvent.click(await screen.findByRole('button', { name: strings['setup.retry'] }));
    await waitFor(() => expect(sent.retry).toBe(1));
    expect(screen.queryByText(strings['setup.retryWait'])).toBeNull();
  });

  it('a retry whose answer was lost keeps the minute', async () => {
    await stalled();
    forced.retry = 'lost';
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    await waitFor(() => expect(sent.retry).toBe(1));
    expect(retrySetupWait()).toBeGreaterThan(59000);
    expect(await retrySetup()).toMatchObject({ outcome: 'not_sent', reason: 'cooldown' });
    expect(sent.retry).toBe(1);
  });
});
