// Vitest: Recent in Add a program can lose one entry (Delete on its focused tile) and be cleared (the Recent card's
// Clear header button); a pick stays one click; a Recent tile's name says Delete removes it; with no onRecent the card
// shows picks only. Model: dropRecent, clearRecents, restoreRecents (Clear's undo keeps a pick made since).
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { clearRecents, dropRecent, freshRealm, pushRecent, RECENTS_MAX, restoreRecents, type TileRef } from '../model/boards';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const pc = (id: string, name: string) => ({ id, name, project_id: 'p1', server_name: 'n12', status: 'running' }) as BoardComputer;
const ref = (session: number, program: TileRef['program'] = 'terminal'): TileRef => ({ project: 'p1', computer: 'c1', program, session });
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c1', 'atlas')]} failed={false} onRetry={() => {}} recents={[ref(1), ref(2)]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
/** The Recent card (its section, labelled by its heading "Recent · n") and its tiles. */
const recentCard = () => screen.getByRole('region', { name: new RegExp('^' + S['picker.recent'] + ' · \\d+$') });
const recentTiles = () => within(screen.getByRole('grid', { name: S['picker.recent'] })).getAllByRole('row');
let seed = 0;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('Recent you can clear', () => {
  it('Clear is the Recent card\'s header button, after the picks are counted; pressing it clears, never picks', async () => {
    const onRecent = { drop: vi.fn(), clear: vi.fn() };
    const onPick = vi.fn();
    render(picker({ onRecent, onPick }));
    // The card counts the picks only; Clear is no tile.
    expect(screen.getByRole('heading', { name: S['browse.count']!.replace('{{title}}', S['picker.recent']!).replace('{{count}}', '2') })).toBeInTheDocument();
    expect(recentTiles().map((o) => o.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^terminal-1/), expect.stringMatching(/^terminal-2/)]);
    const clear = within(recentCard()).getByRole('button', { name: S['picker.recentClear'] });
    expect(clear).toHaveTextContent(S['picker.recentClearShort']!);
    await userEvent.setup().click(clear);
    expect(onRecent.clear).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Delete on a focused Recent tile drops that entry and does not pick it; the tile itself still picks in one click', async () => {
    const onRecent = { drop: vi.fn(), clear: vi.fn() };
    const onPick = vi.fn();
    render(picker({ onRecent, onPick }));
    const user = userEvent.setup();
    recentTiles()[1]!.focus();
    await user.keyboard('{Delete}');
    expect(onRecent.drop).toHaveBeenCalledWith(ref(2));
    expect(onPick).not.toHaveBeenCalled();
    await user.click(recentTiles()[0]!);
    expect(onPick).toHaveBeenCalledWith(ref(1));
  });

  it('Delete on the focused Recent tile drops it; on a computer tile it does nothing', async () => {
    const onRecent = { drop: vi.fn(), clear: vi.fn() };
    render(picker({ onRecent }));
    const user = userEvent.setup();
    const first = recentTiles()[0]!;
    first.focus();
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard('{Delete}');
    expect(onRecent.drop).toHaveBeenCalledWith(ref(1));
    const atlas = screen.getByRole('row', { name: /^atlas/ });
    atlas.focus();
    await waitFor(() => expect(atlas).toHaveFocus());
    await user.keyboard('{Delete}');
    expect(onRecent.drop).toHaveBeenCalledTimes(1);
  });

  it('a Recent tile\'s name says Delete removes it, which drops it without a pick; a computer tile\'s does not; Enter in the search picks the first tile', async () => {
    const onRecent = { drop: vi.fn(), clear: vi.fn() };
    const onPick = vi.fn();
    render(picker({ onRecent, onPick }));
    const user = userEvent.setup();
    // Step 1 is tiles, not a list the search field drives.
    const search = screen.getByRole('searchbox');
    expect(screen.queryByRole('listbox')).toBeNull();
    const first = recentTiles()[0]!;
    expect(first).toHaveAccessibleName(new RegExp(S['picker.recentRemoveHint']!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    const atlas = screen.getByRole('row', { name: /^atlas/ });
    expect(atlas.getAttribute('aria-label')).not.toContain(S['picker.recentRemoveHint']!);
    first.focus();
    await user.keyboard('{Delete}');
    expect(onRecent.drop).toHaveBeenCalledWith(ref(1));
    expect(onPick).not.toHaveBeenCalled();
    // Enter in the search field picks the first tile (the first Recent pick).
    search.focus();
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(ref(1));
  });

  it('the search field names no list, option or instruction that is not drawn (step 1\'s tiles, and a computer\'s, are grids of their own)', async () => {
    const onRecent = { drop: vi.fn(), clear: vi.fn() };
    render(picker({ onRecent }));
    // Each id the search field refers to (the list it controls, its active option, its description) must be on the page.
    const dangling = (el: HTMLElement) => ['aria-controls', 'aria-activedescendant', 'aria-describedby'].flatMap((a) => (el.getAttribute(a) ?? '').split(/\s+/).filter(Boolean).filter((id) => !document.getElementById(id)).map((id) => `${a}=${id}`));
    expect(dangling(screen.getByRole('searchbox'))).toEqual([]);
    await userEvent.setup().click(screen.getByRole('row', { name: /^atlas/ }));
    expect(dangling(await screen.findByRole('searchbox', { name: S['picker.searchPrograms'] }))).toEqual([]);
  });

  it('without onRecent: picks only, no Clear and no remove', async () => {
    const onPick = vi.fn();
    render(picker({ onPick }));
    const tiles = recentTiles();
    expect(tiles).toHaveLength(2);
    expect(within(recentCard()).queryByRole('button', { name: S['picker.recentClear'] })).toBeNull();
    expect(tiles.every((o) => !(o.getAttribute('aria-label') ?? '').includes(S['picker.recentRemoveHint']!))).toBe(true);
    // Delete on a tile does nothing (and picks nothing).
    tiles[0]!.focus();
    await userEvent.setup().keyboard('{Delete}');
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('recents model', () => {
  const base = pushRecent(pushRecent(pushRecent(freshRealm(rand), ref(1)), ref(2)), ref(3, 'files'));

  it('dropRecent removes only that entry (ssh destination aside); an absent one leaves the state as it was', () => {
    expect(dropRecent(base, ref(2)).recents).toEqual([ref(3, 'files'), ref(1)]);
    expect(dropRecent(base, ref(9))).toBe(base);
  });

  it('clearRecents empties; restoreRecents puts them back after a pick made since, newest first, at most RECENTS_MAX', () => {
    const cleared = clearRecents(base);
    expect(cleared.recents).toEqual([]);
    expect(clearRecents(cleared)).toBe(cleared);
    const since = pushRecent(cleared, ref(7));
    expect(restoreRecents(since, base.recents).recents).toEqual([ref(7), ref(3, 'files'), ref(2), ref(1)]);
    const many = Array.from({ length: RECENTS_MAX }, (_, i) => ref(20 + i));
    expect(restoreRecents(since, [ref(7), ...many]).recents).toHaveLength(RECENTS_MAX);
    expect(restoreRecents(since, [ref(7), ...many]).recents.filter((x) => x.session === 7)).toHaveLength(1);
  });
});
