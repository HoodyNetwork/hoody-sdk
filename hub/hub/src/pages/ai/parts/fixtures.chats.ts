// Fake agent answers for the AI pane's chat list, shaped as the agent answers them: GET /sessions (paged:
// newest started first, or most recently active first with order=last_active; meta.total; rows carry state,
// pending_gate and origin unless the world is an older agent's), GET /gates (≤ 100 a page, meta.omitted), GET /sessions/{id} and /state, GET
// /sessions/cwds, GET /changes (scope + topic tokens) and GET /changes/stream (its snapshot frame), GET /bots and
// /bots/{id}/delegates, and GET /pause. The world is atlas's (the top-bar computer); another computer lists only
// its `elsewhere` chats, with no gates and no Bots.
import { agent, answers, botsListRoute, containersRoute, fixtureAgentPicture, fixtureWorld, installFixtureChats, realmsView, reply, type FixtureChatSeed, type FixtureRequest, type FixtureRule } from '@core';
import { sessionImageRoute } from '@kit';
import { chatRoutes } from './data';

const NOW = Date.now();
const MIN = 60_000;
const iso = (t: number) => new Date(t).toISOString();
const PERSONAL = fixtureWorld.realms[0]!.id;

export interface ChatFixture {
  id: string;
  realm?: string;
  name?: string;
  first_message?: string;
  agent?: string;
  cwd?: string;
  started_at?: string;
  last_request_at?: string;
  backend_kind?: 'acp';
  /** The state a state read answers, and a current agent's row carries (default idle). */
  state?: string;
}

export interface GateFixture {
  session_id: string;
  realm?: string;
  agent?: string;
}

export interface ChatWorld {
  sessions: ChatFixture[];
  gates: GateFixture[];
  /** Gates a page leaves out (meta.omitted on page 1). */
  omitted?: number;
  /** `unlisted`: GET /bots leaves the Bot out (its rows still name it in their origin). */
  bots: Array<{ id: string; name: string; realm?: string; session_id?: string; delegates?: string[]; unlisted?: boolean }>;
  cwds: string[];
  /** An older agent: rows carry no state, pending_gate or origin, and paged reads ignore `order`. */
  older?: boolean;
  /** The change tokens; a test moves one to see the list re-read. */
  tokens: Record<string, string>;
  scope: string;
  /** Other computers' chats, by container id; a computer missing here lists none. Without it every computer
   *  reads this world. */
  elsewhere?: Record<string, ChatFixture[]>;
  /** Chats no session page lists that their own GET /sessions/{id} still answers (a waiting chat read by
   *  itself is the only way to them). */
  unlisted?: ChatFixture[];
}

/** A chat whose one message was sent with pictures (reached by its own address; no list shows it): one the agent still serves
 *  (FIXTURE_PICTURE answers it), one it no longer has (404) and one it cannot serve (no id). */
export const PICTURES_CHAT = 's-pictures';
export const FIXTURE_PICTURE_ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const GONE_PICTURE_ID = 'a'.repeat(64);
/** A PNG, 96 x 64. */
const FIXTURE_PICTURE = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAhklEQVR42u3asQ0AIAwDsH7EabzLCUysrDzRAUWWckDqMWqNuVqyz23Jb30KECBAgAABAgQIECBAgAABAgQoDCj1sK4+gAABAgQIECBAgAABAgQIECBAaUAGM4siIECAAAECBAgQIECAAAECBMh/kMHMoggIECBAgAABAgQIECBAgAABigV6begm/styGvQAAAAASUVORK5CYII=';
const picturesChat = (): ChatFixture & { pictures: NonNullable<FixtureChatSeed['pictures']> } => ({
  id: PICTURES_CHAT, first_message: 'Make the checkout banner look like this draft, not like the old one.', cwd: '/home/ada/projects/shop', last_request_at: iso(NOW - 50 * MIN),
  pictures: [{ name: 'banner-draft.png', id: FIXTURE_PICTURE_ID, media: 'image/png', bytes: 191 }, { name: 'old-banner.png', id: GONE_PICTURE_ID, media: 'image/png' }, { name: 'logo.bmp' }],
});

/** The default world: today's and older chats on atlas, one waiting for you, a Bot delegate, a Claude Code chat, the
 *  Bot's own session and a draft (both never listed). */
