// Knowledge → Memory on a live page: the real core over a fake fetch. The realm band words each data-host state and
// both read failures; the library shows rows only under a status that says a store resolved (never an empty library for
// an off, degraded, cold or unreadable realm); every request names the realm; edits, deletes and on/off are sent once,
// and a lost answer is held until a fresh read proves it (a delete: the record gone AND the realm's status answering).
// eslint-disable-next-line no-restricted-imports -- a router harness for the view's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorInfo, onPending, queryClient } from '@core';
import { boot, calls, onFetch, R2, type Reply } from '@core/test/env';
import { interpolate } from '@kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MemoryView, { realmWord } from './Memory';
import { SEARCH_PAUSE_MS, searchErrorOf } from './data';
import strings from './Memory.strings.en.json';
import adminStrings from './Admin.strings.en.json';
import { pin } from '@core/realm';
import { bump, setRealm, setTarget } from '@core/ctx';
import { guarded, heldChanges, holdOfLock, lockBase, pendingOf, release, reloadChangesForTests } from '@core/changes';
import { CHANGE_STORE_KEY } from '@core/change-store';
import { varsDigest } from '@core/query';

// One user-event instance with no delay between keystrokes: typing does not wait on a timer per character.
const user = userEvent.setup({ delay: null });

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
// The realm band's words (kit/agent/RealmBand.strings.en.json; pages reach the kit only through @kit).
const band = {
  leader: "stored on {{host}} (this realm's memory host)",
  follower: "stored on {{host}} (this realm's memory host)",
  electing: "Choosing this realm's memory host…",
  unavailable: 'Memory host unavailable right now',
  stuck: 'Choosing a memory host is stuck',
  not_realm_member: '{{computer}} is not a member of realm {{realm}}',
  fleet_disabled: 'Shared memory is off on {{computer}}; memory is local',
  realm_blocked: 'Memory for realm {{realm}} is blocked',
  unreachable: 'Cannot reach memory right now',
  on: 'memory on',
  off: 'memory off',
  details: 'Details',
} as const;
const P = 'proj_shop';
type Over = Partial<Record<'host' | 'status' | 'projects' | 'items' | 'item' | 'edit' | 'create' | 'remove' | 'enabled' | 'search' | 'graph', (c: { url: URL; method: string; body: unknown }) => Reply | Promise<Reply> | undefined>>;
let over: Over = {};
let host: Record<string, unknown> = {};
let status: Record<string, unknown> = {};
// The memory store as the daemon keeps it: records by id in its Go spelling (getMemoryItem sends the struct without
// json names). An edit of content or type makes a NEW record (version+1, ParentID = the edited id) and the edited one
// stops being the latest; a strength-only edit keeps the id; editing a superseded record is refused.
let store: Map<string, Record<string, unknown>> = new Map();
let clock = 0;
/** The fake agent beforeEach installs; a test that boots again (another realm) installs it again. */
let fake: Parameters<typeof onFetch>[0];
const latestMemories = () =>
  [...store.values()]
    .filter((r) => r.IsLatest === true)
    .sort((a, b) => String(b.UpdatedAt).localeCompare(String(a.UpdatedAt)))
    .map((r) => ({ id: r.ID, type: r.Type, title: r.Title, strength: r.Strength, version: r.Version, updated_at: r.UpdatedAt }));
/** Applies a PATCH as the daemon does; returns its answer. A lesson changes in place (content, context, confidence); a
 *  memory's content, type, concepts or files edit makes a new version, its strength, tier and expiry change in place
 *  (ttl_days 0 clears the expiry, N sets it N days from now). */
function applyEdit(id: string, body: Record<string, unknown>): Reply {
  const old = store.get(id);
  if (!old) return { status: 404, body: { error: 'not found', code: 'not_found' } };
  if (body.kind === 'lesson') {
    store.set(id, {
      ...old,
      ...(typeof body.content === 'string' ? { Content: body.content } : {}),
      ...(typeof body.context === 'string' ? { Context: body.context } : {}),
      ...(typeof body.confidence === 'number' ? { Confidence: body.confidence } : {}),
    });
    return { status: 200, body: { status: 'ok', id } };
  }
  if (old.IsLatest !== true) return { status: 409, body: { error: `memory ${id} was changed or replaced by another edit; read the latest version and edit that`, code: 'memory_edit_conflict' } };
  const at = `2026-10-28T00:00:${String(10 + clock++).padStart(2, '0')}Z`;
  const content = typeof body.content === 'string' ? body.content : old.Content;
  const type = typeof body.type === 'string' ? body.type : old.Type;
  const strength = typeof body.strength === 'number' ? body.strength : old.Strength;
  const concepts = Array.isArray(body.concepts) ? body.concepts : old.Concepts;
  const files = Array.isArray(body.files) ? body.files : old.Files;
  const tier = typeof body.tier === 'string' ? body.tier : old.Tier;
  const forget = typeof body.ttl_days === 'number' ? (body.ttl_days <= 0 ? null : new Date(Date.now() + body.ttl_days * 86_400_000).toISOString()) : old.ForgetAfter;
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (content !== old.Content || type !== old.Type || !same(concepts, old.Concepts) || !same(files, old.Files)) {
    const nid = `${id}v${Number(old.Version) + 1}`;
    store.set(id, { ...old, IsLatest: false });
    store.set(nid, { ...old, ID: nid, Content: content, Type: type, Strength: strength, Concepts: concepts, Files: files, Tier: tier, ForgetAfter: forget, Version: Number(old.Version) + 1, ParentID: id, IsLatest: true, UpdatedAt: at });
    return { status: 200, body: { status: 'ok', id: nid, version: Number(old.Version) + 1, superseded: id } };
  }
  store.set(id, { ...old, Strength: strength, Tier: tier, ForgetAfter: forget, UpdatedAt: at });
  return { status: 200, body: { status: 'ok', id, version: old.Version, superseded: old.ParentID } };
}
/** Applies a POST as the daemon's Save does: a new first version (content trimmed, strength 0 = 7, ttl_days N > 0 sets
 *  the expiry); answers its id. Every save is a new record. */
let saved = 0;
function applyCreate(body: Record<string, unknown>): Reply {
  // Made now (the proof compares its creation time with the Save time); later saves sort first.
  const at = new Date(Date.now() + clock++ * 1000).toISOString();
  const id = `n${++saved}`;
  const content = String(body.content ?? '').trim();
  const ttl = typeof body.ttl_days === 'number' ? body.ttl_days : 0;
  store.set(id, {
    ID: id, Project: body.project, Type: body.type || 'fact', Title: content, Content: content,
    Strength: typeof body.strength === 'number' && body.strength !== 0 ? body.strength : 7,
    Concepts: Array.isArray(body.concepts) && body.concepts.length ? body.concepts : null,
    Files: Array.isArray(body.files) && body.files.length ? body.files : null,
    Version: 1, ParentID: '', IsLatest: true, Tier: 'working', CreatedAt: at, UpdatedAt: at,
    ForgetAfter: ttl > 0 ? new Date(Date.now() + ttl * 86_400_000).toISOString() : null,
  });
  return { status: 200, body: { status: 'ok', id, type: body.type || 'fact', title: content, version: 1, superseded: '' } };
}
const editedId = (url: URL) => decodeURIComponent(url.pathname.split('/').at(-1) ?? '');

// An account route's address is relative (/api/v1/…, the computer list under All realms), an agent's is absolute: both read against a base.
const u = (s: string) => new URL(s, 'https://h.invalid');
const mem = () => calls.filter((c) => u(c.url).pathname.includes('/agent/memory'));
const of = (method: string, tail: string) => mem().filter((c) => c.method === method && u(c.url).pathname.endsWith(tail));
const changes = () => mem().filter((c) => c.method !== 'GET');
// The clock is a fake one (beforeEach). A flush moves it by hand: 20 turns of 30 ms, each inside act, each running the
// timers that came due and the promises behind them (600 ms in all, as the 600 real 1 ms turns it once waited through).
// A SHA-256 (core's change keys and query digests) answers from a worker thread, on its own time, not the clock's:
// the ones in flight are kept here, and a flush waits for them instead of for time to pass.
const digests = new Set<Promise<unknown>>();
const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
      while (digests.size > 0) {
        await Promise.allSettled([...digests]);
        await vi.advanceTimersByTimeAsync(0);
      }
    });
  }
};
async function show(at = '/ai/knowledge/memory') {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <MemoryView computer="atlas" /> }),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
  return router;
}
const inProject = () => show(`/ai/knowledge/memory?project=${P}`);
const bandText = () => document.querySelector('[data-band-text]')?.textContent ?? '';
const word = realmWord(R1);

