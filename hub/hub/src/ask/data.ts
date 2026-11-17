// data.ts: every request Ask makes, as declared routes (@core defineRoute), and the live AgentIO the engine uses.
// The engine never sees a route or a host: it calls AgentIO, which the fixture agent (fake.ts) also implements.
//
//   agent routes   the computer's agent at its named URL (core adds the host and ?realm=); mutations carry their
//                  Idempotency-Key through core's idem option, and recovers:true because Ask reads every unknown
//                  outcome back itself (C9);
//   Hoody API      the computer's own row (its status) and its start, in the captured realm.
//
// The agent sign-in is core's (signInAgent): the same key, refusals and proof as every other place that signs an
// agent in; Ask never sends the bootstrap or holds the key itself. Its own status reads are noted in core
// (noteAgentStatus), so they end core's hold on an unknown sign-in as every place's Check again does.
import { agent, alive, api, capture, defineRoute, noteAgentStatus, partitioned, signInAgent, type Ctx, type Rank, type SignInResult, type Target, type Ticket, sessionStream } from '@core';
import type { WireImage } from './attach';
import * as L from './logic';
import { publishPauseFrame } from './pauseBus';

const SID = { maxBytes: 2097152 };
// Every journaled route carries the journal's ticket (core refuses the call unsent without one: ask/journal/door.ts). The approver
// lease's ticket (kit/agent/approver-custody.ts) rides beside it where a session may need one: a decision carries it when the
// handle is holding the lease ('optional': a default-mode chat has none), an attach always, a create only for a body whose
// approval is not the default mode (the function form: a body that cannot be read as default needs one).
const JOURNALED = { journal: 'required' } as const;
const DECIDED = { journal: 'required', lease: 'optional' } as const;
/** The mode a create body names, 'default' when it names none; anything unreadable is not 'default'. */
export function approvalModeOf(body: unknown): string {
  if (typeof body !== 'object' || body === null) return 'default';
  const a = (body as { approval?: unknown }).approval;
  if (a === undefined) return 'default';
  const m = typeof a === 'object' && a !== null ? (a as { mode?: unknown }).mode : undefined;
  return typeof m === 'string' ? m : '?';
}
const CREATE_FIELDS = ['realm', 'computer', 'agent', 'tool_mode', 'dir_scope', 'backend', 'delegated_agent', 'delegated_model', 'cwd', 'approval', 'helper_gates', 'expected_binding', 'model', 'fork', 'fork_turn_idx'] as const;
export const routes = {
  health: defineRoute({ method: 'GET', path: '/health', scope: 'agent', realm: 'none' }),
  version: defineRoute({ method: 'GET', path: '/version', scope: 'agent', realm: 'none', maxBytes: 262144 }),
  authStatus: defineRoute({ method: 'GET', path: '/hoody/auth/status', scope: 'agent', realm: 'none' }),
  probe: defineRoute({ method: 'GET', path: '/computers', scope: 'agent', query: ['limit'] }),
  sessions: defineRoute({ method: 'GET', path: '/sessions', scope: 'agent', query: ['limit', 'page'] }),
  create: defineRoute<unknown, L.CreateBody | L.ForkBody>({
    method: 'POST', path: '/sessions', scope: 'agent', idem: true, tickets: { journal: 'required', lease: (b) => approvalModeOf(b) !== 'default' },
    body: CREATE_FIELDS,
  }),
  // Reopening a session (POST /sessions with `attach`): no key and no journal entry (it changes nothing a retry could repeat).
  attach: defineRoute<unknown, AttachBody>({
    method: 'POST', path: '/sessions', scope: 'agent', idem: false, tickets: { lease: 'required' },
    body: [...CREATE_FIELDS, 'attach'],
    guard: (g) => typeof g.body === 'object' && g.body !== null && L.seg((g.body as { attach?: unknown }).attach),
  }),
  turn: defineRoute<unknown, { text: string; attachments?: WireImage[] }>({ method: 'POST', path: '/sessions/:id/turns', scope: 'agent', idem: true, body: ['text', 'attachments'], query: ['policy'], tickets: JOURNALED, ...SID }),
  turns: defineRoute({ method: 'GET', path: '/sessions/:id/turns', scope: 'agent', query: ['limit'] }),
  receipt: defineRoute({ method: 'GET', path: '/sessions/:id/turns/:turn', scope: 'agent' }),
  // A message (Ask's follow-up; on_gate wait: it never declines a waiting approval, the agent reads it once the approval is answered),
  // an interrupt (stops the running work, then sends the text as a new turn; it takes no on_gate) or a
  // stop (it carries no text; the GitHub install's Stop). Each is an effect under its key.
  command: defineRoute<unknown, { kind: 'message'; text: string; on_gate: 'wait' } | { kind: 'interrupt'; text: string } | { kind: 'stop' }>({ method: 'POST', path: '/sessions/:id/commands', scope: 'agent', idem: true, tickets: JOURNALED, body: ['kind', 'text', 'on_gate'] }),
  commandGet: defineRoute({ method: 'GET', path: '/sessions/:id/commands/:cmd', scope: 'agent' }),
  /** Takes back a queued message (withdrawn | taken | ended in a 200). It has no key and no journal entry: repeating it changes nothing a
   *  second time, and a lost answer is read back with commandGet, never asked again. The two 503 codes listed in `refuses` say nothing
   *  was withdrawn; 503 withdraw_unconfirmed (any other 5xx) is an unknown outcome. */
  withdraw: defineRoute({ method: 'POST', path: '/sessions/:id/commands/:cmd/withdraw', scope: 'agent', body: [], refuses: ['withdraw_write_failed', 'session_terminating'] }),
  // What became of a keyed request whose answer was lost, read by the KEY. None of these is an admission (no Idempotency-Key, no
  // journal ticket): a read changes nothing, a retire fences the key so nothing can ever be admitted with it (and never runs the request).
  // The realm's default backend: read right before the dock's create, only on an agent that reports acp_default.
  acpDefault: defineRoute({ method: 'GET', path: '/acp/default', scope: 'agent' }),
  createKeyGet: defineRoute({ method: 'GET', path: '/session-create-keys/:key', scope: 'agent' }),
  createKeyRetire: defineRoute({ method: 'POST', path: '/session-create-keys/:key/retire', scope: 'agent', body: [] }),
  turnByKey: defineRoute({ method: 'GET', path: '/sessions/:id/turns/by-key/:key', scope: 'agent' }),
  turnKeyRetire: defineRoute({ method: 'POST', path: '/sessions/:id/turns/by-key/:key/retire', scope: 'agent', body: [] }),
  commandByKey: defineRoute({ method: 'GET', path: '/sessions/:id/commands/by-key/:key', scope: 'agent' }),
  commandKeyRetire: defineRoute({ method: 'POST', path: '/sessions/:id/commands/by-key/:key/retire', scope: 'agent', body: [] }),
  // The recovery reads end by a timeout: a hung read would hold the reconcile loop (one read at a time) and keep a
  // parked approval off screen until the connection died.
  state: defineRoute({ method: 'GET', path: '/sessions/:id/state', scope: 'agent', timeoutMs: 20000 }),
  replay: defineRoute({ method: 'GET', path: '/sessions/:id/replay', scope: 'agent', maxBytes: 8388608, timeoutMs: 20000 }),
  transcript: defineRoute({ method: 'GET', path: '/sessions/:id/transcript', scope: 'agent', maxBytes: 16777216 }),
  confirm: defineRoute<unknown, L.ConfirmBody>({ method: 'POST', path: '/sessions/:id/confirm', scope: 'agent', tickets: DECIDED, body: ['gate_id', 'generation', 'approved', 'remember', 'request_id', 'session_scope', 'reason', 'lease_generation'] }),
  answer: defineRoute<unknown, L.AnswerBody>({ method: 'POST', path: '/sessions/:id/answer', scope: 'agent', tickets: DECIDED, body: ['gate_id', 'generation', 'answer', 'answers'] }),
  approval: defineRoute({ method: 'GET', path: '/sessions/:id/approval', scope: 'agent' }),
  yolo: defineRoute<unknown, { enabled: boolean }>({ method: 'PATCH', path: '/sessions/:id/yolo', scope: 'agent', body: ['enabled'] }),
  cancel: defineRoute<unknown, { turn_id: string }>({ method: 'POST', path: '/sessions/:id/cancel', scope: 'agent', body: ['turn_id'] }),
  stream: defineRoute({
    method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'],
    stream: { id: 2097152, noId: 262144 }, maxBytes: 67108864, timeoutMs: 20000,
  }),
  // The multiplexed stream: every watched session of the computer and realm on one connection. Its frames
  // carry no SSE id line, so every frame has the per-session bound with an id.
  events: defineRoute({
    method: 'GET', path: '/sessions:events', scope: 'agent', query: ['ids', 'since', 'incarnation'],
    stream: { id: 2097152, noId: 2097152 }, maxBytes: 67108864, timeoutMs: 20000,
  }),
  // Hoody API: the computer's row and its start.
  computer: defineRoute({ method: 'GET', path: '/computers/:id', scope: 'realm' }),
  start: defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] }),
};

