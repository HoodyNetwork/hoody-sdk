// stream-mux.ts: per-session agent streams carried by one multiplexed stream (the
// agent's GET /sessions:events).
//
// Contract:
//   - sessionStream({mux, single, sid, key, rank?}, input) has budgetedStream()'s shape and meaning for ONE session
//     (core/stream-live.ts): one virtual connection, never reconnected here, the same onEvent(name, data, id) / onState,
//     the same terminal states delivered once on a microtask, nothing delivered after close(). `input` is exactly the
//     per-session stream input (params naming the session, query {since, incarnation} as the caller's cursor).
//   - Sessions of one (account, generation, computer, realm) share a group: ONE budget watch (kind 'session', key
//     'mux:<realm>#<n>', one entry per group, rank = the best member's) and ONE connection to the mux route for at most MAX_MUX members, so the
//     budget counts the group as one stream.
//   - Frames are routed by their session_id. Each member sees what its own stream would have sent: data frames (id =
//     their seq), replay_boundary, `lagged` (the mux's session_lagged: replay_gap goes on; lagged ends that member), and
//     `end` (the mux's session_end, which ends that member). A frame of one session never reaches another.
//   - A member joining an open group reconnects the group's connection, with EVERY member's own cursor: a continuing
//     member resumes from the last seq and incarnation it was given (its original cursor before any frame), and the
//     frames and replay_boundary it already had are dropped, so it sees neither a reset nor a repeat. A gap the server
//     reports for it on the new connection is a real one and is delivered. A member leaving reconnects nothing.
//   - The connection lost (network, server end, the budget's cut, hidden, a refusal) is lost for every member: each
//     gets the terminal state its own stream would have given, and resumes with its own cursor as it does today (the
//     group they rejoin carries every cursor in one request).
//   - A frame kit-io skipped as too large names no session: every member of that connection gets the gap state.
//   - A replay_gap drops the member's old cursor: a reconnect before its replay arrives asks for the whole ring of the
//     incarnation the gap named.
//   - The caller's signal: already aborted → kit-io's own unsent refusal of its stream (error ABORTED, once, on a
//     microtask), no budget slot, no group; aborted later → that member
//     alone ends `closed {aborted}`. The group's rank follows its members at once: a join, a close and a member's own
//     end re-set it before the next budget decision (and before that member's terminal state).
//   - Nothing reaches a member after its close(), even from a broadcast already under way.
//   - setRank(r) moves one member's rank in place: the group's rank is re-set at once to the best
//     member's, so a member's drop lowers the group only when no other member holds the better rank. No reconnect. A
//     fallback member moves its own budgetedStream; the rank it has, or a member closed or ended, sends nothing.
//   - Fallback: an agent without the mux route (404 / 405 on open, before any frame), a second watcher of the same
//     session, or a member past MAX_MUX goes to budgetedStream with its own unchanged input: today's contract exactly.
//     The 404/405 is remembered per (generation, computer, realm).
import { routingAllows } from './routing';
import { capture, type Ctx } from './ctx';
import { stream, type StreamInput, type StreamState } from './kit-io';
import type { Route } from './routes';
import { budgetedStream, streamComputer, type RankedStream } from './stream-live';
import { RANKS, streamBudget, type Rank, type StreamBudget, type Watch } from './stream-budget';
import { isRecord } from './shape';

/** The most sessions one mux connection carries (the agent's own limit). */
export const MAX_MUX = 32;

export interface SessionStreamOptions {
  /** The multiplexed route (GET /sessions:events, query ids, since, incarnation). */
  mux: Route;
  /** The per-session route, for the fallback. */
  single: Route;
  /** The session id. */
  sid: string;
  /** The budget key of the fallback stream (as budgetedStream's). */
  key: string;
  /** Default `visible`. */
  rank?: Rank;
}

const better = (a: Rank, b: Rank) => (RANKS.indexOf(a) <= RANKS.indexOf(b) ? a : b);

interface Member {
  sid: string;
  rank: Rank;
  input: StreamInput;
  /** The cursor the next connection sends: the caller's first, then the last frame given. */
  since: string | null;
  inc: string | null;
  /** Dedupe on a reconnect: the last seq given (null: none, or after a gap). */
  seq: number | null;
  /** The connection this member is carried by (0: none yet). */
  conn: number;
  opened: boolean;
  boundary: boolean;
  /** A replay_gap on the current connection: its boundary is delivered again. */
  gapped: boolean;
  done: boolean;
  closedByCaller: boolean;
  /** The fallback: the per-session route, budget key and budget, and the per-session stream once it took over. */
  single: Route;
  key: string;
  budget: StreamBudget;
  own: RankedStream | null;
  /** The caller's abort signal listener while the member is carried by the mux. */
  unlisten: (() => void) | null;
}

