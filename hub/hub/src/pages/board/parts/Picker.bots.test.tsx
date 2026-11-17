// Vitest: "Bots" in a running computer's step of Board > Add a program lists that computer's
// Bots (core useComputerBots) and adds a Bot tile {project, computer, realm, bot}. It is offered only while this Hub
// serves the Bots page (its tile view draws the tile): not for a stopped computer, a programs-only picker or a Hub
// without the Bots page. A failed read is one Try again row, never "no Bots".
import { answers, botsListRoute, bootFixtureCore, CoreQueryProvider, reply } from '@core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import type { BoardComputer } from '../computers';
import type { Tile } from '../model/boards';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';
import { kindNames, toKind } from './browse.testkit';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const served = vi.hoisted(() => ({ bots: true }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  const View = () => null;
  return {
    ...kit,
    useContributions: () => ({ widgets: [], guideTopics: [], tileViews: served.bots ? [{ pageId: 'bots', id: 'bot', title: 'Bot', Component: View, href: '/bots' }] : [] }),
  };
});

const S = strings as Record<string, string>;
const R = '0123456789abcdef01234567';
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
let asked: string[] = [];
const boot = (status = 200) => {
  asked = [];
  bootFixtureCore({
    rules: [reply(botsListRoute, (req) => {
      const id = req.target?.container.id ?? '';
      asked.push(id);
      if (status !== 200) return { status, body: {} };
      return answers.ok({ items: id === 'c1' ? [{ id: 'chief', name: 'Chief', realm: R }, { id: 'scout', name: 'Scout', realm: 'global' }] : [{ id: 'other', name: 'Other', realm: R }] });
    })],
  });
};
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c1', 'atlas'), pc('c2', 'cedar', 'stopped'), pc('c3', 'birch')]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
/** The Bots card's tiles (its grid is named after the card), drawn while the Bots kind is open. */
const botsGrid = () => screen.queryByRole('grid', { name: S['picker.bots'] });
/** Once the Bots are read, the Bots kind is open: its tile of that name. (The kind is waited for with a read-only check:
 * a findTile poll clicks the kinds while it waits, and a wait that changes the page feeds its own observer.) */
async function botTile(name: RegExp) {
  await waitFor(() => expect(kindNames()).toContain(S['browse.tab.bots']));
  toKind(S['browse.tab.bots']!);
  return within(botsGrid()!).getByRole('row', { name });
}
/** No Bots kind and no Bot tile anywhere. */
const noBots = () => {
  expect(kindNames()).not.toContain(S['browse.tab.bots']);
  expect(botsGrid()).toBeNull();
  expect(screen.queryByRole('row', { name: /^(Chief|Scout)\b/ })).toBeNull();
  expect(screen.queryByRole('option', { name: /^(Chief|Scout)\b/ })).toBeNull();
};

afterEach(() => { cleanup(); served.bots = true; });

describe('Bots in the add menu', () => {
  it("lists the chosen running computer's Bots only, by name", async () => {
    boot();
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await waitFor(() => expect(kindNames()).toContain(S['browse.tab.bots']));
    toKind(S['browse.tab.bots']!);
    expect(screen.getByRole('heading', { name: S['picker.bots'] + ' · 2' })).toBeInTheDocument();
    expect(within(botsGrid()!).getAllByRole('row').map((o) => o.getAttribute('aria-label'))).toEqual(['Chief, ' + S['picker.botDesc'], 'Scout, ' + S['picker.botDesc']]);
    expect(new Set(asked)).toEqual(new Set(['c1']));
  });

  it('picking a Bot adds a Bot tile for that computer, realm and Bot', async () => {
    boot();
    const user = userEvent.setup();
    const picked: Tile[] = [];
    render(picker({ onPick: (t) => picked.push(t) }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(await botTile(/^Scout\b/));
    expect(picked).toEqual([{ project: 'p1', computer: 'c1', realm: 'global', bot: 'scout' }]);
  });

  it("a Bot in a realm keeps that realm's id in its tile", async () => {
    boot();
    const user = userEvent.setup();
    const picked: Tile[] = [];
    render(picker({ onPick: (t) => picked.push(t) }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(await botTile(/^Chief\b/));
    expect(picked).toEqual([{ project: 'p1', computer: 'c1', realm: R, bot: 'chief' }]);
  });

  it('is not offered, and nothing is read, for a stopped computer or a programs-only picker', async () => {
    boot();
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /cedar/ }));
    await screen.findByRole('heading', { name: new RegExp('^' + S['picker.kit'] + ' · \\d+$') });
    noBots();
    cleanup();
    render(picker({ programsOnly: true }));
    // A programs-only picker keeps its lists of options (no frame of tiles), and lists the programs alone.
    await user.click(screen.getByRole('option', { name: /^atlas/ }));
    await screen.findByRole('option', { name: new RegExp('^' + S['program.terminal']) });
    noBots();
    expect(asked).toEqual([]);
  });

  it('is not offered, and nothing is read, when this Hub does not serve the Bots page', async () => {
    served.bots = false;
    boot();
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await screen.findByRole('heading', { name: new RegExp('^' + S['picker.kit'] + ' · \\d+$') });
    noBots();
    expect(asked).toEqual([]);
  });

  it('a failed read is one Try again row that reads again', async () => {
    boot(500);
    const user = userEvent.setup();
    render(picker({}));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    const retry = await botTile(new RegExp('^' + S['picker.botsFailed']));
    expect(within(botsGrid()!).getAllByRole('row')).toHaveLength(1);
    const before = asked.length;
    await user.click(retry);
    await waitFor(() => expect(asked.length).toBeGreaterThan(before));
  });
});
