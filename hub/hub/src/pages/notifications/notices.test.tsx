// Vitest, the Notices view: the list and the drawer show only the owner answer; the
// restriction line is the exact sentence and only for an active one; a reply whose outcome is unknown is held (never
// sent twice, never shown as failed) across closing the drawer and a reload; Check again reads and settles nothing; the
// warned Stop tracking frees only the hold shown, and only for the account that sent it: after an account switch the
// other account's held reply is neither shown nor freed.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { attemptFor, heldAttempts, resetAttempts } from '@core/attempts';
import { resetChanges } from '@core/changes';
import { ATTEMPT_PREFIX, newChangeStoreTabForTests, readChanges, writeChanges } from '@core/change-store';
import { identity, setIdentity } from '@core/ctx';
import kit from '@kit/strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import { beforeEach, describe, expect, it } from 'vitest';
import { BY_REPLY, checkReply, gateStopForTests, replyLock, resetDraftsForTests, sendReply as send, stopTracking } from './abuse';
import { NOTICE_OLDEST, NOTICE_OLDEST_TITLE, NOTICE_OPEN, NOTICE_PLAIN, NOTICE_RESOLVED, NOTICE_UNNAMED, abuseReplies, resetAbuseFixtures } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const RESTRICTION = 'The suspension linked to this notice remains active. Resolving this notice does not lift that suspension.';
const T = { timeout: 10000 };

beforeEach(() => {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetDraftsForTests();
  resetAbuseFixtures();
});

const openNotice = (id: string, state?: string) => renderPage(page, { ...(state ? { state } : {}), path: `/notifications/notices?sel=${id}` });
const drawer = async () => screen.findByRole('dialog', undefined, T);
const box = async () => screen.findByRole('textbox', { name: strings['an.reply.label'] }, T);

async function sendReply(id: string, state: string, text: string) {
  const r = await openNotice(id, state);
  await userEvent.type(await box(), text);
  await userEvent.click(screen.getByRole('button', { name: strings['an.reply.send'] }));
  return r;
}

describe('the list', () => {
  it('lists the notices with their server and status, and offers the Notices tab', async () => {
    await renderPage(page, { path: '/notifications/notices' });
    expect(await screen.findAllByText('Outgoing spam reported from your server', undefined, T)).not.toHaveLength(0);
    expect(screen.getAllByText(strings['an.status.resolved']).length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: strings['h.tab.notices'] })).toHaveAttribute('aria-selected', 'true');
  });

  it('more than one page (130 notices): every page is read; an older open notice past the newest 100 is found and opens', async () => {
    const r = await renderPage(page, { state: 'notices-many', path: '/notifications/notices' });
    await screen.findAllByText('Outgoing spam reported from your server', undefined, T);
    // The whole list is there: no "showing the newest" line.
    expect(screen.queryByText(/^Showing the newest/)).toBeNull();
    await userEvent.type(screen.getAllByRole('searchbox')[0]!, 'Cryptocurrency');
    expect(await screen.findByText(NOTICE_OLDEST_TITLE, undefined, T)).toBeInTheDocument();
    await act(async () => {
      await r.router.navigate({ href: `/notifications/notices?sel=${NOTICE_OLDEST}` } as never);
    });
    const d = await drawer();
    expect(await within(d).findByRole('textbox', { name: strings['an.reply.label'] }, T)).toBeInTheDocument();
  });

  it.each([
    ['answers 500', 'notices-page2-error'],
    ['is malformed', 'notices-page2-bad'],
  ])('a later page that %s fails the list: never a silently short list', async (_n, state) => {
    await renderPage(page, { state, path: '/notifications/notices' });
    expect(await screen.findByRole('button', { name: kitStates['state.retry'] }, T)).toBeInTheDocument();
    expect(screen.queryAllByText('Outgoing spam reported from your server')).toHaveLength(0);
  });

  it('no notice: the empty state', async () => {
    await renderPage(page, { state: 'notices-empty', path: '/notifications/notices' });
    expect(await screen.findByText(strings['an.none'], undefined, T)).toBeInTheDocument();
  });
});

