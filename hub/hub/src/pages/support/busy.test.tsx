// Vitest: every Support button that waits on a read or a send shows it. Show older,
// Send ticket and Send are kit Buttons whose `busy` is RAC's pending state (data-pending, the spinner, presses refused).
// A kit Button that dropped a caller's `isPending` would show nothing here. Load more takes `busy` too, but it
// is not shown while its page reads (the list's next cursor is the unread page's, so the button leaves until it lands);
// keeping it in place while busy is a later change, not tested here.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import { beforeEach, describe, expect, it } from 'vitest';
import { T_LONG, T_OPEN, requestLog } from './fixtures';
import { putPrefill, resetPrefillForTests } from './links';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 15000 };
const button = (name: string) => screen.getByRole('button', { name });
const pending = (name: string) => button(name).hasAttribute('data-pending');

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetPrefillForTests();
  requestLog.length = 0;
});

describe('Support: a button that waits says so and takes no second press', () => {
  it('Show older is pending while the older page reads', { timeout: 60000 }, async () => {
    await renderPage(page, { latency: 'slow', path: `/support?sel=${String(T_LONG.id)}` });
    await screen.findByText('Message number 60 of the long thread.', undefined, SLOW);
    await userEvent.click(button(strings['action.showOlder']));
    await waitFor(() => expect(pending(strings['action.showOlder'])).toBe(true), SLOW);
    const olderReads = requestLog.filter((r) => r.route === 'get' && r.query.before_seq).length;
    await userEvent.click(button(strings['action.showOlder']));
    expect(requestLog.filter((r) => r.route === 'get' && r.query.before_seq).length).toBe(olderReads);
    expect(await screen.findByText('Message number 1 of the long thread.', undefined, SLOW)).toBeInTheDocument();
  });

  it('Send is pending while the reply is sent', { timeout: 60000 }, async () => {
    await renderPage(page, { latency: 'slow', path: `/support?sel=${String(T_OPEN.id)}` });
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
    await userEvent.type(box, 'Any news on the invoice?');
    await userEvent.click(button(strings['action.send']));
    await waitFor(() => expect(pending(strings['action.send'])).toBe(true), SLOW);
    // A second press and the keyboard send (Ctrl+Enter in the box) while the first is out: neither sends again.
    await userEvent.click(button(strings['action.send']));
    await userEvent.type(box, '{Control>}{Enter}{/Control}');
    await waitFor(() => expect(pending(strings['action.send'])).toBe(false), SLOW);
    expect(requestLog.filter((r) => r.route === 'reply')).toHaveLength(1);
  });

  it('Send ticket is pending while the ticket is sent', { timeout: 60000 }, async () => {
    const r = await renderPage(page, { latency: 'slow', path: '/support' });
    putPrefill({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await userEvent.click(button(strings['action.sendTicket']));
    await waitFor(() => expect(pending(strings['action.sendTicket'])).toBe(true), SLOW);
    await userEvent.click(button(strings['action.sendTicket'])); // a second press while the first is out
    await waitFor(() => expect(requestLog.filter((x) => x.route === 'create')).toHaveLength(1), SLOW);
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['action.sendTicket'] })?.hasAttribute('data-pending') ?? false).toBe(false), SLOW);
    expect(requestLog.filter((x) => x.route === 'create')).toHaveLength(1);
  });
});
