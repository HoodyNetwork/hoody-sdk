/**
 * Pipe sender status — the `[INFO]`/`[ERROR]` lines the kit streams in a
 * sender's response, for the browser helpers (PipeBrowser.sendFile and the
 * PipeMedia share sessions).
 *
 * The kit answers a sender with HTTP 200 as soon as it accepts the upload, so
 * a later failure (no receivers in time, an idle timeout, every receiver gone)
 * arrives only as a status line. Browser-safe: no Node imports.
 */
/** A refused or failed transfer: the server's `[ERROR]` text, or what went wrong. */
export class PipeTransferError extends Error {
    /** HTTP status, 0 when no response arrived. */
    status;
    /** The status lines received before the failure. */
    messages;
    constructor(message, status, messages = []) {
        super(message);
        this.name = 'PipeTransferError';
        this.status = status;
        this.messages = messages;
    }
}
/** Parse one status line; null for an empty line. */
function parseStatusLine(line) {
    const raw = line.replace(/\r$/, '');
    if (raw.length === 0)
        return null;
    const m = /^\[(INFO|ERROR)\]\s?(.*)$/.exec(raw);
    if (!m)
        return { level: 'info', message: raw, raw };
    return { level: m[1] === 'ERROR' ? 'error' : 'info', message: m[2] ?? '', raw };
}
/** Collects the sender's status lines from its growing response text. */
export class StatusLines {
    onStatus;
    messages = [];
    consumed = 0;
    constructor(onStatus) {
        this.onStatus = onStatus;
    }
    /** Feed the whole response text so far; `final` also takes an unterminated last line. */
    feed(text, final) {
        let idx;
        while ((idx = text.indexOf('\n', this.consumed)) !== -1) {
            this.add(text.slice(this.consumed, idx));
            this.consumed = idx + 1;
        }
        if (final && this.consumed < text.length) {
            this.add(text.slice(this.consumed));
            this.consumed = text.length;
        }
    }
    add(line) {
        const message = parseStatusLine(line);
        if (!message)
            return;
        this.messages.push(message);
        if (this.onStatus)
            safeCall(this.onStatus, message);
    }
    /** A line that already ends the transfer as failed: an `[ERROR]`, or every receiver gone. */
    failed(httpStatus) {
        return failedLine(this.messages, httpStatus);
    }
    /** The error the finished response stands for, or undefined when the transfer completed. */
    failure(httpStatus, what) {
        return transferFailure(this.messages, httpStatus, what);
    }
}
function failedLine(messages, httpStatus) {
    const error = messages.find((m) => m.level === 'error');
    if (error)
        return new PipeTransferError(error.message, httpStatus, messages);
    const left = messages.find((m) => m.message.startsWith('All receivers disconnected'));
    if (left)
        return new PipeTransferError(left.message, httpStatus, messages);
    return undefined;
}
/**
 * The error a sender's finished response stands for, or undefined when the
 * transfer completed: the kit's `[INFO] Transfer complete.`, or a live
 * stream's `[INFO] Live stream ended (peak N viewers).`. An `[ERROR]` line,
 * every receiver gone, a non-2xx status, or a response that ends without
 * either line is a failure.
 */
export function transferFailure(messages, httpStatus, what) {
    const error = messages.find((m) => m.level === 'error');
    if (error)
        return new PipeTransferError(error.message, httpStatus, messages);
    if (httpStatus < 200 || httpStatus >= 300) {
        return new PipeTransferError(`${what} failed: HTTP ${httpStatus}`, httpStatus, messages);
    }
    const left = failedLine(messages, httpStatus);
    if (left)
        return left;
    if (!messages.some((m) => m.message.startsWith('Transfer complete') || m.message.startsWith('Live stream ended'))) {
        return new PipeTransferError(`${what} failed: the response ended before the transfer completed`, httpStatus, messages);
    }
    return undefined;
}
/**
 * A sender's own transfer id (`?transfer=`): 16-64 characters of A-Z a-z 0-9
 * `_` `-`. The kit makes it the transfer's id, so `?status&transfer=<id>` and
 * the `done` event name this transfer; it refuses an id in use with 409.
 */
export function checkTransferId(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
        throw new RangeError(`transfer must be 16-64 characters of A-Z a-z 0-9 _ - (got ${JSON.stringify(id)})`);
    }
    return id;
}
/** What the kit serves itself under its prefix instead of a pipe: the pages of its reserved-paths.ts, and its health and metrics endpoints. */
const RESERVED_PIPE_PATHS = new Set([
    '/', '/noscript', '/help', '/favicon.ico', '/robots.txt', '/health', '/metrics',
]);
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
export function reservedPipePath(name) {
    // eslint-disable-next-line no-control-regex
    if (/[\\\x00-\x1f\x7f]/.test(name))
        return null;
    let p = `/${name}`.replace(/\/{2,}/g, '/').toLowerCase();
    if (p.length > 1 && p.endsWith('/'))
        p = p.slice(0, -1);
    if (p.length > 1 && p.endsWith('.'))
        p = p.slice(0, -1);
    return RESERVED_PIPE_PATHS.has(p) ? p : null;
}
/**
 * The sender's `Content-Disposition` for a download name: `attachment;
 * filename="…"`, plus RFC 5987 `filename*` when the name is not plain ASCII
 * (a header value must be a byte string, so the raw name cannot go in it).
 * Control characters are dropped, `/` and `\` become `_`, and the ASCII
 * fallback shows `_` in place of `"` and non-ASCII characters. At most 255
 * characters are sent; the kit sanitises the name further.
 */
export function pipeContentDisposition(filename) {
    // eslint-disable-next-line no-control-regex
    const name = Array.from(filename.replace(/[\x00-\x1f\x7f]/g, '').replace(/[/\\]/g, '_')).slice(0, 255).join('');
    const ascii = name.replace(/[^\x20-\x7e]|["]/g, '_');
    if (ascii === name)
        return `attachment; filename="${name}"`;
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
export function errorText(err) {
    return err instanceof Error ? err.message : String(err);
}
/** Run a caller's callback; a throw is reported, never allowed to break the transfer. */
export function safeCall(fn, value) {
    try {
        fn(value);
    }
    catch (err) {
        const report = globalThis.reportError;
        if (typeof report === 'function')
            report(err);
        else
            setTimeout(() => { throw err; }, 0);
    }
}