interface Group {
  key: string;
  ctx: Ctx;
  input: StreamInput;
  computer: string;
  members: Map<string, Member>;
  watch: Watch | null;
  grant: { live(ok: boolean): void; ended(): void } | null;
  conn: number;
  handle: { close(): void } | null;
  pending: boolean;
  route: Route;
  dead: boolean;
}

const groups = new Map<string, Group>();
// Every group is its own budget entry (as budgetedStream's call counter): a group that is ending never lends its mode to the next.
let groupCount = 0;
const noMux = new Set<string>();

function deliver(m: Member, s: StreamState) {
  if (m.closedByCaller || typeof m.input.onState !== 'function') return;
  try { m.input.onState(s); } catch { /* the caller's */ }
}
function event(m: Member, name: string, data: string, id?: string) {
  try { m.input.onEvent(name, data, id); } catch { /* the caller's */ }
}
const refusal = (code: string): StreamState => ({ state: 'error', status: 0, code, retryAfterMs: null, retryAfter: null });

/** One member is over. `alone`: only this member ends (its own end, drop or abort), so the group's rank is re-set at
 *  once, before its terminal state goes out; a whole-group end (a refusal, a cut, the connection lost, called from
 *  the budget's own callbacks) leaves the rank alone, as the group is ending too. */
function finish(g: Group, m: Member, s: StreamState, alone = false) {
  if (m.done) return;
  m.done = true;
  m.unlisten?.();
  g.members.delete(m.sid);
  if (!g.members.size) dissolve(g, true);
  else if (alone) rerank(g);
  queueMicrotask(() => deliver(m, s));
}

/** The group's rank follows its members (a join, a leave, a member's own end), synchronously, so the next budget
 *  decision sees it. */
function rerank(g: Group) {
  if (!g.dead && g.members.size) g.watch?.set('stream', bestRank(g));
}

/** The group is over: nothing more is delivered from its connection, and the slot goes back (after the terminal states
 *  are out, when `later`; at once on the caller's close, as budgetedStream). */
function dissolve(g: Group, later = false) {
  if (g.dead) return;
  g.dead = true;
  if (groups.get(g.key) === g) groups.delete(g.key);
  g.conn++;
  const release = () => { const w = g.watch; g.watch = null; w?.release(); };
  if (later) queueMicrotask(release); else release();
}

function bestRank(g: Group): Rank {
  let r: Rank = 'bot';
  for (const m of g.members.values()) r = better(m.rank, r);
  return r;
}

/** Opens the group's connection for every member (false: kit-io refused it, every member was told). */
function connect(g: Group): boolean {
  if (g.dead || !g.grant) return true;
  // The computer's latest accepted row withholds (or moved) the server (routing.ts): the open connection is kept for the members it
  // carries (a stream already running may finish), and only the members it does not carry are refused, before anything is closed.
  const t = g.input.target || g.ctx.target;
  if (g.handle && t && !routingAllows(t.container.id, t.container.server_name)) {
    for (const m of [...g.members.values()]) if (!m.done && m.conn !== g.conn) finish(g, m, refusal('NO_AGENT_URL'));
    return true;
  }
  const n = ++g.conn;
  const old = g.handle;
  g.handle = null;
  try { old?.close(); } catch { /* done */ }
  const ms = [...g.members.values()].filter((m) => !m.done);
  if (!ms.length) return true;
  const since: string[] = [], inc: string[] = [];
  for (const m of ms) {
    m.conn = n;
    m.gapped = false;
    if (m.since !== null) since.push(`${m.sid}:${m.since}`);
    if (m.inc !== null) inc.push(`${m.sid}:${m.inc}`);
  }
  const query: Record<string, string> = { ids: ms.map((m) => m.sid).join(',') };
  if (since.length) query.since = since.join(',');
  if (inc.length) query.incarnation = inc.join(',');
  const h = stream(g.route, {
    ctx: g.ctx, target: g.input.target, realm: g.input.realm, query,
    onEvent: (name, data) => { if (g.conn === n) frame(g, n, name, data); },
    onState: (s) => { if (g.conn === n) physical(g, n, s); },
  } as StreamInput);
  if (h.refused) {
    const ended = g.grant;
    for (const m of [...g.members.values()]) finish(g, m, refusal(h.refused));
    ended?.ended();
    return false;
  }
  g.handle = h;
  return true;
}

