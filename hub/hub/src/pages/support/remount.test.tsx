// A send's answer that comes after its box or drawer was left
// (the thread is keyed per ticket; the palette can leave the New ticket drawer) belongs to the next box or drawer of
// the same lock. A definite refusal comes back with its words and its text to edit, whether the box was opened again
// before the answer or after it. A created ticket opens from a drawer that was open while the send was out, never from
// one opened after it. Another account's or realm's answer is never shown.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { heldAttempts, holdAttempt, resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, readChangesState, setChangeStoreAdapter, writeChanges } from '@core/change-store';
import { bump } from '@core/ctx';
import kitStrings from '@kit/strings.en.json';
import { beforeEach, describe, expect, it } from 'vitest';
import { BY_CREATE, CREATE_LOCK, keepAnswer, replyLock, resetUnclaimedForTests, roomFor, sendReply, stopTracking, unclaimedLocksForTests } from './data';
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
const answered = (route: 'create' | 'reply') => requestLog.filter((x) => x.route === route).length;
/** No attempt is held, read from a clean store only: an unreadable store or a corrupt one (only its valid subset)
 *  proves nothing about the hold, so it never counts as "gone". */
const noAttemptHeld = (): boolean => {
  const read = readChangesState();
  return read.state === 'clean' && !read.list.some((x) => x.id.startsWith(ATTEMPT_PREFIX));
};
/** The tag of answerProcessed's own failure: the hold never proven gone. */
const HOLD_NOT_GONE = 'answerProcessed: hold not proven gone';
/** The send's answer is processed: its hold has left the store (released when the answer came), and the chain that
 *  keeps or drops the answer, a microtask later, has run (a macrotask after). */
async function answerProcessed(wait: { timeout: number } = SLOW) {
  await waitFor(() => expect(noAttemptHeld(), HOLD_NOT_GONE).toBe(true), wait);
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
}

async function replyThenLeave(): Promise<R> {
  const r = await renderPage(page, { state: 'refusedSlow', path: `/support?sel=${OPEN_ID}` });
  const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
  await userEvent.type(box, TEXT);
  await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
  await waitFor(() => expect(answered('reply')).toBe(1), SLOW);
  await go(r, `/support?sel=${LONG_ID}`);
  return r;
}

async function createThenLeave(state: string): Promise<R> {
  const r = await renderPage(page, { state, path: '/support' });
  putPrefill({ category: 'billing', subject: SUBJECT, body: BODY });
  await go(r, '/support?new=1');
  await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
  await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
  await waitFor(() => expect(answered('create')).toBe(1), SLOW);
  await go(r, '/support');
  await waitFor(() => expect(screen.queryByRole('textbox', { name: strings['new.subject'] })).toBeNull(), SLOW);
  return r;
}

describe('a reply refused after its box was left', () => {
  it('the box opened again while it is out: the refusal is said and the text is back to edit', { timeout: 60000 }, async () => {
    const r = await replyThenLeave();
    await go(r, `/support?sel=${OPEN_ID}`);
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
    expect(await screen.findByText(strings['quota.messages_day'], { exact: false }, SLOW)).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveValue(TEXT));
    expect(box).not.toHaveAttribute('readonly');
    expect(answered('reply')).toBe(1);
  });

  it('the box opened again after the answer: the same', { timeout: 60000 }, async () => {
    const r = await replyThenLeave();
    // Wait out the answer while another ticket is shown: its hold ends with it.
    await waitFor(() => expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0), SLOW);
    await go(r, `/support?sel=${OPEN_ID}`);
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
    expect(await screen.findByText(strings['quota.messages_day'], { exact: false }, SLOW)).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveValue(TEXT));
  });

  it("another ticket's box never takes it", { timeout: 60000 }, async () => {
    await replyThenLeave();
    await waitFor(() => expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0), SLOW);
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, SLOW);
    expect(box).toHaveValue('');
    expect(screen.queryByText(strings['quota.messages_day'], { exact: false })).toBeNull();
  });
});

