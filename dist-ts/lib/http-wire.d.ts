/**
 * Wire rules the browser HttpClient shares with the generated Node client. The Node client
 * inlines the same functions, and a parity test holds the two equal.
 *
 * No Node imports: this module is in the browser bundle.
 */
/**
 * Error codes whose refusal says nothing was done (a path held by another write), so any method
 * may be sent again. The same list as RETRY_SAFE_CODES in the emitted errors.ts; it lives here as
 * well because the checked-in generated/errors.ts predates it.
 */
export declare const RETRY_SAFE_CODES: readonly string[];
/** Methods the retry rule may send again after a lost connection. */
export declare const IDEMPOTENT_METHODS: readonly string[];
/**
 * Methods that change nothing: the only ones the retry rule sends again after the server
 * answered with success and the client then failed (see shouldRetryFailure, rule 2).
 */
export declare const READ_METHODS: readonly string[];
/**
 * True when the request carries a non-empty value under the idempotency-key header its
 * operation declares (IRequestData.declaredIdempotencyKeyHeader). Header names are compared ignoring
 * case. A header the operation does not declare counts for nothing: the server would not
 * deduplicate on it.
 */
export declare function sendsIdempotencyKey(headers: Record<string, string> | undefined, declared: string | undefined): boolean;
/** A keyed request as attempt 1 dispatched it; see keyedReplayOf. */
export interface IKeyedReplay {
    /** The idempotency-key header's name, spelled as it went out. */
    name: string;
    /** Its value. */
    value: string;
    /** The body as it went on the wire, sent unchanged by every attempt. */
    body: unknown;
    /** The multipart Content-Type, boundary included, of a form encoded once (encodedFormOf). */
    contentType?: string;
}
/**
 * The request every attempt of a keyed request sends (IRequestData.declaredIdempotencyKeyHeader): the key
 * header as the first keyed attempt dispatched it, after request middleware, and the body as it
 * went on the wire. The server deduplicates on the key and compares the body: a retry under
 * another key runs the operation a second time, and another body under the same key is refused
 * (idempotency_key_reused). So a retry sends these two, whatever request middleware does on that
 * attempt.
 *
 * The body is fixed here: bytes are copied (the caller may reuse its buffer), a Blob is
 * immutable, a string is itself, a FormData was encoded once by encodedFormOf (its bytes and
 * contentType, the boundary in it, go out on every attempt), and a value the transport would
 * JSON-encode is encoded once with
 * `encode`, the transport's own encoder, so every attempt carries the same text. Returns
 * undefined when the body cannot be sent twice byte for byte: a stream or an async iterable (read
 * once), a FormData not encoded first (fetch writes a new multipart boundary each time), or a
 * value `encode` refuses. Such a request is not retried. Also undefined when the request sends no
 * key.
 *
 * `headers` are the ones applyRequestMiddleware returned, folded by case (one spelling per name,
 * the last value set), so the key found here is the only key fetch sends.
 */
export declare function keyedReplayOf(headers: Record<string, string>, declared: string | undefined, wire: unknown, encode: (value: unknown) => string, contentType?: string): IKeyedReplay | undefined;
/**
 * The headers of a later attempt of a keyed request: every spelling of the declared header is
 * removed and the first keyed attempt's name and value put back (keyedReplayOf). A form
 * encoded once goes out under its own multipart Content-Type (every other spelling removed),
 * the boundary its bytes were written with.
 */
export declare function withKeyedReplayHeader(headers: Record<string, string>, declared: string, replay: IKeyedReplay): Record<string, string>;
/**
 * A keyed FormData body, encoded once: its bytes (a Blob) and the multipart Content-Type with the
 * boundary they were written with. fetch writes a new boundary for every send of a FormData, so
 * a retry of the form itself is other bytes under the same key; these bytes, sent again under
 * this Content-Type, are the same request. Every entry of a FormData is a string or a Blob (a
 * File), and the platform's own Response encodes it, in Node and in a browser. undefined for any
 * other body, or when encoding fails: the request then keeps its old rule (a keyed form is not
 * retried).
 */