/** The routes whose calls may carry the approver lease's ticket, for the lease handle (kit/agent/approver.ts) to bind a ticket to. */
export const leaseRoutes = { create: routes.create, attach: routes.attach, confirm: routes.confirm, answer: routes.answer } as const;

/** Reopening a session: the create fields plus the session to attach to, without `approval` (an attach asserts a policy, never sets one;
 *  the reopen asserts none). */
export type AttachBody = Omit<L.CreateBody, 'approval'> & { attach: string };

/** One open stream's callbacks. frame(name, raw): the SSE event name and its data line, unparsed. */
/** `error(why)`: the stream is over. `why` is `budget` or `locks` when the stream budget gave it no slot (core/stream-budget.ts):
 *  a wait for a slot, not a lost connection. */
export interface StreamHandlers { open(): void; frame(name: string, raw: string): void; error(why?: 'budget' | 'locks'): void }

/**
 * Everything the engine asks of the outside. Rejections are core's HubError shapes ({status, code, pending,
 * stale, notSent, ...}); logic.ts errorView/readView classify them.
 */
export interface AgentIO {
  health(): Promise<unknown>;
  version(): Promise<unknown>;
  authStatus(): Promise<unknown>;
  probe(realm: string): Promise<unknown>;
  /** Core's sign-in of this computer's agent, then its proof; it resolves, never rejects. */
  signIn(): Promise<SignInResult>;
  sessions(realm: string): Promise<unknown>;
  /** The journaled sends (create, turn, command, interrupt, stop, confirm, answer) take the core tickets of their one call as the last
   *  argument; they are never called outside a journal `go` (ask/journal/door.ts). */
  create(body: L.CreateBody | L.ForkBody, key: string, realm: string, tickets?: readonly Ticket[]): Promise<unknown>;
  /** Reopens a session: no key, no ticket (nothing a retry could repeat). */
  attach(body: AttachBody, realm: string, tickets?: readonly Ticket[]): Promise<unknown>;
  /** `attachments`: images, the same bytes on every retry under one key. `policy`: Auto-approve this reply, bound to
   *  the key with the rest of the request (the agent answers 422 idempotency_key_reused for the same key with another policy). */
  turn(sid: string, text: string, key: string, realm: string, attachments?: WireImage[], policy?: 'auto_approve', tickets?: readonly Ticket[]): Promise<unknown>;
  turns(sid: string, realm: string): Promise<unknown>;
  receipt(sid: string, turnId: string, realm: string): Promise<unknown>;
  command(sid: string, text: string, key: string, realm: string, tickets?: readonly Ticket[]): Promise<unknown>;
  /** Stop and send now (POST /commands {kind:'interrupt'}) under its own key: the agent stops the work the chat was running, then takes
   *  the text as a new turn (its receipt says whether work was running). A lost answer is read back by the key, never sent under another. */
  interrupt(sid: string, text: string, key: string, realm: string, tickets?: readonly Ticket[]): Promise<unknown>;
  /** Stop all of the session's work (POST /commands {kind:'stop'}) under its own key; a lost answer is read back, never sent under another key. */
  stop(sid: string, key: string, realm: string, tickets?: readonly Ticket[]): Promise<unknown>;
  /** One follow-up's receipt by its command id (never by key). */
  commandGet(sid: string, commandId: string, realm: string): Promise<unknown>;
  /** Takes back one queued follow-up by its command id (Edit and Remove on a queued row). */
  withdraw(sid: string, commandId: string, realm: string): Promise<unknown>;
  /** The realm's default backend: `{delegated_agent: 'claude' | ''}` (GET /acp/default). Read only; the dock's create asks it. */
  acpDefault(realm: string): Promise<unknown>;
  /** Read back by the idempotency key (ask/journal/recover.ts is the only caller). A read admits, reserves and waits for nothing; a miss proves nothing. */
  createKeyGet(key: string, realm: string): Promise<unknown>;
  /** Fences a create key (nothing can be admitted with it afterwards); answers what the key already admitted instead. Never runs the create. */
  createKeyRetire(key: string, realm: string): Promise<unknown>;
  turnByKey(sid: string, key: string, realm: string): Promise<unknown>;
  turnKeyRetire(sid: string, key: string, realm: string): Promise<unknown>;
  commandByKey(sid: string, key: string, realm: string): Promise<unknown>;
  commandKeyRetire(sid: string, key: string, realm: string): Promise<unknown>;
  state(sid: string, realm: string): Promise<unknown>;
  replay(sid: string, realm: string): Promise<unknown>;
  transcript(sid: string, realm: string): Promise<unknown>;
  confirm(sid: string, body: L.ConfirmBody, realm: string, tickets?: readonly Ticket[]): Promise<unknown>;
  answer(sid: string, body: L.AnswerBody, realm: string, tickets?: readonly Ticket[]): Promise<unknown>;
  approval(sid: string, realm: string): Promise<unknown>;
  yolo(sid: string, enabled: boolean, realm: string): Promise<unknown>;
  cancel(sid: string, turnId: string, realm: string): Promise<unknown>;
  /** `rank`: the stream budget's rank for it (default `dock`); one that gets no slot ends with error() like a lost connection. */
  /** `setRank`, when present, moves the open stream's budget rank in place (no reconnect; core RankedStream). */
  stream(sid: string, cursor: L.Cursor | null, realm: string, h: StreamHandlers, rank?: Rank): { close(): void; setRank?(r: Rank): void } | null;
  computer(id: string): Promise<unknown>;
  start(id: string): Promise<unknown>;
  /** Still the same account, realm generation and computer this IO was made for. */
  alive(): boolean;
}

