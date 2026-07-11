/**
 * OpenAI-compatible Chat Completions client — shared between `hoody chat`
 * and `ai-fix.ts`.
 *
 * Two entry points:
 *   - completeOnce(opts):  Promise<{text}>           (blocking, used by ai-fix)
 *   - streamCompletion(opts): async yields deltas     (streaming, used by chat)
 *
 * Uses native fetch (works on Node >=18 and Bun compiled binaries). Never
 * sends `tools`, `functions`, or `tool_choice` keys unless the caller
 * explicitly passes a `tools` array in opts — callers that disable the docs
 * tool must omit this field entirely (empty array is NOT equivalent — some
 * providers 400 on `tools: []`).
 *
 * Inbound `tool_calls` delta frames are surfaced back to the caller on the
 * stream path only when the caller opted in; otherwise they are silently
 * dropped before any text is emitted. This keeps `hoody chat` with the docs
 * tool disabled from ever processing a tool-call even if the model emits one.
 */
import type { Msg, ToolSpec } from './types.js';
export interface CommonOptions {
    url: string;
    key: string | undefined;
    model: string;
    messages: Msg[];
    maxTokens?: number | undefined;
    temperature?: number | undefined;
    tools?: ToolSpec[] | undefined;
    signal?: AbortSignal | undefined;
    debug?: boolean | undefined;
    /** Test hook: override the global `fetch`. Used by unit tests to stub
     *  network traffic. Defaults to `globalThis.fetch`. */
    fetchImpl?: typeof fetch | undefined;
}
export interface CompleteOnceOptions extends CommonOptions {
    timeoutMs?: number | undefined;
}
export interface StreamOptions extends CommonOptions {
    timeoutMs?: number | undefined;
    firstByteTimeoutMs?: number | undefined;
    onDelta: (delta: StreamDelta) => void;
    onDone?: ((info: StreamDoneInfo) => void) | undefined;
}
export interface StreamDelta {
    content?: string;
    tool_calls?: InboundToolCall[];
}
export interface StreamDoneInfo {
    finishReason?: string | undefined;
    usage?: Record<string, unknown> | undefined;
    aggregatedText: string;
    aggregatedToolCalls: InboundToolCall[];
}
export interface InboundToolCall {
    index: number;
    id?: string;
    type?: string;
    function?: {
        name?: string;
        arguments?: string;
    };
}
/**
 * Ensure the URL ends with `/chat/completions`. Accepts either the bare base
 * URL (`https://api.example.com/v1`) or the full endpoint. Auto-appends the
 * path if missing so users can set either convention in HOODY_CHAT_URL /
 * OPENAI_BASE_URL and the client hits the right place.
 */
export declare function resolveChatUrl(raw: string): string;
/**
 * Build the request payload. Extracted so unit tests can snapshot it.
 *
 * IMPORTANT: when opts.tools is undefined or an empty array, the `tools`
 * key is NOT included in the payload. This enforces the contract
 * that tool-disabled requests send NO tools field at all.
 */
export declare function buildRequestBody(opts: CommonOptions & {
    stream: boolean;
}): Record<string, unknown>;
/**
 * Build the fetch Headers. Extracted for unit testing.
 */
export declare function buildHeaders(opts: CommonOptions, stream: boolean): Headers;
/**
 * One-shot (non-streaming) completion. Returns the aggregated assistant text.
 */
export declare function completeOnce(opts: CompleteOnceOptions): Promise<{
    text: string;
}>;
/**
 * Stateful `<think>…</think>` stripper for streaming content deltas.
 *
 * Some providers (MiniMax M2.x) leak reasoning tokens into the content field
 * wrapped in `<think>…</think>` instead of routing them to the canonical
 * `reasoning_content` channel. This tracks open-tag state across delta
 * boundaries and emits only the non-think portion.
 *
 * Behavior:
 *   - Outside a think block: passes content through verbatim.
 *   - Inside a think block: suppresses content until `</think>` arrives.
 *   - Partial tag spanning delta boundary (`<thi` in one delta, `nk>` next):
 *     held in `held` until we can decide whether it's a tag or literal text.
 *
 * NOT a general HTML parser — assumes `<think>…</think>` is the only tag
 * our content stream meaningfully opens. Any other `<foo>` tag is passed
 * through unchanged.
 */
export interface ThinkStripper {
    push(chunk: string): string;
    /**
     * End of stream. If we were outside a think block with a held partial-tag,
     * it turned out not to be a tag — emit it verbatim. If we were inside a
     * think block, drop everything (still reasoning).
     */
    flush(): string;
}
export declare function createThinkStripper(): ThinkStripper;
/**
 * Streaming completion. Calls opts.onDelta for each content chunk as it
 * arrives; calls opts.onDone once at end-of-stream. Resolves after the stream
 * closes (done or aborted).
 *
 * Inbound tool_calls deltas are collected in aggregatedToolCalls and surfaced
 * ONLY via opts.onDelta (if the caller passed a tools array) and in the
 * StreamDoneInfo. Content deltas are always surfaced.
 */
export declare function streamCompletion(opts: StreamOptions): Promise<void>;
/**
 * Async generator: consume a ReadableStream of SSE events and yield the
 * data payload of each event as a string (after stripping the `data: ` prefix
 * and any trailing whitespace). The sentinel `[DONE]` is yielded as the
 * string `'[DONE]'` unchanged — callers should check for it before JSON.parse.
 *
 * Handles:
 *   - Split chunks across reader.read() boundaries.
 *   - Keepalive comments (lines starting with ':').
 *   - Multi-line data (concatenates `data:` continuations within one event).
 *   - CRLF and LF line endings.
 */
export declare function readSseFrames(body: ReadableStream<Uint8Array>, debug?: boolean): AsyncGenerator<string, void, void>;