describe('the drawer', () => {
  it('an active linked suspension: the exact restriction sentence, and only what the owner answer holds', async () => {
    await openNotice(NOTICE_OPEN);
    const d = await drawer();
    expect(await within(d).findByText(RESTRICTION, undefined, T)).toBeInTheDocument();
    expect(within(d).getByText(/We received a report about/)).toBeInTheDocument();
    expect(within(d).getByText('Thank you. Tell us when the mail queue is clean.')).toBeInTheDocument();
    expect(within(d).getByText(strings['an.r.active'])).toBeInTheDocument();
  });

  it('no linked suspension: no restriction sentence', async () => {
    await openNotice(NOTICE_PLAIN);
    const d = await drawer();
    await within(d).findByText(/We received a report about/, undefined, T);
    expect(within(d).queryByText(RESTRICTION)).toBeNull();
    expect(within(d).queryByText(strings['an.f.restriction'])).toBeNull();
  });

  it('a lifted suspension: says lifted, no restriction sentence', async () => {
    await openNotice(NOTICE_RESOLVED);
    const d = await drawer();
    expect(await within(d).findByText(strings['an.r.lifted'], undefined, T)).toBeInTheDocument();
    expect(within(d).queryByText(RESTRICTION)).toBeNull();
  });

  it('a server whose name the API no longer has: says so, no empty name', async () => {
    await openNotice(NOTICE_UNNAMED);
    const d = await drawer();
    expect(await within(d).findByText(strings['an.serverUnknown'], undefined, T)).toBeInTheDocument();
    expect(within(d).queryByText(/^About /)).toBeNull();
    // Its send time is null on the wire: shown as not recorded, never as a made-up time.
    expect(within(d).getAllByText(strings['an.timeUnknown']).length).toBeGreaterThan(0);
  });

  it('a resolved notice offers no reply box', async () => {
    await openNotice(NOTICE_RESOLVED);
    const d = await drawer();
    expect(await within(d).findByText(strings['an.resolvedNoReply'], undefined, T)).toBeInTheDocument();
    expect(within(d).queryByRole('textbox', { name: strings['an.reply.label'] })).toBeNull();
  });
});

describe('a reply', () => {
  it('answered: sent once, shown in the messages, the box empties and unlocks', async () => {
    await sendReply(NOTICE_PLAIN, '', 'Removed the script and rotated the keys.');
    expect(await screen.findByText(strings['an.sent'], undefined, T)).toBeInTheDocument();
    expect(abuseReplies).toEqual([{ id: NOTICE_PLAIN, body: 'Removed the script and rotated the keys.' }]);
    await within(await drawer()).findByText('Removed the script and rotated the keys.', undefined, T);
    expect(await box()).toHaveValue('');
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0);
  });

  it('an empty box: Send reply is off and says why', async () => {
    await openNotice(NOTICE_PLAIN);
    await box();
    const send = screen.getByRole('button', { name: strings['an.reply.send'] });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription(strings['an.reply.need']);
  });

  it('a line past 2,000 characters: its own field error naming the max, Send off, nothing sent', async () => {
    await openNotice(NOTICE_PLAIN);
    await userEvent.click(await box());
    await userEvent.paste(`Fixed.\n${'x'.repeat(2500)}`);
    expect(await screen.findByText(strings['an.err.lineTooLong'].replace('{{max}}', (2000).toLocaleString()), undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(strings['an.err.text'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['an.reply.send'] }));
    expect(abuseReplies).toHaveLength(0);
  });

  it('refused (resolved meanwhile): its own words, nothing held, the text stays to copy', async () => {
    await sendReply(NOTICE_PLAIN, 'notice-reply-refused', 'Cleaned up.');
    expect(await screen.findByText(strings['an.err.resolved'], undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(kit['outcome.pending.title'])).toBeNull();
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0);
    expect(await box()).toHaveValue('Cleaned up.');
  });
});

