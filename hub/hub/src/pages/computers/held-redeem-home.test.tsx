// A redeem Home sent and still holds (its answer lost) shows on the invite card as Home's to
// settle: a link to Home, no Dismiss and no form (Computers cannot free another page's hold).
import { CoreQueryProvider, answers, api, heldChanges, redeemRoute, reply, setupLocks, useLockedChange } from '@core';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, renderPage, screen, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// Every redeem answer is lost: the send may have gone through, so core holds it.
vi.mock('./fixtures', async (importOriginal) => {
  const orig = (await importOriginal()) as { default: { default: string; states: Record<string, unknown[]> } };
  const states = { ...orig.default.states, emptyRedeemLost: [reply(redeemRoute, answers.pending5xx(502)), ...orig.default.states.empty!] };
  return { ...orig, default: { ...orig.default, states } };
});

describe('a redeem Home holds, on Computers', () => {
  it('shows a link to Home and no Dismiss', async () => {
    await renderPage(page, { state: 'emptyRedeemLost', path: '/computers' });
    await screen.findByText(strings['zero.invite.card'], {}, { timeout: 8000 });
    // Home's send as Home declares it (pages/home/data.ts useSetup): its id, the shared lock and page 'home'.
    const home = renderHook(
      () => useLockedChange<{ code: string }, unknown>((v, _i, ctx) => api(redeemRoute, { body: { code: v.code }, ctx }), [], 'invite.redeem', { ...setupLocks.redeem, page: 'home' }),
      { wrapper: CoreQueryProvider },
    );
    await act(async () => { await home.result.current.run({ code: 'AAA111' }); });
    await waitFor(() => expect(heldChanges('invite.redeem')).toHaveLength(1), { timeout: 8000 });
    const open = strings['held.open'].replace('{{page}}', strings['held.from.home']);
    expect(await screen.findByRole('link', { name: open }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    expect(screen.queryByLabelText(strings['zero.invite.label'])).toBeNull();
  });
});
