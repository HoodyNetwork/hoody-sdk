/**
 * Call a Bot through its public URL — `new BotUrlClient({ url, key })`.
 * Browser-safe (fetch only, no Node imports). Maintained in lib/, not generated.
 *
 * A public Bot URL (`https://<label>.hoody.bot`) is the doors of ONE Bot, reached
 * with a named key its owner made. This client uses only those doors and needs no
 * Hoody account, computer or kit URL; `box.agent.bots.ask()` (bot-chat.ts) is the
 * owner's private route and is a different thing.
 *
 *   GET  /v1/models            the one model; its id is the URL's label
 *   POST /v1/chat/completions  OpenAI chat (chat(), streamed by default)
 *   POST /mcp                  MCP tools ask, updates, answer, status (stateless:
 *                              every call is one JSON-RPC POST, no session)
 *   GET  /events               the live status and updates (streamEvents(): Server-Sent
 *                              Events, resumed by Last-Event-ID; polling where a
 *                              Bot URL has no such path yet)
 *
 * The key travels only in `Authorization: Bearer`, never in a URL, and the client's own
 * string forms do not show it. Errors and diagnostics the client makes contain no
 * authentication material; content the Bot returns on success (model ids, chat text,
 * stream deltas, MCP answers, status fields, update rows) is the caller's own data and
 * is passed through unchanged. An error holds no text that an answer, a custom fetch or
 * stream, or an abort reason controls:
 *   - its code is in the closed registry or is one of the client's own;
 *   - its message is the registry's fixed text plus the HTTP status, or a fixed text of
 *     the client's, never the server's words;
 *   - a request id is kept only in the edge's form (32 lowercase hex) and only when it
 *     holds no 8-character piece of the key;
 *   - a cause is one of a few standard exception names (fixed words such as `TypeError`
 *     can happen to match a piece of a key: that is public vocabulary, not the key);
 *   - abort reasons are not propagated: a cancelled call throws a fresh AbortError.
 * An exception the caller's onText throws is passed back unchanged, and so is an SDK
 * error the caller changed itself: both are the caller's own objects.
 *
 * Every refusal carries a fixed code: lower snake in the body, the same code UPPER in
 * `X-Hoody-Error-Code`, in the door's own envelope (OpenAI `error.code`, MCP
 * `error.data.code` or a tool result `error <code>: <message>`). BotUrlError.code is
 * that code, lower case. Retries follow BOT_URL_ERRORS, for HTTP refusals and MCP tool
 * refusals alike: a 429 waits its Retry-After; a cold start (503 `bot_starting`, which
 * has no Retry-After) and the other retryable failures back off 1 s, 2 s, 4 s … up to
 * 30 s, about two minutes in all (streamEvents() is the exception: it retries until stopped).
 * A streamed chat answer that already delivered text is not retried. An error frame that
 * arrives inside a streamed chat answer that is already open is thrown as a BotUrlError
 * carrying its `retryable` flag, and the client does not retry it: the caller decides.
 *
 * What a retry sends again: chat() sends an Idempotency-Key, a fresh random one per call
 * unless you give one (or turn it off with `idempotencyKey: false`). Retries reuse the
 * same key. Repeating a request with the same Idempotency-Key (or the same MCP text)
 * normally joins the running message or returns its saved reply. This is best effort, not
 * a guarantee: the Bot keeps a key for about 24 hours after it accepted the message, and
 * after that, or after a reset, the repeat can be a NEW message. A Bot holding very many
 * recent keys refuses a new key (429) instead of forgetting an old one. Before repeating anything that changes things, check
 * with status/updates or poll the ref you got back. A new chat() call is a new message. An MCP text ask and an answer() carry no replay key, and
 * the Bot can act on a repeat (post the text again; approve whichever gate holds a title
 * by then). So they, and chat() without a key, are sent again only after a refusal that
 * comes before the Bot acts (a 429, `bot_starting`, `bot_unavailable`). When the answer
 * is lost after the request may have reached the Bot (a broken connection, an unreadable
 * answer or answer shape, a timeout or upstream failure, and for an unkeyed streamed
 * chat() any stream failure or error frame before the first text other than the five
 * refusals that come before the Bot acts: rate_limited, concurrency_limit, ip_blocked,
 * bot_starting, bot_unavailable), they throw
 * `outcome_unknown` and are not sent again: read getStatus() or listUpdates() before sending
 * them yourself. Reads (models, status,
 * updates) and asks by ref change nothing and are retried as above.
 *
 * Long answers: chat() streams and the Bot sends a keepalive comment while it works, so
 * a quiet connection is dropped after `idleTimeoutMs`. MCP ask() returns after about
 * 50 s with status `working` and a ref; ask() then asks again with that ref (which
 * sends nothing new) until the reply arrives or `maxWaitMs` passes.
 *
 * The code table, the key grammar and the backoff numbers are those of the Bot URL wire
 * contract.
 */