describe('a reply whose outcome is unknown', () => {
  it('is held: may have gone through, never failed, the box locked, Send off; Check again reads and settles nothing', async () => {
    await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
    expect(screen.getByText(kit['outcome.pending.title'])).toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).toBeNull();
    expect(await box()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
    expect(abuseReplies).toHaveLength(1);
    // The server stored it: a message with that very text is in the read, and still it proves nothing.
    await userEvent.click(screen.getByRole('button', { name: kit['outcome.pending.check'] }));
    expect(await screen.findByText(/^Checked at /, undefined, T)).toBeInTheDocument();
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    expect(screen.getByText(strings['an.held.known'])).toBeInTheDocument();
    expect(abuseReplies).toHaveLength(1);
  });

  it('survives closing the drawer and opening it again: still held, nothing sent again', async () => {
    const r = await sendReply(NOTICE_PLAIN, 'notice-reply-lost', 'Fixed.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    await act(async () => {
      await r.router.navigate({ href: '/notifications/notices' } as never);
    });
    await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
    await act(async () => {
      await r.router.navigate({ href: `/notifications/notices?sel=${NOTICE_PLAIN}` } as never);
    });
    expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
    expect(abuseReplies).toHaveLength(1);
  });

  it('after a reload: the banner is back from storage, the box locked; Stop tracking (warned) frees it and unlocks the box', async () => {
    const r = await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    const stored = readChanges();
    r.unmount();
    // A reload: this tab's memory is gone, storage stays. (renderPage boots fixture core afresh, which clears the
    // registered storage: the stored record is put back as the reloaded page finds it.)
    resetAttempts();
    resetDraftsForTests();
    newChangeStoreTabForTests();
    await openNotice(NOTICE_PLAIN, 'notice-reply-unknown');
    act(() => {
      writeChanges(stored ?? []);
      resetAttempts();
    });
    expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
    expect(await box()).toHaveAttribute('readonly');
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    // The kit asks first; only its confirm frees the hold.
    await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
    await userEvent.click(await screen.findByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }, T));
    await waitFor(() => expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0), T);
    await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
    expect(await box()).not.toHaveAttribute('readonly');
    expect(abuseReplies).toHaveLength(1);
  });

  it.each([
    ['answers 500', 'notice-get-500'],
    ['gets no answer', 'notice-get-lost'],
    ['is malformed', 'notice-get-bad'],
  ])('after a reload while the notice read %s: the banner shows, Check again reads, Stop tracking frees it; no box, nothing sent again', async (_n, state) => {
    const r = await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    const stored = readChanges();
    r.unmount();
    resetAttempts();
    resetDraftsForTests();
    newChangeStoreTabForTests();
    await openNotice(NOTICE_PLAIN, state);
    act(() => {
      writeChanges(stored ?? []);
      resetAttempts();
    });
    expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
    // The notice itself could not be read: its section offers Try again; no reply box, no Send.
    expect(await screen.findByRole('button', { name: kitStates['state.retry'] }, T)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: strings['an.reply.label'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['an.reply.send'] })).toBeNull();
    // Check again reads (and fails here): it settles nothing.
    await userEvent.click(screen.getByRole('button', { name: kit['outcome.pending.check'] }));
    expect(await screen.findByText(/^Couldn't read this notice/, undefined, T)).toBeInTheDocument();
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    // The warned Stop tracking frees the hold shown.
    await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
    await userEvent.click(await screen.findByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }, T));
    await waitFor(() => expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0), T);
    await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
    expect(abuseReplies).toHaveLength(1);
  });

  it('Stop tracking in this tab empties the box: the freed reply is never offered again, Send stays off', async () => {
    await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    expect(await box()).toHaveValue('Fixed.');
    await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
    await userEvent.click(await screen.findByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }, T));
    await waitFor(() => expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0), T);
    await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
    expect(await box()).not.toHaveAttribute('readonly');
    expect(await box()).toHaveValue('');
    // Empty again: off, saying why.
    expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toHaveAccessibleDescription(strings['an.reply.need']);
    expect(abuseReplies).toHaveLength(1);
  });

  it('belongs to its account: after a switch it is neither shown nor freed, and comes back for its own account', async () => {
    await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    const mine = heldAttempts(replyLock(NOTICE_PLAIN))[0];
    expect(mine).toBeDefined();
    const me = identity() as NonNullable<ReturnType<typeof identity>>;
    act(() => setIdentity({ ...me, id: 'ffffffffffffffffffffffff', username: 'other' }));
    // Not listed and not shown for the other account.
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
    // Not freed from the other account, even given the held record itself.
    expect(attemptFor(mine!.id, BY_REPLY)).toBeNull();
    await expect(stopTracking(mine!)).resolves.toBe('refused');
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0);
    act(() => setIdentity(me));
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
    expect(abuseReplies).toHaveLength(1);
  });

  it('a second press while held sends nothing', async () => {
    await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    await userEvent.click(screen.getByRole('button', { name: strings['an.reply.send'] }));
    expect(abuseReplies).toHaveLength(1);
  });
});

