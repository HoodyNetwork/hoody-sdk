// Vitest: a change dialog's Check again (changes.tsx NameDialog,
// DeletePlanner.tsx, through readBackShown) closes only on core's proof that the shown send applied. A hold the read
// proves did not apply is freed, and the dialog stays open: opened on that hold, or holding its own pending send
// (the change answered no), where it says the change did not go through.
// The change's own answer is lost (a file or folder named `lost`, fixtures.ts), and the folder's listing leaves that
// name out as unreadable (skipInListingWhile) while it must prove nothing: the listing itself keeps answering, so the
// page stays usable and no read is left hanging (a lost listing made these tests depend on its error timing).
// "didn't go through" rests only on this read's own stored proof that the send was not made, never
// on its hold being gone: a hold another tab completes, or a Dismiss frees, while the dialog's read is out (a slow
// listing) says nothing about the send, and the dialog then closes as settled elsewhere.
// The same holds when the other tab's completion or Dismiss has reached only storage (this tab still
// holds the send in memory, no notice yet): the dialog's own release then answers true but wrote nothing of its own.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { nextVersion, readChanges, writeChanges } from '@core/change-store';
import { complete, holdOfLock, lockBase, pendingOf, release } from '@core/changes';
import { addFile, removeItem, seen as asks, resetFiles, skipInListingWhile, slowListingOnce } from './fixtures';
import { FILES_LOCK } from './data';
import page from './page';
import strings from './strings.en.json';

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneA = () => screen.getByRole('region', { name: strings['pane.a'] });
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const dialog = () => screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
const SLOW = { timeout: 20_000 };
// How many listings of /home/ada on atlas were asked so far (a read-back's re-read is one).
const adaAsked = () => asks.filter((x) => x === 'atlas:/home/ada').length;
const newFolder = async (name: string) => {
  await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.newFolder'] }));
  const d = await dialog();
  await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), name);
  return d;
};
const rowAction = async (name: RegExp, action: string) => {
  const r = await within(await table()).findByRole('row', { name });
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: action }));
};
const pendingIn = async (d: HTMLElement) => expect(await within(d).findAllByText(/may have gone through/i, undefined, SLOW)).not.toHaveLength(0);
// Settled either way: closed (the bug for a not-made proof), or the pending outcome gone from the open dialog.
const settledIn = (d: HTMLElement) => waitFor(() => expect(!d.isConnected || within(d).queryAllByText(/may have gone through/i).length === 0).toBe(true), SLOW);