/** How a code tells a caller to react. */
export interface BotUrlErrorInfo {
    status: number;
    /** `backoff`: retry after a growing delay. `after`: retry after Retry-After. `no`: do not retry. */
    retry: 'no' | 'backoff' | 'after';
    /** The fixed public message; BotUrlError.message uses it, never the server's text. */
    message: string;
}
/** The public error codes a Bot URL answers with (the list is closed). */
export declare const BOT_URL_ERRORS: Readonly<Record<string, BotUrlErrorInfo>>;
/**
 * Codes the client makes itself, never sent by a Bot URL: `network_error` (no answer:
 * the connection failed), `stream_idle` (a stream sent nothing, not even a keepalive,
 * for idleTimeoutMs), `stream_interrupted` (a stream that already gave text broke off; an
 * explicit error frame after text keeps its registry code instead and is not retryable),
 * `outcome_unknown` (a call that changes something lost its answer after the request may
 * have reached the Bot; it is not sent again), `protocol_error` (an answer this client
 * cannot read), `tool_error` (an MCP tool
 * refused without a registry code), `http_<status>` (an HTTP refusal without a registry
 * code). A code outside the registry is never passed on as given.
 */
export type BotUrlLocalCode = 'network_error' | 'stream_idle' | 'stream_interrupted' | 'outcome_unknown' | 'protocol_error' | 'tool_error' | `http_${number}`;
/**
 * The error of every failed Bot URL call. `code` is the Bot's fixed refusal
 * code in lower snake case (see `BOT_URL_ERRORS`) or one of the client's own
 * (`BotUrlLocalCode`); `status` is the HTTP status, 0 when no answer arrived;
 * `retryable` says whether trying again can succeed. The message is a fixed
 * text, never the server's words, and holds no authentication material.
 */
