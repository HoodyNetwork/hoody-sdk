// Vitest: "Add a program" kept apart from "Launch an app" (the unlabeled
// icon strip is one plain line of the programs' names, and "Launch an app" is the computer's own Apps): each computer
// tile names the Hoody Kit programs as its note (text only, the tile is one target); the Computers card says how many
// there are; a search with no match offers the whole list again; past the first step the first crumb is All computers
// and the next one names the computer chosen.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import kitStrings from '@kit/strings.en.json';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { CATALOG, startView, TILE_PROGRAMS } from '../embed/catalog';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';
import { findTile } from './browse.testkit';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const KS = kitStrings as Record<string, string>;
const fill = (key: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((x, [k, v]) => x.replaceAll(`{{${k}}}`, String(v)), S[key]!);
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c1', 'atlas'), pc('c2', 'borealis'), pc('c3', 'cedar', 'stopped')]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
/** The Kit programs step 2 offers, in its order: the names a computer row lists. */
const OFFERED = TILE_PROGRAMS.filter((p) => startView(CATALOG, p) !== undefined);
const row = (name: string) => screen.getByRole('row', { name: new RegExp('^' + name) });
/** The chosen computer's step: its Hoody Kit card. */
const kitCard = () => screen.findByRole('heading', { name: new RegExp('^' + S['picker.kit'] + ' · \\d+$') });
const crumbs = () => screen.getByRole('navigation', { name: S['picker.title'] });

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('Add a program: each computer row shows its Hoody programs', () => {
  it('every computer tile, stopped too, names the step-2 Kit programs in order, in one plain line: the tile\'s note, part of its name', () => {
    render(picker({}));
    expect(OFFERED.length).toBeGreaterThan(3);
    const line = OFFERED.map((p) => S['program.' + p]).join(' · ');
    for (const name of ['atlas', 'borealis', 'cedar']) {
      const r = row(name);
      const el = within(r).getByText(line);
      // Text only: no shortcut inside the tile (the whole tile is one target), no native tooltip.
      expect(el.children).toHaveLength(0);
      expect(r.querySelector('[data-program], [title]')).toBeNull();
      // The tile's name: the computer, its state, then the kit line (its note).
      expect(r).toHaveAccessibleName(name + ', ' + S['state.' + (name === 'cedar' ? 'stopped' : 'running')] + ', ' + line);
    }
  });

  it('a press on the line of names opens the computer\'s step, like the rest of its tile', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(picker({ onPick }));
    await user.click(within(row('borealis')).getByText(new RegExp(S['program.terminal']!)));
    expect(await kitCard()).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
    expect(within(crumbs()).getAllByRole('button').map((b) => b.textContent)).toEqual([S['picker.allComputers']]);
  });

  it('the tile itself still opens the computer\'s step 2; Enter in the search field picks the first tile found the same way', async () => {
    const user = userEvent.setup();
    render(picker({}));
    await user.click(row('atlas'));
    expect(await kitCard()).toBeInTheDocument();
    expect(screen.getByText('atlas', { selector: '[aria-current="step"]' })).toBeInTheDocument();
    await user.click(within(crumbs()).getByRole('button', { name: 'Back to All computers' }));
    await user.type(screen.getByRole('searchbox', { name: S['picker.search'] }), 'bor{Enter}');
    expect(await screen.findByText('borealis', { selector: '[aria-current="step"]' })).toBeInTheDocument();
  });

  it('the first screen has no Launch an app row: apps are on the computer\'s own step', async () => {
    const user = userEvent.setup();
    render(picker({}));
    expect(screen.queryByRole('row', { name: /^Launch an app/ })).toBeNull();
    await user.click(row('atlas'));
    // The launcher sits in the computer's frame, under its own kind (hidden while Programs is open).
    expect(await screen.findByRole('group', { name: S['picker.apps'], hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /^Launch an app/ })).toBeNull();
  });
});

describe('Add a program: the count and the way back to all the computers', () => {
  it('the Computers card says how many; while searching, how many of them match', async () => {
    const user = userEvent.setup();
    render(picker({}));
    expect(screen.getByRole('heading', { name: fill('picker.computersCount', { count: 3 }) })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: S['picker.search'] }), 'a');
    // atlas, borealis and cedar all hold an "a"; "at" only atlas.
    expect(screen.getByRole('heading', { name: fill('picker.computersOf', { n: 3, count: 3 }) })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: S['picker.search'] }), 't');
    expect(screen.getByRole('heading', { name: fill('picker.computersOf', { n: 1, count: 3 }) })).toBeInTheDocument();
  });

  it('a search that matches no computer still says the count, and the search field\'s clear button is the way back', async () => {
    const user = userEvent.setup();
    render(picker({}));
    const search = screen.getByRole('searchbox', { name: S['picker.search'] });
    await user.type(search, 'zz');
    // The count is still said with nothing matching, in the empty state's body (no page-built action row: anatomy).
    expect(screen.getByText(fill('picker.noMatchTitle', { q: 'zz' }))).toBeInTheDocument();
    expect(screen.getByText(fill('picker.noMatchOfBody_other', { count: 3 }))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: KS['search.clear'] }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('heading', { name: fill('picker.computersCount', { count: 3 }) })).toBeInTheDocument();
    expect(screen.getAllByRole('row', { name: /^(atlas|borealis|cedar)/ })).toHaveLength(3);
    await waitFor(() => expect(search).toHaveFocus());
  });

  it('from the keys: Escape in the search field clears it and the whole list is back', async () => {
    const user = userEvent.setup();
    render(picker({}));
    const search = screen.getByRole('searchbox', { name: S['picker.search'] });
    await user.type(search, 'zz');
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(screen.getAllByRole('row', { name: /^(atlas|borealis|cedar)/ })).toHaveLength(3);
  });

  it('a program chosen earlier and left is never named on a later computer\'s other steps', async () => {
    const user = userEvent.setup();
    render(picker({}));
    await user.click(row('atlas'));
    await user.click(await findTile(new RegExp('^' + S['program.terminal'])));
    await user.click(await screen.findByRole('button', { name: 'Back to All computers' }));
    await user.click(row('borealis'));
    await user.click(await findTile(new RegExp('^' + S['picker.extension'])));
    expect(await within(crumbs()).findByRole('button', { name: 'Back to borealis' })).toBeInTheDocument();
    expect(crumbs()).not.toHaveTextContent(S['program.terminal']!);
  });

  it('past the first step the first crumb is All computers, and it goes back to the whole list', async () => {
    const user = userEvent.setup();
    render(picker({}));
    await user.type(screen.getByRole('searchbox', { name: S['picker.search'] }), 'bor');
    await user.click(row('borealis'));
    await user.click(await findTile(new RegExp('^' + S['program.terminal'])));
    await user.click(await screen.findByRole('button', { name: 'Back to All computers' }));
    expect(screen.getByRole('searchbox', { name: S['picker.search'] })).toHaveValue('');
    expect(screen.getAllByRole('row', { name: /^(atlas|borealis|cedar)/ })).toHaveLength(3);
    // On the first step itself the crumb is the step's own name, not a button.
    expect(within(crumbs()).queryAllByRole('button')).toHaveLength(0);
    expect(crumbs()).toHaveTextContent(S['picker.computer']!);
  });
});
