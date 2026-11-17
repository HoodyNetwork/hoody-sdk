// Vitest: Home draws no link into a page this load does not serve, and a remount keeps the
// "may have gone through" hold on Redeem.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { setAskForFixtures } from '@kit/ask';
import { sent } from './fixtures';
import { resetActionHolds } from './data';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

const hidden = vi.hoisted(() => new Set<string>());
const setRealm = vi.hoisted(() => vi.fn());
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return {
    ...kit,
    useShellData: () => ({ ...(kit.useShellData as () => object)(), setRealm }),
    usePageLink: (id: string) => (hidden.has(id) ? null : { kind: 'hub', href: `/${id}` }),
    usePageVisible: (id: string) => !hidden.has(id),
  };
});

beforeEach(() => {
  setAskForFixtures(true);
  resetActionHolds();
});
afterEach(() => {
  setAskForFixtures(false);
  hidden.clear();
});

describe('home with hidden pages', () => {
  it('offers Get a computer on an empty realm only when computers is served', async () => {
    const shown = await renderPage(page, { state: 'emptyRealm' });
    expect(await screen.findByRole('link', { name: strings['action.getComputer'] })).toBeInTheDocument();
    shown.unmount();
    hidden.add('computers');
    await renderPage(page, { state: 'emptyRealm' });
    await screen.findByText(strings['empty.body']);
    expect(screen.queryByRole('link', { name: strings['action.getComputer'] })).toBeNull();
  });

  it('shows no Bot suggestion or tile when bots is not served', async () => {
    hidden.add('bots');
    await renderPage(page, { state: 'newAccount' });
    await screen.findByText(strings['steps.title']);
    expect(screen.queryByRole('link', { name: new RegExp(strings['steps.try.bot']) })).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(strings['actions.bot']) })).toBeNull();
  });
});

describe('empty realm', () => {
  it('switches to all realms from Show all realms', async () => {
    await renderPage(page, { state: 'emptyRealm' });
    await userEvent.click(
      await screen.findByRole('button', {
        name: strings['action.showAllRealms'],
      }),
    );
    expect(setRealm).toHaveBeenCalledWith('all');
  });
});

describe('redeem hold', () => {
  it('survives a remount, and a press with a different code sends nothing again', async () => {
    sent.redeem = 0;
    const first = await renderPage(page, { state: 'inviteRedeemLost', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field'], undefined, { timeout: 5000 }), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    // The button disables the moment it is pressed; the request and the recorded hold come after. Wait for both.
    await waitFor(() => expect(sent.redeem).toBe(1), { timeout: 10_000 });
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull(), { timeout: 10_000 });
    expect(screen.getByRole('button', { name: strings['setup.invite.redeem'] })).toBeDisabled();
    // Same boot, same account: the page unmounts and mounts again (a tab change), the lock is core's.
    first.router.history.push('/nowhere');
    await waitFor(() => expect(screen.queryByLabelText(strings['setup.invite.field'])).toBeNull(), { timeout: 5000 });
    first.router.history.push('/home');
    // Another code is the same account's redeem: one at a time while an answer is unknown.
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field'], undefined, { timeout: 5000 }), 'zzz999');
    // The hold is core's, so the remounted page shows it before anything is typed or pressed.
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull(), { timeout: 10_000 });
    expect(screen.getByRole('button', { name: strings['setup.invite.redeem'] })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    // A send would reach the handler a beat after the press, so let the page settle before counting.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(sent.redeem).toBe(1);
  }, 30_000);

  it('keeps the Rent button on the market page link and drops it when market is hidden', async () => {
    const shown = await renderPage(page, { state: 'mailbox', realm: 'all' });
    expect(await screen.findByRole('button', { name: strings['setup.rentFirst'] })).toBeInTheDocument();
    shown.unmount();
    hidden.add('market');
    await renderPage(page, { state: 'mailbox', realm: 'all' });
    await screen.findByText(strings['setup.mailbox.title'] ?? /./);
    expect(screen.queryByRole('button', { name: strings['setup.rentFirst'] })).toBeNull();
  });

  it('shows the load failure once, with a retry', async () => {
    await renderPage(page, { state: 'failed' });
    await screen.findByRole('button', { name: /try again|retry/i });
    expect(screen.getAllByText(strings['failed.title'])).toHaveLength(1);
  });
});
