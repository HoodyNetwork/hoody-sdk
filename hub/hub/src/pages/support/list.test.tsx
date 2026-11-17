// Vitest: the Support list's order and paging, and the reads that follow a thread (the conformance exception in
// app/conformance.test.ts EXCEPTIONS.support: no sort and no page key, so the list must be the API's order and Load more
// must follow the cursor). INVALID_CURSOR from a Load more page starts again from page one, once per visit to a filter; the
// unread mark and the nav count follow a thread read and the window coming back; Show older says when it failed and
// Try again reads that same page again; a token session sees why, never a generic error.
import { act, renderHook, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { T_CLOSED, T_CLOSED_UNREAD, T_GOOD, T_HOSTILE, T_LONG, T_OPEN, T_WAITING, requestLog } from './fixtures';
import { CoreQueryProvider } from '@core';
import { useUnreadCount } from './count';
import { noAccessOf } from './logic';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  requestLog.length = 0;
});

const API_ORDER = [T_LONG, T_CLOSED, T_WAITING, T_HOSTILE, T_OPEN, T_GOOD, T_CLOSED_UNREAD].map((t) => String(t.subject));
const table = () => screen.getByRole('table', { name: strings.title });
const shownSubjects = () => {
  const rows = within(table()).getAllByRole('row').slice(1);
  return rows.map((r) => API_ORDER.find((s) => r.textContent?.includes(s))).filter((s): s is string => !!s);
};
const listReads = () => requestLog.filter((r) => r.route === 'list' && r.query.limit !== '50');
const loadMore = () => userEvent.click(screen.getByRole('button', { name: strings['action.loadMore'] }));

describe("the list's notes sit in the list", () => {
  // Above the list, as the list's own notices (ListDetailPage toolbar), not loose lines over both panes.
  const listPane = () => screen.getByRole('region', { name: strings.title });
  it('a ticket left out is said in the list pane, as a notice', async () => {
    await renderPage(page, { state: 'dropped' });
    const note = await screen.findByText(strings['list.dropped'], undefined, { timeout: 10000 });
    expect(listPane()).toContainElement(note);
    expect(note.closest('[role="status"]')).not.toBeNull();
  });
  it('the unchecked replies note is said in the list pane, as a notice', async () => {
    await renderPage(page, { state: 'badgePartial' });
    const note = await screen.findByText(strings['list.badgePartial'], undefined, { timeout: 10000 });
    expect(listPane()).toContainElement(note);
    expect(note.closest('[role="status"]')).not.toBeNull();
  });
  // The notes are absent when nothing calls for them.
  const noNotes = () => {
    expect(screen.queryByText(strings['list.dropped'])).toBeNull();
    expect(screen.queryByText(strings['list.badgePartial'])).toBeNull();
  };
  // The page's own count (the hook the nav badge and the unchecked note read) has settled to a number: only then can an
  // absent note mean the page decided it (a request that ARRIVED proves nothing about its answer).
  const countSettled = async () => {
    const { result } = renderHook(() => useUnreadCount(), { wrapper: CoreQueryProvider });
    await waitFor(() => expect(result.current).not.toBeNull(), { timeout: 10000 });
  };
  it('a whole, checked list says neither note', async () => {
    await renderPage(page, { path: '/support' });
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    await countSettled();
    noNotes();
  });
  it('an empty list says neither note', async () => {
    await renderPage(page, { state: 'empty', path: '/support' });
    await screen.findByText(strings['empty.title'], undefined, { timeout: 10000 });
    await countSettled();
    noNotes();
  });
  it('a filter whose rows are all readable drops the left-out note; one that meets the bad row keeps it', async () => {
    await renderPage(page, { state: 'dropped', path: '/support?status=closed' });
    await screen.findByText(String(T_CLOSED.subject), undefined, { timeout: 10000 });
    expect(screen.queryByText(strings['list.dropped'])).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: strings['filter.waitingSupport'] }));
    const note = await screen.findByText(strings['list.dropped'], undefined, { timeout: 10000 });
    expect(listPane()).toContainElement(note);
  });
});

