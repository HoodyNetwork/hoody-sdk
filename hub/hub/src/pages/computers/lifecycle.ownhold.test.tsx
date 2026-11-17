// C9: a held start, stop or restart can be dismissed only by the page that sent it. Core names the sender per
// page (computerLifecycle.forPage / use({page})): the Computers page and the Home widget (which Home mounts) each
// own their own sends; any other page's hold is read-only here (no Dismiss, no second press), with a link to the
// page that sent it.
import { chooseComputer, computerLifecycle, fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import strings from './strings.en.json';
import page from './page';

const host = { ...page, load: () => import('./widget') };
const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar')!;
const sentFrom = (p: string) => strings['held.elsewhere'].replace('{{page}}', p);
const sendFrom = (p: string) => act(async () => { await computerLifecycle.forPage(p).run({ id: cedar.id, op: 'start' }).catch(() => undefined); });
const noDismiss = () => expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();

describe("lifecycle holds: only the sender's page can dismiss them", () => {
  it("the detail shows Board's held Start read-only with a Board link, and its Start sends nothing", async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3' });
    await screen.findAllByRole('button', { name: strings['menu.start'] }, { timeout: 8000 });
    await sendFrom('board');
    expect(await screen.findByText(sentFrom(strings['held.from.board']), {}, { timeout: 8000 })).toBeInTheDocument();
    noDismiss();
    const start = screen.queryAllByRole('button', { name: strings['menu.start'] })[0];
    if (start) await userEvent.click(start);
    expect(screen.getByText(sentFrom(strings['held.from.board']))).toBeInTheDocument();
    expect(await computerLifecycle.forPage('board').heldByOther({ id: cedar.id, op: 'start' })).toBeUndefined();
    noDismiss();
  });

  it("the widget's own held Start offers Dismiss there, and Dismiss frees it", async () => {
    await renderPage(host, { state: 'pendingOps' });
    await act(async () => { chooseComputer(cedar); });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.start'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(async () => expect(await computerLifecycle.forPage('home').isPending({ id: cedar.id, op: 'start' })).toBe(false));
  });

  it("a held Start the Computers page sent shows read-only in the widget, naming Computers, and its Start sends nothing", async () => {
    await renderPage(host, { state: 'pendingOps' });
    await act(async () => { chooseComputer(cedar); });
    await screen.findByRole('button', { name: strings['menu.start'] }, { timeout: 8000 });
    await sendFrom('computers');
    expect(await screen.findByText(sentFrom(strings['held.from.computers']), {}, { timeout: 8000 })).toBeInTheDocument();
    noDismiss();
    await userEvent.click(screen.getByRole('button', { name: strings['menu.start'] }));
    // Still the Computers page's change: Home sent nothing of its own.
    expect(await computerLifecycle.forPage('home').heldByOther({ id: cedar.id, op: 'start' })).toBeTruthy();
    noDismiss();
  });
});
