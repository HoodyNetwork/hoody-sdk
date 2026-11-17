// The setup changes Home sends name their page, so a hold whose answer was lost records Home
// as its sender page (l:home:<id>): Computers, which shares the setup locks, shows it as Home's with a link to Home.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreQueryProvider, answers, heldChanges, reply, retrySetupRoute } from '@core';
import { renderHook, renderPage, screen, waitFor } from '@app/testing';
import { resetActionHolds, useRedeemInvite, useRetrySetup } from './data';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

// inviteRedeemLost loses every redeem answer; this state loses every retry answer too.
vi.mock('./fixtures', async (importOriginal) => {
  const orig = (await importOriginal()) as { default: { default: string; states: Record<string, unknown[]> } };
  const states = { ...orig.default.states, setupLost: [reply(retrySetupRoute, answers.pending5xx(502)), ...orig.default.states.inviteRedeemLost!] };
  return { ...orig, default: { ...orig.default, states } };
});

const wrapper = CoreQueryProvider;
afterEach(() => resetActionHolds());

describe('a setup change Home sent records Home as its page', () => {
  it('redeem: the held redeem names Home and its route', async () => {
    await renderPage(page, { state: 'setupLost', realm: 'all' });
    await screen.findByLabelText(strings['setup.invite.field']);
    const home = renderHook(() => useRedeemInvite(() => undefined), { wrapper });
    act(() => home.result.current.mutate({ code: 'AAA111' }));
    await waitFor(() => expect(heldChanges('invite.redeem')).toHaveLength(1), { timeout: 8000 });
    expect(heldChanges('invite.redeem')[0]!.from).toEqual({ page: 'home', path: '/home' });
  });

  it('retry: the held retry names Home and its route', async () => {
    await renderPage(page, { state: 'setupLost', realm: 'all' });
    await screen.findByLabelText(strings['setup.invite.field']);
    const home = renderHook(() => useRetrySetup(() => undefined), { wrapper });
    act(() => home.result.current.mutate());
    await waitFor(() => expect(heldChanges('setup.retry')).toHaveLength(1), { timeout: 8000 });
    expect(heldChanges('setup.retry')[0]!.from).toEqual({ page: 'home', path: '/home' });
  });
});
