// This page's held changes are core's, named by their hold token: a proof or a
// Dismiss frees only the send the row showed, never a later send of the same change (another tab's); a held change
// of this page shows after a realm switch or a reload, with Check again and the warned Dismiss; a stale row of
// this page never masks a change another page holds now; and a hidden sending page gets no link.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, defineMutation, heldChanges, programLock, programOp, type Target } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { setRealm } from '@core/ctx';
import type * as Kit from '@kit';
import kitStrings from '@kit/strings.en.json';
import * as data from './data';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

const gate = vi.hoisted(() => ({ on: false, open: () => undefined as void, wait: Promise.resolve() }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof data>();
  return {
    ...real,
    dismissPress: vi.fn(real.dismissPress),
    readOverview: async (t: Target) => {
      if (gate.on) await gate.wait;
      return real.readOverview(t);
    },
  };
});
const hidden = vi.hoisted(() => ({ computers: false }));
// A load that hides Computers: the shell serves no Computers page, so the shared HeldFromLink renders nothing
// there (the shell's own tests prove it; usePageLink would still give the classic Hub).
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return {
    ...real,
    HeldFromLink: (p: Kit.HeldFromLinkProps) => (p.page === 'computers' && hidden.computers ? null : real.HeldFromLink(p)),
  };
});

function webOp() {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|prog:1')) return op;
  return undefined;
}
const inspector = () => screen.findByRole('region', { name: kitStrings['listDetail.detail'] });

async function pressPending(state: string, name: string) {
  await renderPage(page, { state, path: '/programs?sel=prog%3A1' });
  await userEvent.click((await screen.findAllByRole('button', { name }))[0] as HTMLElement);
  await waitFor(() => expect(webOp()?.status).toBe('unknown'));
  const press = webOp()?.press;
  if (!press) throw new Error('no press');
  return press;
}

type V = { id: string; port: number | null; target: Target };
const NOTE = strings['op.elsewhere'].replace('{{name}}', 'web').replaceAll('{{page}}', strings['page.computers']);
const OPEN = strings['op.openSender'].replace('{{page}}', strings['page.computers']);
function computersRestart() {
  const restartOf = (v: V) => programOp({ id: v.id, act: 'restart', port: v.port, range: false });
  return defineMutation<V>(data.routes.restart, {
    input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: restartOf(v).body }),
    lock: programLock.restart,
    lockKey: (v) => restartOf(v).identity,
    page: 'computers',
  });
}

function computersStop() {
  const stopOf = (v: V) => programOp({ id: v.id, act: 'stop', port: v.port, range: false });
  return defineMutation<V>(data.routes.stop, {
    input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: stopOf(v).body }),
    lock: programLock.stop,
    lockKey: (v) => stopOf(v).identity,
    page: 'computers',
  });
}

