// Vitest: the Transfers tab (tab=transfers): one table of what moves
// on the computers. Link downloads running on a shown computer that this tab did not send are rows by file name and
// folder with Cancel on the row, never their link or the program's text; held downloads are "Outcome unknown" (never
// failed) with Check again on the row; a quiet computer says so.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetFiles } from '../fixtures';
import page from '../page';
import { heldLinks, resetLinksForTest, setBusyWaitsForTest } from '../link/data';
import { failDownloadsListAfter, failRecordReads, linkCancels, linkSends, loseNextCancelAnswer } from '../link/fixtures';
import { fixtureWorld } from '@core';
import ls from '../link/link.strings.en.json';
import xs from './transfers.strings.en.json';
import fs from '../strings.en.json';
import us from '../Upload.strings.en.json';

/** A realm of the fixture world that atlas is not in. */
const ATLAS_ID = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const ELSEWHERE = fixtureWorld.realms.find((r) => !ATLAS_ID.realm_ids.includes(r.id))!.id;
const LINK = 'https://downloads.example/big.iso?token=SECRET';
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const at = (path: string, tab = '') => `/files?a=atlas.00a1&ap=${encodeURIComponent(path)}${tab ? `&tab=${tab}` : ''}`;
const p = { name: 'big.iso', folder: 'tmp', computer: 'atlas' };
/** The Transfers table's row of an item ("big.iso → tmp"), found by its Item → folder cell. */
async function rowOf(item = 'big.iso → tmp', timeout = 8000): Promise<HTMLElement> {
  const cell = await screen.findByText(item, {}, { timeout });
  const row = cell.closest('[role="row"], tr');
  if (!row) throw new Error('no row');
  return row as HTMLElement;
}
/** The row's state reads `state` (a StatusPill's words), within the time a record read takes. */
const rowSays = async (state: string, item?: string) => waitFor(async () => expect(within(await rowOf(item, 1000)).getByText(state)).toBeInTheDocument(), { timeout: 8000 });
const cancelOn = (row: HTMLElement) => within(row).getByRole('button', { name: new RegExp(`^${ls.cancel}`) });
const checkOn = (row: HTMLElement) => within(row).getByRole('button', { name: /check again/i });
async function sendFromBrowse(state: string) {
  await renderPage(page, { path: at('/tmp'), state });
  // Download from link is in the pane bar's More menu; a menu item that opens a dialog ends with "…".
  await waitFor(() => expect(screen.getByRole('button', { name: us['action.upload'] })).toBeEnabled());
  await userEvent.click((await screen.findAllByRole('button', { name: fs['action.more'] }))[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: `${ls.action}…` }));
  const d = await screen.findByRole('dialog');
  await userEvent.click(within(d).getByLabelText(ls['field.link']));
  await userEvent.paste(LINK);
  const go = within(d).getByRole('button', { name: ls.send });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}
/** A fact's value at a glance, by its label. */
const fact = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? '';
const noSecret = () => {
  expect(document.body.textContent ?? '').not.toContain('SECRET');
  expect(document.body.innerHTML).not.toContain('downloads.example');
};

// eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
beforeEach(() => { resetFiles(); resetLinksForTest(); localStorage.clear(); setBusyWaitsForTest([20, 20]); });
afterAll(() => new Promise<void>((done) => { setTimeout(done, 100); }));

