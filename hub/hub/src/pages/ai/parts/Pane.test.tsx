// The AI pane and its chat list, on real core (fixture transport), through
// the tab's routes. Needs you first, paged with meta.omitted; the Bot's own session and drafts hidden; delegates tagged;
// the folder filter in the URL; bounded state reads (≤ 20); re-list when a change token moves; rows link the canonical
// conversation reference; the foot mounts Pause and the gear's Stop everything (one realm only).
import K from '@kit/data/GroupNotes.strings.en.json';
import { agent, answers, bootFixtureCore, chooseComputer, containersRoute, fixtureWorld, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The fixture side of core's seam (pageFixtures): New chat reads the computer's realms through it (../data useComputer),
// and this harness renders the tab without app/testing (which loads it), so without this New chat draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import AiTab from '../tab';
import { setRealm } from '@core/ctx';
import { chatRules, chatWorld, type ChatRuleOpts, type ChatWorld, type Stall } from './fixtures.chats';
import newChatStrings from '../new/NewChat.strings.en.json';
import strings from './Pane.strings.en.json';
import wfStrings from '../auto/workflows/strings.en.json';
import aiStrings from '../strings.en.json';
import head from '@kit/agent/ConvHeader.strings.en.json';
import { chatRoutes, FEED_MS, SLOW_MS, STATE_MS, useChats, useChatsAt, type ChatsAt } from './data';
import { ChatList, PENDING_NOTE_MS } from './ChatList';
import { resetChatScopeForTests, setFeedConnectForTests, type FeedEvents } from './allChats';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const BOT = fixtureWorld.bots[0]!.name;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
let sent: FixtureRequest[] = [];
const gets = (suffix: string) => sent.filter((r) => r.method === 'GET' && r.path.endsWith(suffix));
const stateReads = () => sent.filter((r) => r.method === 'GET' && /\/sessions\/[^/]+\/state$/.test(r.path));

const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

/** first: rules ahead of the chat list's (a held read, say). */
async function open(path: string, o: ChatRuleOpts = {}, realm?: string, first: FixtureRule[] = [], sh: ShellData = shell) {
  sent = [];
  bootFixtureCore({ rules: [...first, ...chatRules({ ...o, onSend: (r) => sent.push(r) })], ...(realm ? { realm } : {}) });
  act(() => chooseComputer(atlas));
  // The app's own shape (app/pageRouter.tsx): one splat route per page, so a write to '.' (useDataView) stays on /ai.
  const root = createRootRoute({ component: Outlet });
  const tab = createRoute({ getParentRoute: () => root, path: '/ai/$', component: AiTab });
  const router = createRouter({ routeTree: root.addChildren([tab]), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={sh}>
        {/* The page region the layout measures (the shell's main). */}
        <main id="hub-main">
          <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
        </main>
      </ShellDataProvider>,
    );
    await router.load();
  });
  return router;
}

