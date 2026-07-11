/**
 * tool-dispatch — the model-initiated tool-call round-trip.
 *
 * Invariant: MAX_TOOL_CALLS_PER_TURN = 1.
 *
 * A "turn" = one user message → zero-or-more assistant messages with
 * tool_calls → one terminal assistant message without tool_calls. The
 * counter lives here, in the dispatcher, as `let toolCallsThisTurn = 0`
 * reset at turn start. openai-client.ts is pure transport and does not
 * count iterations.
 *
 * When the model emits a second `tool_calls` on the same turn, we refuse
 * with a synthetic tool message that tells it to answer from context.
 *
 * When the model emits `tool_calls` for a name OTHER than `hoody_docs_search`,
 * we drop it silently (the openai-client already filters delta-level noise;
 * this is the belt-and-suspenders check at orchestration time).
 */
import type { Msg } from '../ai/types.js';
import { RollingRateLimiter } from './docs-search-tool.js';
export declare const MAX_TOOL_CALLS_PER_TURN = 1;
export interface DispatchOptions {
    url: string;
    key: string | undefined;
    model: string;
    /** Initial messages (system + user). The dispatcher appends tool-call
     *  assistant messages + tool-result messages if the model emits a tool. */
    messages: Msg[];
    maxTokens: number;
    temperature: number;
    /** onDelta for CONTENT only (not tool-call deltas — those are consumed
     *  internally by the dispatcher). Called for each streamed text chunk. */
    onDelta: (delta: string) => void;
    /** If true, `hoody_docs_search` tool is offered to the model. */
    toolsEnabled: boolean;
    /** Shared limiter (one per process). */
    limiter?: RollingRateLimiter | undefined;
    /** For tests. */
    fetchImpl?: typeof fetch | undefined;
    sleepImpl?: ((ms: number) => Promise<void>) | undefined;
    /** Accept-endpoint flag/env passed through to the docs-tool executor. */
    acceptEndpointFlag?: string | undefined;
    acceptEndpointEnv?: string | undefined;
    isTty?: boolean | undefined;
    onTtyPrompt?: ((origin: string) => Promise<boolean>) | undefined;
    /** Private-mode contract: skip accept-file read/writes for docs-tool too. */
    sessionOnly?: boolean | undefined;
    /** External abort (e.g., REPL SIGINT). Cancels both the streaming LLM
     *  fetch AND any in-flight docs-tool fetch in this turn. */
    signal?: AbortSignal | undefined;
}
/**
 * Run one user turn. Returns when the model emits a terminal message
 * (no tool_calls) or when we've refused a second tool call on the same turn.
 */
export declare function dispatchTurn(opts: DispatchOptions): Promise<void>;
