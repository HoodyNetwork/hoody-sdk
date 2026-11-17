// C9 release safety, run through real core (no dismiss spy): the warned Dismiss frees only the
// hold the band showed (core's token for that one send). A send that went pending after the band was drawn, even
// one of the same page, stays held; and a band that turns into another page's read-only band takes its open
// question with it.
import { computerLifecycle, CoreQueryProvider, fixtureWorld, heldChanges } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderHook, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { dismissShownLifecycle, useLifecycleOps } from './parts/ops';
import type { Computer } from './types';
import strings from './strings.en.json';
import page from './page';

const host = { ...page, load: () => import('./widget') };
const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar')!;
const fjord = fixtureWorld.computers.find((c) => c.name === 'fjord')!;
const holdsOf = (id: string) => heldChanges('computer.lifecycle', { realm: 'all' }).filter((h) => (h.identity as { computer?: unknown } | null)?.computer === id);
/** The shown hold goes (its sender `owner` frees it: a proof, or that page's Dismiss in another tab) and `p` sends
 *  again: a new hold of that computer. */
const replaceWith = (owner: string, p: string, op: 'start' | 'restart') => act(async () => {
  await computerLifecycle.forPage(owner).dismiss({ id: cedar.id, op: 'start' }, holdsOf(cedar.id)[0]!.hold!);
  await computerLifecycle.forPage(p).run({ id: cedar.id, op }).catch(() => undefined);
});
const openDismiss = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
  return screen.findByRole('button', { name: strings['held.dismissGo'] });
};

describe('Dismiss frees only the hold the band showed', () => {
  it('Computers: a Dismiss pressed on a band drawn before a later send of the same page frees nothing; that send stays held', async () => {
    // The press uses the handler of the render that drew the band (as a click does), and the hold changes after it.
    await renderPage(page, { state: 'pendingOps', path: '/computers' });
    const { result } = renderHook(() => useLifecycleOps(async () => undefined), { wrapper: CoreQueryProvider });
    const c = { id: cedar.id } as Computer;
    await act(async () => { await result.current.run(c, 'start'); });
    const shown = result.current.ops[cedar.id]?.hold;
    const pressed = result.current.dismiss;
    await replaceWith('computers', 'computers', 'restart');
    const later = holdsOf(cedar.id)[0]?.hold;
    expect(later).toBeDefined();
    expect(later).not.toBe(shown);
    await act(async () => { await pressed(c); });
    expect(holdsOf(cedar.id).map((h) => h.hold)).toEqual([later]);
  });

  it('the widget path (dismissShownLifecycle, as Home): a stale token frees nothing, the shown one frees only itself', async () => {
    await renderPage(host, { state: 'pendingOps' });
    await act(async () => { await computerLifecycle.forPage('home').run({ id: cedar.id, op: 'start' }).catch(() => undefined); });
    const shown = holdsOf(cedar.id)[0]?.hold;
    await replaceWith('home', 'home', 'restart');
    const later = holdsOf(cedar.id)[0]?.hold;
    expect(await dismissShownLifecycle(cedar.id, shown, 'home')).toBe(false);
    expect(holdsOf(cedar.id).map((h) => h.hold)).toEqual([later]);
    expect(await dismissShownLifecycle(cedar.id, later, 'computers')).toBe(false); // another page's (Home's) hold
    expect(await dismissShownLifecycle(cedar.id, later, 'home')).toBe(true);
    expect(holdsOf(cedar.id)).toHaveLength(0);
  });

  it("an open Dismiss question closes when the band becomes another page's (Board's later send)", async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['menu.start'] }, { timeout: 8000 }))[0]!);
    await openDismiss();
    await replaceWith('computers', 'board', 'restart');
    expect(holdsOf(cedar.id)[0]?.by).toBeDefined();
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['held.dismissGo'] })).toBeNull());
    expect(holdsOf(cedar.id)).toHaveLength(1);
  });

  it("All realms: Dismiss of the computer's own hold frees it and leaves another page's hold on another computer", async () => {
    await renderPage(page, { state: 'pendingOps', realm: 'all', path: '/computers?sel=cedar.00c3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['menu.start'] }, { timeout: 8000 }))[0]!);
    await act(async () => { await computerLifecycle.forPage('board').run({ id: fjord.id, op: 'resume' }).catch(() => undefined); });
    const foreign = holdsOf(fjord.id)[0]?.hold;
    expect(foreign).toBeDefined();
    await userEvent.click(await openDismiss());
    await waitFor(() => expect(holdsOf(cedar.id)).toHaveLength(0));
    expect(holdsOf(fjord.id).map((h) => h.hold)).toEqual([foreign]);
  });
});

describe("Dismiss answers core's outcome", () => {
  it('a hold freed between the page check and core answers false, and the press that freed it answers true', async () => {
    await renderPage(host, { state: 'pendingOps' });
    await act(async () => { await computerLifecycle.forPage('home').run({ id: cedar.id, op: 'start' }).catch(() => undefined); });
    const shown = holdsOf(cedar.id)[0]!.hold!;
    let first = false;
    let late = true;
    await act(async () => {
      // The other press starts first, so core frees the send for it; the page check of the second still sees the hold.
      const other = computerLifecycle.forPage('home').dismiss({ id: cedar.id, op: 'start' }, shown);
      const mine = dismissShownLifecycle(cedar.id, shown, 'home');
      [first, late] = await Promise.all([other, mine]);
    });
    expect(first).toBe(true);
    expect(late).toBe(false);
    expect(holdsOf(cedar.id)).toHaveLength(0);
  });
});
