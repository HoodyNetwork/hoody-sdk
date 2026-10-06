/**
 * Remote control of a live hoody-exec script (MonoRepoStorage #674, cut V9):
 * `exec.connect(url, { token })`.
 *
 * The remote channel lives on the script's OWN URL. A marker picks the op:
 *  - one-shot ops: `X-Hoody-Remote: send|call|eval|capabilities` on a POST/GET;
 *  - events: `X-Hoody-Remote: events` on a GET whose body is an SSE stream;
 *  - attach: a WebSocket offering the subprotocol `hoody-remote.v1`.
 *
 * The default transport is SSE events + one-shot requests, the same pattern as
 * hoody-agent's prompt stream. `ws: true` moves send, call and events onto one
 * attach socket. `eval` is ALWAYS a one-shot POST: the server refuses it on
 * attach, so a future proxy rule can single it out by its header.
 *
 * The script token travels only as `X-Token` (recorded as a credential header,
 * so the HTTP client redacts it in ApiError and confines it on redirects) or,
 * on a socket, as the subprotocol entry `hoody-token.<base64url>`, which the
 * server never echoes. It is never put in a URL, an error, or a log line.
 *
 * Every refusal is raised as a typed {@link ExecRemoteError} carrying the
 * server's `details.fix` (the magic comments to add and the exact
 * magic-comments update call); its message already contains the fix lines.
 *
 * This module is web-API only (fetch bodies, TextDecoder, WebSocket) so it
 * ships in the browser bundle; the `ws` package is imported lazily on Node.
 */
import { type ExecExecutionTemplateVars } from './exec-script-execution.js';
/** Request header naming the remote op. */
export declare const EXEC_REMOTE_HEADER = "X-Hoody-Remote";
/** Response header every remote answer carries; its absence means the server does not speak hoody-remote. */
export declare const EXEC_REMOTE_VERSION_HEADER = "X-Hoody-Remote-Version";
/** The attach subprotocol. */
export declare const EXEC_REMOTE_SUBPROTOCOL = "hoody-remote.v1";
/** Prefix of the subprotocol entry that carries the token on a socket (never echoed). */
export declare const EXEC_REMOTE_TOKEN_PROTOCOL_PREFIX = "hoody-token.";
/** Largest one-shot answer body or single event frame read (the server caps results at 8 MiB). */
export declare const EXEC_REMOTE_MAX_BODY_BYTES: number;
/** Frames queued for an events consumer that is not reading; one more closes the stream (the server's own session cap). */
export declare const EXEC_REMOTE_FRAME_QUEUE_CAP = 1000;
/** Largest frame the SDK sends on the attach socket; the server closes a socket (1009) that sends more. */
export declare const EXEC_REMOTE_MAX_FRAME_BYTES: number;
/** Socket requests awaiting a reply at once. */
export declare const EXEC_REMOTE_MAX_PENDING = 1024;
/** Client wait for a one-shot answer when the call names no timeoutMs. */
export declare const EXEC_REMOTE_DEFAULT_TIMEOUT_MS = 60000;
/** Options of `exec.connect`. */
export interface ExecRemoteConnectOptions {
    /** The script token: a `@remote-token` secret, or the script's `@token` when it declares no remote token. */
    token?: string | undefined;
    /** Carry send, call and events over one attach socket. `eval` stays a one-shot POST. Default false. */
    ws?: boolean | undefined;
    /** Default client wait for one-shot answers, and the most an attach socket or an events stream takes to open, in ms (default 60 000). */
    timeoutMs?: number | undefined;
    /** URL template variables for a path (projectId/containerId/serviceIndex/server), as for `exec.run`. */
    templateVars?: ExecExecutionTemplateVars;
}
/** Per-op options. */
export interface ExecRemoteOpOptions {
    /** Sent to the server as the op's budget; the client waits this long plus a short grace. */
    timeoutMs?: number | undefined;
    /** Cancels the op. */
    signal?: AbortSignal | undefined;
}
/** Options of `eval` / `evaluate`. */
export interface ExecRemoteEvalOptions extends ExecRemoteOpOptions {
    /** `latest` (default): the in-flight or last run's scope. `globals`: the worker context (worker mode only). */
    target?: 'latest' | 'globals' | undefined;
    /** Run the script once first when it has no run yet (otherwise 409 REMOTE_NO_RUN). */
    start?: boolean | undefined;
}
/** What started the run an eval executes in. The list may grow, so other strings are accepted. */
export type ExecRemoteRunKind = 'http' | 'remote' | 'cron' | 'remote_init' | 'websocket_init' | (string & {});
/**
 * The first argument the script passes to an `evaluate()` function (a frozen object): the op, a
 * signal that aborts on the op's deadline or when the caller disconnects, and the run it evaluates in.
 */