beforeEach(() => {
  // Timers, intervals and both clocks are fake and still move with real time (a waitFor or a real pause passes as
  // before); flush() moves them without waiting.
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation((...a: Parameters<SubtleCrypto['digest']>) => {
    const d = digest(...a);
    digests.add(d);
    const done = () => { digests.delete(d); };
    d.then(done, done);
    return d;
  });
  boot({ realm: R1 });
  queryClient.clear();
  over = {};
  host = { status: 'ok', datahost: { realm: R1, state: 'leader', host: 'c1', self_id: 'c1', can_use_self: true, hosts: [{ id: 'c1', name: 'atlas', is_current: true, is_self: true }, { id: 'c2', name: 'borealis', is_current: false, is_self: false }] } };
  status = { enabled: true, available: true, degraded: false, recoverable: false, remote: true, last_consolidated: 'never' };
  clock = 0;
  saved = 0;
  store = new Map([
    ['m1', { ID: 'm1', Type: 'decision', Title: 'Deploys go through staging first', Content: 'Deploys go through staging first.', Strength: 8, Version: 2, ParentID: 'm0', IsLatest: true, Concepts: ['deploy'], Files: null, CreatedAt: '2026-10-20T08:00:00Z', UpdatedAt: '2026-10-27T08:00:00Z', ForgetAfter: '0001-01-01T00:00:00Z' }],
    ['m2', { ID: 'm2', Type: 'gotcha', Title: 'The test DB resets nightly', Content: 'The test DB resets every night.', Strength: 3, Version: 1, ParentID: '', IsLatest: true, Concepts: [], Files: [], CreatedAt: '2026-10-26T08:00:00Z', UpdatedAt: '2026-10-26T08:00:00Z' }],
  ]);
  onFetch(fake = (c) => {
    const url = u(c.url);
    const p = url.pathname;
    const x = { url, method: c.method, body: c.body };
    const hit = (k: keyof Over, d: () => Reply): Reply | Promise<Reply> => over[k]?.(x) ?? d();
    if (p.endsWith('/memory/datahost')) return hit('host', () => ({ status: 200, body: host }));
    if (p.endsWith('/memory/status')) return hit('status', () => ({ status: 200, body: status }));
    if (p.endsWith('/memory/projects')) {
      return hit('projects', () => ({ status: 200, body: { items: [
        { key: '', root: '', memories: 4, observations: 0, sessions: 0, lessons: 0, slots: 0 },
        { key: P, root: '/home/ada/projects/shop', memories: 2, observations: 5, sessions: 3, lessons: 1, slots: 0, updated_at: '2026-10-27T08:00:00Z' },
      ], meta: { total: 2 } } }));
    }
    if (p.endsWith('/memory/graph')) return hit('graph', () => ({ status: 200, body: graphPage(url) }));
    if (p.endsWith('/memory/enabled')) return hit('enabled', () => ({ status: 200, body: { status: 'ok' } }));
    // The agent's ranked search: memories whose title holds a word of the query, the most matching words first (a
    // stand-in for its BM25 + vector + graph fusion; the page reads only the order and the heads).
    if (p.endsWith('/memory/search') && c.method === 'POST') {
      return hit('search', () => {
        const b = c.body as { query?: string; kinds?: string[] };
        if (!b.kinds?.includes('memory')) return { status: 200, body: { status: 'ok', hits: [] } };
        const words = String(b.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        const score = (t: string) => {
          const low = t.toLowerCase();
          let n = 0;
          for (const w of words) if (low.includes(w)) n++;
          return n;
        };
        const hits = latestMemories().filter((m) => score(String(m.title)) > 0).sort((a, z) => score(String(z.title)) - score(String(a.title)))
          .map((m) => ({ kind: 'memory', id: m.id, score: score(String(m.title)) / 10, bm25_rank: 1, vec_rank: 0, graph_rank: 0, type: m.type, title: m.title, narrative: '', ts: m.updated_at, importance: m.strength }));
        return { status: 200, body: { status: 'ok', hits } };
      });
    }
    if (p.endsWith('/memory/items') && c.method === 'POST') return hit('create', () => applyCreate(c.body as Record<string, unknown>));
    if (p.endsWith('/memory/items') && c.method === 'DELETE') return hit('remove', () => ({ status: 200, body: { status: 'ok', deleted: 1 } }));
    if (p.endsWith('/memory/items')) {
      return hit('items', () => {
        const kind = url.searchParams.get('kind');
        if (kind === 'lesson') return { status: 200, body: { items: [{ ID: 7, Content: 'Ask before rotating keys', Confidence: 0.9, UpdatedAt: '2026-10-25T00:00:00Z' }], meta: { total: 1, page: 1, limit: 50 } } };
        if (kind !== 'memory') return { status: 200, body: { items: [], meta: { total: 0, page: 1, limit: 50 } } };
        const q = url.searchParams.get('query');
        const all = latestMemories();
        const rows = q ? all.filter((m) => String(m.title).includes(q)) : all;
        return { status: 200, body: { items: rows, meta: { total: rows.length, page: 1, limit: 50 } } };
      });
    }
    if (/\/memory\/items\/[^/]+$/.test(p) && c.method === 'PATCH') return hit('edit', () => applyEdit(editedId(url), c.body as Record<string, unknown>));
    if (/\/memory\/items\/[^/]+$/.test(p)) {
      return hit('item', () => {
        const record = store.get(editedId(url));
        return record ? { status: 200, body: { status: 'ok', record } } : { status: 404, body: { error: 'not found', code: 'not_found' } };
      });
    }
    return { status: 404, body: {} };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  digests.clear();
  vi.useRealTimers();
});

// The relation graph as the agent keeps it (structs without json names): a page of entities by link
// count, most first, and only the relations whose two ends are on that page.
const gNodes = [
  { ID: 'n1', Project: P, Type: 'tool', Name: 'bun', NormalizedName: 'bun', Degree: 3, LastSeenAt: '2026-10-27T08:00:00Z' },
  { ID: 'n2', Project: P, Type: 'file', Name: 'deploy.sh', NormalizedName: 'deploy.sh', Degree: 2, LastSeenAt: '2026-10-26T08:00:00Z' },
  { ID: 'n3', Project: P, Type: 'person', Name: 'ada', NormalizedName: 'ada', Degree: 1, LastSeenAt: '' },
  { ID: 'n4', Project: P, Type: 'tool', Name: 'docker', NormalizedName: 'docker', Degree: 0, LastSeenAt: '2026-10-20T08:00:00Z' },
];
const gEdges = [
  { ID: 'e1', Project: P, SourceID: 'n2', TargetID: 'n1', Type: 'uses', Weight: 2 },
  { ID: 'e2', Project: P, SourceID: 'n3', TargetID: 'n2', Type: 'edits', Weight: 1 },
  { ID: 'e3', Project: P, SourceID: 'n1', TargetID: 'nX', Type: 'calls', Weight: 1 },
];
let graphExtra: Record<string, unknown> = {};
let graphNodes: typeof gNodes = gNodes;
let graphEdges: typeof gEdges = gEdges;
function graphPage(url: URL) {
  const type = url.searchParams.get('node_type');
  const limit = Number(url.searchParams.get('limit') ?? 500);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const all = graphNodes.filter((n) => !type || n.Type === type);
  const nodes = all.slice(offset, offset + limit);
  const on = new Set(nodes.map((n) => n.ID));
  const edges = graphEdges.filter((e) => on.has(e.SourceID) && on.has(e.TargetID));
  const byType: Record<string, number> = {};
  for (const n of graphNodes) byType[n.Type] = (byType[n.Type] ?? 0) + 1;
  return {
    // Go's nil slices: no entities, or no relations among them, are sent as null.
    status: 'ok', nodes: nodes.length > 0 ? nodes : null, edges: edges.length > 0 ? edges : null, limit, offset, truncated: all.length > nodes.length, from_snapshot: false, dirty: false, warning: '',
    stats: { TotalNodes: graphNodes.length, TotalEdges: graphEdges.length, NodesByType: byType, EdgesByType: { uses: 1, edits: 1, calls: 1 } },
    ...graphExtra,
  };
}

describe('the realm', () => {
  it('All realms with the computer\'s realms not told reads nothing and asks for a realm', async () => {
    boot({});
    queryClient.clear();
    await show();
    expect(screen.getByText(strings['allRealms.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['allRealms.body'])).toBeInTheDocument();
    expect(mem()).toHaveLength(0);
  });

  // Under All realms the page reads the current computer's own realm (aiRealm.ts): the computer list says it.
  const allRealmsWith = (realmIds: string[]) => {
    boot({});
    queryClient.clear();
    const agent = fake;
    onFetch((c) => (c.method === 'GET' && u(c.url).pathname.endsWith('/computers')
      ? { status: 200, body: { data: { computers: [{ id: 'c1', name: 'atlas', realm_ids: realmIds }] } } }
      : agent(c)));
  };

  it('All realms, the computer in one realm: reads that realm, no question', async () => {
    allRealmsWith([R1]);
    await inProject();
    await screen.findByText('Deploys go through staging first');
    expect(screen.queryByText(strings['allRealms.title'])).toBeNull();
    expect(mem().length).toBeGreaterThan(0);
    for (const c of mem()) expect(u(c.url).searchParams.get('realm')).toBe(R1);
  });

  it('All realms, the computer in no realm: reads Global, no question', async () => {
    allRealmsWith([]);
    await show();
    expect(screen.queryByText(strings['allRealms.title'])).toBeNull();
    await waitFor(() => expect(mem().length).toBeGreaterThan(0));
    for (const c of mem()) expect(u(c.url).searchParams.get('realm')).toBe('global');
  });

  it('All realms, the computer in several realms: reads nothing and asks for a realm', async () => {
    allRealmsWith([R1, R2]);
    await show();
    expect(screen.getByText(strings['allRealms.title'])).toBeInTheDocument();
    expect(mem()).toHaveLength(0);
  });

  it('every request names the realm shown', async () => {
    await inProject();
    await screen.findByText('Deploys go through staging first');
    expect(mem().length).toBeGreaterThan(3);
    for (const c of mem()) expect(u(c.url).searchParams.get('realm')).toBe(R1);
  });

  it('the band says where memory is kept and that it is on', async () => {
    await show();
    expect(bandText()).toBe(`Realm ${word} · ${interpolate(band.leader, { host: 'atlas' })} · ${band.on}`);
  });

  it('a follower names the serving host by its name', async () => {
    host = { status: 'ok', datahost: { realm: R1, state: 'follower', host: 'c2', self_id: 'c1', hosts: [{ id: 'c1', name: 'atlas', is_self: true }, { id: 'c2', name: 'borealis', is_current: true }] } };
    await show();
    expect(bandText()).toContain(interpolate(band.follower, { host: 'borealis' }));
  });

  it.each(['electing', 'unavailable', 'stuck', 'not_realm_member', 'fleet_disabled', 'realm_blocked'] as const)('the %s state has its own words in the band', async (state) => {
    host = { status: 'ok', datahost: { realm: state === 'fleet_disabled' || state === 'realm_blocked' ? '' : R1, state, hosts: [] } };
    await show();
    expect(bandText()).toContain(interpolate(band[state], { realm: word, computer: 'atlas' }));
  });

  it('a data-host answer outside the eight states is a failed read, never a state', async () => {
    host = { status: 'ok', datahost: { state: 'mystery' } };
    await show();
    expect(bandText()).toContain(band.unreachable);
  });
});

describe('the library never reads as empty when memory cannot be read', () => {
  const nothing = () => [strings['st.empty.title'], strings['st.off.title']].map((s) => interpolate(s, { realm: word }));

  it('503 (memory not connected here): the agreed sentence in the band and the list, Try again, no rows read', async () => {
    over.status = () => ({ status: 503, body: { error: 'memory unavailable', code: 'service_unavailable' }, headers: { 'Retry-After': '5' } });
    over.host = () => ({ status: 503, body: { error: 'memory unavailable', code: 'service_unavailable' }, headers: { 'Retry-After': '5' } });
    await show();
    expect(bandText()).toBe(`Memory for realm ${word} is not connected on atlas right now. It connects while the realm is in use on atlas.`);
    expect(screen.getByText(interpolate(strings['st.cold.title'], { realm: word, computer: 'atlas' }))).toBeInTheDocument();
    for (const n of nothing()) expect(screen.queryByText(n)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(of('GET', '/memory/projects')).toHaveLength(0);
    expect(of('GET', '/memory/items')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0);
  });

  it('any other failure: "Cannot reach memory right now", Try again reads again, no rows read', async () => {
    over.status = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    over.host = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await show();
    expect(bandText()).toBe(band.unreachable);
    expect(screen.getAllByText(strings['st.unreachable.title']).length).toBe(2);
    for (const n of nothing()) expect(screen.queryByText(n)).toBeNull();
    expect(of('GET', '/memory/projects')).toHaveLength(0);
    const before = of('GET', '/memory/status').length;
    delete over.status;
    await user.click(screen.getAllByRole('button', { name: /try again/i })[0]!);
    await flush();
    expect(of('GET', '/memory/status').length).toBeGreaterThan(before);
    expect(await screen.findByText('shop')).toBeInTheDocument();
  });

  it('a degraded store says so (with the agent’s remedy), never empty, no rows read', async () => {
    status = { enabled: true, available: false, degraded: true, recoverable: true, reason: 'host_unreachable', remedy: 'The memory host is unreachable.' };
    await show();
    expect(screen.getByText(interpolate(strings['st.degraded.title'], { realm: word }))).toBeInTheDocument();
    expect(screen.getByText('The memory host is unreachable.')).toBeInTheDocument();
    for (const n of nothing()) expect(screen.queryByText(n)).toBeNull();
    expect(of('GET', '/memory/projects')).toHaveLength(0);
  });

  it('a degraded store with no remedy says plainly what to do: Try again in a moment, nothing changed, never reload', async () => {
    status = { enabled: true, available: false, degraded: true, recoverable: true };
    await show();
    const state = screen.getByText(interpolate(strings['st.degraded.title'], { realm: word })).closest('[role="alert"]') as HTMLElement;
    expect(within(state).getByText(strings['st.degraded.body'])).toBeInTheDocument();
    expect(state.textContent).not.toMatch(/reload/i);
    const before = of('GET', '/memory/status').length;
    await user.click(within(state).getByRole('button', { name: /try again/i }));
    await flush();
    expect(of('GET', '/memory/status').length).toBeGreaterThan(before);
  });

  it('a degraded store that cannot recover offers no Try again and does not ask for one', async () => {
    status = { enabled: true, available: false, degraded: true, recoverable: false };
    await show();
    const state = screen.getByText(interpolate(strings['st.degraded.title'], { realm: word })).closest('[role="alert"]') as HTMLElement;
    expect(within(state).getByText(strings['st.degraded.bodyFixed'])).toBeInTheDocument();
    expect(within(state).queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('an off realm says memory is off (the agent lists an off realm as an empty page: not read)', async () => {
    status = { enabled: false, available: false, degraded: false, recoverable: false };
    await show();
    expect(screen.getByText(interpolate(strings['st.off.title'], { realm: word }))).toBeInTheDocument();
    expect(bandText().endsWith(band.off)).toBe(true);
    expect(of('GET', '/memory/projects')).toHaveLength(0);
    expect(of('GET', '/memory/items')).toHaveLength(0);
  });

  it('a status answer without its three facts is a failed read, not an empty library', async () => {
    status = { enabled: true };
    await show();
    expect(screen.getAllByText(strings['st.unreachable.title']).length).toBeGreaterThan(0);
    expect(of('GET', '/memory/projects')).toHaveLength(0);
  });

  it('a malformed items page is an error, not "no memories"', async () => {
    over.items = () => ({ status: 200, body: { items: [{ title: 'no id' }], meta: { total: 1 } } });
    await inProject();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0));
    expect(screen.queryByText(strings['empty.memory'])).toBeNull();
  });
});

describe('browse and search', () => {
  it('lists the named projects and the realm-wide row, and opens one', async () => {
    const router = await show();
    expect(await screen.findByText('shop')).toBeInTheDocument();
    expect(screen.getAllByRole('row').filter((r) => r.closest('tbody')).length).toBe(2);
    expect(screen.getByText(strings['p.wide'])).toBeInTheDocument();
    await user.click(screen.getByText('shop'));
    await flush();
    expect(router.state.location.search).toMatchObject({ project: P });
    expect(await screen.findByText('Deploys go through staging first')).toBeInTheDocument();
    const read = of('GET', '/memory/items').at(-1)!;
    expect(u(read.url).searchParams.get('project')).toBe(P);
    expect(u(read.url).searchParams.get('kind')).toBe('memory');
  });

  it('the stores switch by kind; lessons read in the Go spelling; lessons have no search', async () => {
    await inProject();
    await screen.findByText('Deploys go through staging first');
    await user.type(screen.getByRole('searchbox'), 'staging');
    await waitFor(() => expect(of('POST', '/memory/search').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    await user.click(screen.getAllByRole('radio', { name: strings['kind.lesson'] })[0]!);
    expect(await screen.findByText('Ask before rotating keys')).toBeInTheDocument();
    const last = of('GET', '/memory/items').at(-1)!;
    expect(u(last.url).searchParams.get('kind')).toBe('lesson');
    expect(u(last.url).searchParams.has('query')).toBe(false);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('a project this realm does not hold says so, and its library still opens (nothing listed by mistake as gone)', async () => {
    await show('/ai/knowledge/memory?project=gone');
    expect(await screen.findByText(interpolate(strings['p.unknown.band'], { name: 'gone' }))).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('no library column offers a sort the agent cannot do', async () => {
    await inProject();
    await screen.findByText('Deploys go through staging first');
    const heads = screen.getAllByRole('columnheader');
    expect(heads.length).toBeGreaterThan(2);
    for (const h of heads) {
      expect(h.getAttribute('aria-sort')).toBeNull();
      expect(within(h).queryByRole('button')).toBeNull();
    }
  });
});

const openM1 = async () => {
  await show(`/ai/knowledge/memory?project=${P}&sel=m1`);
  await screen.findByRole('heading', { name: 'Deploys go through staging first' });
};

describe('edit (sent once, C9)', () => {
  it('a memory edit sends content, type and strength with the realm twice-named (query and expect_realm), once', async () => {
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, 'Deploys always go through staging.');
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    const c = of('PATCH', '/memory/items/m1')[0]!;
    expect(u(c.url).searchParams.get('realm')).toBe(R1);
    expect(c.body).toEqual({ project: P, kind: 'memory', content: 'Deploys always go through staging.', expect_realm: R1 });
    expect(changes()).toHaveLength(1);
  });

  it('an empty edit cannot be sent', async () => {
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.edit }));
    await user.clear(await screen.findByRole('textbox', { name: strings['edit.content'] }));
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    expect(changes()).toHaveLength(0);
  });

  it('a lost edit answer is held (never failed, never resent) while no read shows the values', async () => {
    over.edit = () => ({ status: 0, network: true });
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, 'New words');
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(screen.getByRole('button', { name: strings.edit })).toBeDisabled();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    // A read that does not show the values keeps it held.
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(changes()).toHaveLength(1);
  });

  it('a realm_mismatch refusal is failed (nothing written), not unknown', async () => {
    over.edit = () => ({ status: 409, body: { error: 'realm mismatch', code: 'realm_mismatch' } });
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.type(box, '!');
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
  });

  it('observations have no Edit', async () => {
    over.items = ({ url }) => (url.searchParams.get('kind') === 'observation' ? { status: 200, body: { items: [{ id: 'o1', ts: '2026-10-27T00:00:00Z', title: 'Ran the tests', tool_name: 'bash' }], meta: { total: 1 } } } : undefined);
    over.item = () => ({ status: 200, body: { record: { ID: 'o1', Title: 'Ran the tests', ToolName: 'bash' } } });
    await show(`/ai/knowledge/memory?project=${P}&kind=observation&sel=o1`);
    await screen.findByRole('heading', { name: 'Ran the tests' });
    expect(screen.queryByRole('button', { name: strings.edit })).toBeNull();
    expect(screen.getByRole('button', { name: strings.del })).toBeInTheDocument();
  });
});

const editTo = async (text: string) => {
  await user.click(screen.getByRole('button', { name: strings.edit }));
  const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
  await user.clear(box);
  await user.type(box, text);
  await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
  await flush();
};
const selOf = (router: Awaited<ReturnType<typeof show>>) => (router.state.location.search as Record<string, unknown>).sel;

describe('edits follow the record’s new version', () => {
  it('a saved content edit opens the new version the agent answered; the next edit goes to it', async () => {
    const router = await show(`/ai/knowledge/memory?project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await editTo('Deploys always go through staging.');
    await waitFor(() => expect(selOf(router)).toBe('m1v3'));
    expect(await screen.findByText('Deploys always go through staging.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.edit })).toBeEnabled();
    await editTo('Deploys go through staging, always.');
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(of('PATCH', '/memory/items/m1v3')).toHaveLength(1);
    await waitFor(() => expect(selOf(router)).toBe('m1v3v4'));
    expect(screen.queryByText(/no longer the latest/)).toBeNull();
  });

  it('a strength-only edit keeps the record’s id', async () => {
    const router = await show(`/ai/knowledge/memory?project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await user.click(screen.getByRole('button', { name: strings.edit }));
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['edit.strength']) }));
    await user.click(await screen.findByRole('option', { name: '5' }));
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(of('PATCH', '/memory/items/m1')[0]!.body).toEqual({ project: P, kind: 'memory', content: 'Deploys go through staging first.', strength: 5, expect_realm: R1 });
    expect(selOf(router)).toBe('m1');
    expect(store.get('m1')!.Strength).toBe(5);
  });

  it('a lost content-edit answer is proved by its successor (parent = the edited record, every value shown) and opens it, nothing resent', async () => {
    over.edit = ({ url, body }) => {
      applyEdit(editedId(url), body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    const router = await show(`/ai/knowledge/memory?project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await editTo('New words');
    await waitFor(() => expect(selOf(router)).toBe('m1v3'));
    expect(await screen.findByText('New words')).toBeInTheDocument();
    expect(screen.queryByText(strings['edit.held'])).toBeNull();
    expect(changes()).toHaveLength(1);
    expect(of('GET', '/memory/items/m1v3').length).toBeGreaterThan(0);
  });

  it('a successor showing other words (someone else’s edit) proves nothing: the edit stays held', async () => {
    over.edit = ({ url }) => {
      applyEdit(editedId(url), { content: 'Words from elsewhere' });
      return { status: 0, network: true };
    };
    const router = await show(`/ai/knowledge/memory?project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await editTo('New words');
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(selOf(router)).toBe('m1');
    expect(changes()).toHaveLength(1);
  });

  it('a successor in another project proves nothing', async () => {
    over.edit = ({ url, body }) => {
      applyEdit(editedId(url), body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    // The successor is not found in this project (it belongs to another one): its read proves nothing here.
    over.item = ({ url }) => (editedId(url) === 'm1v3' ? { status: 404, body: { error: 'not found', code: 'not_found' } } : undefined);
    const router = await show(`/ai/knowledge/memory?project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await editTo('New words');
    // The edit did make its successor, and the page did read it in this project: only then is the
    // successor's 404 what kept the hold.
    expect(store.get('m1v3')?.Content).toBe('New words');
    await waitFor(() => expect(of('GET', '/memory/items/m1v3').length).toBeGreaterThan(0));
    expect(u(of('GET', '/memory/items/m1v3')[0]!.url).searchParams.get('project')).toBe(P);
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(selOf(router)).toBe('m1');
    expect(changes()).toHaveLength(1);
  });

  it('an older version says so and cannot be edited or deleted (the agent deletes the whole lineage)', async () => {
    store.set('m1', { ...store.get('m1')!, IsLatest: false });
    await openM1();
    expect(screen.getByText(strings['d.older'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.edit })).toBeDisabled();
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
  });

  it('an edit form open when the record reads as an older version keeps the draft and sends nothing', async () => {
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, 'My draft');
    store.set('m1', { ...store.get('m1')!, IsLatest: false });
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    const drawer = screen.getByRole('dialog');
    expect(await within(drawer).findByText(strings['d.older'])).toBeInTheDocument();
    expect(within(drawer).getByRole('textbox', { name: strings['edit.content'] })).toHaveValue('My draft');
    expect(within(drawer).getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    await user.click(within(drawer).getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(0);
  });

  it('a delete question open when the record reads as an older version sends nothing', async () => {
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.del }));
    expect(await screen.findByText(strings['del.body'])).toBeInTheDocument();
    store.set('m1', { ...store.get('m1')!, IsLatest: false });
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['del.body'])).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(of('DELETE', '/memory/items')).toHaveLength(0);
  });
});

describe('a failed read wins over what was read before', () => {
  it('load, then the record is deleted elsewhere: a fresh 404 shows it missing, no Edit or Delete', async () => {
    await openM1();
    store.delete('m1');
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    expect(await screen.findByText(interpolate(strings['d.missing'], { realm: word }))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.edit })).toBeNull();
    expect(screen.queryByRole('button', { name: strings.del })).toBeNull();
  });

  it('load, then a failed read: says it may be out of date, Edit and Delete off; Try again reads it again', async () => {
    await openM1();
    over.item = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    expect(await screen.findByText(strings['d.stale'])).toBeInTheDocument();
    expect(screen.getByText('Deploys go through staging first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.edit })).toBeDisabled();
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
    delete over.item;
    const stale = screen.getByText(strings['d.stale']).closest('[class]')!.parentElement!;
    await user.click(within(stale).getByRole('button', { name: /try again/i }));
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['d.stale'])).toBeNull());
    expect(screen.getByRole('button', { name: strings.edit })).toBeEnabled();
  });

  it('an edit form open when a refresh fails keeps the draft and sends nothing; once the record reads again Save sends it', async () => {
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, 'My draft');
    over.item = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    const drawer = screen.getByRole('dialog');
    expect(await within(drawer).findByText(strings['d.stale'])).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    await user.click(within(drawer).getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(0);
    delete over.item;
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    await waitFor(() => expect(within(drawer).getByRole('button', { name: strings['edit.go'] })).toBeEnabled());
    expect(within(drawer).getByRole('textbox', { name: strings['edit.content'] })).toHaveValue('My draft');
    await user.click(within(drawer).getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
  });

  it('a delete question open when a refresh fails sends nothing', async () => {
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.del }));
    expect(await screen.findByText(strings['del.body'])).toBeInTheDocument();
    over.item = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['del.body'])).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(of('DELETE', '/memory/items')).toHaveLength(0);
  });
});

describe('observations show what was noted', () => {
  it('narrative, subtitle, facts and the time it was recorded', async () => {
    over.items = ({ url }) => (url.searchParams.get('kind') === 'observation' ? { status: 200, body: { items: [{ id: 'o1', ts: '2026-10-27T09:30:00Z', title: 'Ran the tests', tool_name: 'bash' }], meta: { total: 1 } } } : undefined);
    over.item = () => ({ status: 200, body: { record: { ID: 'o1', TS: '2026-10-27T09:30:00Z', ToolName: 'bash', ObsType: 'command', Title: 'Ran the tests', Subtitle: 'make test in shop', Narrative: 'The suite passed after the fixture fix.', Facts: ['412 tests passed', 'took 38 s'], Concepts: [], Files: [] } } });
    await show(`/ai/knowledge/memory?project=${P}&kind=observation&sel=o1`);
    await screen.findByRole('heading', { name: 'Ran the tests' });
    expect(screen.getByText('The suite passed after the fixture fix.')).toBeInTheDocument();
    expect(screen.getByText('make test in shop')).toBeInTheDocument();
    expect(screen.getByText('412 tests passed')).toBeInTheDocument();
    expect(screen.getByText('took 38 s')).toBeInTheDocument();
    expect(screen.getByText(strings['f.when'])).toBeInTheDocument();
    expect(screen.queryByText(strings['f.updated'])).toBeNull();
    expect(screen.queryAllByText(strings.unknown)).toHaveLength(0);
  });
});

describe('delete (sent once, C9)', () => {
  const del = async () => {
    await user.click(screen.getByRole('button', { name: strings.del }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(strings['del.body'])).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
  };

  it('asks first, then sends one DELETE naming the record, the project, the kind and the realm', async () => {
    await openM1();
    store.delete('m1');
    await del();
    const c = of('DELETE', '/memory/items');
    expect(c).toHaveLength(1);
    expect(u(c[0]!.url).searchParams.get('realm')).toBe(R1);
    expect(c[0]!.body).toEqual({ ids: ['m1'], project: P, kind: 'memory', expect_realm: R1 });
  });

  it('a slot is deleted by name', async () => {
    over.items = ({ url }) => (url.searchParams.get('kind') === 'slot' ? { status: 200, body: { items: [{ Name: 'current_focus', Content: 'billing' }], meta: { total: 1 } } } : undefined);
    over.item = () => ({ status: 200, body: { record: { Name: 'current_focus', Content: 'billing' } } });
    await show(`/ai/knowledge/memory?project=${P}&kind=slot&sel=current_focus`);
    await screen.findByRole('heading', { name: 'current_focus' });
    await del();
    expect(of('DELETE', '/memory/items')[0]!.body).toEqual({ name: 'current_focus', project: P, kind: 'slot', expect_realm: R1 });
  });

  it('a lost answer is held; the record’s 404 alone (status failing) proves nothing; with the status answering it is proved', async () => {
    over.remove = () => ({ status: 0, network: true });
    await openM1();
    await del();
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    store.delete('m1');
    over.status = () => ({ status: 404, body: { error: 'not found', code: 'not_found' } });
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    // The status read failing takes the whole page to "cannot reach"; the delete stays held (nothing proved, nothing sent).
    expect(screen.getAllByText(strings['st.unreachable.title']).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['del.done'])).toBeNull();
    delete over.status;
    await user.click(screen.getAllByRole('button', { name: /try again/i })[0]!);
    await flush();
    expect(await screen.findByText(strings['del.held'])).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['del.held'])).toBeNull());
    expect(screen.getByText(strings['del.done'])).toBeInTheDocument();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('the last slot of a project, lost answer, the project gone from the list: Check again still reachable and proves it', async () => {
    let slotGone = false;
    over.items = ({ url }) => (url.searchParams.get('kind') === 'slot' ? { status: 200, body: { items: slotGone ? [] : [{ Name: 'current_focus', Content: 'billing' }], meta: { total: slotGone ? 0 : 1 } } } : undefined);
    over.item = () => (slotGone ? { status: 404, body: { error: 'not found', code: 'not_found' } } : { status: 200, body: { record: { Name: 'current_focus', Content: 'billing' } } });
    over.remove = () => {
      slotGone = true;
      return { status: 0, network: true };
    };
    over.projects = () => ({ status: 200, body: { items: slotGone ? [] : [{ key: P, root: '/home/ada/projects/shop', memories: 0, observations: 0, sessions: 0, lessons: 0, slots: 1 }], meta: { total: slotGone ? 0 : 1 } } });
    await show(`/ai/knowledge/memory?project=${P}&kind=slot&sel=current_focus`);
    await screen.findByRole('heading', { name: 'current_focus' });
    await del();
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    expect(screen.getByText(interpolate(strings['p.unknown.band'], { name: P }))).toBeInTheDocument();
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['del.held'])).toBeNull());
    expect(screen.getByText(strings['del.done'])).toBeInTheDocument();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('a held delete still shown from the list opens its record', async () => {
    over.remove = () => ({ status: 0, network: true });
    const router = await openM1().then(() => null);
    void router;
    await del();
    await act(async () => { cleanup(); });
    await show(`/ai/knowledge/memory?project=${P}`);
    const notice = await screen.findByText(strings['held.notice.remove']);
    expect(notice).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings['held.open'] }));
    await flush();
    expect(await screen.findByText(strings['del.held'])).toBeInTheDocument();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });
});

/** A fact's value in Details (kit Facts: the label in its dt, the value in the dd beside it). */
const factOf = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Details names the data-host state', () => {
  it.each(['follower', 'electing', 'stuck'] as const)('%s', async (state) => {
    host = { status: 'ok', datahost: { realm: R1, state, host: 'c2', hosts: [{ id: 'c2', name: 'borealis', is_current: true }] } };
    await show();
    await user.click(screen.getByRole('button', { name: band.details }));
    expect(factOf(strings['det.state'])).toBe(strings[`det.state.${state}`]);
  });

  it('a failed data-host read says it could not be read', async () => {
    over.host = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await show();
    await user.click(screen.getByRole('button', { name: band.details }));
    expect(factOf(strings['det.state'])).toBe(strings['det.state.failed']);
  });
});

describe('memory on/off', () => {
  it('the switch is a setting row named by its label and described by its help', async () => {
    await show();
    await user.click(screen.getByRole('button', { name: band.details }));
    const sw = screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: word }) });
    const row = sw.closest('[data-sg-row]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(sw).toHaveAccessibleDescription(interpolate(strings['det.switchNote'], { realm: word, computer: 'atlas' }));
    expect(factOf(strings['det.state'])).toBe(strings['det.state.leader']);
  });

  it('Details lists the hosts and names the data-host state; the switch sends one PUT with the realm and the value', async () => {
    await show();
    await user.click(screen.getByRole('button', { name: band.details }));
    expect(screen.getByText(/borealis/)).toBeInTheDocument();
    expect(factOf(strings['det.state'])).toBe(strings['det.state.leader']);
    expect(factOf(strings['det.computers']), 'the hosts are one fact').toMatch(/borealis/);
    // Every block of Details is a kit SettingGroup or SubSection with its heading; no hand-made caps heading is left.
    expect(screen.getByRole('heading', { name: strings['det.hosts'] })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings['det.capture'], level: 2 })).toBeInTheDocument();
    expect(document.querySelector('[class~="dh"]')).toBeNull();
    status = { ...status, enabled: false };
    await user.click(screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: word }) }));
    await flush();
    const c = of('PUT', '/memory/enabled');
    expect(c).toHaveLength(1);
    expect(u(c[0]!.url).searchParams.get('realm')).toBe(R1);
    expect(c[0]!.body).toEqual({ enabled: false });
    await waitFor(() => expect(bandText().endsWith(band.off)).toBe(true));
  });

  it('a lost on/off answer is held until the status shows it', async () => {
    over.enabled = () => ({ status: 0, network: true });
    await show();
    await user.click(screen.getByRole('button', { name: band.details }));
    await user.click(screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: word }) }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: word }) })).toBeDisabled();
    status = { ...status, enabled: false };
    await user.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await flush();
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(of('PUT', '/memory/enabled')).toHaveLength(1);
  });
});

describe('Global and the realm-wide scope are reachable', () => {
  const realmOf = (c: { url: string }) => u(c.url).searchParams.get('realm');

  it('All realms offers Global; choosing it reads Global (every request names it) and lists its projects', async () => {
    boot({});
    queryClient.clear();
    onFetch(fake);
    const router = await show();
    expect(mem()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: strings['scope.showGlobal'] }));
    await flush();
    expect(router.state.location.search).toMatchObject({ realm: 'global' });
    expect(await screen.findByText('shop')).toBeInTheDocument();
    // In Global the choice names it; the realm choice stays off while the top bar shows All realms.
    const group = screen.getByRole('radiogroup', { name: strings['scope.label'] });
    expect(within(group).getByRole('radio', { name: strings['scope.global'] })).toBeChecked();
    expect(within(group).getByRole('radio', { name: strings['scope.allRealms'] })).toBeDisabled();
    expect(mem().length).toBeGreaterThan(2);
    for (const c of mem()) expect(realmOf(c)).toBe('global');
    expect(bandText()).toContain(`Realm ${strings['scope.global']}`);
  });

  it('a Global deep link reads Global even with a realm chosen at the top; the realm choice goes back to it', async () => {
    const router = await show('/ai/knowledge/memory?realm=global&project=proj_shop');
    expect(await screen.findByText('Deploys go through staging first')).toBeInTheDocument();
    for (const c of mem()) expect(realmOf(c)).toBe('global');
    const edits = mem().length;
    const group = screen.getByRole('radiogroup', { name: strings['scope.label'] });
    expect(within(group).getByRole('radio', { name: strings['scope.global'] })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: interpolate(strings['scope.realm'], { realm: word }) }));
    await flush();
    // A store change opens the chosen store's project list: no project of Global is carried over.
    expect(router.state.location.search).toEqual({});
    expect(await screen.findByText('shop')).toBeInTheDocument();
    for (const c of mem().slice(edits)) expect(realmOf(c)).toBe(R1);
  });

  it('Global offers edit, delete and the switch, never Manage memory (tidy, erase, write pending, use this computer)', async () => {
    await show(`/ai/knowledge/memory?realm=global&project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    expect(screen.getByText(strings['scope.noManage'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.edit })).toBeEnabled();
    expect(screen.getByRole('button', { name: strings.del })).toBeEnabled();
    // Tidy and erase live in the Manage memory menu: in Global its trigger is not there at all.
    expect(screen.queryByRole('button', { name: adminStrings.manage })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: new RegExp(adminStrings.tidy) })).toBeNull();
    await user.click(screen.getByRole('button', { name: band.details }));
    expect(screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: strings['scope.global'] }) })).toBeEnabled();
    expect(changes()).toHaveLength(0);
    for (const c of mem()) expect(realmOf(c)).toBe('global');
  });

  it('a realm keeps its changes: edit, delete, tidy and the switch are offered there', async () => {
    await openM1();
    expect(screen.queryByText(strings['scope.noManage'])).toBeNull();
    expect(screen.getByRole('button', { name: strings.edit })).toBeEnabled();
    expect(screen.getByRole('button', { name: strings.del })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: adminStrings.manage }));
    for (const n of [adminStrings.tidy, adminStrings.erase]) expect(await screen.findByRole('menuitem', { name: new RegExp(n) })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: band.details }));
    expect(screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: word }) })).toBeEnabled();
  });

  it('a token session pinned to a realm never reads "Global" (its calls carry the pin): closed, nothing sent', async () => {
    pin(R1);
    const router = await show('/ai/knowledge/memory?realm=global');
    expect(screen.getByText(strings['scope.closed.title'])).toBeInTheDocument();
    expect(mem()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: strings['scope.showRealm'] }));
    await flush();
    expect(router.state.location.search).toEqual({});
    expect(await screen.findByText('shop')).toBeInTheDocument();
    for (const c of mem()) expect(realmOf(c)).toBe(R1);
    const group = screen.getByRole('radiogroup', { name: strings['scope.label'] });
    expect(within(group).getByRole('radio', { name: strings['scope.global'] })).toBeDisabled();
  });

  it('the realm-wide row opens its lessons and slots (project "" on every read), never memories or observations', async () => {
    const router = await show();
    await user.click(await screen.findByText(strings['p.wide']));
    await flush();
    expect(router.state.location.search).toMatchObject({ wide: '1' });
    expect(router.state.location.search).not.toHaveProperty('project');
    expect(await screen.findByText('Ask before rotating keys')).toBeInTheDocument();
    const reads = of('GET', '/memory/items');
    expect(reads.length).toBeGreaterThan(0);
    for (const c of reads) {
      expect(u(c.url).searchParams.get('project') ?? '').toBe('');
      expect(u(c.url).searchParams.get('kind')).not.toBe('memory');
    }
    expect(screen.getAllByRole('radio', { name: strings['kind.slot'] }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('radio', { name: strings['kind.memory'] })).toBeNull();
    expect(screen.queryByRole('radio', { name: strings['kind.observation'] })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: interpolate(strings.titleProject, { name: strings['p.wide'] }) })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.allProjects }));
    await flush();
    expect(router.state.location.search).not.toHaveProperty('wide');
    expect(await screen.findByText('shop')).toBeInTheDocument();
  });
});