function frame(g: Group, n: number, name: string, data: string) {
  let d: unknown = null;
  try { d = JSON.parse(data); } catch { d = null; }
  if (!isRecord(d) || typeof d.session_id !== 'string') return;
  const m = g.members.get(d.session_id);
  if (!m || m.done || m.conn !== n) return;
  if (name === 'session_end') { event(m, 'end', data); finish(g, m, { state: 'closed', reason: 'server' }, true); return; }
  if (name === 'session_lagged') {
    if (d.code === 'replay_gap') {
      // The member's old cursor is gone with the gap: a reconnect before the replay arrives asks for the whole ring of
      // the incarnation the gap named (never a cursor of the old one, which could skip frames). Recorded before the
      // caller hears it.
      m.seq = null; m.since = null; m.gapped = true;
      if (typeof d.incarnation === 'string') m.inc = d.incarnation;
      event(m, 'lagged', data);
      return;
    }
    event(m, 'lagged', data);
    finish(g, m, { state: 'closed', reason: 'server' }, true);
    return;
  }
  if (name === 'replay_boundary') {
    if (m.boundary && !m.gapped) return;
    m.boundary = true;
    if (typeof d.incarnation === 'string') m.inc = d.incarnation;
    event(m, name, data);
    return;
  }
  const seq = typeof d.seq === 'number' && Number.isSafeInteger(d.seq) ? d.seq : null;
  const inc = typeof d.incarnation === 'string' ? d.incarnation : null;
  if (seq !== null && m.seq !== null && seq <= m.seq && (inc === null || inc === m.inc)) return;
  if (seq !== null) { m.seq = seq; m.since = String(seq); }
  if (inc !== null) m.inc = inc;
  event(m, name, data, seq === null ? undefined : String(seq));
}

function physical(g: Group, n: number, s: StreamState) {
  // A caller's handler may close or end other members (or the group) meanwhile: each is checked right before it hears.
  const on = (m: Member) => g.conn === n && m.conn === n && !m.done && g.members.get(m.sid) === m;
  if (s.state === 'open') {
    g.grant?.live(true);
    for (const m of [...g.members.values()]) if (on(m) && !m.opened) { m.opened = true; deliver(m, s); }
    return;
  }
  if (s.state === 'gap') { for (const m of [...g.members.values()]) if (on(m)) deliver(m, s); return; }
  // error / closed: this connection is over.
  g.handle = null;
  const ended = g.grant;
  // No mux route on this agent: only before any member was told its stream is open (a member that was would see a
  // second open and frames it already had); later it is a lost stream like any other.
  if (s.state === 'error' && (s.status === 404 || s.status === 405) && ![...g.members.values()].some((m) => m.opened)) {
    noMux.add(g.key);
    const moved = [...g.members.values()].filter((m) => !m.done);
    for (const m of moved) { m.done = true; m.unlisten?.(); g.members.delete(m.sid); }
    dissolve(g, true);
    ended?.ended();
    for (const m of moved) fallbackMember(m);
    return;
  }
  for (const m of [...g.members.values()]) finish(g, m, s);
  ended?.ended();
}

/** The member goes on as its own per-session stream, from its own unchanged input; its handle's close() closes that. */
function fallbackMember(m: Member) {
  if (m.closedByCaller) return;
  m.own = budgetedStream(m.single, m.input, { key: m.key, rank: m.rank }, m.budget);
}

function cursorOf(input: StreamInput): { since: string | null; inc: string | null } {
  const q = isRecord(input.query) ? input.query : {};
  const since = q.since === undefined || q.since === null || q.since === '' ? null : String(q.since);
  const inc = typeof q.incarnation === 'string' && q.incarnation ? q.incarnation : null;
  return { since, inc };
}