export declare class BotUrlError extends Error {
    /** The registry code (lower snake case), or a BotUrlLocalCode. */
    readonly code: string;
    /** The HTTP status; 0 when no answer arrived. */
    readonly status: number;
    /** Whether trying again can succeed. */
    readonly retryable: boolean;
    /** The Retry-After of a 429, in ms. */
    readonly retryAfterMs: number | undefined;
    /** The answer's X-Request-Id: the owner finds the call in the Bot's access log by it. */
    readonly requestId: string | undefined;
    /** Build an error with `code` and `message`. Fields left out of `init` default to `status` 0 and `retryable` false; `cause` becomes the standard `Error.cause`. */
    constructor(code: string, message: string, init?: {
        status?: number | undefined;
        retryable?: boolean | undefined;
        retryAfterMs?: number | undefined;
        requestId?: string | undefined;
        cause?: unknown;
    });
}
/** True when `e` is a `BotUrlError`: a type guard for `catch` blocks. */
export declare function isBotUrlError(e: unknown): e is BotUrlError;
export interface BotUrlRetryOptions {
    /** Tries per call, the first included (default 8). 1 turns retries off. */
    maxAttempts?: number;
    /** The first backoff delay in ms (default 1000); each next one doubles. */
    initialDelayMs?: number;
    /** The longest backoff delay, and the longest Retry-After waited, in ms (default 30000). */
    maxDelayMs?: number;
    /** No retry starts later than this many ms after the call began (default 120000). */
    maxElapsedMs?: number;
}
export interface BotUrlClientOptions {
    /**
     * The Bot's public URL, `https://<label>.hoody.bot`: a label under `hoody.bot`, under
     * the Bot zone of `platform`, or under `zone`. A path, query or fragment is refused, and so is any other host, before
     * any request.
     */
    url: string;
    /** The key its owner gave you. Kept out of URLs, errors and logs. */
    key: string;
    retry?: BotUrlRetryOptions;
    /**
     * Drop a stream that sends nothing, not even a keepalive, for this many ms
     * (default 90000: the Bot sends one at least every 30 s while it works).
     */
    idleTimeoutMs?: number;
    /** Default: globalThis.fetch. */
    fetch?: typeof fetch;
    /**
     * One more Bot zone to accept besides the known ones, for a Bot on another platform
     * (`bots.example.org` accepts `https://<label>.bots.example.org`). It adds to the list
     * and never replaces it. Lowercase host names only; anything else is refused.
     */
    zone?: string;
    /**
     * The platform domain whose Bot zone is accepted besides `hoody.bot`, for example the
     * domain of your account's API base URL. Default: the platform this SDK was deployed or
     * released for (production: `hoody.bot` alone). A platform with no Bot zone adds nothing.
     */
    platform?: string;
}
/** One model as GET /v1/models lists it. On a public URL its id is the label. */
export interface BotUrlModel {
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
    [extra: string]: unknown;
}
export interface BotUrlChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface BotUrlChatOptions {
    /**
     * Stream the answer (default true). onText gets each piece as it arrives; an exception
     * it throws is passed back to you unchanged (it is your own object, not an SDK error).
     */
    stream?: boolean;
    onText?: (delta: string) => void;
    /**
     * The Idempotency-Key (1 to 255 printable ASCII characters, no spaces). By default a
     * fresh random key per call, reused by this call's retries. Give your own to send a
     * message again under the same key; false sends none. The Bot's replay is best effort
     * (see the module header): a key is kept for about 24 hours.
     */
    idempotencyKey?: string | false;
    signal?: AbortSignal;
}
export interface BotUrlChatResult {
    text: string;
    /** The label. */
    model: string | undefined;
    finishReason: string | undefined;
    requestId: string | undefined;
}
/** What MCP ask and answer return. */
export interface BotUrlAnswer {
    /** answered | working | waiting_on_gate | reset (the Bot's own words, passed on as given). */
    status: string;
    text: string;
    /** Ask again with it to wait for the same reply; it sends nothing new. */
    ref: string;
    requestId: string | undefined;
}
export interface BotUrlAskOptions {
    /**
     * Keep asking with the ref while the answer is `working` (default true). False
     * returns the first answer, which may be `working`.
     */
    wait?: boolean;
    /** Stop waiting after this many ms and return the last `working` answer (default 600000). */
    maxWaitMs?: number;
    /** Called with each `working` answer while ask() keeps waiting. */
    onWorking?: (answer: BotUrlAnswer) => void;
    signal?: AbortSignal;
}
export interface BotUrlUpdate {
    seq: number;
    at: string;
    role: string;
    text: string;
    [extra: string]: unknown;
}
export interface BotUrlUpdates {
    /** The rows, oldest first. A row whose fields have the wrong JSON type is left out (see `omitted`). */
    items: BotUrlUpdate[];
    /** Rows left out because a field was missing or had the wrong JSON type (fail closed, like the Bot's own renderer). */
    omitted: number;
    /** Pass to the next listUpdates() call. */
    cursor: number;
    hasMore: boolean;
    requestId: string | undefined;
}
export interface BotUrlGateAnswer {
    /** The gate handle (`g_` + 22 characters) as getStatus() lists it. Give this or title. */
    gateId?: string;
    /** The delegate's title, when it has one pending gate. */
    title?: string;
    decision: 'approve' | 'allow_session' | 'deny' | 'answer';
    /** With deny: why (at most 500 characters). With answer: the answer. */
    text?: string;
}
/** The Bot's status as the MCP status tool gives it; fields beyond these are passed through. */
export interface BotUrlStatus {
    name?: string;
    turn_running?: boolean;
    queued?: number;
    pending_gate?: unknown;
    open_delegates?: Array<{
        title?: string;
        pending_gates?: Array<{
            gate_id: string;
            type?: string;
            summary?: string;
        }>;
        [extra: string]: unknown;
    }>;
    [extra: string]: unknown;
}
/** One event of streamEvents(): the same projections getStatus() and listUpdates() return. */
export type BotUrlEvent = {
    type: 'status';
    status: BotUrlStatus;
} | {
    type: 'row';
    row: BotUrlUpdate;
}
/** The log no longer holds the rows after the cursor: its rows go on from nextSeq (the cursor may move back). */
 | {
    type: 'gap';
    nextSeq: number;
}
/** The log was archived: its rows start again at nextSeq (the cursor may move back). */
 | {
    type: 'archived';
    nextSeq: number;
};
export interface BotUrlStreamEventsOptions {
    /** Where to resume: a cursor from listUpdates() or from an earlier stream (the same numbers). Absent: the newest rows. */
    cursor?: number;
    signal?: AbortSignal;
    /**
     * What to do where the Bot URL has no event stream yet (404 path_not_allowed or 405
     * method_not_allowed): 'poll' (default) polls getStatus() and listUpdates(); 'none' throws.
     */
    fallback?: 'poll' | 'none';
    /** Poll mode: the time between the starts of two status polls (default 15000). */
    pollIntervalMs?: number;
    /** How long to wait for the stream's (or a poll's) response headers, in ms (default 15000). */
    connectTimeoutMs?: number;
}
export interface BotUrlEventStream extends AsyncIterable<BotUrlEvent> {
    /** The resume position: pass it as `cursor` to go on later. Not "the last row shown": a gap or archive can move it back. */
    getCursor(): number | undefined;
    /** 'poll' once the Bot URL turned out to have no event stream. */
    getMode(): 'stream' | 'poll';
}
/** Hooks for tests: time and randomness. */
export interface BotUrlClientDeps {
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    now?: () => number;
    random?: () => number;
    /**
     * Tests only: let an http:// URL through for a local test server (http://localhost or
     * http://127.0.0.1, any port). It changes nothing for https:// URLs, which must still be
     * Bot URLs. No shipped caller sets it; a real Bot URL refuses plain http.
     */
    allowHttp?: boolean;
}
/** Whether `v` is a gate handle (`g_` + 22 base64url characters), the only gate name a Bot URL shows. */
export declare function isGateHandle(v: unknown): v is string;
/**
 * The fixed text a bad-input TypeError of this module was made with, or undefined for any
 * other value. Read from private data, never from the error's (mutable) message. For the CLI.
 */