export declare function encodedFormOf(wire: unknown): Promise<{
    body: Blob;
    contentType: string;
} | undefined>;
/**
 * A fresh idempotency key (a random UUID). A generated POST method that declares an
 * `Idempotency-Key` header sends one per call when the caller gives none. Falls back to
 * getRandomValues where randomUUID is missing (a page served over plain http).
 */
export declare function newIdempotencyKey(): string;
/**
 * The headers of a request that carries an idempotency key under `name`: one key per call,
 * kept across its retries. A non-blank key the caller set wins, per call or client-wide
 * (`clientHeaders`); a blank one counts as none, since the server ignores it. Otherwise the
 * call gets a fresh key.
 */
export declare function withIdempotencyKey(callHeaders: Record<string, string> | undefined, clientHeaders: Record<string, string> | undefined, name: string): Record<string, string>;
/**
 * The default retry policy, used when neither the request nor the client sets `retries`: up to
 * DEFAULT_RETRIES more attempts (none for a responseIsFinal request), spent as
 * shouldRetryFailure(..., byDefault = true) allows, DEFAULT_RETRY_DELAY_MS as the backoff base
 * (1-2 s, then 2-4 s: retryDelay) unless `retryDelayMs` is set, and at most
 * DEFAULT_RETRY_WAIT_CAP_MS of waiting in all: a wait that would pass it (a long Retry-After)
 * ends the retries instead of being cut short.
 */
export declare const DEFAULT_RETRIES = 2;
export declare const DEFAULT_RETRY_DELAY_MS = 2000;
export declare const DEFAULT_RETRY_WAIT_CAP_MS = 10000;
/** The longest single retry wait, whatever the policy. */
export declare const MAX_RETRY_DELAY_MS = 30000;
/**
 * The wait before retry `attempt` (1-based), or undefined: do not retry.
 *
 * A server's Retry-After (`retryAfterMs`) is honoured as sent, 0 included (RFC 9110 §10.2.3 allows
 * "now"); one asking for more than MAX_RETRY_DELAY_MS ends the retries, because sending sooner than
 * the server asked is not honouring it. Otherwise the step is `baseDelayMs` doubled per attempt,
 * capped at MAX_RETRY_DELAY_MS, and the wait is drawn with equal jitter: at least half the step,
 * at most all of it, so clients that failed together do not come back together.
 */
export declare function retryDelay(baseDelayMs: number, attempt: number, retryAfterMs?: number, random?: () => number): number | undefined;
/**
 * A keyed request whose key the server is still working on (its first request has not finished)
 * is answered 409 IDEMPOTENCY_REQUEST_IN_PROGRESS with a Retry-After. The client asks again with
 * the same key and body after that wait (KEYED_IN_PROGRESS_DEFAULT_WAIT_MS when absent, at most
 * KEYED_IN_PROGRESS_MAX_WAIT_MS), and the answer it gets is the first request's. These waits spend
 * no retry; they stop once the call's own deadline (its timeoutMs; KEYED_IN_PROGRESS_MAX_TOTAL_MS
 * when it has none) would pass, and the 409 is then the call's answer. That deadline runs from the
 * first attempt: once the call has waited, each later attempt gets only what is left of it
 * (keyedAttemptTimeoutMs), and no attempt or retry wait of any kind runs past it (keyedDeadlinePassed). A request that must not go twice (responseIsFinal) never waits, and an
 * abort ends a wait at once (sleepUnlessAborted).
 */
