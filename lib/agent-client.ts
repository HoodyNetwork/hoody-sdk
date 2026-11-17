/**
 * lib/agent-client.ts — streaming prompt helper for the `agent` kit.
 *
 * The generated `box.agent.sessions.turns.start(data, { stream: true })` yields typed frames
 * (`ITypedStreamEvent<AgentSessionsTurnsStartFrames>`): a declared
 * frame's `data` is the parsed gatedEvent `{ seq, event: { type, data } }`,
 * typed by the frame's name, and ends after the request's own turn. The
 * caller still unwraps `event` and collects the text deltas. This hand-written
 * helper does that work: it POSTs the turn, reads the SSE body, unwraps the
 * gatedEvent envelope, and exposes the assistant text deltas + every event
 * until the turn ends + a `done` promise. Like the generated method, it ends at
 * its OWN turn's agent_done (the turn id from the `X-Hoody-Turn-Id` response
 * header, else from the `replay_boundary` frame), never at another turn's on
 * the same session, or at its own turn_discarded (a dispatch dropped unrun),
 * and its cancel() names that turn.
 *
 * Transport + auth: the turn goes through the CLIENT's own streaming seam
 * (`http.stream`), so the injected `fetch`, request middleware and
 * ApiError handling apply exactly as for a generated call. Kit credentials are
 * the client's `kitAuth` (from `withComputer(c, { kitAuth })` or the client
 * config), selected for the `agent` namespace, or an explicit per-call `auth`
 * of the same shape. The agent kit itself verifies nothing; a credential is
 * only needed where a proxy permission rule guards the service.
 *
 * The account token is NEVER sent: the transport strips `Authorization` on
 * kit URLs, and this helper no longer mints a computer claim or falls back to
 * `getAuthToken()` (the old fallback shipped the account JWT to the computer
 * as `X-Hoody-Token` through the global fetch; nothing verified it).
 *
 * Runtime-agnostic: the client's HttpClient + the SSE parser in
 * lib/sse-stream.ts (Node 18+/Bun/browser). It imports that module, not
 * lib/pipe-stream.ts, because pipe-stream pulls in `node:net` / `node:fs` and
 * would keep this helper out of the browser bundle.
 */
import type { HoodyClient, ComputerLike } from '../generated/client.js';
import { parseSseStream } from './sse-stream.js';
import { ApiError, RetiredOptionError } from '../generated/errors.js';
import { isProxyAuthPolicy, type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';

/**
 * Encode a single URL path segment, REFUSING a relative one.
 *
 * `encodeURIComponent` alone is not sufficient here. It escapes `/`, which stops
 * a multi-segment walk — but dots are unreserved, so `encodeURIComponent('..')`
 * is `'..'` and the value survives intact. Measured against the URL this module
 * builds:
 *
 *     sessionId 'abc'    -> /api/v1/agent/sessions/abc/prompt:stream
 *     sessionId '..'     -> /api/v1/agent/prompt:stream      <- session segment GONE
 *     sessionId '../..'  -> contained (the '/' is escaped)
 *
 * So only the single-segment form escapes, and it drops the session out of the
 * path entirely. Same defect the SDK's whole-value path branch and the CLI's
 * `encodeWholePathParam` already reject; this module cannot import either (it is
 * lib/, they are cli/ and generator-emitted), so the rule is inlined.
 *
 * Checked after percent-decoding, since `%2e%2e` normalises identically.
 */
function encodeSegment(value: string, label: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed escape cannot decode to a dot segment.
  }
  if (value === '.' || value === '..' || decoded === '.' || decoded === '..') {
    throw new Error(
      `Invalid ${label}: "${value}" is a relative path segment. ` +
        'Relative segments are not allowed because they change which endpoint is called.',
    );
  }
  return encodeURIComponent(value);
}

/** Events that end the session, and every turn on it. A turn itself ends at
 *  its own `agent_done` (see streamAgentPrompt). `stream_done` is NOT terminal —
 *  it only marks end-of-text; tool calls (and the real `agent_done`) follow it. */
const SESSION_END_EVENTS = new Set(['event.quit', 'quit', 'event.session_closed', 'session_closed']);
/** Assistant text-delta event. */
const TEXT_EVENTS = new Set(['event.stream_chunk', 'stream_chunk']);