/** What the list draws, top to bottom: '# Label' for a group header, the row's title for a row. */
function drawn(): string[] {
  const body = document.querySelector('tbody');
  if (!body) return [];
  return [...body.querySelectorAll('tr')].flatMap((tr) => {
    const btn = tr.querySelector('button[aria-expanded]');
    if (btn && !tr.hasAttribute('data-row-id')) return [`# ${(btn.textContent ?? '').replace(/\d+$/, '').trim()}`];
    return tr.hasAttribute('data-row-id') ? [tr.getAttribute('data-row-id')!] : [];
  });
}
const rowsShown = () => drawn().filter((x) => !x.startsWith('#'));
/** The text of the note row right under a group header (TableGroup.note), or null when the group has none. */
function noteAfter(name: string): string | null {
  const trs = [...document.querySelectorAll('tbody tr')];
  const i = trs.findIndex((tr) => !tr.hasAttribute('data-row-id') && (tr.querySelector('button[aria-expanded]')?.textContent ?? '').replace(/\d+$/, '').trim() === name);
  const next = i < 0 ? null : trs[i + 1];
  return next && next.querySelector('[data-group-note]') ? (next.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}
const S = strings as Record<string, string>;
const k = (sid: string) => `${PERSONAL}/${sid}`;

beforeEach(() => {
  // The pane takes the page region's width: a wide page draws pane and main side by side.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.useRealTimers();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the pane on the chat routes', () => {
  it('/ai shows the pane (New chat, the switcher, the list) and New chat in the main region; nothing moves to Models & keys', async () => {
    const router = await open('/ai');
    const nav = await screen.findByRole('navigation', { name: strings['pane.label'] });
    expect(within(nav).getByRole('link', { name: strings['pane.newChat'] })).toHaveAttribute('href', expect.stringContaining('/ai/new'));
    const sw = within(nav).getByRole('list', { name: strings['switch.label'] });
    expect(within(sw).getAllByRole('link').map((a) => a.textContent)).toEqual([strings['switch.chats'], strings['switch.agents'], strings['switch.auto'], strings['switch.knowledge'], strings['switch.settings']]);
    expect(within(sw).getByRole('link', { name: strings['switch.chats'] })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { level: 1, name: newChatStrings.title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ai');
  });

  it('Needs you first, then the days; the Bot own session (agent bot or a Bot session) and drafts are not listed', async () => {
    await open('/ai');
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await waitFor(() => expect(rowsShown()).toContain(k('s-wait')));
    const d = drawn();
    expect(d[0]).toBe(`# ${strings['group.needs']}`);
    expect(d[1]).toBe(k('s-wait'));
    expect(d).toContain(`# ${strings['group.today']}`);
    expect(d).toContain(`# ${strings['group.older']}`);
    for (const hidden of ['s-bot', 's-botown', 's-draft']) expect(rowsShown()).not.toContain(k(hidden));
    // The count leaves the hidden sessions out (meta.total counts them): all 5 listed are shown, no "Showing 5 of 8".
    expect(screen.queryByText(/Showing \d+ of/)).toBeNull();
    expect(screen.getAllByText('Fix the failing checkout tests').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: strings['mark.needs'] })).toBeInTheDocument();
  });

  it('tags a Bot delegate with the Bot name and a Claude Code chat', async () => {
    await open('/ai');
    expect(await screen.findByText(fill(strings['tag.bot'], { name: BOT }))).toBeInTheDocument();
    expect(screen.getByText(strings['tag.claude'])).toBeInTheDocument();
  });

  it('a row opens its conversation by the canonical link: computer handle, the row realm, the sid', async () => {
    const router = await open('/ai');
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    const row = document.querySelector(`tr[data-row-id="${k('s-today')}"]`)!;
    await userEvent.click(within(row as HTMLElement).getByText('Fix the failing checkout tests'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-today'));
    expect(router.state.location.search).toMatchObject({ computer: HANDLE, realm: PERSONAL });
    // The open chat is drawn selected, and its header names it with its computer, realm and folder.
    expect(await screen.findByRole('heading', { level: 2, name: 'Fix the failing checkout tests' })).toBeInTheDocument();
    const where = within(screen.getByRole('list', { name: head['head.meta'] }));
    expect(where.getByText('atlas · Personal')).toBeInTheDocument();
    expect(where.getByText('/home/ada/projects/shop')).toBeInTheDocument();
  });

  it('the folder filter lives in the URL (?folder=): only that folder chats show', async () => {
    await open(`/ai?folder=${encodeURIComponent('/home/ada/projects/shop')}`);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    expect(rowsShown().sort()).toEqual([k('s-today'), k('s-wait')].sort());
  });

  it('a folder page list (folder prop) shows that folder only, offers no folder filter and claims no total', async () => {
    function Folder({ at }: { at: ChatsAt }) {
      return <ChatList at={at} chats={useChats(at)} handle={HANDLE} computerName="atlas" folder="/home/ada/projects/shop" />;
    }
    function Harness() {
      const at = useChatsAt();
      return at ? <Folder at={at} /> : null;
    }
    sent = [];
    bootFixtureCore({ rules: chatRules({ onSend: (r) => sent.push(r) }) });
    act(() => chooseComputer(atlas));
    const router = createRouter({ routeTree: createRootRoute({ component: Harness }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
    await act(async () => {
      render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
      await router.load();
    });
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await waitFor(() => expect(rowsShown().sort()).toEqual([k('s-today'), k('s-wait')].sort()));
    // No filter to offer: the list draws no Filters control (the folder filter is the only one).
    expect(screen.queryByRole('button', { name: /filter/i })).toBeNull();
    expect(screen.queryByText(/Showing \d+ of/)).toBeNull();
  });

  it('a list key (?q=) keeps the chat list; an old models key (?connect=) still moves to Models & keys', async () => {
    const r1 = await open('/ai?q=checkout');
    await waitFor(() => expect(rowsShown()).toEqual([k('s-today')]));
    expect(r1.state.location.pathname).toBe('/ai');
    cleanup();
    const r2 = await open('/ai?connect=openai');
    await waitFor(() => expect(r2.state.location.pathname).toBe('/ai/models'));
  });
});

describe('Needs you pages (meta.omitted)', () => {
  it('a page that left gates out says "and more"; Show more waiting reads again', async () => {
    const w: ChatWorld = chatWorld();
    w.gates = [{ session_id: 's-wait' }, { session_id: 's-old' }];
    w.omitted = 1;
    await open('/ai', { world: w });
    expect(await screen.findByText(strings['group.needsMore'].trim())).toBeInTheDocument();
    const before = gets('/gates').length;
    w.omitted = 0;
    await userEvent.click(screen.getByRole('button', { name: strings['group.needsMoreShow'] }));
    await waitFor(() => expect(gets('/gates').length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText(strings['group.needsMore'].trim())).toBeNull());
    expect(drawn()[0]).toBe(`# ${strings['group.needs']}`);
    expect(rowsShown().slice(0, 2).sort()).toEqual([k('s-old'), k('s-wait')].sort());
  });

  it('a total beyond 100 pages: each Show more waiting press reads the next 20 waiting chats, then page 2', async () => {
    const w: ChatWorld = chatWorld();
    w.gates = Array.from({ length: 101 }, (_, i) => ({ session_id: i === 100 ? 's-old' : `gone-${i}` }));
    await open('/ai', { world: w });
    const goneReads = () => sent.filter((r) => /\/sessions\/gone-\d+$/.test(r.path)).length;
    await waitFor(() => expect(goneReads()).toBe(20));
    // One thing a press: 20 more chat reads while waiting chats remain past the bound, then the next gates page.
    for (let press = 1; press <= 5 && !gets('/gates').some((r) => r.query.page === '2'); press++) {
      const before = goneReads();
      await userEvent.click(await screen.findByRole('button', { name: strings['group.needsMoreShow'] }));
      await waitFor(() => expect(goneReads() > before || gets('/gates').some((r) => r.query.page === '2')).toBe(true));
      expect(goneReads() - before).toBeLessThanOrEqual(20);
    }
    await waitFor(() => expect(gets('/gates').some((r) => r.query.page === '2')).toBe(true));
    // Chats that are gone (404) are answers, not failures: nothing says "not checked".
    expect(screen.queryByText(strings['group.needsUnknown'].trim())).toBeNull();
  });
});

describe('bounded state reads and fresh lists', () => {
  it('an older agent (rows without state): reads the state of at most 20 chats active in the last 30 minutes', async () => {
    const w: ChatWorld = { ...chatWorld(), older: true };
    const t = Date.now();
    for (let i = 0; i < 25; i++) w.sessions.push({ id: `busy-${i}`, first_message: `task ${i}`, last_request_at: new Date(t - i * 1000).toISOString() });
    await open('/ai', { world: w });
    await waitFor(() => expect(stateReads().length).toBe(20));
    const ids = stateReads().map((r) => r.path.split('/').slice(-2)[0]);
    expect(new Set(ids).size).toBe(20);
    expect(ids).not.toContain('s-old');
    expect(ids).not.toContain('s-wait');
  });

  it('an older agent: the running mark comes from a state read', async () => {
    await open('/ai', { world: { ...chatWorld(), older: true } });
    expect(await screen.findByRole('img', { name: strings['mark.running'] })).toBeInTheDocument();
    expect(stateReads().length).toBeGreaterThan(0);
  });

  it('Bot rows carry the marks and the Bot tag; no state read, no delegate read, paged by last activity', async () => {
    await open('/ai');
    expect(await screen.findByRole('img', { name: strings['mark.running'] })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: strings['mark.needs'] })).toBeInTheDocument();
    expect(await screen.findByText(fill(strings['tag.bot'], { name: BOT }))).toBeInTheDocument();
    for (const hidden of ['s-bot', 's-botown', 's-draft']) expect(rowsShown()).not.toContain(k(hidden));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(stateReads()).toHaveLength(0);
    expect(sent.filter((r) => /\/bots\/[^/]+\/delegates$/.test(r.path))).toHaveLength(0);
    const lists = sent.filter((r) => r.method === 'GET' && r.path.endsWith('/sessions'));
    expect(lists.length).toBeGreaterThan(0);
    for (const r of lists) expect(r.query.order).toBe('last_active');
  });

  it("a delegate whose Bot is not among the Bots read is tagged Bot, without a name", async () => {
    const w = chatWorld();
    // The Bot list answers without it: only the row's origin says it is a Bot's.
    w.bots = [{ id: 'ghost', name: 'Ghost', delegates: ['s-delegate'], unlisted: true }];
    await open('/ai', { world: w });
    expect(await screen.findByText(strings['tag.botUnnamed'], { exact: true })).toBeInTheDocument();
  });

  it('re-lists sessions when the sessions token moves, and gates when theirs moves; an unchanged token re-lists nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const w = chatWorld();
    await open('/ai', { world: w });
    await waitFor(() => expect(gets('/changes').length).toBe(1));
    await waitFor(() => expect(gets('/sessions').length).toBe(1));
    const s0 = gets('/sessions').length, g0 = gets('/gates').length;
    await act(async () => { await vi.advanceTimersByTimeAsync(FEED_MS + 10); });
    await waitFor(() => expect(gets('/changes').length).toBe(2));
    expect(gets('/sessions').length).toBe(s0);
    expect(gets('/gates').length).toBe(g0);
    w.tokens = { ...w.tokens, sessions: 'c1:s2' };
    await act(async () => { await vi.advanceTimersByTimeAsync(FEED_MS + 10); });
    await waitFor(() => expect(gets('/sessions').length).toBe(s0 + 1));
    expect(gets('/gates').length).toBe(g0);
    w.tokens = { ...w.tokens, gates: 'c1:g2' };
    await act(async () => { await vi.advanceTimersByTimeAsync(FEED_MS + 10); });
    await waitFor(() => expect(gets('/gates').length).toBe(g0 + 1));
  });

  it('with All realms (no feed: GET /changes takes one realm) the lists re-read every 30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open('/ai', {}, 'all');
    await waitFor(() => expect(gets('/sessions').length).toBe(1));
    expect(gets('/changes')).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_MS + 10); });
    await waitFor(() => expect(gets('/sessions').length).toBe(2));
    expect(STATE_MS).toBeLessThan(SLOW_MS);
  });

  it('a realm-pinned agent refusing realm=all is read again in its own realm', async () => {
    await open('/ai', { pinned: true }, 'all');
    await waitFor(() => expect(gets('/sessions').length).toBeGreaterThanOrEqual(2));
    expect(await screen.findAllByText('Fix the failing checkout tests')).not.toHaveLength(0);
    // The fallback is the plain listing (no realm on the wire), for the sessions and the gates alike.
    expect(sent.some((r) => r.route === chatRoutes.sessionsHere)).toBe(true);
    await waitFor(() => expect(sent.some((r) => r.route === chatRoutes.gatesHere)).toBe(true));
    expect(await screen.findByText(fill(strings['foot.needs'], { count: '1' }))).toBeInTheDocument();
  });
});