describe('a new ticket refused after its drawer was left', () => {
  it('the drawer opened again while it is out: the refusal is said and the fields hold the text', { timeout: 60000 }, async () => {
    const r = await createThenLeave('refusedSlow');
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    expect(await screen.findByText(strings['quota.tickets_day'], { exact: false }, SLOW)).toBeInTheDocument();
    await waitFor(() => expect(subject).toHaveValue(SUBJECT));
    expect(screen.getByRole('textbox', { name: strings['new.message'] })).toHaveValue(BODY);
    expect(subject).not.toHaveAttribute('readonly');
    expect(answered('create')).toBe(1);
  });

  it('the drawer opened again after the answer: the same', { timeout: 60000 }, async () => {
    const r = await createThenLeave('refusedSlow');
    await waitFor(() => expect(heldAttempts(CREATE_LOCK)).toHaveLength(0), SLOW);
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    expect(await screen.findByText(strings['quota.tickets_day'], { exact: false }, SLOW)).toBeInTheDocument();
    await waitFor(() => expect(subject).toHaveValue(SUBJECT));
  });

  it('a hold freed in another tab while it is out: its late refusal never comes back over the new text', { timeout: 60000 }, async () => {
    // Another tab's Stop tracking frees the hold while the request is out; the lock is free for new text.
    const r = await createThenLeave('refusedSlow');
    const kept = readChanges();
    writeChanges(kept!.filter((x) => !x.id.startsWith(ATTEMPT_PREFIX))); // the other tab's free, as stored
    expect(heldAttempts(CREATE_LOCK)).toHaveLength(0);
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    expect(subject).not.toHaveAttribute('readonly');
    await userEvent.type(subject, 'Newer');
    await new Promise((res) => setTimeout(res, 7000)); // reason: past the fixture's 6 s refusal, which must not land
    expect(subject).toHaveValue('Newer');
    expect(screen.queryByText(strings['quota.tickets_day'], { exact: false })).toBeNull();
    expect(answered('create')).toBe(1);
  });

  it('a newer send holds the lock when the drawer opens again: the old refusal is dropped, never said, even once it ends', { timeout: 60000 }, async () => {
    // The old answer was kept (its hold ended normally); then a newer send, as another tab's, holds the lock.
    const r = await createThenLeave('refusedSlow');
    await waitFor(() => expect(heldAttempts(CREATE_LOCK)).toHaveLength(0), SLOW);
    const got = await holdAttempt(CREATE_LOCK, { by: BY_CREATE, meta: { ticket: null, category: 'billing' } });
    expect(got.ok).toBe(true);
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await new Promise((res) => setTimeout(res, 300)); // reason: a kept answer would be taken in an effect after mount
    expect(subject).not.toHaveValue(SUBJECT);
    expect(screen.queryByText(strings['quota.tickets_day'], { exact: false })).toBeNull();
    act(() => void (got.ok && got.hold.release()));
    await waitFor(() => expect(subject).not.toHaveAttribute('readonly'), SLOW);
    await new Promise((res) => setTimeout(res, 300)); // reason: nothing may come back once the newer hold ends
    expect(subject).toHaveValue('');
    expect(screen.queryByText(strings['quota.tickets_day'], { exact: false })).toBeNull();
  });

  it("after a switch of account or realm the kept answer is another context's: never shown", { timeout: 60000 }, async () => {
    const r = await createThenLeave('refusedSlow');
    await waitFor(() => expect(heldAttempts(CREATE_LOCK)).toHaveLength(0), SLOW);
    act(() => void bump('switch'));
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    expect(subject).toHaveValue('');
    expect(screen.queryByText(strings['quota.tickets_day'], { exact: false })).toBeNull();
  });

  it('a switch while the send is out: its late definite answer is never kept under the ended context', { timeout: 60000 }, async () => {
    // The bump's cleanup runs before the answer comes; a busy refusal is definite even for an ended context.
    await createThenLeave('busySlow');
    act(() => void bump('switch'));
    expect(unclaimedLocksForTests()).toEqual([]);
    await answerProcessed(); // Waits on the answer itself, never a fixed wait
    expect(answered('create')).toBe(1);
    expect(unclaimedLocksForTests()).toEqual([]);
  });
});

