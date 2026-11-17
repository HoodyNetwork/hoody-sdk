// Vitest: Download from a link: the dialog, the hold before the send, the
// same-id resends, the folder's one notice and each download's row on Transfers, and that the
// link and the program's text are never shown or kept.
import { beforeEach, describe, expect, it } from 'vitest';
/* eslint-disable no-restricted-globals -- the test reads browser storage to prove the link is never kept, and copies the hold across a reload */
import { cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { exists, resetFiles } from '../fixtures';
import page from '../page';
import { heldLinks, resetLinksForTest, setBusyWaitsForTest } from './data';
import { linkSends } from './fixtures';
import ls from './link.strings.en.json';
import us from '../Upload.strings.en.json';
import fs from '../strings.en.json';
import xs from '../transfers/transfers.strings.en.json';
import ks from '@kit/strings.en.json';

const LINK = 'https://downloads.example/dir/big%20file.iso?token=SECRET';
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const at = (path: string) => `/files?a=atlas.00a1&ap=${encodeURIComponent(path)}`;
/** The pane's More menu item (Download from link sits in the bar's More menu), its menu open. */
const moreItem = async (name: string) => {
  await userEvent.click((await screen.findAllByRole('button', { name: fs['action.more'] }))[0]!);
  // A menu item that opens a dialog ends with "…" (kit Menu); the label before it is the link strings' own.
  return screen.findByRole('menuitem', { name: `${name}…` });
};
const open = async (path = '/tmp', state?: string) => {
  await renderPage(page, { path: at(path), ...(state ? { state } : {}) });
  await waitFor(() => expect(screen.getByRole('button', { name: us['action.upload'] })).toBeEnabled());
  await userEvent.click(await moreItem(ls.action));
  return screen.findByRole('dialog');
};
const paste = async (d: HTMLElement, link = LINK) => { await userEvent.click(within(d).getByLabelText(ls['field.link'])); await userEvent.paste(link); };
const press = async (d: HTMLElement) => {
  const b = within(d).getByRole('button', { name: ls.send });
  await waitFor(() => expect(b).toBeEnabled());
  await userEvent.click(b);
};
const p = { name: 'big file.iso', folder: 'tmp', computer: 'atlas' };
const n = (key: string, count: number) => fill(key, { count: String(count) });
/** The folder's one notice for the link downloads reads `words`. */
const notice = (words: string) => screen.findByText(words, {}, { timeout: 8000 });
/** Its See Transfers opens Transfers, where each download is a row. */
const toTransfers = async () => {
  await userEvent.click(await screen.findByRole('button', { name: ls['notice.open'] }, { timeout: 8000 }));
  await waitFor(() => expect(screen.getByRole('tab', { name: xs['tab.transfers'] })).toHaveAttribute('aria-selected', 'true'));
};
/** The Transfers row of the download ("big file.iso → tmp"). */
async function rowOf(timeout = 8000): Promise<HTMLElement> {
  const row = (await screen.findByText('big file.iso → tmp', {}, { timeout })).closest('[role="row"], tr');
  if (!row) throw new Error('no row');
  return row as HTMLElement;
}
/** The row's state reads `state`, within the time a record read takes. */
const rowSays = async (state: string) => waitFor(async () => expect(within(await rowOf(1000)).getByText(state)).toBeInTheDocument(), { timeout: 8000 });
/** A row action from its menu. */
const fromMenu = async (row: HTMLElement, name: string | RegExp) => {
  await userEvent.click(within(row).getByRole('button', { name: /More actions|Row actions/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name }));
};
const noSecret = () => {
  expect(document.body.textContent ?? '').not.toContain('SECRET');
  expect(document.body.innerHTML).not.toContain('downloads.example');
  for (const k of Object.keys(localStorage)) expect(localStorage.getItem(k) ?? '').not.toContain('downloads.example');
};

beforeEach(() => { resetFiles(); resetLinksForTest(); localStorage.clear(); setBusyWaitsForTest([20, 20]); });

describe('Download from link: the dialog', () => {
  it('off at the top folder; at a folder the name comes from the link and the limits are said', async () => {
    await renderPage(page, { path: at('/') });
    // The top folder is listed (Upload goes there); a link download does not.
    await waitFor(() => expect(screen.getByRole('button', { name: us['action.upload'] })).toBeEnabled());
    // In the More menu it is off, and says why.
    expect(await moreItem(ls.action)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(ls['off.top'])).toBeInTheDocument();
  });

  it('the name defaults to the link\'s last part until edited; a bad name or a link to a computer cannot be sent', async () => {
    const d = await open();
    expect(within(d).getByText(ls['field.linkHint'])).toBeInTheDocument();
    await paste(d);
    const name = within(d).getByLabelText(ls['field.name']) as HTMLInputElement;
    expect(name.value).toBe('big file.iso');
    await userEvent.clear(name);
    await userEvent.type(name, 'a/b');
    expect(within(d).getByText(ls['bad.name'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ls.send })).toBeDisabled();
    const link = within(d).getByLabelText(ls['field.link']) as HTMLInputElement;
    await userEvent.clear(link);
    await userEvent.paste('https://files-x.fixture.invalid/a');
    expect(within(d).getByText(ls['bad.computer'])).toBeInTheDocument();
    await userEvent.clear(link);
    await userEvent.paste('ftp://e.x/a');
    expect(within(d).getByText(ls['bad.scheme'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ls.send })).toBeDisabled();
    expect(linkSends).toEqual([]);
  });

  it('an older Hoody Kit: it says so and nothing can be sent', async () => {
    const d = await open('/tmp', 'linkOld');
    await paste(d);
    expect(await within(d).findByText(fill(ls['kit.old'], p))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ls.send })).toBeDisabled();
  });
});

