/**
 * lib/agent-client.ts — streaming prompt helper for the `agent` kit.
 *
 * The generated `box.agent.sessions.startTurnAndStream()` yields the raw SSE frames
 * (`IStreamEvent`, through the client's `streamEvents()`): each frame's `raw`
 * is a JSON `gatedEvent` `{ seq, event: { type, data } }` the caller must
 * parse and unwrap. This hand-written helper does that work: it POSTs the
 * turn, reads the SSE body, unwraps the gatedEvent envelope, and exposes the
 * assistant text deltas + every turn event + a `done` promise.
 *
 * Transport + auth: the turn goes through the CLIENT's own streaming seam
 * (`http.stream`), so the injected `fetch`, request middleware and
 * ApiError handling apply exactly as for a generated call. Kit credentials are
 * the client's `kitAuth` (from `withContainer(c, { kitAuth })` or the client
 * config), selected for the `agent` namespace, or an explicit per-call `auth`
 * of the same shape. The agent kit itself verifies nothing; a credential is
 * only needed where a proxy permission rule guards the service.
 *
 * The account token is NEVER sent: the transport strips `Authorization` on
 * kit URLs, and this helper no longer mints a container claim or falls back to
 * `getAuthToken()` (the old fallback shipped the account JWT to the container
 * as `X-Hoody-Token` through the global fetch; nothing verified it).
 *
 * Runtime-agnostic: the client's HttpClient + the SSE parser in
 * lib/sse-stream.ts (Node 18+/Bun/browser). It imports that module, not
 * lib/pipe-stream.ts, because pipe-stream pulls in `node:net` / `node:fs` and
 * would keep this helper out of the browser bundle.
 */
import type { HoodyClient, ContainerLike } from '../generated/client.js';
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
    /** Terminal event type that ended the turn (`event.agent_done` / `event.quit`). */
    terminal: string;
    /** Accumulated assistant text across all `stream_chunk` deltas. */
    text: string;
    /** The terminal event's payload (turn count, usage, etc. for `agent_done`). */
    data: unknown;
}
/**
 * Kit credential for the prompt — the same shape as `kitAuth` on
 * `withContainer()` / the client config (password, jwt, token, containerClaim,
 * ip, or a per-service policy; a policy's `services.agent` wins over its
 * `default`).
 */
export type AgentPromptKitAuth = ProxyAuth | ProxyAuthPolicy;
export interface StreamAgentPromptArgs {
    /** Target container (project_id + id + server). */
    container: ContainerLike;
    /** Existing session id (from `createSession`). */
    sessionId: string;
    /** The prompt text for this turn. */
    text: string;
    toolMode?: string;
    dirScope?: string;
    /** `'auto_approve'` auto-approves confirm gates instead of pausing the turn. */
    policy?: 'auto_approve';
    /** Kit service index (the agent daemon is a singleton at 1). */
    serviceIndex?: number;
    /** Explicit kit credential for this turn (kitAuth shape). If omitted, the
     *  client's own `kitAuth` applies; with neither, the request carries no
     *  credential. The account token is never used. */
    auth?: AgentPromptKitAuth;
    /** Abort the in-flight turn. */
    signal?: AbortSignal;
}
export interface AgentPromptHandle {
    /** Every turn event, in order. */
    events: AsyncIterable<AgentPromptEvent>;
    /** Assistant text deltas only (`stream_chunk`). */
    text: AsyncIterable<string>;
    /** Resolves when the turn ends (`agent_done`/`quit`); rejects on `error`/HTTP failure. */
    done: Promise<AgentPromptResult>;
    /** Stop the active turn (`POST .../cancel`) and abort the stream. */
    cancel(): Promise<void>;
}
/**
 * Dispatch a streaming prompt turn against an existing agent session and return
 * a handle over the SSE event stream. Create the session first via
 * `client.api`-scoped `box.agent.sessions.create(...)`.
 */
export declare function streamAgentPrompt(client: HoodyClient, args: StreamAgentPromptArgs): Promise<AgentPromptHandle>;