describe('a new ticket created after its drawer was left', () => {
  it('a drawer open while it was out opens the created ticket', { timeout: 60000 }, async () => {
    const r = await createThenLeave('sendSlow');
    await go(r, '/support?new=1');
    await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    // The created ticket opens: the page selects it once the drawer has closed (view.tsx created/openAfterClose).
    await waitFor(() => expect(r.router.state.location.search).toHaveProperty('sel'), SLOW);
    expect(r.router.state.location.search).not.toHaveProperty('new');
    expect(answered('create')).toBe(1);
    expect(screen.queryByRole('textbox', { name: strings['new.subject'] })).toBeNull();
  });

  it("a drawer that showed only another send's hold never opens this send's created ticket", { timeout: 60000 }, async () => {
    // The drawer opens a created ticket only for a send it showed held. Another tab's
    // record for the lock, stored ahead of this send's, is the hold the drawer shows; it leaves the store in the same
    // write that frees this send's hold when its answer comes, so the drawer never shows this send held.
    const r = await createThenLeave('sendSlow');
    const list = readChanges()!;
    const mine = list.find((x) => x.id.startsWith(ATTEMPT_PREFIX))!;
    const other = { ...mine, id: `${mine.id.slice(0, mine.id.lastIndexOf('\u0000') + 1)}other-tab`, t: mine.t - 1 };
    // The records live in this test's store while it runs; the write that frees this send's hold drops the other too.
    let stored: string | null = null;
    setChangeStoreAdapter({
      read: () => stored,
      write(text) {
        if (text !== null) {
          const rows = JSON.parse(text) as Array<{ id?: string }>;
          if (!rows.some((x) => x.id === mine.id) && rows.some((x) => x.id === other.id)) {
            const rest = rows.filter((x) => x.id !== other.id);
            text = rest.length ? JSON.stringify(rest) : null;
          }
        }
        stored = text;
        return true;
      },
    });
    writeChanges([other, ...list]);
    try {
      await go(r, '/support?new=1');
      await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
      expect(heldAttempts(CREATE_LOCK).map((h) => h.id)).toEqual([other.id, mine.id]);
      await answerProcessed();
    } finally {
      const left = readChanges() ?? [];
      setChangeStoreAdapter(null);
      writeChanges(left);
    }
    await new Promise((res) => setTimeout(res, 300)); // reason: a settled answer opens the ticket in an effect after the render
    expect(r.router.state.location.search).not.toHaveProperty('sel');
    expect(r.router.state.location.search).toHaveProperty('new');
    expect(screen.getByRole('textbox', { name: strings['new.subject'] })).toBeInTheDocument();
    expect(unclaimedLocksForTests()).toEqual([]);
  });

  it('a lost answer opens nothing: the drawer opened again stays locked on the text with Check again, nothing sent again', { timeout: 60000 }, async () => {
    // Only a definite success opens the ticket: a lost answer is the stored hold, read back.
    const r = await createThenLeave('lostSlow');
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await waitFor(() => expect(heldAttempts(CREATE_LOCK)).toHaveLength(1), SLOW);
    expect(await screen.findByRole('button', { name: kitStrings['outcome.pending.check'] }, SLOW)).toBeInTheDocument();
    expect(subject).toHaveValue(SUBJECT);
    expect(subject).toHaveAttribute('readonly');
    expect(r.router.state.location.search).toMatchObject({ new: '1' });
    expect(r.router.state.location.search).not.toHaveProperty('sel');
    expect(answered('create')).toBe(1);
  });

  it('a lost answer is never kept: after Stop tracking the drawer opened again starts empty and free', { timeout: 60000 }, async () => {
    // Its hold is the stored record; once the person stops tracking it, nothing of that send may come back.
    const r = await createThenLeave('lostSlow');
    await new Promise((res) => setTimeout(res, 7000)); // reason: past the fixture's 6 s lost answer, which no page shows
    const [h] = heldAttempts(CREATE_LOCK);
    expect(h).toBeDefined();
    act(() => void expect(stopTracking(h!)).toBe(true));
    expect(heldAttempts(CREATE_LOCK)).toHaveLength(0);
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await new Promise((res) => setTimeout(res, 300)); // reason: a kept answer would be taken in an effect after mount
    expect(subject).toHaveValue('');
    expect(subject).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: kitStrings['outcome.pending.check'] })).toBeNull();
    expect(answered('create')).toBe(1);
  });

  it('Stop tracking, then a newer send: the old late success opens nothing while the newer send is out', { timeout: 60000 }, async () => {
    // The old answer is not this drawer's (it showed only the newer hold); only the newer answer opens.
    const r = await createThenLeave('sendSlow');
    const [h] = heldAttempts(CREATE_LOCK);
    expect(h).toBeDefined();
    act(() => void expect(stopTracking(h!)).toBe(true));
    putPrefill({ category: 'billing', subject: 'Second', body: BODY });
    await go(r, '/support?new=1');
    await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    await waitFor(() => expect(answered('create')).toBe(2), SLOW);
    // The newer hold outlives the old answer (sent later, answered SLOW_WRITE_MS after it is sent): nothing may open
    // while it is held, and the drawer stays on it.
    const early: unknown[] = [];
    while (heldAttempts(CREATE_LOCK).length > 0) {
      const q = r.router.state.location.search as Record<string, unknown>;
      if ('sel' in q || screen.queryByRole('textbox', { name: strings['new.subject'] }) === null) early.push(q);
      await act(async () => void (await new Promise((res) => setTimeout(res, 100)))); // reason: sample until the newer answer
    }
    expect(early).toEqual([]);
    await waitFor(() => expect(r.router.state.location.search).toHaveProperty('sel'), SLOW);
    expect(answered('create')).toBe(2);
  });

  it('a drawer opened after the answer starts empty and stays', { timeout: 60000 }, async () => {
    const r = await createThenLeave('sendSlow');
    await waitFor(() => expect(heldAttempts(CREATE_LOCK)).toHaveLength(0), SLOW);
    await go(r, '/support?new=1');
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, SLOW);
    await new Promise((res) => setTimeout(res, 300));
    expect(subject).toHaveValue('');
    expect(r.router.state.location.search).toMatchObject({ new: '1' });
  });
});