/** The turn an agent_done or turn_discarded frame closes: its data's `turn_id`, else the envelope's. */
function closedTurn(envelope: any, inner: any): string | null {
  const d = inner?.data && typeof inner.data === 'object' ? inner.data as any : {};
  if (typeof d.turn_id === 'string' && d.turn_id !== '') return d.turn_id;
  return envelope && typeof envelope.turn_id === 'string' && envelope.turn_id !== '' ? envelope.turn_id : null;
}

export interface AgentPromptEvent {
  /** Event type, e.g. `event.stream_chunk` (the daemon's prefixed form). */
  type: string;
  /** Unwrapped event payload (the `data` of the gatedEvent's inner event). */
  data: unknown;
  /** Gateway sequence number, if present. */
  seq: number | null;
  /**
   * The gateway incarnation that stamped `seq`, when the envelope carries one.
   * `seq` restarts at 1 when a session is torn down and re-attached, so a
   * cursor only means something together with its incarnation.
   */
  incarnation?: string;
  /** Present on the frame that parks a confirm gate: the gate to answer. */
  gate?: { id: string; generation: number; type: string };
}

export interface AgentPromptResult {
  /** Terminal event type that ended the turn (`event.agent_done` / `event.turn_discarded`, its outcome `cancelled` / `event.quit` / `event.session_closed`). */
  terminal: string;
  /** Accumulated assistant text across all `stream_chunk` deltas. */
  text: string;
  /** The terminal event's payload (turn count, usage, etc. for `agent_done`). */
  data: unknown;
}

/**
 * Kit credential for the prompt — the same shape as `kitAuth` on
 * `withComputer()` / the client config (password, jwt, token, computerClaim,
 * ip, or a per-service policy; a policy's `services.agent` wins over its
 * `default`).
 */
export type AgentPromptKitAuth = ProxyAuth | ProxyAuthPolicy;

export interface StreamAgentPromptArgs {
  /** Target computer (project_id + id + server). */
  computer: ComputerLike;
  /** Existing session id (from `createSession`). */
  sessionId: string;
  /** The prompt text for this turn. */
  text: string;
  toolMode?: string;
  dirScope?: string;
  /** `'auto_approve'` auto-approves confirm gates instead of pausing the turn (sent as X-Hoody-Gate-Policy). The earlier key `policy` is refused. */
  gatePolicy?: 'auto_approve';
  /** Kit service index (the agent daemon is a singleton at 1). */
  serviceIndex?: number;
  /** Explicit kit credential for this turn (kitAuth shape). If omitted, the
   *  client's own `kitAuth` applies; with neither, the request carries no
   *  credential. The account token is never used. */
  auth?: AgentPromptKitAuth;
  /**
   * Stop the turn: on abort the helper sends the same turn-scoped cancel as
   * `cancel()` (`POST .../cancel` with `{ turn_id }`) and then closes the stream.
   * `done` resolves `cancelled` once the agent answered the cancel, and rejects
   * when the cancel failed (the turn may still be running). An answer saying the
   * agent ran no such turn (`matched: false`: it had already ended) stopped
   * nothing: the stream stays open and `done` settles from the turn's own end.
   *
   * The cancel always names the turn, so it never stops another client's turn.
   * An abort that comes before the agent has named the turn (the
   * `X-Hoody-Turn-Id` header, else the `replay_boundary` frame) waits up to
   * {@link AGENT_ABORT_TURN_ID_WAIT_MS} for the id. When none comes, no cancel
   * is sent: `streamAgentPrompt` rejects (no answer yet) or `done` rejects
   * (the stream named no turn), saying the turn may still be running. A signal
   * that is already aborted sends nothing and rejects with an `AbortError`.
   */
  signal?: AbortSignal;
}