export interface ExecRemoteEvalContext {
    readonly op: 'eval';
    readonly signal: AbortSignal;
    readonly run: {
        readonly kind: ExecRemoteRunKind;
        readonly state?: unknown;
        readonly startedAt: string;
        readonly [key: string]: unknown;
    };
    /** The accepted token's name, or null. */
    readonly token: string | null;
    readonly generation: string;
    readonly from?: unknown;
    readonly identity?: unknown;
    readonly params?: unknown;
    readonly [key: string]: unknown;
}
/** A console level for `events({ tail })`. */
export type ExecRemoteTailLevel = 'error' | 'warn' | 'info' | 'debug';
/** Options of `events()`. */
export interface ExecRemoteEventsOptions {
    /** Also stream the script's console lines at this level as `{event:'console'}` frames. Absent: none. */
    tail?: ExecRemoteTailLevel | undefined;
    /** Ends the iteration. */
    signal?: AbortSignal | undefined;
}
/** Answer of `send`. */
export interface ExecRemoteSendResult {
    ok: true;
    /** What the script's `remote.on('message')` handler returned. */
    reply: unknown;
    durationMs: number;
    generation: unknown;
    [key: string]: unknown;
}
/** Answer of `call`. */
export interface ExecRemoteCallResult {
    ok: true;
    /** What the exposed function returned. */
    result: unknown;
    durationMs: number;
    generation: unknown;
    [key: string]: unknown;
}
/** One console line captured during an eval. */
export interface ExecRemoteLogLine {
    level: string;
    args: unknown[];
    [key: string]: unknown;
}
/** Answer of `eval` / `evaluate`. Read the value as `(await conn.eval('x')).result`. */
export interface ExecRemoteEvalResult {
    ok: true;
    result: unknown;
    logs: ExecRemoteLogLine[];
    run: {
        kind: string;
        state: string;
        startedAt: string;
        [key: string]: unknown;
    } | null;
    durationMs: number;
    [key: string]: unknown;
}
/** Answer of `capabilities`. Without a valid token only `token_required` and `token_names` are set. */
export interface ExecRemoteCapabilities {
    token_required?: boolean;
    token_names?: string[];
    path?: string;
    deployment?: string;
    mode?: string;
    enabled?: boolean;
    tokens?: Array<{
        name: string;
        scope: string[] | null;
        unresolved?: boolean;
    }>;
    capabilities?: {
        messages?: {
            allowed: boolean;
            handler?: boolean;
            fix?: ExecRemoteFix;
        };
        call?: {
            allowed: boolean;
            exposed?: string[];
            fix?: ExecRemoteFix;
        };
        eval?: {
            allowed: boolean;
            token_ready?: boolean;
            fix?: ExecRemoteFix;
        };
    };
    latest_run?: {
        kind: string;
        state: string;
        startedAt: string;
    } | null;
    live?: {
        worker: boolean;
        generation: unknown;
        sessions: number;
    };
    [key: string]: unknown;
}
/**
 * One event frame, the same on SSE and on the attach socket. When the server
 * ends a stream itself it sends `{ event: 'end', reason }` last (best effort;
 * reason `overflow`, `evicted` or `shutdown`), then closes. A session the
 * script no longer admits (its token removed or narrowed, or the permission
 * switched off) is not a frame: it ends the iteration with the typed refusal,
 * as the open would have been refused.
 */