describe('the list is the API order, paged by cursor', () => {
  it('keeps the API order on page one and appends page two after it, never re-sorted', async () => {
    await renderPage(page, { state: 'apiOrder' });
    await screen.findByText(API_ORDER[0]!, undefined, { timeout: 10000 });
    expect(shownSubjects()).toEqual(API_ORDER.slice(0, 3));
    await loadMore();
    await screen.findByText(API_ORDER[3]!, undefined, { timeout: 10000 });
    expect(shownSubjects()).toEqual(API_ORDER.slice(0, 6));
    // Load more sent page one's cursor, under the same (absent) filter.
    const reads = listReads();
    expect(reads[0]?.query.cursor).toBeUndefined();
    expect(reads.some((r) => r.query.cursor === 'p3' && r.query.status === undefined)).toBe(true);
  });

  it('leaving a filter and coming back drops the loaded pages: page one only, no old cursor', async () => {
    await renderPage(page, { state: 'apiOrder' });
    await screen.findByText(API_ORDER[0]!, undefined, { timeout: 10000 });
    await loadMore();
    await screen.findByText(API_ORDER[3]!, undefined, { timeout: 10000 });
    expect(shownSubjects()).toEqual(API_ORDER.slice(0, 6));
    // Away to Closed (no Load more there) and back to All.
    await userEvent.click(screen.getByRole('radio', { name: strings['filter.closed'] }));
    await screen.findByText(String(T_CLOSED.subject), undefined, { timeout: 10000 });
    await userEvent.click(screen.getByRole('radio', { name: strings['filter.all'] }));
    await screen.findByText(API_ORDER[0]!, undefined, { timeout: 10000 });
    await waitFor(() => expect(shownSubjects()).toEqual(API_ORDER.slice(0, 3)), { timeout: 10000 });
    expect(screen.queryByText(API_ORDER[3]!)).toBeNull();
  });

  it('a Load more cursor refused INVALID_CURSOR starts again from page one, once, and Load more then continues', async () => {
    await renderPage(page, { state: 'cursorExpired' });
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    await loadMore();
    // The refused cursor, then page one read again (no cursor): a fresh cursor comes back.
    await waitFor(() => expect(listReads().filter((r) => !r.query.cursor).length).toBeGreaterThanOrEqual(2), { timeout: 10000 });
    expect(listReads().some((r) => r.query.cursor === 'g1-3')).toBe(true);
    expect(screen.queryByText(strings['list.partial'])).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: strings['action.loadMore'] })).toBeEnabled(), { timeout: 10000 });
    await loadMore();
    await waitFor(() => expect(listReads().some((r) => /^g[2-9]-3$/.test(String(r.query.cursor)))).toBe(true), { timeout: 10000 });
    await screen.findByText(String(T_CLOSED.subject), undefined, { timeout: 10000 });
    expect(screen.queryByText(strings['list.partial'])).toBeNull();
  });

  it('a cursor refused again after the restart is the partial band; its Try again starts from page one', async () => {
    await renderPage(page, { state: 'cursorDead' });
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    await loadMore();
    await waitFor(() => expect(listReads().filter((r) => !r.query.cursor).length).toBeGreaterThanOrEqual(2), { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: strings['action.loadMore'] })).toBeEnabled(), { timeout: 10000 });
    const firsts = listReads().filter((r) => !r.query.cursor).length;
    await loadMore();
    expect(await screen.findByText(strings['list.partial'], undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(listReads().filter((r) => !r.query.cursor).length).toBe(firsts);
    // Try again starts from page one again, never the refused cursor.
    const cursorReads = listReads().filter((r) => r.query.cursor).length;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(listReads().filter((r) => !r.query.cursor).length).toBeGreaterThan(firsts), { timeout: 10000 });
    expect(listReads().filter((r) => r.query.cursor).length).toBe(cursorReads);
  });

  it('leaving a filter and coming back gives the next refusal its own restart, not the partial band', async () => {
    await renderPage(page, { state: 'cursorDead' });
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    await loadMore();
    await waitFor(() => expect(listReads().filter((r) => !r.query.cursor).length).toBeGreaterThanOrEqual(2), { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: strings['action.loadMore'] })).toBeEnabled(), { timeout: 10000 });
    // Away to Closed (no refusal there) and back to All.
    await userEvent.click(screen.getByRole('radio', { name: strings['filter.closed'] }));
    await screen.findByText(String(T_CLOSED.subject), undefined, { timeout: 10000 });
    await userEvent.click(screen.getByRole('radio', { name: strings['filter.all'] }));
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: strings['action.loadMore'] })).toBeEnabled(), { timeout: 10000 });
    const firsts = listReads().filter((r) => !r.query.cursor && r.query.status === undefined).length;
    await loadMore();
    // The refusal restarts from page one again; no partial band.
    await waitFor(() => expect(listReads().filter((r) => !r.query.cursor && r.query.status === undefined).length).toBeGreaterThan(firsts), { timeout: 10000 });
    expect(screen.queryByText(strings['list.partial'])).toBeNull();
    // That visit's second refusal is the partial band.
    await waitFor(() => expect(screen.getByRole('button', { name: strings['action.loadMore'] })).toBeEnabled(), { timeout: 10000 });
    await loadMore();
    expect(await screen.findByText(strings['list.partial'], undefined, { timeout: 10000 })).toBeInTheDocument();
  });
});