export declare const KEYED_IN_PROGRESS = "IDEMPOTENCY_REQUEST_IN_PROGRESS";
export declare const KEYED_IN_PROGRESS_DEFAULT_WAIT_MS = 5000;
export declare const KEYED_IN_PROGRESS_MAX_WAIT_MS = 30000;
export declare const KEYED_IN_PROGRESS_MAX_TOTAL_MS = 420000;
/** The deadline keyedInProgressWaitMs measures against: the call's timeout, or the 7 min cap without one. */
export declare function keyedInProgressLimitMs(timeoutMs: number): number;
/** How long to wait before asking again, or undefined: not that answer, or the deadline would pass. */
export declare function keyedInProgressWaitMs(error: {
    status?: number | undefined;
    code?: string | undefined;
}, retryAfterMs: number | undefined, elapsedMs: number, deadlineMs: number): number | undefined;
/** The timeout of an attempt: `timeoutMs`, or, once the call has waited, what is left until `deadlineAt`. */
export declare function keyedAttemptTimeoutMs(timeoutMs: number, deadlineAt: number | undefined, now: number): number;
/** Whether a call whose deadline is fixed (it has waited on IN_PROGRESS) would be past it after `delayMs`. */
export declare function keyedDeadlinePassed(deadlineAt: number | undefined, now: number, delayMs?: number): boolean;
/** Wait `ms`, or less when `signal` aborts first (the next attempt then fails as an aborted request). */
export declare function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void>;
/**
 * A kit of a computer that has just come up answers 502 BACKEND_GATEWAY_ERROR until it is
 * listening, about 10 s after the computer reports `running`. Under the default policy a failure
 * isKitStarting() accepts may go again, at most KIT_STARTING_MAX_DELAY_MS apart (a Retry-After is
 * honoured as sent), within the client's `kitStartingWaitMs` of waiting in all
 * (KIT_STARTING_WAIT_MS unless set; 0 turns the wait off). Which requests may go again is still
 * shouldRetryFailure's answer: an idempotent method, never a responseIsFinal request. When the
 * wait runs out, the request fails with KIT_NOT_READY (kitNotReadyMessage).
 */
export declare const KIT_STARTING_MAX_DELAY_MS = 5000;
export declare const KIT_STARTING_WAIT_MS = 20000;
export declare const KIT_NOT_READY = "KIT_NOT_READY";
/**
 * The code of a request a request middleware (or a finalizer) refused by throwing: status 0,
 * `outcome` `not_sent`, the thrown value as `cause`. It is final: the request is not sent again and
 * the middleware is not asked a second time. An ApiError the middleware throws is the answer as it
 * is (also final).
 */
export declare const REQUEST_REFUSED = "REQUEST_REFUSED";
/** True for the answer a kit gives while it is still starting: a 502 with code `BACKEND_GATEWAY_ERROR`. */
export declare function isKitStarting(error: RetryableFailure): boolean;
/** The `kitStartingWaitMs` a client runs with: KIT_STARTING_WAIT_MS when unset, else a whole number of milliseconds, 0 or more. */
export declare function resolveKitStartingWaitMs(value: unknown): number;
/** How many more attempts a kit still starting may take within `waitMs`: one per KIT_STARTING_MAX_DELAY_MS, plus one. */
export declare function kitStartingRetries(waitMs: number): number;
/** The message of a `KIT_NOT_READY` failure, naming how long the client waited (in whole seconds). */
export declare function kitNotReadyMessage(waitedMs: number): string;
/**
 * True in a web browser's page or worker. Its fetch hides where a manual redirect leads (an
 * opaqueredirect response) and reports every network failure as a bare TypeError, so there a
 * request without credentials is left to the browser's own redirect following: "never
 * dispatched" cannot be claimed for it anyway.
 */
export declare function inWebBrowser(): boolean;
/**
 * The request never reached a server: somewhere in the cause chain the connection failed to
 * open. A host with several addresses fails as one AggregateError; it counts when every attempt
 * in it failed that way. A failure marked `afterDispatch` (a redirect hop after an answered first
 * hop, see sendConfined) never counts.
 *
 * Only a runtime whose fetch reports the cause (Node, Bun, Deno) gives an answer here. A browser's
 * fetch rejects with a bare TypeError ("Failed to fetch") for every network failure, so there this
 * is always false and the ordinary rule for a lost connection applies.
 */
