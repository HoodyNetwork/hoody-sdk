// Vitest: Check again never writes and never settles on content. After a lost
// create or reply, Check again sends no write at all; a possible match (the server stored it, an older identical
// message, the same ticket content twice) is a hint only: the banner stays pending and the draft stays locked. Only the
// warned Stop tracking unlocks the draft, and only then does Send mint a new client key. A held send of one account is
// not shown under another. A lost create shows the held banner only, never a failed one beside it; a support 503
// refusal is a definite refusal in its own words. A lost close is held too: no second Close while it is, after a
// remount as well, and only a read showing the ticket closed (or Stop tracking) frees it.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { heldAttempts, resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import { identity, setIdentity } from '@core/ctx';
import kit from '@kit/strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATE_LOCK, closeLock, replyLock } from './data';
import { T_OPEN, requestLog } from './fixtures';
import { putPrefill, resetPrefillForTests } from './links';
import page from './page';
import strings from './strings.en.json';

const OPEN_ID = String(T_OPEN.id);
const writes = () => requestLog.filter((r) => r.route === 'create' || r.route === 'reply' || r.route === 'close');
const keyOf = (r: (typeof requestLog)[number]) => (r.body as { client_key?: unknown } | undefined)?.client_key;

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetPrefillForTests();
  requestLog.length = 0;
});

async function sendReply(state: string, text: string) {
  await renderPage(page, { state, path: `/support?sel=${OPEN_ID}` });
  const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, { timeout: 10000 });
  await userEvent.type(box, text);
  await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
  await screen.findByText(strings['send.known'], undefined, { timeout: 10000 });
  return box;
}

/** Press Check again and wait for its reads. */
async function checkAgain(): Promise<void> {
  const before = requestLog.length;
  await userEvent.click(screen.getByRole('button', { name: kit['outcome.pending.check'] }));
  await waitFor(() => expect(requestLog.length).toBeGreaterThan(before), { timeout: 10000 });
}

/** The banner is still the pending one, the draft is still locked, the hold is still there. The line saying what Check
 *  again does stays after a check; its result is a line of its own, in a status region so it is read aloud. */
function stillUnknown(box: HTMLElement, lock: string) {
  expect(screen.getByText(strings['send.known'])).toBeInTheDocument();
  expect(screen.getByText(strings['send.checkLine'])).toBeInTheDocument();
  const banner = screen.getByText(strings['send.known']).closest('[data-outcome]') as HTMLElement;
  expect(within(banner).getByRole('status').textContent).toMatch(/checked at|in the ticket/);
  expect(box).toHaveAttribute('readonly');
  expect(heldAttempts(lock)).toHaveLength(1);
}

describe('Check again after a lost reply', () => {
  it('sends no write and finds nothing when nothing was stored', async () => {
    const box = await sendReply('sendUnknown', 'Any news on the invoice?');
    expect(writes()).toHaveLength(1);
    await checkAgain();
    await screen.findByText(/^Not found \(checked at/, undefined, { timeout: 10000 });
    expect(writes()).toHaveLength(1);
    stillUnknown(box, replyLock(OPEN_ID));
  });

  it('a stored identical message (this send, or another tab’s) is a hint and settles nothing', async () => {
    const box = await sendReply('sendUnknownApplied', 'Any news on the invoice?');
    await checkAgain();
    await screen.findByText(/^A message like this one is in the ticket/, undefined, { timeout: 10000 });
    expect(writes()).toHaveLength(1);
    stillUnknown(box, replyLock(OPEN_ID));
  });

  it('an older identical own message is not a match', async () => {
    const box = await sendReply('sendUnknown', 'The invoice for October lists Germany, but my billing address is in Austria.');
    await checkAgain();
    await screen.findByText(/^Not found \(checked at/, undefined, { timeout: 10000 });
    expect(writes()).toHaveLength(1);
    stillUnknown(box, replyLock(OPEN_ID));
  });

  it('Stop tracking asks first; only then does Send go out again, under a new key', async () => {
    const box = await sendReply('sendUnknown', 'Any news on the invoice?');
    await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(dialog).toHaveTextContent(kitStates['outcome.pending.dismissTitle']);
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }));
    await waitFor(() => expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0));
    await waitFor(() => expect(box).not.toHaveAttribute('readonly'));
    await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
    await waitFor(() => expect(writes()).toHaveLength(2), { timeout: 10000 });
    const [a, b] = writes();
    expect(typeof keyOf(a!)).toBe('string');
    expect(keyOf(b!)).not.toBe(keyOf(a!));
  });
});