/** One session's stream, carried by the group's multiplexed connection (see the contract). */
export function sessionStream(o: SessionStreamOptions, input: StreamInput, budget: StreamBudget = streamBudget()): RankedStream {
  const ctx = input.ctx || capture(input.target);
  const computer = streamComputer(input.target || ctx.target);
  const realm = String(input.realm ?? ctx.realm ?? '');
  // The server is part of the key: a computer's streams on another server share no connection with the ones on the old server.
  const tgk = input.target || ctx.target;
  const key = `${ctx.account ?? ''}|${ctx.gen}|${computer}|${tgk?.container.server_name ?? ''}|${realm}`;
  const rank = o.rank ?? 'visible';
  let g = groups.get(key);
  if (noMux.has(key) || (g && (g.members.has(o.sid) || g.members.size >= MAX_MUX))) {
    return budgetedStream(o.single, input, { key: o.key, rank }, budget);
  }
  // An aborted caller joins no group and asks the budget for nothing: kit-io refuses its own stream unsent (ABORTED,
  // kit-io's code, not one of this file's), told once on a microtask as budgetedStream tells a refusal.
  if (input.signal?.aborted) {
    const h = stream(o.single, { ...input, ctx, onState: undefined });
    if (!h.refused) { h.close(); return budgetedStream(o.single, input, { key: o.key, rank }, budget); }
    let closed = false;
    const why = h.refused;
    queueMicrotask(() => { if (!closed) deliver({ closedByCaller: false, input } as Member, refusal(why)); });
    return { close() { closed = true; }, setRank() { /* no stream, no budget entry */ } };
  }
  // A new member for a computer whose latest accepted row withholds (or moved) the server joins no group, so a running connection is
  // never closed for it (routing.ts); it is refused unsent, told once on a microtask like the aborted caller above.
  const tg = input.target || ctx.target;
  if (tg && !routingAllows(tg.container.id, tg.container.server_name)) {
    let closed = false;
    queueMicrotask(() => { if (!closed) deliver({ closedByCaller: false, input } as Member, refusal('NO_AGENT_URL')); });
    return { close() { closed = true; }, setRank() { /* no stream, no budget entry */ } };
  }
  const c = cursorOf(input);
  const m: Member = { sid: o.sid, rank, input, since: c.since, inc: c.inc, seq: null, conn: 0, opened: false, boundary: false, gapped: false, done: false, closedByCaller: false, single: o.single, key: o.key, budget, own: null, unlisten: null };
  if (input.signal) {
    const sig = input.signal;
    // A later abort ends this member alone, as kit-io's own `closed {aborted}`; the others go on.
    const onAbort = () => { const grp = groups.get(key); if (grp && grp.members.get(m.sid) === m) finish(grp, m, { state: 'closed', reason: 'aborted' }, true); };
    sig.addEventListener('abort', onAbort);
    m.unlisten = () => { sig.removeEventListener('abort', onAbort); m.unlisten = null; };
  }
  if (!g) {
    const grp: Group = { key, ctx, input, computer, members: new Map(), watch: null, grant: null, conn: 0, handle: null, pending: false, route: o.mux, dead: false };
    g = grp;
    groups.set(key, grp);
    grp.members.set(o.sid, m);
    grp.watch = budget.watch({
      computer, key: `mux:${realm}#${++groupCount}`, kind: 'session', level: 'stream', rank,
      open(gr) {
        grp.grant = gr;
        if (!connect(grp)) return null;
        return { close() { grp.grant = null; grp.conn++; const h = grp.handle; grp.handle = null; try { h?.close(); } catch { /* done */ } for (const x of [...grp.members.values()]) finish(grp, x, { state: 'closed', reason: 'aborted' }); } };
      },
      onMode(mi) {
        if (mi.mode === 'degraded' && (mi.why === 'budget' || mi.why === 'locks')) for (const x of [...grp.members.values()]) finish(grp, x, refusal(mi.why));
      },
    });
    if (grp.dead) { const w = grp.watch; grp.watch = null; queueMicrotask(() => w?.release()); }
  } else {
    const grp = g;
    grp.members.set(o.sid, m);
    rerank(grp);
    // A connection already up (or opening) does not carry this session: reconnect once, with every member's cursor.
    if (grp.grant && !grp.pending) {
      grp.pending = true;
      queueMicrotask(() => { grp.pending = false; if (!grp.dead && [...grp.members.values()].some((x) => x.conn !== grp.conn)) connect(grp); });
    }
  }
  return {
    close() {
      if (m.closedByCaller) return;
      m.closedByCaller = true;
      if (m.own) { m.own.close(); return; }
      if (m.done) return;
      m.done = true;
      m.unlisten?.();
      const grp = groups.get(key);
      if (grp && grp.members.get(m.sid) === m) {
        grp.members.delete(m.sid);
        if (!grp.members.size) dissolve(grp);
        else rerank(grp);
      }
    },
    setRank(r) {
      if (m.closedByCaller) return;
      if (m.own) { m.rank = r; m.own.setRank(r); return; }
      if (m.done || r === m.rank) return;
      m.rank = r;
      const grp = groups.get(key);
      if (grp && grp.members.get(m.sid) === m) rerank(grp);
    },
  };
}

/** Tests only. */
export function resetStreamMux(): void {
  for (const g of [...groups.values()]) dissolve(g);
  groups.clear();
  noMux.clear();
}
