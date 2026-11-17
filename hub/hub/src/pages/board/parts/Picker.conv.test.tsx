// Vitest: "Conversation" in a running computer's step of Board > Add a program lists that computer's chats (the
// conversation provider's `list`, kit useConversationList) in the Board's realm, or in Global in All realms (it says so), and a
// pick adds the chat's web tile: its canonical link (links.ts convTile), which tileConv reads back as that chat. Offered only for a
// running computer, a full picker and a provider that lists. A failed read is one Try again row, never "no chats"; a computer
// changed while a read is out never shows the old computer's rows; nothing is opened. A chat the Board already holds is
// marked "On this Board".
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { setRealm } from '@core/ctx';
import { provideConversations, type ConversationProvider, type ConvListRow, type ShownComputer } from '@kit';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { convTile, convTileUrl, hubOrigin, tileConv } from '../links';
import type { Tile } from '../model/boards';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';
import { queryTile, tile } from './browse.testkit';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const fill = (k: string, v: Record<string, string>) => S[k]!.replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const R = '0123456789abcdef01234567';
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const handle = (name: string, id: string) => `${name}.${id.slice(-4)}`;

interface Ask { at: ShownComputer; realm: string; ok: (rows: readonly ConvListRow[]) => void; no: (e: unknown) => void }
function provider(o: { list?: boolean } = {}) {
  const asks: Ask[] = [];
  const open = vi.fn(() => null);
  const p: ConversationProvider = {
    open,
    ...(o.list === false ? {} : { list: (_acct: string, at: ShownComputer, realm: string) => new Promise<readonly ConvListRow[]>((ok, no) => { asks.push({ at, realm, ok, no }); }) }),
  };
  provideConversations(p);
  return { asks, open };
}
const rowsFor = (at: ShownComputer, realm: string): ConvListRow[] => [
  { ref: { computer: handle(at.name, at.id), realm, sid: 'new-1' }, title: 'Build the dashboard', at: Date.now() - 60_000 },
  { ref: { computer: handle(at.name, at.id), realm, sid: 'old-1' }, title: null, at: null },
];
const picker = (p: Partial<PickerProps> = {}) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c0a7150000000000000000a1', 'atlas'), pc('c0a7150000000000000000b2', 'cedar', 'stopped'), pc('c0a7150000000000000000c3', 'birch')]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
/** The Conversation tile (in "More" of the computer's step), or null. */
const chats = () => queryTile(new RegExp('^' + S['picker.conv']));

afterEach(() => { cleanup(); provideConversations(null); });