describe('Check again after a lost create', () => {
  it('the same ticket content stored (once or twice) is a hint and settles nothing', async () => {
    const r = await renderPage(page, { state: 'sendUnknownApplied', path: '/support' });
    putPrefill({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, { timeout: 10000 });
    expect(subject).toHaveValue('Invoice shows the wrong country');
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    await screen.findByText(strings['send.known'], undefined, { timeout: 10000 });
    expect(writes()).toHaveLength(1);
    await checkAgain();
    await screen.findByText(/^A message like this one is in the ticket/, undefined, { timeout: 10000 });
    expect(writes()).toHaveLength(1);
    stillUnknown(subject, CREATE_LOCK);
  });

  it('shows the held banner only: never a failed banner beside it', async () => {
    const r = await renderPage(page, { state: 'sendUnknown', path: '/support' });
    putPrefill({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    await screen.findByRole('textbox', { name: strings['new.subject'] }, { timeout: 10000 });
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    await screen.findByText(strings['send.known'], undefined, { timeout: 10000 });
    expect(screen.getAllByText(kit['outcome.pending.title'])).toHaveLength(1);
    expect(screen.queryByText(kit['outcome.failed.title'])).toBeNull();
  });
});

describe('a support 503 refusal is definite', () => {
  it('a busy create says until when, releases the hold, and never says it may have gone through', async () => {
    const r = await renderPage(page, { state: 'busy', path: '/support' });
    putPrefill({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    await screen.findByRole('textbox', { name: strings['new.subject'] }, { timeout: 10000 });
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    expect(await screen.findByText(/^Support is taking no new messages until/, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByText(kit['outcome.pending.title'])).toBeNull();
    expect(heldAttempts(CREATE_LOCK)).toHaveLength(0);
  });

  it('a busy reply says so in its words, the draft stays editable', async () => {
    await renderPage(page, { state: 'busy', path: `/support?sel=${OPEN_ID}` });
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, { timeout: 10000 });
    await userEvent.type(box, 'Any news on the invoice?');
    await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
    // No Retry-After: the wait is until the next midnight UTC, and the words say so.
    expect((await screen.findByText(/^Support is taking no new messages until/, undefined, { timeout: 10000 })).textContent).toContain(`(${strings['error.utcMidnight']})`);
    expect(screen.queryByText(kit['outcome.pending.title'])).toBeNull();
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0);
    expect(box).not.toHaveAttribute('readonly');
  });
});

describe('the same text again within the minute is refused, not replayed', () => {
  const dupWords = (n: string) => `${strings['error.duplicate']} ${strings['error.duplicateWait'].replace('{{duration}}', n)}`;
  const reads = (route: 'list' | 'get') => requestLog.filter((r) => r.route === route).length;

  it('a reply: says it was already sent, ends the attempt, keeps the draft, reads the thread again, and the next press is a new attempt', async () => {
    await renderPage(page, { state: 'duplicate', path: `/support?sel=${OPEN_ID}` });
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, { timeout: 10000 });
    await userEvent.type(box, 'Any news on the invoice?');
    const list = reads('list');
    const thread = reads('get');
    await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
    expect(await screen.findByText(dupWords('42 seconds'), undefined, { timeout: 10000 })).toBeInTheDocument();
    await waitFor(() => expect(reads('list')).toBeGreaterThan(list), { timeout: 10000 });
    await waitFor(() => expect(reads('get')).toBeGreaterThan(thread), { timeout: 10000 });
    expect(screen.queryByText(kit['outcome.pending.title'])).toBeNull();
    expect(screen.queryByText(strings['send.known'])).toBeNull();
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0);
    expect(box).not.toHaveAttribute('readonly');
    expect(box).toHaveValue('Any news on the invoice?');
    await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
    await waitFor(() => expect(writes()).toHaveLength(2), { timeout: 10000 });
    expect(keyOf(writes()[1]!)).not.toBe(keyOf(writes()[0]!));
  });

  it('a new ticket: the same words with a link to the saved ticket, the draft kept, the list read again', async () => {
    const r = await renderPage(page, { state: 'duplicate', path: '/support' });
    putPrefill({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, { timeout: 10000 });
    const list = reads('list');
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    expect(await screen.findByText(dupWords('42 seconds'), { exact: false }, { timeout: 10000 })).toBeInTheDocument();
    await waitFor(() => expect(reads('list')).toBeGreaterThan(list), { timeout: 10000 });
    expect(screen.getByRole('link', { name: strings['send.matchLink'] })).toHaveAttribute('href', expect.stringContaining(`sel=${OPEN_ID}`));
    expect(screen.queryByText(kit['outcome.pending.title'])).toBeNull();
    expect(heldAttempts(CREATE_LOCK)).toHaveLength(0);
    expect(subject).not.toHaveAttribute('readonly');
    expect(subject).toHaveValue('Invoice shows the wrong country');
    // The words never repeat what the person wrote.
    expect(screen.getByText(dupWords('42 seconds'), { exact: false }).textContent).not.toContain('invoice');
    // Unedited, the text is the saved ticket's: the link opens it and no discard question asks.
    await userEvent.click(screen.getByRole('link', { name: strings['send.matchLink'] }));
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ sel: OPEN_ID }), { timeout: 10000 });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a duplicate core calls pending: the same definite words, no held banner, nothing to stop tracking, no invented wait or link', async () => {
    await renderPage(page, { state: 'duplicate-pending', path: `/support?sel=${OPEN_ID}` });
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, { timeout: 10000 });
    await userEvent.type(box, 'Any news on the invoice?');
    await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
    expect(await screen.findByText(strings['error.duplicate'], undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByText(kit['outcome.pending.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: kitStates['err.stopTracking'] })).toBeNull();
    expect(screen.queryByRole('link', { name: strings['send.matchLink'] })).toBeNull();
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0);
    expect(box).not.toHaveAttribute('readonly');
    expect(box).toHaveValue('Any news on the invoice?');
  });

  it('a new ticket edited after the refusal: the refusal and its link go, since this is new text and leaving would lose it', async () => {
    const r = await renderPage(page, { state: 'duplicate', path: '/support' });
    putPrefill({ category: 'billing', subject: 'Invoice shows the wrong country', body: 'The country on my invoice is wrong.' });
    await act(async () => {
      await r.router.navigate({ href: '/support?new=1' } as never);
    });
    const subject = await screen.findByRole('textbox', { name: strings['new.subject'] }, { timeout: 10000 });
    await userEvent.click(screen.getByRole('button', { name: strings['action.sendTicket'] }));
    expect(await screen.findByRole('link', { name: strings['send.matchLink'] }, { timeout: 10000 })).toBeInTheDocument();
    await userEvent.type(subject, ' again');
    expect(screen.queryByRole('link', { name: strings['send.matchLink'] })).toBeNull();
    expect(screen.queryByText(dupWords('42 seconds'), { exact: false })).toBeNull();
    expect(subject).toHaveValue('Invoice shows the wrong country again');
  });
});

async function closeOpenTicket(state: string) {
  const r = await renderPage(page, { state, path: `/support?sel=${OPEN_ID}` });
  await screen.findByText(/lists Germany/, undefined, { timeout: 10000 });
  await userEvent.click(screen.getByRole('button', { name: kit['action.more'] }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.close'] }));
  await userEvent.click(await screen.findByRole('button', { name: strings['close.confirm'] }));
  return r;
}
const closeOffered = async () => {
  await userEvent.click(screen.getByRole('button', { name: kit['action.more'] }));
  const has = (await screen.findAllByRole('menuitem')).some((m) => m.textContent?.includes(strings['action.close']));
  await userEvent.keyboard('{Escape}');
  return has;
};

describe('a lost close is held', () => {
  it('offers no second Close while held, after the thread mounts again too; Check again on an open ticket keeps it', async () => {
    const r = await closeOpenTicket('closeLostOpen');
    await screen.findByText(strings['close.unknown'], undefined, { timeout: 10000 });
    expect(heldAttempts(closeLock(OPEN_ID))).toHaveLength(1);
    expect(await closeOffered()).toBe(false);
    // The thread unmounts (back to the list) and mounts again: the hold is the stored one, not the thread's state.
    await act(async () => {
      await r.router.navigate({ href: '/support' } as never);
    });
    await waitFor(() => expect(screen.queryByText(strings['close.unknown'])).toBeNull());
    await act(async () => {
      await r.router.navigate({ href: `/support?sel=${OPEN_ID}` } as never);
    });
    await screen.findByText(strings['close.unknown'], undefined, { timeout: 10000 });
    expect(await closeOffered()).toBe(false);
    await checkAgain();
    await screen.findByText(/^Still open when checked at/, undefined, { timeout: 10000 });
    expect(heldAttempts(closeLock(OPEN_ID))).toHaveLength(1);
    expect(writes().filter((w) => w.route === 'close')).toHaveLength(1);
  });

  it('Check again that reads the ticket closed frees the hold', async () => {
    await closeOpenTicket('closeLost');
    await screen.findByText(strings['close.unknown'], undefined, { timeout: 10000 });
    await checkAgain();
    await waitFor(() => expect(heldAttempts(closeLock(OPEN_ID))).toHaveLength(0), { timeout: 10000 });
    await waitFor(() => expect(screen.queryByText(strings['close.unknown'])).toBeNull());
    expect(writes().filter((w) => w.route === 'close')).toHaveLength(1);
  });

  it('a busy close is a definite refusal in its own words, and Close stays offered', async () => {
    await closeOpenTicket('closeBusy');
    expect(await screen.findByText(/^Support is taking no new messages until/, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByText(kit['outcome.pending.title'])).toBeNull();
    expect(heldAttempts(closeLock(OPEN_ID))).toHaveLength(0);
    expect(await closeOffered()).toBe(true);
  });
});

describe('a held send belongs to its account', () => {
  it('is not shown after switching to another account', async () => {
    await sendReply('sendUnknown', 'Any news on the invoice?');
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(1);
    const me = identity() as NonNullable<ReturnType<typeof identity>>;
    act(() => setIdentity({ ...me, id: 'ffffffffffffffffffffffff', username: 'other' }));
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0);
    act(() => setIdentity(me));
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(1);
  });
});

/** A text the pending banner would show, looked for after each batch of DOM changes from here on: a banner that comes and
 *  goes between two reads is still caught; one added and removed inside one task is not (no batch shows it). */
function watchFor(text: string): { seen: () => boolean; stop: () => void } {
  let seen = false;
  const look = () => {
    if (document.body.textContent?.includes(text)) seen = true;
  };
  const o = new MutationObserver(look);
  o.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { seen: () => seen, stop: () => o.disconnect() };
}

describe('a send that is answered closes the drawer and opens the new ticket', () => {
  it('New ticket: the drawer closes with no discard ask, the new ticket opens, no pending banner on the way', async () => {
    const r = await renderPage(page, { state: 'ok', path: '/support' });
    putPrefill({ category: 'billing', subject: 'A brand new subject', body: 'A brand new message.' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }, { timeout: 10000 }))[0]!);
    const send = await screen.findByRole('button', { name: strings['action.sendTicket'] }, { timeout: 10000 });
    const banner = watchFor(strings['send.known']);
    const ask = watchFor(kit['drawer.discardAsk']);
    await userEvent.click(send);
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['action.sendTicket'] })).toBeNull(), { timeout: 10000 });
    const search = () => r.router.state.location.search as Record<string, unknown>;
    await waitFor(() => expect(String(search().sel ?? '')).not.toBe(''), { timeout: 10000 });
    expect(search().new).toBeUndefined();
    await screen.findByText('A brand new message.', undefined, { timeout: 10000 });
    banner.stop();
    ask.stop();
    expect(banner.seen(), 'no may-have-gone-through banner').toBe(false);
    expect(ask.seen(), 'no discard ask').toBe(false);
    expect(writes()).toHaveLength(1);
    expect(heldAttempts(CREATE_LOCK)).toHaveLength(0);
  });

  it('New ticket, while its close has not landed: Send is off, the form locked, nothing else closes it or asks', async () => {
    const r = await renderPage(page, { state: 'ok', path: '/support' });
    const back = vi.spyOn(r.router.history, 'back').mockImplementation(() => undefined);
    try {
      putPrefill({ category: 'billing', subject: 'A brand new subject', body: 'A brand new message.' });
      await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }, { timeout: 10000 }))[0]!);
      const send = await screen.findByRole('button', { name: strings['action.sendTicket'] }, { timeout: 10000 });
      const message = screen.getByRole('textbox', { name: strings['new.message'] });
      await userEvent.click(send);
      await waitFor(() => expect(back).toHaveBeenCalledTimes(1), { timeout: 10000 });
      expect(send).toHaveAttribute('data-pending', 'true');
      expect(message).toHaveAttribute('readonly');
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByText(kit['drawer.discardAsk'])).toBeNull();
      expect(back).toHaveBeenCalledTimes(1);
      await userEvent.click(send);
      expect(writes()).toHaveLength(1);
    } finally {
      back.mockRestore();
    }
  });

  it('a reply shows no pending banner on the way and clears the box', async () => {
    await renderPage(page, { state: 'ok', path: `/support?sel=${OPEN_ID}` });
    const box = await screen.findByRole('textbox', { name: strings['reply.label'] }, { timeout: 10000 });
    await userEvent.type(box, 'Any news?');
    const banner = watchFor(strings['send.known']);
    await userEvent.click(screen.getByRole('button', { name: strings['action.send'] }));
    await waitFor(() => expect(box).toHaveValue(''), { timeout: 10000 });
    banner.stop();
    expect(banner.seen(), 'no may-have-gone-through banner').toBe(false);
    expect(heldAttempts(replyLock(OPEN_ID))).toHaveLength(0);
  });

  it('a close shows no pending banner on the way', async () => {
    await renderPage(page, { state: 'ok', path: `/support?sel=${OPEN_ID}` });
    await screen.findByText(/lists Germany/, undefined, { timeout: 10000 });
    await userEvent.click(screen.getByRole('button', { name: kit['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.close'] }));
    const confirm = await screen.findByRole('button', { name: strings['close.confirm'] });
    const banner = watchFor(strings['close.unknown']);
    await userEvent.click(confirm);
    await waitFor(() => expect(heldAttempts(closeLock(OPEN_ID))).toHaveLength(0), { timeout: 10000 });
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['close.confirm'] })).toBeNull(), { timeout: 10000 });
    banner.stop();
    expect(banner.seen(), 'no may-have-closed banner').toBe(false);
  });
});