describe('reads that follow a thread', () => {
  it('opening an unread ticket reads the list again: its unread mark goes', async () => {
    await renderPage(page);
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    // Rows with a mark: beside a ticket the rail draws it in the lead column, and the name cell's copy stays in the DOM, hidden by CSS.
    const marks = () => new Set(screen.queryAllByRole('img', { name: strings.unread }).map((el) => el.closest('tr, [role="row"]'))).size;
    const unreadBefore = marks();
    await userEvent.click(screen.getByText(String(T_WAITING.subject)));
    await screen.findByText(/We restarted the host/, undefined, { timeout: 10000 });
    await waitFor(() => expect(marks()).toBe(unreadBefore - 1), { timeout: 10000 });
  });

  it('the window coming back reads the list again', async () => {
    await renderPage(page);
    await screen.findByText(String(T_WAITING.subject), undefined, { timeout: 10000 });
    const before = requestLog.filter((r) => r.route === 'list').length;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(requestLog.filter((r) => r.route === 'list').length).toBeGreaterThan(before), { timeout: 10000 });
  });

  it('a failed Show older says so; Try again reads that same page again, once', async () => {
    await renderPage(page, { state: 'olderErrorOnce', path: `/support?sel=${String(T_LONG.id)}` });
    await screen.findByText('Message number 60 of the long thread.', undefined, { timeout: 10000 });
    await userEvent.click(screen.getByRole('button', { name: strings['action.showOlder'] }));
    expect(await screen.findByText(strings['thread.olderFailed'], undefined, { timeout: 10000 })).toBeInTheDocument();
    const olderReads = () => requestLog.filter((r) => r.route === 'get' && r.query.before_seq);
    expect(olderReads()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Message number 1 of the long thread.', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(olderReads()).toHaveLength(2);
    expect(new Set(olderReads().map((r) => r.query.before_seq)).size).toBe(1);
  });
});

describe('a token session', () => {
  it('sees why Support is not open to it, never a generic error', async () => {
    await renderPage(page, { state: 'token' });
    expect(await screen.findByText(strings['access.signIn'], undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(requestLog).toHaveLength(0);
  });

  it("core's unsent refusal of a token session maps to the same words", () => {
    expect(noAccessOf('TOKEN_SESSION_REFUSED', null)).toBe('signIn');
  });
});