describe('a success answer that proves nothing', () => {
  it.each([
    ['without the stored message', 'notice-reply-bad-ok'],
    ['naming another author', 'notice-reply-admin-ok'],
    ['a 200, not the 201 a stored reply answers', 'notice-reply-not-201'],
  ])('%s: held as unknown, never "Reply sent", Send stays off', async (_n, state) => {
    await sendReply(NOTICE_PLAIN, state, 'Fixed.');
    expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(strings['an.sent'])).toBeNull();
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
    expect(abuseReplies).toHaveLength(1);
  });
});

describe('Stop tracking never frees a reply whose request is still out', () => {
  it('refused while this tab is still sending it, by the page and by core; the hold stays', async () => {
    await renderPage(page, { state: 'notice-reply-slow', path: '/notifications/notices' });
    await screen.findAllByText('Outgoing spam reported from your server', undefined, T);
    const sending = send(NOTICE_PLAIN, 'Fixed.');
    await waitFor(() => expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1), T);
    const h = heldAttempts(replyLock(NOTICE_PLAIN))[0]!;
    expect(h.inFlight).toBe('here');
    await expect(stopTracking(h)).resolves.toBe('refused');
    // Even shown as not in flight (a stale view of it), core refuses while the request is out.
    await expect(stopTracking({ ...h, inFlight: false })).resolves.toBe('refused');
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    await expect(sending).resolves.toEqual({ verdict: 'sent' });
    expect(abuseReplies).toHaveLength(1);
  });
});

describe('Stop tracking while core decides', () => {
  it('the banner stays and the box stays locked until the hold is freed, also after leaving and coming back', async () => {
    const r = await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    const go = async (href: string) => act(async () => void (await r.router.navigate({ href } as never)));
    await screen.findByText(strings['an.held.known'], undefined, T);
    const open = gateStopForTests();
    try {
      await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
      await userEvent.click(await screen.findByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }, T));
      // Core has removed it (freed) but its answer is held back: nothing unlocks yet.
      await waitFor(() => expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(0), T);
      expect(screen.getByText(strings['an.held.known'])).toBeInTheDocument();
      expect(await box()).toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
      // Away and back while core's answer is still out: the same.
      await go('/notifications/notices');
      await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
      await go(`/notifications/notices?sel=${NOTICE_PLAIN}`);
      expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
      expect(await box()).toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
    } finally {
      act(() => open());
    }
    await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
    expect(await box()).not.toHaveAttribute('readonly');
    expect(abuseReplies).toHaveLength(1);
  });
});