export interface AgentPromptHandle {
  /** Every turn event, in order. */
  events: AsyncIterable<AgentPromptEvent>;
  /** Assistant text deltas only (`stream_chunk`). */
  text: AsyncIterable<string>;
  /** Resolves when this turn ends (its own `agent_done` or `turn_discarded`, or `quit`/`session_closed`); rejects on `error`/HTTP failure. */
  done: Promise<AgentPromptResult>;
  /**
   * Stop this turn (`POST .../cancel`) and abort the stream: the same stop as an
   * abort of the `signal` option. The cancel always names the turn (`{ turn_id }`,
   * from the `X-Hoody-Turn-Id` header, else the `replay_boundary` frame), so it
   * never stops another turn on the session. Called before the agent named the
   * turn, it waits up to {@link AGENT_ABORT_TURN_ID_WAIT_MS} for the id; when none
   * comes no cancel is sent and `done` rejects (the turn may still be running).
   * Resolves once the cancel was answered or failed, or nothing was sent: `done`
   * resolves `cancelled` when the agent stopped the turn, settles from the turn's
   * own end when the agent answered that it ran no such turn (`matched: false`),
   * and rejects when the cancel failed (the turn may still be running). Never rejects.
   */
  cancel(): Promise<void>;
}

/** Resolve the per-call credential: a policy picks `services.agent`, then
 *  `default`. A legacy `{ claim, token }` object (the old option shape) is read
 *  as an explicit `computerClaim` credential — it was supplied by the caller. */
function resolvePromptAuth(auth: AgentPromptKitAuth | undefined): ProxyAuth | undefined {
  if (!auth) return undefined;
  const legacy = auth as unknown as { type?: unknown; claim?: unknown; token?: unknown };
  if (legacy.type === undefined && typeof legacy.claim === 'string' && typeof legacy.token === 'string') {
    return { type: 'computerClaim', claim: legacy.claim, token: legacy.token };
  }
  if (isProxyAuthPolicy(auth)) return auth.services?.agent ?? auth.default;
  return auth;
}

/**
 * How long an abort of `streamAgentPrompt`'s `signal`, or a `cancel()`, that comes
 * before the agent named the turn waits for its id before it gives up without a cancel.
 */
export const AGENT_ABORT_TURN_ID_WAIT_MS = 10_000;

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  const err = new Error('streamAgentPrompt: aborted before the turn was sent');
  err.name = 'AbortError';
  return err;
}

/**
 * Dispatch a streaming prompt turn against an existing agent session and return
 * a handle over the SSE event stream. Create the session first via
 * `client.api`-scoped `box.agent.sessions.create(...)`.
 */