describe('Conversation in the add menu', () => {
  it('is offered for a running computer only, with a full picker and a provider that lists', async () => {
    bootFixtureCore();
    const user = userEvent.setup();
    provider();
    const r = render(picker());
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    expect(chats()).toHaveAccessibleName(S['picker.conv']! + ', ' + S['picker.convDesc']!);
    expect(within(screen.getByRole('grid', { name: S['picker.more'] })).getAllByRole('row')).toContain(chats());
    await user.click(screen.getByRole('button', { name: 'Back to All computers' }));
    await user.click(screen.getByRole('row', { name: /cedar/ }));
    expect(chats()).toBeNull();
    r.unmount();
    render(picker({ programsOnly: true }));
    // A programs-only picker keeps its lists of options (no frame of tiles).
    await user.click(screen.getByRole('option', { name: /^atlas/ }));
    await screen.findByRole('option', { name: new RegExp('^' + S['program.terminal']) });
    expect(chats()).toBeNull();
    expect(screen.queryByRole('option', { name: new RegExp('^' + S['picker.conv']) })).toBeNull();
    cleanup();
    provideConversations(null);
    provider({ list: false });
    render(picker());
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    expect(chats()).toBeNull();
  });

  it("lists the computer's chats in the Board's realm; a pick adds that chat's canonical tile and opens nothing", async () => {
    bootFixtureCore();
    act(() => setRealm(R));
    const user = userEvent.setup();
    const { asks, open } = provider();
    const picked: Tile[] = [];
    render(picker({ onPick: (t) => picked.push(t) }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(tile(new RegExp(S['picker.conv']!)));
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]).toMatchObject({ realm: R, at: { project: 'p1', id: 'c0a7150000000000000000a1', name: 'atlas', server: 'n12' } });
    expect(screen.queryByText(S['picker.convGlobal']!)).toBeNull();
    const rows = rowsFor(asks[0]!.at, R);
    await act(async () => { asks[0]!.ok(rows); });
    const names = screen.getAllByRole('option').map((o) => o.querySelector('[class*="optionName"]')?.textContent);
    expect(names).toEqual(['Build the dashboard', S['picker.convUntitled']]);
    await user.click(screen.getByRole('option', { name: /Build the dashboard/ }));
    expect(picked).toEqual([convTile(hubOrigin(), rows[0]!.ref, 'Build the dashboard')]);
    expect(tileConv(picked[0])).toEqual(rows[0]!.ref);
    expect(open).not.toHaveBeenCalled();
  });

  it('in All realms it lists the chats in Global and says so; empty, one sentence says none in Global', async () => {
    bootFixtureCore();
    act(() => setRealm('all'));
    const user = userEvent.setup();
    const { asks } = provider();
    render(picker({ realmName: null }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(tile(new RegExp(S['picker.conv']!)));
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]!.realm).toBe('global');
    expect(screen.getByText(S['picker.convGlobal']!)).toBeTruthy();
    await act(async () => { asks[0]!.ok([]); });
    // Empty in All realms: one sentence that says both (no chats, in Global).
    expect(screen.getByText(fill('picker.convNoneGlobal', { computer: 'atlas' }))).toBeTruthy();
    expect(screen.queryByText(S['picker.convGlobal']!)).toBeNull();
  });

  it('a failed read is one Try again row (never "no chats"), and Try again reads again', async () => {
    bootFixtureCore();
    act(() => setRealm(R));
    const user = userEvent.setup();
    const { asks } = provider();
    render(picker());
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(tile(new RegExp(S['picker.conv']!)));
    await waitFor(() => expect(asks).toHaveLength(1));
    await act(async () => { asks[0]!.no({ status: 503 }); });
    expect(screen.getAllByRole('option').map((o) => o.querySelector('[class*="optionName"]')?.textContent)).toEqual([S['picker.convFailed']]);
    expect(screen.queryByText(/No chats/)).toBeNull();
    await user.click(screen.getByRole('option', { name: new RegExp(S['picker.convFailed']!) }));
    await waitFor(() => expect(asks).toHaveLength(2));
    await act(async () => { asks[1]!.ok(rowsFor(asks[1]!.at, R)); });
    expect(screen.getByRole('option', { name: /Build the dashboard/ })).toBeTruthy();
  });

  it("another computer chosen while a read is out never shows the first computer's rows", async () => {
    bootFixtureCore();
    act(() => setRealm(R));
    const user = userEvent.setup();
    const { asks } = provider();
    render(picker());
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(tile(new RegExp(S['picker.conv']!)));
    await waitFor(() => expect(asks).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Back to All computers' }));
    await user.click(screen.getByRole('row', { name: /birch/ }));
    await user.click(tile(new RegExp(S['picker.conv']!)));
    await waitFor(() => expect(asks).toHaveLength(2));
    expect(asks[1]!.at.name).toBe('birch');
    await act(async () => { asks[0]!.ok([{ ref: { computer: handle('atlas', asks[0]!.at.id), realm: R, sid: 'atlas-only' }, title: 'Atlas chat', at: 1 }]); });
    expect(screen.queryByText('Atlas chat')).toBeNull();
    await act(async () => { asks[1]!.ok([{ ref: { computer: handle('birch', asks[1]!.at.id), realm: R, sid: 'birch-1' }, title: 'Birch chat', at: 2 }]); });
    expect(screen.getByRole('option', { name: /Birch chat/ })).toBeTruthy();
    expect(screen.queryByText('Atlas chat')).toBeNull();
  });

  it('a chat already on this Board says so on its row (the other rows carry no mark); picking it is still possible', async () => {
    bootFixtureCore();
    act(() => setRealm(R));
    const user = userEvent.setup();
    const { asks } = provider();
    const atlas = { project: 'p1', id: 'c0a7150000000000000000a1', name: 'atlas', server: 'n12' };
    const onBoardRef = rowsFor(atlas, R)[1]!.ref;
    const picked: Tile[] = [];
    // The Board holds the untitled chat under the person's own label: the mark follows the chat, not the label.
    render(picker({ onBoardChats: [convTileUrl(hubOrigin(), onBoardRef)], onPick: (t) => picked.push(t) }));
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    await user.click(tile(new RegExp(S['picker.conv']!)));
    await waitFor(() => expect(asks).toHaveLength(1));
    await act(async () => { asks[0]!.ok(rowsFor(asks[0]!.at, R)); });
    const marks = screen.getAllByRole('option').map((o) => o.querySelector('[class*="optionMeta"]')?.textContent ?? null);
    expect(marks).toEqual([null, S['picker.onBoard']]);
    await user.click(screen.getByRole('option', { name: new RegExp(S['picker.convUntitled']!) }));
    expect(tileConv(picked[0])).toEqual(onBoardRef);
  });
});

// The Conversation step by keyboard: the arrows and Enter pick a chat,
// Backspace goes back to the program step (whose first tile takes the focus), and the focus comes back to the chats'
// list once the read answers.
describe('Conversation in the add menu, by keyboard', () => {
  const stepTitle = () => document.querySelector<HTMLElement>('[aria-current="step"]');
  /** From the computer's step: More is a grid of its own (one Tab stop); from its first tile the arrows go to
   * Conversation, and Enter opens it. */
  async function toConvTile(user: ReturnType<typeof userEvent.setup>) {
    const more = within(screen.getByRole('grid', { name: S['picker.more'] })).getAllByRole('row');
    const i = more.findIndex((o) => o.getAttribute('aria-label') === S['picker.conv']! + ', ' + S['picker.convDesc']!);
    expect(i).toBeGreaterThan(0);
    more[0]!.focus();
    for (let n = 0; n < i; n++) await user.keyboard('{ArrowRight}');
    expect(more[i]).toHaveFocus();
    await user.keyboard('{Enter}');
  }
  async function toConvByKeys(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('row', { name: /atlas/ }));
    // The computer's step: its first tile takes the focus.
    await waitFor(() => expect(screen.getAllByRole('row')[0]).toHaveFocus());
    await toConvTile(user);
  }

  it('the arrows and Enter pick a chat; while the read is out the title holds the focus, and the list takes it back when it answers', async () => {
    bootFixtureCore();
    act(() => setRealm(R));
    const user = userEvent.setup();
    const { asks, open } = provider();
    const picked: Tile[] = [];
    render(picker({ onPick: (t) => picked.push(t) }));
    await toConvByKeys(user);
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(stepTitle()?.textContent).toBe(S['picker.conv']);
    await waitFor(() => expect(stepTitle()).toHaveFocus());
    const rows = rowsFor(asks[0]!.at, R);
    await act(async () => { asks[0]!.ok(rows); });
    const list = (await screen.findAllByRole('listbox'))[0]!; // the chats' list takes the focus
    await waitFor(() => expect(list).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(picked).toEqual([convTile(hubOrigin(), rows[1]!.ref, S['picker.convUntitled'])]);
    expect(tileConv(picked[0])).toEqual(rows[1]!.ref);
    expect(open).not.toHaveBeenCalled();
  });

  it('Backspace goes back to the program step, whose first tile takes the focus; a read answering after it draws nothing', async () => {
    bootFixtureCore();
    act(() => setRealm(R));
    const user = userEvent.setup();
    const { asks } = provider();
    render(picker());
    await toConvByKeys(user);
    await waitFor(() => expect(asks).toHaveLength(1));
    await act(async () => { asks[0]!.ok(rowsFor(asks[0]!.at, R)); });
    await waitFor(() => expect(screen.getAllByRole('listbox')[0]).toHaveFocus());
    await user.keyboard('{Backspace}');
    expect(stepTitle()?.textContent).not.toBe(S['picker.conv']);
    expect(tile(new RegExp(S['picker.conv']!))).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Build the dashboard/ })).toBeNull();
    await waitFor(() => expect(screen.getAllByRole('row')[0]).toHaveFocus());
    // Back again to the chats, then Backspace while that read is out: its late answer is never drawn on the program step.
    await toConvTile(user);
    await waitFor(() => expect(asks.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(stepTitle()).toHaveFocus());
    await user.keyboard('{Backspace}');
    await act(async () => { asks.at(-1)!.ok([{ ref: { computer: handle('atlas', asks.at(-1)!.at.id), realm: R, sid: 'late-1' }, title: 'Late chat', at: 3 }]); });
    expect(screen.queryByText('Late chat')).toBeNull();
    expect(tile(new RegExp(S['picker.conv']!))).toBeTruthy();
  });
});