describe('Stop tracking while core decides, across leaving and coming back', () => {
  it('still held and locked on return; a refused stop keeps it held and says so', async () => {
    const r = await sendReply(NOTICE_PLAIN, 'notice-reply-unknown', 'Fixed.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    const h = heldAttempts(replyLock(NOTICE_PLAIN))[0]!;
    const go = async (href: string) => act(async () => void (await r.router.navigate({ href } as never)));
    const open = gateStopForTests();
    let refused: Promise<unknown> = Promise.resolve();
    try {
      // A stop of a state the person was not shown (another meta version): core refuses it.
      act(() => {
        refused = stopTracking({ ...h, metaVersion: h.metaVersion + 1 });
      });
      await go('/notifications/notices');
      await waitFor(() => expect(screen.queryByText(strings['an.held.known'])).toBeNull(), T);
      await go(`/notifications/notices?sel=${NOTICE_PLAIN}`);
      expect(await screen.findByText(strings['an.held.known'], undefined, T)).toBeInTheDocument();
      expect(await box()).toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: strings['an.reply.send'] })).toBeDisabled();
    } finally {
      act(() => open());
    }
    await act(async () => void (await refused));
    await expect(refused).resolves.toBe('refused');
    expect(await screen.findByText(strings['an.held.stopFailed'], undefined, T)).toBeInTheDocument();
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    expect(await box()).toHaveAttribute('readonly');
    expect(abuseReplies).toHaveLength(1);
  });
});

describe('Check again', () => {
  it('a read that answers another notice is not a read of this one', async () => {
    await renderPage(page, { state: 'notice-check-wrong', path: '/notifications/notices' });
    await screen.findAllByText('Outgoing spam reported from your server', undefined, T);
    await expect(send(NOTICE_PLAIN, 'Fixed.')).resolves.toEqual({ verdict: 'unknown' });
    const h = heldAttempts(replyLock(NOTICE_PLAIN))[0]!;
    await expect(checkReply(h)).resolves.toMatchObject({ ok: false });
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
  });

  it('a late answer for one held notice never shows on another; an open Stop tracking confirm closes when the notice changes', async () => {
    const r = await sendReply(NOTICE_PLAIN, 'notice-check-slow', 'Fixed A.');
    await screen.findByText(strings['an.held.known'], undefined, T);
    const go = async (href: string) => act(async () => void (await r.router.navigate({ href } as never)));
    await go(`/notifications/notices?sel=${NOTICE_OPEN}`);
    await userEvent.type(await box(), 'Fixed B.');
    await userEvent.click(screen.getByRole('button', { name: strings['an.reply.send'] }));
    await screen.findByText(strings['an.held.known'], undefined, T);
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    expect(heldAttempts(replyLock(NOTICE_OPEN))).toHaveLength(1);
    // Back on A: Check again (its read now answers late), then B before it lands.
    await go(`/notifications/notices?sel=${NOTICE_PLAIN}`);
    await screen.findByText(strings['an.held.known'], undefined, T);
    await userEvent.click(screen.getByRole('button', { name: kit['outcome.pending.check'] }));
    await go(`/notifications/notices?sel=${NOTICE_OPEN}`);
    await screen.findByText(strings['an.held.known'], undefined, T);
    await new Promise((res) => setTimeout(res, 2000));
    expect(screen.queryByText(/^Checked at /)).toBeNull();
    // The confirm opened for B's hold closes with B: on A no confirm is left that would free another hold.
    await userEvent.click(screen.getByRole('button', { name: kitStates['err.stopTracking'] }));
    expect(await screen.findByRole('alertdialog', undefined, T)).toBeInTheDocument();
    await go(`/notifications/notices?sel=${NOTICE_PLAIN}`);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), T);
    expect(heldAttempts(replyLock(NOTICE_PLAIN))).toHaveLength(1);
    expect(heldAttempts(replyLock(NOTICE_OPEN))).toHaveLength(1);
    expect(abuseReplies).toHaveLength(2);
  }, 30000);
});

describe('an unsent draft', () => {
  it('closing the drawer asks first; staying keeps the text', async () => {
    await openNotice(NOTICE_PLAIN);
    await userEvent.type(await box(), 'Half written');
    const d = await drawer();
    const close = within(d).getAllByRole('button', { name: strings['an.close'] }).find((b) => b.getAttribute('data-variant') === 'secondary');
    await userEvent.click(close!);
    // The kit asks before discarding (its Discard button); nothing closed, the text is still there.
    await waitFor(() => expect(screen.getAllByRole('button').some((b) => /discard/i.test(b.textContent ?? ''))).toBe(true), T);
    expect(screen.getByRole('textbox', { name: strings['an.reply.label'] })).toHaveValue('Half written');
    expect(abuseReplies).toHaveLength(0);
  });
});