describe('programs: held changes by their hold token', () => {
  beforeEach(() => {
    opsStore.reset();
    gate.on = false;
    hidden.computers = false;
    vi.mocked(data.dismissPress).mockClear();
  });
  afterEach(() => {
    gate.on = false;
    gate.open();
  });

  it('a Check still reading when another tab dismissed the stop and sent it again frees nothing of the new send', async () => {
    const press = await pressPending('press-proved', 'Stop web');
    const first = heldChanges(programLock.stop)[0]?.hold;
    expect(first).toBeTruthy();
    gate.on = true;
    gate.wait = new Promise<void>((r) => { gate.open = r; });
    await userEvent.click(await within(await inspector()).findByRole('button', { name: /Check again/ }));
    // Meanwhile, in another tab: the person dismissed that stop and pressed Stop again (the same change, sent
    // again under its kept key: a new send of it, held by core with a new token).
    await act(async () => {
      await data.dismissPress(press, first);
      expect((await data.usePress()(press)).outcome).toBe('pending');
    });
    const second = heldChanges(programLock.stop)[0]?.hold;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    // This tab's Check now reads a list showing web stopped: its proof is about the first send only.
    await act(async () => { gate.open(); await new Promise((r) => setTimeout(r, 50)); });
    await waitFor(() => expect(heldChanges(programLock.stop).map((h) => h.hold)).toEqual([second]));
  });

  it('a Check still reading when its send was proved elsewhere and Computers then sent the stop shows Computers\' hold at once, and its late answer keeps it', async () => {
    const press = await pressPending('press-proved', 'Stop web');
    const first = heldChanges(programLock.stop)[0]?.hold;
    gate.on = true;
    gate.wait = new Promise<void>((r) => { gate.open = r; });
    await userEvent.click(await within(await inspector()).findByRole('button', { name: /Check again/ }));
    // Meanwhile: another tab proved this page's stop, and Computers sent the stop of web (a hold of its own).
    await act(async () => {
      await data.completePress(press, first);
      const target = capture().target as Target;
      expect((await computersStop().run({ id: '1', port: null, target })).outcome).toBe('pending');
    });
    // While this tab's Check still reads: Computers' hold, read-only with its link, never this page's controls.
    const det = await inspector();
    await within(det).findByText(NOTE);
    expect(within(det).getByRole('link', { name: OPEN })).toBeTruthy();
    expect(within(det).queryByRole('button', { name: /^(?:close|stop tracking…|hide this note)$/i })).toBeNull();
    // The old Check's answer (a list showing web stopped) changes nothing of it.
    await act(async () => { gate.open(); await new Promise((r) => setTimeout(r, 50)); });
    await within(det).findByText(NOTE);
    expect(heldChanges(programLock.stop)).toHaveLength(1);
    expect(webOp()).toBeUndefined();
  });

  it("this page's held change shows after a realm switch, with Check again and the warned Dismiss that frees it", async () => {
    await pressPending('press-pending', 'Restart web');
    act(() => setRealm('0123456789abcdef01234567'));
    const det = await inspector();
    await within(det).findByRole('button', { name: /Check again/ });
    await userEvent.click(within(det).getByRole('button', { name: 'Stop tracking' }));
    const ask = await screen.findByRole('alertdialog', { name: strings['op.dismissTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['op.dismissGo'] }));
    await waitFor(() => expect(heldChanges(programLock.restart)).toHaveLength(0));
  });

  it("this page's held change shows again after a reload (nothing of the page's own memory left)", async () => {
    await pressPending('press-pending', 'Restart web');
    act(() => opsStore.reset());
    await within(await inspector()).findByRole('button', { name: /Check again/ });
    expect(heldChanges(programLock.restart)).toHaveLength(1);
  });

  it("a row of this page's whose send was proved elsewhere never hides a change Computers holds now", async () => {
    const press = await pressPending('press-pending', 'Restart web');
    const first = heldChanges(programLock.restart)[0]?.hold;
    await act(async () => { await data.completePress(press, first); });
    const target = capture().target as Target;
    await act(async () => { expect((await computersRestart().run({ id: '1', port: null, target })).outcome).toBe('pending'); });
    await within(await inspector()).findByText(NOTE);
    expect(screen.queryAllByRole('button', { name: /Check again/ })).toHaveLength(0);
  });

  it('a hidden sending page: the note names it, with no link (never the classic page)', async () => {
    hidden.computers = true;
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await screen.findAllByRole('button', { name: 'Restart web' });
    const target = capture().target as Target;
    await act(async () => { expect((await computersRestart().run({ id: '1', port: null, target })).outcome).toBe('pending'); });
    const det = await inspector();
    await within(det).findByText(NOTE);
    expect(within(det).queryByRole('link', { name: OPEN })).toBeNull();
    expect(within(det).queryByRole('button', { name: OPEN })).toBeNull();
  });
  // A Dismiss names the send its control showed, never what the page's store holds when it
  // is pressed: a newer send that lands while the warning is open, or while an old failure banner still shows, is
  // never freed by it. The store moves and the person confirms in one turn, before the page draws again (the
  // control still on screen is the old one).
  const webKey = () => [...opsStore.snapshot()].find(([k]) => k.endsWith('|prog:1'))?.[0] ?? '';

  it('a newer send of the program that lands while the Dismiss warning is open is never freed by it', async () => {
    const press = await pressPending('press-pending', 'Restart web');
    const first = heldChanges(programLock.restart)[0]?.hold;
    expect(first).toBeTruthy();
    await userEvent.click(within(await inspector()).getByRole('button', { name: 'Stop tracking' }));
    const ask = await screen.findByRole('alertdialog', { name: strings['op.dismissTitle'] });
    const go = within(ask).getByRole('button', { name: strings['op.dismissGo'] });
    // Another tab of this page sent a stop of web: core holds it for this page, with its own token.
    const stop = { ...press, action: 'stop' as const };
    await act(async () => {
      expect((await data.usePress()(stop)).outcome).toBe('pending');
    });
    const newer = heldChanges(programLock.stop)[0]?.hold;
    expect(newer).toBeTruthy();
    act(() => {
      const k = webKey();
      const cur = opsStore.get(k);
      if (cur && newer) opsStore.set(k, { ...cur, act: 'stop', press: stop, hold: newer });
      go.click();
    });
    await waitFor(() => expect(data.dismissPress).toHaveBeenCalledTimes(1));
    // The warning's restart, exactly: the newer stop stays held, and its row stays.
    expect(vi.mocked(data.dismissPress).mock.calls[0]?.[1]).toBe(first);
    await waitFor(() => expect(heldChanges(programLock.restart)).toHaveLength(0));
    expect(heldChanges(programLock.stop).map((h) => h.hold)).toEqual([newer]);
    expect(webOp()?.hold).toBe(newer);
  });

  it('a Dismiss that core answers freed nothing keeps the row and says it moved', async () => {
    await pressPending('press-pending', 'Restart web');
    vi.mocked(data.dismissPress).mockResolvedValueOnce(false);
    await userEvent.click(within(await inspector()).getByRole('button', { name: 'Stop tracking' }));
    const ask = await screen.findByRole('alertdialog', { name: strings['op.dismissTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['op.dismissGo'] }));
    await within(await inspector()).findByText(strings['op.moved'], { exact: false });
    expect(webOp()?.status).toBe('unknown');
    expect(heldChanges(programLock.restart)).toHaveLength(1);
  });

  it("an old failure banner's Dismiss closes only that outcome: it never frees a send that landed since", async () => {
    await renderPage(page, { state: 'receipt-failed', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    await userEvent.click(await within(await inspector()).findByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(webOp()?.status).toBe('failed'));
    const close = within(await inspector()).getByRole('button', { name: 'Hide this note' });
    act(() => {
      // A new press of web lands in the store before the banner draws again.
      const k = webKey();
      const cur = opsStore.get(k);
      if (cur) opsStore.set(k, { ...cur, status: 'unknown', hold: 'a-newer-send' });
      close.click();
    });
    await new Promise((r) => setTimeout(r, 50));
    // Core is never asked to free anything (the newer send's own row then follows core, as every row does).
    expect(data.dismissPress).not.toHaveBeenCalled();
  });
});