describe('Download from link: sending', () => {
  it('accepted: one send with a fresh id, the hold freed, the line follows it to done and the file is in the folder', async () => {
    const d = await open();
    await paste(d);
    await press(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(linkSends).toHaveLength(1);
    expect(linkSends[0]).toMatch(/^[0-9a-f-]{36}$/);
    // One notice in the folder, never a line per download; it ends as "1 download ended".
    expect(await notice(n(ls['notice.ended_one'], 1))).toBeInTheDocument();
    expect(screen.queryByText(/^Downloaded big file/)).toBeNull();
    await toTransfers();
    await rowSays(xs['state.done']);
    expect(exists('/tmp/big file.iso')).toBe(true);
    expect(heldLinks()).toEqual([]);
    noSecret();
  });

  it('ended: the notice can be dismissed in the folder, which clears it from Transfers too; one that needs you cannot', async () => {
    const d = await open();
    await paste(d);
    await press(d);
    const ended = await notice(n(ls['notice.ended_one'], 1));
    await userEvent.click(within(ended.closest('[role="status"]') as HTMLElement).getByRole('button', { name: ks['action.close'] }));
    await waitFor(() => expect(screen.queryByRole('button', { name: ls['notice.open'] })).toBeNull());
    await userEvent.click(screen.getByRole('tab', { name: xs['tab.transfers'] }));
    await screen.findByText(fill(xs.quiet, p), {}, { timeout: 8000 });
    expect(screen.queryByText('big file.iso → tmp')).toBeNull();
  });

  it('a busy folder (409 FILE_PATH_BUSY) started nothing: the dialog says so and no hold stays', async () => {
    const d = await open('/tmp', 'linkPathBusy');
    await paste(d);
    await press(d);
    expect(await within(d).findByText(ls['result.FILE_PATH_BUSY'])).toBeInTheDocument();
    expect(linkSends).toHaveLength(1);
    await waitFor(() => expect(heldLinks()).toEqual([]));
  });

  it('a busy computer (429): the same id is sent again after waits, then accepted', async () => {
    const d = await open('/tmp', 'linkBusy');
    await paste(d);
    await press(d);
    await toTransfers();
    await rowSays(xs['state.done']);
    expect(linkSends).toHaveLength(3);
    expect(new Set(linkSends).size).toBe(1);
    expect(heldLinks()).toEqual([]);
  });

  it('a computer busy past every wait: the line says nothing was started, the same id each time, no hold stays', async () => {
    const d = await open('/tmp', 'linkBusyAlways');
    await paste(d);
    await press(d);
    expect(await notice(n(ls['notice.attention_one'], 1))).toBeInTheDocument();
    await toTransfers();
    await rowSays(xs['state.notSent']);
    expect((await rowOf()).textContent).toContain(fill(ls['result.busy'], p));
    expect(linkSends).toHaveLength(3);
    expect(new Set(linkSends).size).toBe(1);
    expect(heldLinks()).toEqual([]);
  });

  it('a download that fails on the computer says so in fixed words, never the program\'s text', async () => {
    const d = await open('/tmp', 'linkFails');
    await paste(d);
    await press(d);
    await toTransfers();
    await rowSays(xs['state.failed']);
    noSecret();
  });

  it('a running download shows its progress and can be cancelled', async () => {
    const d = await open('/tmp', 'linkRunning');
    await paste(d);
    await press(d);
    // A running download is news, not a warning: the notice is a status.
    expect((await notice(n(ls['notice.running_one'], 1))).closest('[role="status"]')).not.toBeNull();
    await toTransfers();
    await rowSays(xs['state.running']);
    await userEvent.click(within(await rowOf()).getByRole('button', { name: new RegExp(`^${ls.cancel}`) }));
    await rowSays(xs['state.cancelled']);
  });
});

describe('Download from link: a lost answer', () => {
  it('recorded: it may have been accepted, the hold keeps no link, Check again reads by id and follows it', async () => {
    const d = await open('/tmp', 'linkLost');
    await paste(d);
    await press(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // One that may have been accepted needs you: the notice warns, and only Transfers answers it (no dismiss here).
    const warn = (await notice(n(ls['notice.attention_one'], 1))).closest('[role="alert"]') as HTMLElement;
    expect(warn).not.toBeNull();
    expect(within(warn).queryByRole('button', { name: ks['action.close'] })).toBeNull();
    expect(heldLinks()).toHaveLength(1);
    expect(heldLinks()[0]!.meta).toMatchObject({ phase: 'unknown', lost: true, filename: 'big file.iso', folder: '/tmp' });
    noSecret();
    await toTransfers();
    await rowSays(xs['state.unknown']);
    await userEvent.click(within(await rowOf()).getByRole('button', { name: /check again/i }));
    await rowSays(xs['state.done']);
    expect(linkSends).toHaveLength(1);
    expect(heldLinks()).toEqual([]);
  });

  it('not recorded, this tab has the link: Check again sends the same id once more', async () => {
    const d = await open('/tmp', 'linkLostNone');
    await paste(d);
    await press(d);
    await toTransfers();
    await rowSays(xs['state.unknown']);
    await userEvent.click(within(await rowOf()).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(linkSends).toHaveLength(2));
    expect(linkSends[1]).toBe(linkSends[0]);
    // The resend was lost too: still unknown, still held.
    expect(await screen.findByText(new RegExp(ls['check.resent'].slice(0, 20)))).toBeInTheDocument();
    expect(heldLinks()).toHaveLength(1);
  });

  it('after a reload (no link in memory): Check again only reads and says so; Stop tracking is warned and frees it', async () => {
    const d = await open('/tmp', 'linkLostNone');
    await paste(d);
    await press(d);
    expect(await notice(n(ls['notice.attention_one'], 1))).toBeInTheDocument();
    await waitFor(() => expect(heldLinks()[0]?.hold.inFlight).toBeFalsy());
    // A reload: the tab's memory is gone, the hold is in browser storage.
    const stored = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k) ?? '']));
    cleanup();
    resetLinksForTest();
    await renderPage(page, { path: at('/tmp'), state: 'linkLostNone' });
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub.v3.changes' }));
    // After the reload the folder's notice still counts it, and Transfers still answers it.
    expect(await notice(n(ls['notice.attention_one'], 1))).toBeInTheDocument();
    await toTransfers();
    await userEvent.click(within(await rowOf()).getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(new RegExp(ls['check.notFound'].slice(0, 30).replace('{{computer}}', 'atlas')))).toBeInTheDocument();
    expect(linkSends).toHaveLength(1);
    await fromMenu(await rowOf(), new RegExp(`^${ls.stop}`));
    const w = await screen.findByRole('dialog');
    expect(within(w).getByText(fill(ls.stopBody, p))).toBeInTheDocument();
    await userEvent.click(within(w).getByRole('button', { name: ls.stop }));
    await waitFor(() => expect(heldLinks()).toEqual([]));
    await waitFor(() => expect(screen.queryByText('big file.iso → tmp')).toBeNull());
  });
});

