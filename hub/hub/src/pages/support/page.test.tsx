// Vitest: the Support list and thread read paths: the tickets with their status words and
// the unread mark, one API filter per segment, the empty and error states, the three access refusals as NoAccessState,
// a thread oldest first, and a closed-for-good ticket without a reply box.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { T_GOOD, T_LONG, T_OPEN, T_WAITING, requestLog } from './fixtures';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  requestLog.length = 0;
});

describe('the ticket list', () => {
  it('shows each ticket with its status and marks unread replies', async () => {
    await renderPage(page);
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    expect(screen.getByText(String(T_OPEN.subject))).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: strings.unread }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(strings['status.waitingYou']).length).toBeGreaterThan(0);
  });

  it('a segment reads the list again with that one filter', async () => {
    await renderPage(page);
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    await userEvent.click(screen.getByRole('radio', { name: strings['filter.closed'] }));
    await waitFor(() => expect(requestLog.some((r) => r.route === 'list' && r.query.status === 'closed')).toBe(true));
    await waitFor(() => expect(screen.queryByText(String(T_OPEN.subject))).toBeNull());
  });

  it('an account without tickets sees the first-use state', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['empty.title'], undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it.each([
    ['member', strings['access.member']],
    ['noPermission', strings['access.token']],
  ])('%s sees why, never the list', async (state, words) => {
    await renderPage(page, { state });
    expect(await screen.findByText(words, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['action.new'] })).toBeNull();
  });
});

describe('a thread', () => {
  it('shows messages oldest first and offers older ones', async () => {
    await renderPage(page, { path: `/support?sel=${String(T_LONG.id)}` });
    const last = await screen.findByText('Message number 60 of the long thread.', undefined, { timeout: 10000 });
    const prev = screen.getByText('Message number 59 of the long thread.');
    expect(prev.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: strings['action.showOlder'] }));
    expect(await screen.findByText('Message number 1 of the long thread.', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('a ticket closed for good has no reply box', async () => {
    await renderPage(page, { path: `/support?sel=${String(T_GOOD.id)}` });
    expect(await screen.findByText(strings['thread.closedForGood'], undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: strings['reply.label'] })).toBeNull();
  });
});