describe('the foot: computer · realm, Pause and Stop everything', () => {
  it('names the computer and realm, says how many need you, and mounts Pause (reads GET /pause) quietly: no button of its own', async () => {
    await open('/ai');
    expect(await screen.findByText(fill(strings['foot.where'], { computer: 'atlas', realm: 'Personal' }))).toBeInTheDocument();
    expect(await screen.findByText(fill(strings['foot.needs'], { count: '1' }))).toBeInTheDocument();
    await waitFor(() => expect(gets('/pause').length).toBeGreaterThan(0));
    // Running, Pause is in the gear, not a top-level button.
    expect(screen.queryByRole('button', { name: /pause agents/i })).toBeNull();
  });

  it('the settings menu sits on the computer\'s row, at its end, named AI settings, drawn as sliders (never the sun-like mark)', async () => {
    await open('/ai');
    const where = (await screen.findByText(fill(strings['foot.where'], { computer: 'atlas', realm: 'Personal' }))).closest('[class*="where"]:not([class*="whereText"])') as HTMLElement;
    const menu = within(where).getByRole('button', { name: strings['gear.label'] });
    expect(where.lastElementChild!.contains(menu)).toBe(true);
    expect(menu.querySelector('svg path')!.getAttribute('d')).toBe('M3 7h18M3 17h18M14 4v6M8 14v6');
  });

  it('a failed pause read shows "Pause state unknown" with Try again in the foot, never a Pause button', async () => {
    await open('/ai', {}, undefined, [reply(agent.pauseRoutes.get, () => answers.refused(503, 'unavailable'))]);
    const strip = await screen.findByText('Pause state unknown');
    expect(within(strip.parentElement!).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(strip.parentElement).toHaveAttribute('data-pause', 'unread');
  });

  it('with the computer name not known yet the foot names the realm alone, never a leading separator', async () => {
    await open('/ai', {}, undefined, [], { ...shell, computers: [] });
    expect(await screen.findByText(fill(strings['foot.needs'], { count: '1' }))).toBeInTheDocument();
    expect(screen.getAllByText('Personal', { exact: true }).some((e) => e.tagName === 'STRONG')).toBe(true);
    expect(screen.queryByText(fill(strings['foot.where'], { computer: '', realm: 'Personal' }).trim())).toBeNull();
  });

  it('the gear\'s Pause and Rules & hooks\' Resume send the one store\'s change; paused, the foot keeps its strip', async () => {
    let paused = false;
    let gen = 1;
    const puts: boolean[] = [];
    const pauseRules: FixtureRule[] = [
      reply(agent.pauseRoutes.set, (r) => {
        const b = (r.body ?? {}) as { paused?: boolean };
        puts.push(b.paused === true);
        paused = b.paused === true;
        gen += 1;
        return answers.ok({ paused, since_ms: paused ? 1000 : 0, gen });
      }),
      reply(agent.pauseRoutes.get, () => answers.ok({ paused, since_ms: paused ? 1000 : 0, gen })),
    ];
    await open('/ai', {}, undefined, pauseRules);
    await userEvent.click(await screen.findByRole('button', { name: strings['gear.label'] }));
    const item = await screen.findByRole('menuitem', { name: /Pause agents/ });
    expect(item).toHaveAccessibleDescription(fill(strings['gear.pauseNote'], { computer: 'atlas' }));
    await userEvent.click(item);
    await waitFor(() => expect(puts).toEqual([true]));
    expect(await screen.findByText('Paused · turns wait at their next step')).toBeInTheDocument();
    // Rules & safety reads the same store: paused there too, and its Resume sends the change back.
    await userEvent.click(await screen.findByRole('button', { name: strings['gear.label'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['gear.rules'] }));
    const section = (await screen.findByRole('heading', { name: aiStrings['rules.emergency.title'] })).closest('section') as HTMLElement;
    await userEvent.click(await within(section).findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(puts).toEqual([true, false]));
    expect(await within(section).findByRole('button', { name: /Pause agents/ })).toBeInTheDocument();
  });

  it('the gear offers Stop everything in this realm (opens the confirm, sends nothing); with All realms it is disabled', async () => {
    await open('/ai');
    await userEvent.click(await screen.findByRole('button', { name: strings['gear.label'] }));
    const item = await screen.findByRole('menuitem', { name: new RegExp(fill(strings['gear.stopAll'], { realm: 'Personal' })) });
    await userEvent.click(item);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(sent.filter((r) => r.method !== 'GET')).toHaveLength(0);
    cleanup();
    await open('/ai', {}, 'all');
    await userEvent.click(await screen.findByRole('button', { name: strings['gear.label'] }));
    const off = await screen.findByRole('menuitem', { name: new RegExp(fill(strings['gear.stopAll'], { realm: strings['foot.allRealms'] })) });
    expect(off).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('a failed gates read', () => {
  it('beside an open chat, the band keeps the Needs-you words and the coverage words apart', async () => {
    await open(`/ai/c/s-today?computer=${HANDLE}&realm=${PERSONAL}`, { gatesDown: { on: true } });
    const words = await screen.findByText(strings['group.needsUnknown'].trim());
    expect(words.parentElement?.textContent).toContain(`${strings['group.needsUnknown']}${strings['list.partial']}`);
  });

  it('Bot rows still mark their waiting chat and the foot counts it; the list still says others may be missed', async () => {
    await open('/ai', { gatesDown: { on: true } });
    expect(await screen.findByText(strings['group.needsUnknown'].trim())).toBeInTheDocument();
    await waitFor(() => expect(footNeeds()).toBe(fill(strings['foot.needs'], { count: '1' })));
    expect(screen.queryByText(READY)).toBeNull();
  });

  it('an older agent: says in the list that waiting chats could not be checked (the foot claims nothing); Refresh recovers', async () => {
    const down = { on: true };
    await open('/ai', { world: { ...chatWorld(), older: true }, gatesDown: down });
    expect(await screen.findByText(strings['group.needsUnknown'].trim())).toBeInTheDocument();
    expect(footNeeds()).toBe('');
    expect(screen.queryByText(READY)).toBeNull();
    down.on = false;
    await userEvent.click(within(screen.getByText(strings['group.needsUnknown'].trim()).closest('[role="status"]') as HTMLElement).getByRole('button', { name: strings['list.refresh'] }));
    expect(await screen.findByText(fill(strings['foot.needs'], { count: '1' }))).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(strings['group.needsUnknown'].trim())).toBeNull());
  });
});

/** All computers' change feed held open, as a real stream stays (the fixture transport ends each after its frames, and
 *  a feed that is down is staleness): its snapshot frame, then open; `down` while the stall says the feed
 *  fails. */
const feeds: FeedEvents[] = [];
function heldFeed(w: ChatWorld, stall: { feed?: Stall } = {}) {
  return (_at: unknown, ev: FeedEvents) => {
    let closed = false;
    queueMicrotask(() => {
      if (closed) return;
      if (stall.feed) return ev.state('down');
      feeds.push(ev);
      ev.state('open');
      ev.frame('snapshot', JSON.stringify({ scope: w.scope, tokens: { ...w.tokens } }));
    });
    return { close: () => { closed = true; } };
  };
}
const dropFeeds = () => act(() => { for (const ev of feeds.splice(0)) ev.state('down'); });
afterEach(() => {
  setFeedConnectForTests(null);
  feeds.length = 0;
});

/** The browser's own online flag and event (what useOnline and TanStack's network mode follow). */
function setBrowserOnline(on: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: on, configurable: true });
  window.dispatchEvent(new Event(on ? 'online' : 'offline'));
}

/** The foot's Needs you line (the span after the computer · realm line). */
function footNeeds(): string {
  const where = screen.getByText((_, el) => el?.tagName === 'STRONG' && /·/.test(el.textContent ?? ''));
  return where.nextElementSibling?.textContent ?? '';
}
/** The readiness claim the foot never makes. */
const READY = /agent ready/i;

describe('the foot never claims that nothing waits', () => {
  it('every read answered and nothing waiting: no count and no "Agent ready"', async () => {
    const w: ChatWorld = chatWorld();
    w.gates = [];
    await open('/ai', { world: w });
    await waitFor(() => expect(sent.some((r) => r.path.endsWith('/gates'))).toBe(true));
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    expect(footNeeds()).toBe('');
    expect(screen.queryByText(READY)).toBeNull();
  });

  it('while the first reads are out: no claim', async () => {
    // The chat list and waiting-chats reads held until the end (the main region's own reads must not let them answer
    // first; the rows carry the waiting marks too).
    let release = () => {};
    const held = new Promise<void>((r) => { release = r; });
    let asked = 0;
    const hold = () => { asked++; return held.then(() => answers.ok({ items: [], meta: { total: 0, page: 1, limit: 100, omitted: 0 } })); };
    await open('/ai', {}, undefined, [chatRoutes.gates, chatRoutes.gatesHere, chatRoutes.sessions, chatRoutes.sessionsHere].map((r) => reply(r, hold)));
    await waitFor(() => expect(asked).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText(READY)).toBeNull();
    expect(footNeeds()).toBe('');
    release();
  });

  it('a successful read that found a waiting chat shows the count; a refresh paused offline keeps it and claims nothing more', async () => {
    await open('/ai');
    expect(await screen.findByText(fill(strings['foot.needs'], { count: '1' }))).toBeInTheDocument();
    try {
      onlineManager.setOnline(false);
      await act(async () => { await queryClient.refetchQueries(); });
      expect(screen.getByText(fill(strings['foot.needs'], { count: '1' }))).toBeInTheDocument();
      expect(screen.queryByText(READY)).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('nothing waiting, then a refresh paused offline: still no claim', async () => {
    const w: ChatWorld = chatWorld();
    w.gates = [];
    await open('/ai', { world: w });
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    try {
      onlineManager.setOnline(false);
      await act(async () => { await queryClient.refetchQueries(); });
      expect(footNeeds()).toBe('');
      expect(screen.queryByText(READY)).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('no string of the pane claims readiness', () => {
    expect(Object.values(strings).some((v) => READY.test(v))).toBe(false);
  });
});

describe('phones (page under 840 px)', () => {
  it('/ai is the chat list alone; a chat route shows its main screen alone with Back to chats', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
    await open('/ai');
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    expect(screen.queryByRole('heading', { name: newChatStrings.title })).toBeNull();
    cleanup();
    await open(`/ai/c/s-today?computer=${HANDLE}&realm=${PERSONAL}`);
    // The open chat's own header leads back to the list.
    expect(await screen.findByRole('button', { name: head['head.back'] })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: strings['pane.label'] })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: head['head.back'] }));
  });
});

// Below PANE_MIN_PAGE the pane is not beside the screen, so Automations' index comes above it, as
// Knowledge's does (tab.test.tsx covers the pane beside the screen).
describe('phones: the Automations index above the screen', () => {
  // A link click does not move this harness's memory router, so the click is proven in tab.test.tsx and auto-index.spec.ts:
  // here the link's target, then that route drawn at 390 px.
  it('on Workflows at 390 px the index is above the screen, with no pane; on Loops it marks Loops', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
    await open('/ai/auto/workflows');
    const index = await screen.findByRole('list', { name: strings['auto.label'] });
    expect(screen.queryByRole('navigation', { name: strings['pane.label'] })).toBeNull();
    expect(within(index).getAllByRole('link').map((a) => a.textContent)).toEqual([strings['auto.workflows'], strings['auto.loops'], strings['auto.todos']]);
    expect(within(index).getByRole('link', { name: strings['auto.workflows'] })).toHaveAttribute('aria-current', 'page');
    expect(within(index).getByRole('link', { name: strings['auto.loops'] }).getAttribute('href')?.replace(/^#/, '')).toBe('/ai/auto/loops');
    // Above the screen: the index comes before the screen's own heading in the page.
    const title = await screen.findByRole('heading', { level: 1, name: wfStrings['wf.title'] });
    expect(index.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    await open('/ai/auto/loops');
    const loops = await screen.findByRole('list', { name: strings['auto.label'] });
    expect(within(loops).getByRole('link', { name: strings['auto.loops'] })).toHaveAttribute('aria-current', 'page');
    expect(within(loops).getByRole('link', { name: strings['auto.workflows'] })).not.toHaveAttribute('aria-current');
  });

  it('a chat route at 390 px shows no group index', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
    await open(`/ai/c/s-today?computer=${HANDLE}&realm=${PERSONAL}`);
    expect(await screen.findByRole('button', { name: head['head.back'] })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: strings['auto.label'] })).toBeNull();
    expect(screen.queryByRole('list', { name: strings['knowledge.label'] })).toBeNull();
  });
});

// This computer | All computers. All computers groups every computer of the shown realm(s)
// by computer, empty ones included; nothing ever claims a computer or the list has no chats.
describe('the All computers chat list', () => {
  const [, ACME] = fixtureWorld.realms.map((r) => r.id);
  const byName = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
  const borealis = byName('borealis');
  const scopeRadio = (name: string) => screen.getByRole('radio', { name });
  const allWorld = (): ChatWorld => ({
    ...chatWorld(),
    elsewhere: { [borealis.id]: [{ id: 's-bor', realm: ACME, first_message: 'Ship the storefront', last_request_at: new Date(Date.now() - 5 * 60_000).toISOString() }] },
  });
  afterEach(() => resetChatScopeForTests());

  it('the list offers This computer and All computers; This computer is the default and lists this computer only', async () => {
    await open('/ai', { world: allWorld() }, 'all');
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    expect(scopeRadio(strings['scope.here'])).toHaveAttribute('aria-checked', 'true');
    expect(scopeRadio(strings['scope.all'])).toHaveAttribute('aria-checked', 'false');
    expect(drawn().some((x) => x.includes('s-bor'))).toBe(false);
  });

  it('All computers: each running computer is a group named by the computer; a row opens on its own computer', async () => {
    const router = await open('/ai', { world: allWorld() }, 'all');
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(scopeRadio(strings['scope.all']));
    const bor = `${borealis.id}|${ACME}/s-bor`;
    await waitFor(() => expect(rowsShown()).toContain(bor));
    expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`);
    expect(drawn()).toEqual(expect.arrayContaining(['# atlas', '# borealis']));
    // atlas (the top-bar computer) comes first.
    expect(drawn().indexOf('# atlas')).toBeLessThan(drawn().indexOf('# borealis'));
    const row = document.querySelector(`tr[data-row-id="${bor}"]`)!;
    await userEvent.click(within(row as HTMLElement).getByText('Ship the storefront'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-bor'));
    expect(router.state.location.search).toMatchObject({ computer: `borealis.${borealis.id.slice(-4)}`, realm: ACME });
  });

  it('computers the list does not read keep their group (empty, never claimed empty); each says so in its group', async () => {
    await open('/ai', { world: allWorld() }, 'all');
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(scopeRadio(strings['scope.all']));
    await waitFor(() => expect(drawn()).toEqual(expect.arrayContaining(['# cedar', '# fjord', '# dune', '# ember'])));
    // The words are each group's own (the next test), never a page-wide line.
    for (const name of ['cedar', 'fjord', 'dune', 'ember']) await waitFor(() => expect(noteAfter(name)).not.toBeNull());
    // Nothing is read from them.
    for (const name of ['cedar', 'fjord', 'dune', 'ember']) expect(sent.some((r) => r.target?.container.id === byName(name).id)).toBe(false);
  });
  // Why a computer's chats may be missing is said in its own
  // group, its first row (the kit's shared group note), never one page-wide line; only what names no computer (the
  // computer list itself) stays below the list.
  it('computers the list does not read: each group says why in its own note, with no page-wide line', async () => {
    await open('/ai', { world: allWorld() }, 'all');
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(scopeRadio(strings['scope.all']));
    for (const [name, why] of [['cedar', 'stopped'], ['fjord', 'stopped'], ['dune', 'starting'], ['ember', 'attention']] as const) {
      expect(S[`group.notRead.${why}`], `group.notRead.${why} is a string`).toBeTruthy();
      await waitFor(() => expect(noteAfter(name), `${name}'s first row is its note`).toContain(S[`group.notRead.${why}`]));
      expect(S[`group.notRead.${why}`]).not.toMatch(/\{\{name\}\}/);
    }
    // Every gap here names its computer: no page-wide line (the computer list itself was read whole).
    await new Promise((r) => setTimeout(r, PENDING_NOTE_MS + 300));
    expect(screen.queryByText(strings['list.partial'])).toBeNull();
  }, PENDING_NOTE_MS + 8000);
  // With no row at all the table draws its empty state and no group, so each computer's note names it
  // above the list (the empty state's own Refresh re-reads every computer, so the notes carry none).
  it('no chat anywhere: each computer the list does not read says why, naming itself, beside the neutral empty line', async () => {
    const w = chatWorld();
    w.elsewhere = {};
    w.sessions = [];
    w.gates = [];
    await open('/ai', { world: w }, 'all');
    // This computer has no chat either: its empty state offers the way to All computers.
    await waitFor(() => expect(screen.queryByRole('radio', { name: strings['scope.all'] }) ?? screen.queryByRole('button', { name: strings['scope.toAll'] })).not.toBeNull());
    await userEvent.click(screen.queryByRole('radio', { name: strings['scope.all'] }) ?? screen.getByRole('button', { name: strings['scope.toAll'] }));
    expect(await screen.findByText(strings['empty.none'])).toBeInTheDocument();
    for (const [name, why] of [['cedar', 'stopped'], ['dune', 'starting'], ['ember', 'attention']] as const) {
      const note = await screen.findByText(K['groupNotes.named'].replace('{{name}}', name).replace('{{note}}', S[`group.notRead.${why}`]!));
      expect(note.closest('[data-group-notes-empty]')).not.toBeNull();
    }
    expect(screen.getAllByRole('button', { name: strings['list.refresh'] })).toHaveLength(1);
  });
  it('a computer that has more chats than were read says so in its group, with a Refresh named for it, and no page-wide line', async () => {
    const w = allWorld();
    w.gates = [{ session_id: 's-wait' }, { session_id: 's-old' }];
    w.omitted = 1;
    await open('/ai', { world: w, computersOnly: ['atlas'] }, 'all');
    await userEvent.click(await screen.findByRole('radio', { name: strings['scope.all'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`));
    expect(S['group.partial'], 'group.partial is a string').toBeTruthy();
    await waitFor(() => expect(noteAfter('atlas')).toContain(S['group.partial']), { timeout: PENDING_NOTE_MS + 3000 });
    expect(screen.getByRole('button', { name: K['groupNotes.actionOn'].replace('{{action}}', strings['list.refresh']).replace('{{name}}', 'atlas') })).toBeInTheDocument();
    expect(screen.queryByText(strings['list.partial'])).toBeNull();
  });
  it('one realm: one GET /changes/stream per followed computer (atlas only here); back to This computer drops the group', async () => {
    await open('/ai', { world: allWorld() });
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    expect(gets('/changes/stream')).toHaveLength(0);
    await userEvent.click(scopeRadio(strings['scope.all']));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`));
    await waitFor(() => expect(gets('/changes/stream').length).toBeGreaterThan(0));
    expect(new Set(gets('/changes/stream').map((r) => r.target?.container.id))).toEqual(new Set([atlas.id]));
    await userEvent.click(scopeRadio(strings['scope.here']));
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    expect(drawn()).not.toContain('# atlas');
  });

  it('nothing shown and a feed refused for good: the neutral line, never "no chats"; Refresh reads it again', async () => {
    const refused = { on: true };
    await open('/ai', { world: allWorld(), streamRefused: refused });
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(scopeRadio(strings['scope.all']));
    expect(await screen.findByText(strings['empty.none'])).toBeInTheDocument();
    expect(rowsShown()).toEqual([]);
    refused.on = false;
    await userEvent.click(screen.getByRole('button', { name: strings['list.refresh'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`));
  });
  it('Show more reads the next session page of a computer in All computers', async () => {
    const w = allWorld();
    w.sessions = Array.from({ length: 60 }, (_, i) => ({ id: `s-${i}`, first_message: `chat ${i}`, cwd: '/home/ada', last_request_at: new Date(Date.now() - (i + 1) * 60_000).toISOString() }));
    w.gates = [];
    await open('/ai', { world: w }, 'all');
    await userEvent.click(await screen.findByRole('radio', { name: strings['scope.all'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-0')}`));
    expect(rowsShown()).not.toContain(`${atlas.id}|${k('s-55')}`);
    await userEvent.click(await screen.findByRole('button', { name: /^(Load more|Show more)$/ }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-55')}`));
    expect(gets('/sessions').some((r) => r.target?.container.id === atlas.id && r.query.page === '2')).toBe(true);
  });

  it('no row shown yet but a further page to read: the neutral line offers Show more, never "no chats"', async () => {
    const w = allWorld();
    // 50 drafts (never listed) fill the first page; the one chat is on page 2.
    w.sessions = [
      ...Array.from({ length: 50 }, (_, i) => ({ id: `d-${i}`, cwd: '/home/ada', started_at: new Date(Date.now() - i * 1000).toISOString(), last_request_at: new Date(Date.now() - i * 1000).toISOString() })),
      { id: 's-late', first_message: 'The late chat', cwd: '/home/ada', last_request_at: new Date(Date.now() - 86_400_000).toISOString() },
    ];
    w.gates = [];
    w.elsewhere = {};
    await open('/ai', { world: w, computersOnly: ['atlas'] });
    // This computer says the same, with the way to All computers (the kit draws no toolbar here).
    expect(await screen.findByText(strings['empty.none'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['all.showMore'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['scope.toAll'] }));
    expect(await screen.findByText(strings['empty.none'])).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: strings['all.showMore'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-late')}`));
  });
  it('a failed refresh of the computer list: the rows stay, the list says some chats may not be shown; Refresh clears it', async () => {
    const down = { on: false };
    const w = allWorld();
    w.elsewhere = {};
    setFeedConnectForTests(heldFeed(w));
    await open('/ai', { world: w, computersOnly: ['atlas'], computersDown: down });
    await userEvent.click(await screen.findByRole('radio', { name: strings['scope.all'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`));
    await waitFor(() => expect(screen.queryByText(strings['list.partial'])).toBeNull());
    down.on = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(strings['list.partial'])).toBeInTheDocument();
    expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`);
    down.on = false;
    const line = screen.getByText(strings['list.partial']).closest('[role="status"]') as HTMLElement;
    await userEvent.click(within(line).getByRole('button', { name: strings['list.refresh'] }));
    await waitFor(() => expect(screen.queryByText(strings['list.partial'])).toBeNull());
  });
  it('waiting chats past those read: All computers says some chats may not be shown, in that computer\'s group', async () => {
    const w = allWorld();
    w.gates = [{ session_id: 's-wait' }, { session_id: 's-old' }];
    w.omitted = 1;
    await open('/ai', { world: w }, 'all');
    await userEvent.click(await screen.findByRole('radio', { name: strings['scope.all'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`));
    // A read still out shows once atlas's own grace has run, so the longer wait.
    await waitFor(() => expect(noteAfter('atlas')).toContain(S['group.partial']), { timeout: PENDING_NOTE_MS + 3000 });
  });
  it('a waiting chat read by itself already shows the chat a further page holds: All computers keeps Load more', async () => {
    const w = allWorld();
    w.sessions = Array.from({ length: 51 }, (_, i) => ({ id: `s-${i}`, first_message: `chat ${i}`, cwd: '/home/ada', last_request_at: new Date(Date.now() - (i + 1) * 60_000).toISOString() }));
    w.gates = [{ session_id: 's-50' }];
    w.elsewhere = {};
    await open('/ai', { world: w, computersOnly: ['atlas'] });
    await userEvent.click(await screen.findByRole('radio', { name: strings['scope.all'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-50')}`));
    expect(rowsShown()).toHaveLength(51);
    await userEvent.click(await screen.findByRole('button', { name: /^(Load more|Show more)$/ }));
    await waitFor(() => expect(gets('/sessions').some((r) => r.target?.container.id === atlas.id && r.query.page === '2')).toBe(true));
  });

  it('the empty state keeps the way between scopes (the kit draws it without the toolbar)', async () => {
    const w = allWorld();
    w.sessions = [];
    w.gates = [];
    await open('/ai', { world: w });
    await userEvent.click(await screen.findByRole('button', { name: strings['scope.toAll'] }));
    expect(await screen.findByText(strings['empty.none'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['scope.toHere'] }));
    expect(await screen.findByRole('button', { name: strings['scope.toAll'] })).toBeInTheDocument();
  });
});

// The Hub never claims a definite "No chats". No row: one neutral line ("No chats
// shown") and Refresh. With rows: one generic notice ("Some chats may not be shown") and Refresh whenever coverage() does
// not prove the list complete; none when it does. Every case that once broke this is a row, through the real views
// on real core, in each view it applies to.
describe('coverage x view: never "No chats"; the generic notice unless proven complete', () => {
  afterEach(() => {
    resetChatScopeForTests();
    setBrowserOnline(true);
    onlineManager.setOnline(true);
  });
  type View = 'all' | 'here' | 'folder';
  type Want = 'none' | 'partial' | 'clean';
  type Ctx = { w: ChatWorld; stall: NonNullable<ChatRuleOpts['stall']> };
  // `list`: a gap that names no computer (the computer list itself), said in the line under the list in All computers
  // too; any other gap in All computers is the computer's own (atlas here), said in its group.
  type Row = { name: string; views: readonly View[]; world: (w: ChatWorld) => void; opts?: Partial<ChatRuleOpts>; before?: Want; then?: (c: Ctx) => Promise<void>; want: Want; showMore?: boolean; list?: boolean };
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const ALL3 = ['all', 'here', 'folder'] as const;
  const none = (w: ChatWorld) => { w.sessions = []; w.gates = []; };
  const one = (w: ChatWorld) => { w.sessions = [{ id: 's-1', first_message: 'chat 1', cwd: '/home/ada', last_request_at: ago(60_000) }]; w.gates = []; };
  const drafts = (w: ChatWorld) => { w.sessions = Array.from({ length: 51 }, (_, i) => ({ id: `d-${i}`, cwd: '/home/ada', started_at: ago(i * 1000), last_request_at: ago(i * 1000) })); w.gates = []; };
  const ghost = (w: ChatWorld) => { w.sessions = []; w.gates = [{ session_id: 's-ghost' }]; };
  const oneAndGhost = (w: ChatWorld) => { one(w); w.gates = [{ session_id: 's-ghost' }]; };
  const late = (w: ChatWorld) => {
    w.sessions = [];
    w.gates = [...Array.from({ length: 20 }, (_, i) => ({ session_id: `gone-${i}` })), { session_id: 's-late' }];
    w.unlisted = [{ id: 's-late', first_message: 'late chat', cwd: '/home/ada', last_request_at: ago(60_000) }];
  };
  const fiftyOne = (w: ChatWorld) => { w.sessions = Array.from({ length: 51 }, (_, i) => ({ id: `s-${i}`, first_message: `chat ${i}`, cwd: '/home/ada', last_request_at: ago((i + 1) * 60_000) })); w.gates = []; };
  // A re-read every view's reads start, never awaited (a held answer never comes).
  const refresh = () => act(async () => { void queryClient.refetchQueries(); await new Promise((r) => setTimeout(r, 80)); });
  const showMore = () => screen.findByRole('button', { name: new RegExp(`^(Load more|Show more|${strings['all.showMore']})$`) });

  const rows: Row[] = [
    { name: 'every read answered, no chat', views: ALL3, world: none, want: 'none' },
    { name: 'every read answered, one chat', views: ALL3, world: one, want: 'clean' },
    { name: 'page 2 still read (drafts on page 1)', views: ALL3, world: drafts, opts: { stall: { pages: 'pending' } }, want: 'none', showMore: true },
    { name: 'page 2 failed (drafts on page 1)', views: ALL3, world: drafts, opts: { stall: { pages: 'failed' } }, want: 'none', showMore: true },
    { name: 'gates still read', views: ALL3, world: none, opts: { stall: { gates: 'pending' } }, want: 'none' },
    { name: 'gates failed', views: ALL3, world: none, opts: { stall: { gates: 'failed' } }, want: 'none' },
    { name: 'a waiting chat read by itself still read', views: ALL3, world: ghost, opts: { stall: { waiting: 'pending' } }, want: 'none' },
    { name: 'a waiting chat read by itself failed', views: ALL3, world: ghost, opts: { stall: { waiting: 'failed' } }, want: 'none' },
    { name: 'a waiting chat gone (404)', views: ALL3, world: ghost, want: 'none' },
    // A refresh of an answer, in flight.
    { name: 'a gates refresh held in flight', views: ALL3, world: one, before: 'clean', then: async (c) => { c.stall.gates = 'pending'; await refresh(); }, want: 'partial' },
    { name: 'a session-list refresh held in flight', views: ALL3, world: one, before: 'clean', then: async (c) => { c.stall.sessions = 'pending'; await refresh(); }, want: 'partial' },
    // A waiting chat's 404, then a 500.
    { name: 'a waiting chat read 404, then 500', views: ALL3, world: oneAndGhost, before: 'clean', then: async (c) => { c.stall.waiting = 'failed'; await act(async () => { await queryClient.refetchQueries(); }); }, want: 'partial' },
    // Rows shown, page 2 failed.
    { name: 'rows shown, page 2 failed', views: ALL3, world: fiftyOne, opts: { stall: { pages: 'failed' } }, then: async () => { await userEvent.click(await showMore()); await waitFor(() => expect(gets('/sessions').some((r) => r.query.page === '2')).toBe(true)); }, want: 'partial' },
    // A containers row no computer can be built from.
    { name: 'a containers row no computer can be built from', views: ['all'], world: one, opts: { unbuildable: 1 }, want: 'partial', list: true },
    // The computer list's refresh held in flight.
    { name: 'a computer-list refresh held in flight', views: ['all'], world: one, before: 'clean', then: async (c) => { c.stall.computers = 'pending'; await refresh(); }, want: 'partial', list: true },
    // A refresh paused offline.
    // In All computers the paused refresh is the computer list's too, so the line under the list says it (atlas's group may as well).
    { name: 'a refresh paused offline', views: ALL3, world: one, before: 'clean', then: async () => { onlineManager.setOnline(false); await refresh(); }, want: 'partial', list: true },
    // No row, several gaps: every action the neutral line offers is there (Show more and Refresh).
    { name: 'no row, a further page and failed gates', views: ALL3, world: drafts, opts: { stall: { gates: 'failed' } }, want: 'none', showMore: true },
    // No row; 21 waiting chats, the first 20 gone (404), the 21st listed by no page: Refresh also takes the next
    // waiting step, so it reads the 21st and shows it (no other control reaches it here).
    { name: 'no row, the 21st waiting chat is the first visible one', views: ALL3, world: late, before: 'none', then: async () => { await userEvent.click(screen.getByRole('button', { name: strings['list.refresh'] })); await waitFor(() => expect(sent.some((r) => r.path.endsWith('/sessions/s-late'))).toBe(true)); }, want: 'clean' },
    // Answers no live change feed vouches for (a feed that fails; All's stream down), and the browser going
    // offline while every read is idle (no refresh).
    { name: 'the change feed fails', views: ALL3, world: one, opts: { stall: { feed: 'failed' } }, want: 'partial' },
    { name: 'the change feed fails after a clean answer', views: ALL3, world: one, before: 'clean', then: async (c) => { c.stall.feed = 'failed'; dropFeeds(); await refresh(); }, want: 'partial' },
    { name: 'the computer list goes stale with no re-read', views: ['all'], world: one, before: 'clean', then: async () => { await act(async () => { await queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(containersRoute.id), refetchType: 'none' }); }); }, want: 'partial', list: true },
    { name: 'offline while every read is idle', views: ALL3, world: one, before: 'clean', then: async () => { act(() => setBrowserOnline(false)); }, want: 'partial' },
  ];

  // This computer settles first (rows, or its empty state), then the way to All computers it shows: the scope control
  // with rows, the empty state's link without (the kit draws no toolbar there).
  async function toAll() {
    await waitFor(() => expect(rowsShown().length > 0 || screen.queryByText(strings['empty.none']) !== null).toBe(true));
    const radio = screen.queryByRole('radio', { name: strings['scope.all'] });
    await userEvent.click(radio ?? screen.getByRole('button', { name: strings['scope.toAll'] }));
  }

  async function openView(v: View, o: ChatRuleOpts) {
    if (v !== 'folder') {
      await open('/ai', o);
      if (v === 'all') await toAll();
      return;
    }
    function Folder({ at }: { at: ChatsAt }) {
      return <ChatList at={at} chats={useChats(at)} handle={HANDLE} computerName="atlas" folder="/home/ada" />;
    }
    function Harness() {
      const at = useChatsAt();
      return at ? <Folder at={at} /> : null;
    }
    sent = [];
    bootFixtureCore({ rules: chatRules({ ...o, onSend: (r) => sent.push(r) }) });
    act(() => chooseComputer(atlas));
    const router = createRouter({ routeTree: createRootRoute({ component: Harness }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
    await act(async () => {
      render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
      await router.load();
    });
  }

  const NO_CHATS = /^No chats (yet|on these computers)/;
  /** `group`: the computer whose group says it (All computers, a computer's own gap); else the line under the list. */
  async function expectState(want: Want, showMoreToo = false, group: string | null = null) {
    if (want === 'none') {
      expect(await screen.findByText(strings['empty.none'])).toBeInTheDocument();
      expect(screen.getByRole('button', { name: strings['list.refresh'] })).toBeInTheDocument();
      if (showMoreToo) expect(screen.getByRole('button', { name: strings['all.showMore'] })).toBeInTheDocument();
    } else {
      await waitFor(() => expect(rowsShown().length).toBeGreaterThan(0));
      if (want === 'partial' && group) {
        // The computer's own group says it, its first row, with a Refresh named for it; no line
        // under the list. A read in flight shows after the grace.
        await waitFor(() => expect(noteAfter(group)).toContain(S['group.partial']), { timeout: PENDING_NOTE_MS + 3000 });
        expect(screen.getByRole('button', { name: K['groupNotes.actionOn'].replace('{{action}}', strings['list.refresh']).replace('{{name}}', group) })).toBeInTheDocument();
        expect(screen.queryByText(strings['list.partial'])).toBeNull();
      } else if (want === 'partial') {
        // The generic notice and Refresh, in one status line (the Needs-you words, when any, come first in it).
        // A gap that is only a read in flight shows after the grace, hence the longer wait.
        const line = (await screen.findByText(strings['list.partial'], undefined, { timeout: PENDING_NOTE_MS + 3000 })).closest('[role="status"]') as HTMLElement;
        expect(within(line).getByRole('button', { name: strings['list.refresh'] })).toBeInTheDocument();
        expect(screen.getAllByRole('status').filter((el) => el.textContent?.includes(strings['list.partial']))).toHaveLength(1);
        // Under the list, never in its toolbar.
        const table = screen.getByRole('table');
        expect(table.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(table.contains(line)).toBe(false);
      } else {
        await waitFor(() => expect(screen.queryByText(strings['list.partial'])).toBeNull());
        if (group) await waitFor(() => expect(noteAfter(group)).toBeNull());
      }
    }
    expect(screen.queryByText(NO_CHATS)).toBeNull();
  }

  for (const row of rows)
    for (const v of row.views)
      it(`${v}: ${row.name} -> ${row.want === 'none' ? 'No chats shown + Refresh' : row.want === 'partial' ? 'rows + Some chats may not be shown + Refresh' : 'rows, no notice'}`, async () => {
        const w = chatWorld();
        w.elsewhere = {};
        row.world(w);
        const stall: Ctx['stall'] = { ...(row.opts?.stall ?? {}) };
        setFeedConnectForTests(heldFeed(w, stall));
        await openView(v, { world: w, computersOnly: ['atlas'], ...row.opts, stall });
        const group = v === 'all' && !row.list ? 'atlas' : null;
        if (row.before) await expectState(row.before, false, group);
        if (row.then) await row.then({ w, stall });
        await expectState(row.want, row.showMore, group);
        // Give a wrong claim every chance to show: the reads settle, the list is drawn again.
        await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
        expect(screen.queryByText(NO_CHATS)).toBeNull();
        if (row.want === 'partial') {
          if (group) expect(noteAfter(group)).toContain(S['group.partial']);
          else expect(screen.getByText(strings['list.partial'])).toBeInTheDocument();
        }
      });

  // A scope switch or a refresh whose reads are out never flashes the notice; it shows only once the read
  // has stayed out for the grace, and a gap whose reads answered shows at once.
  for (const v of ['here', 'all'] as const)
    it(`${v}: a refresh held in flight shows no notice inside the grace, then the notice under the list`, async () => {
      // In All computers atlas's gap is its group's note.
      const group = v === 'all' ? 'atlas' : null;
      const words = group ? S['group.partial']! : strings['list.partial'];
      const w = chatWorld();
      w.elsewhere = {};
      one(w);
      const stall: Ctx['stall'] = {};
      setFeedConnectForTests(heldFeed(w, stall));
      await openView(v, { world: w, computersOnly: ['atlas'], stall });
      await expectState('clean', false, group);
      stall.sessions = 'pending';
      // Controlled time from the refresh on: every check below runs, whatever the machine's load.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      await act(async () => { void queryClient.refetchQueries(); await vi.advanceTimersByTimeAsync(80); });
      const announced = () =>
        Array.from(document.querySelectorAll('[role="status"], [role="alert"], [role="log"], [aria-live]'))
          .filter((el) => el.getAttribute('aria-live') !== 'off' && el.textContent?.includes(words));
      // Inside the grace: no words, and no live region carries them (nothing is announced).
      expect(screen.queryByText(words)).toBeNull();
      expect(announced()).toHaveLength(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(PENDING_NOTE_MS - 90); }); // 1.49 s since the refresh
      expect(screen.queryByText(words)).toBeNull();
      expect(announced()).toHaveLength(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(10); }); // 1.5 s
      expect(screen.getByText(words)).toBeInTheDocument();
      vi.useRealTimers();
      await expectState('partial', false, group);
    });
  for (const v of ['here', 'all'] as const)
    it(`${v}: a gap whose reads answered (gates failed) shows at once, under the list`, async () => {
      // In All computers atlas's gap is its group's note.
      const group = v === 'all' ? 'atlas' : null;
      const words = group ? S['group.partial']! : strings['list.partial'];
      const w = chatWorld();
      w.elsewhere = {};
      one(w);
      const stall: Ctx['stall'] = { gates: 'failed' };
      setFeedConnectForTests(heldFeed(w, stall));
      await openView(v, { world: w, computersOnly: ['atlas'], stall });
      await waitFor(() => expect(rowsShown().length).toBeGreaterThan(0));
      expect(await screen.findByText(words, undefined, { timeout: PENDING_NOTE_MS - 300 })).toBeInTheDocument();
      await expectState('partial', false, group);
    });

  // A refresh paused offline is known at once (nothing can re-read anything), not after the grace.
  for (const v of ['here', 'all'] as const)
    it(`${v}: a refresh paused offline shows the notice at once, under the list`, async () => {
      // In All computers atlas's gap is its group's note.
      const group = v === 'all' ? 'atlas' : null;
      const words = group ? S['group.partial']! : strings['list.partial'];
      const w = chatWorld();
      w.elsewhere = {};
      one(w);
      const stall: Ctx['stall'] = {};
      setFeedConnectForTests(heldFeed(w, stall));
      await openView(v, { world: w, computersOnly: ['atlas'], stall });
      await expectState('clean', false, group);
      // The browser goes offline (TanStack's network mode follows the same window event and pauses the refresh).
      act(() => setBrowserOnline(false));
      await refresh();
      expect(await screen.findByText(words, undefined, { timeout: PENDING_NOTE_MS - 300 })).toBeInTheDocument();
      if (!group) await expectState('partial', false, group);
      else {
        // All computers: the computer list's own refresh is paused too, so the line under the list says it at once as
        // well, without waiting for the grace.
        expect(noteAfter(group)).toContain(words);
        expect(await screen.findByText(strings['list.partial'], undefined, { timeout: PENDING_NOTE_MS - 300 })).toBeInTheDocument();
      }
    });

  it('folder view: with a matching row shown, the notice offers Show more chats and it reads the next page', async () => {
    const w = chatWorld();
    w.elsewhere = {};
    w.sessions = Array.from({ length: 51 }, (_, i) => ({ id: `s-${i}`, first_message: `chat ${i}`, cwd: i === 0 || i === 50 ? '/home/ada' : '/srv/other', last_request_at: ago((i + 1) * 60_000) }));
    w.gates = [];
    await openView('folder', { world: w, computersOnly: ['atlas'] });
    await waitFor(() => expect(rowsShown()).toEqual([k('s-0')]));
    await userEvent.click(await screen.findByRole('button', { name: strings['all.showMore'] }));
    await waitFor(() => expect(rowsShown()).toEqual([k('s-0'), k('s-50')]));
  });

  // The Needs-you words never replace the notice: the folder page keeps its Show more chats (no total, so the
  // table offers none) and the generic line, with waiting chats beyond those read or a failed gates read.
  it('"And more waiting · " runs on into the coverage words; Show more waiting stands after them with the other actions, never inside the words', async () => {
    const w: ChatWorld = chatWorld();
    w.gates = [{ session_id: 's-wait' }, { session_id: 's-old' }];
    w.omitted = 1;
    await open('/ai', { world: w });
    await screen.findByText(strings['group.needsMore'].trim());
    screen.getByRole('button', { name: strings['group.needsMoreShow'] });
    // Reading order: the words, then the coverage line, then the button.
    const text = document.body.textContent ?? '';
    const at = (x: string) => text.indexOf(x);
    expect(at(strings['group.needsMore'])).toBeGreaterThanOrEqual(0);
    expect(at(strings['group.needsMore'] + strings['list.partial'])).toBe(at(strings['group.needsMore']));
    expect(at(strings['group.needsMoreShow'])).toBeGreaterThan(at(strings['list.partial']));
  });
  for (const needs of ['more', 'failed'] as const)
    it(`folder: one matching row, a next page, waiting ${needs === 'more' ? 'beyond those read' : 'unread (gates failed)'}: one notice with the Needs-you words, the generic line, Show more chats and Refresh`, async () => {
      const w = chatWorld();
      w.elsewhere = {};
      w.sessions = Array.from({ length: 51 }, (_, i) => ({ id: `s-${i}`, first_message: `chat ${i}`, cwd: i === 0 || i === 50 ? '/home/ada' : '/srv/other', last_request_at: ago((i + 1) * 60_000) }));
      w.gates = needs === 'more' ? Array.from({ length: 21 }, (_, i) => ({ session_id: `gone-${i}` })) : [];
      await openView('folder', { world: w, computersOnly: ['atlas'], ...(needs === 'failed' ? { stall: { gates: 'failed' } } : {}) });
      await waitFor(() => expect(rowsShown()).toEqual([k('s-0')]));
      const words = await screen.findByText(strings[needs === 'more' ? 'group.needsMore' : 'group.needsUnknown'].trim());
      const line = words.closest('[role="status"]') as HTMLElement;
      expect(within(line).getByText(strings['list.partial'])).toBeInTheDocument();
      expect(within(line).getByRole('button', { name: strings['list.refresh'] })).toBeInTheDocument();
      await userEvent.click(within(line).getByRole('button', { name: strings['all.showMore'] }));
      await waitFor(() => expect(rowsShown()).toEqual([k('s-0'), k('s-50')]));
    });

  it('All computers: a computer whose first page holds no listed chat keeps its group beside another computer\'s rows', async () => {
    const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
    const w = chatWorld();
    drafts(w);
    w.elsewhere = { [borealis.id]: [{ id: 's-bor', realm: fixtureWorld.realms[1]!.id, first_message: 'Ship the storefront', last_request_at: ago(5 * 60_000) }] };
    await open('/ai', { world: w }, 'all');
    await toAll();
    await waitFor(() => expect(rowsShown().some((x) => x.includes('s-bor'))).toBe(true));
    expect(drawn()).toEqual(expect.arrayContaining(['# atlas', '# borealis']));
    // atlas holds a further page: its own group says so, once every read answered or after the grace.
    await waitFor(() => expect(noteAfter('atlas')).toContain(S['group.partial']), { timeout: PENDING_NOTE_MS + 3000 });
  });

  it('here: waiting chats beyond those read by themselves keep the Needs you line ("And more waiting") until Show more waiting reads them', async () => {
    const w = chatWorld();
    w.gates = Array.from({ length: 25 }, (_, i) => ({ session_id: `gone-${i}` }));
    await open('/ai', { world: w });
    const goneReads = () => sent.filter((r) => /\/sessions\/gone-\d+$/.test(r.path)).length;
    await waitFor(() => expect(goneReads()).toBe(20));
    expect(await screen.findByText(strings['group.needsMore'].trim())).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['group.needsMoreShow'] }));
    await waitFor(() => expect(goneReads()).toBe(25));
    await waitFor(() => expect(screen.queryByText(strings['group.needsMore'].trim())).toBeNull());
  });

  it('no definite "No chats" text is left: the removed keys are gone from the strings and from the list', () => {
    const files = import.meta.glob(['./ChatList.tsx', './AllReads.tsx', './Pane.strings.en.json'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const removed = ['empty.title', 'empty.body', 'empty.moreTitle', 'empty.unknownTitle', 'all.empty.title', 'all.empty.body', 'all.unknown.title', 'group.needsRetry'];
    for (const [f, text] of Object.entries(files)) for (const key of removed) expect(text.includes(`'${key}'`) || text.includes(`"${key}"`), `${f} names ${key}`).toBe(false);
    expect(Object.values(strings).some((v) => NO_CHATS.test(v))).toBe(false);
  });
});

describe('the list row menu: Rename, Close and Delete, each to the row\'s own computer', () => {
  const [, ACME] = fixtureWorld.realms.map((r) => r.id);
  const byName = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
  const borealis = byName('borealis');
  const rowEl = (id: string) => document.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement;
  const renames = () => sent.filter((r) => r.method === 'PATCH' && /\/sessions\/[^/]+$/.test(r.path));
  const renameRule = reply(agent.sessionRoutes.rename, (r) => {
    sent.push(r);
    return answers.ok({ status: 'ok', name: (r.body as { name?: string } | undefined)?.name ?? '' });
  });
  const rowMenu = async (id: string) => {
    await userEvent.click(within(rowEl(id)).getByRole('button', { name: 'Row actions' }));
  };
  afterEach(() => resetChatScopeForTests());

  it('a row\'s ⋯ menu has Rename, Close and Delete; opening a dialog neither opens the chat nor sends', async () => {
    const router = await open('/ai', {}, undefined, [renameRule]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await rowMenu(k('s-today'));
    expect((await screen.findAllByRole('menuitem')).map((x) => x.textContent ?? '')).toEqual([expect.stringContaining('Rename'), expect.stringContaining('Close'), expect.stringContaining('Delete')]);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ai');
    expect(renames()).toEqual([]);
  });

  it('Rename on this computer: PATCH /sessions/<sid> to atlas with the typed name in the row\'s realm, and the list re-reads', async () => {
    await open('/ai', {}, undefined, [renameRule]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    const lists = () => sent.filter((r) => r.method === 'GET' && /\/sessions$/.test(r.path)).length;
    const before = lists();
    await rowMenu(k('s-today'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }));
    const d = await screen.findByRole('alertdialog');
    const f = within(d).getByRole('textbox');
    await userEvent.clear(f);
    await userEvent.type(f, 'Cart work');
    await userEvent.click(within(d).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(renames()).toHaveLength(1));
    expect(renames()[0]).toMatchObject({ path: expect.stringContaining('/sessions/s-today'), body: { name: 'Cart work' } });
    expect(renames()[0]!.target?.container.id).toBe(atlas.id);
    await waitFor(() => expect(lists()).toBeGreaterThan(before));
  });

  it('All computers: a borealis row\'s Rename goes to borealis, an atlas row\'s to atlas', async () => {
    const world: ChatWorld = {
      ...chatWorld(),
      elsewhere: { [borealis.id]: [{ id: 's-bor', realm: ACME, first_message: 'Ship the storefront', last_request_at: new Date(Date.now() - 5 * 60_000).toISOString() }] },
    };
    await open('/ai', { world }, 'all', [renameRule]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(screen.getByRole('radio', { name: strings['scope.all'] }));
    const bor = `${borealis.id}|${ACME}/s-bor`;
    await waitFor(() => expect(rowsShown()).toContain(bor));
    for (const [id, name] of [[bor, 'On borealis'], [`${atlas.id}|${k('s-today')}`, 'On atlas']] as const) {
      await rowMenu(id);
      await userEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }));
      const d = await screen.findByRole('alertdialog');
      const f = within(d).getByRole('textbox');
      await userEvent.clear(f);
      await userEvent.type(f, name);
      await userEvent.click(within(d).getByRole('button', { name: 'Rename' }));
      await waitFor(() => expect(renames().some((r) => (r.body as { name?: string }).name === name)).toBe(true));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    }
    const sentTo = (name: string) => renames().find((r) => (r.body as { name?: string }).name === name)!;
    expect(sentTo('On borealis').target?.container.id).toBe(borealis.id);
    expect(sentTo('On borealis').path).toContain('/sessions/s-bor');
    expect(sentTo('On atlas').target?.container.id).toBe(atlas.id);
  });
  it('All computers: a finished rename on borealis re-reads borealis\'s chats only, not atlas\'s', async () => {
    const world: ChatWorld = {
      ...chatWorld(),
      elsewhere: { [borealis.id]: [{ id: 's-bor', realm: ACME, first_message: 'Ship the storefront', last_request_at: new Date(Date.now() - 5 * 60_000).toISOString() }] },
    };
    await open('/ai', { world }, 'all', [renameRule]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(screen.getByRole('radio', { name: strings['scope.all'] }));
    const bor = `${borealis.id}|${ACME}/s-bor`;
    await waitFor(() => expect(rowsShown()).toContain(bor));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const lists = (id: string) => sent.filter((r) => r.method === 'GET' && /\/sessions$/.test(r.path) && r.target?.container.id === id).length;
    const [atlasBefore, borBefore] = [lists(atlas.id), lists(borealis.id)];
    await rowMenu(bor);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }));
    const d = await screen.findByRole('alertdialog');
    const f = within(d).getByRole('textbox');
    await userEvent.clear(f);
    await userEvent.type(f, 'Renamed');
    await userEvent.click(within(d).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(lists(borealis.id)).toBeGreaterThan(borBefore));
    expect(lists(atlas.id)).toBe(atlasBefore);
  });
  it('a list whose computer has no handle yet has no row actions (no chat identity can be built)', async () => {
    function Bare({ at }: { at: ChatsAt }) {
      return <ChatList at={at} chats={useChats(at)} handle="" computerName="atlas" folder="/home/ada/projects/shop" />;
    }
    function Harness() {
      const at = useChatsAt();
      return at ? <Bare at={at} /> : null;
    }
    sent = [];
    bootFixtureCore({ rules: chatRules({ onSend: (r) => sent.push(r) }) });
    act(() => chooseComputer(atlas));
    const router = createRouter({ routeTree: createRootRoute({ component: Harness }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
    await act(async () => {
      render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
      await router.load();
    });
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    expect(within(rowEl(k('s-today'))).queryByRole('button', { name: 'Row actions' })).toBeNull();
  });
  it('a rename that finishes after the realm moved on re-reads nothing of the new realm\'s list', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const held = reply(agent.sessionRoutes.rename, (r) => {
      sent.push(r);
      return gate.then(() => answers.ok({ status: 'ok', name: 'Late' }));
    });
    await open('/ai', {}, PERSONAL, [held]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await rowMenu(k('s-today'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }));
    const d = await screen.findByRole('alertdialog');
    const f = within(d).getByRole('textbox');
    await userEvent.clear(f);
    await userEvent.type(f, 'Late');
    await userEvent.click(within(d).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(renames()).toHaveLength(1));
    await act(async () => { setRealm(ACME!); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    const lists = () => sent.filter((r) => r.method === 'GET' && /\/sessions$/.test(r.path)).length;
    const before = lists();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    expect(lists()).toBe(before);
  });

  // Delete from the same menu.
  const deletes = () => sent.filter((r) => r.method === 'DELETE' && /\/sessions\/[^/]+$/.test(r.path));
  const deleteRule = (status: 'ok' | 404 = 'ok') => reply(agent.sessionRoutes.delete, (r) => {
    sent.push(r);
    return status === 'ok' ? answers.ok({ status: 'ok', closed: true, hard: true }) : answers.refused(404, 'not_found');
  });
  const pressDelete = async (id: string) => {
    await rowMenu(id);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    const d = await screen.findByRole('alertdialog');
    await userEvent.click(within(d).getByRole('button', { name: 'Delete chat' }));
    return d;
  };
  const listReads = (id?: string) => sent.filter((r) => r.method === 'GET' && /\/sessions$/.test(r.path) && (id === undefined || r.target?.container.id === id)).length;

  it('Delete on this computer: DELETE /sessions/<sid>?hard=true to atlas, once, and the list re-reads', async () => {
    await open('/ai', {}, undefined, [deleteRule()]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    const before = listReads();
    await pressDelete(k('s-today'));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]).toMatchObject({ path: expect.stringContaining('/sessions/s-today') });
    expect(deletes()[0]!.target?.container.id).toBe(atlas.id);
    await waitFor(() => expect(listReads()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deletes()).toHaveLength(1);
  });
  it('a delete answered 404 re-reads the list too, and says nothing was deleted', async () => {
    await open('/ai', {}, undefined, [deleteRule(404)]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    const before = listReads();
    const d = await pressDelete(k('s-today'));
    await waitFor(() => expect(within(d).getByText('This chat could not be found for you. Nothing was deleted.')).toBeInTheDocument());
    await waitFor(() => expect(listReads()).toBeGreaterThan(before));
  });
  it('All computers: a borealis row\'s Delete goes to borealis and re-reads borealis\'s chats only', async () => {
    const world: ChatWorld = {
      ...chatWorld(),
      elsewhere: { [borealis.id]: [{ id: 's-bor', realm: ACME, first_message: 'Ship the storefront', last_request_at: new Date(Date.now() - 5 * 60_000).toISOString() }] },
    };
    await open('/ai', { world }, 'all', [deleteRule()]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(screen.getByRole('radio', { name: strings['scope.all'] }));
    const bor = `${borealis.id}|${ACME}/s-bor`;
    await waitFor(() => expect(rowsShown()).toContain(bor));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const [atlasBefore, borBefore] = [listReads(atlas.id), listReads(borealis.id)];
    await pressDelete(bor);
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]!.target?.container.id).toBe(borealis.id);
    expect(deletes()[0]!.path).toContain('/sessions/s-bor');
    await waitFor(() => expect(listReads(borealis.id)).toBeGreaterThan(borBefore));
    expect(listReads(atlas.id)).toBe(atlasBefore);
  });
  it('a delete that finishes after the realm moved on re-reads nothing of the new realm\'s list', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const held = reply(agent.sessionRoutes.delete, (r) => {
      sent.push(r);
      return gate.then(() => answers.ok({ status: 'ok', closed: true, hard: true }));
    });
    await open('/ai', {}, PERSONAL, [held]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await pressDelete(k('s-today'));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    await act(async () => { setRealm(ACME!); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    const before = listReads();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    expect(listReads()).toBe(before);
  });
  it('All computers: a delete that finishes after the realm moved on re-reads nothing of the new realm\'s lists', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const held = reply(agent.sessionRoutes.delete, (r) => {
      sent.push(r);
      return gate.then(() => answers.ok({ status: 'ok', closed: true, hard: true }));
    });
    await open('/ai', {}, PERSONAL, [held]);
    await waitFor(() => expect(rowsShown()).toContain(k('s-today')));
    await userEvent.click(screen.getByRole('radio', { name: strings['scope.all'] }));
    await waitFor(() => expect(rowsShown()).toContain(`${atlas.id}|${k('s-today')}`));
    await pressDelete(`${atlas.id}|${k('s-today')}`);
    await waitFor(() => expect(deletes()).toHaveLength(1));
    await act(async () => { setRealm(ACME!); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    const before = listReads();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    expect(listReads()).toBe(before);
  });
});