describe('a change the agent refused before writing is failed, one it may have written is held', () => {
  const typeAndSave = async () => {
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, 'Deploys always go through staging.');
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
  };
  const del = async () => {
    await user.click(screen.getByRole('button', { name: strings.del }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
  };
  const cold: Reply = { status: 503, headers: { 'Retry-After': '5' }, body: { error: "this realm's memory is not connected on the agent right now", code: 'service_unavailable' } };
  const storeOff: Reply = { status: 503, body: { error: 'memory store unavailable', code: 'store_unavailable' } };

  it.each([
    ['503 service_unavailable (the realm is not connected: refused before any write)', cold],
    ['503 store_unavailable (the store could not be opened)', storeOff],
    ['409 memory_edit_conflict (another edit first)', { status: 409, body: { error: 'memory m1 was changed or replaced by another edit; read the latest version and edit that', code: 'memory_edit_conflict' } } as Reply],
    ['404 not_found (the record is gone)', { status: 404, body: { error: 'not found', code: 'not_found' } } as Reply],
  ])('an edit answered %s is failed, never held, sent once', async (_n, reply) => {
    over.edit = () => reply;
    await openM1();
    await typeAndSave();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(screen.queryAllByText(strings['edit.held'])).toHaveLength(0);
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(changes()).toHaveLength(1);
  });

  it('an edit answered 502 memory_outcome_unknown is held (it may have been applied); Check again reads, never resends', async () => {
    over.edit = () => ({ status: 502, body: { error: 'the memory data host did not confirm the write, so it may or may not have been applied', code: 'memory_outcome_unknown' } });
    await openM1();
    await typeAndSave();
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(changes()).toHaveLength(1);
  });

  it('a conflict offers Reload: it reads the record again (nothing sent), the draft stays, and a replaced record blocks Save', async () => {
    await openM1();
    // Another edit replaced m1 after this page read it.
    applyEdit('m1', { content: 'Someone else rewrote this.' });
    await typeAndSave();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(screen.getByText(strings['edit.conflict'])).toBeInTheDocument();
    const reads = of('GET', '/memory/items/m1').length;
    await user.click(screen.getByRole('button', { name: strings['edit.reload'] }));
    await flush();
    expect(of('GET', '/memory/items/m1').length).toBeGreaterThan(reads);
    expect(screen.getByRole('textbox', { name: strings['edit.content'] })).toHaveValue('Deploys always go through staging.');
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText(strings['d.older'])).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    expect(changes()).toHaveLength(1);
  });

  it('a conflict on a record changed in place (still the latest): after Reload, Save sends again against what it holds now', async () => {
    let first = true;
    over.edit = ({ url }) => {
      if (!first) return undefined;
      first = false;
      // Another edit changed the strength in place first.
      const r = store.get(editedId(url))!;
      store.set(String(r.ID), { ...r, Strength: 5 });
      return { status: 409, body: { error: 'memory m1 was changed or replaced by another edit; read the latest version and edit that', code: 'memory_edit_conflict' } };
    };
    await openM1();
    await typeAndSave();
    await user.click(screen.getByRole('button', { name: strings['edit.reload'] }));
    await flush();
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).queryByText(strings['d.older'])).toBeNull();
    // The draft's content stays; the strength it did not touch follows the record.
    expect(within(drawer).getByRole('textbox', { name: strings['edit.content'] })).toHaveValue('Deploys always go through staging.');
    await user.click(within(drawer).getByRole('button', { name: strings['edit.go'] }));
    await flush();
    const patches = of('PATCH', '/memory/items/m1');
    expect(patches).toHaveLength(2);
    // The second send carries only what this form changed: never the strength it read before the other writer's edit.
    expect(patches[1]!.body).toEqual({ project: P, kind: 'memory', content: 'Deploys always go through staging.', expect_realm: R1 });
    expect(store.get('m1v3')?.Strength).toBe(5);
  });

  it('a strength this form did not touch is never sent, even when the record reads a new one while the form is open', async () => {
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, 'Only the words change.');
    // Another writer sets the strength while the form is open; the page reads the record again.
    store.set('m1', { ...store.get('m1')!, Strength: 2 });
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    // The form shows the record's new strength: a field not edited here follows the record.
    expect(screen.getByRole('button', { name: new RegExp(strings['edit.strength']) }).textContent).toContain('2');
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(of('PATCH', '/memory/items/m1')[0]!.body).toEqual({ project: P, kind: 'memory', content: 'Only the words change.', expect_realm: R1 });
  });

  it('a conflict, then Reload finds the record gone: the form and its draft stay open, Save is off, nothing more is sent', async () => {
    let first = true;
    over.edit = () => {
      if (!first) return undefined;
      first = false;
      store.delete('m1');
      return { status: 409, body: { error: 'memory m1 was changed or replaced by another edit; read the latest version and edit that', code: 'memory_edit_conflict' } };
    };
    await openM1();
    await typeAndSave();
    await user.click(screen.getByRole('button', { name: strings['edit.reload'] }));
    await flush();
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText(strings['edit.gone'])).toBeInTheDocument();
    expect(within(drawer).getByRole('textbox', { name: strings['edit.content'] })).toHaveValue('Deploys always go through staging.');
    expect(within(drawer).getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    await user.click(within(drawer).getByRole('button', { name: strings['edit.go'] }));
    await flush();
    expect(changes()).toHaveLength(1);
  });

  it.each([
    ['503 service_unavailable (refused before any write)', cold],
  ])('a delete answered %s is failed, never held, sent once', async (_n, reply) => {
    over.remove = () => reply;
    await openM1();
    await del();
    expect(screen.queryByText(strings['del.held'])).toBeNull();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  // A lesson delete runs in chunks of 500 ids: a later chunk's store_unavailable can follow an earlier chunk's commit
  // (its answer carries deleted, incomplete). On delete it is no refusal.
  it.each([
    ['plain', storeOff],
    ['with deleted 1 and incomplete', { status: 503, body: { error: 'memory store unavailable', code: 'store_unavailable', deleted: 1, incomplete: true } } as Reply],
  ])('a delete answered 503 store_unavailable (%s) may have gone through: held, sent once', async (_n, reply) => {
    over.remove = () => reply;
    await openM1();
    await del();
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('a delete answered 502 memory_outcome_unknown, part way (partial, deleted 1), is held until Check again proves it', async () => {
    over.remove = () => ({ status: 502, body: { error: 'the delete stopped part way: 1 of the requested rows were deleted before it failed', code: 'memory_outcome_unknown', partial: true, deleted: 1 } });
    await openM1();
    await del();
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    store.delete('m1');
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['del.held'])).toBeNull());
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('memory on/off answered 503 service_unavailable (the realm is not connected) is failed, not held, sent once', async () => {
    over.enabled = () => cold;
    await show();
    await user.click(screen.getByRole('button', { name: band.details }));
    await user.click(screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: word }) }));
    await flush();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
    expect(screen.getByRole('switch', { name: interpolate(strings['det.switch'], { realm: word }) })).not.toBeDisabled();
    expect(of('PUT', '/memory/enabled')).toHaveLength(1);
  });

  it('an empty realm store answers an empty project list: the library says so, never an error (an empty items array)', async () => {
    over.projects = () => ({ status: 200, body: { items: [], meta: { total: 0 } } });
    await show();
    expect(of('GET', '/memory/projects').length).toBeGreaterThan(0);
    expect((await screen.findAllByText(interpolate(strings['st.empty.title'], { realm: word }))).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['st.unreachable.title'])).toBeNull();
  });
});

