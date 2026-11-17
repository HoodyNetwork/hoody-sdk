// Vitest: Add a program's first screen lists Recent, then the
// computers, with nothing below them and no "Launch an app" row; the chosen computer's step is one frame: the way here
// and the search in its head, the kinds in a rail (Programs, Ports & scripts, Bots, Addresses, Apps, Recent) and the
// open kind's groups as section cards of tiles beside it. Web address and Connect over SSH (whose forms go back there)
// are under Addresses; the launcher is in place under Apps. With no computer to choose, Web address stays on the first
// screen.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleOf, type BoardComputer } from '../computers';
import type { TileRef } from '../model/boards';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';
import { cardTitles, findTile, kindNames, kindsRail, tile, tileNames, toKind } from './browse.testkit';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const ref = (session: number): TileRef => ({ project: 'p1', computer: 'c1', program: 'terminal', session });
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c1', 'atlas'), pc('c2', 'borealis')]} failed={false} onRetry={() => {}} recents={[ref(1)]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('Add a program, first screen', () => {
  it('lists Recent, then the computers, with no Launch an app row and no Web address or SSH below them', () => {
    render(picker({}));
    // Two section cards of tiles: Recent (counted), then the computers (counted); no list of options.
    expect(cardTitles()).toEqual([S['browse.count']!.replace('{{title}}', S['picker.recent']!).replace('{{count}}', '1'), S['picker.computersCount']!.replace('{{count}}', '2')]);
    expect(screen.queryByRole('listbox')).toBeNull();
    // The crumbs name this step only: nothing ahead of it.
    expect(screen.getByRole('navigation', { name: S['picker.title'] })).toHaveTextContent(new RegExp('^' + S['picker.computer'] + '$'));
    const names = tileNames();
    expect(names.some((n) => n.startsWith(S['picker.web']!) || n.startsWith(S['picker.ssh']!))).toBe(false);
    expect(names[names.length - 1]).toContain('borealis');
  });

  it('with no computer to choose, Web address stays on the first screen', () => {
    render(picker({ computers: [], recents: [] }));
    expect(tile(new RegExp('^' + S['picker.web']))).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: new RegExp('^' + S['picker.app']) })).toBeNull();
  });
});

