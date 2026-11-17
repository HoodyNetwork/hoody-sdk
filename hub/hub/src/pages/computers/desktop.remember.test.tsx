// Vitest: what the Desktop tab remembers about a desktop is decided only
// by what can still be true. A check that answers after the tab is gone writes nothing; a desktop a later read showed
// "opened again" stays so over the session end core held when that read was sent, never over a later one; a computer
// the Computers list shows not running ends every claim about its desktops, with the Desktop tab open or not.
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import * as C from '@core/changes';
import { CHANGE_STORE_KEY, readChanges, writeChanges } from '@core/change-store';
import { queryClient } from '@core';
import { heldDesktopSend } from './data';
import { computerKey, patchSlot, readSlot, resetDesktopSlotsForTests, tick } from './parts/desktopSlots';
import { computers, desktopEnded, desktopReads, desktopSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';

/** Stop desktop sits in the toolbar's ⋯ menu (a live desktop only): open it, then choose Stop. */
const pressStop = async () => {
  await userEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: new RegExp(`^${strings['desktop.more'].replace('{{n}}', '\\d+')}`) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['desktop.stop']}`) }));
};

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');
const ck = computerKey(atlas);

const w = (k: keyof typeof strings, n = 1) => strings[k].replace('{{n}}', String(n));
const INC = '0123456789abcdef0123456789abcdef';
const INC2 = 'abcdefabcdefabcdefabcdefabcdef01';

afterEach(() => {
  desktopSends.length = 0;
  desktopEnded.clear();
  desktopReads.delayNext = 0;
  desktopReads.inc = {};
  desktopReads.status = {};
  desktopReads.asked = 0;
  resetDesktopSlotsForTests();
  C.resetChanges();
});

const open = async (state?: string) => {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop', ...(state ? { state } : {}) });
  return screen.findByTitle('atlas, desktop 1', undefined, { timeout: 20000 });
};
const stop = async () => {
  await pressStop();
  const d = await screen.findByRole('alertdialog', { name: w('desktop.stop.title') });
  await userEvent.click(within(d).getByRole('button', { name: strings['desktop.stop'] }));
};
const away = async () => {
  await userEvent.click(screen.getByRole('tab', { name: strings['tab.ports'] }));
  await userEvent.click(screen.getByRole('tab', { name: strings['tab.desktop'] }));
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Polls `bad` every 50 ms for `ms`: fails the moment it holds (an outcome that must never show). */
const never = async (bad: () => boolean, ms = 2000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    expect(bad()).toBe(false);
    await act(async () => {
      await wait(50);
    });
  }
};
const reopenedShown = () => screen.queryByText(w('desktop.reopened')) !== null;
/** Another tab's newer send of the session end, held: the store's record of it replaced by a later hold. */
const otherTabHolds = async (inc: string) => {
  const rec = readChanges()?.find((r) => JSON.stringify(r.meta ?? null).includes('computer.desktopEnd'));
  if (!rec) throw new Error('the session end in the store');
  await act(async () => {
    writeChanges([...(readChanges() ?? []).filter((r) => r.id !== rec.id), { ...rec, pending: true, inc, key: 'K-other-tab', t: (rec as { t: number }).t + 1 } as typeof rec]);
    window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
  });
};
const heldEnd = () => heldDesktopSend('computer.desktopEnd', atlas.id, 1);
/** atlas's status in the computers list as the page last read it (any cached list). */
const listedStatus = () =>
  queryClient
    .getQueriesData<unknown>({})
    .flatMap(([, d]) => (Array.isArray(d) ? d : []))
    .find((c): c is { id: string; status?: string } => !!c && typeof c === 'object' && (c as { id?: unknown }).id === atlas.id)?.status;

/** The desktop stopped, its session end's answer lost (held by core), then another session opens it: "opened again". */
const reopenedOverHeldEnd = async () => {
  await open('desktopEndLost');
  await stop();
  await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 });
  desktopReads.inc['1601'] = INC2;
  await away();
  expect(await screen.findByText(w('desktop.reopened'), undefined, { timeout: 8000 })).toBeInTheDocument();
};

describe('Desktop tab: what it remembers about a desktop', () => {
  it('a check of a stopped desktop that answers after the tab is gone writes nothing', async () => {
    // The program lists desktop 1 under another session than the one the tab remembers stopped.
    desktopReads.inc['1601'] = INC2;
    await open();
    const before = desktopReads.asked;
    desktopReads.delayNext = 3000; // the check the remembered "stopped" starts answers late
    await act(async () => {
      patchSlot(ck, 1, { phase: { k: 'off' }, gen: tick(), inc: INC });
    });
    // The check was sent (it took the delay) before the tab is left.
    await waitFor(() => expect(desktopReads.asked).toBeGreaterThan(before));
    expect(desktopReads.delayNext).toBe(0);
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.ports'] }));
    await wait(4000); // past the check's 3 s answer
    expect(readSlot(ck, 1).phase).toEqual({ k: 'off' });
  }, 30000);

  it('"opened again" stays over the session end held when its read was sent: one verdict, no read loop', async () => {
    await reopenedOverHeldEnd();
    const h = heldEnd();
    expect(h).toBeTruthy();
    await waitFor(() => expect(readSlot(ck, 1).phase).toEqual({ k: 'reopened', over: h }));
    const reads = desktopReads.asked;
    await wait(1500);
    expect(desktopReads.asked).toBe(reads); // no keep/read round trip
    expect(readSlot(ck, 1).phase).toEqual({ k: 'reopened', over: h });
    expect(screen.getByText(w('desktop.reopened'))).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
  }, 30000);

  it('a session end held after the "opened again" read (another tab) reads not reset, unknown, and is kept', async () => {
    await reopenedOverHeldEnd();
    const h = heldEnd();
    await waitFor(() => expect(readSlot(ck, 1).phase).toEqual({ k: 'reopened', over: h }));
    // Another tab stops desktop 1 again and loses its session end's answer: a new hold of the same change, written to
    // the shared store (this tab's memory of the desktop is not touched).
    const rec = readChanges()?.find((r) => r.pending && JSON.stringify(r.meta ?? null).includes('computer.desktopEnd'));
    if (!rec) throw new Error('the held session end in the store');
    await act(async () => {
      writeChanges([...(readChanges() ?? []).filter((r) => r.id !== rec.id), { ...rec, inc: 'b'.repeat(32), key: 'K-other-tab', t: (rec as { t: number }).t + 1 } as typeof rec]);
      window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    });
    await waitFor(() => expect(heldEnd()).toBeTruthy());
    expect(heldEnd()).not.toBe(h);
    expect(await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(w('desktop.reopened'))).toBeNull();
    // The keep effect wrote the claim into the tab's memory, marked held: which session that end ended is not known, so
    // no read decides "opened again" while it is held.
    const h2 = heldEnd();
    await waitFor(() => expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: h2 }));
    await wait(1000);
    expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: h2 });
    expect(screen.getByText(w('desktop.reset.unknown'))).toBeInTheDocument();
  }, 40000);

  it('a session end held while the "opened again" read is out is newer than that read: not reset, unknown', async () => {
    await open('desktopEndLost');
    await stop();
    await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 });
    const h = heldEnd();
    desktopReads.inc['1601'] = INC2;
    desktopReads.delayNext = 3000; // the next list read answers late
    const before = desktopReads.asked;
    await away();
    await waitFor(() => expect(desktopReads.asked).toBeGreaterThan(before));
    // While that read is out, another tab's Stop loses its session end's answer: a newer hold.
    const rec = readChanges()?.find((r) => r.pending && JSON.stringify(r.meta ?? null).includes('computer.desktopEnd'));
    if (!rec) throw new Error('the held session end in the store');
    await act(async () => {
      writeChanges([...(readChanges() ?? []).filter((r) => r.id !== rec.id), { ...rec, inc: 'c'.repeat(32), key: 'K-other-tab', t: (rec as { t: number }).t + 1 } as typeof rec]);
      window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    });
    await waitFor(() => expect(heldEnd()).toBeTruthy());
    expect(heldEnd()).not.toBe(h);
    const h2 = heldEnd();
    await wait(4000); // past the read's 3 s answer
    expect(screen.queryByText(w('desktop.reopened'))).toBeNull();
    expect(screen.getByText(w('desktop.reset.unknown'))).toBeInTheDocument();
    expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: h2 });
  }, 40000);

  it('a held session end still reads not reset over a remembered stopped desktop, and the keep effect stores it', async () => {
    await open('desktopEndLost');
    await stop();
    await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 });
    await act(async () => {
      patchSlot(ck, 1, { phase: { k: 'off' }, gen: tick(), inc: INC });
    });
    expect(await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: heldEnd() }));
    expect(readSlot(ck, 1).inc).toBeNull(); // no session is kept for it: none is known
  }, 30000);

  it('two tabs: a newer session end held over this tab\'s own not-reset desktop is never "opened again"', async () => {
    // This tab stops desktop 1 and loses its session end's answer (its own hold, h).
    await open('desktopEndLost');
    await stop();
    await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 });
    const h = heldEnd();
    await waitFor(() => expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, over: h }));
    // Another tab stops it again and loses its answer too: a newer hold, which ended a session this tab does not know.
    await otherTabHolds('d'.repeat(32));
    await waitFor(() => expect(heldEnd()).toBeTruthy());
    const h2 = heldEnd();
    expect(h2).not.toBe(h);
    // The program now lists another session; reads run.
    desktopReads.inc['1601'] = INC2;
    const before = desktopReads.asked;
    await away();
    await waitFor(() => expect(desktopReads.asked).toBeGreaterThan(before));
    await never(reopenedShown);
    expect(screen.getByText(w('desktop.reset.unknown'))).toBeInTheDocument();
    expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: h2 });
  }, 40000);

  it('two tabs: a claimed session end that core stops holding keeps no session to compare: stays not reset', async () => {
    await open('desktopEndLost');
    await stop();
    await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 });
    // This tab forgets its own reset (as after a reload): what it shows now is claimed from the hold.
    await act(async () => {
      patchSlot(ck, 1, { phase: { k: 'off' }, gen: tick(), inc: INC });
    });
    await waitFor(() => expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: heldEnd() }));
    // Another tab dismisses the hold: core holds nothing, its outcome is still unknown here.
    await act(async () => {
      writeChanges((readChanges() ?? []).filter((r) => !(r.pending && JSON.stringify(r.meta ?? null).includes('computer.desktopEnd'))));
      window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    });
    await waitFor(() => expect(heldEnd()).toBeFalsy());
    // The program lists another session than any this tab saw.
    desktopReads.inc['1601'] = INC2;
    const before = desktopReads.asked;
    await away();
    await waitFor(() => expect(desktopReads.asked).toBeGreaterThan(before));
    await never(reopenedShown);
    expect(screen.getByText(w('desktop.reset.unknown'))).toBeInTheDocument();
    expect(readSlot(ck, 1).phase).toMatchObject({ k: 'reset', known: false, held: true });
  }, 40000);

  it('two tabs: a Stop whose own hold is replaced while its session end is out never takes the newer hold as its own', async () => {
    await open('desktopEndLostSlow');
    await stop();
    // This tab's session end is out (its answer, lost, comes in 4 s).
    await waitFor(() => expect(desktopSends.some((s) => s.method === 'DELETE')).toBe(true), { timeout: 8000 });
    // Meanwhile its hold is dismissed and another tab sends the same change, which is held: a newer hold.
    await otherTabHolds('e'.repeat(32));
    await waitFor(() => expect(heldEnd()).toBeTruthy());
    const h2 = heldEnd();
    // The first answer lands, lost: this tab's reset is undecided, and its send's hold is not the one core shows.
    expect(await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 10000 })).toBeInTheDocument();
    await waitFor(() => expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: h2 }));
    // The program lists another session: the newer send's outcome is unknown, so never "opened again".
    desktopReads.inc['1601'] = INC2;
    const before = desktopReads.asked;
    await away();
    await waitFor(() => expect(desktopReads.asked).toBeGreaterThan(before));
    await never(reopenedShown);
    expect(screen.getByText(w('desktop.reset.unknown'))).toBeInTheDocument();
    expect(readSlot(ck, 1).phase).toEqual({ k: 'reset', known: false, held: true, over: h2 });
  }, 40000);

  it('the Computers list showing the computer not running ends its desktop claims while the Desktop tab is closed', async () => {
    await open();
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.ports'] }));
    expect(readSlot(ck, 1).phase).toEqual({ k: 'off' });
    desktopReads.status[atlas.id] = 'restarting';
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(listedStatus()).toBe('restarting'));
    await waitFor(() => expect(readSlot(ck, 1).phase).toBeUndefined());
  }, 30000);

  it('a list change that still shows the computer running keeps its desktop claims', async () => {
    const other = computers.find((c) => c.id !== atlas.id && c.status === 'running');
    if (!other) throw new Error('fixture: a second running computer');
    await open();
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.ports'] }));
    desktopReads.status[other.id] = 'stopped'; // the list changes, atlas still running
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() =>
      expect(
        queryClient
          .getQueriesData<unknown>({})
          .flatMap(([, d]) => (Array.isArray(d) ? d : []))
          .some((c) => !!c && typeof c === 'object' && (c as { id?: unknown; status?: unknown }).id === other.id && (c as { status?: unknown }).status === 'stopped'),
      ).toBe(true),
    );
    expect(listedStatus()).toBe('running');
    expect(readSlot(ck, 1).phase).toEqual({ k: 'off' });
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.desktop'] }));
    expect(await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);
});