describe('Global takes edits, deletes and on/off, each held under Global across a realm switch', () => {
  const realmOf = (c: { url: string }) => u(c.url).searchParams.get('realm');
  const inGlobal = async () => {
    const router = await show(`/ai/knowledge/memory?realm=global&project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    return router;
  };
  const switchTopBar = async (realm: string) => {
    await act(async () => { setRealm(realm); bump('switch'); });
    await flush();
  };
  const del = async () => {
    await user.click(screen.getByRole('button', { name: strings.del }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
  };

  it('Use this computer stays realm-only: offered in the realm with no host serving, never in Global', async () => {
    host = { status: 'ok', datahost: { ...(host.datahost as Record<string, unknown>), state: 'unavailable', can_use_self: true } };
    await show(`/ai/knowledge/memory?project=${P}`);
    expect(await screen.findByRole('button', { name: adminStrings['host.action'] })).toBeInTheDocument();
    cleanup();
    await show(`/ai/knowledge/memory?realm=global&project=${P}`);
    await flush();
    expect(screen.getByText(strings['scope.noManage'])).toBeInTheDocument();
    expect(bandText()).toContain(band.unavailable);
    expect(screen.queryByRole('button', { name: adminStrings['host.action'] })).toBeNull();
    expect(changes()).toHaveLength(0);
  });

  it('a Global edit names Global twice (query and expect_realm) and is sent once', async () => {
    await inGlobal();
    await editTo('Deploys always go through staging.');
    const sent = of('PATCH', '/memory/items/m1');
    expect(sent).toHaveLength(1);
    expect(realmOf(sent[0]!)).toBe('global');
    expect(sent[0]!.body).toEqual({ project: P, kind: 'memory', content: 'Deploys always go through staging.', expect_realm: 'global' });
    expect(changes()).toHaveLength(1);
  });

  it('with All realms at the top a Global edit is sent too, naming Global', async () => {
    boot({});
    queryClient.clear();
    onFetch(fake);
    await inGlobal();
    await editTo('New words');
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(realmOf(of('PATCH', '/memory/items/m1')[0]!)).toBe('global');
  });

  it('a lost Global edit stays held through a top bar realm switch; Check again reads Global and proves it; never resent', async () => {
    over.edit = () => ({ status: 0, network: true });
    const router = await inGlobal();
    await editTo('New words');
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    await switchTopBar(R2);
    // The page still shows Global: the hold is filed under Global, so the switch neither drops nor frees it.
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: strings.edit })).toBeDisabled();
    applyEdit('m1', { content: 'New words' });
    const before = mem().length;
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['edit.held'])).toBeNull());
    await waitFor(() => expect(selOf(router)).toBe('m1v3'));
    expect(mem().length).toBeGreaterThan(before);
    for (const c of mem()) expect(realmOf(c)).toBe('global');
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(changes()).toHaveLength(1);
  });

  it('a held Global edit is Global’s: the realm’s same record is free to edit', async () => {
    over.edit = () => ({ status: 0, network: true });
    await inGlobal();
    await editTo('New words');
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    cleanup();
    await openM1();
    expect(screen.queryByText(strings['edit.held'])).toBeNull();
    expect(screen.getByRole('button', { name: strings.edit })).toBeEnabled();
    cleanup();
    await inGlobal();
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
  });

  it('a lost Global delete stays held through a realm switch and is proved by Global’s reads', async () => {
    over.remove = () => ({ status: 0, network: true });
    await inGlobal();
    await del();
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    const sent = of('DELETE', '/memory/items');
    expect(sent).toHaveLength(1);
    expect(realmOf(sent[0]!)).toBe('global');
    expect(sent[0]!.body).toEqual({ ids: ['m1'], project: P, kind: 'memory', expect_realm: 'global' });
    await switchTopBar(R2);
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    store.delete('m1');
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    await waitFor(() => expect(screen.queryByText(strings['del.held'])).toBeNull());
    expect(screen.getByText(strings['del.done'])).toBeInTheDocument();
    for (const c of mem()) expect(realmOf(c)).toBe('global');
    expect(changes()).toHaveLength(1);
  });

  it('a lost Global on/off stays held through a realm switch until Global’s status shows it', async () => {
    over.enabled = () => ({ status: 0, network: true });
    await show('/ai/knowledge/memory?realm=global');
    await user.click(screen.getByRole('button', { name: band.details }));
    const name = interpolate(strings['det.switch'], { realm: strings['scope.global'] });
    await user.click(screen.getByRole('switch', { name }));
    await flush();
    const put = of('PUT', '/memory/enabled');
    expect(put).toHaveLength(1);
    expect(realmOf(put[0]!)).toBe('global');
    expect(put[0]!.body).toEqual({ enabled: false });
    await switchTopBar(R2);
    if (!screen.queryByRole('switch', { name })) await user.click(screen.getByRole('button', { name: band.details }));
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByRole('switch', { name })).toBeDisabled();
    status = { ...status, enabled: false };
    await user.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await flush();
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    for (const c of mem()) expect(realmOf(c)).toBe('global');
    expect(changes()).toHaveLength(1);
  });
});

describe('Details says what the store keeps', () => {
  const totals = { projects: 3, memories: 1234, observations: 900, lessons: 5, slots: 2, sessions: 31, graph_nodes: 120 };
  // The Stored section of Details (the library has its own counts elsewhere on the page).
  const storedName = interpolate(strings['det.stored'], { where: interpolate(strings['det.where.realm'], { realm: word }) });
  const stored = () => screen.getByRole('heading', { name: storedName }).closest('section') as HTMLElement;
  const inProj = () => screen.getByRole('heading', { name: strings['det.inProject'] }).closest('section') as HTMLElement;
  const valuesIn = (sec: HTMLElement, label: string) => within(sec).queryAllByText(label, { selector: 'dt' }).map((d) => d.nextElementSibling?.textContent ?? '');
  const sizeOf = (label: string) => valuesIn(stored(), label);
  const openDetails = async () => {
    await user.click(screen.getByRole('button', { name: band.details }));
    await flush();
  };

  it('the whole store: projects, memories, lessons, slots, observations, sessions and graph nodes, as the status read sends them', async () => {
    status = { ...status, totals };
    await show();
    await openDetails();
    expect(screen.getByRole('heading', { name: storedName })).toBeInTheDocument();
    // The store total counts every version: labelled so, with the units note.
    expect(sizeOf(strings['det.n.versions'])).toEqual(['1,234']);
    expect(sizeOf(strings['det.n.memories'])).toEqual([]);
    expect(within(stored()).getByText(strings['det.totalsNote'])).toBeInTheDocument();
    expect(sizeOf(strings['det.n.projects'])).toEqual(['3']);
    expect(sizeOf(strings['det.n.graph'])).toEqual(['120']);
    // No project open: no project block, no embedding line.
    expect(screen.queryByRole('heading', { name: strings['det.inProject'] })).toBeNull();
    expect(changes()).toHaveLength(0);
  });

  it('with a project open: its own sizes and how much is embedded for recall (the status read names the project)', async () => {
    over.status = ({ url }) => url.searchParams.get('project') === P
      ? { status: 200, body: { ...status, totals, counts: { memories: 12, observations: 300, sessions: 9, graph_nodes: 44, graph_edges: 61 }, embedding_coverage: { embedded: 310, total: 312, model: 'local-minilm' } } }
      : undefined;
    await inProject();
    await openDetails();
    expect(screen.getByRole('heading', { name: strings['det.inProject'] })).toBeInTheDocument();
    expect(sizeOf(strings['det.n.versions'])).toEqual(['1,234']);
    expect(valuesIn(inProj(), strings['det.n.memories'])).toEqual(['12']);
    expect(valuesIn(inProj(), strings['det.n.edges'])).toEqual(['61']);
    expect(valuesIn(inProj(), strings['det.embed.label'])).toEqual([interpolate(strings['det.embed.on'], { embedded: '310', total: '312', model: 'local-minilm' })]);
  });

  it('embeddings off is said as a fact; an unread block says it could not be read, never 0', async () => {
    over.status = ({ url }) => url.searchParams.get('project') === P
      ? { status: 200, body: { ...status, degraded: true, degraded_reads: ['totals', 'counts'], embedding_coverage: { embedded: 0, total: 312, model: '' } } }
      : undefined;
    await inProject();
    await openDetails();
    expect(within(stored()).getAllByText(strings['det.unread'])).toHaveLength(1);
    expect(within(inProj()).getAllByText(strings['det.unread'])).toHaveLength(1);
    expect(sizeOf(strings['det.n.versions'])).toEqual([]);
    expect(valuesIn(inProj(), strings['det.n.memories'])).toEqual([]);
    expect(within(stored()).queryByText(strings['det.totalsNote'])).toBeNull();
    expect(valuesIn(inProj(), strings['det.embed.label'])).toEqual([strings['det.embed.off']]);
  });

  it('Global is named as Global memory, never "realm Global"', async () => {
    status = { ...status, totals };
    await show('/ai/knowledge/memory?realm=global');
    await openDetails();
    const name = interpolate(strings['det.stored'], { where: strings['det.where.global'] });
    const sec = screen.getByRole('heading', { name }).closest('section') as HTMLElement;
    expect(within(sec).getAllByText(strings['det.n.versions'], { selector: 'dt' })).toHaveLength(1);
    expect(screen.queryByText(/Stored in realm/)).toBeNull();
  });

  it('a malformed coverage block reads as unread, not as embeddings off', async () => {
    over.status = ({ url }) => url.searchParams.get('project') === P
      ? { status: 200, body: { ...status, totals, embedding_coverage: { embedded: 1, total: 2 } } }
      : undefined;
    await inProject();
    await openDetails();
    expect(valuesIn(inProj(), strings['det.embed.label'])).toEqual([strings['det.embed.unread']]);
    expect(screen.queryByText(strings['det.embed.off'])).toBeNull();
  });
});

describe('the whole record can be edited, and a lost answer is read back on every field sent', () => {
  const drawer = async () => within(await screen.findByRole('dialog'));
  const openEditOf = async (at: string, heading: string) => {
    const router = await show(at);
    await screen.findByRole('heading', { name: heading });
    await user.click(screen.getByRole('button', { name: strings.edit }));
    return { router, d: await drawer() };
  };
  const pick = async (d: Awaited<ReturnType<typeof drawer>>, label: string, option: string) => {
    await user.click(d.getByRole('button', { name: new RegExp(label) }));
    await user.click(await screen.findByRole('option', { name: option }));
  };
  const save = async () => {
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
  };
  const HELD_KEYS = ['edit.held', 'edit.heldExpiry', 'edit.heldExpiryNew', 'edit.heldElsewhere'] as const;
  const held = () => HELD_KEYS.some((k) => screen.queryAllByText(strings[k]).length > 0);
  const heldExpiry = () => screen.queryAllByText(strings['edit.heldExpiry']).length > 0;
  // The page's own notice (Detail.tsx's notice, outside the edit drawer): which words it says.
  const pageSays = (k: (typeof HELD_KEYS)[number]) => screen.queryAllByText(strings[k]).some((e) => !e.closest('[role="dialog"]'));
  const checkAgain = async () => {
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
  };
  const M1 = `/ai/knowledge/memory?project=${P}&sel=m1`;
  const M1_TEXT = 'Deploys go through staging first.';
  const DAY = 86_400_000;

  it('Type offers the agent’s six types, plus the older type stored now; picking one sends it, and the body is exactly what changed', async () => {
    const { d } = await openEditOf(M1, 'Deploys go through staging first');
    await user.click(d.getByRole('button', { name: new RegExp(strings['edit.type']) }));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual([interpolate(strings['edit.current'], { value: 'decision' }), 'pattern', 'preference', 'architecture', 'bug', 'workflow', 'fact']);
    await user.click(screen.getByRole('option', { name: 'workflow' }));
    await save();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(of('PATCH', '/memory/items/m1')[0]!.body).toEqual({ project: P, kind: 'memory', content: M1_TEXT, type: 'workflow', expect_realm: R1 });
    expect(store.get('m1v3')!.Type).toBe('workflow');
  });

  it('concepts, files, tier and an expiry in days go in one edit; the saved new version shows each of them', async () => {
    const { router, d } = await openEditOf(M1, 'Deploys go through staging first');
    const concepts = d.getByRole('textbox', { name: strings['edit.concepts'] });
    await user.clear(concepts);
    await user.type(concepts, ' deploy {Enter}{Enter}staging');
    await user.type(d.getByRole('textbox', { name: strings['edit.files'] }), 'deploy/run.sh');
    await pick(d, strings['edit.tier'], 'semantic');
    await pick(d, strings['edit.forget'], strings['edit.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['edit.days'] }), '30');
    const before = Date.now();
    await save();
    expect(of('PATCH', '/memory/items/m1')[0]!.body).toEqual({
      project: P, kind: 'memory', content: M1_TEXT, concepts: ['deploy', 'staging'], files: ['deploy/run.sh'], tier: 'semantic', ttl_days: 30, expect_realm: R1,
    });
    await waitFor(() => expect(selOf(router)).toBe('m1v3'));
    const next = store.get('m1v3')!;
    expect(next).toMatchObject({ Concepts: ['deploy', 'staging'], Files: ['deploy/run.sh'], Tier: 'semantic' });
    expect(Date.parse(String(next.ForgetAfter)) - before).toBeGreaterThanOrEqual(30 * DAY);
    expect(changes()).toHaveLength(1);
  });

  it('Never clears an expiry the record has (ttl_days 0); on a record kept for good it changes nothing and sends nothing', async () => {
    let { d } = await openEditOf(M1, 'Deploys go through staging first');
    expect(d.getByRole('button', { name: new RegExp(strings['edit.forget']) }).textContent).toContain(strings['edit.forget.keepNever']);
    await pick(d, strings['edit.forget'], strings['edit.forget.never']);
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    expect(changes()).toHaveLength(0);
    cleanup();
    store.set('m1', { ...store.get('m1')!, ForgetAfter: '2027-01-01T00:00:00Z' });
    ({ d } = await openEditOf(M1, 'Deploys go through staging first'));
    await pick(d, strings['edit.forget'], strings['edit.forget.never']);
    await save();
    expect(of('PATCH', '/memory/items/m1')[0]!.body).toEqual({ project: P, kind: 'memory', content: M1_TEXT, ttl_days: 0, expect_realm: R1 });
    expect(store.get('m1')!.ForgetAfter).toBeNull();
  });

  it('More options opens with a record that has concepts, files or a forget date, closed without; a bad day count holds it open', async () => {
    let { d } = await openEditOf(M1, 'Deploys go through staging first');
    expect(d.getByRole('button', { name: strings['edit.more'] }), 'M1 has a concept').toHaveAttribute('aria-expanded', 'true');
    cleanup();
    store.set('m1', { ...store.get('m1')!, Concepts: [], Files: [] });
    ({ d } = await openEditOf(M1, 'Deploys go through staging first'));
    const toggle = d.getByRole('button', { name: strings['edit.more'] });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(d.queryByRole('textbox', { name: strings['edit.files'] })).toBeNull();
    expect(d.getByRole('textbox', { name: strings['edit.content'] })).toBeInTheDocument();
    await user.click(toggle);
    await pick(d, strings['edit.forget'], strings['edit.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['edit.days'] }), 'ten');
    await user.click(toggle);
    expect(toggle, 'a bad day count keeps it open').toHaveAttribute('aria-expanded', 'true');
    expect(d.getByText(interpolate(strings['edit.daysBad'], { max: '106751' }))).toBeInTheDocument();
    expect(changes()).toHaveLength(0);
  });

  it('a tier refusal opens a closed More options and holds it open; it stays open once the refusal clears', async () => {
    // The stored tier is one the agent no longer lists; the form keeps it as "stored now", and the person picks another
    // tier, then that one again (picking the shown value fires no change).
    store.set('m1', { ...store.get('m1')!, Concepts: [], Files: [], Tier: 'legacy' });
    const { d } = await openEditOf(M1, 'Deploys go through staging first');
    const toggle = d.getByRole('button', { name: strings['edit.more'] });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await pick(d, strings['edit.tier'], 'episodic');
    await pick(d, strings['edit.tier'], interpolate(strings['edit.current'], { value: 'legacy' }));
    await user.click(toggle);
    expect(toggle, 'the stored tier refuses nothing: the fold closes').toHaveAttribute('aria-expanded', 'false');
    // Another writer moves the record to a listed tier; the edited tier stays, now a tier the agent refuses.
    store.set('m1', { ...store.get('m1')!, Tier: 'semantic' });
    await act(async () => { await queryClient.refetchQueries(); });
    await flush();
    expect(toggle, 'the tier refusal opens the fold').toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    await user.click(toggle);
    expect(toggle, 'a close is ignored while the refusal shows').toHaveAttribute('aria-expanded', 'true');
    await pick(d, strings['edit.tier'], 'working');
    expect(toggle, 'the refusal cleared: the fold stays open').toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeEnabled();
    expect(changes()).toHaveLength(0);
  });

  it('days that are not a whole number from 1 to 106751 keep Save off and send nothing', async () => {
    const { d } = await openEditOf(M1, 'Deploys go through staging first');
    await pick(d, strings['edit.forget'], strings['edit.forget.days']);
    const days = d.getByRole('textbox', { name: strings['edit.days'] });
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    // forms-required: with the count still empty no field error shows, so the footer says what Save waits for.
    expect(screen.getByText(strings['edit.needDays'])).toBeInTheDocument();
    for (const bad of ['0', '2.5', '-3', '106752', 'ten']) {
      await user.clear(days);
      await user.type(days, bad);
      expect(screen.getByRole('button', { name: strings['edit.go'] }), bad).toBeDisabled();
      expect(d.getByText(interpolate(strings['edit.daysBad'], { max: '106751' }))).toBeInTheDocument();
      expect(screen.queryByText(strings['edit.needDays'])).toBeNull();
    }
    await user.clear(days);
    expect(screen.getByText(strings['edit.needDays'])).toBeInTheDocument();
    await user.type(days, '106751');
    expect(screen.queryByText(strings['edit.needDays'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeEnabled();
    expect(changes()).toHaveLength(0);
  });

  const lostInPlace = async (withDays = true) => {
    const { d } = await openEditOf(M1, 'Deploys go through staging first');
    await pick(d, strings['edit.tier'], 'procedural');
    if (withDays) {
      await pick(d, strings['edit.forget'], strings['edit.forget.days']);
      await user.type(d.getByRole('textbox', { name: strings['edit.days'] }), '7');
    }
    await save();
  };

  it('a lost tier answer the agent applied is proved by a read of the same record showing it, nothing resent', async () => {
    over.edit = ({ url, body }) => {
      applyEdit(editedId(url), body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    await lostInPlace(false);
    if (held()) await checkAgain();
    expect(held()).toBe(false);
    expect(store.get('m1')).toMatchObject({ Tier: 'procedural' });
    expect(changes()).toHaveLength(1);
  });

  it('a lost answer setting N days is never proved by a read, even one the agent applied: it stays held, says why, nothing resent', async () => {
    over.edit = ({ url, body }) => {
      applyEdit(editedId(url), body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    await lostInPlace();
    expect(heldExpiry()).toBe(true);
    await checkAgain();
    expect(heldExpiry()).toBe(true);
    expect(store.get('m1')).toMatchObject({ Tier: 'procedural' });
    expect(changes()).toHaveLength(1);
  });

  it('a lost answer the agent applied with another expiry date is no proof: it stays held', async () => {
    over.edit = ({ url, body }) => {
      applyEdit(editedId(url), { ...(body as Record<string, unknown>), ttl_days: 8 });
      return { status: 0, network: true };
    };
    await lostInPlace();
    await checkAgain();
    expect(held()).toBe(true);
    expect(changes()).toHaveLength(1);
  });

  it('a lost answer never applied stays held when read back; a read that fails keeps it held too; nothing is resent', async () => {
    over.edit = () => ({ status: 0, network: true });
    await lostInPlace();
    expect(held()).toBe(true);
    await checkAgain();
    expect(held()).toBe(true);
    over.item = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await checkAgain();
    expect(held()).toBe(true);
    expect(changes()).toHaveLength(1);
  });

  it('Stop tracking on an N-day hold sends nothing and frees it; the page notice says the N-day words', async () => {
    over.edit = () => ({ status: 0, network: true });
    await lostInPlace();
    await user.keyboard('{Escape}');
    await flush();
    expect(pageSays('edit.heldExpiry')).toBe(true);
    expect(pageSays('edit.held')).toBe(false);
    const writes = changes().length;
    await user.click(screen.getAllByRole('button', { name: strings['held.dismiss'] })[0]!);
    const ask = await screen.findByRole('alertdialog', { name: strings['held.dismissTitle'] });
    await user.click(within(ask).getByRole('button', { name: strings['held.dismiss'] }));
    await flush();
    expect(held()).toBe(false);
    expect(changes()).toHaveLength(writes);
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(screen.getByRole('button', { name: strings.edit })).toBeEnabled();
  });

  it('a definite success of an in-place N-day edit is never held', async () => {
    const { d } = await openEditOf(M1, 'Deploys go through staging first');
    await pick(d, strings['edit.forget'], strings['edit.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['edit.days'] }), '7');
    const before = Date.now();
    await save();
    expect(held()).toBe(false);
    expect(of('PATCH', '/memory/items/m1')[0]!.body).toEqual({ project: P, kind: 'memory', content: M1_TEXT, ttl_days: 7, expect_realm: R1 });
    expect(Date.parse(String(store.get('m1')!.ForgetAfter)) - before).toBeGreaterThanOrEqual(7 * DAY);
    expect(changes()).toHaveLength(1);
  });

  it('a provable hold (no N days) says the Check again words, on the page too, never the N-day ones', async () => {
    over.edit = () => ({ status: 0, network: true });
    await lostInPlace(false);
    await user.keyboard('{Escape}');
    await flush();
    expect(pageSays('edit.held')).toBe(true);
    expect(held()).toBe(true);
    expect(screen.queryAllByText(strings['edit.heldExpiry'])).toHaveLength(0);
    expect(screen.queryAllByText(strings['edit.heldExpiryNew'])).toHaveLength(0);
  });

  it('an N-day hold of an edit that may have made a new version points at that version, on the page', async () => {
    over.edit = ({ url, body }) => {
      applyEdit(editedId(url), body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    const { d } = await openEditOf(M1, 'Deploys go through staging first');
    const box = d.getByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, 'Deploys go through staging, then canary.');
    await pick(d, strings['edit.forget'], strings['edit.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['edit.days'] }), '7');
    await save();
    await user.keyboard('{Escape}');
    await flush();
    expect(pageSays('edit.heldExpiryNew')).toBe(true);
    expect(screen.queryAllByText(strings['edit.heldExpiry'])).toHaveLength(0);
    await checkAgain();
    expect(pageSays('edit.heldExpiryNew')).toBe(true);
    expect(changes()).toHaveLength(1);
  });

  const L7 = `/ai/knowledge/memory?project=${P}&kind=lesson&sel=7`;
  const lesson = () => store.set('7', { ID: 7, Content: 'Ask before rotating keys', Context: 'Production keys', Confidence: 0.9, UpdatedAt: '2026-10-25T00:00:00Z' });

  it('a lesson edits its context and confidence (a percent, sent as 0..1); no memory field is offered', async () => {
    lesson();
    const { d } = await openEditOf(L7, 'Ask before rotating keys');
    expect(d.queryByRole('button', { name: new RegExp(strings['edit.type']) })).toBeNull();
    expect(d.queryByRole('textbox', { name: strings['edit.concepts'] })).toBeNull();
    const ctx = d.getByRole('textbox', { name: strings['edit.context'] });
    expect(ctx).toHaveValue('Production keys');
    await user.clear(ctx);
    await user.type(ctx, 'Any key rotation');
    const conf = d.getByRole('textbox', { name: strings['edit.confidence'] });
    expect(conf).toHaveValue('90');
    await user.clear(conf);
    await user.type(conf, '75');
    await save();
    expect(of('PATCH', '/memory/items/7')[0]!.body).toEqual({ project: P, kind: 'lesson', context: 'Any key rotation', confidence: 0.75, expect_realm: R1 });
    expect(store.get('7')).toMatchObject({ Context: 'Any key rotation', Confidence: 0.75 });
  });

  it('a confidence outside 0 to 100 keeps Save off; a lost lesson answer the agent applied is proved by its read-back', async () => {
    lesson();
    const { d } = await openEditOf(L7, 'Ask before rotating keys');
    const conf = d.getByRole('textbox', { name: strings['edit.confidence'] });
    await user.clear(conf);
    await user.type(conf, '120');
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    expect(d.getByText(strings['edit.confidenceBad'])).toBeInTheDocument();
    over.edit = ({ url, body }) => {
      applyEdit(editedId(url), body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    await user.clear(conf);
    await user.type(conf, '40');
    await save();
    if (held()) await checkAgain();
    expect(held()).toBe(false);
    expect(store.get('7')).toMatchObject({ Confidence: 0.4 });
    expect(changes()).toHaveLength(1);
  });

  it('a context-only lesson edit leaves the content out, so a newer content written elsewhere stays', async () => {
    lesson();
    const { d } = await openEditOf(L7, 'Ask before rotating keys');
    const ctx = d.getByRole('textbox', { name: strings['edit.context'] });
    await user.clear(ctx);
    await user.type(ctx, 'Staging keys too');
    // Another writer replaces the content after the form read it; nothing here reads it again before Save.
    store.set('7', { ...store.get('7')!, Content: 'Ask twice before rotating keys' });
    await save();
    expect(of('PATCH', '/memory/items/7')[0]!.body).toEqual({ project: P, kind: 'lesson', context: 'Staging keys too', expect_realm: R1 });
    expect(store.get('7')).toMatchObject({ Content: 'Ask twice before rotating keys', Context: 'Staging keys too' });
  });

  it('an unseen earlier writer\'s 7-day date, or a later writer\'s, does not prove a lost 7-day edit never applied', async () => {
    over.edit = () => ({ status: 0, network: true });
    const { d } = await openEditOf(M1, 'Deploys go through staging first');
    // another writer sets 7 days after the drawer read the record, before Save
    store.set('m1', { ...store.get('m1')!, ForgetAfter: new Date(Date.now() + 7 * DAY - 5 * 60_000).toISOString() });
    await pick(d, strings['edit.forget'], strings['edit.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['edit.days'] }), '7');
    await save();
    expect(heldExpiry()).toBe(true);
    await checkAgain();
    expect(heldExpiry()).toBe(true);
    // a writer after it sets 7 days too
    store.set('m1', { ...store.get('m1')!, ForgetAfter: new Date(Date.now() + 7 * DAY + 120_000).toISOString() });
    await checkAgain();
    expect(heldExpiry()).toBe(true);
    expect(changes()).toHaveLength(1);
  });
});

describe('New memory (sent once, C9; no idempotency key, so a lost answer is never resent)', () => {
  const drawer = async () => within(await screen.findByRole('dialog', { name: strings['create.title'] }));
  const openNew = async () => {
    const router = await inProject();
    await user.click(await screen.findByRole('button', { name: strings['create.new'] }));
    return { router, d: await drawer() };
  };
  const pick = async (d: Awaited<ReturnType<typeof drawer>>, label: string, option: string) => {
    await user.click(d.getByRole('button', { name: new RegExp(label) }));
    await user.click(await screen.findByRole('option', { name: option }));
  };
  /** Opens More options (concepts, files and the forget choice fold there; a new draft starts with it closed). */
  const more = async (d: Awaited<ReturnType<typeof drawer>>) => {
    await user.click(d.getByRole('button', { name: strings['edit.more'] }));
  };
  const write = async (d: Awaited<ReturnType<typeof drawer>>, text: string) => {
    await user.type(d.getByRole('textbox', { name: strings['edit.content'] }), text);
  };
  const save = async () => {
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
  };
  // The form's own band when the form is open (a press on the page behind a drawer closes the drawer), else the page's.
  const checkButton = () => {
    const open = screen.queryByRole('dialog', { name: strings['create.title'] });
    return (open ? within(open) : screen).getAllByRole('button', { name: strings['held.check'] })[0]!;
  };
  const checkAgain = async () => {
    await user.click(checkButton());
    await flush();
  };
  const posts = () => of('POST', '/memory/items');
  const held = (k: 'create.held' | 'create.heldExpiry' | 'create.foundHeld' = 'create.held') => screen.queryAllByText(strings[k]).length > 0;
  const content = async () => ((await drawer()).getByRole('textbox', { name: strings['edit.content'] }) as HTMLTextAreaElement).value;
  const stopTracking = async () => {
    await user.click((await drawer()).getByRole('button', { name: strings['held.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg.textContent).toContain(strings['create.dismissBody']);
    await user.click(within(dlg).getByRole('button', { name: strings['held.dismiss'] }));
    await flush();
  };
  const sel = (router: Awaited<ReturnType<typeof show>>) => (router.state.location.search as Record<string, unknown>).sel;

  it('sends one POST with every field, the realm twice-named, and opens the saved memory', async () => {
    const { router, d } = await openNew();
    await write(d, '  Releases are tagged on Fridays.  ');
    await pick(d, strings['edit.type'], 'workflow');
    await pick(d, strings['edit.strength'], '9');
    await more(d);
    await user.type(d.getByRole('textbox', { name: strings['edit.concepts'] }), 'release{enter}tags');
    await save();
    expect(posts()).toHaveLength(1);
    const c = posts()[0]!;
    expect(u(c.url).searchParams.get('realm')).toBe(R1);
    expect(c.body).toEqual({ project: P, content: '  Releases are tagged on Fridays.  ', type: 'workflow', strength: 9, concepts: ['release', 'tags'], files: [], expect_realm: R1 });
    await waitFor(() => expect(sel(router)).toBe('n1'));
    expect(changes()).toHaveLength(1);
  });

  it('a md drawer; concepts, files and the forget choice fold under More options, held open while a day count blocks Save', async () => {
    const { d } = await openNew();
    const toggle = d.getByRole('button', { name: strings['edit.more'] });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(d.queryByRole('textbox', { name: strings['edit.concepts'] })).toBeNull();
    expect(d.getByRole('textbox', { name: strings['edit.content'] })).toBeInTheDocument();
    await user.click(toggle);
    expect(d.getByRole('textbox', { name: strings['edit.concepts'] })).toBeInTheDocument();
    await write(d, 'x');
    await pick(d, strings['edit.forget'], strings['create.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['create.days'] }), '0');
    await user.click(toggle);
    expect(toggle, 'a bad day count keeps it open').toHaveAttribute('aria-expanded', 'true');
    expect(d.getByText(interpolate(strings['edit.daysBad'], { max: '106751' }))).toBeInTheDocument();
    await user.clear(d.getByRole('textbox', { name: strings['create.days'] }));
    await user.type(d.getByRole('textbox', { name: strings['create.days'] }), '3');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(changes()).toHaveLength(0);
  });

  it('a forget-after choice sends ttl_days; Never sends none', async () => {
    const { d } = await openNew();
    await write(d, 'Rotate the CI key');
    await more(d);
    await pick(d, strings['edit.forget'], strings['create.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['create.days'] }), '30');
    await save();
    expect(posts()[0]!.body).toMatchObject({ ttl_days: 30 });
  });

  it('empty content or a bad day count cannot be sent', async () => {
    const { d } = await openNew();
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    // forms-required: the footer says what Save waits for while no field does.
    expect(screen.getByText(strings['create.needContent'])).toBeInTheDocument();
    await write(d, '   ');
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    expect(screen.getByText(strings['create.needContent'])).toBeInTheDocument();
    await write(d, 'x');
    expect(screen.queryByText(strings['create.needContent'])).toBeNull();
    await more(d);
    await pick(d, strings['edit.forget'], strings['create.forget.days']);
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    expect(screen.getByText(strings['edit.needDays'])).toBeInTheDocument();
    await user.type(d.getByRole('textbox', { name: strings['create.days'] }), '0');
    expect(screen.queryByText(strings['edit.needDays'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['edit.go'] })).toBeDisabled();
    expect(changes()).toHaveLength(0);
  });

  it('the realm-wide scope (no memories kept there) offers no New memory; a project does', async () => {
    await show();
    expect(screen.queryByRole('button', { name: strings['create.new'] })).toBeNull();
    await user.click(await screen.findByText(strings['p.wide']));
    await flush();
    expect(screen.queryByRole('button', { name: strings['create.new'] })).toBeNull();
    cleanup();
    await inProject();
    expect(await screen.findByRole('button', { name: strings['create.new'] })).toBeInTheDocument();
  });

  it('answer lost, a later read finds it and offers Open it; the draft is kept; Stop tracking ends the hold', async () => {
    let late: Record<string, unknown> | null = null;
    over.create = ({ body }) => {
      late = body as Record<string, unknown>;
      return { status: 0, network: true };
    };
    const { router, d } = await openNew();
    await write(d, 'Staging data is wiped on Sundays.');
    await save();
    expect(held()).toBe(true);
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    // The write lands after the answer was lost: the first read does not show it.
    await checkAgain();
    expect(held()).toBe(true);
    applyCreate(late!);
    await checkAgain();
    // Found, never settled: still held, nothing opened by itself, nothing sent again.
    expect(held('create.foundHeld')).toBe(true);
    expect(sel(router)).toBeUndefined();
    expect(posts()).toHaveLength(1);
    // Open it opens the record (the form closes; its draft is kept).
    await user.click((await drawer()).getByRole('button', { name: strings['held.open'] }));
    await flush();
    await waitFor(() => expect(sel(router)).toBe('n1'));
    expect(held('create.foundHeld')).toBe(true);
    await user.click(screen.getByRole('button', { name: strings['create.new'] }));
    // The hold stays until the person ends it; then the found save's draft is dropped.
    await stopTracking();
    expect(held('create.foundHeld')).toBe(false);
    expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull();
    await user.click(screen.getByRole('button', { name: strings['create.new'] }));
    expect(await content()).toBe('');
    expect(changes()).toHaveLength(1);
  });

  it('the read fails, the item stays held: Check again reads, never resends; once reads answer it is found, still held', async () => {
    over.create = ({ body }) => {
      applyCreate(body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    const { router, d } = await openNew();
    await write(d, 'Staging data is wiped on Sundays.');
    // Every read fails from the save on: the record is there, but nothing reads it.
    const boom: Reply = { status: 500, body: { error: 'boom', code: 'internal_error' } };
    over.items = () => boom;
    over.item = () => boom;
    await save();
    expect(held()).toBe(true);
    await checkAgain();
    expect(held()).toBe(true);
    expect(held('create.foundHeld')).toBe(false);
    expect(posts()).toHaveLength(1);
    delete over.items;
    delete over.item;
    await checkAgain();
    await waitFor(() => expect(held('create.foundHeld')).toBe(true));
    expect(sel(router)).toBeUndefined();
    expect(posts()).toHaveLength(1);
    expect(changes()).toHaveLength(1);
  });

  it('a new memory with the same words but another strength (another writer\'s) proves nothing', async () => {
    over.create = ({ body }) => {
      applyCreate({ ...(body as Record<string, unknown>), strength: 2 });
      return { status: 0, network: true };
    };
    const { router, d } = await openNew();
    await write(d, 'Staging data is wiped on Sundays.');
    await save();
    await checkAgain();
    expect(held()).toBe(true);
    expect(sel(router)).toBeUndefined();
    expect(changes()).toHaveLength(1);
  });

  it('an identical memory already on the list before the save proves nothing', async () => {
    applyCreate({ project: P, content: 'Staging data is wiped on Sundays.', type: 'fact', strength: 7, concepts: [], files: [] });
    over.create = () => ({ status: 0, network: true });
    const { router, d } = await openNew();
    await write(d, 'Staging data is wiped on Sundays.');
    await save();
    await checkAgain();
    expect(held()).toBe(true);
    expect(sel(router)).toBeUndefined();
    expect(changes()).toHaveLength(1);
  });

  it('an identical older memory (made long before the save) that an edit moved up the list proves nothing', async () => {
    store.set('o1', { ID: 'o1', Type: 'fact', Title: 'Staging data is wiped on Sundays.', Content: 'Staging data is wiped on Sundays.', Strength: 7, Version: 1, ParentID: '', IsLatest: true, Concepts: null, Files: null, CreatedAt: '2026-01-01T00:00:00Z', UpdatedAt: '2026-01-01T00:00:00Z', ForgetAfter: null });
    // the list's first page at Save does not hold it (as if it were on page 2)
    let lifted = false;
    over.items = ({ url }) => (url.searchParams.get('kind') === 'memory' && !lifted ? { status: 200, body: { items: latestMemories().filter((m) => m.id !== 'o1'), meta: { total: 3, page: 1, limit: 50 } } } : undefined);
    over.create = () => {
      // nothing saved; meanwhile a strength-only edit moves o1 to the top (same version, new UpdatedAt)
      store.set('o1', { ...store.get('o1')!, UpdatedAt: new Date(Date.now() + 60_000).toISOString() });
      lifted = true;
      return { status: 0, network: true };
    };
    const { router, d } = await openNew();
    await write(d, 'Staging data is wiped on Sundays.');
    await save();
    await checkAgain();
    expect(held()).toBe(true);
    expect(sel(router)).toBeUndefined();
    expect(of('GET', '/memory/items/o1').length).toBeGreaterThan(0);
    expect(changes()).toHaveLength(1);
  });

  it('a 2xx answer without status ok and the new id is held, never a finished save', async () => {
    over.create = () => ({ status: 200, body: { status: 'ok' } });
    const { router, d } = await openNew();
    await write(d, 'x');
    await save();
    expect(held()).toBe(true);
    expect(screen.queryByText(strings['edit.done'])).toBeNull();
    expect(sel(router)).toBeUndefined();
    expect(posts()).toHaveLength(1);
  });

  it('two held saves in a row: each is found by its own record, and Open it opens that one', async () => {
    over.create = ({ body }) => {
      applyCreate(body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    const { router, d } = await openNew();
    await write(d, 'First lost save');
    await save();
    await waitFor(() => expect(held('create.foundHeld')).toBe(true));
    await stopTracking();
    // The found save's draft is dropped and the form closes; a new one opens empty.
    expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull();
    await user.click(screen.getByRole('button', { name: strings['create.new'] }));
    const d2 = await drawer();
    expect(await content()).toBe('');
    await write(d2, 'Second lost save');
    await save();
    await waitFor(() => expect(held('create.foundHeld')).toBe(true));
    await user.click((await drawer()).getByRole('button', { name: strings['held.open'] }));
    await flush();
    await waitFor(() => expect(sel(router)).toBe('n2'));
    expect(posts()).toHaveLength(2);
  });

  it('a hold that ends elsewhere (Stop tracking in another tab) drops nothing here: the draft stays', async () => {
    over.create = () => ({ status: 0, network: true });
    const { router, d } = await openNew();
    await write(d, 'Kept words');
    await save();
    expect(held()).toBe(true);
    const [h] = pendingOf(lockBase('agent.memory_create'));
    await act(async () => { await release(h!.scope, h!.digest, holdOfLock(h!.scope, h!.digest)!); });
    await flush();
    expect(held()).toBe(false);
    expect(await content()).toBe('Kept words');
    expect(sel(router)).toBeUndefined();
    expect(posts()).toHaveLength(1);
  });

  it('a slow Check again, the hold released elsewhere, new words typed: the words survive the late answer', async () => {
    over.create = ({ body }) => {
      applyCreate(body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    const { d } = await openNew();
    await write(d, 'Original words');
    await save();
    await waitFor(() => expect(held('create.foundHeld')).toBe(true));
    // Every read from now on waits until the test lets it go.
    let go: () => void = () => undefined;
    const gate = new Promise<void>((r) => { go = r; });
    const slow = (reply: () => Reply) => gate.then(reply);
    over.items = () => slow(() => ({ status: 200, body: { items: latestMemories(), meta: { total: latestMemories().length, page: 1, limit: 50 } } }));
    over.item = ({ url }) => slow(() => ({ status: 200, body: { status: 'ok', record: store.get(editedId(url)) } }));
    await user.click(checkButton());
    const [h] = pendingOf(lockBase('agent.memory_create'));
    await act(async () => { await release(h!.scope, h!.digest, holdOfLock(h!.scope, h!.digest)!); });
    await flush();
    await user.type((await drawer()).getByRole('textbox', { name: strings['edit.content'] }), ' and more');
    await act(async () => { go(); });
    await flush();
    expect(await content()).toBe('Original words and more');
    expect(posts()).toHaveLength(1);
  });

  it('Stop tracking here of a save not found keeps the draft', async () => {
    over.create = () => ({ status: 0, network: true });
    await openNew();
    const d = await drawer();
    await write(d, 'Kept words');
    await save();
    await stopTracking();
    expect(held()).toBe(false);
    expect(await content()).toBe('Kept words');
    expect(posts()).toHaveLength(1);
  });

  it('a lost save that sets N days is never proved by a read; it says to look for it, then Stop tracking', async () => {
    over.create = ({ body }) => {
      applyCreate(body as Record<string, unknown>);
      return { status: 0, network: true };
    };
    const { router, d } = await openNew();
    await write(d, 'Rotate the CI key');
    await more(d);
    await pick(d, strings['edit.forget'], strings['create.forget.days']);
    await user.type(d.getByRole('textbox', { name: strings['create.days'] }), '30');
    await save();
    await checkAgain();
    expect(held('create.heldExpiry')).toBe(true);
    expect(sel(router)).toBeUndefined();
    await stopTracking();
    expect(held('create.heldExpiry')).toBe(false);
    // Nothing was found, so the draft is kept.
    expect(await content()).toBe('Rotate the CI key');
    expect(changes()).toHaveLength(1);
  });

  it.each([
    ['409 realm_mismatch', { status: 409, body: { error: 'expect_realm does not match', code: 'realm_mismatch' } } as Reply],
    ['503 store_unavailable', { status: 503, body: { error: 'memory store unavailable', code: 'store_unavailable' } } as Reply],
    ['503 service_unavailable', { status: 503, headers: { 'Retry-After': '5' }, body: { error: "this realm's memory is not connected on the agent right now", code: 'service_unavailable' } } as Reply],
  ])('a save answered %s is failed (nothing written), never held', async (_n, reply) => {
    over.create = () => reply;
    const { d } = await openNew();
    await write(d, 'x');
    await save();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
    expect(held()).toBe(false);
    expect(posts()).toHaveLength(1);
  });

  it('a save answered 502 memory_outcome_unknown is held', async () => {
    over.create = () => ({ status: 502, body: { error: 'the memory data host did not confirm the write, so it may or may not have been applied', code: 'memory_outcome_unknown' } });
    const { d } = await openNew();
    await write(d, 'x');
    await save();
    expect(held()).toBe(true);
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(posts()).toHaveLength(1);
  });
});

describe('a 2xx edit answer is a finished edit only when it names the record', () => {
  const editContent = async (text: string) => {
    await user.click(screen.getByRole('button', { name: strings.edit }));
    const box = await screen.findByRole('textbox', { name: strings['edit.content'] });
    await user.clear(box);
    await user.type(box, text);
    await user.click(screen.getByRole('button', { name: strings['edit.go'] }));
    await flush();
  };

  it.each([
    ['status ok without an id', { status: 'ok' }],
    ['an id without status ok', { id: 'm1' }],
    ['status error with an id', { status: 'error', id: 'm1' }],
  ])('a memory edit answered 200 with %s is held, never Saved, sent once', async (_n, body) => {
    over.edit = () => ({ status: 200, body });
    await openM1();
    await editContent('New words');
    expect(screen.getAllByText(strings['edit.held']).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    expect(of('PATCH', '/memory/items/m1')).toHaveLength(1);
    expect(changes()).toHaveLength(1);
  });

  it('a slot edit answered status ok with its name (the agent names a slot, not an id) is Saved', async () => {
    over.items = ({ url }) => (url.searchParams.get('kind') === 'slot' ? { status: 200, body: { items: [{ Name: 'current_focus', Content: 'billing' }], meta: { total: 1 } } } : undefined);
    over.item = () => ({ status: 200, body: { record: { Name: 'current_focus', Content: 'billing' } } });
    over.edit = () => ({ status: 200, body: { status: 'ok', name: 'current_focus' } });
    await show(`/ai/knowledge/memory?project=${P}&kind=slot&sel=current_focus`);
    await screen.findByRole('button', { name: strings.edit });
    await editContent('payments');
    expect(screen.queryAllByText(strings['edit.held'])).toHaveLength(0);
    expect(of('PATCH', '/memory/items/current_focus')).toHaveLength(1);
  });
});

describe('delete selected (sent once, C9)', () => {
  const rowBoxes = () => screen.getAllByRole('checkbox', { name: 'Select row' });
  const pickAll = async () => {
    for (const b of rowBoxes()) await user.click(b);
  };
  const deleteSelected = async (n: number) => {
    await user.click(screen.getByRole('button', { name: strings['many.go'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(interpolate(strings['many.title_other'], { count: n }))).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
  };
  const heldOf = (n: number) => interpolate(strings['many.held_other'], { count: n });
  const checkAgain = async () => {
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
  };

  it('asks first, then sends one DELETE naming the selected ids, the project, the kind and the realm; the answer clears the selection', async () => {
    await inProject();
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    over.remove = ({ body }) => {
      for (const id of (body as { ids: string[] }).ids) store.delete(id);
      return { status: 200, body: { status: 'ok', deleted: 3 } };
    };
    await deleteSelected(2);
    const c = of('DELETE', '/memory/items');
    expect(c).toHaveLength(1);
    expect(u(c[0]!.url).searchParams.get('realm')).toBe(R1);
    const body = c[0]!.body as { ids: string[] };
    expect([...body.ids].sort()).toEqual(['m1', 'm2']);
    expect(body).toEqual({ ids: body.ids, project: P, kind: 'memory', expect_realm: R1 });
    expect(screen.getByText(strings['del.done'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['many.go'] })).toBeNull();
    expect(screen.queryAllByRole('checkbox', { name: 'Select row' }).every((b) => !(b as HTMLInputElement).checked)).toBe(true);
  });

  it('an answered delete clears the selection even when the rows are still listed (a delete the agent answered with 0)', async () => {
    over.remove = () => ({ status: 200, body: { status: 'ok', deleted: 0 } });
    await inProject();
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await deleteSelected(2);
    expect(rowBoxes()).toHaveLength(2);
    expect(rowBoxes().every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    expect(screen.queryByRole('button', { name: strings['many.go'] })).toBeNull();
  });

  it('a slot list offers no selection (a slot deletes one at a time, by name)', async () => {
    over.items = ({ url }) => (url.searchParams.get('kind') === 'slot' ? { status: 200, body: { items: [{ Name: 'current_focus', Content: 'billing' }], meta: { total: 1 } } } : undefined);
    await show(`/ai/knowledge/memory?project=${P}&kind=slot`);
    await screen.findByText('current_focus');
    expect(screen.queryAllByRole('checkbox', { name: 'Select row' })).toHaveLength(0);
  });

  it('a lost answer is held with the count; Check again with some gone says how many and keeps it; all gone frees it; nothing is sent again', async () => {
    over.remove = () => ({ status: 0, network: true });
    await inProject();
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await deleteSelected(2);
    expect(screen.getByText(heldOf(2))).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    store.delete('m1');
    await checkAgain();
    expect(screen.getByText(interpolate(strings['many.heldPart'], { gone: 1, count: 2 }))).toBeInTheDocument();
    expect(screen.queryByText(strings['del.done'])).toBeNull();
    store.delete('m2');
    await checkAgain();
    await waitFor(() => expect(screen.queryByText(interpolate(strings['many.heldPart'], { gone: 1, count: 2 }))).toBeNull());
    expect(screen.queryByText(heldOf(2))).toBeNull();
    expect(screen.getByText(strings['del.done'])).toBeInTheDocument();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
    expect(pendingOf(lockBase('agent.memory_delete'))).toHaveLength(0);
  });

  it('every record gone but the status read failing proves nothing: still held', async () => {
    over.remove = () => ({ status: 0, network: true });
    await inProject();
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await deleteSelected(2);
    store.delete('m1');
    store.delete('m2');
    over.status = () => ({ status: 404, body: { error: 'not found', code: 'not_found' } });
    await checkAgain();
    expect(screen.queryByText(strings['del.done'])).toBeNull();
    delete over.status;
    await user.click(screen.getAllByRole('button', { name: /try again/i })[0]!);
    await flush();
    expect(await screen.findByText(heldOf(2))).toBeInTheDocument();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it.each([
    ['a 2xx without a deleted count', { status: 200, body: { status: 'ok' } }],
    ['a 502 partial (a later chunk failed after an earlier one committed)', { status: 502, body: { error: 'some deleted', code: 'memory_outcome_unknown', partial: true, deleted: 1 } }],
    ['a 503 incomplete lesson delete', { status: 503, body: { error: 'store unavailable', code: 'store_unavailable', deleted: 1, incomplete: true } }],
  ] as const)('%s is held, not shown as failed', async (_n, reply) => {
    over.remove = () => reply as Reply;
    await inProject();
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await deleteSelected(2);
    expect(screen.getByText(heldOf(2))).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('a 400 refusal is shown, not held', async () => {
    over.remove = () => ({ status: 400, body: { error: 'ids is required', code: 'bad_request' } });
    await inProject();
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await deleteSelected(2);
    expect(screen.queryByText(heldOf(2))).toBeNull();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
  });

  it('Stop tracking ends the hold, sends nothing again, and Delete selected is offered again', async () => {
    over.remove = () => ({ status: 0, network: true });
    await inProject();
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await deleteSelected(2);
    await user.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(strings['many.dismissBody'])).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: strings['held.dismiss'] }));
    await flush();
    expect(screen.queryByText(heldOf(2))).toBeNull();
    expect(pendingOf(lockBase('agent.memory_delete'))).toHaveLength(0);
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('a delete held in another store of this project is named, and Show them opens that store with its Check again', async () => {
    over.remove = () => ({ status: 0, network: true });
    await show(`/ai/knowledge/memory?project=${P}&kind=lesson`);
    await screen.findByText('Ask before rotating keys');
    await pickAll();
    await user.click(screen.getByRole('button', { name: strings['many.go'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(interpolate(strings['many.title_one'], { count: 1 }))).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
    expect(screen.getByText(interpolate(strings['many.held_one'], { count: 1 }))).toBeInTheDocument();
    await act(async () => { cleanup(); });
    await inProject();
    await screen.findByText('The test DB resets nightly');
    expect(screen.getByText(strings['held.notice.removeMany'])).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings['many.show'] }));
    await flush();
    expect(await screen.findByText(interpolate(strings['many.held_one'], { count: 1 }))).toBeInTheDocument();
    expect(screen.queryByText(strings['held.notice.removeMany'])).toBeNull();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });
});

describe('delete selected: a question, an answer and a hold stay in their own store', () => {
  const LIST = (kind: string) => `/ai/knowledge/memory?project=${P}&kind=${kind}`;
  const go = async (router: Awaited<ReturnType<typeof show>>, at: string) => {
    await act(async () => { router.history.push(at); });
    await flush();
  };
  const pickAll = async () => {
    for (const b of screen.getAllByRole('checkbox', { name: 'Select row' })) await user.click(b);
  };
  const ask = async () => {
    await user.click(screen.getByRole('button', { name: strings['many.go'] }));
    return screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
  };
  const confirm = async (dlg: HTMLElement) => {
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
  };
  const memHeld = interpolate(strings['many.held_other'], { count: 2 });
  const lessonHeld = interpolate(strings['many.held_one'], { count: 1 });
  const dialogs = () => [...screen.queryAllByRole('alertdialog'), ...screen.queryAllByRole('dialog')];
  /** Memories m1,m2 held, then lesson 7 held; ends on Lessons. */
  const holdBoth = async () => {
    over.remove = () => ({ status: 0, network: true });
    const router = await show(LIST('memory'));
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await confirm(await ask());
    expect(screen.getByText(memHeld)).toBeInTheDocument();
    await go(router, LIST('lesson'));
    await screen.findByText('Ask before rotating keys');
    await pickAll();
    await confirm(await ask());
    expect(screen.getByText(lessonHeld)).toBeInTheDocument();
    return router;
  };

  it('the delete openers are secondary, the confirm is danger', async () => {
    await show(`${LIST('memory')}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    expect(screen.getByRole('button', { name: strings.del })).toHaveAttribute('data-variant', 'secondary');
    await pickAll();
    expect(screen.getByRole('button', { name: strings['many.go'] })).toHaveAttribute('data-variant', 'secondary');
    const dlg = await ask();
    expect(within(dlg).getByRole('button', { name: strings['del.go'] })).toHaveAttribute('data-variant', 'danger');
  });

  it('a question asked in one store closes when another store is shown, and nothing is sent', async () => {
    const router = await show(LIST('lesson'));
    await screen.findByText('Ask before rotating keys');
    await pickAll();
    await ask();
    await go(router, LIST('observation'));
    expect(dialogs()).toHaveLength(0);
    await go(router, LIST('lesson'));
    expect(dialogs()).toHaveLength(0);
    expect(of('DELETE', '/memory/items')).toHaveLength(0);
  });

  it('a record named by a held delete of several cannot be deleted on its own; nothing more is sent', async () => {
    over.remove = () => ({ status: 0, network: true });
    const router = await show(LIST('memory'));
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await confirm(await ask());
    await go(router, `${LIST('memory')}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('a held delete of one record of the store keeps Delete selected waiting', async () => {
    over.remove = () => ({ status: 0, network: true });
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.del }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    await pickAll();
    expect(screen.getByRole('button', { name: strings['many.go'] })).toBeDisabled();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('Stop tracking asked for one store’s hold closes when another store is shown; both holds stay', async () => {
    const router = await holdBoth();
    await go(router, LIST('memory'));
    expect(await screen.findByText(memHeld)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    expect(screen.getByText(strings['many.dismissBody'])).toBeInTheDocument();
    await go(router, LIST('lesson'));
    expect(screen.queryByText(strings['many.dismissBody'])).toBeNull();
    expect(screen.getByText(lessonHeld)).toBeInTheDocument();
    expect(pendingOf(lockBase('agent.memory_delete'))).toHaveLength(2);
    expect(of('DELETE', '/memory/items')).toHaveLength(2);
  });

  it('with two stores held, each one names the other', async () => {
    const router = await holdBoth();
    expect(screen.getByText(strings['held.notice.removeMany'])).toBeInTheDocument();
    await go(router, LIST('memory'));
    expect(await screen.findByText(memHeld)).toBeInTheDocument();
    expect(screen.getByText(strings['held.notice.removeMany'])).toBeInTheDocument();
  });

  it('a delete answered or proved in one store shows Deleted there only', async () => {
    const router = await show(LIST('memory'));
    await screen.findByText('The test DB resets nightly');
    await pickAll();
    await confirm(await ask());
    expect(screen.getByText(strings['del.done'])).toBeInTheDocument();
    await go(router, LIST('lesson'));
    await screen.findByText('Ask before rotating keys');
    expect(screen.queryByText(strings['del.done'])).toBeNull();
    // Proved by Check again in Lessons, then Memories shown.
    over.remove = () => ({ status: 0, network: true });
    over.item = ({ url }) => (editedId(url) === '7' ? { status: 404, body: { error: 'not found', code: 'not_found' } } : undefined);
    await pickAll();
    await confirm(await ask());
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    expect(screen.getByText(strings['del.done'])).toBeInTheDocument();
    await go(router, LIST('memory'));
    expect(screen.queryByText(strings['del.done'])).toBeNull();
  });
});

describe('delete selected: a delete still out holds back the other, and an earlier proof never stands for a later hold', () => {
  const LIST = `/ai/knowledge/memory?project=${P}&kind=memory`;
  const rowOf = (root: HTMLElement, title: string) => within(root).getAllByRole('row').find((r) => r.textContent?.includes(title))!;
  const later = () => {
    let answer: (r: Reply) => void = () => undefined;
    const p = new Promise<Reply>((res) => { answer = res; });
    return { p, answer: (r: Reply) => answer(r) };
  };
  const confirmIn = async (root: HTMLElement) => {
    await user.click(within(root).getByRole('button', { name: strings['many.go'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
  };
  /** A second page of the same account in the same document: another tab sharing core's registry. */
  async function tab(at: string) {
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <MemoryView computer="atlas" /> }),
      history: createMemoryHistory({ initialEntries: [at] }),
    });
    let root!: HTMLElement;
    await act(async () => {
      root = render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>).container;
      await router.load();
    });
    await flush();
    return root;
  }

  it('while a delete of several is out, a record it names cannot be deleted on its own', async () => {
    const out = later();
    over.remove = () => out.p;
    const router = await show(LIST);
    await screen.findByText('The test DB resets nightly');
    for (const b of screen.getAllByRole('checkbox', { name: 'Select row' })) await user.click(b);
    await confirmIn(document.body);
    await act(async () => { router.history.push(`${LIST}&sel=m1`); });
    await flush();
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
    await act(async () => { out.answer({ status: 200, body: { status: 'ok', deleted: 2 } }); });
    await flush();
  });

  it('while a delete of one record is out, Delete selected waits', async () => {
    const out = later();
    over.remove = () => out.p;
    await openM1();
    await user.click(screen.getByRole('button', { name: strings.del }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
    await user.click(within(rowOf(document.body, 'The test DB resets nightly')).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: strings['many.go'] })).toBeDisabled();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
    await act(async () => { out.answer({ status: 200, body: { status: 'ok', deleted: 1 } }); });
    await flush();
  });

  it('a proof shown in one tab is dropped when another tab’s delete of the store is held; Stop tracking it shows no Deleted', async () => {
    over.remove = () => ({ status: 0, network: true });
    const a = await tab(LIST);
    await within(a).findByText('The test DB resets nightly');
    await user.click(within(rowOf(a, 'The test DB resets nightly')).getByRole('checkbox'));
    await confirmIn(a);
    await flush();
    store.delete('m2');
    await user.click(within(a).getByRole('button', { name: strings['held.check'] }));
    await flush();
    expect(within(a).getByText(strings['del.done'])).toBeInTheDocument();
    // Tab B deletes m1; its answer is lost, so both tabs show the hold.
    const b = await tab(LIST);
    await within(b).findByText('Deploys go through staging first');
    await user.click(within(rowOf(b, 'Deploys go through staging first')).getByRole('checkbox'));
    await confirmIn(b);
    await flush();
    expect(within(a).getByText(interpolate(strings['many.held_one'], { count: 1 }))).toBeInTheDocument();
    expect(within(a).queryByText(strings['del.done'])).toBeNull();
    await user.click(within(a).getByRole('button', { name: strings['held.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await user.click(within(dlg).getByRole('button', { name: strings['held.dismiss'] }));
    await flush();
    expect(pendingOf(lockBase('agent.memory_delete'))).toHaveLength(0);
    expect(within(a).queryByText(strings['del.done'])).toBeNull();
    expect(of('DELETE', '/memory/items')).toHaveLength(2);
  });
});

describe('delete selected: one lock, one key per store: core refuses a second delete of the store from any tab', () => {
  const LIST = `/ai/knowledge/memory?project=${P}&kind=memory`;
  const LOCK = 'agent.memory_delete';
  const rowBox = (title: string) => within(screen.getAllByRole('row').find((r) => r.textContent?.includes(title))!).getByRole('checkbox');
  const dialog = () => screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
  const deleteOne = async () => {
    await user.click(screen.getByRole('button', { name: strings.del }));
    await user.click(within(await dialog()).getByRole('button', { name: strings['del.go'] }));
    await flush();
  };
  const deleteSelected = async () => {
    await user.click(screen.getByRole('button', { name: strings['many.go'] }));
    await user.click(within(await dialog()).getByRole('button', { name: strings['del.go'] }));
    await flush();
  };
  const go = async (router: Awaited<ReturnType<typeof show>>, at: string) => {
    await act(async () => { router.history.push(at); });
    await flush();
  };
  /** Runs `first` as another tab whose write this tab's registry has not read: this tab becomes a new registry (its
   *  own tab id) that loaded the store before the write, and the write lands in storage with no storage event. */
  async function inStaleTab(first: () => Promise<void>) {
    // The browser's shared storage, as two tabs share it.
    // eslint-disable-next-line no-restricted-globals -- a test harness modelling a second tab, not page code
    const ls = localStorage;
    const before = ls.getItem(CHANGE_STORE_KEY);
    await first();
    const after = ls.getItem(CHANGE_STORE_KEY);
    expect(after).not.toBe(before);
    if (before === null) ls.removeItem(CHANGE_STORE_KEY); else ls.setItem(CHANGE_STORE_KEY, before);
    await act(async () => { reloadChangesForTests(); });
    ls.setItem(CHANGE_STORE_KEY, after!);
    await flush();
    expect(pendingOf(lockBase(LOCK))).toHaveLength(0);
  }

  it('a record\'s delete and a delete of several of the same store are one core record (one lock, one key)', async () => {
    over.remove = () => ({ status: 0, network: true });
    await openM1();
    await deleteOne();
    const [one] = pendingOf(lockBase(LOCK));
    await user.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    await user.click(within(await dialog()).getByRole('button', { name: strings['held.dismiss'] }));
    await flush();
    expect(pendingOf(lockBase(LOCK))).toHaveLength(0);
    await user.click(rowBox('The test DB resets nightly'));
    await deleteSelected();
    const [many] = pendingOf(lockBase(LOCK));
    expect([many!.scope, many!.digest]).toEqual([one!.scope, one!.digest]);
  });

  it('a record\'s delete held in another tab: a stale tab\'s Delete selected is refused by core, nothing sent, and then waits', async () => {
    over.remove = () => ({ status: 0, network: true });
    await openM1();
    await inStaleTab(deleteOne);
    expect(screen.queryByText(strings['del.held'])).toBeNull();
    await user.click(rowBox('The test DB resets nightly'));
    expect(screen.getByRole('button', { name: strings['many.go'] })).toBeEnabled();
    await deleteSelected();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
    expect(pendingOf(lockBase(LOCK))).toHaveLength(1);
    expect(screen.getByText(strings['many.waits'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['many.go'] })).toBeDisabled();
  });

  it('a delete of several held in another tab: a stale tab\'s record Delete is refused by core, nothing sent, and then says why it waits', async () => {
    over.remove = () => ({ status: 0, network: true });
    const router = await show(LIST);
    await screen.findByText('The test DB resets nightly');
    await inStaleTab(async () => {
      for (const b of screen.getAllByRole('checkbox', { name: 'Select row' })) await user.click(b);
      await deleteSelected();
    });
    await go(router, `${LIST}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    expect(screen.getByRole('button', { name: strings.del })).toBeEnabled();
    await deleteOne();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
    expect(screen.getByText(strings['del.waits'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
  });

  it('a held delete of one record: another record\'s Delete in the same store is refused by core from a stale tab, and says why it waits', async () => {
    over.remove = () => ({ status: 0, network: true });
    const r = await show(`${LIST}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await inStaleTab(deleteOne);
    await go(r, `${LIST}&sel=m2`);
    await screen.findByRole('heading', { name: 'The test DB resets nightly' });
    await deleteOne();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
    expect(screen.getByText(strings['del.waits'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
    // In a tab that knows the hold, the other record's Delete waits before any press.
    cleanup();
    await act(async () => { reloadChangesForTests(); });
    await show(`${LIST}&sel=m2`);
    await screen.findByRole('heading', { name: 'The test DB resets nightly' });
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
    expect(screen.getByText(strings['del.waits'])).toBeInTheDocument();
  });

  /** A hold an older build sent: the lock and sender of today's single delete, the record's key (lockKey with `id`, so
   *  its own digest) and an identity without `key: 'store'`. Made by core's guarded() from today's hold's meta, which
   *  is then stopped, so the older one is the only hold. */
  async function olderHold(): Promise<void> {
    await deleteOne();
    const [h] = heldChanges(LOCK);
    const [pr] = pendingOf(lockBase(LOCK));
    const { key: _drop, ...identity } = h!.identity as Record<string, unknown>;
    void _drop;
    const digest = await varsDigest({ computer: identity.computer, project: identity.project, kind: identity.kind, id: identity.id });
    const old = await guarded(pr!.scope, digest, async (k) => ({ outcome: 'pending' as const, idem: k ?? 'K-old' }), { base: lockBase(LOCK), target: h!.target, realm: h!.realm, by: h!.by, identity });
    expect(old.outcome).toBe('pending');
    await user.click(screen.getAllByRole('button', { name: strings['held.dismiss'] })[0]!);
    await user.click(within(await dialog()).getByRole('button', { name: strings['held.dismiss'] }));
    await flush();
    expect(pendingOf(lockBase(LOCK)).map((x) => x.digest)).toEqual([digest]);
  }

  it('a hold an older build sent under a key per record still holds both deletes back', async () => {
    over.remove = () => ({ status: 0, network: true });
    const r = await show(`${LIST}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await olderHold();
    await go(r, `${LIST}&sel=m2`);
    await screen.findByRole('heading', { name: 'The test DB resets nightly' });
    expect(screen.getByRole('button', { name: strings.del })).toBeDisabled();
    expect(screen.getByText(strings['del.waits'])).toBeInTheDocument();
    await user.click(rowBox('The test DB resets nightly'));
    expect(screen.getByRole('button', { name: strings['many.go'] })).toBeDisabled();
    expect(screen.getByText(strings['many.waits'])).toBeInTheDocument();
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('an older build\'s hold is proved by Check again under its own key (record gone, status answering)', async () => {
    over.remove = () => ({ status: 0, network: true });
    await show(`${LIST}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await olderHold();
    expect(screen.getByText(strings['del.held'])).toBeInTheDocument();
    store.delete('m1');
    await user.click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await flush();
    await waitFor(() => expect(pendingOf(lockBase(LOCK))).toHaveLength(0));
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });

  it('an older build\'s hold ends with Stop tracking under its own key, nothing sent', async () => {
    over.remove = () => ({ status: 0, network: true });
    await show(`${LIST}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await olderHold();
    await user.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    await user.click(within(await dialog()).getByRole('button', { name: strings['held.dismiss'] }));
    await flush();
    expect(pendingOf(lockBase(LOCK))).toHaveLength(0);
    expect(of('DELETE', '/memory/items')).toHaveLength(1);
  });
});

describe('the store search is the agent\'s ranked search', () => {
  const kit = { pending: 'It may have gone through. Check before you try again.' };
  // The search is no change: it holds nothing under any of the page's locks.
  const noneHeld = () => ['agent.memory_edit', 'agent.memory_delete', 'agent.memory_create', 'agent.memory_enabled'].every((l) => heldChanges(l).length === 0);
  const bodyRows = () => screen.getAllByRole('row').filter((r) => r.closest('tbody'));
  const search = async (text: string) => {
    await user.type(screen.getByPlaceholderText(strings.search), text);
    await flush();
  };
  const sent = () => of('POST', '/memory/search').map((c) => ({ realm: u(c.url).searchParams.get('realm'), body: c.body as Record<string, unknown> }));
  const ready = async () => {
    await inProject();
    await screen.findByText('Deploys go through staging first');
  };

  it('typed text asks the agent\'s ranked search of this project\'s memories, never the listing', async () => {
    await ready();
    const listed = of('GET', '/memory/items').length;
    await search('staging');
    await waitFor(() => expect(sent().length).toBeGreaterThan(0));
    // Sent once typing paused, never per keystroke.
    expect(sent()).toEqual([{ realm: R1, body: { project: P, query: 'staging', limit: 50, kinds: ['memory'] } }]);
    // The listing is not read with text (nor at all for the search).
    expect(of('GET', '/memory/items').some((c) => u(c.url).searchParams.has('query'))).toBe(false);
    expect(of('GET', '/memory/items').length).toBe(listed);
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    expect(screen.getByText('Deploys go through staging first')).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['count.ranked_one'], { count: 1 }))).toBeInTheDocument();
  });

  it('the search waits for typing to pause at least 400 ms (each search is a fused read on the agent)', () => {
    expect(SEARCH_PAUSE_MS).toBeGreaterThanOrEqual(400);
  });

  it('rows come in the agent\'s rank order with their rank, whatever their dates', async () => {
    // The older memory matches more words, so it ranks first (the listing shows the newer first).
    over.search = () => ({ status: 200, body: { status: 'ok', hits: [
      { kind: 'memory', id: 'm2', score: 0.9, type: 'gotcha', title: 'The test DB resets nightly', ts: '2026-10-26T08:00:00Z', importance: 3 },
      { kind: 'memory', id: 'm1', score: 0.4, type: 'decision', title: 'Deploys go through staging first', ts: '2026-10-27T08:00:00Z', importance: 8 },
    ] } });
    await ready();
    await search('db');
    await waitFor(() => expect(bodyRows()[0]!.textContent).toContain('The test DB resets nightly'));
    const [first, second] = bodyRows();
    expect(within(first!).getByText('1')).toBeInTheDocument();
    expect(within(second!).getByText('2')).toBeInTheDocument();
    expect(second!.textContent).toContain('Deploys go through staging first');
    expect(screen.getByRole('columnheader', { name: strings['col.rank'] })).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['count.ranked_other'], { count: 2 }))).toBeInTheDocument();
  });

  it('clearing the box goes back to the newest-first listing, without the rank', async () => {
    await ready();
    await search('staging');
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    await user.clear(screen.getByPlaceholderText(strings.search));
    await flush();
    expect(await screen.findByText('The test DB resets nightly')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: strings['col.rank'] })).toBeNull();
  });

  it('no hits keeps the old empty-result words', async () => {
    await ready();
    await search('nothing-like-this');
    expect(await screen.findByText(strings.noMatch)).toBeInTheDocument();
  });

  it('a failed search shows the old read error and Try again, never "may have gone through", and nothing is held', async () => {
    let fail = true;
    over.search = () => (fail ? { status: 500, body: { error: 'boom', code: 'internal' } } : undefined);
    await ready();
    await search('staging');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0));
    expect(screen.queryByText(kit.pending)).toBeNull();
    expect(screen.queryByText(strings.noMatch)).toBeNull();
    // The listing's rows are not kept under the failed search, as if they were its results.
    expect(screen.queryByText('The test DB resets nightly')).toBeNull();
    expect(screen.queryByText('Deploys go through staging first')).toBeNull();
    expect(noneHeld()).toBe(true);
    const before = sent().length;
    fail = false;
    await user.click(screen.getAllByRole('button', { name: /try again/i })[0]!);
    await flush();
    expect(sent().length).toBe(before + 1);
    expect(await screen.findByText('Deploys go through staging first')).toBeInTheDocument();
  });

  it('a lost answer is a failed search too (not sent again by itself, nothing held)', async () => {
    over.search = () => { throw new TypeError('network'); };
    await ready();
    await search('staging');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0));
    expect(screen.queryByText(kit.pending)).toBeNull();
    expect(noneHeld()).toBe(true);
    expect(sent()).toHaveLength(1);
  });

  it('a malformed answer is a failed search, never "nothing matches"', async () => {
    over.search = () => ({ status: 200, body: { status: 'ok', hits: [{ kind: 'memory', title: 'no id' }] } });
    await ready();
    await search('staging');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0));
    expect(screen.queryByText(strings.noMatch)).toBeNull();
  });

  it('only the newest search\'s answer is shown: an older one that comes later is dropped', async () => {
    let first: ((r: Reply) => void) | null = null;
    over.search = ({ body }) => {
      const q = String((body as { query?: string }).query);
      if (q === 'nightly') return new Promise<Reply>((res) => { first = res; });
      return undefined;
    };
    await ready();
    await search('nightly');
    await user.clear(screen.getByPlaceholderText(strings.search));
    await search('staging');
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    expect(screen.getByText('Deploys go through staging first')).toBeInTheDocument();
    await act(async () => { first?.({ status: 200, body: { status: 'ok', hits: [{ kind: 'memory', id: 'm2', type: 'gotcha', title: 'The test DB resets nightly', ts: '2026-10-26T08:00:00Z', importance: 3 }] } }); });
    await flush();
    expect(screen.queryByText('The test DB resets nightly')).toBeNull();
    expect(screen.getByText('Deploys go through staging first')).toBeInTheDocument();
  });

  it('a hit opens its record', async () => {
    await ready();
    await search('staging');
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    await user.click(screen.getByText('Deploys go through staging first'));
    expect(await screen.findByRole('heading', { name: 'Deploys go through staging first' })).toBeInTheDocument();
    expect(of('GET', '/memory/items/m1').length).toBeGreaterThan(0);
  });

  it('observations search the observation documents only, and a hit of another kind is not listed', async () => {
    over.search = ({ body }) => ((body as { kinds?: string[] }).kinds?.includes('obs') ? { status: 200, body: { status: 'ok', hits: [
      { kind: 'memory', id: 'm1', type: 'decision', title: 'Deploys go through staging first', ts: '2026-10-27T08:00:00Z' },
      { kind: 'obs', id: 'o1', type: 'change', title: 'Ran the tests', narrative: 'Ran the whole suite', ts: '2026-10-27T09:30:00Z', importance: 4 },
    ] } } : undefined);
    await ready();
    await user.click(screen.getAllByRole('radio', { name: strings['kind.observation'] })[0]!);
    await flush();
    await user.type(screen.getByPlaceholderText(strings['search.observation']), 'tests');
    await flush();
    await waitFor(() => expect(sent().at(-1)?.body).toEqual({ project: P, query: 'tests', limit: 50, kinds: ['obs'] }));
    expect(await screen.findByText('Ran the tests')).toBeInTheDocument();
    expect(screen.queryByText('Deploys go through staging first')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: strings['col.tool'] })).toBeNull();
  });

  it('a change that ends (a delete of a found record) searches again, so a gone record leaves the results', async () => {
    let gone = false;
    over.remove = () => { gone = true; return { status: 200, body: { status: 'ok', deleted: 1 } }; };
    over.search = () => (gone ? { status: 200, body: { status: 'ok', hits: [] } } : undefined);
    await show(`/ai/knowledge/memory?project=${P}&sel=m1`);
    await screen.findByRole('heading', { name: 'Deploys go through staging first' });
    await search('staging');
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    const before = sent().length;
    await user.click(screen.getByRole('button', { name: strings.del }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await user.click(within(dlg).getByRole('button', { name: strings['del.go'] }));
    await flush();
    expect(sent().length).toBeGreaterThan(before);
    expect(await screen.findByText(strings.noMatch)).toBeInTheDocument();
  });

  it('the realm-wide scope (lessons and slots) has no search box', async () => {
    await show();
    await user.click(await screen.findByText(strings['p.wide']));
    await flush();
    expect(await screen.findByText('Ask before rotating keys')).toBeInTheDocument();
    await user.click(screen.getAllByRole('radio', { name: strings['kind.slot'] })[0]!);
    await flush();
    expect(screen.queryByPlaceholderText(strings.search)).toBeNull();
    expect(screen.queryByPlaceholderText(strings['search.observation'])).toBeNull();
    expect(sent()).toHaveLength(0);
  });
});