// Another tab (or a Dismiss) frees the one held send while this dialog's read is out: completed (proved made there)
// or released (dismissed). The dialog's read then judges nothing.
const freeElsewhere = async (how: 'complete' | 'release') => {
  const held = pendingOf(lockBase(FILES_LOCK));
  expect(held).toHaveLength(1);
  const { scope, digest } = held[0]!;
  const hold = holdOfLock(scope, digest)!;
  const ok = how === 'complete' ? await complete(scope, digest, hold) : await release(scope, digest, hold, { warned: true, nobodys: true });
  expect(ok, 'the hold was still there to free while the dialog read').toBe(true);
};
// Another tab's completion (record removed) or Dismiss (record released, its stamp gone) written to storage only, as
// that tab's write lands (change-store writeChanges, which sends this tab no notice): this tab still holds it pending.
const settleInStorageOnly = (how: 'removed' | 'released') => {
  const list = readChanges() ?? [];
  const mine = list.filter((r) => r.pending);
  expect(mine, 'the one stored pending send').toHaveLength(1);
  const r = mine[0]!;
  const { sending: _s, ...rest } = r;
  void _s;
  const next = how === 'removed' ? list.filter((x) => x !== r) : list.map((x) => (x === r ? { ...rest, pending: false, t: nextVersion(list) } : x));
  expect(writeChanges(next)).toBe(true);
  expect(pendingOf(lockBase(FILES_LOCK)), 'this tab still holds the send').toHaveLength(1);
};
// Whether "didn't go through" shows at any moment until stopped (a failure claim shown, then closed, still counts).
const watchFailure = () => {
  let seen = false;
  const look = () => { if (/didn't go through/i.test(document.body.textContent ?? '')) seen = true; };
  const mo = new MutationObserver(look);
  mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  return () => { look(); mo.disconnect(); return seen; };
};

beforeEach(() => resetFiles());

describe('the change dialog\'s Check again closes only on a proof', () => {
  it('a held New folder the listing proves was not made: Check again frees it and the dialog stays open', async () => {
    await renderPage(page, { path: ADA });
    await table();
    // A lost answer: the folder may have been made, and the listing leaves it out, so no read proves it meanwhile.
    // The dialog is closed while it is held, then opened on it again.
    const stop = skipInListingWhile('/home/ada', 'lost');
    let d = await newFolder('lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    await pendingIn(d);
    await userEvent.click(within(d).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    d = await newFolder('lost');
    await pendingIn(d);
    // It was not made after all: the listing the read-back reads has no such folder.
    removeItem('/home/ada/lost');
    stop();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await settledIn(d);
    expect(d.isConnected, 'Check again closed the dialog on a change the read proved not made').toBe(true);
    expect(within(d).getByRole('textbox', { name: strings['name.label'] })).toBeInTheDocument();
  }, 60_000);

  it('a New folder sent from this dialog that the read proves not made: it stays open, says so, and can be sent again', async () => {
    await renderPage(page, { path: ADA });
    await table();
    const stop = skipInListingWhile('/home/ada', 'lost');
    const d = await newFolder('lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    await pendingIn(d);
    removeItem('/home/ada/lost');
    stop();
    // The dialog's own Check again, never closed in between: the not-made proof frees the hold it is showing.
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await settledIn(d);
    expect(d.isConnected, 'its own Check again closed the dialog on a change the read proved not made').toBe(true);
    expect(within(d).getAllByText(/didn't go through/i)).not.toHaveLength(0);
    expect(within(d).getByRole('textbox', { name: strings['name.label'] })).toBeEnabled();
    expect(within(d).getByRole('button', { name: strings['action.create'] })).toBeEnabled();
  }, 60_000);

  it('a New folder sent from this dialog that the read proves made: its own Check again closes it', async () => {
    await renderPage(page, { path: ADA });
    await table();
    const stop = skipInListingWhile('/home/ada', 'lost');
    const d = await newFolder('lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    await pendingIn(d);
    stop();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
  }, 60_000);

  it('a delete sent from the planner that the read proves not made: the frozen plan stays open and says so', async () => {
    addFile('/home/ada/lost');
    await renderPage(page, { path: ADA });
    await table();
    const stop = skipInListingWhile('/home/ada', 'lost');
    await rowAction(/\blost\b/, strings['action.delete']);
    const d = await dialog();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.delete'] }));
    await pendingIn(d);
    // Still there after all: the listing the read-back reads shows the file.
    addFile('/home/ada/lost');
    stop();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await settledIn(d);
    expect(d.isConnected, 'its own Check again closed the planner on a delete the read proved not made').toBe(true);
    expect(within(d).getAllByText(/didn't go through/i)).not.toHaveLength(0);
    // Never sent again from this plan.
    expect(within(d).getByRole('button', { name: strings['action.delete'] })).toBeDisabled();
  }, 60_000);
  for (const how of ['complete', 'release'] as const) {
    it(`a New folder whose hold is freed elsewhere (${how}) while its own Check again reads: no failure claim, it closes`, async () => {
      await renderPage(page, { path: ADA });
      await table();
      const stop = skipInListingWhile('/home/ada', 'lost');
      const d = await newFolder('lost');
      await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
      await pendingIn(d);
      // Were this dialog's read to judge it, it would prove the folder not made.
      removeItem('/home/ada/lost');
      stop();
      const asked = adaAsked();
      slowListingOnce('/home/ada', 3000);
      const seen = watchFailure();
      await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
      await waitFor(() => expect(adaAsked()).toBeGreaterThan(asked), SLOW);
      await freeElsewhere(how);
      await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
      expect(seen(), 'said the change did not go through when another tab or a Dismiss freed its hold').toBe(false);
    }, 60_000);
  }

  it('a delete whose hold another tab completes while the planner\'s own Check again reads: no failure claim, it closes', async () => {
    addFile('/home/ada/lost');
    await renderPage(page, { path: ADA });
    await table();
    const stop = skipInListingWhile('/home/ada', 'lost');
    await rowAction(/\blost\b/, strings['action.delete']);
    const d = await dialog();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.delete'] }));
    await pendingIn(d);
    addFile('/home/ada/lost');
    stop();
    const asked = adaAsked();
    slowListingOnce('/home/ada', 3000);
    const seen = watchFailure();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(adaAsked()).toBeGreaterThan(asked), SLOW);
    await freeElsewhere('complete');
    await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
    expect(seen(), 'said the delete did not go through when another tab completed its hold').toBe(false);
  }, 60_000);

  it('a New folder whose own Check again proves nothing (still unreadable): it stays pending, no failure claim', async () => {
    await renderPage(page, { path: ADA });
    await table();
    skipInListingWhile('/home/ada', 'lost');
    const d = await newFolder('lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    await pendingIn(d);
    removeItem('/home/ada/lost');
    const asked = adaAsked();
    const seen = watchFailure();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(adaAsked()).toBeGreaterThan(asked), SLOW);
    await waitFor(() => expect(pendingOf(lockBase(FILES_LOCK))).toHaveLength(1));
    await pendingIn(d);
    expect(d.isConnected).toBe(true);
    expect(seen(), 'said the change did not go through on a read that proved nothing').toBe(false);
  }, 60_000);
  for (const how of ['removed', 'released'] as const) {
    it(`a New folder whose hold another tab settled in storage only (${how}) while its own Check again reads: no failure claim`, async () => {
      await renderPage(page, { path: ADA });
      await table();
      const stop = skipInListingWhile('/home/ada', 'lost');
      const d = await newFolder('lost');
      await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
      await pendingIn(d);
      // The read will judge it not made (no such folder), and this tab still holds the send when it does.
      removeItem('/home/ada/lost');
      stop();
      const asked = adaAsked();
      slowListingOnce('/home/ada', 3000);
      const seen = watchFailure();
      await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
      await waitFor(() => expect(adaAsked()).toBeGreaterThan(asked), SLOW);
      settleInStorageOnly(how);
      await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
      expect(seen(), `said the change did not go through when another tab had ${how} it in storage`).toBe(false);
    }, 60_000);
  }

  it('a delete another tab dismissed in storage only while the planner\'s own Check again reads: no failure claim', async () => {
    addFile('/home/ada/lost');
    await renderPage(page, { path: ADA });
    await table();
    const stop = skipInListingWhile('/home/ada', 'lost');
    await rowAction(/\blost\b/, strings['action.delete']);
    const d = await dialog();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.delete'] }));
    await pendingIn(d);
    addFile('/home/ada/lost');
    stop();
    const asked = adaAsked();
    slowListingOnce('/home/ada', 3000);
    const seen = watchFailure();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(adaAsked()).toBeGreaterThan(asked), SLOW);
    settleInStorageOnly('released');
    await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
    expect(seen(), 'said the delete did not go through when another tab had dismissed it in storage').toBe(false);
  }, 60_000);
});