export function chatWorld(): ChatWorld {
  const bot = fixtureWorld.bots[0]!.name;
  return {
    sessions: [
      { id: 's-today', first_message: 'Fix the failing checkout tests\nmore', cwd: '/home/ada/projects/shop', last_request_at: iso(NOW - 2 * MIN), state: 'running' },
      { id: 's-claude', first_message: 'Review the release notes', cwd: '/home/ada', backend_kind: 'acp', last_request_at: iso(NOW - 3 * 60 * MIN) },
      { id: 's-wait', name: 'Deploy the staging site', first_message: 'deploy', cwd: '/home/ada/projects/shop', last_request_at: iso(NOW - 40 * 24 * 60 * MIN) },
      { id: 's-delegate', first_message: 'Answer the support ticket', cwd: '/home/ada', last_request_at: iso(NOW - 26 * 60 * MIN) },
      { id: 's-old', first_message: 'Plan the backup job', cwd: '/home/ada', last_request_at: iso(NOW - 30 * 24 * 60 * MIN) },
      { id: 's-bot', first_message: 'bot work', agent: 'bot', cwd: '/home/ada', last_request_at: iso(NOW - MIN) },
      { id: 's-botown', first_message: 'bot own session', cwd: '/home/ada', last_request_at: iso(NOW - MIN) },
      { id: 's-draft', cwd: '/home/ada', started_at: iso(NOW - MIN) },
    ],
    gates: [{ session_id: 's-wait' }],
    bots: [{ id: bot, name: bot, session_id: 's-botown', delegates: ['s-delegate'] }],
    cwds: ['/home/ada/projects/shop', '/home/ada'],
    tokens: { sessions: 'c1:s1', gates: 'c1:g1' },
    scope: 'scope-1',
    unlisted: [(({ pictures: _p, ...row }) => row)(picturesChat())],
  };
}

/** The default world's listed chats, held by the fixture fake agent (ask/registry.ts) so opening one shows its
 *  transcript: a chat with a gate waits on an approval, a running one is still working, the rest answered. A chat with
 *  no first message (a draft) holds nothing. Every computer reads this world (as `chatWorld` without `elsewhere`). */
export function chatSeeds(w: ChatWorld = chatWorld()): FixtureChatSeed[] {
  return w.sessions.flatMap((c): FixtureChatSeed[] => {
    const ask = (c.first_message ?? '').split('\n')[0]!;
    if (!ask) return [];
    const script: FixtureChatSeed['script'] = w.gates.some((g) => g.session_id === c.id) ? 'approval' : c.state === 'running' ? 'working' : 'done';
    return [{ id: c.id, ask, script }];
  }).concat((w.unlisted ?? []).some((c) => c.id === PICTURES_CHAT) ? [{ id: PICTURES_CHAT, ask: picturesChat().first_message!, script: 'done', pictures: picturesChat().pictures }] : []);
}
installFixtureChats(() => chatSeeds());