describe('search: the rows, the timing and the notices of a search', () => {
  const bodyRows = () => screen.queryAllByRole('row').filter((r) => r.closest('tbody'));
  const sent = () => of('POST', '/memory/search');
  const box = () => screen.getByPlaceholderText(strings.search);
  const ready = async () => {
    await inProject();
    await screen.findByText('Deploys go through staging first');
  };
  const later = () => {
    let settle: (r: Reply) => void = () => {};
    const p = new Promise<Reply>((res) => { settle = res; });
    return { p, settle: (r: Reply) => settle(r) };
  };
  const answerOf = (...ids: Array<'m1' | 'm2'>): Reply => ({ status: 200, body: { status: 'ok', hits: ids.map((id) => ({ kind: 'memory', id, type: 'decision', title: id === 'm1' ? 'Deploys go through staging first' : 'The test DB resets nightly', ts: '2026-10-27T08:00:00Z', importance: 5 })) } });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('nothing is sent before typing has paused 400 ms; then the search goes once', async () => {
    await ready();
    const t0 = performance.now();
    fireEvent.change(box(), { target: { value: 'staging' } });
    await act(async () => { await sleep(350); });
    // A late timer can only make the check later: past 400 ms it proves nothing, so it is skipped then.
    if (performance.now() - t0 < 400) expect(sent()).toHaveLength(0);
    await waitFor(() => expect(sent()).toHaveLength(1));
    await flush();
    expect(sent()).toHaveLength(1);
  });

  it('while a search loads, and after it fails, the listing\'s rows are not shown as its results', async () => {
    const d = later();
    over.search = () => d.p;
    await ready();
    expect(bodyRows().length).toBe(2);
    await user.type(box(), 'staging');
    await waitFor(() => expect(sent()).toHaveLength(1));
    await flush();
    expect(screen.queryByText('The test DB resets nightly')).toBeNull();
    expect(screen.queryByText('Deploys go through staging first')).toBeNull();
    await act(async () => { d.settle({ status: 500, body: { error: 'boom', code: 'internal' } }); });
    await flush();
    expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0);
    expect(bodyRows()).toHaveLength(0);
  });

  it('clearing a search shows no found rows as the listing while the listing loads', async () => {
    await ready();
    await user.type(box(), 'staging');
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    expect(screen.getByText('Deploys go through staging first')).toBeInTheDocument();
    const d = later();
    queryClient.clear();
    over.items = () => d.p;
    await user.clear(box());
    await flush();
    expect(screen.queryByText('Deploys go through staging first')).toBeNull();
    delete over.items;
    await act(async () => { d.settle({ status: 200, body: { items: latestMemories(), meta: { total: 2, page: 1, limit: 50 } } }); });
    await flush();
    expect(await screen.findByText('The test DB resets nightly')).toBeInTheDocument();
  });

  it('a selection made on the listing is dropped by a search, so Delete selected never takes a row not shown', async () => {
    await ready();
    // The box hides while rows are selected; a search typed just before the selection applies after it.
    fireEvent.change(box(), { target: { value: 'staging' } });
    for (const b of screen.getAllByRole('checkbox', { name: 'Select row' })) fireEvent.click(b);
    expect(screen.getByRole('button', { name: strings['many.go'] })).toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    await flush();
    expect(screen.queryByRole('button', { name: strings['many.go'] })).toBeNull();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' }).every((b) => !(b as HTMLInputElement).checked)).toBe(true);
  });

  it('a search sent again (Try again) keeps its own rows on screen while it loads', async () => {
    await ready();
    await user.type(box(), 'staging');
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    const d = later();
    over.search = () => d.p;
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await flush();
    expect(screen.getByText('Deploys go through staging first')).toBeInTheDocument();
    await act(async () => { d.settle(answerOf('m1', 'm2')); });
    await flush();
    expect(bodyRows()).toHaveLength(2);
  });

  // The test transport rejects a request its context's end aborted (core/test/env.ts), so the held answer reaches the page
  // as that abort, not as its body: this proves the cancelled path; a body delivered after cancellation is a filed
  // The late body of an earlier search never replaces the newer one.
  it('a search whose context ended (cancelled with it) raises no "may have gone through" notice, its answer held to success or failure', async () => {
    const notices: unknown[] = [];
    const off = onPending((n) => notices.push(n));
    try {
      for (const reply of [answerOf('m1'), { status: 500, body: { error: 'boom', code: 'internal' } } as Reply]) {
        const d = later();
        over.search = () => d.p;
        await ready();
        await user.type(box(), 'staging');
        await waitFor(() => expect(sent().length).toBeGreaterThan(0));
        await act(async () => { setRealm(R2); bump('switch'); });
        await act(async () => { d.settle(reply); });
        await flush();
        cleanup();
        boot({ realm: R1 });
        onFetch(fake);
        queryClient.clear();
      }
      expect(notices).toHaveLength(0);
    } finally {
      off();
    }
  });

  it('a failed search reads as a failed read, its facts kept: never an unknown outcome', () => {
    const pending = { kind: 'pending', pending: true, status: 502, code: 'internal', traceId: 'abc123def456' };
    expect(errorInfo(searchErrorOf(pending))).toMatchObject({ outcome: 'failed', status: 502 });
    expect(errorInfo(searchErrorOf({ kind: 'not_sent', notSent: true, code: 'NETWORK' }))).toMatchObject({ outcome: 'not_sent', code: 'NETWORK' });
    expect(errorInfo(searchErrorOf(new TypeError('x'))).outcome).toBe('failed');
    expect(searchErrorOf(pending)).not.toHaveProperty('kind');
    expect(searchErrorOf(pending)).not.toHaveProperty('pending');
  });
});