export declare function neverDispatched(error: unknown): boolean;
/**
 * The reason a client's deadline aborts a request with: a new one per call, which {@link isDeadlineReason}
 * recognises later. fetch rejects with the signal's reason, so toApiError can tell its own timeout from a
 * caller abort that landed after the timer fired.
 */
export declare function deadlineReason(): Error;
/** True when `error` is a reason {@link deadlineReason} made, that is, the client's own timeout and not a caller's abort. */
export declare function isDeadlineReason(error: unknown): boolean;
/** The message of a request the caller's signal aborted, with the reason it gave (if any). */
export declare function callerAbortMessage(reason: unknown): string;
/**
 * A change the server answered with success (`answeredOk`: a 2xx status), that then failed in
 * the client (its body could not be read or parsed, a response middleware threw, whatever the
 * status of the error it threw): it is never sent again, by the retry rule or by an onError hook
 * that asks for a replay. The server did the work. An answer with an error status whose body
 * then failed to read is not one of these: the server said the change failed. GET, HEAD and
 * OPTIONS change nothing, and a `keyed` request (it sends the idempotency key its server
 * honours) is answered from the server's record of the first, so those may go again.
 */
export declare function answeredWriteIsFinal(method: string, answeredOk: boolean, keyed: boolean): boolean;
/**
 * fetch options the client forwards when the caller asks for them (IHttpClientConfig.fetchCredentials,
 * fetchCache). Only these values are passed on; anything else is ignored, so a typo cannot reach
 * fetch (which throws a TypeError on an unknown mode). `only-if-cached` is left out: fetch accepts
 * it only for same-origin requests.
 */
export type FetchCredentialsMode = 'omit' | 'same-origin' | 'include';
export type FetchCacheMode = 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache';
export declare const FETCH_CREDENTIALS_MODES: readonly string[];
export declare const FETCH_CACHE_MODES: readonly string[];
/** The fetch `credentials` policy of a client: one mode for every request, or one per namespace. */
export type FetchCredentialsPolicy = FetchCredentialsMode | Readonly<Record<string, FetchCredentialsMode | undefined>>;
/** The mode `value` names, or undefined. */
export declare function fetchCredentialsMode(value: unknown): FetchCredentialsMode | undefined;
/** The mode `value` names, or undefined. */
export declare function fetchCacheMode(value: unknown): FetchCacheMode | undefined;
/**
 * The `credentials` a request goes out with. A call's own value wins; else the client's policy: a
 * mode applies to every request, a map applies its entry for the request's namespace (the kit's
 * name: `agent`, `terminal`, ...; `api` for the account API and for a request made on the
 * transport directly), else its `'*'` entry. Undefined: the request sets none and fetch uses its
 * own default (`same-origin`).
 */
export declare function resolveFetchCredentials(own: unknown, policy: FetchCredentialsPolicy | undefined, namespace: unknown): FetchCredentialsMode | undefined;
/**
 * A byte limit: the first of `values` that is set (not undefined), which must be a whole number
 * above 0, else `invalid` is called with a message for `name` (the clients pass a function that
 * throws their ValidationError). No set value gives undefined (no limit). A bad value is an error,
 * never a cap that quietly turns itself off: 0, negatives, fractions, NaN, Infinity, strings.
 */
export declare function byteLimit(name: string, invalid: (message: string) => never, ...values: unknown[]): number | undefined;
/**
 * The code of a response whose body outgrew the call's `maxResponseBytes`, and of an event stream
 * that outgrew `maxStreamBytes`. Status 0 with `outcome` `answered`: the server answered, the
 * client stopped reading. Neither is sent again (shouldRetryFailure).
 */