describe('Transfers tab', () => {
  it('the tabs switch between Browse and Transfers through tab=; a quiet computer says nothing is moving', async () => {
    const { router } = await renderPage(page, { path: at('/tmp') });
    await userEvent.click(await screen.findByRole('tab', { name: xs['tab.transfers'] }, { timeout: 20_000 }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'transfers' }));
    expect(await screen.findByText(fill(xs.quiet, p))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: fs['action.more'] })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: xs['tab.browse'] }));
    expect((await screen.findAllByRole('button', { name: fs['action.more'] }))[0]).toBeInTheDocument();
  }, 30_000);

  it('a download running on the computer that this tab does not follow: name, folder, progress and Cancel; never the link', async () => {
    await sendFromBrowse('linkRunning');
    // The folder's one notice says it runs.
    expect(await screen.findByText(fill(ls['notice.running_one'], { count: '1' }), {}, { timeout: 8000 })).toBeInTheDocument();
    // A reload: this tab no longer follows it; the computer still runs it.
    cleanup();
    resetLinksForTest();
    await renderPage(page, { path: at('/tmp', 'transfers'), state: 'linkRunning' });
    const row = await rowOf();
    expect(within(row).getByText(xs['state.running'])).toBeInTheDocument();
    expect(within(row).getByText(xs['what.download'])).toBeInTheDocument();
    expect(screen.queryByText(fill(xs.quiet, p))).toBeNull();
    noSecret();
    await userEvent.click(cancelOn(row));
    await waitFor(() => expect(linkCancels).toHaveLength(1));
    // Once asked, this tab follows it by its id: its record says how it ended.
    await rowSays(xs['state.cancelled']);
    expect(screen.queryByText(xs['state.running'])).toBeNull();
    noSecret();
  });

  it('a failed refresh of the running downloads says so with Check again, and never says nothing is moving', async () => {
    failDownloadsListAfter(1);
    await renderPage(page, { path: at('/tmp', 'transfers'), state: 'linkRunning' });
    expect(await screen.findByText(fill(xs.quiet, p))).toBeInTheDocument();
    // No row yet: the failed read is the table's own state (with Try again), and the glance can't tell what moves.
    expect(await screen.findByRole('button', { name: /try again/i }, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByText(fill(xs.quiet, p))).toBeNull();
    expect(screen.getByText(xs['glance.cantTell'])).toBeInTheDocument();
  });

  it('a running row a failed refresh could not renew stays shown, says it may have finished, and is not counted as moving', async () => {
    await sendFromBrowse('linkRunning');
    cleanup();
    resetLinksForTest();
    failDownloadsListAfter(1);
    await renderPage(page, { path: at('/tmp', 'transfers'), state: 'linkRunning' });
    const row = await rowOf();
    await waitFor(() => expect(fact(xs['glance.moving'])).toBe('1'));
    // The next read fails: the row stays, from the last answer, and Moving can no longer say it moves.
    expect(await within(row).findByText(xs['detail.stale'], {}, { timeout: 15000 })).toBeInTheDocument();
    expect(within(row).getByText(xs['state.running'])).toBeInTheDocument();
    expect(fact(xs['glance.moving'])).toBe(xs['glance.cantTell']);
    expect(screen.getByText(fill(xs['running.stale'], p))).toBeInTheDocument();
  }, 30_000);

  it('with no rows and several computers, each computer whose read failed is named with its own Check again', async () => {
    failDownloadsListAfter(0);
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Ftmp&b=borealis.00b2&bp=%2F&tab=transfers', state: 'linkRunning', realm: 'all' });
    const named = () => ['atlas', 'borealis'].filter((computer) => screen.queryByText(fill(xs['running.failed'], { computer })));
    await waitFor(() => expect(named()).toEqual(['atlas', 'borealis']), { timeout: 15000 });
    expect(screen.getAllByRole('button', { name: xs['running.retry'] })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(fact(xs['glance.moving'])).toBe(xs['glance.cantTell']);
  }, 30_000);

  it('this tab\'s own running download shows once (its own line), not again as a running download', async () => {
    await sendFromBrowse('linkRunning');
    await userEvent.click(screen.getByRole('tab', { name: xs['tab.transfers'] }));
    await rowSays(xs['state.running']);
    await new Promise((r) => { setTimeout(r, 600); });
    expect(screen.getAllByText('big.iso → tmp')).toHaveLength(1);
  });

  it('a completed download in the computer\'s list is not shown as running', async () => {
    await sendFromBrowse('many');
    // The folder's one notice says it ended.
    await screen.findByText(fill(ls['notice.ended_one'], { count: '1' }), {}, { timeout: 8000 });
    cleanup();
    resetLinksForTest();
    await renderPage(page, { path: at('/tmp', 'transfers'), state: 'many' });
    expect(await screen.findByText(fill(xs.quiet, p))).toBeInTheDocument();
    expect(screen.queryByText('big.iso → tmp')).toBeNull();
  });

  it('a held link download shows here with Check again, the same line as in the folder', async () => {
    await sendFromBrowse('linkLost');
    expect(heldLinks()).toHaveLength(1);
    await userEvent.click(screen.getByRole('tab', { name: xs['tab.transfers'] }));
    const row = await rowOf();
    // Outcome unknown, never failed; the glance counts it as unknown.
    expect(within(row).getByText(xs['state.unknown'])).toBeInTheDocument();
    expect(within(row).queryByText(xs['state.failed'])).toBeNull();
    expect(within(row).getByText(new RegExp(fill(ls['line.tracking'], p).slice(0, 30)))).toBeInTheDocument();
    await userEvent.click(checkOn(row));
    await rowSays(xs['state.done']);
    expect(linkSends).toHaveLength(1);
  });

  async function reloadInto(path: string, state: string, realm?: string) {
    await waitFor(() => expect(heldLinks()[0]?.hold.inFlight).toBeFalsy());
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    const stored = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k) ?? '']));
    cleanup();
    resetLinksForTest();
   
    await renderPage(page, { path, state, ...(realm ? { realm } : {}) });
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub.v3.changes' }));
  }

  it('after a realm switch, a held download stays listed under its computer and Check again still answers it', async () => {
    await sendFromBrowse('linkLost');
    // The API lists only the selected realm's computers: atlas is addressed by the route kept while it was shown.
    await reloadInto('/files?tab=transfers', 'linkLostScoped', ELSEWHERE);
    const row = await rowOf();
    expect(within(row).getByText('atlas')).toBeInTheDocument();
    expect(within(row).getByText(xs['state.unknown'])).toBeInTheDocument();
    await userEvent.click(checkOn(row));
    await rowSays(xs['state.done']);
  });

  it('a realm without computers still opens Transfers and checks the held download by its kept route', async () => {
    await sendFromBrowse('linkLost');
    await reloadInto('/files?tab=transfers', 'linkLostEmpty');
    const row = await rowOf();
    expect(within(row).getByText('atlas')).toBeInTheDocument();
    await userEvent.click(checkOn(row));
    await rowSays(xs['state.done']);
  });

  it('with no route kept, the held download is named from what it recorded and stays held', async () => {
    await sendFromBrowse('linkLost');
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    await waitFor(() => expect(localStorage.getItem('hub_files_routes_v1')).toBeTruthy());
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    const stored = Object.fromEntries(Object.keys(localStorage).filter((k) => k !== 'hub_files_routes_v1').map((k) => [k, localStorage.getItem(k) ?? '']));
    cleanup();
    resetLinksForTest();
   
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    localStorage.clear();
    await renderPage(page, { path: '/files?tab=transfers', state: 'linkLostEmpty' });
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub.v3.changes' }));
    const row = await rowOf();
    expect(within(row).getByText('atlas')).toBeInTheDocument();
    expect(within(row).getByText(xs['state.unknown'])).toBeInTheDocument();
    await userEvent.click(checkOn(row));
    await new Promise((r) => { setTimeout(r, 800); });
    expect(screen.queryByText(xs['state.done'])).toBeNull();
    expect(within(await rowOf()).getByText(xs['state.unknown'])).toBeInTheDocument();
    expect(heldLinks()).toHaveLength(1);
  });

  it('a Cancel whose answer is lost still follows the download to its outcome', async () => {
    await sendFromBrowse('linkRunning');
    // The folder's one notice says it runs.
    await screen.findByText(fill(ls['notice.running_one'], { count: '1' }), {}, { timeout: 8000 });
    cleanup();
    resetLinksForTest();
    await renderPage(page, { path: at('/tmp', 'transfers'), state: 'linkRunning' });
    loseNextCancelAnswer();
    await userEvent.click(cancelOn(await rowOf()));
    await rowSays(xs['state.cancelled']);
  });

  it('a followed download whose record cannot be read stays running, says so, and Check again reads it', async () => {
    await sendFromBrowse('linkRunning');
    // The folder's notice links here.
    await userEvent.click(await screen.findByRole('button', { name: ls['notice.open'] }, { timeout: 8000 }));
    await rowSays(xs['state.running']);
    failRecordReads(1000);
    expect(await within(await rowOf()).findByText(ls['line.unread'], {}, { timeout: 10000 })).toBeInTheDocument();
    expect(within(await rowOf()).queryByText(xs['state.failed'])).toBeNull();
    failRecordReads(0);
    const row = await rowOf();
    await userEvent.click(within(row).getByRole('button', { name: /More actions|Row actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: fill(xs['act.check'], p) }));
    await waitFor(async () => expect(within(await rowOf(undefined, 1000)).queryByText(ls['line.unread'])).toBeNull(), { timeout: 8000 });
    expect(within(await rowOf()).getByText(xs['state.running'])).toBeInTheDocument();
  }, 30_000);

  it('on Transfers, a followed download whose record cannot be read says so and is not counted as moving', async () => {
    await sendFromBrowse('linkRunning');
    await userEvent.click(screen.getByRole('tab', { name: xs['tab.transfers'] }));
    await rowSays(xs['state.running']);
    await waitFor(() => expect(fact(xs['glance.moving'])).toBe('1'));
    failRecordReads(1000);
    const row = await rowOf();
    expect(await within(row).findByText(ls['line.unread'], {}, { timeout: 10000 })).toBeInTheDocument();
    expect(within(row).getByText(xs['state.running'])).toBeInTheDocument();
    expect(fact(xs['glance.moving'])).toBe(xs['glance.cantTell']);
    failRecordReads(0);
  }, 30_000);

  it('a computer not shown in a pane is listed while something is held on it', async () => {
    await sendFromBrowse('linkLost');
    const held = heldLinks()[0]!;
    expect(held.meta?.computer).toBeTruthy();
    // A reload with pane A on no computer: atlas is listed for its held download only.
    await waitFor(() => expect(heldLinks()[0]?.hold.inFlight).toBeFalsy());
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    const stored = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k) ?? '']));
    cleanup();
    resetLinksForTest();
    await renderPage(page, { path: '/files?a=nowhere.0000&tab=transfers', state: 'linkLost' });
    // eslint-disable-next-line no-restricted-globals -- the test keeps the browser store across a reload and starts each test on an empty one
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub.v3.changes' }));
    const row = await rowOf();
    expect(within(row).getByText('atlas')).toBeInTheDocument();
    expect(within(row).getByText(xs['state.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(fill(xs.quiet, p))).toBeNull();
  });
});
