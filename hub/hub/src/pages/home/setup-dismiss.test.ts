// Vitest: the setup panel's Stop tracking frees the send it showed, never a later one. Another tab of Home (the same
// sender) frees the shown redeem and sends again while the question is open: the question closes unanswered and the
// new send stays held. The hook's dismiss frees only the send it names; the one held now is freed (control).
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoreQueryProvider, api, heldChanges, redeemRoute, setupLocks, useLockedChange } from '@core';
import { renderHook, renderPage, screen, userEvent, waitFor } from '@app/testing';
import kitStates from '@kit/states/strings.en.json';
import { resetActionHolds, useRedeemInvite } from './data';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

const wrapper = CoreQueryProvider;
const CONFIRM = strings['setup.dismiss.confirm'];
const held = () => heldChanges(setupLocks.redeem.lock);

/** Another tab of Home: the same lock and sender, through core's own hook (its warned Dismiss and a send). */
const otherTab = () =>
  renderHook(
    () => useLockedChange<{ code: string }, unknown>((v, _i, ctx) => api(redeemRoute, { body: { code: v.code }, ctx }), [], 'invite.redeem', { ...setupLocks.redeem, page: 'home' }),
    { wrapper },
  );

beforeEach(() => resetActionHolds());
afterEach(() => resetActionHolds());

describe('setup panel: Stop tracking is bound to the shown send', () => {
  it('the shown redeem is freed and sent again elsewhere under the open question: it closes, the new send stays held', async () => {
    await renderPage(page, { state: 'inviteRedeemLost', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    await waitFor(() => expect(held()).toHaveLength(1));
    const shown = held()[0]?.hold;
    await userEvent.click(await screen.findByRole('button', { name: kitStates['err.stopTracking'] }));
    await screen.findByRole('button', { name: CONFIRM });

    const tab = otherTab();
    await act(async () => { await tab.result.current.dismiss(); });
    await act(async () => { await tab.result.current.run({ code: 'BBB222' }); });
    expect(held()).toHaveLength(1);
    expect(held()[0]?.hold).not.toBe(shown);

    await waitFor(() => expect(screen.queryByRole('button', { name: CONFIRM })).toBeNull());
    expect(held()).toHaveLength(1);
    expect(document.body.textContent).toMatch(/may have gone through/i);
  });

  it('dismiss frees only the send it names: a later send stays held; the send held now is freed (control)', async () => {
    await renderPage(page, { state: 'inviteRedeemLost', realm: 'all' });
    await screen.findByLabelText(strings['setup.invite.field']);
    const home = renderHook(() => useRedeemInvite(() => undefined), { wrapper });
    act(() => home.result.current.mutate({ code: 'AAA111' }));
    await waitFor(() => expect(home.result.current.locked).toBe(true));
    const a = home.result.current.hold;
    expect(a).toBeDefined();

    const tab = otherTab();
    await act(async () => { await tab.result.current.dismiss(); });
    await act(async () => { await tab.result.current.run({ code: 'BBB222' }); });
    await waitFor(() => expect(home.result.current.hold).not.toBe(a));
    const b = home.result.current.hold;
    expect(b).toBeDefined();

    let freed: boolean | undefined;
    await act(async () => { freed = await home.result.current.dismiss(a as string); });
    expect(freed).toBe(false);
    expect(home.result.current.locked).toBe(true);

    await act(async () => { freed = await home.result.current.dismiss(b as string); });
    expect(freed).toBe(true);
    await waitFor(() => expect(home.result.current.locked).toBe(false));
  });
});
