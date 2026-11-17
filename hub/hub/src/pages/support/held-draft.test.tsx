// Vitest: a send that may have gone through, seen again after its box or drawer was left. The locked fields show the
// held text, the counter counts that text, and Stop tracking (asked first) unlocks the same text in place: nothing on
// screen goes away, and nothing is sent again.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { heldAttempts, resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import kitStates from '@kit/states/strings.en.json';
import { beforeEach, describe, expect, it } from 'vitest';
import { CREATE_LOCK, replyLock, resetUnclaimedForTests } from './data';
import { T_LONG, T_OPEN, requestLog } from './fixtures';
import { putPrefill, resetPrefillForTests } from './links';
import page from './page';
import strings from './strings.en.json';

const OPEN_ID = String(T_OPEN.id);
const LONG_ID = String(T_LONG.id);
const SLOW = { timeout: 20000 };
const TEXT = 'Any news on the invoice?';
const SUBJECT = 'Invoice shows the wrong country';
const BODY = 'The country on my invoice is wrong.';
const counter = (text: string) => strings['field.counter'].replace('{{n}}', String(text.length));
const writes = () => requestLog.filter((r) => r.route === 'create' || r.route === 'reply').length;

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetPrefillForTests();
  resetUnclaimedForTests();
  requestLog.length = 0;
});

type R = Awaited<ReturnType<typeof renderPage>>;
const go = (r: R, href: string) =>
  act(async () => {
    await r.router.navigate({ href } as never);
  });

async function stopTracking(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
  await userEvent.click(await screen.findByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }, SLOW));
}

describe('a held send seen again after its box or drawer was left', () => {
  it('a reply: the counter counts the held text, and Stop tracking unlocks that text', { timeout: 60000 }, async () => {
    const r = await renderPage(page, { state: 'sendUnknown', path: `/support?sel=${OPEN_ID}` });
    await userEvent.type(await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW), TEXT);
    await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
    await screen.findByText(strings['send.known'], undefined, SLOW);
    await go(r, `/support?sel=${LONG_ID}`);
    await waitFor(() => expect(screen.queryByText(strings['send.known'])).toBeNull(), SLOW);
    await go(r, `/support?sel=${OPEN_ID}`);
    await screen.findByText(strings['send.known'], undefined, SLOW);
    const box = screen.getByRole('textbox', { name: strings['reply.label'] });
    expect(box).toHaveValue(TEXT);
    expect(box).toHaveAttribute('readonly');
    expect(screen.getByText(counter(TEXT), { exact: false })).toBeInTheDocument();
    await stopTracking();
    await waitFor(() => expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0), SLOW);
    await waitFor(() => expect(box).not.toHaveAttribute('readonly'), SLOW);
    expect(box).toHaveValue(TEXT);
    expect(screen.getByText(counter(TEXT), { exact: false })).toBeInTheDocument();
    expect(writes()).toBe(1);
  });

  it('a new ticket: the counter counts the held message, and Stop tracking unlocks the same fields', { timeout: 60000 }, async () => {
    const r = await renderPage(page, { state: 'sendUnknown', path: '/support' });
    putPrefill({ category: 'billing', subject: SUBJECT, body: BODY });
    await go(r, '/support?new=1');
    await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    await screen.findByText(strings['send.known'], undefined, SLOW);
    await go(r, '/support');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: strings['new.subject'] })).toBeNull(), SLOW);
    await go(r, '/support?new=1');
    await screen.findByText(strings['send.known'], undefined, SLOW);
    const subject = screen.getByRole('textbox', { name: strings['new.subject'] });
    const message = screen.getByRole('textbox', { name: strings['new.message'] });
    expect(subject).toHaveValue(SUBJECT);
    expect(message).toHaveValue(BODY);
    expect(subject).toHaveAttribute('readonly');
    expect(screen.getByText(counter(BODY), { exact: false })).toBeInTheDocument();
    await stopTracking();
    await waitFor(() => expect(heldAttempts(CREATE_LOCK)).toHaveLength(0), SLOW);
    await waitFor(() => expect(subject).not.toHaveAttribute('readonly'), SLOW);
    expect(subject).toHaveValue(SUBJECT);
    expect(message).toHaveValue(BODY);
    expect(screen.getByText(counter(BODY), { exact: false })).toBeInTheDocument();
    expect(writes()).toBe(1);
  });
});