// ---- the destination an io sends to (ask/journal/door.ts guardIO binds a send to it) ----
/** The only fields core reads of a target (ctx.ts Target; kit.ts), frozen. */
export type Dest = Readonly<{ project: Readonly<{ id: string }>; container: Readonly<{ id: string; server_name?: string }> }>;
const dests = new WeakMap<object, Dest>();
/** Registers the destination `io` sends to. */
export function withDest<T extends object>(io: T, dest: Dest): T { dests.set(io, dest); return io; }
/** The container id an io sends to, or null for an io nothing stamped. */
export function destOf(io: object): string | null { return dests.get(io)?.container.id ?? null; }
/** The guard's proxy reports the destination of the io it wraps. */
export function shareDest<T extends object>(from: object, to: T): T {
  const d = dests.get(from);
  if (d) dests.set(to, d);
  return to;
}
function freezeTarget(project: string, container: string, server?: string): Dest {
  return Object.freeze({ project: Object.freeze({ id: project }), container: Object.freeze(server === undefined ? { id: container } : { id: container, server_name: server }) });
}
/** The fixture agent's stamp (registry.ts fakeFor): the computer it plays. */
export function withFixtureDest<T extends object>(io: T, container: string): T {
  return withDest(io, freezeTarget('fixture', container));
}