export declare function ownUsageMessage(e: unknown): string | undefined;
/**
 * A client for one Bot, reached through its public Bot URL with a key the
 * Bot's owner made. It needs no Hoody account. `chat()` sends a message and
 * returns the reply (streamed by default), `ask()` hands the Bot a task and
 * returns a reference to poll, `answer()` replies to a question the Bot is
 * waiting on, `getStatus()` and `listUpdates()` read its progress, and
 * `streamEvents()` follows it live. Works in browsers and in Node (fetch
 * only).
 *
 * The key is sent only in the `Authorization` header and never appears in a
 * URL, an error or the client's string forms. Failed calls throw
 * `BotUrlError`; retryable refusals are retried with backoff first (see
 * `BotUrlRetryOptions`).
 */
export declare class BotUrlClient {
    #private;
    /**
     * `options.url` is the Bot's public URL alone (`https://<label>.hoody.bot`,
     * or a label under `options.zone` or the Bot zone of `options.platform`) and
     * `options.key` its `hbk_` key. Throws `TypeError` before any request when
     * the URL carries a path, query, fragment or credentials, is not https or
     * not a Bot URL, when the key is not a Bot key, or when no `fetch` is
     * available. The message never quotes the key. `deps` are hooks for tests.
     */
    constructor(options: BotUrlClientOptions, deps?: BotUrlClientDeps);
    /** The Bot's URL, as checked: `https://<label>.hoody.bot`. */
    getUrl(): string;
    /** Never shows the key. */
    toString(): string;
    /** The JSON form: the Bot's URL only, so serializing or logging the client never shows the key. */
    toJSON(): {
        url: string;
    };
    /** The Bot's model list: one model, whose id is the label. A cheap way to test a key. */
    listModels(options?: {
        signal?: AbortSignal;
    }): Promise<BotUrlModel[]>;
    /**
     * Send a message (or a whole conversation) through the OpenAI chat door and return the
     * Bot's reply. One Bot is one shared conversation: the Bot answers your last message
     * and may put updates it logged since the last answer in front of the reply.
     */
    chat(input: string | BotUrlChatMessage[], options?: BotUrlChatOptions): Promise<BotUrlChatResult>;
    /**
     * Ask through the MCP door and wait for the reply. A `working` answer is followed by
     * asks with its ref (they send nothing new) until the Bot answers, a gate stops it, or
     * `maxWaitMs` passes. `ask({ ref })` rejoins a reply an earlier call left waiting.
     */
    ask(message: string | {
        ref: string;
    }, options?: BotUrlAskOptions): Promise<BotUrlAnswer>;
    /** What the Bot logged after `cursor` (its replies, delegate reports, gates), oldest first. Without one, the newest rows. */
    listUpdates(cursor?: number, options?: {
        signal?: AbortSignal;
    }): Promise<BotUrlUpdates>;
    /**
     * Answer a pending gate of one of the Bot's delegates. The answer goes to the Bot as
     * your message and the result is the Bot's reply, like ask().
     */
    answer(gate: BotUrlGateAnswer, options?: BotUrlAskOptions): Promise<BotUrlAnswer>;
    /** The Bot: whether it is working on a turn and its open delegates with their pending gates. */
    getStatus(options?: {
        signal?: AbortSignal;
    }): Promise<BotUrlStatus>;
    /**
     * The Bot's live events: its status first and whenever it changes, then each new log
     * row, from `GET /events` (Server-Sent Events). `for await (const e of bot.streamEvents({ signal }))`.
     *
     * - The stream resumes where it left off: `cursor` (also readable on the returned
     *   object) is sent as Last-Event-ID on every reconnect. A `gap` or `archived` event
     *   tells that the Bot's log moved on without those rows; the cursor can then move back.
     * - The Bot ends each stream after about 25 s; streamEvents() reconnects by itself, after the
     *   server's retry hint plus up to 0.5 s. Failures back off 1 s, 2 s, 4 s … up to
     *   `retry.maxDelayMs`; the backoff resets only after a normal end or a connection that
     *   stayed up 10 s. A 429 waits at least its Retry-After (one longer than
     *   `retry.maxDelayMs` is thrown, as calls do), and a rate_limited slows the next tries
     *   by 30 s, doubling to 2 min, until 5 min pass without one. Unlike calls it never gives
     *   up on its own.
     * - Codes that cannot succeed (key_invalid, key_disabled, bot_disabled, ip_not_allowed,
     *   invalid_request, an HTTP refusal without a code other than 408, 502, 503 or 504 …)
     *   are thrown from the iterator as BotUrlError.
     * - Where the Bot URL has no event stream yet (404 path_not_allowed, 405
     *   method_not_allowed) it polls instead (`mode` turns 'poll'): getStatus() every
     *   `pollIntervalMs` (15 s), listUpdates() only when the status changed, about 4 requests a
     *   minute while nothing happens. Polling never reports gap or archived, and rows that
     *   leave the status as it was wait for its next change. `fallback: 'none'` throws
     *   instead.
     * - `break` (or return()) stops it at once and quietly; the caller's signal stops it with
     *   an AbortError. Either way no connection, timer or reader is left behind.
     */
    streamEvents(options?: BotUrlStreamEventsOptions): BotUrlEventStream;
    /** A fresh Idempotency-Key, for callers who keep one per message. */
    static generateIdempotencyKey(): string;
}
