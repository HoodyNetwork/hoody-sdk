// Vitest: the setup panel's honest states: a pending banner ends when the read-back releases, a refused
// account never inherits another account's retry minute, a "blocked" 200 is shown and stops the polling,
// and a busy server is not "that code did not work".
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redeemRoute, setupLocks, useLockedChange, api } from '@core';
import { renderHook, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { sent } from './fixtures';
import { resetActionHolds, useRedeemInvite } from './data';
import { POLL_MS, POLLS } from './logic';
import page from './page';
import strings from './strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import './testWaits';

// The setup panel's 'provisioning' as it would show on a server signal of preparation: no read answers it today
// (an owned free server alone reads 'empty'), so rows that test the panel force the answer.
const forced = vi.hoisted(() => ({ provisioning: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const real = core.useSetupState as (o?: { enabled?: boolean }) => { data?: unknown };
  return { ...core, useSetupState: (o?: { enabled?: boolean }) => { const r = real(o); return forced.provisioning && r.data ? { ...r, data: { kind: 'provisioning' } } : r; } };
});

const who = vi.hoisted(() => ({ name: 'ada' }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  const real = kit.useShellData as () => { account?: object };
  return { ...kit, useShellData: () => ({ ...real(), account: { ...(real().account ?? {}), name: who.name } }) };
});

beforeEach(() => {
  forced.provisioning = false;
  who.name = 'ada';
  sent.retry = 0;
  resetActionHolds();
});
afterEach(() => vi.useRealTimers());

async function stalled() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  forced.provisioning = true;
  const view = await renderPage(page, { state: 'stalledBlocked', realm: 'all' });
  await screen.findByText(strings['setup.provisioning.title']);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * (POLLS + 1));
  });
  await screen.findByText(strings['setup.stalled.title']);
  return view;
}

describe('setup panel states', () => {
  it('the pending banner ends once a warned Dismiss opens the hold', async () => {
    const view = await renderPage(page, { state: 'inviteRedeemRecover', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    await waitFor(() => expect(document.body.textContent).toMatch(/may have gone through/i));
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    expect(document.body.textContent).toMatch(/may have gone through/i);
    await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['setup.dismiss.confirm'] }));
    await waitFor(() => expect(document.body.textContent).not.toMatch(/may have gone through/i));
    view.unmount();
  });

  it('a retry answered "blocked" says so and a second press inside the minute says to wait', async () => {
    await stalled();
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    expect(await screen.findByText(strings['setup.blocked.support'])).toBeInTheDocument();
    expect(sent.retry).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    expect(await screen.findByText(strings['setup.retryWait'])).toBeInTheDocument();
    expect(sent.retry).toBe(1);
  });

  it('another account does not inherit the retry minute', async () => {
    const first = await stalled();
    const pressedAt = Date.now();
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    await screen.findByText(strings['setup.blocked.support']);
    first.unmount();
    who.name = 'grace';
    await stalled();
    // Getting to "stalled" again took the fake clock past the minute: put it back inside it.
    vi.setSystemTime(pressedAt + 1000);
    await userEvent.click(screen.getByRole('button', { name: strings['setup.retry'] }));
    await waitFor(() => expect(sent.retry).toBe(2));
    expect(screen.queryByText(strings['setup.retryWait'])).toBeNull();
  });

  it('a redeem answered 200 with a block reason shows it', async () => {
    await renderPage(page, { state: 'inviteBlocked200', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    expect(await screen.findByText(strings['setup.blocked.code'])).toBeInTheDocument();
  });

  it('a busy server is not "that code did not work"', async () => {
    await renderPage(page, { state: 'inviteTrouble', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    expect(await screen.findByText(strings['setup.redeem.trouble'])).toBeInTheDocument();
    expect(screen.queryByText(strings['setup.inviteFailed.title'])).toBeNull();
  });

  it('a second redeem with a different code sends nothing while the first answer is unknown', async () => {
    sent.redeem = 0;
    await renderPage(page, { state: 'inviteRedeemLost', realm: 'all' });
    await screen.findByLabelText(strings['setup.invite.field']);
    const hook = renderHook(() => useRedeemInvite(() => undefined));
    act(() => hook.result.current.mutate({ code: 'AAA111' }));
    await waitFor(() => expect(hook.result.current.locked).toBe(true));
    expect(sent.redeem).toBe(1);
    act(() => hook.result.current.mutate({ code: 'BBB222' }));
    await waitFor(() => expect(hook.result.current.isPending).toBe(false));
    expect(sent.redeem).toBe(1);
  });

  it('a redeem held by another page shows where it was started, with no Dismiss', async () => {
    await renderPage(page, { state: 'inviteRedeemLost', realm: 'all' });
    await screen.findByLabelText(strings['setup.invite.field']);
    // The Computers page's own hook (another id, the shared lock): its redeem answer is lost.
    const other = renderHook(() =>
      useLockedChange<{ code: string }, unknown>((v, _i, ctx) => api(redeemRoute, { body: { code: v.code }, ctx }), [], 'computers.redeem', { ...setupLocks.redeem }),
    );
    await act(async () => {
      await other.result.current.run({ code: 'AAA111' });
    });
    await waitFor(() => expect(screen.getByText(strings['setup.elsewhere'])).toBeInTheDocument());
    expect(screen.getByRole('button', { name: strings['setup.elsewhere.open'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(?:close|stop tracking…|hide this note)$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });
});