/** A chat's shell jobs on one computer: the agent's per-session list and the keyed stop of one job, through
 *  core's declared bash-job routes (core/agent/bashJobs.ts). The computer is frozen here, once, from the one the engine was
 *  opened on (its slot); each call names the chat's own realm. Neither call is journaled (page memory
 *  only): the stop is sent once under the key the kit store minted for that press, and its answer goes to the kit parser as
 *  plain data. A thrown call is the store's lost answer. */
export interface ShellJobsIO {
  list(chat: { realm: string; sid: string }): Promise<{ ok: true; body: unknown } | { ok: false }>;
  stop(target: { realm: string; sid: string; jobId: string }, key: string): Promise<unknown>;
}
export function shellJobsIO(at: { project: string; computer: string; server?: string }): ShellJobsIO {
  const jobs = agent.bashJobsApi(freezeTarget(at.project, at.computer, at.server));
  return {
    list: async (chat) => agent.jobListReplyOf(await jobs.list(chat.sid, chat.realm)),
    stop: async (t, key) => agent.jobStopReplyOf(await jobs.stop(t.sid, t.jobId, key, t.realm)),
  };
}

/**
 * THE gate of every session create (no create path may skip the version check). A create names its
 * computer; a gateway below session protocol 3, or without `computer_binding`, ignores that member and runs the session on its own
 * computer. So nothing is sent unless `/version` (read now, by `readVersion`) says the gateway binds. Every transport that sends a
 * session create goes through this function: liveIO.create here, the settings session (pages/ai/settings/rules/Session.ts) and the
 * script writer (pages/scripts/writer.ts). app/conformance/create-gate.conformance.test.ts fails on any other caller of a create route.
 *
 * A refusal here sends nothing and is `pending`, never a definite refusal: a held or resumed create keeps its key, its body and its
 * unresolved hold (the caller reads it as "may have run" and asks again with the same key once the gateway binds). A version read
 * that fails for a dead context (stale, superseded) passes through as it is, so the caller drops it.
 */
