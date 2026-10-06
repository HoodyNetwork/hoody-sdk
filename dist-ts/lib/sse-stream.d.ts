/**
 * SSE block parser — web-API only (fetch body `ReadableStream` + `TextDecoder`).
 *
 * Lives apart from lib/pipe-stream.ts, which imports `node:net` / `node:fs` /
 * `node:stream`: anything that imported the parser from there could not ship in
 * the browser bundle, and `streamAgentPrompt` was left out of it for exactly that
 * reason. pipe-stream.ts re-exports everything here, so its public surface is
 * unchanged.
 */
export type SseEvent = {
    /** Event name from the `event:` field, or 'message' by default. */
    event: string;
    /** Concatenated `data:` field values (joined by `\n`). */
    data: string;
    /** Optional event id from `id:`. */
    id?: string;
    /** Optional reconnection time from `retry:`. */
    retry?: number;
};
/** Parse a single SSE event block (without trailing blank-line separator). */
export declare function parseSseEvent(block: string): SseEvent | null;
/**
 * Parse an SSE stream into discrete events. Handles partial chunks across
 * read boundaries; skips `:keepalive` comment blocks; tolerates CRLF/LF/CR.
 */
export declare function parseSseStream(stream: ReadableStream<Uint8Array>): AsyncIterable<SseEvent>;
