/**
 * lib/agent-client.ts — streaming prompt helper for the `agent` kit.
 *
 * The generated `box.agent.sessions.promptStream()` returns a WebSocket client
 * (`AgentPromptStreamWebSocket`) that does NOT match the daemon's SSE wire
 * format (the daemon serves `POST .../prompt:stream` as `text/event-stream`,
 * framing each event as a `gatedEvent` `{ seq, event: { type, data } }`). This
 * hand-written helper is the supported SDK path for streamed prompting: it
 * POSTs the turn, reads the SSE body, unwraps the gatedEvent envelope, and
 * exposes the assistant text deltas + every turn event + a `done` promise.
 *
 * Auth: the platform Bearer is stripped on cross-origin kit URLs, so this mints
 * a container claim via the public `client.api.containers.authorize()` and
 * sends `X-Hoody-Container-Claim` + `X-Hoody-Token` (mirroring the kit handshake
 * in lib/proxy-auth-middleware.ts / lib/terminal-client.ts). Pass an explicit
 * `auth` to override (e.g. when a deployment proxy-injects).
 *
 * Runtime-agnostic: uses global `fetch` + `ReadableStream` + the SSE parser in
 * lib/pipe-stream.ts (Node 18+/Bun/browser), same as the tunnel/pipe helpers.
 */
import type { HoodyClient, ContainerLike } from '../generated/client.js';
export interface AgentPromptEvent {
    /** Event type, e.g. `event.stream_chunk` (the daemon's prefixed form). */
    type: string;
    /** Unwrapped event payload (the `data` of the gatedEvent's inner event). */
    data: unknown;
    /** Gateway sequence number, if present. */
    seq: number | null;
}
export interface AgentPromptResult {
    /** Terminal event type that ended the turn (`event.agent_done` / `event.quit`). */
    terminal: string;
    /** Accumulated assistant text across all `stream_chunk` deltas. */
    text: string;
    /** The terminal event's payload (turn count, usage, etc. for `agent_done`). */
    data: unknown;
}
export interface AgentPromptKitAuth {
    /** Stringified container claim for `X-Hoody-Container-Claim`. */
    claim: string;
    /** Token for `X-Hoody-Token`. */
    token: string;
}
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
    /** Explicit kit auth; if omitted, a container claim is minted via authorize(). */
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
 * `client.api`-scoped `box.agent.sessions.createSession(...)`.
 */
export declare function streamAgentPrompt(client: HoodyClient, args: StreamAgentPromptArgs): Promise<AgentPromptHandle>;
