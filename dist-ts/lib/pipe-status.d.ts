/**
 * Pipe sender status — the `[INFO]`/`[ERROR]` lines the kit streams in a
 * sender's response, for the browser helpers (PipeBrowser.sendFile and the
 * PipeMedia share sessions).
 *
 * The kit answers a sender with HTTP 200 as soon as it accepts the upload, so
 * a later failure (no receivers in time, an idle timeout, every receiver gone)
 * arrives only as a status line. Browser-safe: no Node imports.
 */
/** One `[INFO]`/`[ERROR]` line of the sender's response. Same shape as PipeStream's. */
export interface PipeStatusMessage {
    level: 'info' | 'error';
    /** Message text minus the `[INFO] ` / `[ERROR] ` prefix. */
    message: string;
    /** The full line, trailing newline stripped. */
    raw: string;
}
/** A refused or failed transfer: the server's `[ERROR]` text, or what went wrong. */
export declare class PipeTransferError extends Error {
    /** HTTP status, 0 when no response arrived. */
    readonly status: number;
    /** The status lines received before the failure. */
    readonly messages: PipeStatusMessage[];
    constructor(message: string, status: number, messages?: PipeStatusMessage[]);
}
/** Collects the sender's status lines from its growing response text. */
export declare class StatusLines {
    private readonly onStatus?;
    readonly messages: PipeStatusMessage[];
    private consumed;
    constructor(onStatus?: ((message: PipeStatusMessage) => void) | undefined);
    /** Feed the whole response text so far; `final` also takes an unterminated last line. */
    feed(text: string, final: boolean): void;
    private add;
    /** A line that already ends the transfer as failed: an `[ERROR]`, or every receiver gone. */
    failed(httpStatus: number): PipeTransferError | undefined;
    /** The error the finished response stands for, or undefined when the transfer completed. */
    failure(httpStatus: number, what: string): PipeTransferError | undefined;
}
/**
 * The error a sender's finished response stands for, or undefined when the
 * transfer completed: the kit's `[INFO] Transfer complete.`, or a live
 * stream's `[INFO] Live stream ended (peak N viewers).`. An `[ERROR]` line,
 * every receiver gone, a non-2xx status, or a response that ends without
 * either line is a failure.
 */
export declare function transferFailure(messages: PipeStatusMessage[], httpStatus: number, what: string): PipeTransferError | undefined;
/**
 * A sender's own transfer id (`?transfer=`): 16-64 characters of A-Z a-z 0-9
 * `_` `-`. The kit makes it the transfer's id, so `?status&transfer=<id>` and
 * the `done` event name this transfer; it refuses an id in use with 409.
 */
export declare function checkTransferId(id: unknown): string;
/**
 * The kit path a pipe name lands on when the kit answers it itself, or null
 * for an ordinary name. The kit's own rule (normalizeReservedPath): compared
 * case-insensitively after one trailing `/`, then one trailing `.`, is
 * dropped. So `Metrics`, `help/`, `noscript.` and `/` are reserved, while
 * `metrics..` is a pipe. Runs of `/` count as one first: the kit itself
 * treats `/help` as the pipe `//help`, but an edge that merges slashes would
 * send it to the help page. The SDK percent-encodes each name, so the kit
 * decodes it back to the name itself; a name with a backslash or a control
 * character is never reserved (the kit refuses it as forbidden characters).
 */
export declare function reservedPipePath(name: string): string | null;
/**
 * The sender's `Content-Disposition` for a download name: `attachment;
 * filename="…"`, plus RFC 5987 `filename*` when the name is not plain ASCII
 * (a header value must be a byte string, so the raw name cannot go in it).
 * Control characters are dropped, `/` and `\` become `_`, and the ASCII
 * fallback shows `_` in place of `"` and non-ASCII characters. At most 255
 * characters are sent; the kit sanitises the name further.
 */
export declare function pipeContentDisposition(filename: string): string;
export declare function errorText(err: unknown): string;
/** Run a caller's callback; a throw is reported, never allowed to break the transfer. */
export declare function safeCall<T>(fn: (value: T) => void, value: T): void;