describe('a search follows the realm, the computer and the project; what a part of a word finds', () => {
  const sent = () => of('POST', '/memory/search');
  const box = () => screen.getByPlaceholderText(strings.search);
  const later = () => {
    let settle: (r: Reply) => void = () => {};
    const p = new Promise<Reply>((res) => { settle = res; });
    return { p, settle: (r: Reply) => settle(r) };
  };
  const OLD = 'A memory only the old place holds';
  const oldAnswer: Reply = { status: 200, body: { status: 'ok', hits: [{ kind: 'memory', id: 'm9', type: 'decision', title: OLD, ts: '2026-10-27T08:00:00Z', importance: 5 }] } };
  /** Types a search whose answer is held, moves the page (`move`), and settles the held search late (it was cancelled
   *  with the old place, so the page sees that abort; see the notice test above). The kit drops a
   *  search typed for the old place with its rows (DataTableView: a realm, computer or project switch never shows
   *  another place's search), so the box is empty after the move and nothing is searched with the old text; the same
   *  text typed again is sent for the new place. Returns the first search and those sent after the move. */
  async function moveWithASearch(move: (router: Awaited<ReturnType<typeof show>>) => void | Promise<void>) {
    const held = later();
    let first = true;
    over.search = () => {
      if (!first) return undefined;
      first = false;
      return held.p;
    };
    const router = await inProject();
    await screen.findByText('Deploys go through staging first');
    await user.type(box(), 'staging');
    await waitFor(() => expect(sent()).toHaveLength(1));
    await act(async () => { await move(router); });
    await flush();
    expect((await screen.findByPlaceholderText(strings.search) as HTMLInputElement).value).toBe('');
    expect(sent()).toHaveLength(1);
    await user.type(box(), 'staging');
    await waitFor(() => expect(sent()).toHaveLength(2));
    // The new place's answer shows; the old place's, settled after it, never shows.
    expect(await screen.findByText('Deploys go through staging first')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    await act(async () => { held.settle(oldAnswer); });
    await flush();
    expect(screen.queryByText(OLD)).toBeNull();
    expect(screen.getByText('Deploys go through staging first')).toBeInTheDocument();
    expect(sent()).toHaveLength(2);
    return { first: sent()[0]!, after: sent().slice(1) };
  }

  it('a realm switch with a search typed in sends it again in the new realm; the old realm\'s late answer is dropped', async () => {
    const { first, after } = await moveWithASearch(() => { setRealm(R2); bump('realm'); });
    expect(u(first.url).searchParams.get('realm')).toBe(R1);
    expect(after.map((c) => u(c.url).searchParams.get('realm'))).toEqual(after.map(() => R2));
  });

  it('a computer switch with a search typed in sends it again to the new computer; the old computer\'s late answer is dropped', async () => {
    const { first, after } = await moveWithASearch(() => setTarget({ project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } }));
    expect(first.url).toContain('c1');
    for (const c of after) {
      expect(c.url).toContain('c2');
      expect(c.url).not.toContain('c1');
    }
  });

  it('a project switch with a search typed in sends it again for the new project; the old project\'s late answer is dropped', async () => {
    const P2 = 'proj_blog';
    over.projects = () => ({ status: 200, body: { items: [
      { key: P, root: '/home/ada/projects/shop', memories: 2, observations: 5, sessions: 3, lessons: 1, slots: 0, updated_at: '2026-10-27T08:00:00Z' },
      { key: P2, root: '/home/ada/projects/blog', memories: 2, observations: 0, sessions: 1, lessons: 0, slots: 0, updated_at: '2026-10-27T08:00:00Z' },
    ], meta: { total: 2 } } });
    const { first, after } = await moveWithASearch(async (router) => {
      router.history.push(`/ai/knowledge/memory?project=${P2}`);
    });
    expect((first.body as { project?: string }).project).toBe(P);
    expect(after.map((c) => (c.body as { project?: string }).project)).toEqual(after.map(() => P2));
  });

  it('a part of a word finds what the agent finds, never what the old substring search did: whole words and word starts of 3+ letters only', async () => {
    // The agent's matching: whole words, and a query term of at least 3 letters
    // also matches the words it starts (minPrefixTermRunes); a fragment inside a word matches nothing.
    over.search = ({ body }) => {
      const q = String((body as { query?: string }).query).toLowerCase();
      const hits: ReturnType<typeof latestMemories> = [];
      for (const m of latestMemories()) {
        const words = String(m.title).toLowerCase().split(/[^a-z0-9]+/);
        if (words.some((w) => w === q || (q.length >= 3 && w.startsWith(q)))) hits.push(m);
      }
      return { status: 200, body: { status: 'ok', hits: hits.map((m) => ({ kind: 'memory', id: m.id, type: m.type, title: m.title, ts: m.updated_at, importance: m.strength })) } };
    };
    await inProject();
    await screen.findByText('Deploys go through staging first');
    const searchFor = async (text: string) => {
      fireEvent.change(box(), { target: { value: text } });
      await waitFor(() => expect((sent().at(-1)?.body as { query?: string } | undefined)?.query).toBe(text));
      await flush();
    };
    // "aging" sits inside "staging": the old substring search listed the memory; the agent finds nothing, and the page
    // says so (no substring fallback).
    await searchFor('aging');
    expect(await screen.findByText(strings.noMatch)).toBeInTheDocument();
    expect(screen.queryByText('Deploys go through staging first')).toBeNull();
    // A two-letter start ("st") is matched only as a whole word: nothing.
    await searchFor('st');
    expect(await screen.findByText(strings.noMatch)).toBeInTheDocument();
    // A start of 3+ letters ("stag") finds it.
    await searchFor('stag');
    expect(await screen.findByText('Deploys go through staging first')).toBeInTheDocument();
    expect(screen.queryByText('The test DB resets nightly')).toBeNull();
  });
});

