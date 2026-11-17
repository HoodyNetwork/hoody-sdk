// Vitest: Home's security checks (links, hold release, wording, empty realm).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { setAskForFixtures } from '@kit/ask';
import { resetActionHolds } from './data';
import page from './page';
import kit from '@kit/strings.en.json';
import strings from './strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import './testWaits';

const hidden = vi.hoisted(() => new Set<string>());
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, usePageLink: (id: string) => (hidden.has(id) ? null : { kind: 'hub', href: `/${id}` }) };
});

beforeEach(() => {
  setAskForFixtures(true);
  resetActionHolds();
});
afterEach(() => {
  setAskForFixtures(false);
  hidden.clear();
});

const FULL_ID = /[0-9a-f]{24}/;

describe('computer links carry the handle, never the full id', () => {
  it('pick-one links go to name.last4', async () => {
    await renderPage(page, { state: 'pickOne', computer: false });
    const link = await screen.findByRole('link', { name: 'orion' });
    expect(link.getAttribute('href')).toContain('orion.bbbb');
    expect(link.getAttribute('href')).not.toMatch(FULL_ID);
  });

  it('the dashboard context line links to name.last4', async () => {
    await renderPage(page);
    const link = await screen.findByRole('link', { name: /atlas/ });
    expect(link.getAttribute('href')).toMatch(/sel=atlas\.[0-9a-f]{4}(&|$)/);
    expect(link.getAttribute('href')).not.toMatch(FULL_ID);
  });
});

describe('setup actions', () => {
  it('Check again alone does not open the hold (a read proves nothing); a warned Dismiss does, and Redeem works again', async () => {
    await renderPage(page, { state: 'inviteRedeemRecover', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: strings['setup.invite.redeem'] })).toBeDisabled());
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await userEvent.type(screen.getByLabelText(strings['setup.invite.field']), 'abc123');
    expect(screen.getByRole('button', { name: strings['setup.invite.redeem'] })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['setup.dismiss.confirm'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: strings['setup.invite.redeem'] })).toBeEnabled());
  });

  it('a lost redeem after a refused sign-up code says pending, not "did not work"', async () => {
    await renderPage(page, { state: 'inviteFailedThenLost', realm: 'all' });
    expect(await screen.findByText(strings['setup.inviteFailed.title'])).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    // The setup panel's own pending banner, never page-wide words: the Needs you line can say "may have gone through"
    // while the send is still running. Its Check again shows first, then the old title goes (seen under load).
    const panel = () => within(document.querySelector<HTMLElement>('[data-setup]')!);
    await waitFor(() => expect(panel().getByRole('button', { name: kit['outcome.pending.check'] })).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(strings['setup.inviteFailed.title'])).toBeNull());
    expect(panel().getByText(/may have gone through/i)).toBeInTheDocument();
  });
});

describe('an account with computers in another realm', () => {
  it('still gets the setup panel when the whole account is empty', async () => {
    await renderPage(page, { state: 'mailbox', realm: 'all' });
    expect(await screen.findByText(strings['setup.mailbox.title'])).toBeInTheDocument();
  });

  it('gets the empty-realm view, not the setup panel, in an empty realm', async () => {
    await renderPage(page, { state: 'mailbox' });
    expect(await screen.findByText(strings['empty.body'])).toBeInTheDocument();
    // The setup read answers after the first paint: give it time to (wrongly) swap the view.
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText(strings['empty.body'])).toBeInTheDocument();
    expect(screen.queryByText(strings['setup.mailbox.title'])).toBeNull();
  });
});

describe('the welcome tour button', () => {
  it('is drawn when the tour is served', async () => {
    await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    expect(await screen.findByRole('link', { name: strings['intro.tour'] })).toBeInTheDocument();
  });

  it('is not drawn when the tour is not served', async () => {
    hidden.add('onboarding');
    await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    expect(await screen.findByText(strings['intro.lead'])).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: strings['intro.tour'] })).toBeNull();
  });
});
