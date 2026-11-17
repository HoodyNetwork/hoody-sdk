// Vitest: Stop desktop and Reload desktop. Stop asks first, takes the frame away, stops
// display 1600 + N, then ends desktop N's session (only the shell the session list showed): without that second step
// the desktop's address would find the session and wait for a display nobody starts. Each answer says what is known:
// already stopped counts as stopped, busy and refused stop nothing, a lost answer stays unknown and nothing is sent
// again until the person presses Stop again. Reload only remounts the frame.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import * as C from '@core/changes';
import { queryClient } from '@core';
import { bump } from '@core/ctx';
import { computerKey, patchSlot, readSlot, resetDesktopSlotsForTests, tick } from './parts/desktopSlots';
import { computers, desktopEnded, desktopFrameProbe, desktopReads, desktopSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import { desktopUrl } from './urls';

/** Stop desktop sits in the toolbar's ⋯ menu (a live desktop only): open it, then choose Stop. */
const pressStop = async () => {
  await userEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: new RegExp(`^${strings['desktop.more'].replace('{{n}}', '\\d+')}`) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['desktop.stop']}`) }));
};

const toasts: { title: string; tone?: string }[] = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string }) => { toasts.push(c); return 'toast-1'; } }));

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

const w = (k: keyof typeof strings, n = 1) => strings[k].replace('{{n}}', String(n));
const STOP = { method: 'POST', path: '/api/v1/system/displays/1601/stop' };
const END = { method: 'DELETE', path: '/api/v1/terminal/1601' };
const INC = '0123456789abcdef0123456789abcdef';
const INC2 = 'abcdefabcdefabcdefabcdefabcdef01';

// Each send records whether a desktop frame was still on the page (Stop takes the frame away first).
beforeEach(() => {
  desktopFrameProbe.framed = () => document.querySelector('[data-desktop] iframe') !== null;
});
afterEach(() => {
  desktopFrameProbe.framed = () => false;
  desktopSends.length = 0;
  desktopEnded.clear();
  desktopReads.delayNext = 0;
  desktopReads.inc = {};
  desktopReads.status = {};
  toasts.length = 0;
  resetDesktopSlotsForTests();
  C.resetChanges();
});

const open = async (state?: string) => {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop', ...(state ? { state } : {}) });
  // The first render of a run also loads the detail view; on a busy host that alone can pass 8 s.
  return screen.findByTitle('atlas, desktop 1', undefined, { timeout: 30000 });
};
const stop = async () => {
  await pressStop();
  const d = await screen.findByRole('alertdialog', { name: w('desktop.stop.title') });
  expect(d.textContent).toContain(strings['desktop.stop.body']);
  await userEvent.click(within(d).getByRole('button', { name: strings['desktop.stop'] }));
};
const sends = () => desktopSends.map((s) => ({ method: s.method, path: s.path }));
const settle = () => new Promise((r) => setTimeout(r, 400));

describe('computers: Stop desktop', () => {
  it('asks first; Cancel sends nothing and keeps the desktop', async () => {
    await open();
    await pressStop();
    const d = await screen.findByRole('alertdialog', { name: w('desktop.stop.title') });
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(desktopSends).toEqual([]);
    expect(screen.getByTitle('atlas, desktop 1')).toBeInTheDocument();
  }, 60000);

  it('stops display 1601, then ends session 1601 with its incarnation, the frame gone first; then Start opens it again', async () => {
    await open();
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    expect(sends()).toEqual([STOP, END]);
    expect(desktopSends[1]?.query).toEqual({ incarnation: INC });
    expect(desktopSends.every((s) => !s.framed)).toBe(true);
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('iframe')).toBeNull();
    // The stopped state is the result's place on screen: no toast on top.
    expect(toasts).toEqual([]);
    await userEvent.click(within(panel).getByRole('button', { name: strings['desktop.start'] }));
    const f = await screen.findByTitle('atlas, desktop 1');
    expect(f.getAttribute('src')).toBe(desktopUrl(atlas, 1));
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('a display already gone (404) counts as stopped: the session is still ended', async () => {
    await open('desktopStopGone');
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('a session already gone (404) counts as ended: the desktop reads stopped', async () => {
    await open('desktopEndGone');
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('busy (409): nothing stopped, no session end, and Try again sends only when pressed', async () => {
    await open('desktopStopBusy');
    await stop();
    await screen.findByText(w('desktop.busy'), undefined, { timeout: 8000 });
    expect(screen.getByText(strings['desktop.busy.body'])).toBeInTheDocument();
    await settle();
    expect(sends()).toEqual([STOP]);
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.tryAgain'] }));
    await waitFor(() => expect(sends()).toEqual([STOP, STOP]));
  }, 60000);

  it('refused (403): says it was not stopped, ends nothing, and Show desktop brings the frame back', async () => {
    await open('desktopStopDenied');
    await stop();
    await screen.findByText(w('desktop.failed'), undefined, { timeout: 8000 });
    await settle();
    expect(sends()).toEqual([STOP]);
    expect(toasts).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.show'] }));
    expect(await screen.findByTitle('atlas, desktop 1')).toBeInTheDocument();
    expect(sends()).toEqual([STOP]);
  }, 60000);

  it('a lost answer stays unknown: never stopped or failed, nothing sent again until Stop again', async () => {
    await open('desktopStopLost');
    await stop();
    await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 });
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent ?? '').not.toContain(w('desktop.off'));
    expect(panel.textContent ?? '').not.toContain(w('desktop.failed'));
    expect(panel.querySelector('iframe')).toBeNull();
    await new Promise((r) => setTimeout(r, 1200));
    expect(sends()).toEqual([STOP]);
    expect(toasts).toEqual([]);
    await userEvent.click(within(panel).getByRole('button', { name: strings['desktop.stopAgain'] }));
    await waitFor(() => expect(sends()).toEqual([STOP, STOP]));
  }, 60000);

  it('the session end losing its answer says the reset is unknown; Stop again finishes it', async () => {
    await open('desktopEndLost');
    await stop();
    await screen.findByText(w('desktop.reset.unknown'), undefined, { timeout: 8000 });
    expect(screen.getByText(strings['desktop.reset.body'])).toBeInTheDocument();
    expect(sends()).toEqual([STOP, END]);
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.stopAgain'] }));
    await waitFor(() => expect(sends()).toEqual([STOP, END, STOP, END]));
  }, 60000);

  it('the session end refused says the desktop stopped but was not reset', async () => {
    await open('desktopEndFailed');
    await stop();
    await screen.findByText(w('desktop.reset'), undefined, { timeout: 8000 });
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('a replaced shell (409 INCARNATION_MISMATCH) is left as it is and said so, with Show desktop and Stop again', async () => {
    await open('desktopEndReplaced');
    await stop();
    await screen.findByText(w('desktop.replaced'), undefined, { timeout: 8000 });
    expect(sends()).toEqual([STOP, END]);
    expect(screen.getByRole('button', { name: strings['desktop.show'] })).toBeInTheDocument();
    // It may be running with apps open: the banner's own Stop asks first.
    await userEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: strings['desktop.stop'] }));
    expect(await screen.findByRole('alertdialog', { name: w('desktop.stop.title') })).toBeInTheDocument();
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('another 409 on the session end proves nothing: not reset, said so', async () => {
    await open('desktopEndConflict');
    await stop();
    await screen.findByText(w('desktop.reset'), undefined, { timeout: 8000 });
    expect(screen.queryByText(w('desktop.replaced'))).toBeNull();
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('a 404 without DISPLAY_NOT_FOUND proves nothing: not stopped, no session end', async () => {
    await open('desktopStopRoute404');
    await stop();
    await screen.findByText(w('desktop.failed'), undefined, { timeout: 8000 });
    await settle();
    expect(sends()).toEqual([STOP]);
  }, 60000);

  it('a 404 without SESSION_NOT_FOUND on the session end proves nothing: not reset', async () => {
    await open('desktopEndRoute404');
    await stop();
    await screen.findByText(w('desktop.reset'), undefined, { timeout: 8000 });
    expect(screen.queryByText(w('desktop.off'))).toBeNull();
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('a listed session whose shell has no id is not ended blindly: not reset, said so', async () => {
    await open('desktopNoShellId');
    await stop();
    await screen.findByText(w('desktop.reset'), undefined, { timeout: 8000 });
    await settle();
    expect(sends()).toEqual([STOP]);
  }, 60000);

  it('a session list that is not a list proves nothing: not reset, nothing ended', async () => {
    await open('desktopListOdd');
    await stop();
    await screen.findByText(w('desktop.reset'), undefined, { timeout: 8000 });
    await settle();
    expect(sends()).toEqual([STOP]);
  }, 60000);
});

describe('computers: Stop desktop, leaving and coming back', () => {
  const away = async () => {
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.ports'] }));
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.desktop'] }));
  };

  it('a stopped desktop stays stopped when the tab is left and shown again: no frame, nothing sent', async () => {
    await open();
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    await away();
    expect(await screen.findByText(w('desktop.off'))).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    await settle();
    expect(sends()).toEqual([STOP, END]);
  }, 60000);

  it('a lost answer stays unknown after leaving, and Stop again still releases it and sends', async () => {
    await open('desktopStopLost');
    await stop();
    await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 });
    await away();
    expect(await screen.findByText(w('desktop.unknown'))).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.stopAgain'] }));
    await waitFor(() => expect(sends()).toEqual([STOP, STOP]));
  }, 60000);

  it('after a reload (the tab’s memory gone), a stop still held by core reads unknown, never a new frame', async () => {
    await open('desktopStopLost');
    await stop();
    await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 });
    await act(async () => {
      resetDesktopSlotsForTests();
    });
    expect(await screen.findByText(w('desktop.unknown'))).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.stopAgain'] }));
    await waitFor(() => expect(sends()).toEqual([STOP, STOP]));
  }, 60000);

  it('after a reload, a stop held for desktop 1 leaves desktop 3 as it is (shown, not unknown)', async () => {
    await open('desktopStopLost');
    await stop();
    await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 });
    await act(async () => {
      resetDesktopSlotsForTests();
    });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['desktop.pick']) }, { timeout: 8000 }));
    await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Desktop 3' }));
    expect(await screen.findByTitle('atlas, desktop 3')).toBeInTheDocument();
    expect(screen.queryByText(w('desktop.unknown', 3))).toBeNull();
  }, 60000);

  it('after a reload, a recovered unknown stays when the hold is released elsewhere: no frame without a press here', async () => {
    await open('desktopStopLost');
    await stop();
    await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 });
    await act(async () => {
      resetDesktopSlotsForTests();
    });
    expect(await screen.findByText(w('desktop.unknown'))).toBeInTheDocument();
    // Another tab's Stop again releases the hold this tab recovered from.
    await act(async () => {
      C.resetChanges();
    });
    await settle();
    expect(screen.getByText(w('desktop.unknown'))).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    expect(sends()).toEqual([STOP]);
  }, 60000);

  it('after a reload, a Stop still out reads unknown, never a frame', async () => {
    await open('desktopStopSlow');
    await stop();
    await waitFor(() => expect(sends()).toEqual([STOP]), { timeout: 8000 });
    await act(async () => {
      resetDesktopSlotsForTests();
    });
    expect(await screen.findByText(w('desktop.unknown'))).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
  }, 60000);

  it('a stopped desktop that a later session list shows again reads "opened again", never framed by itself', async () => {
    await open();
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    // The program lists session 1601 again (opened elsewhere): a new session, another incarnation.
    desktopEnded.clear();
    desktopReads.inc['1601'] = INC2;
    await away();
    expect(await screen.findByText(w('desktop.reopened'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.show'] }));
    expect(await screen.findByTitle('atlas, desktop 1')).toBeInTheDocument();
  }, 60000);

  it('a lost answer stays "may not have stopped yet" after its hold is released elsewhere, never "stopped"', async () => {
    await open('desktopStopLost');
    await stop();
    await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 });
    await act(async () => {
      C.resetChanges();
    });
    await settle();
    expect(screen.getByText(w('desktop.unknown'))).toBeInTheDocument();
    expect(screen.getByText(strings['desktop.unknown.check'])).toBeInTheDocument();
    expect(screen.queryByText(w('desktop.off'))).toBeNull();
  }, 60000);

  for (const [state, what] of [
    ['desktopStopLostThenDenied', 'refused (403)'],
    ['desktopStopLostThenBusy', 'answered busy (409)'],
  ] as const) {
    it(`after a lost answer, a Stop again that is ${what} decided nothing: still "may not have stopped yet"`, async () => {
      await open(state);
      await stop();
      await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 });
      await userEvent.click(screen.getByRole('button', { name: strings['desktop.stopAgain'] }));
      await waitFor(() => expect(sends()).toEqual([STOP, STOP]), { timeout: 8000 });
      await settle();
      expect(screen.getByText(w('desktop.unknown'))).toBeInTheDocument();
      expect(screen.queryByText(w('desktop.failed'))).toBeNull();
      expect(screen.queryByText(w('desktop.busy'))).toBeNull();
      expect(screen.queryByRole('button', { name: strings['desktop.show'] })).toBeNull();
      expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    }, 60000);
  }

  it('a remembered shown desktop reads "may not have stopped yet" while another tab’s Stop is out, never a frame', async () => {
    await open('desktopStopSlow');
    await stop();
    await waitFor(() => expect(sends()).toEqual([STOP]), { timeout: 8000 });
    // A reload here (memory gone, the Stop still out as another tab's would be), and this tab remembers desktop 1 shown.
    await act(async () => {
      resetDesktopSlotsForTests();
      patchSlot(computerKey(atlas), 1, { phase: { k: 'live', gen: 7 }, gen: tick() });
    });
    await away();
    expect(await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['desktop.unknown.onWay'])).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
  }, 60000);

  it('Stop again while the first Stop is still out is refused (BUSY) and decides nothing, also after the first answers', async () => {
    await open('desktopStopSlowShort');
    await stop();
    await waitFor(() => expect(sends()).toEqual([STOP]), { timeout: 8000 });
    await act(async () => {
      resetDesktopSlotsForTests();
    });
    expect(await screen.findByText(strings['desktop.unknown.onWay'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.stopAgain'] }));
    // The first Stop answers elsewhere (its tab's memory is gone): this tab still cannot tell.
    await new Promise((r) => setTimeout(r, 5000));
    expect(screen.getByText(w('desktop.unknown'))).toBeInTheDocument();
    expect(screen.queryByText(w('desktop.failed'))).toBeNull();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    // The press sent nothing (the first Stop's own session end, sent where it was pressed, may follow).
    expect(sends().filter((x) => x.path === STOP.path)).toEqual([STOP]);
  }, 60000);

  it('a session list that left before the Stop and answers after it never reads "opened again"', async () => {
    desktopReads.delayNext = 2500; // the first list read (sent when the tab opens) answers late, listing 1601
    await open();
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 3000));
    expect(screen.getByText(w('desktop.off'))).toBeInTheDocument();
    expect(screen.queryByText(w('desktop.reopened'))).toBeNull();
  }, 60000);

  it('Check again reads the session now, never joining an earlier check still out (the session was ended meanwhile: stopped)', async () => {
    await open();
    await act(async () => {
      patchSlot(computerKey(atlas), 1, { phase: { k: 'unknown' }, gen: tick(), inc: INC });
    });
    expect(await screen.findByText(strings['desktop.unknown.check'], undefined, { timeout: 8000 })).toBeInTheDocument();
    await settle();
    desktopReads.delayNext = 15000; // the first Check again's read lists 1601 and answers late
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.checkAgain'] }));
    desktopEnded.add('/api/v1/terminal/1601'); // another tab's Stop ended the session meanwhile
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.checkAgain'] }));
    expect(await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(sends()).toEqual([]);
  }, 60000);

  it('a lost answer that lands while the tab is away, its hold then released elsewhere, still reads "may not have stopped yet"', async () => {
    await open('desktopStopLostSlow');
    await stop();
    await waitFor(() => expect(sends()).toEqual([STOP]), { timeout: 8000 });
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.ports'] }));
    await new Promise((r) => setTimeout(r, 4500));
    await act(async () => {
      C.resetChanges();
    });
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.desktop'] }));
    expect(await screen.findByText(w('desktop.unknown'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(w('desktop.off'))).toBeNull();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
  }, 60000);

  it('Check again with the session still listed reads "still open": Show or Stop desktop (asks), never a frame', async () => {
    await open();
    await act(async () => {
      patchSlot(computerKey(atlas), 1, { phase: { k: 'unknown' }, gen: tick(), inc: INC });
    });
    await userEvent.click(await screen.findByRole('button', { name: strings['desktop.checkAgain'] }, { timeout: 8000 }));
    expect(await screen.findByText(w('desktop.listed'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.stop'] }));
    expect(await screen.findByRole('alertdialog', { name: w('desktop.stop.title') })).toBeInTheDocument();
    expect(sends()).toEqual([]);
  }, 60000);

  it('a not-reset desktop whose session is opened again (another incarnation) reads "opened again", Stop asks first', async () => {
    await open('desktopEndFailed');
    await stop();
    await screen.findByText(w('desktop.reset'), undefined, { timeout: 8000 });
    // The same session still listed: still not reset.
    await away();
    await settle();
    expect(await screen.findByText(w('desktop.reset'))).toBeInTheDocument();
    desktopReads.inc['1601'] = INC2;
    await away();
    expect(await screen.findByText(w('desktop.reopened'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['desktop.stopAgain'] })).toBeNull();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.stop'] }));
    expect(await screen.findByRole('alertdialog', { name: w('desktop.stop.title') })).toBeInTheDocument();
  }, 60000);

  it('the computer seen not running ends every claim about its desktops', async () => {
    await open();
    await stop();
    await screen.findByText(w('desktop.off'), undefined, { timeout: 8000 });
    desktopReads.status[atlas.id] = 'stopped';
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await screen.findByText(strings['desktop.stopped'].replace('{{name}}', 'atlas'), undefined, { timeout: 8000 });
    expect(readSlot(computerKey(atlas), 1).phase).toBeUndefined();
  }, 60000);

  it('a Stop that answers after an account change writes nothing into the new account’s memory', async () => {
    await open('desktopStopSlowShort');
    await stop();
    await waitFor(() => expect(sends()).toEqual([STOP]), { timeout: 8000 });
    // The tab left (nothing on screen reads core for it), then the account changes while the Stop is out.
    await userEvent.click(screen.getByRole('tab', { name: strings['tab.ports'] }));
    await act(async () => {
      bump('account');
    });
    await new Promise((r) => setTimeout(r, 5000));
    expect(readSlot(computerKey(atlas), 1).phase).toBeUndefined();
  }, 60000);

  it('stopping desktop 3 keeps the switcher: desktop 1 can still be shown', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['desktop.pick']) }, { timeout: 8000 }));
    await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Desktop 3' }));
    await screen.findByTitle('atlas, desktop 3');
    await stop3();
    await screen.findByText(w('desktop.off', 3), undefined, { timeout: 8000 });
    await settle();
    expect(sends()).toEqual([{ method: 'POST', path: '/api/v1/system/displays/1603/stop' }, { method: 'DELETE', path: '/api/v1/terminal/1603' }]);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['desktop.pick']) }));
    const list = await screen.findByRole('listbox');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Desktop 1', 'Desktop 3']);
    await userEvent.click(within(list).getByRole('option', { name: 'Desktop 1' }));
    expect(await screen.findByTitle('atlas, desktop 1')).toBeInTheDocument();
    // Back to desktop 3: still offered, still stopped, Start reachable.
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['desktop.pick']) }));
    await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Desktop 3' }));
    expect(await screen.findByText(w('desktop.off', 3))).toBeInTheDocument();
    // Leaving the tab and coming back shows the same desktop, still stopped.
    await away();
    expect(await screen.findByText(w('desktop.off', 3))).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.start'] }));
    expect(await screen.findByTitle('atlas, desktop 3')).toBeInTheDocument();
  }, 60000);
});

const stop3 = async () => {
  await pressStop();
  const d = await screen.findByRole('alertdialog', { name: w('desktop.stop.title', 3) });
  await userEvent.click(within(d).getByRole('button', { name: strings['desktop.stop'] }));
};

describe('computers: Reload desktop', () => {
  it('remounts the frame (loading again) and sends nothing', async () => {
    const before = await open();
    const { fireEvent } = await import('@app/testing');
    fireEvent.load(before);
    await waitFor(() => expect(before.closest('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded'));
    await userEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: strings['desktop.reload'] }));
    const after = await screen.findByTitle('atlas, desktop 1');
    expect(after).not.toBe(before);
    expect(after.closest('[data-desktop]')).toHaveAttribute('data-desktop', 'loading');
    expect(after.getAttribute('src')).toBe(desktopUrl(atlas, 1));
    expect(desktopSends).toEqual([]);
  }, 60000);
});