describe('Add a program, the chosen computer', () => {
  it('a running computer shows one kind at a time: Programs first (Hoody Kit, More), Web address and Connect over SSH under Addresses, its Apps in place', async () => {
    render(picker({ recents: [], roomy: true }));
    await userEvent.setup().click(screen.getByRole('row', { name: /atlas/ }));
    // Recent (the launcher's own recents) is a kind only once the launcher counts some; it never loads here. Apps and
    // From GitHub stand right after Programs.
    expect(kindNames()).toEqual([S['browse.tab.programs'], S['browse.tab.apps'], S['browse.tab.github'], S['browse.tab.addresses']]);
    // Programs is open: one section card per group, each counted, its rows as tiles. No list of rows is left.
    const cards = cardTitles();
    expect(cards[0]).toMatch(new RegExp('^' + S['picker.kit'] + ' · \\d+$'));
    expect(cards[1]).toMatch(new RegExp('^' + S['picker.more'] + ' · \\d+$'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(tileNames()[0]).toMatch(new RegExp('^' + S['program.agent']));
    expect(screen.queryByRole('row', { name: /^Launch an app/ })).toBeNull();
    expect(screen.getByRole('searchbox', { name: S['picker.searchPrograms'] })).toBeInTheDocument();
    // The way here and the search sit in the frame's head, over the kinds: one frame.
    const frame = kindsRail()!.parentElement!.parentElement!;
    expect(frame).toContainElement(screen.getByRole('navigation', { name: S['picker.title'] }));
    expect(frame).toContainElement(screen.getByRole('searchbox'));
    toKind(S['browse.tab.addresses']!);
    expect(cardTitles()).toEqual([S['picker.external'] + ' · 2']);
    expect(tileNames()).toEqual([expect.stringMatching(new RegExp('^' + S['picker.web'])), expect.stringMatching(new RegExp('^' + S['picker.ssh']))]);
    // The launcher is in the same frame, shown under its own kind.
    const apps = screen.getByRole('group', { name: S['picker.apps'], hidden: true });
    expect(frame).toContainElement(apps);
    expect(apps.parentElement).not.toBeVisible();
    toKind(S['browse.tab.apps']!);
    expect(apps.parentElement).toBeVisible();
  });

  it('a stopped computer offers Web address but no SSH, and its Apps say to start it', async () => {
    render(picker({ computers: [pc('c1', 'atlas', 'stopped')], recents: [] }));
    await userEvent.setup().click(screen.getByRole('row', { name: /atlas/ }));
    toKind(S['browse.tab.addresses']!);
    expect(tileNames()).toEqual([expect.stringMatching(new RegExp('^' + S['picker.web']))]);
    toKind(S['browse.tab.apps']!);
    expect(within(screen.getByRole('group', { name: S['picker.apps'] })).getByText(S['picker.appStart']!)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: S['picker.searchProgramsOnly'] })).toBeInTheDocument();
  });

  it('the one search field keeps the tiles that have the words, from every kind, and says when nothing has them', async () => {
    const user = userEvent.setup();
    render(picker({ computers: [pc('c1', 'atlas', 'stopped')], recents: [], roomy: true }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    const search = screen.getByRole('searchbox', { name: S['picker.searchProgramsOnly'] });
    await user.type(search, 'web');
    // Results opens: Browser ("A web browser ...") from Programs, Web address from Addresses, each kind counted.
    expect(kindNames()[0]).toBe(S['browse.tabCount']!.replace('{{label}}', S['browse.tab.all']!).replace('{{count}}', '2'));
    expect(tileNames()).toEqual([expect.stringMatching(new RegExp('^' + S['program.browser'])), expect.stringMatching(new RegExp('^' + S['picker.web']))]);
    await user.clear(search);
    await user.type(search, 'zzzz');
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.getByText(S['browse.none']!.replace('{{q}}', 'zzzz'))).toBeInTheDocument();
    // Cleared: back on Programs.
    await user.clear(search);
    expect(kindNames()[0]).toBe(S['browse.tab.programs']);
    expect(tileNames()[0]).toMatch(new RegExp('^' + S['program.agent']));
  });

  it('entering the step puts the focus on the first tile; Enter on a tile picks it', async () => {
    const user = userEvent.setup();
    render(picker({ recents: [] }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    const first = screen.getAllByRole('row')[0]!;
    await waitFor(() => expect(first).toHaveFocus());
    expect(first).toHaveAccessibleName(new RegExp('^' + S['program.agent']));
    tile(new RegExp('^' + S['program.terminal'])).focus();
    await user.keyboard('{Enter}');
    // Terminal's sessions: the next step.
    expect(await screen.findByRole('row', { name: /^New session/ })).toBeInTheDocument();
  });

  it('typing with the focus on a tile or on the rail searches: the character lands in the search field', async () => {
    const user = userEvent.setup();
    render(picker({ recents: [], roomy: true }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await waitFor(() => expect(screen.getAllByRole('row')[0]).toHaveFocus());
    await user.keyboard('web');
    const search = screen.getByRole('searchbox');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('web');
    // Arrow Down from the field goes to the first tile found.
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('row')[0]).toHaveFocus();
    await user.clear(search);
    within(kindsRail()!).getAllByRole('button')[1]!.focus();
    await user.keyboard('s');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('s');
  });

  it('Enter in the search field picks the first tile found', async () => {
    const user = userEvent.setup();
    render(picker({ computers: [pc('c1', 'atlas', 'stopped')], recents: [] }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    const search = screen.getByRole('searchbox', { name: S['picker.searchProgramsOnly'] });
    await user.type(search, 'address');
    expect(tileNames()).toEqual([expect.stringMatching(new RegExp('^' + S['picker.web']))]);
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('textbox', { name: 'Address' })).toBeInTheDocument();
  });

  it('Web address from a computer shows that computer in the crumbs, and Back returns to its step', async () => {
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /borealis/ }));
    await user.click(tile(new RegExp('^' + S['picker.web'])));
    expect(await screen.findByRole('textbox', { name: 'Address' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: S['picker.title'] });
    expect(within(crumbs).getByRole('button', { name: new RegExp('borealis') })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await findTile(new RegExp('^' + S['program.terminal']))).toBeInTheDocument();
  });

  it('Connect over SSH from a computer has that computer chosen, and Back returns to its step', async () => {
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /borealis/ }));
    await user.click(tile(new RegExp('^' + S['picker.ssh'])));
    expect(await screen.findByRole('button', { name: new RegExp(S['ssh.from']!) })).toHaveTextContent('borealis');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await findTile(new RegExp('^' + S['program.terminal']))).toBeInTheDocument();
  });

  it('after a Connect over SSH link, going back and choosing another computer runs SSH from that one, without the link\'s values', async () => {
    const user = userEvent.setup();
    const atlas = pc('c1', 'atlas');
    render(picker({ start: { step: 'ssh', ssh: { computer: handleOf(atlas), host: 'db.example.com', user: 'ops' } } }));
    expect(screen.getByRole('textbox', { name: S['ssh.host'] })).toHaveValue('db.example.com');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('row', { name: /borealis/ }));
    await user.click(tile(new RegExp('^' + S['picker.ssh'])));
    expect(await screen.findByRole('button', { name: new RegExp(S['ssh.from']!) })).toHaveTextContent('borealis');
    expect(screen.getByRole('textbox', { name: S['ssh.host'] })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: S['ssh.user'] })).toHaveValue('');
  });

  it('if the chosen computer leaves the list while its SSH form is open, no other computer is chosen', async () => {
    const user = userEvent.setup();
    const { rerender } = render(picker({ recents: [] }));
    await user.click(screen.getByRole('row', { name: /borealis/ }));
    await user.click(tile(new RegExp('^' + S['picker.ssh'])));
    const from = await screen.findByRole('button', { name: new RegExp(S['ssh.from']!) });
    expect(from).toHaveTextContent('borealis');
    expect(screen.queryByText(S['ssh.fromGone']!)).toBeNull();
    rerender(picker({ recents: [], computers: [pc('c1', 'atlas')] }));
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(S['ssh.from']!) })).not.toHaveTextContent('borealis'));
    expect(screen.getByRole('button', { name: new RegExp(S['ssh.from']!) })).not.toHaveTextContent('atlas');
    expect(screen.getByText(S['ssh.fromGone']!)).toBeTruthy();
  });

  it('the external forms\' middle crumb is the program step, never a program picked before', async () => {
    const user = userEvent.setup();
    render(picker({ recents: [] }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(tile(new RegExp('^' + S['program.terminal'])));
    await user.keyboard('{Backspace}');
    for (const row of [S['picker.web'], S['picker.ssh']]) {
      await user.click(await findTile(new RegExp('^' + row)));
      const crumbs = screen.getByRole('navigation', { name: S['picker.title'] });
      expect(crumbs).not.toHaveTextContent(S['program.terminal']!);
      // That step is the computer's, named after it.
      expect(within(crumbs).getByRole('button', { name: 'Back to atlas' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Back' }));
    }
  });
});
