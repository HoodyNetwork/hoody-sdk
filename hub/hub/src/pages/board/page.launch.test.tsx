// Vitest: Board > Add a program > a computer's Apps (the launcher sits in the
// computer's own step, under its Hoody Kit, with no "Launch an app" row and no chooser), the Board's half: where the
// Apps show, what stands in for them on a computer that is not running, and how the step is left. The launcher's own
// rules (one send, placed only once answered, the "may still be starting" tile) are tested with the launcher, in
// pages/apps/launch.test.tsx.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore, chooseNoComputer, computerLifecycle, fixtureWorld, heldChanges, lifecycleLock, CoreQueryProvider } from '@core';
import { render } from '@testing-library/react';
import type { BoardComputer } from './computers';
import { Picker } from './parts/Picker';
import type * as AppsLinks from '../apps/links';
import { loadLauncher } from '../apps/links';
import { resetBoardsForTests } from './data';
import page from './page';
import { findTile, kindsRail, tile, toKind } from './parts/browse.testkit';
import boardStrings from './strings.en.json';
// The worded Add a program (the empty slot's, or the strip's): the chips row's + carries the same name.
const addWords = async () => (await screen.findAllByRole('button', { name: /Add a program/ })).find((b) => b.textContent?.includes('Add a program'))!;

// The launcher chunk, made to never arrive when a test says so: a tile with no launch at its place must not wait on it.
const L = vi.hoisted(() => ({ hang: false, phone: false }));
// A phone is the kit's media question; tests answer it.
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useIsPhone: () => L.phone }));
vi.mock('../apps/links', async (orig) => {
  const real = await orig<typeof AppsLinks>();
  return { ...real, loadLauncher: () => (L.hang ? new Promise<never>(() => {}) : real.loadLauncher()) };
});

// The Board view and the launcher are lazy chunks: a first import is transformed cold, which takes tens of seconds on a
// loaded host. Load both once before the tests (the launcher through its loader, L.hang still false) so each first
// find timeout measures the page, not the transform.
beforeAll(async () => { await page.load(); await loadLauncher(); }, 180_000);

beforeEach(() => {
  L.hang = false;
  L.phone = false;
  resetBoardsForTests();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});

const row = (name: string) => fixtureWorld.computers.find((c) => c.name === name)!;
/** The frame's one search field on a running computer, and the launcher's own (never drawn in the frame). */
// The frame's one search, named for what it takes.
const SEARCH = (boardStrings as Record<string, string>)['picker.searchPrograms']!;
const OWN_SEARCH = 'Search apps, programs and coding agents';
const apps = () => screen.getByRole('group', { name: 'Apps' });
/** The computer's Apps kind in the frame's rail (the launcher is shown under it). */
const toApps = () => toKind('Apps');
/** The launcher is drawn (its Install from GitHub tile, under the Apps kind with no words typed): opens the Apps kind. */
const launcher = async () => { toApps(); return within(apps()).findByRole('row', { name: /^Install from GitHub/ }, { timeout: 4000 }); };
/** The computer's own Hoody Kit card (its grid of tiles), under the Programs kind. */
const kit = () => screen.getByRole('grid', { name: 'Hoody Kit' });

async function toPrograms(computer: RegExp, o: { state?: string } = {}) {
  const user = userEvent.setup();
  await renderPage(page, o.state ? { state: o.state } : {});
  await user.click(await addWords());
  await user.click(await screen.findByRole('row', { name: computer }));
  await findTile(/Terminal/);
  return user;
}