describe('a remembered search comes back with its own store (Back, Forward, remount)', () => {
  const sent = () => of('POST', '/memory/search');
  const lastBody = () => sent().at(-1)?.body as { query?: string; kinds?: string[] } | undefined;
  const obsBox = () => screen.getByPlaceholderText(strings['search.observation']) as HTMLInputElement;
  const memBox = () => screen.getByPlaceholderText(strings.search) as HTMLInputElement;
  const obsHit: Reply = { status: 200, body: { status: 'ok', hits: [{ kind: 'obs', id: 'o1', type: 'change', title: 'Ran the tests', narrative: 'Ran the whole suite', ts: '2026-10-27T09:30:00Z', importance: 4 }] } };
  beforeEach(() => {
    over.items = ({ url }) => (url.searchParams.get('kind') === 'observation' ? { status: 200, body: { items: [{ id: 'o1', ts: '2026-10-27T09:30:00Z', title: 'Ran the tests', tool_name: 'bash' }], meta: { total: 1 } } } : undefined);
    over.search = ({ body }) => ((body as { kinds?: string[] }).kinds?.includes('obs') ? obsHit : undefined);
  });
  const toObservations = async () => {
    await user.click(screen.getAllByRole('radio', { name: strings['kind.observation'] })[0]!);
    await flush();
  };

  it('an Observations search survives a remount of the library in the same history entry (another project, then Back)', async () => {
    const router = await inProject();
    await screen.findByText('Deploys go through staging first');
    await toObservations();
    await user.type(obsBox(), 'tests');
    await waitFor(() => expect(lastBody()).toMatchObject({ query: 'tests', kinds: ['obs'] }));
    await flush();
    await act(async () => { router.history.push('/ai/knowledge/memory'); });
    await flush();
    const before = sent().length;
    await act(async () => { router.history.back(); });
    await flush();
    expect(obsBox().value).toBe('tests');
    await waitFor(() => expect(sent().length).toBeGreaterThan(before));
    expect(lastBody()).toMatchObject({ query: 'tests', kinds: ['obs'] });
    expect(await screen.findByText('Ran the tests')).toBeInTheDocument();
  });

  it('Back and Forward between entries of two stores bring back each one\'s own search', async () => {
    const router = await inProject();
    await screen.findByText('Deploys go through staging first');
    await user.type(memBox(), 'staging');
    await waitFor(() => expect(lastBody()).toMatchObject({ query: 'staging', kinds: ['memory'] }));
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    // Opening a record makes another history entry; that entry then moves to Observations and searches there.
    await user.click(screen.getByText('Deploys go through staging first'));
    await flush();
    // The kit keeps the applied search across a store change in the same entry; a new search there replaces it.
    await toObservations();
    await user.clear(obsBox());
    await user.type(obsBox(), 'tests');
    await waitFor(() => expect(lastBody()).toMatchObject({ query: 'tests', kinds: ['obs'] }));
    await flush();
    await act(async () => { router.history.back(); });
    await flush();
    expect(memBox().value).toBe('staging');
    await waitFor(() => expect(lastBody()).toMatchObject({ query: 'staging', kinds: ['memory'] }));
    await act(async () => { router.history.forward(); });
    await flush();
    expect(obsBox().value).toBe('tests');
    await waitFor(() => expect(lastBody()).toMatchObject({ query: 'tests', kinds: ['obs'] }));
  });
});