export async function gatedCreate<T>(readVersion: () => Promise<unknown>, send: () => Promise<T>): Promise<T> {
  let version: unknown;
  try { version = await readVersion(); } catch (e) {
    const x = e as { stale?: unknown; superseded?: unknown } | null;
    if (x && (x.stale || x.superseded)) throw e;
    throw bindingHold('COMPUTER_BINDING_UNREADABLE');
  }
  if (!L.bindsComputer(version)) throw bindingHold('COMPUTER_BINDING_UNSUPPORTED');
  return send();
}
function bindingHold(code: string): { kind: 'pending'; pending: true; gate: 'computer_binding'; code: string } {
  return { kind: 'pending', pending: true, gate: 'computer_binding', code };
}

/** The live IO for one computer, bound to the context captured now. */
export function liveIO(target: Target): AgentIO {
  // The target is read ONCE: every request of this io, and destOf, use this frozen copy.
  const frozen = freezeTarget(target.project.id, target.container.id, target.container.server_name);
  const tg: Target = frozen;
  target = tg;
  const ctx: Ctx = capture(target);
  const base = { ctx, target, recovers: true } as const;
  const realmOf = (realm: string) => ({ realm });
  const sid = (id: string) => ({ id });
  const tix = (t?: readonly Ticket[]) => (t ? { tickets: t } : {});
  const io: AgentIO = {
    health: () => api(routes.health, base),
    version: () => api(routes.version, base),
    authStatus: () => { const note = noteAgentStatus(ctx, target); return api(routes.authStatus, base).then((b) => { note(b); return b; }); },
    probe: (realm) => api(routes.probe, { ...base, ...realmOf(realm), query: { limit: 1 } }),
    signIn: () => signInAgent(ctx, target),
    sessions: (realm) => api(routes.sessions, { ...base, ...realmOf(realm), query: { limit: 50, page: 1 } }),
    create: (body, key, realm, t) => gatedCreate(() => api(routes.version, base), () => api(routes.create, { ...base, ...realmOf(realm), body, idem: key, ...tix(t) })),
    attach: (body, realm, t) => api(routes.attach, { ...base, ...realmOf(realm), body, ...tix(t) }),
    turn: (id, text, key, realm, attachments, policy, t) => api(routes.turn, { ...base, ...realmOf(realm), params: sid(id), body: attachments && attachments.length ? { text, attachments } : { text }, ...(policy ? { query: { policy } } : {}), idem: key, ...tix(t) }),
    turns: (id, realm) => api(routes.turns, { ...base, ...realmOf(realm), params: sid(id) }),
    receipt: (id, turn, realm) => api(routes.receipt, { ...base, ...realmOf(realm), params: { id, turn } }),
    command: (id, text, key, realm, t) => api(routes.command, { ...base, ...realmOf(realm), params: sid(id), body: { kind: 'message', text, on_gate: 'wait' }, idem: key, ...tix(t) }),
    interrupt: (id, text, key, realm, t) => api(routes.command, { ...base, ...realmOf(realm), params: sid(id), body: { kind: 'interrupt', text }, idem: key, ...tix(t) }),
    stop: (id, key, realm, t) => api(routes.command, { ...base, ...realmOf(realm), params: sid(id), body: { kind: 'stop' }, idem: key, ...tix(t) }),
    commandGet: (id, cmd, realm) => api(routes.commandGet, { ...base, ...realmOf(realm), params: { id, cmd } }),
    withdraw: (id, cmd, realm) => api(routes.withdraw, { ...base, ...realmOf(realm), params: { id, cmd }, body: {} }),
    acpDefault: (realm) => api(routes.acpDefault, { ...base, ...realmOf(realm) }),
    createKeyGet: (key, realm) => api(routes.createKeyGet, { ...base, ...realmOf(realm), params: { key } }),
    createKeyRetire: (key, realm) => api(routes.createKeyRetire, { ...base, ...realmOf(realm), params: { key }, body: {} }),
    turnByKey: (id, key, realm) => api(routes.turnByKey, { ...base, ...realmOf(realm), params: { id, key } }),
    turnKeyRetire: (id, key, realm) => api(routes.turnKeyRetire, { ...base, ...realmOf(realm), params: { id, key }, body: {} }),
    commandByKey: (id, key, realm) => api(routes.commandByKey, { ...base, ...realmOf(realm), params: { id, key } }),
    commandKeyRetire: (id, key, realm) => api(routes.commandKeyRetire, { ...base, ...realmOf(realm), params: { id, key }, body: {} }),
    state: (id, realm) => api(routes.state, { ...base, ...realmOf(realm), params: sid(id) }),
    replay: (id, realm) => api(routes.replay, { ...base, ...realmOf(realm), params: sid(id) }),
    transcript: (id, realm) => api(routes.transcript, { ...base, ...realmOf(realm), params: sid(id) }),
    confirm: (id, body, realm, t) => api(routes.confirm, { ...base, ...realmOf(realm), params: sid(id), body, ...tix(t) }),
    answer: (id, body, realm, t) => api(routes.answer, { ...base, ...realmOf(realm), params: sid(id), body, ...tix(t) }),
    approval: (id, realm) => api(routes.approval, { ...base, ...realmOf(realm), params: sid(id) }),
    yolo: (id, enabled, realm) => api(routes.yolo, { ...base, ...realmOf(realm), params: sid(id), body: { enabled } }),
    cancel: (id, turnId, realm) => api(routes.cancel, { ...base, ...realmOf(realm), params: sid(id), body: { turn_id: turnId } }),
    stream(id, cursor, realm, h, rank) {
      const query: Record<string, string | number> = {};
      if (cursor) { query.since = cursor.since; query.incarnation = cursor.incarnation; }
      const s = sessionStream({ mux: routes.events, single: routes.stream, sid: id, key: `${realm}/${id}`, rank: rank ?? 'dock' }, {
        ctx, target, realm, params: sid(id), query,
        // event.pause_state is the computer's, not the session's: it also goes to whoever shows the computer's pause (pauseBus.ts).
        onEvent: (name, data) => { publishPauseFrame(frozen.container.id, name, data); h.frame(name, data); },
        onState: (st) => {
          if (st.state === 'open') h.open(); else if (st.state === 'gap') h.frame('lagged', '{"code":"replay_gap"}');
          else h.error(st.state === 'error' && (st.code === 'budget' || st.code === 'locks') ? st.code : undefined);
        },
      });
      return { close: s.close, setRank: s.setRank };
    },
    computer: (id) => api(routes.computer, { ctx, params: sid(id) }),
    start: (id) => api(routes.start, { ctx, params: sid(id), body: {}, recovers: true }),
    // core's own test: the generation, the shown account, sign-out started, the session gone.
    alive: () => alive(ctx),
  };
  return withDest(io, frozen);
}

// ---- hub_ask_v1: references only, per account (registered in core's registry, purged at sign-out) ----

let part: ReturnType<typeof partitioned> | null = null;
function box() { return part || (part = partitioned(L.STORE_KEY, { scope: 'account' })); }

/** The store as logic.ts reads it, for the account core shows now. */
export function readStore(account: string): L.AskStore {
  let list: unknown = null;
  try { list = box().get(); } catch { list = null; }
  return L.parseStore(JSON.stringify({ v: 1, a: account && Array.isArray(list) ? { [account]: list } : {} }));
}
/** false when the browser did not keep the write (blocked or full storage): Ask still works, unremembered. */
export function writeStore(account: string, st: L.AskStore | null): boolean {
  if (!st || !account) return false;
  try {
    const list = L.own(st.a, account) ? st.a[account] : [];
    if (list && list.length) return box().set(list);
    // Nothing of this account's left to remove also counts as kept.
    if (box().remove()) return true;
    const now = box().get();
    return !Array.isArray(now) || !now.length;
  } catch { return false; }
}
