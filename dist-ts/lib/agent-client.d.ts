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
import { type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';
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
    gate?: {
        id: string;
        generation: number;
        type: string;
    };
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
/**
 * How long an abort of `streamAgentPrompt`'s `signal`, or a `cancel()`, that comes
 * before the agent named the turn waits for its id before it gives up without a cancel.
 */
export declare const AGENT_ABORT_TURN_ID_WAIT_MS = 10000;
/**
 * Dispatch a streaming prompt turn against an existing agent session and return
 * a handle over the SSE event stream. Create the session first via
 * `client.api`-scoped `box.agent.sessions.create(...)`.
 */
export declare function streamAgentPrompt(client: HoodyClient, args: StreamAgentPromptArgs): Promise<AgentPromptHandle>;
