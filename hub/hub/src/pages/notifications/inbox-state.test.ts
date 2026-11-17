// Vitest: the Inbox's per-row acknowledgement state and its a11y names.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, heldChanges } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { act } from 'react';
import { setIdentity } from '@core/ctx';
import formStrings from '@kit/forms/forms.strings.en.json';
import { doneAckSends, holdList, lostAckSends, resetFixtureServer } from './fixtures';
import { READ_ALL_LOCK, READ_LOCK } from './data';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

// The bulk bar's Mark read (the rows' hover icons and the inspector's button share the name).
const bulkButtons = () => screen.queryAllByRole('button', { name: strings.read }).filter((b) => !b.closest('table') && !b.closest('[role="region"]'));
const bulkButton = async () => {
  await waitFor(() => expect(bulkButtons().length).toBe(1));
  return bulkButtons()[0]!;
};

const toasts = vi.hoisted(() => [] as Array<{ title: string }>);
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  showToast: (c: { title: string }) => {
    toasts.push(c);
    return 'toast';
  },
}));

const PENDING = formStrings['outcome.pendingShort'];
// A row's Mark read icon, found again by the row's id (every row's icon has the same name).
const rowIdOf = (b: HTMLElement) => b.closest('tr')!.getAttribute('data-row-id')!;
const rowButtonOf = async (id: string) => {
  const row = await waitFor(() => {
    const r = document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`);
    if (!r) throw new Error('no row');
    return r;
  });
  return within(row).findByRole('button', { name: strings.read });
};
const rowButtons = async () => within(await screen.findByRole('table', {}, { timeout: 8000 })).findAllByRole('button', { name: strings.read });
const settle = () => new Promise((r) => setTimeout(r, 300));

describe('Inbox acknowledgement state per row', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
    toasts.length = 0;
  });

  it("a done mark-read on another row keeps the first row's pending and its lock", async () => {
    await renderPage(page, { state: 'ack-first-pending' });
    const [a, , c] = await rowButtons();
    const idA = rowIdOf(a!);
    await userEvent.click(a!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    await userEvent.click(c!);
    await settle();
    expect(screen.getByText(PENDING)).toBeInTheDocument();
    expect(await rowButtonOf(idA)).toHaveAttribute('aria-disabled', 'true');
    // Held, it says why (a disabled item needs a reason: kit Menu.model); a press does nothing (soft-disabled).
    expect(await rowButtonOf(idA)).toHaveAccessibleDescription(strings.readHeld);
  });

  it('bulk Read: a double press shows no failure, and the read rows keep their place', async () => {
    await renderPage(page, { state: 'ack-slow' });
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    await within(table).findAllByRole('row', { name: /Computer atlas stopped/ }, { timeout: 8000 });
    const boxes = (await within(table).findAllByRole('checkbox')).slice(1, 3);
    for (const b of boxes) await userEvent.click(b);
    const bulk = await bulkButton();
    await userEvent.dblClick(bulk);
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByText(/Couldn’t mark/)).toBeNull();
    expect(screen.queryByText(formStrings['outcome.failedShort'])).toBeNull();
    expect(within(table).getAllByRole('row', { name: /Computer atlas stopped|Payment received for borealis/ }).length).toBeGreaterThan(0);
  });

  it('selecting a pending row (the notice moves into the inspector) raises no "window closed" toast', async () => {
    await renderPage(page, { state: 'ack-pending' });
    const [a] = await rowButtons();
    await userEvent.click(a!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    const row = a!.closest('tr')!;
    row.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    await settle();
    expect(toasts).toHaveLength(0);
  });

  it('the pending row notice sits above the table', async () => {
    await renderPage(page, { state: 'ack-pending' });
    const [a] = await rowButtons();
    await userEvent.click(a!);
    const notice = (await screen.findByText(PENDING)).closest('[data-outcome]')!;
    const table = screen.getByRole('table');
    expect(notice.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the unread dot is announced (an image with a name, not a bare span label)', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    await waitFor(() => expect(within(table).getAllByRole('img', { name: strings.unreadDot }).length).toBeGreaterThan(0));
  });
});

describe('Inbox acknowledgement state, read back', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
    toasts.length = 0;
  });

  it("a newer failed row never hides an older row's \"may have gone through\" and its Check again", async () => {
    await renderPage(page, { state: 'ack-pending-then-failed' });
    const [a, b] = await rowButtons();
    await userEvent.click(a!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    await userEvent.click(b!);
    expect(await screen.findByText(formStrings['outcome.failedShort'])).toBeInTheDocument();
    expect(screen.getByText(PENDING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Check/ })).toBeInTheDocument();
  });

  it('bulk Read skips rows that are already read (kept in the list) and never sends them again', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    await within(table).findAllByRole('row', { name: /Computer atlas stopped/ }, { timeout: 8000 });
    const box = (await within(table).findAllByRole('checkbox'))[1]!;
    await userEvent.click(box);
    await userEvent.click(await bulkButton());
    await waitFor(() => expect(doneAckSends()).toHaveLength(1));
    await settle();
    const again = (await within(table).findAllByRole('checkbox'))[1]!;
    if (!(again as HTMLInputElement).checked) await userEvent.click(again);
    await userEvent.click(await bulkButton());
    await settle();
    expect(doneAckSends()).toHaveLength(1);
  });

  it('a notice that may have been marked read still says so after visiting Get notified and coming back', async () => {
    const { router } = await renderPage(page, { state: 'ack-lost' });
    const [a] = await rowButtons();
    const idA = rowIdOf(a!);
    await userEvent.click(a!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: '/notifications/learn' as never });
    });
    await screen.findByRole('heading', { name: strings['h.kinds.h'] });
    await act(async () => {
      await router.navigate({ to: '/notifications' as never });
    });
    expect(await screen.findByText(PENDING, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await rowButtonOf(idA)).toHaveAttribute('aria-disabled', 'true');
  });

  it('a storage-share notice offers no Computers or logs links', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    const row = (await within(table).findAllByRole('row', { name: /Storage share granite expires/ }))[0]!;
    row.focus();
    await userEvent.keyboard('{Enter}');
    const insp = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    expect(within(insp).queryByRole('link', { name: strings['inspector.openComputers'] })).toBeNull();
    expect(within(insp).queryByRole('link', { name: strings['inspector.openLogs'] })).toBeNull();
  });
});

describe('Inbox pending marks come from core', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
    toasts.length = 0;
  });

  it('a mark-read still in flight when the page is left says "may have gone through" on return, and stays locked', async () => {
    const { router } = await renderPage(page, { state: 'ack-slow-pending' });
    const [a] = await rowButtons();
    const idA = rowIdOf(a!);
    await userEvent.click(a!);
    await act(async () => {
      await router.navigate({ to: '/notifications/learn' as never });
    });
    await screen.findByRole('heading', { name: strings['h.kinds.h'] });
    await act(async () => new Promise((r) => setTimeout(r, 700)));
    await act(async () => {
      await router.navigate({ to: '/notifications' as never });
    });
    expect(await screen.findByText(PENDING, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await rowButtonOf(idA)).toHaveAttribute('aria-disabled', 'true');
  });

  it('a fresh list that still shows the notice unread proves nothing: it stays held and is never resent', async () => {
    await renderPage(page, { state: 'ack-lost' });
    const [a] = await rowButtons();
    const idA = rowIdOf(a!);
    await userEvent.click(a!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Check/ })[0]!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.getByText(PENDING)).toBeInTheDocument();
    expect(await rowButtonOf(idA)).toHaveAttribute('aria-disabled', 'true');
    expect(lostAckSends()).toBe(1);
    expect(heldChanges(READ_LOCK).map((h) => (h.identity as { id: string }).id)).toEqual([idA]);
  });

  it('Check again settles only the marks pending when it began: one that went pending meanwhile stays', async () => {
    await renderPage(page, { state: 'ack-pending' });
    const [a, b] = await rowButtons();
    const idA = rowIdOf(a!);
    const idB = rowIdOf(b!);
    await userEvent.click(a!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    const release = holdList();
    await userEvent.click(screen.getAllByRole('button', { name: /^Check/ })[0]!);
    await userEvent.click(b!);
    await waitFor(async () => expect(await rowButtonOf(idB)).toHaveAttribute('aria-disabled', 'true'));
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 300));
    });
    // The read began after A went through: it proves A (A leaves the unread list). It began before B was sent,
    // so B stays held: still locked, still "may have gone through".
    await waitFor(() => expect(document.querySelector(`tr[data-row-id="${idA}"]`)).toBeNull());
    expect(await rowButtonOf(idB)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(PENDING)).toBeInTheDocument();
    await waitFor(() => expect(heldChanges(READ_LOCK).map((h) => (h.identity as { id: string }).id)).toEqual([idB]));
  });
});

describe('Inbox: one place per answer, holds, an empty inbox', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });
  const detail = () => screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
  const FIRST = '/notifications?sel=4e0000000000000000000000';

  it('a mark-read that may have gone through shows Check again in the detail, and no Mark read beside it', async () => {
    await renderPage(page, { state: 'ack-lost', path: FIRST });
    const d = await detail();
    expect(await within(d).findByText(PENDING)).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings.read })).toBeNull();
  });

  it('a refused mark-read shows Try again in the detail, and no second Mark read beside it', async () => {
    await renderPage(page, { state: 'ack-failed', path: FIRST });
    const d = await detail();
    expect(await within(d).findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings.read })).toBeNull();
  });

  it('an inbox with no notices at all shows one empty state, no search or filters', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings.noneAtAll)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: strings.which })).toBeNull();
  });

  it('a Mark all read no list can prove offers a warned Forget it in the header', async () => {
    await renderPage(page, { state: 'ack-lost' });
    await userEvent.click(await screen.findByRole('button', { name: strings.readAll }));
    await waitFor(() => expect(heldChanges(READ_ALL_LOCK)).toHaveLength(1));
    await userEvent.click(await screen.findByRole('button', { name: strings['forgetAll.button'] }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['forgetAll.confirm'] }));
    await waitFor(() => expect(heldChanges(READ_ALL_LOCK)).toEqual([]));
    expect(await screen.findByRole('button', { name: strings.readAll })).toBeEnabled();
  });
});

describe('Inbox: forgetting a held mark-read, answers per account', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });
  const detail = () => screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
  const FIRST = '/notifications?sel=4e0000000000000000000000';
  const forget = async () => {
    await userEvent.click(await within(await detail()).findByRole('button', { name: strings['forgetOne.button'] }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(strings['forgetOne.body'])).toBeInTheDocument();
    expect(heldChanges(READ_LOCK)).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['forgetOne.confirm'] }));
  };

  it('a mark-read no list can prove offers a warned Forget it beside Check again, which frees it', async () => {
    await renderPage(page, { state: 'ack-lost', path: FIRST });
    const d = await detail();
    expect(await within(d).findByText(PENDING)).toBeInTheDocument();
    await forget();
    await waitFor(() => expect(heldChanges(READ_LOCK)).toEqual([]));
    expect(await within(d).findByRole('button', { name: strings.read })).toBeEnabled();
  });

  it('the row notice of one held mark-read offers the same warned Forget it', async () => {
    await renderPage(page, { state: 'ack-lost' });
    const [a] = await rowButtons();
    await userEvent.click(a!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    const notice = screen.getByText(PENDING).closest('[data-outcome]:not([role])')!.parentElement!; // the slot, not its alert line
    await userEvent.click(within(notice).getByRole('button', { name: strings['forgetOne.button'] }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['forgetOne.confirm'] }));
    await waitFor(() => expect(heldChanges(READ_LOCK)).toEqual([]));
  });

  it('a failed Mark all read line goes with the account it was shown for', async () => {
    await renderPage(page, { state: 'ack-failed' });
    await userEvent.click(await screen.findByRole('button', { name: strings.readAll }));
    expect(await screen.findByText(strings['ack.allFailed'])).toBeInTheDocument();
    act(() => {
      setIdentity({ id: 'acct-other', banned: false });
    });
    await waitFor(() => expect(screen.queryByText(strings['ack.allFailed'])).toBeNull());
  });
});