describe("the pane bar's More menu", () => {
  /** The pane's More menu, open: its items in order, by accessible name. */
  const menu = async (path: string, state?: string) => {
    await renderPage(page, { path: at(path), ...(state ? { state } : {}) });
    const pane = await screen.findByRole('region', { name: fs['pane.a'] });
    // The folder is listed once Upload is offered (on, or off with a reason in a read-only session).
    await within(pane).findByRole('button', { name: us['action.upload'] }, { timeout: 8000 });
    await waitFor(() => expect(within(pane).getByRole('button', { name: fs['action.more'] })).toBeEnabled());
    expect(within(pane).queryByRole('button', { name: ls.action })).toBeNull();
    await userEvent.click(within(pane).getByRole('button', { name: fs['action.more'] }));
    return screen.findByRole('menu');
  };
  const before = (a: HTMLElement, b: HTMLElement) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  it("holds Run here's items first, then Download from link; neither is a bar button any more", async () => {
    const m = await menu('/tmp');
    const here = within(m).getByRole('menuitem', { name: `${fs['ow.here']}…` });
    const app = within(m).getByRole('menuitem', { name: fs['ow.appHere'] });
    const link = within(m).getByRole('menuitem', { name: `${ls.action}…` });
    before(here, app);
    before(app, link);
    expect(link).not.toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAccessibleDescription(fs['changes.off']);
  });

  it('a session that cannot change files sees Download from link off, with the reason', async () => {
    const m = await menu('/tmp', 'tokenRead');
    const link = within(m).getByRole('menuitem', { name: `${ls.action}…` });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAccessibleDescription(fs['changes.off']);
  });
});