describe('the relation graph of a project', () => {
  beforeEach(() => { graphExtra = {}; graphNodes = gNodes; graphEdges = gEdges; });
  const inRelations = (extra = '') => show(`/ai/knowledge/memory?project=${P}&kind=relation${extra}`);
  const bodyRows = () => screen.getAllByRole('row').filter((r) => r.closest('tbody'));

  it('Relations is a store of a project, chosen like the others; the realm-wide scope does not offer it', async () => {
    await inProject();
    await screen.findByText('Deploys go through staging first');
    expect(of('GET', '/memory/graph')).toHaveLength(0);
    await user.click(screen.getAllByRole('radio', { name: strings['kind.relation'] })[0]!);
    expect(await screen.findByText('deploy.sh')).toBeInTheDocument();
    expect(of('GET', '/memory/graph').length).toBeGreaterThan(0);
    cleanup();
    await show();
    await user.click(await screen.findByText(strings['p.wide']));
    await flush();
    expect(await screen.findByText('Ask before rotating keys')).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: strings['kind.slot'] }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('radio', { name: strings['kind.relation'] })).toBeNull();
  });

  it('lists one read of entities from the agent, paged in the table, in this project and realm, with the counts', async () => {
    await inRelations();
    expect(await screen.findByText('bun')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(4);
    const c = of('GET', '/memory/graph').at(-1)!;
    const q = u(c.url).searchParams;
    expect(q.get('project')).toBe(P);
    expect(q.get('realm')).toBe(R1);
    expect(q.get('limit')).toBe('500');
    expect(q.has('offset')).toBe(false);
    expect(q.has('node_type')).toBe(false);
    expect(screen.getByText(interpolate(strings['count.relations_other'], { n: '3' }), { exact: false })).toBeInTheDocument();
    // The whole graph came in one read: nothing to say about relations stopping at it.
    expect(screen.queryByText(/Relations are listed only/)).toBeNull();
  });

  // One read is the agent's 500, ordered by links; the table pages 50 at a time within it. Read more is the
  // next 500, in the same read, so relations between the old and the new entities show.
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ID: `m${i}`, Project: P, Type: i % 2 ? 'file' : 'tool', Name: `ent-${String(i).padStart(3, '0')}`, NormalizedName: `ent-${i}`, Degree: n - i, LastSeenAt: '' }));
  const readMore = () => screen.queryByRole('button', { name: strings['rel.readMore'] });
  const atBand = (shown: string, count: string) => interpolate(strings['rel.readSoFar'], { shown, count });
  it('a graph past one read pages 50 rows at a time inside a 500 read, says relations stop at the read, and Read more widens that one read', async () => {
    graphNodes = many(620);
    graphEdges = [
      { ID: 'eF', Project: P, SourceID: 'm0', TargetID: 'm59', Type: 'uses', Weight: 1 },
      { ID: 'eG', Project: P, SourceID: 'm0', TargetID: 'm600', Type: 'uses', Weight: 1 },
    ];
    const router = await inRelations();
    expect(await screen.findByText('ent-000')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(50);
    expect(of('GET', '/memory/graph')).toHaveLength(1);
    expect(screen.getByText(atBand('500', '620'))).toBeInTheDocument();
    // Row 1 and row 60 are on different table pages but in the same read: their relation shows; row 601's is not read yet.
    await user.click(screen.getByText('ent-000'));
    await flush();
    expect(await screen.findByRole('heading', { name: 'ent-000' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: strings['rel.title'] })).getByText('ent-059')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: strings['rel.title'] })).queryByText('ent-600')).toBeNull();
    // Every table page is the same read: no new request.
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&page=10&sel=m0`); });
    await flush();
    expect(await screen.findByText('ent-450')).toBeInTheDocument();
    expect(of('GET', '/memory/graph')).toHaveLength(1);
    // Read more: one wider read from the top, the page and the open entity kept, and its new relation shows.
    await user.click(readMore()!);
    await waitFor(() => expect(of('GET', '/memory/graph')).toHaveLength(2));
    const last = u(of('GET', '/memory/graph').at(-1)!.url).searchParams;
    expect(last.get('limit')).toBe('1000');
    expect(last.has('offset')).toBe(false);
    expect(await screen.findByText('ent-450')).toBeInTheDocument();
    expect(within(await screen.findByRole('list', { name: strings['rel.title'] })).getByText('ent-600')).toBeInTheDocument();
    // The whole graph is read now: no band, no Read more, and the last page holds the rest.
    expect(screen.queryByText(/Relations are listed only/)).toBeNull();
    expect(readMore()).toBeNull();
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&page=13`); });
    expect(await screen.findByText('ent-600')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(20);
  });

  it('Read more belongs to one type: another type starts from one read, and coming back does too', async () => {
    graphNodes = many(1300);
    graphEdges = [];
    const router = await inRelations();
    await screen.findByText('ent-000');
    await user.click(readMore()!);
    await waitFor(() => expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('limit')).toBe('1000'));
    await screen.findByText('ent-000');
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&etype=file`); });
    await waitFor(() => expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('node_type')).toBe('file'));
    expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('limit')).toBe('500');
    await screen.findByText('ent-001');
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation`); });
    expect(await screen.findByText(atBand('500', '1,300'))).toBeInTheDocument();
    // Back and Forward start over as well: neither revives the wider read.
    await act(async () => { router.history.back(); });
    expect(await screen.findByText(atBand('500', '650'))).toBeInTheDocument();
    await act(async () => { router.history.forward(); });
    expect(await screen.findByText(atBand('500', '1,300'))).toBeInTheDocument();
    expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('limit')).toBe('500');
  });

  it('a wider answer still cached shows at once, and a failed refresh of it keeps its rows, never an empty graph', async () => {
    graphNodes = many(620);
    graphEdges = [];
    await inRelations();
    await screen.findByText('ent-000');
    await user.click(readMore()!);
    await waitFor(() => expect(screen.queryByText(/Relations are listed only/)).toBeNull());
    await screen.findByText('ent-000');
    // Away to the records and back: the read starts at 500 again, with the wider answer in the cache.
    await user.click(screen.getAllByRole('radio', { name: strings['kind.memory'] })[0]!);
    await screen.findByText('Deploys go through staging first');
    await user.click(screen.getAllByRole('radio', { name: strings['kind.relation'] })[0]!);
    expect(await screen.findByText(atBand('500', '620'))).toBeInTheDocument();
    await user.click(screen.getByText('ent-000'));
    await flush();
    expect(await screen.findByRole('heading', { name: 'ent-000' })).toBeInTheDocument();
    await act(async () => { await queryClient.invalidateQueries({ refetchType: 'none' }); });
    over.graph = ({ url }) => (url.searchParams.get('limit') === '1000' ? { status: 500, body: { error: 'boom', code: 'internal' } } : undefined);
    const before = of('GET', '/memory/graph').filter((c) => u(c.url).searchParams.get('limit') === '1000').length;
    await user.click(readMore()!);
    expect(bodyRows()[0]).toHaveTextContent('ent-000');
    expect(screen.queryByText(/Relations are listed only/)).toBeNull();
    await waitFor(() => expect(of('GET', '/memory/graph').filter((c) => u(c.url).searchParams.get('limit') === '1000').length).toBeGreaterThan(before));
    // The kit's warning over the same answer: its rows, its count and the open entity all stay.
    expect(await screen.findByText(/last answer we got/i)).toBeInTheDocument();
    expect(bodyRows()[0]).toHaveTextContent('ent-000');
    expect(screen.getByText(interpolate(strings['count.entities_other'], { n: '620' }))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ent-000' })).toBeInTheDocument();
    expect(screen.queryByText(/no relations/i)).toBeNull();
  });

  it('Read more stops at the agent\'s cap, and is not offered when the answer came back short of the read', async () => {
    // A saved copy holds fewer than asked: a higher limit gives no more.
    graphNodes = many(620);
    graphEdges = [];
    over.graph = ({ url }) => {
      const b = graphPage(url);
      return { status: 200, body: { ...b, nodes: (b.nodes ?? []).slice(0, 300), truncated: true, from_snapshot: true } };
    };
    await inRelations();
    await screen.findByText('ent-000');
    expect(screen.getByText(atBand('300', '620'))).toBeInTheDocument();
    expect(readMore()).toBeNull();
    cleanup();
    queryClient.clear();
    delete over.graph;
    graphNodes = many(5200);
    await inRelations();
    await screen.findByText('ent-000');
    for (let want = 1000; want <= 5000; want += 500) {
      await user.click(readMore()!);
      await waitFor(() => expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('limit')).toBe(String(want)));
      await screen.findByText('ent-000');
    }
    expect(screen.getByText(atBand('5,000', '5,200'))).toBeInTheDocument();
    expect(readMore()).toBeNull();
  }, 60000);

  it('an empty read where the counts say entities are could not be read, never empty, and shows no count', async () => {
    graphNodes = many(620);
    graphEdges = [];
    over.graph = () => ({ status: 200, body: { status: 'ok', nodes: null, edges: null, limit: 500, offset: 0, truncated: true, from_snapshot: true, dirty: false, warning: '', stats: { TotalNodes: 620, TotalEdges: 0, NodesByType: { tool: 310, file: 310 }, EdgesByType: {} } } });
    await inRelations();
    expect(await screen.findByText(strings['rel.unread'])).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/no relations/i)).toBeNull();
    // No count anywhere on the page (the counts say 620): no "N entities", no relation total, no pager, no read band.
    expect(screen.queryByText(/\d[\d,]* entit/i)).toBeNull();
    expect(screen.queryByText(/\d[\d,]* relations?\b/i)).toBeNull();
    expect(screen.queryByText(/Relations are listed only/)).toBeNull();
    expect(readMore()).toBeNull();
    for (const nav of screen.queryAllByRole('navigation')) expect(nav.textContent ?? '').not.toMatch(/620/);
    expect(document.body.textContent ?? '').not.toMatch(/620/);
  });

  it('the counts read like every other number on the page, and the relation count stands beside the title, out of the clamped subtitle', async () => {
    graphNodes = many(1200);
    graphExtra = { stats: { TotalNodes: 1200, TotalEdges: 1860, NodesByType: { tool: 600, file: 600 }, EdgesByType: {} } };
    over.graph = ({ url }) => { const b = graphPage(url); return { status: 200, body: { ...b, nodes: graphNodes, edges: null, truncated: false } }; };
    await inRelations();
    expect(await screen.findByText(interpolate(strings['count.entities_other'], { n: '1,200' }))).toBeInTheDocument();
    const count = screen.getByText(interpolate(strings['count.relations_other'], { n: '1,860' }));
    expect(count.closest('p')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).parentElement!.contains(count)).toBe(true);
  });

  it('one relation and one entity read in the singular', async () => {
    graphNodes = many(1);
    graphEdges = [];
    graphExtra = { stats: { TotalNodes: 1, TotalEdges: 1, NodesByType: { tool: 1 }, EdgesByType: {} } };
    await inRelations();
    expect(await screen.findByText(interpolate(strings['count.entities_one'], { n: '1' }))).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['count.relations_one'], { n: '1' }))).toBeInTheDocument();
  });

  it('a retry that fails after an unread answer says the read failed, and a good one then shows the graph', async () => {
    graphExtra = { nodes: null, edges: null, warning: 'graph query exceeded budget', stats: { TotalNodes: 0, TotalEdges: 0, NodesByType: {}, EdgesByType: {} } };
    await inRelations();
    expect(await screen.findByText(strings['rel.unreadBody'])).toBeInTheDocument();
    over.graph = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/could.?n.t reach the server/i)).toBeInTheDocument();
    expect(screen.queryByText(strings['rel.unreadBody'])).toBeNull();
    delete over.graph;
    graphExtra = {};
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('deploy.sh')).toBeInTheDocument();
    expect(screen.queryByText(/could.?n.t reach the server/i)).toBeNull();
    expect(screen.queryByText(strings['rel.unreadBody'])).toBeNull();
  });

  it('a type count the agent undercounts never hides entities the read holds', async () => {
    over.graph = ({ url }) => {
      const b = graphPage(url);
      return { status: 200, body: { ...b, truncated: true, stats: { ...b.stats, NodesByType: { tool: 1, file: 1, person: 1 } } } };
    };
    await inRelations('&etype=tool');
    expect(await screen.findByText('docker')).toBeInTheDocument();
    expect(screen.getByText('bun')).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['count.entities_other'], { n: '2' }))).toBeInTheDocument();
    expect(screen.getByText(atBand('2', '2'))).toBeInTheDocument();
  });

  // Only a type already read shows this: a new read has an empty frame, and that alone puts the row back at the first.
  it('a type change to a read already held puts the keyboard row back at the first row (the type is a context of its own)', async () => {
    const router = await inRelations('&etype=tool');
    expect(await screen.findByText('docker')).toBeInTheDocument();
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation`); });
    expect(await screen.findByText('deploy.sh')).toBeInTheDocument();
    const focusable = () => bodyRows().filter((r) => r.getAttribute('tabindex') === '0');
    bodyRows()[0]!.focus();
    // Each key acts on the row that holds focus, and focus follows a key one frame later: the next key waits for it.
    for (const at of [1, 2, 3]) {
      await user.keyboard('{ArrowDown}');
      await waitFor(() => expect(document.activeElement).toBe(bodyRows()[at]));
    }
    await waitFor(() => expect(focusable()[0]).toBe(bodyRows()[3]));
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&etype=tool`); });
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(screen.getByText('docker')).toBeInTheDocument();
    await waitFor(() => expect(focusable()[0]).toBe(bodyRows()[0]));
  });

  it('the type filter is the agent\'s node_type, not a filter of the shown page', async () => {
    await inRelations('&etype=tool');
    await waitFor(() => expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('node_type')).toBe('tool'));
    expect(await screen.findByText('docker')).toBeInTheDocument();
    expect(screen.queryByText('deploy.sh')).toBeNull();
  });

  it('an entity opens with its relations on the page, each other end opening in turn, and says how many are elsewhere', async () => {
    await inRelations();
    await user.click(await screen.findByText('deploy.sh'));
    await flush();
    expect(await screen.findByRole('heading', { name: 'deploy.sh' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: strings['rel.title'] });
    expect(within(list).getByText(interpolate(strings['rel.outgoing'], { type: 'uses' }))).toBeInTheDocument();
    expect(within(list).getByText(interpolate(strings['rel.incoming'], { type: 'edits' }))).toBeInTheDocument();
    await user.click(within(list).getByText('bun'));
    await flush();
    expect(await screen.findByRole('heading', { name: 'bun' })).toBeInTheDocument();
    // bun has 3 links; 1 is with an entity on this page (the call to nX is not).
    expect(screen.getByText(interpolate(strings['rel.pageOnly'], { shown: '1', count: '3' }))).toBeInTheDocument();
  });

  it('an entity with no links says so', async () => {
    await inRelations();
    await user.click(await screen.findByText('docker'));
    await flush();
    expect(await screen.findByRole('heading', { name: 'docker' })).toBeInTheDocument();
    expect(screen.getByText(strings['rel.none'])).toBeInTheDocument();
  });

  // "could not be read" must never read as "no relations".
  it('an empty page carrying the agent\'s warning is a graph that could not be read, never an empty one', async () => {
    graphExtra = { nodes: null, edges: null, warning: 'graph query exceeded budget and no snapshot is available', stats: { TotalNodes: 0, TotalEdges: 0, NodesByType: {}, EdgesByType: {} } };
    await inRelations();
    expect(await screen.findByText(strings['rel.unread'])).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(strings['rel.none'])).toBeNull();
    expect(screen.queryByText(/no relations/i)).toBeNull();
    // The agent answered: the state says so, never that the server could not be reached.
    expect(screen.getByText(strings['rel.unreadBody'])).toBeInTheDocument();
    expect(screen.queryByText(/could.?n.t reach the server/i)).toBeNull();
    expect(screen.queryByText(interpolate(strings['count.entities_other'], { n: '0' }))).toBeNull();
    expect(screen.queryByText(interpolate(strings['count.relations_other'], { n: '0' }), { exact: false })).toBeNull();
    // Try again reads again; an answer with the relations then shows them.
    graphExtra = {};
    const before = of('GET', '/memory/graph').length;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(of('GET', '/memory/graph').length).toBeGreaterThan(before));
    expect(await screen.findByText('deploy.sh')).toBeInTheDocument();
    expect(screen.queryByText(strings['rel.unread'])).toBeNull();
  });

  it('a page the agent read only in part, or from a saved copy, says so above its rows', async () => {
    graphExtra = { warning: 'graph query exceeded budget' };
    await inRelations();
    expect(await screen.findByText('bun')).toBeInTheDocument();
    expect(screen.getByText(strings['rel.partial'])).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    graphExtra = { dirty: true, from_snapshot: true };
    await inRelations();
    expect(await screen.findByText('bun')).toBeInTheDocument();
    expect(screen.getByText(strings['rel.dirty'])).toBeInTheDocument();
    expect(screen.queryByText(strings['rel.partial'])).toBeNull();
  });

  it('a failed or malformed answer is the error state with Try again, never an empty graph', async () => {
    over.graph = () => ({ status: 200, body: { status: 'ok', nodes: 'x' } });
    await inRelations();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('bun')).toBeNull();
    expect(screen.queryByText(/no relations/i)).toBeNull();
    cleanup();
    queryClient.clear();
    over.graph = () => ({ status: 200, body: { status: 'error', message: 'boom' } });
    await inRelations();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/no relations/i)).toBeNull();
  });

  // Rows of another type, read or page are never on screen, loading or failed.
  it('a type change after rows show drops the other type\'s rows while it loads and when it fails', async () => {
    const router = await inRelations();
    expect(await screen.findByText('deploy.sh')).toBeInTheDocument();
    over.graph = ({ url }) => (url.searchParams.get('node_type') === 'tool' ? new Promise<Reply>(() => {}) : undefined);
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&etype=tool`); });
    await flush();
    await waitFor(() => expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('node_type')).toBe('tool'));
    expect(screen.queryByText('deploy.sh')).toBeNull();
    expect(screen.queryByText('ada')).toBeNull();
    over.graph = ({ url }) => (url.searchParams.get('node_type') === 'person' ? { status: 0, network: true } : undefined);
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&etype=person`); });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    for (const name of ['bun', 'deploy.sh', 'docker']) expect(screen.queryByText(name)).toBeNull();
    expect(screen.queryByText(/no relations/i)).toBeNull();
  });

  it('a Read more that fails shows the error state, never the shorter read\'s rows, and Try again reads it again', async () => {
    graphNodes = many(620);
    graphEdges = [];
    await inRelations();
    expect(await screen.findByText('ent-000')).toBeInTheDocument();
    over.graph = ({ url }) => (url.searchParams.get('limit') === '1000' ? { status: 500, body: { error: 'boom', code: 'internal' } } : undefined);
    await user.click(readMore()!);
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('ent-000')).toBeNull();
    expect(screen.queryByText(/Relations are listed only/)).toBeNull();
    delete over.graph;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('ent-000')).toBeInTheDocument();
    expect(u(of('GET', '/memory/graph').at(-1)!.url).searchParams.get('limit')).toBe('1000');
  });

  it('within the read, each table page shows its own rows from the first render', async () => {
    graphNodes = many(620);
    graphEdges = [];
    const router = await show(`/ai/knowledge/memory?project=${P}&kind=relation&page=2`);
    expect(await screen.findByText('ent-050')).toBeInTheDocument();
    expect(screen.queryByText('ent-000')).toBeNull();
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&page=3`); });
    // No answer is awaited: the read is the same, so the next render already holds page 3.
    expect(screen.getByText('ent-100')).toBeInTheDocument();
    expect(screen.queryByText('ent-050')).toBeNull();
    expect(of('GET', '/memory/graph')).toHaveLength(1);
  });

  // Rows and pager come from one answer, so a graph that shrinks or grows never splits them.
  it('a page past the end, a shrink and a growth on refresh show the page the pager names, in the same answer', async () => {
    graphNodes = many(120);
    graphEdges = [];
    await show(`/ai/knowledge/memory?project=${P}&kind=relation&page=3`);
    expect(await screen.findByText('ent-100')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(20);
    graphNodes = many(60);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(await screen.findByText('ent-050')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(10);
    graphNodes = many(120);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(await screen.findByText('ent-100')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(20);
    expect(of('GET', '/memory/graph').every((c) => !u(c.url).searchParams.has('offset'))).toBe(true);
    cleanup();
    queryClient.clear();
    graphNodes = many(620);
    await show(`/ai/knowledge/memory?project=${P}&kind=relation&page=2.9`);
    expect(await screen.findByText('ent-050')).toBeInTheDocument();
    expect(screen.queryByText('ent-000')).toBeNull();
    cleanup();
    queryClient.clear();
    const reads = of('GET', '/memory/graph').length;
    graphNodes = many(450);
    await show(`/ai/knowledge/memory?project=${P}&kind=relation&page=11.5`);
    expect(await screen.findByText('ent-400')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(50);
    expect(of('GET', '/memory/graph').length).toBe(reads + 1);
    expect(screen.queryByText(strings['rel.unread'])).toBeNull();
  });

  // An open entity the shown read no longer holds closes the pane, so the table shows.
  it('an open entity the type filter, a later read or a refresh takes away closes the pane', async () => {
    const router = await inRelations('&sel=n2');
    expect(await screen.findByRole('heading', { name: 'deploy.sh' })).toBeInTheDocument();
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&etype=tool&sel=n2`); });
    expect(await screen.findByText('docker')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'deploy.sh' })).toBeNull();
    expect(screen.queryByRole('list', { name: strings['rel.title'] })).toBeNull();
    // A refresh whose answer no longer holds the open entity.
    await act(async () => { router.history.push(`/ai/knowledge/memory?project=${P}&kind=relation&etype=tool&sel=n4`); });
    expect(await screen.findByRole('heading', { name: 'docker' })).toBeInTheDocument();
    graphNodes = gNodes.filter((n) => n.ID !== 'n4');
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'docker' })).toBeNull());
    expect(screen.getByText('bun')).toBeInTheDocument();
  });

  // The record search survives a visit to Relations (in memory, never the URL).
  it('a record search comes back after a visit to Relations, and Back and Forward keep it', async () => {
    const router = await inProject();
    await screen.findByText('Deploys go through staging first');
    const box = () => screen.getByPlaceholderText(strings.search) as HTMLInputElement;
    const searches = () => of('POST', '/memory/search');
    await user.type(box(), 'staging');
    await waitFor(() => expect(searches().at(-1)?.body).toMatchObject({ query: 'staging' }));
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    await user.click(screen.getAllByRole('radio', { name: strings['kind.relation'] })[0]!);
    expect(await screen.findByText('deploy.sh')).toBeInTheDocument();
    const before = searches().length;
    await user.click(screen.getAllByRole('radio', { name: strings['kind.memory'] })[0]!);
    await flush();
    expect(box().value).toBe('staging');
    await waitFor(() => expect(searches().length).toBeGreaterThan(before));
    expect(searches().at(-1)?.body).toMatchObject({ query: 'staging', kinds: ['memory'] });
    expect(screen.queryByText('The test DB resets nightly')).toBeNull();
    expect(router.state.location.href).not.toContain('staging');
    // Back and Forward inside Relations (an entity opened is a new entry), then back to the records: still the search.
    await user.click(screen.getAllByRole('radio', { name: strings['kind.relation'] })[0]!);
    await user.click(await screen.findByText('bun'));
    await flush();
    expect(await screen.findByRole('heading', { name: 'bun' })).toBeInTheDocument();
    await act(async () => { router.history.back(); });
    await flush();
    expect(screen.queryByRole('heading', { name: 'bun' })).toBeNull();
    await act(async () => { router.history.forward(); });
    await flush();
    expect(await screen.findByRole('heading', { name: 'bun' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('radio', { name: strings['kind.memory'] })[0]!);
    await flush();
    expect(box().value).toBe('staging');
    await waitFor(() => expect(screen.queryByText('The test DB resets nightly')).toBeNull());
    expect(router.state.location.href).not.toContain('staging');
  });

  // Back to an entry whose search was empty keeps it empty; the seed is for the store choice only.
  it('Back to an earlier entry with no search keeps it empty, even after a search went through Relations', async () => {
    const router = await inProject();
    await screen.findByText('Deploys go through staging first');
    const box = () => screen.getByPlaceholderText(strings.search) as HTMLInputElement;
    const searches = () => of('POST', '/memory/search');
    // Entry A: no search. Opening a record makes entry B.
    await user.click(screen.getByText('Deploys go through staging first'));
    await flush();
    await user.type(box(), 'staging');
    await waitFor(() => expect(searches().at(-1)?.body).toMatchObject({ query: 'staging' }));
    await user.click(screen.getAllByRole('radio', { name: strings['kind.relation'] })[0]!);
    expect(await screen.findByText('deploy.sh')).toBeInTheDocument();
    const before = searches().length;
    await act(async () => { router.history.back(); });
    await flush();
    expect(await screen.findByText('The test DB resets nightly')).toBeInTheDocument();
    expect(box().value).toBe('');
    await flush();
    expect(searches()).toHaveLength(before);
    expect(screen.getByText('The test DB resets nightly')).toBeInTheDocument();
  });

  it('back to a record store reads its records again', async () => {
    await inRelations();
    await screen.findByText('bun');
    await user.click(screen.getAllByRole('radio', { name: strings['kind.memory'] })[0]!);
    expect(await screen.findByText('Deploys go through staging first')).toBeInTheDocument();
    expect(screen.queryByText('bun')).toBeNull();
  });
});