export interface ExecRemoteFrame {
    /** `remote.emit` name, `console`, `generation`, `end`, … */
    event: string;
    data?: unknown;
    generation?: unknown;
    [key: string]: unknown;
}
/** The fix a refusal carries: magic comments to add, or the exact management call. */
export interface ExecRemoteFix {
    magic_comments?: string[];
    api?: {
        method: string;
        path: string;
        body?: unknown;
    };
    [key: string]: unknown;
}
/** How an attach socket ended. */
export interface ExecRemoteCloseInfo {
    code: number;
    reason: string;
    /** The error that ended it, when it did not end normally. */
    error?: ExecRemoteError;
}
/** An explicit attach socket (`conn.attach()`): send, call and events on one socket, never eval. */
export interface ExecRemoteSession {
    send(message: unknown, options?: ExecRemoteOpOptions): Promise<ExecRemoteSendResult>;
    call(name: string, args?: unknown[], options?: ExecRemoteOpOptions): Promise<ExecRemoteCallResult>;
    /**
     * Frames from now on. A first reader that starts within 1 s of `attached` also gets the frames
     * that arrived since then (the latest, up to 1000 frames and 8 MiB). One reader at a time;
     * otherwise frames that arrive while nobody iterates are dropped.
     */
    frames(options?: {
        signal?: AbortSignal | undefined;
    }): AsyncIterable<ExecRemoteFrame>;
    /** Close the socket. `code` is sent when a client may send it (1000, 3000-4999); any other closes with none. */
    close(code?: number, reason?: string): void;
    /** Settles when the socket has closed. */
    readonly closed: Promise<ExecRemoteCloseInfo>;
    /** The server's first frame, `{ event: 'attached', v: 1, generation, path }`. */
    readonly attached: ExecRemoteFrame;
}
/** A connection to one live script (`exec.connect(url, { token })`). */
export interface ExecRemoteConnection {
    /** The script URL (or path) this connection targets. */
    readonly url: string;
    /** What the script enables, its token names, its latest run; disabled ops carry `fix`. */
    capabilities(options?: ExecRemoteOpOptions): Promise<ExecRemoteCapabilities>;
    /** Deliver a message to the script's `remote.on('message')` handler (`@remote-messages`). */
    send(message: unknown, options?: ExecRemoteOpOptions): Promise<ExecRemoteSendResult>;
    /** Call a function the script exposed with `remote.expose(name, fn)` (`@remote-call`). */
    call(name: string, args?: unknown[], options?: ExecRemoteOpOptions): Promise<ExecRemoteCallResult>;
    /**
     * Evaluate an expression inside the script's live scope (`@remote-eval` + an eval-scoped token).
     * Always a one-shot POST, also with `ws: true`. The value is `(await conn.eval('x')).result`.
     */
    eval(expression: string, options?: ExecRemoteEvalOptions): Promise<ExecRemoteEvalResult>;
    /**
     * Evaluate a function's source in the script's scope: sends `{ function: fn.toString(), args }`,
     * and the script calls it as `fn(ctx, ...args)`. Only the source travels, so `fn` must not close
     * over local variables of the caller; `args` are JSON.
     */
    evaluate(fn: (ctx: ExecRemoteEvalContext, ...args: never[]) => unknown, args?: unknown[], options?: ExecRemoteEvalOptions): Promise<ExecRemoteEvalResult>;
    /**
     * Event frames: SSE by default, the attach socket with `ws: true`. The server's first frame
     * (`attached`) is checked and not yielded; a stream without it is ExecRemoteUnsupportedError.
     * No reconnect: the iteration ends with the stream. With `ws: true` and a `tail`, the
     * iteration opens an attach socket of its own (the server sets a socket's tail when it opens),
     * closed when the iteration ends.
     */
    events(options?: ExecRemoteEventsOptions): AsyncIterable<ExecRemoteFrame>;
    /** Open a new attach socket. Resolves on the server's `attached` frame; rejects with a refusal, or Unsupported without one. */
    attach(): Promise<ExecRemoteSession>;
    /** Abort every stream and request of this connection and close its socket. */
    close(): void;
}
/** The `exec.connect` function. */
export type ExecRemoteConnect = (urlOrPath: string, options?: ExecRemoteConnectOptions) => ExecRemoteConnection;
/**
 * A refused or failed remote op. `code` is the server's `details.code`
 * (`REMOTE_EVAL_DISABLED`, …) or a client code; `fix` is what to change.
 * It never holds the token, the request headers or the request body.
 */
export declare class ExecRemoteError extends Error {
    /** HTTP status (0 when no answer arrived; the close code's status for a socket refusal). */
    readonly status: number;
    /** `details.code` from the server, or a client code such as `REMOTE_CLIENT_TIMEOUT`. */
    readonly code: string;
    /** Which gate refused: `token`, `capability`, `script`, … when the server says. */
    readonly layer: string | undefined;
    /** The magic comments / management call that would allow the op. */
    readonly fix: ExecRemoteFix | undefined;
    /** The server's `details` (without secrets, by contract). */
    readonly details: Record<string, unknown>;
    /** The script URL, without query or credentials. */
    readonly url: string | undefined;
    constructor(params: {
        message: string;
        status: number;
        code: string;
        layer?: string | undefined;
        fix?: ExecRemoteFix | undefined;
        details?: Record<string, unknown> | undefined;
        url?: string | undefined;
        cause?: unknown;
    });
}
/** The token gate refused: 401 REMOTE_TOKEN_REQUIRED / REMOTE_TOKEN_INVALID, 403 REMOTE_TOKEN_SCOPE / REMOTE_EVAL_TOKEN_REQUIRED. */
export declare class ExecRemoteTokenError extends ExecRemoteError {
    /** The script's token names (never secrets). */
    readonly tokenNames: string[];
    constructor(params: ConstructorParameters<typeof ExecRemoteError>[0]);
}
/** A capability is off (`*_DISABLED`): a permission, off by default. `fix` says how to allow it. */
export declare class ExecRemotePermissionError extends ExecRemoteError {
    constructor(params: ConstructorParameters<typeof ExecRemoteError>[0]);
}
/** The script's own code threw (422 REMOTE_THREW). `remote` is the script-side error. */
export declare class ExecRemoteThrewError extends ExecRemoteError {
    readonly remote: {
        name: string;
        message: string;
        stack?: string | undefined;
    };
    constructor(params: ConstructorParameters<typeof ExecRemoteError>[0]);
}
/** The op ran out of time: the server's 504 REMOTE_TIMEOUT, or the client's own wait (REMOTE_CLIENT_TIMEOUT). */
export declare class ExecRemoteTimeoutError extends ExecRemoteError {
    constructor(params: ConstructorParameters<typeof ExecRemoteError>[0]);
}
/** The server answered without the hoody-remote version header: it predates remote ops (or is not hoody-exec). */
export declare class ExecRemoteUnsupportedError extends ExecRemoteError {
    constructor(params: ConstructorParameters<typeof ExecRemoteError>[0]);
}
/** No answer: the connection failed, the socket closed, or a frame broke the protocol. */
export declare class ExecRemoteConnectionError extends ExecRemoteError {
    constructor(params: ConstructorParameters<typeof ExecRemoteError>[0]);
}
/** True for every error this module raises. */
export declare function isExecRemoteError(error: unknown): error is ExecRemoteError;
/**
 * Render a fix as lines: the magic comments to add, then the management call.
 * Shared by error messages and the CLI.
 */