const num = (v: unknown, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

function sessionRow(s: ChatFixture, w: ChatWorld): Record<string, unknown> {
  const { state: _s, ...row } = s;
  const out: Record<string, unknown> = { realm: PERSONAL, model: 'hoody-ai/hoody-free', started_at: s.started_at ?? s.last_request_at ?? iso(NOW - 60 * MIN), cwd: '/home/ada', ...row };
  if (w.older) return out;
  // The row's own state, whether a gate waits in it, and the Bot that opened it (its own session, or a delegate).
  out.state = s.state ?? 'idle';
  if (w.gates.some((g) => g.session_id === s.id)) out.pending_gate = true;
  const realm = String(out.realm);
  for (const b of w.bots) {
    const base = { kind: 'bot', bot_uid: `uid-${b.id}`, bot_id: b.id, realm: b.realm ?? PERSONAL };
    if (b.session_id === s.id) out.origin = base;
    else if (b.delegates?.includes(s.id) && (b.realm ?? PERSONAL) === realm) out.origin = { ...base, ref: `work-${s.id}` };
  }
  return out;
}

export interface ChatRuleOpts {
  world?: ChatWorld;
  onSend?: (r: FixtureRequest) => void;
  /** GET /changes fails (the lists fall back to the slow re-read). */
  feedDown?: boolean;
  /** A realm-pinned agent (the test selects All realms): every GET /sessions and /gates sent with `realm=all` (the
   *  list routes) answers 400 realm_scope_unsupported; only the plain listing (chatRoutes.*Here, no realm) answers. */
  pinned?: boolean;
  /** GET /gates fails (500) while this is true; a test may switch it off to see the read recover. */
  gatesDown?: { on: boolean };
  /** The agent's platform login is gone while this is true: every session list read answers 503 restriction_unknown
   *  (kit agentSignedOut), as an agent whose stored login the platform refused does. */
  signedOut?: { on: boolean };
  /** GET /changes/stream is refused for good (404) while this is true (the computer's feed is closed). */
  streamRefused?: { on: boolean };
  /** The containers list (core's computer list) fails (500) while this is true (a failed refresh). */
  computersDown?: { on: boolean };
  /** The containers list holds only these computers (by name), of those core's own answer gives for the shown realm
   *  (a list every computer of which runs, so All computers can be whole). */
  computersOnly?: string[];
  /** With computersOnly: this many more containers rows that name no project (no computer can be built from them). */
  unbuildable?: number;
  /** Reads held still being read (no answer comes) or failing (500), for the completeness table: session
   *  pages from page 2 (`sessions`: every session page), the gates, the waiting chats read by themselves
   *  (GET /sessions/{id}), the computer list, or the change feed (`feed`: GET /changes and its stream). */
  stall?: { pages?: Stall; gates?: Stall; waiting?: Stall; computers?: Stall; sessions?: Stall; feed?: Stall };
}

export type Stall = 'pending' | 'failed';
const stalled = (st: Stall | undefined) => (st === 'pending' ? answers.ok({}, 600_000) : st === 'failed' ? answers.refused(500, 'internal') : null);

const ATLAS = fixtureWorld.computers[0]!.id;

export function chatRules(o: ChatRuleOpts = {}): FixtureRule[] {
  const home = o.world ?? chatWorld();
  const see = (r: FixtureRequest) => o.onSend?.(r);
  // The world a request reads: atlas's, or, in a world that names other computers' chats (`elsewhere`), that computer's
  // own chats alone (a world without `elsewhere` answers every computer alike).
  const worldOf = (r: FixtureRequest): ChatWorld => {
    const id = r.target?.container.id;
    return !id || id === ATLAS || !home.elsewhere ? home : { ...home, sessions: home.elsewhere?.[id] ?? [], gates: [], omitted: 0, bots: [] };
  };
  const listSessions = (r: FixtureRequest) => {
    see(r);
    const w = worldOf(r);
    // Paged reads: newest started first (the agent re-sorts by started_at when a limit is sent), or most recently active
    // first when order=last_active is asked (an older agent drops the key).
    const by = r.query.order === 'last_active' && !w.older ? 'last_request_at' : 'started_at';
    const all = [...w.sessions].map((x) => sessionRow(x, w)).sort((a, b) => String(b[by] ?? b.started_at).localeCompare(String(a[by] ?? a.started_at)));
    const limit = num(r.query.limit, 0);
    const page = num(r.query.page, 1);
    if (o.signedOut?.on) return answers.refused(503, 'restriction_unknown');
    const held = (page >= 2 ? stalled(o.stall?.pages) : null) ?? stalled(o.stall?.sessions);
    if (held) return held;
    const items = limit ? all.slice((page - 1) * limit, page * limit) : all;
    return answers.ok({ items, meta: { total: all.length, ...(limit ? { page, limit } : {}) } });
  };
  const listGates = (r: FixtureRequest) => {
    see(r);
    const w = worldOf(r);
    if (o.gatesDown?.on) return answers.refused(500, 'internal');
    const held = stalled(o.stall?.gates);
    if (held) return held;
    const limit = Math.min(num(r.query.limit, 100), 100);
    const page = num(r.query.page, 1);
    const window = w.gates.slice((page - 1) * limit, page * limit);
    const omitted = page === 1 ? Math.min(w.omitted ?? 0, window.length) : 0;
    const items = window.slice(0, window.length - omitted).map((g, i) => ({ gate_id: `g${page}-${i}`, generation: 1, kind: 'confirm', parked_at: iso(NOW), gate: {}, realm: PERSONAL, ...g }));
    return answers.ok({ items, meta: { total: w.gates.length, page, limit, omitted } });
  };
  const pinnedRefuses = (r: FixtureRequest) => {
    see(r);
    return answers.refused(400, 'realm_scope_unsupported');
  };
  return [
    // Ahead of core's own containers answer: only while switched on.
    reply(containersRoute, () => answers.refused(500, 'internal'), { when: () => o.computersDown?.on === true }),
    // The computer list's read held pending (or failing) while `stall.computers` says so (a refresh in flight).
    reply(containersRoute, () => stalled(o.stall?.computers)!, { when: () => o.stall?.computers !== undefined }),
    // Core's realm filter (core/fixtures.ts `computers`: the selected realm's computers, 'all' every one), then the names.
    reply(containersRoute, () => {
      const r = realmsView().selected;
      const odd = Array.from({ length: o.unbuildable ?? 0 }, (_, i) => ({ id: `odd-${i}`, name: `odd-${i}`, status: 'running' }));
      return answers.ok({ data: { computers: [...fixtureWorld.computers.filter((c) => (r === 'all' || c.realm_ids.includes(r)) && o.computersOnly?.includes(c.name)), ...odd] } });
    }, { when: () => o.computersOnly !== undefined }),
    reply(chatRoutes.sessions, o.pinned ? pinnedRefuses : listSessions),
    reply(chatRoutes.gates, o.pinned ? pinnedRefuses : listGates),
    reply(chatRoutes.sessionsHere, listSessions),
    reply(chatRoutes.gatesHere, listGates),
    // A picture sent with a chat's message, as the agent serves it: the bytes for the one it has (the seeded chat's, or one a
    // message sent here carried: the fixture agent keeps those), the session routes' 404 for any other.
    reply(sessionImageRoute, (r) => {
      see(r);
      if (r.path.endsWith(`/sessions/${PICTURES_CHAT}/images/${FIXTURE_PICTURE_ID}`)) return answers.bytes(Uint8Array.from(atob(FIXTURE_PICTURE), (c) => c.charCodeAt(0)), 'image/png');
      const m = /\/sessions\/([^/]+)\/images\/([0-9a-f]{64})$/.exec(r.path);
      const kept = m ? fixtureAgentPicture(decodeURIComponent(m[1]!), m[2]!) : null;
      return kept ? answers.bytes(kept.bytes, kept.media) : answers.refused(404, 'not_found');
    }),
    reply(agent.agentRoutes.session, (r) => {
      see(r);
      const w = worldOf(r);
      const id = r.path.split('/').pop() ?? '';
      const held = stalled(o.stall?.waiting);
      if (held) return held;
      const s = [...w.sessions, ...(w.unlisted ?? [])].find((x) => x.id === decodeURIComponent(id));
      // The agent's GET /sessions/{id}: the row inside `session`, beside attached.
      return s ? answers.ok({ session: sessionRow(s, w), attached: false }) : answers.refused(404, 'not_found');
    }),
    reply(chatRoutes.state, (r) => {
      see(r);
      const w = worldOf(r);
      const id = decodeURIComponent(r.path.split('/').slice(-2)[0] ?? '');
      const s = w.sessions.find((x) => x.id === id);
      return s ? answers.ok({ state: s.state ?? 'idle', live: true }) : answers.refused(404, 'not_found');
    }),
    reply(chatRoutes.cwds, (r) => {
      see(r);
      return answers.ok({ cwds: worldOf(r).cwds });
    }),
    reply(chatRoutes.changes, (r) => {
      see(r);
      if (o.feedDown) return answers.refused(503, 'service_unavailable');
      const held = stalled(o.stall?.feed);
      if (held) return held;
      return answers.ok({ scope: home.scope, tokens: { ...home.tokens } });
    }),
    // One snapshot frame, then the stream ends (the feed reconnects after its backoff).
    reply(chatRoutes.changesStream, (r) => {
      see(r);
      if (o.feedDown) return answers.refused(503, 'service_unavailable');
      if (o.streamRefused?.on) return answers.refused(404, 'not_found');
      const held = stalled(o.stall?.feed);
      if (held) return held;
      const frame = `event: snapshot\ndata: ${JSON.stringify({ scope: home.scope, tokens: { ...home.tokens } })}\n\n`;
      return { status: 200, body: frame, raw: true, headers: { 'content-type': 'text/event-stream' } };
    }),
    reply(botsListRoute, (r) => {
      see(r);
      const w = worldOf(r);
      return answers.ok({ items: w.bots.filter((b) => !b.unlisted).map((b) => ({ id: b.id, uid: `uid-${b.id}`, name: b.name, realm: b.realm ?? PERSONAL, session_id: b.session_id ?? '' })), meta: { total: w.bots.filter((b) => !b.unlisted).length } });
    }),
    reply(chatRoutes.delegates, (r) => {
      see(r);
      const w = worldOf(r);
      const id = decodeURIComponent(r.path.split('/').slice(-2)[0] ?? '');
      const b = w.bots.find((x) => x.id === id);
      return answers.ok({ items: (b?.delegates ?? []).map((sid) => ({ session_id: sid, state: 'open' })), meta: { total: b?.delegates?.length ?? 0 } });
    }),
    reply(agent.pauseRoutes.get, (r) => {
      see(r);
      return answers.ok({ paused: false, since_ms: 0, gen: 1 });
    }),
  ];
}