describe("Board: a computer's Apps in Add a program", () => {
  it('the first screen has no Launch an app row; a running computer shows its Hoody Kit and the launcher in one frame', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await addWords());
    await screen.findByRole('row', { name: /^atlas/ });
    expect(screen.queryByRole('row', { name: /^Launch an app/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Other apps' })).toBeNull();
    await user.click(screen.getByRole('row', { name: /^atlas/ }));
    expect(within(await screen.findByRole('grid', { name: 'Hoody Kit' })).getAllByRole('row').length).toBeGreaterThan(3);
    // The launcher is in the same frame, under the Apps kind of the rail.
    const frame = kindsRail()!.parentElement!.parentElement!;
    expect(await launcher()).toBeInTheDocument();
    expect(frame).toContainElement(apps());
    expect(screen.queryByRole('row', { name: /^Launch an app/ })).toBeNull();
    // One search field for the whole frame: the launcher draws none of its own, and no second dialog opens.
    expect(screen.getByRole('searchbox', { name: SEARCH })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: OWN_SEARCH })).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Back to All computers' }));
    expect(await screen.findByRole('row', { name: /^atlas/ })).toBeInTheDocument();
  });

  it('typing in the search keeps its keys: Backspace edits the words, and steps back only once they are gone', async () => {
    const user = await toPrograms(/atlas/);
    await launcher();
    const search = screen.getByRole('searchbox', { name: SEARCH });
    await user.type(search, 'te{Backspace}{Backspace}');
    expect(screen.getByRole('searchbox', { name: SEARCH })).toHaveValue('');
    // The words gone, the frame opens Programs again: the Kit is there.
    expect(kit()).toBeInTheDocument();
    await user.keyboard('{Backspace}');
    expect(await screen.findByRole('row', { name: /^atlas/ })).toBeInTheDocument();
  });

  it('the words keep the Kit rows that have them and go to the launcher', async () => {
    const user = await toPrograms(/atlas/);
    await launcher();
    await user.type(screen.getByRole('searchbox', { name: SEARCH }), 'termi');
    // The words open Results: the Kit card keeps Terminal only.
    expect(within(kit()).getAllByRole('row').map((o) => o.getAttribute('aria-label') ?? o.textContent)).toEqual([expect.stringMatching(/^Terminal/)]);
    // The launcher is still there in Results, searching the same words (its Install from GitHub tile is for no words;
    // its own states are the launcher's tests').
    expect(apps()).toBeVisible();
    expect(within(apps()).queryByRole('row', { name: /^Install from GitHub/ })).toBeNull();
  });

  it('keys in the launcher are its own: Enter on its tiles never picks a Kit row', async () => {
    const user = await toPrograms(/atlas/);
    const github = await launcher();
    github.focus();
    await user.keyboard('{Enter}');
    // Still on the computer's step (Enter on the first Kit row, Agent, would have left it for its sessions).
    expect(kindsRail()).not.toBeNull();
    expect(screen.queryByRole('row', { name: /^New session/ })).toBeNull();
    toKind('Programs');
    expect(kit()).toBeInTheDocument();
  });

  it('a terminal tile with no launch at its place frames at once, without the launcher chunk', async () => {
    L.hang = true;
    const user = await toPrograms(/atlas/);
    await user.click(tile(/^Terminal/));
    await user.click(await screen.findByRole('row', { name: /^terminal-1/ }));
    expect((await screen.findByTitle('terminal-1 on atlas')).tagName).toBe('IFRAME');
  });

  it('a stopped computer keeps its Kit; its Apps say Start it to launch apps, with the Start the Board\'s tiles use', async () => {
    const user = await toPrograms(/cedar/);
    expect(kit()).toBeInTheDocument();
    toApps();
    expect(within(apps()).getByRole('heading', { name: 'cedar is stopped' })).toBeInTheDocument();
    expect(within(apps()).getByText('Start it to launch apps.')).toBeInTheDocument();
    expect(within(apps()).queryByRole('radio', { name: 'From GitHub' })).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search programs' })).toBeInTheDocument();
    await user.click(within(apps()).getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'Starting cedar…' })).toBeInTheDocument();
  });

  it('a Start whose answer was lost shows the tiles\' card naming the computer: Check again, and Dismiss behind a warning', async () => {
    const user = await toPrograms(/cedar/, { state: 'powerUnknown' });
    toApps();
    await user.click(await within(apps()).findByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'Start may have gone through' })).toBeInTheDocument();
    expect(screen.getByText(/We couldn't confirm whether cedar got the request/)).toBeInTheDocument();
    // The card's Dismiss (the popover has a hidden one of its own for screen readers).
    await user.click(screen.getAllByRole('button', { name: 'Stop tracking' }).find((b) => b.textContent === 'Stop tracking')!);
    const warn = await screen.findByRole('alertdialog', { name: 'Stop tracking this?' });
    await user.click(within(warn).getByRole('button', { name: 'Stop tracking' }));
    expect(await screen.findByRole('heading', { name: 'cedar is stopped' })).toBeInTheDocument();
    expect(within(apps()).getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('a paused computer offers Resume the same way', async () => {
    await toPrograms(/fjord/);
    toApps();
    expect(within(apps()).getByRole('heading', { name: 'fjord is paused' })).toBeInTheDocument();
    expect(within(apps()).getByText('Resume it to launch apps.')).toBeInTheDocument();
    expect(within(apps()).getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('a picker for one program (the program view\'s Pick another program) has no Apps', async () => {
    bootFixtureCore({ rules: [] });
    const user = userEvent.setup();
    render(<CoreQueryProvider><Picker computers={[row('atlas') as BoardComputer]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} programsOnly /></CoreQueryProvider>);
    // A picker for one program is not the framed Add a program: its steps stay a list of options.
    await user.click(await screen.findByRole('option', { name: /^atlas/ }));
    expect(await screen.findByRole('option', { name: /^Terminal/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Apps', hidden: true })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('a running computer with a held change shows the held card, not the launcher, and an open launcher gives way to it', async () => {
    await toPrograms(/atlas/, { state: 'powerUnknown' });
    expect(await launcher()).toBeInTheDocument();
    // Another page's Stop whose answer was lost: atlas still reads as running.
    await act(async () => { await computerLifecycle.run({ id: row('atlas').id, op: 'stop' }); });
    expect(await within(apps()).findByRole('heading', { name: 'Stop may have gone through' })).toBeInTheDocument();
    expect(within(apps()).queryByRole('radio', { name: 'From GitHub' })).toBeNull();
    // The computer's own rows stay.
    toKind('Programs');
    expect(kit()).toBeInTheDocument();
  });

  it('a running computer\'s own Restart whose answer was lost shows the held card, not the launcher', async () => {
    await toPrograms(/atlas/, { state: 'powerUnknown' });
    expect(await launcher()).toBeInTheDocument();
    await act(async () => { await computerLifecycle.run({ id: row('atlas').id, op: 'restart' }); });
    expect(await within(apps()).findByRole('heading', { name: 'Restart may have gone through' })).toBeInTheDocument();
    expect(within(apps()).queryByRole('radio', { name: 'From GitHub' })).toBeNull();
  });

  it('when the hold clears, the launcher comes back on the running computer', async () => {
    await toPrograms(/atlas/, { state: 'powerUnknown' });
    expect(await launcher()).toBeInTheDocument();
    await act(async () => { await computerLifecycle.run({ id: row('atlas').id, op: 'stop' }); });
    expect(await screen.findByRole('heading', { name: 'Stop may have gone through' })).toBeInTheDocument();
    const hold = heldChanges(lifecycleLock.lock)[0]?.hold;
    expect(hold).toBeTruthy();
    let freed: boolean | undefined;
    await act(async () => { freed = await computerLifecycle.dismiss({ id: row('atlas').id, op: 'stop' }, hold as string); });
    expect(freed).toBe(true);
    expect(await launcher()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Stop may have gone through' })).toBeNull();
  });

  it('while the computers are still being read, the first screen shows its loading skeleton and none of its notices', async () => {
    bootFixtureCore({ rules: [] });
    await act(async () => { chooseNoComputer(); });
    render(<CoreQueryProvider><Picker computers={null} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} /></CoreQueryProvider>);
    // The skeleton shows after 150 ms (fast answers never flash one); no computer row and no notice stand in for it.
    await waitFor(() => expect(document.querySelector('[data-skeleton]')).not.toBeNull());
    expect(screen.queryByRole('row', { name: /^atlas/ })).toBeNull();
    expect(screen.queryByText('The computers could not be read.')).toBeNull();
    expect(screen.queryByText('No computers in Personal')).toBeNull();
  });

  it('on a phone the frame works in the picker\'s sheet', async () => {
    L.phone = true;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 390);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 700);
    await toPrograms(/atlas/);
    expect(await launcher()).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