describe('room for a kept answer', () => {
  it('eight answers still wanted fill the room: a ninth is not kept and none of them is pushed out; after a switch it is', { timeout: 60000 }, async () => {
    await renderPage(page, { state: 'refusedSlow', path: '/support' });
    // Tickets that do not exist: each reply is refused at once, a definite answer, as if its box was left before it.
    const ids = Array.from({ length: 9 }, (_, i) => String(901 + i));
    const results = await Promise.all(ids.slice(0, 8).map((id) => sendReply(id, TEXT)));
    for (const r of results) expect(r.verdict).toBe('notFound');
    act(() => results.forEach(keepAnswer));
    const eight = ids.slice(0, 8).map(replyLock);
    expect(unclaimedLocksForTests()).toEqual(eight);
    const ninth = await sendReply(ids[8]!, TEXT);
    act(() => keepAnswer(ninth));
    expect(unclaimedLocksForTests()).toEqual(eight);
    act(() => void bump('switch')); // their context ends: the switch drops them all
    expect(unclaimedLocksForTests()).toEqual([]);
    const again = await sendReply(ids[8]!, TEXT);
    act(() => keepAnswer(again));
    expect(unclaimedLocksForTests()).toEqual([replyLock(ids[8]!)]);
  });

  const live = (n: number) => Array.from({ length: n }, (_, i) => [`lock-${i}`, true] as const);
  it("a lock's newer answer replaces its own older one, full or not", () => {
    expect(roomFor(live(3), 'lock-1', 8)).toEqual({ drop: 'lock-1' });
    expect(roomFor(live(8), 'lock-5', 8)).toEqual({ drop: 'lock-5' });
  });
  it('under the cap a new lock is kept and nothing is dropped', () => {
    expect(roomFor(live(7), 'new', 8)).toEqual({ drop: null });
  });
  it('past the cap the oldest answer of an ended context goes, never a live one', () => {
    const e = [['a', true], ['b', false], ['c', true], ['d', false]] as const;
    expect(roomFor(e, 'new', 4)).toEqual({ drop: 'b' });
  });
  it('past the cap with every answer still wanted, the new one is not kept and none is dropped', () => {
    expect(roomFor(live(8), 'new', 8)).toBeNull();
  });
});

describe('answerProcessed reads absence only from a clean store', () => {
  it('an unreadable or corrupt store never counts as the hold gone; a clean empty one does', async () => {
    // `readChanges() ?? []` read an unreadable store (null) as empty and a
    // corrupt one as its valid subset, so the wait could end before the hold left and keepAnswer ran.
    const short = { timeout: 300 };
    // The wait times out on its own assertion (the hold not proven gone), never on another error: a throw from the
    // read itself, or any unrelated exception, fails this test. The assertion is
    // tagged and the check is anchored at the message start (waitFor appends the DOM after it) and on its name.
    const notGone = (e: unknown): boolean =>
      e instanceof Error && e.name === 'AssertionError' && e.message.startsWith(`${HOLD_NOT_GONE}: expected false to be true`);
    try {
      setChangeStoreAdapter({
        read: () => {
          throw new Error('unreadable');
        },
        write: () => true,
      });
      await expect(answerProcessed(short)).rejects.toSatisfy(notGone);
      setChangeStoreAdapter({ read: () => '[{"id":"not a record"}]', write: () => true });
      await expect(answerProcessed(short)).rejects.toSatisfy(notGone);
      setChangeStoreAdapter({ read: () => null, write: () => true });
      await expect(answerProcessed(short)).resolves.toBeUndefined();
    } finally {
      setChangeStoreAdapter(null);
    }
  });
});
