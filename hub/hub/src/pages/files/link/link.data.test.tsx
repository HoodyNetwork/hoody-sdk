// Vitest: Download from a link, the rules the dialog alone does not show: nothing is held or sent while
// changes are off or when the hold cannot be stored first; a resend meeting DOWNLOAD_ID_EXISTS reads by id; a hold
// older than 6 days is never sent again; a hold whose last answer was a 429 reads as not sent after a reload; a
// completed download whose file is not in the folder says so.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable no-restricted-globals -- a reload keeps the hold in browser storage: the test copies it across and starts each case empty */
import { cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Core from '@core';
import { resetFiles } from '../fixtures';
import page from '../page';
import { endBusyWaitsForTest, heldLinks, resetLinksForTest, setBusyWaitsForTest } from './data';
import { linkCancels, linkSends } from './fixtures';
import ls from './link.strings.en.json';
import fs from '../strings.en.json';
import us from '../Upload.strings.en.json';
import xs from '../transfers/transfers.strings.en.json';

const ctl = vi.hoisted(() => ({ off: false, holdFails: '', failUpdates: 0 }));
vi.mock('@core', async (importOriginal) => {
  const m = await importOriginal<typeof Core>();
  return {
    ...m,
    can: (cap: string) => (ctl.off && cap === 'computers.actions.exec' ? false : m.can(cap)),
    // A hold whose meta writes can be refused (ctl.failUpdates of them), as a full or blocked storage would.
    holdAttempt: async (...a: Parameters<typeof m.holdAttempt>) => {
      if (ctl.holdFails) return { ok: false, code: ctl.holdFails };
      const r = await m.holdAttempt(...a);
      if (!r.ok) return r;
      const h = r.hold;
      return { ...r, hold: { ...h, sent: () => h.sent(), release: () => h.release(), free: (...x: Parameters<typeof h.free>) => h.free(...x), update: (...x: Parameters<typeof h.update>) => (ctl.failUpdates-- > 0 ? Promise.resolve(false) : h.update(...x)) } };
    },
  };
});

const LINK = 'https://downloads.example/big.iso?token=SECRET';
/** A 429 wait no real clock ends inside a test: the test ends it (endBusyWaitsForTest) once it has seen the row wait. */
const HELD_WAIT = 3_600_000;
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const at = (path: string) => `/files?a=atlas.00a1&ap=${encodeURIComponent(path)}`;
const p = { name: 'big.iso', folder: 'tmp', computer: 'atlas' };
/** The folder's one notice links to Transfers, where each download is a row. */
const toTransfers = async () => {
  await userEvent.click(await screen.findByRole('button', { name: ls['notice.open'] }, { timeout: 8000 }));
  await waitFor(() => expect(screen.getByRole('tab', { name: xs['tab.transfers'] })).toHaveAttribute('aria-selected', 'true'));
};
/** The Transfers row of the download ("big.iso → tmp"). */
async function rowOf(timeout = 8000): Promise<HTMLElement> {
  const row = (await screen.findByText('big.iso → tmp', {}, { timeout })).closest('[role="row"], tr');
  if (!row) throw new Error('no row');
  return row as HTMLElement;
}
/** The row's state reads `state`, within the time a record read takes. */
const rowSays = async (state: string) => waitFor(async () => expect(within(await rowOf(1000)).getByText(state)).toBeInTheDocument(), { timeout: 8000 });
const checkAgain = async () => userEvent.click(within(await rowOf()).getByRole('button', { name: /check again/i }));
/** Download from link, in the pane's More menu, once the folder is listed. */
async function pickLink() {
  await waitFor(() => expect(screen.getByRole('button', { name: us['action.upload'] })).toBeEnabled(), { timeout: 8000 });
  await userEvent.click((await screen.findAllByRole('button', { name: fs['action.more'] }))[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: `${ls.action}…` }));
}
async function sendOne(state: string) {
  await renderPage(page, { path: at('/tmp'), state });
  await pickLink();
  const d = await screen.findByRole('dialog');
  await userEvent.click(within(d).getByLabelText(ls['field.link']));
  await userEvent.paste(LINK);
  const go = within(d).getByRole('button', { name: ls.send });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
  return d;
}
async function reload(state: string) {
  await waitFor(() => expect(heldLinks()[0]?.hold.inFlight).toBeFalsy());
  const stored = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k) ?? '']));
  cleanup();
  resetLinksForTest();
  setBusyWaitsForTest([20]);
  await renderPage(page, { path: at('/tmp'), state });
  for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
  window.dispatchEvent(new StorageEvent('storage', { key: 'hub.v3.changes' }));
}

// Load the page's view once before the first test, so that test is not timed on the import.
beforeAll(async () => {
  await import('../view');
}, 120_000);
beforeEach(() => { resetFiles(); resetLinksForTest(); localStorage.clear(); ctl.off = false; ctl.holdFails = ''; ctl.failUpdates = 0; setBusyWaitsForTest([20, 20]); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => new Promise<void>((done) => { setTimeout(done, 100); }));

describe('Download from link: never sent without a stored hold', () => {
  it('changes turned off after the dialog opened: nothing held, nothing sent', async () => {
    await renderPage(page, { path: at('/tmp'), state: 'many' });
    await pickLink();
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByLabelText(ls['field.link']));
    await userEvent.paste(LINK);
    ctl.off = true;
    const go = within(d).getByRole('button', { name: ls.send });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(ls['result.CHANGES_OFF'])).toBeInTheDocument();
    expect(linkSends).toEqual([]);
    expect(heldLinks()).toEqual([]);
  });

  it('changes turned off while a 429 waits: the resend is not sent, the hold is freed, the line says why', async () => {
    setBusyWaitsForTest([HELD_WAIT]);
    await sendOne('linkBusyAlways');
    await toTransfers();
    await rowSays(xs['state.waiting']);
    ctl.off = true;
    endBusyWaitsForTest();
    await rowSays(xs['state.notSent']);
    expect((await rowOf()).textContent).toContain(ls['result.CHANGES_OFF']);
    expect(linkSends).toHaveLength(1);
    await waitFor(() => expect(heldLinks()).toEqual([]));
  });

  it('the hold cannot be stored: nothing is sent and the dialog says so', async () => {
    ctl.holdFails = 'FULL';
    const d = await sendOne('many');
    expect(await within(d).findByText(ls['result.FULL'])).toBeInTheDocument();
    expect(linkSends).toEqual([]);
  });
});