export declare function formatExecRemoteFix(fix: ExecRemoteFix | undefined): string[];
/**
 * Map a refusal body (`{ error, code, details:{ code, layer, fix } }`) to its
 * typed error. A body without a REMOTE_* code keeps the HTTP status as code.
 */
export declare function execRemoteErrorFromBody(status: number, body: unknown, url?: string): ExecRemoteError;
/** What the transport got back: a 2xx with its unread body, or a refusal with its parsed body. */
export type ExecRemoteRawAnswer = {
    kind: 'response';
    status: number;
    headers: Headers;
    body: ReadableStream<Uint8Array> | null;
} | {
    kind: 'refused';
    status: number;
    body: unknown;
};
/**
 * The seam between the connection and an HTTP client. The SDK implements it
 * over the service's HttpClient (kitAuth, the injected fetch); the CLI over
 * its own client. One attempt per call, never retried.
 */
export interface ExecRemoteTransport {
    /** Issue one request. Rejects only when no answer arrived (network, abort). */
    send(method: 'GET' | 'POST', url: string, init: {
        headers: Record<string, string>;
        body?: unknown;
        query?: Record<string, string> | undefined;
        signal: AbortSignal;
        timeoutMs: number;
    }): Promise<ExecRemoteRawAnswer>;
    /** The socket URL (http(s) form is fine) and the upgrade headers (kit credentials) for an attach. */
    upgrade(url: string): Promise<{
        url: string;
        headers: Record<string, string>;
    }>;
}
/** A transport over an SDK HttpClient (the service's namespace-wrapped client). */
export declare function execRemoteHttpTransport(http: unknown): ExecRemoteTransport;
/** The longest delay a timer takes (2^31-1 ms); a longer one fires at once. The server caps its own there too. */
export declare const EXEC_REMOTE_MAX_TIMEOUT_MS: number;
/** The most frame bytes (UTF-8) kept for a socket's first reader: the server's own per-session queue (SESSION_QUEUE_MAX_BYTES). */
export declare const EXEC_REMOTE_EARLY_MAX_BYTES: number;
/** Frames are kept for the first reader only this long after `attached`; then they are released. */
export declare const EXEC_REMOTE_EARLY_WINDOW_MS = 1000;
/**
 * Validate an absolute script URL: http(s), no credentials, no query or
 * fragment (the marker must be the only remote signal).
 */
export declare function assertScriptUrl(url: string): void;
/**
 * Create a connection over any transport (the SDK and the CLI each supply
 * one). `url` must be absolute unless the transport resolves paths.
 */
export declare function createExecRemoteConnection(transport: ExecRemoteTransport, url: string, options?: {
    token?: string | undefined;
    ws?: boolean | undefined;
    timeoutMs?: number | undefined;
}): ExecRemoteConnection;
declare module '../generated/exec/exec.service.js' {
    interface ExecService {
        /**
         * Connect to a live script's remote channel (#674).
         *
         * `urlOrPath` is the script's full URL (as `scripts/write` reports it) or
         * a script path on this box's exec kit. `token` is a `@remote-token`
         * secret (or the script's `@token` when it declares none); eval always
         * needs an eval-scoped `@remote-token`.
         *
         *   const conn = box.exec.connect(url, { token });
         *   await conn.capabilities();
         *   await conn.send({ type: 'ping' });            // { ok, reply, … }
         *   (await conn.eval('Object.keys(shared)')).result;
         *   for await (const f of conn.events()) { … }
         */
        connect(urlOrPath: string, options?: ExecRemoteConnectOptions): ExecRemoteConnection;
    }
}
export declare function patchExecRemotePrototype(): void;