export async function streamAgentPrompt(
  client: HoodyClient,
  args: StreamAgentPromptArgs,
): Promise<AgentPromptHandle> {
  const { computer, sessionId, text } = args;
  if (!sessionId) throw new Error('streamAgentPrompt: sessionId is required');

  if (!computer?.id) throw new Error('streamAgentPrompt: computer.id is required');
  // The gate policy is `gatePolicy` (the generated methods' key); an old `policy` would be dropped
  // without a word and the turn would pause on its gates instead.
  if ((args as { policy?: unknown }).policy !== undefined) {
    throw new RetiredOptionError('streamAgentPrompt', 'policy', 'gatePolicy');
  }
  const auth = resolvePromptAuth(args.auth);
  // An explicit per-call credential gets a derived client whose kitAuth it is
  // (withComputer is local: no request for a computer object). Without one,
  // the caller's client and ITS kitAuth are used as-is. The namespace lets a
  // kitAuth policy select its `agent` entry.
  const scoped: HoodyClient = auth ? await client.withComputer(computer, { kitAuth: auth }) : client;
  const middlewareContext: Record<string, unknown> = { _kitNamespace: 'agent' };
  const base = scoped.getKitUrl('agent', computer, args.serviceIndex ?? 1);
  // The gate policy travels as the X-Hoody-Gate-Policy header only (below), never as the `?policy=` query.
  const url = `${base}/api/v1/agent/sessions/${encodeSegment(sessionId, 'sessionId')}/prompt:stream`;

  // A signal already aborted: nothing has been sent, so nothing runs.
  if (args.signal?.aborted) throw abortError(args.signal);

  // The fetch has its own abort, never the caller's signal: aborting the request
  // before the agent answered would leave a dispatched turn running with no id to
  // cancel it by. The caller's abort becomes the turn-scoped cancel (stopTurn), once
  // the turn id is known. `stopping` tells the read loop that stopTurn settles `done`.
  let stopping = false;
  // What the read loop would have done when the stream ended during the cancel had no
  // stop been under way: run when the agent answers that the cancel stopped nothing (stopTurn).
  // Declared before the read loop, which sets it.
  let unstoppedEnd: (() => void) | null = null;
  const ac = new AbortController();
  let abortRequested = false;
  let abortTimer: ReturnType<typeof setTimeout> | undefined;
  // Set once the handle exists: what an abort does then (stop the named turn, or wait for its id).
  let onAbortRequested: (() => void) | null = null;
  // Called when the turn id did not come in time; before the response it aborts the request.
  let onTurnIdTimeout: () => void = () => ac.abort();
  const onAbort = () => {
    if (abortRequested) return;
    abortRequested = true;
    abortTimer = setTimeout(() => onTurnIdTimeout(), AGENT_ABORT_TURN_ID_WAIT_MS);
    onAbortRequested?.();
  };
  const releaseSignal = () => {
    if (args.signal) args.signal.removeEventListener('abort', onAbort);
    if (abortTimer !== undefined) clearTimeout(abortTimer);
  };
  if (args.signal) args.signal.addEventListener('abort', onAbort, { once: true });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (args.gatePolicy) headers['X-Hoody-Gate-Policy'] = String(args.gatePolicy);

  const body: Record<string, unknown> = { text };
  if (args.toolMode) body.tool_mode = args.toolMode;
  if (args.dirScope) body.dir_scope = args.dirScope;

  // The client's streaming seam: injected transport, request middleware
  // (kitAuth), Authorization stripped on the kit URL, non-2xx → ApiError.
  let res: Response;
  try {
    res = await scoped.http.stream('POST', url, {
      headers,
      body,
      signal: ac.signal,
      middlewareContext,
    });
  } catch (err) {
    releaseSignal();
    if (abortRequested && ac.signal.aborted) {
      throw new Error(
        `streamAgentPrompt: aborted, and the agent did not answer the prompt within ${AGENT_ABORT_TURN_ID_WAIT_MS / 1000} s, ` +
          'so no cancel was sent: the turn may still be running (list the session\'s turns to check)',
        { cause: err },
      );
    }
    throw err;
  }
  if (!res.body) {
    releaseSignal();
    throw new ApiError({
      message: `agent prompt:stream failed (${res.status}): empty response body`,
      status: res.status,
      request: { method: 'POST', url, headers: {} },
      response: null,
    });
  }

  // Fan-out queues: a tiny push/pull bridge so events/text are independent
  // async-iterables over the single underlying SSE read. `consumed` gates
  // buffering: if a caller never iterates a queue (e.g. only `await done` for
  // the accumulated text), we don't retain its items — `acc` already holds the
  // full text, so unconsumed events must not grow unbounded on a long turn.
  type Waiter<T> = { resolve: (v: IteratorResult<T>) => void; reject: (e: unknown) => void };
  type Q<T> = { items: T[]; waiters: Array<Waiter<T>>; ended: boolean; err?: unknown; consumed: boolean };
  const mkQ = <T>(): Q<T> => ({ items: [], waiters: [], ended: false, consumed: false });
  const push = <T>(q: Q<T>, v: T) => {
    const w = q.waiters.shift();
    if (w) { w.resolve({ value: v, done: false }); return; }
    if (q.consumed) q.items.push(v); // drop if nobody is (or has begun) iterating
  };
  // A read already waiting when the turn fails gets the failure, like every read after it:
  // ending it as `done` would let a `for await` loop finish normally with partial output.
  const end = <T>(q: Q<T>, err?: unknown) => {
    q.ended = true; q.err = err;
    let w;
    while ((w = q.waiters.shift())) {
      if (err) w.reject(err);
      else w.resolve({ value: undefined as any, done: true });
    }
  };
  const iter = <T>(q: Q<T>): AsyncIterable<T> => ({
    [Symbol.asyncIterator]() {
      q.consumed = true;
      return {
        next(): Promise<IteratorResult<T>> {
          if (q.items.length) return Promise.resolve({ value: q.items.shift() as T, done: false });
          if (q.err) return Promise.reject(q.err);
          if (q.ended) return Promise.resolve({ value: undefined as any, done: true });
          return new Promise((resolve, reject) => q.waiters.push({ resolve, reject }));
        },
      };
    },
  });

  const eventsQ = mkQ<AgentPromptEvent>();
  const textQ = mkQ<string>();
  let acc = '';
  let resolveDone!: (r: AgentPromptResult) => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<AgentPromptResult>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  // Prevent an unhandledRejection crash when the caller only iterates
  // events/text (or calls cancel()) and never attaches a handler to `done`.
  done.catch(() => { /* observed elsewhere or intentionally ignored */ });
  // cancel() resolves once the stop is over: its cancel answered or failed, the wait for the
  // turn id given up, or the turn ended first.
  let stopOver!: () => void;
  const stopSettled = new Promise<void>((resolve) => { stopOver = resolve; });
  done.then(() => stopOver(), () => stopOver());

  // The turn this request dispatched. The header names it; a browser the gateway
  // did not expose the header to learns it from the replay_boundary frame.
  // Without the header, the frames before that boundary are the replay, which can
  // hold another turn's agent_done (this dispatch queued behind it): the turns the
  // replay closes wait in closedInReplay, and the boundary settles ours if it is
  // there. While neither has named it, the first agent_done after the replay ends the turn.
  // A body that closes before any boundary arrived named no turn: its first agent_done
  // (firstDoneInReplay) ends the turn then.
  let turnId: string | null = res.headers?.get('x-hoody-turn-id') || null;
  let inReplay = turnId === null;
  const closedInReplay = new Map<string, () => void>();
  let firstDoneInReplay: (() => void) | null = null;

  // Control frames the gateway emits that are NOT turn events: `replay_boundary`
  // carries the watched turn's id (read, then skipped); `end` closes the stream cleanly; `lagged` means
  // the gateway DROPPED this slow subscriber — the turn continues server-side, so
  // surfacing it as an error makes the truncation observable instead of a silent
  // partial `text`. NOTE: `retry` is deliberately NOT skipped — `event.retry`
  // ("LLM call retried") is a real turn event a caller may want to observe; the
  // SSE `retry:` reconnect *directive* never reaches here as a frame (it carries
  // no `data:` line), so skipping `retry` would only swallow the real event.
  const SKIP_CONTROL = new Set(['replay_boundary', 'event.replay_boundary']);

  // The first settle wins: a cancel answered after the turn ended changes nothing.
  let settledDone = false;
  const finishOk = (terminal: string, data: unknown, text: string = acc) => {
    if (settledDone) return;
    settledDone = true;
    resolveDone({ terminal, text, data });
    end(eventsQ); end(textQ);
  };
  const errToApiError = (payload: any): ApiError => {
    const msg = (payload && typeof payload === 'object' && payload.message) || 'agent stream error';
    return new ApiError({ message: String(msg), status: 0, request: { method: 'POST', url, headers: {} }, response: payload });
  };
  const finishErr = (err: unknown) => {
    if (settledDone) return;
    settledDone = true;
    rejectDone(err);
    end(eventsQ, err); end(textQ, err);
  };

  // `event.error` is NOT a turn terminator. The daemon emits NON-terminal error
  // notices mid-turn (auto-reply budget, attachment-dropped, pin-unavailable —
  // and for idle control commands that never reach agent_done) and ALWAYS
  // follows a FATAL error with `agent_done`. So we RECORD the latest error and
  // keep reading; only an `agent_done` preceded by an error fails the turn
  // (mirrors the daemon's prompt:sync status:error logic). Bailing on the first
  // `event.error` would truncate a still-running turn — or return before a
  // confirm gate the error preceded is parked.
  let lastError: unknown = null;

  (async () => {
    try {
      for await (const sse of parseSseStream(res.body as ReadableStream<Uint8Array>)) {
        // Skip data-less frames — e.g. the gateway's leading `retry: 5000`
        // reconnect directive, which the SSE parser surfaces with empty data.
        if (typeof sse.data === 'string' && sse.data.trim() === '') continue;
        // `parseSseStream` yields { event, data: string }. The `data` payload is
        // the full gatedEvent {seq, event:{type,data}} — unwrap it. Control
        // frames (lagged/end/replay_boundary) have no `.event` key.
        let envelope: any = sse.data;
        if (typeof envelope === 'string') {
          try { envelope = JSON.parse(envelope); } catch { envelope = null; }
        }
        const inner = (envelope && typeof envelope === 'object' && envelope.event && typeof envelope.event === 'object')
          ? envelope.event
          : { type: sse.event ?? 'message', data: envelope };
        const type: string = inner?.type ?? sse.event ?? 'message';
        const bare = type.replace(/^event\./, '');
        const seq: number | null = (envelope && typeof envelope.seq === 'number') ? envelope.seq : null;

        if (SKIP_CONTROL.has(type) || SKIP_CONTROL.has(bare)) {
          if (inReplay) {
            inReplay = false;
            const named = inner?.data && typeof inner.data === 'object' ? (inner.data as any).turn_id : undefined;
            if (typeof named === 'string' && named !== '') {
              turnId = named;
              const settle = closedInReplay.get(named);
              if (settle) { settle(); return; }
              // An abort that waited for the id: stop the turn it names now.
              if (abortRequested) void stopTurn(named);
            }
          }
          continue;
        }
        if (bare === 'lagged') {
          throw new ApiError({
            message: 'agent stream lagged: the gateway dropped this subscriber (output too slow); reconnect with ?since=<seq>',
            status: 0,
            request: { method: 'POST', url, headers: {} },
            response: inner?.data ?? envelope,
          });
        }
        if (bare === 'end') { finishOk('end', inner?.data ?? null); return; }

        const promptEvent: AgentPromptEvent = { type, data: inner?.data ?? null, seq };
        if (envelope && typeof envelope.incarnation === 'string') promptEvent.incarnation = envelope.incarnation;
        if (envelope && envelope.gate && typeof envelope.gate === 'object') promptEvent.gate = envelope.gate;
        push(eventsQ, promptEvent);

        if (TEXT_EVENTS.has(type)) {
          const delta = (inner?.data && typeof inner.data === 'object' && typeof (inner.data as any).text === 'string')
            ? (inner.data as any).text : '';
          if (delta) { acc += delta; push(textQ, delta); }
        } else if (bare === 'error') {
          // Record; do NOT terminate (see note above). The event was already
          // pushed to eventsQ so consumers still see the notice.
          lastError = inner?.data ?? { message: 'agent stream error' };
        } else if (bare === 'agent_done') {
          const named = closedTurn(envelope, inner);
          const data = inner?.data ?? null;
          if (inReplay) {
            // A turn the replay closed: settled at the boundary if it is ours.
            const err = lastError;
            const text = acc;
            const settle = () => (err !== null ? finishErr(errToApiError(err)) : finishOk(type, data, text));
            if (named !== null && !closedInReplay.has(named)) closedInReplay.set(named, settle);
            if (firstDoneInReplay === null) firstDoneInReplay = settle;
            lastError = null;
            continue;
          }
          if (turnId !== null && named !== turnId) {
            // Another turn on the same session ended: not ours. Any error notice
            // seen since is that turn's, whatever turn_id the gateway stamped on
            // it (a queued dispatch's id goes on the running turn's errors), as
            // the gateway clears its own error slate at a foreign terminator.
            lastError = null;
            continue;
          }
          // agent_done preceded by an error = a failed turn (daemon status:error).
          if (lastError !== null) {
            finishErr(errToApiError(lastError));
            return;
          }
          finishOk(type, data);
          return;
        } else if (bare === 'turn_discarded') {
          // The dispatch was dropped unrun (queued behind a turn waiting on a
          // gate): it gets no agent_done. Ours ends the turn, cancelled.
          const named = closedTurn(envelope, inner);
          const data = inner?.data ?? null;
          if (inReplay) {
            const text = acc;
            if (named !== null && !closedInReplay.has(named)) closedInReplay.set(named, () => finishOk(type, data, text));
            continue;
          }
          if (turnId !== null && named === turnId) {
            finishOk(type, data);
            return;
          }
        } else if (SESSION_END_EVENTS.has(type)) {
          // quit and session_closed end the session: clean terminals, never an error.
          finishOk(type, inner?.data ?? null);
          return;
        }
      }
      if (inReplay && firstDoneInReplay !== null) { firstDoneInReplay(); return; }
      // Stream closed without an explicit terminal event (agent_done/quit/end) =
      // a dropped/truncated turn — surface it rather than resolving as success
      // with a partial `text`. Prefer a recorded error notice if present.
      const truncated = () => {
        if (lastError !== null) { finishErr(errToApiError(lastError)); return; }
        finishErr(new ApiError({
          message: 'agent stream closed before the turn completed (no agent_done/quit) — the reply may be truncated',
          status: 0,
          request: { method: 'POST', url, headers: {} },
          response: null,
        }));
      };
      // A stop is under way: the stream closing after its cancel is no truncation,
      // unless the agent answers that the cancel stopped nothing (stopTurn runs it then).
      if (stopping) { unstoppedEnd = truncated; return; }
      truncated();
    } catch (err) {
      // stopTurn aborted the stream: it settles `done` from the cancel's answer.
      if (stopping) { unstoppedEnd = () => finishErr(err); return; }
      // Every stop of ours sets `stopping` first: any other abort of the stream is a
      // dropped stream, not a cancelled turn.
      finishErr(err);
    } finally {
      if (!stopping) releaseSignal();
      // Tear down the underlying HTTP body once the turn is over. parseSseStream
      // only releaseLock()s on exit — it does NOT cancel the body — and the
      // daemon keeps the SSE response open past agent_done (until the session/
      // request context closes). Without this, every completed turn would leak
      // an open connection until GC. Aborting after resolve/reject is harmless
      // (the read has already finished); a no-op if cancel() already aborted.
      try { ac.abort(); } catch { /* ignore */ }
    }
  })();

  // One stop at a time: cancel() and the signal share it, so the turn gets one cancel.
  // It takes the turn's id: a cancel without one would stop whatever turn runs on the session.
  let stopRun: Promise<void> | null = null;
  function stopTurn(named: string): Promise<void> {
    if (stopRun) return stopRun;
    stopping = true;
    stopRun = (async () => {
      // POST the cancel on the same kit URL, through the same transport and
      // with the same credential selection the prompt used.
      let failure: unknown = null;
      let stopped = true;
      try {
        const cancelUrl = `${base}/api/v1/agent/sessions/${encodeSegment(sessionId, 'sessionId')}/cancel`;
        // The turn-scoped cancel: it stops this turn if it is running and nothing
        // else, so a cancel that arrives after the turn ended cannot stop a newer one.
        const answer = await scoped.http.request<{ data?: { matched?: unknown } }>('POST', cancelUrl, {
          middlewareContext,
          retries: 0,
          cache: false,
          body: { turn_id: named },
          headers: { 'Content-Type': 'application/json' },
        });
        // `matched: false`: the agent ran no such turn (it had ended), so nothing was
        // stopped. An answer without the field counts as stopped.
        stopped = answer?.data?.matched !== false;
      } catch (err) {
        failure = err;
      }
      releaseSignal();
      if (failure === null && !stopped) {
        // The turn's own end settles `done`: the stream goes on, or, when it ended
        // during the cancel, `done` settles as it would have without a stop.
        stopping = false;
        const end = unstoppedEnd;
        unstoppedEnd = null;
        end?.();
        stopOver();
        return;
      }
      ac.abort();
      // A turn that ended meanwhile has settled `done` already; these do nothing then.
      if (failure === null) finishOk('cancelled', null);
      else {
        finishErr(new Error(
          `agent turn cancel failed (${(failure as Error)?.message ?? String(failure)}): the turn may still be running`,
          { cause: failure },
        ));
      }
      stopOver();
    })();
    return stopRun;
  }

  // cancel() is the signal's stop, called by hand: it never goes out without the turn id.
  const cancel = async (): Promise<void> => {
    // The stream is over and named no turn: nothing can name it any more, so nothing is sent.
    if (settledDone && turnId === null) return;
    onAbort();
    // Sent now or earlier: wait for its answer; else wait for the id (or its wait to give up).
    await (stopRun ?? stopSettled);
  };

  // The caller's signal: stop the turn once its id is known, never a cancel without one.
  onAbortRequested = () => { if (turnId !== null) void stopTurn(turnId); };
  onTurnIdTimeout = () => {
    if (turnId !== null || stopping) return;
    stopping = true;
    releaseSignal();
    ac.abort();
    finishErr(new Error(
      `streamAgentPrompt: aborted, and the stream named no turn within ${AGENT_ABORT_TURN_ID_WAIT_MS / 1000} s, ` +
        'so no cancel was sent: the turn may still be running (list the session\'s turns to check)',
    ));
    stopOver();
  };
  if (abortRequested) onAbortRequested();

  return { events: iter(eventsQ), text: iter(textQ), done, cancel };
}
