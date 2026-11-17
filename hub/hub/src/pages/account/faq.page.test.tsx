// Vitest: where the account questions show up. The page lists all eight under "Questions" (a suspended account sees only its
// sessions, so no list); the two-step row's link opens its question in the list; the email sheet's and the Remove all local
// data dialog's links open single answers over the overlay (they peek); the email sheet's is the end of its Why. The passcode links are in passcode.test.tsx.
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { beforeEach, describe, expect, it } from 'vitest';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const IDS = ['lockProtects', 'lockScope', 'removeLocal', 'emailChange', 'endSession', 'twoStep', 'checkAgain', 'agentDays'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};
const overlay = () =>
  waitFor(() => {
    const d = document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]');
    if (!d) throw new Error('no open dialog');
    return d;
  });

describe('account questions', () => {
  it('the page lists the eight questions, each closed, under the kit "Questions" heading', async () => {
    await renderPage(page);
    await screen.findByRole('heading', { name: kitStrings['faq.title'] }, { timeout: 8000 });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a suspended account lists no questions', async () => {
    await renderPage(page, { state: 'suspended' });
    expect(await screen.findByText(strings['suspended.title'])).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: kitStrings['faq.title'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: q('twoStep') })).not.toBeInTheDocument();
  });

  it('the two-step Why links to its question, which opens in the list', async () => {
    await renderPage(page);
    await screen.findByRole('heading', { name: strings['2fa.title'] }, { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: strings['2fa.why.q'] }));
    await userEvent.click(screen.getByRole('link', { name: strings['2fa.more'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: q('twoStep') })).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('button', { name: q('emailChange') })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the email sheet keeps its short line and peeks at the email answer', async () => {
    await renderPage(page, { path: '/account?sheet=email' });
    const d = await overlay();
    expect(within(d).getByText(strings['e.leadShort'])).toBeInTheDocument();
    // The link is the end of the Why below the form, so it shows once the question opens.
    await userEvent.click(within(d).getByRole('button', { name: strings['e.why.q'] }));
    await userEvent.click(within(d).getByRole('link', { name: strings['e.more'] }));
    expect(within(await peekOf()).getByText(a('emailChange'))).toBeInTheDocument();
  });

  it('the Remove all local data confirm keeps what to know before confirming and peeks at the whole answer', async () => {
    await renderPage(page, { path: '/account?sheet=wipe' });
    const d = await overlay();
    for (const k of ['w.bodyShort', 'w.oneTab', 'w.otherAccounts'] as const) expect(within(d).getByText(strings[k])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('link', { name: strings['w.more'] }));
    expect(within(await peekOf()).getByText(a('removeLocal'))).toBeInTheDocument();
  });
});