export declare const RESPONSE_TOO_LARGE = "RESPONSE_TOO_LARGE";
export declare const STREAM_TOO_LARGE = "STREAM_TOO_LARGE";
/** The fields of a failed attempt that shouldRetry() reads. */
export interface RetryableFailure {
    status: number;
    code?: string | undefined;
    cause?: unknown;
}
/**
 * Whether a failed attempt may be sent again. One rule, in this order:
 *   1. The caller's abort, this client's own timeout, a refused redirect and a missing fetch are final.
 *   2. A request that never reached a server (the connection could not be opened) ran
 *      nothing: any method goes again. A request the server answered with a 2xx, that then
 *      failed in the client (its body could not be read or parsed, a response middleware threw,
 *      whatever status that error has), is final for every method but GET, HEAD and OPTIONS
 *      (answeredWriteIsFinal): the server did the work, and a repeat would do it again or answer
 *      differently (a DELETE that worked answers 404). A `keyed` request is the exception: the
 *      server answers its repeat from the record of the first, so it goes by the rules below.
 *   3. A refusal whose code says nothing was done (RETRY_SAFE_CODES): any method goes again.
 *   4. A request marked responseIsFinal stops here: its handler is arbitrary code, so a status
 *      it returned is an answer, and a lost connection may have followed a run.
 *   5. Otherwise the request may have been handled. An idempotent method (GET, HEAD, OPTIONS,
 *      PUT, DELETE) goes again on a lost connection or a status in retryOnStatuses; any
 *      other method only on 429, which refuses before handling.
 * `byDefault` (nobody set `retries`): a method that is not idempotent goes again only by rule 2.
 * `keyed`: the request sends the idempotency key its server honours (the header its operation declares),
 * so any method counts as idempotent in rule 5 and under `byDefault`: a repeat is answered from the
 * server's record.
 * `answered`: the attempt had an answer, so a status-0 failure after it is never "not sent" (rule 2).
 * `answeredOk`: that answer had a 2xx status, so a failure after it is final for a change (rule 2).
 */
export declare function shouldRetryFailure(error: RetryableFailure, method: string, retryOnStatuses: readonly number[], responseIsFinal?: boolean, byDefault?: boolean, keyed?: boolean, answered?: boolean, answeredOk?: boolean): boolean;
/**
 * True for a media type whose body is text: text/*, or one of the subtypes or structured
 * suffixes above. Matched on the exact subtype or suffix, never on a substring: `openxmlformats`
 * (.docx, .xlsx, .pptx) contains "xml" and is a zip archive.
 */
export declare function isTextMediaType(contentType: string | null | undefined): boolean;
/**
 * True for a media type whose body is bytes: any application/* type that is not text
 * (isTextMediaType), and image/*, audio/*, video/*, font/*. Bytes are the default for
 * application/*: an Office or other vendor file (vnd.openxmlformats-*, vnd.ms-*,
 * vnd.oasis.opendocument.*) served without Content-Disposition: attachment was decoded as UTF-8
 * and corrupted. text/*, the text subtypes and a missing type are not bytes.
 */
export declare function isBinaryMediaType(contentType: string | null | undefined): boolean;
/**
 * JSON.parse, except that an integer literal outside the safe range becomes a bigint instead of
 * the nearest double. Fractions and exponents are numbers, as in JSON.parse. A text with no
 * 16-digit run goes straight to JSON.parse.
 *
 * The text is scanned once outside its strings; each unsafe integer is swapped for a tagged
 * string that the reviver turns into the bigint. The tag carries a per-call random part, so a
 * string of the document cannot be mistaken for one.
 */
export declare function parseJsonLossless(text: string): unknown;
/**
 * JSON.stringify, except that a bigint is written as a plain integer literal instead of
 * throwing.
 */
export declare function stringifyJsonLossless(value: unknown): string;
/** A JSON request body: JSON.stringify, and the lossless writer when the value holds a bigint. */
export declare function stringifyBody(body: unknown): string;
/**
 * Adds query pairs to the parameters a URL already carries. A key the path holds itself (a route
 * marker: `/{archive}?extract`, `/{directory}?zip`) is never sent twice: a non-empty value from
 * the caller replaces the bare marker (`?extract=src%2F`), an empty one leaves it as it is.
 * Returns false when there was nothing to add.
 */
export declare function mergeQueryPairs(target: URLSearchParams, pairs: ReadonlyArray<readonly [string, string]>): boolean;