describe('Download from link: checking a held download', () => {
  it('a resend meeting DOWNLOAD_ID_EXISTS reads the download by id and follows it', async () => {
    await sendOne('linkLostLate');
    await toTransfers();
    await rowSays(xs['state.unknown']);
    await checkAgain();
    await rowSays(xs['state.done']);
    expect(linkSends).toHaveLength(2);
    expect(linkSends[1]).toBe(linkSends[0]);
    expect(heldLinks()).toEqual([]);
  });

  it('a resend refused after a lost answer proves nothing: it stays held, may have been accepted', async () => {
    await sendOne('linkLostRefused');
    await toTransfers();
    await rowSays(xs['state.unknown']);
    await checkAgain();
    await waitFor(() => expect(linkSends).toHaveLength(2));
    expect(await screen.findByText(new RegExp(ls['check.resent'].slice(0, 20)))).toBeInTheDocument();
    expect(heldLinks()).toHaveLength(1);
    expect(heldLinks()[0]!.meta).toMatchObject({ phase: 'unknown', lost: true });
    expect(screen.queryByText(ls['result.FILE_PATH_BUSY'], { exact: false })).toBeNull();
  });

  it('a lost answer whose hold could not record it: a refused resend still stays unknown, never "nothing started"', async () => {
    ctl.failUpdates = 1;
    await sendOne('linkLostRefused');
    await toTransfers();
    await rowSays(xs['state.unknown']);
    expect(heldLinks()[0]!.meta).toMatchObject({ lost: false });
    await checkAgain();
    await waitFor(() => expect(linkSends).toHaveLength(2));
    expect(await screen.findByText(new RegExp(ls['check.resent'].slice(0, 20)))).toBeInTheDocument();
    expect(heldLinks()).toHaveLength(1);
    expect(heldLinks()[0]!.meta).toMatchObject({ lost: true });
    expect(screen.queryByText(ls['result.FILE_PATH_BUSY'], { exact: false })).toBeNull();
  });

  it('older than 6 days: never sent again, even from the tab that has the link', async () => {
    await sendOne('linkLostNone');
    await toTransfers();
    await rowSays(xs['state.unknown']);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 24 * 3600_000 + 60_000);
    await checkAgain();
    expect(await screen.findByText(new RegExp(ls['check.tooOld'].slice(0, 20)))).toBeInTheDocument();
    expect(linkSends).toHaveLength(1);
    expect(heldLinks()).toHaveLength(1);
  });

  it('a hold left waiting after a 429 reads as not sent after a reload; Dismiss frees it without sending', async () => {
    setBusyWaitsForTest([HELD_WAIT]);
    await sendOne('linkBusyAlways');
    await toTransfers();
    await rowSays(xs['state.waiting']);
    expect(heldLinks()[0]!.meta).toMatchObject({ phase: 'waiting', lost: false });
    await reload('linkBusyAlways');
    await toTransfers();
    const row = await rowOf();
    expect(row.textContent).toContain(fill(ls['line.notSentBusy'], p));
    expect(within(row).queryByRole('button', { name: /check again/i })).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: /More actions|Row actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: fill(xs['act.clear'], p) }));
    await waitFor(() => expect(heldLinks()).toEqual([]));
    expect(linkSends).toHaveLength(1);
  });
});

describe('Download from link: the 6-day limit and Cancel', () => {
  it('a 429 wait that ends past 6 days (a long sleep): never sent again, the hold freed, it says nothing was started', async () => {
    setBusyWaitsForTest([HELD_WAIT]);
    await sendOne('linkBusyAlways');
    await toTransfers();
    await rowSays(xs['state.waiting']);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 7 * 24 * 3600_000);
    endBusyWaitsForTest();
    await rowSays(xs['state.notSent']);
    expect((await rowOf()).textContent).toContain(fill(ls['result.busy'], p));
    expect(linkSends).toHaveLength(1);
    await waitFor(() => expect(heldLinks()).toEqual([]));
  });

  it('Cancel sends nothing once changes are off', async () => {
    await sendOne('linkRunning');
    await toTransfers();
    await rowSays(xs['state.running']);
    ctl.off = true;
    await userEvent.click(within(await rowOf()).getByRole('button', { name: new RegExp(`^${ls.cancel}`) }));
    expect(await screen.findByText(new RegExp(ls.cancelFailed.slice(0, 20)))).toBeInTheDocument();
    expect(linkCancels).toEqual([]);
  });
});

describe('Download from link: how it ended', () => {
  it('completed but its file is not in the folder: it says so, never done', async () => {
    await sendOne('linkGone');
    await toTransfers();
    await rowSays(xs['state.missing']);
    expect((await rowOf()).textContent).toContain(xs['detail.missing']);
    expect(within(await rowOf()).queryByText(xs['state.done'])).toBeNull();
  });
});
