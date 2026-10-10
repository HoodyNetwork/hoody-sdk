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
 * immutable, a string is itself, and a value the transport would JSON-encode is encoded once with
 * `encode`, the transport's own encoder, so every attempt carries the same text. Returns
 * undefined when the body cannot be sent twice byte for byte: a stream or an async iterable (read
 * once), FormData (fetch writes a new multipart boundary each time), or a value `encode` refuses.
 * Such a request is not retried. Also undefined when the request sends no key.
 *
 * `headers` are the ones applyRequestMiddleware returned, folded by case (one spelling per name,
 * the last value set), so the key found here is the only key fetch sends.
 */
export declare function keyedReplayOf(headers: Record<string, string>, declared: string | undefined, wire: unknown, encode: (value: unknown) => string): IKeyedReplay | undefined;
/**
 * The headers of a later attempt of a keyed request: every spelling of the declared header is
 * removed and the first keyed attempt's name and value put back (keyedReplayOf).
 */
export declare function withKeyedReplayHeader(headers: Record<string, string>, declared: string, replay: IKeyedReplay): Record<string, string>;
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
 * (about 2 s, then 4 s, plus jitter) unless `retryDelayMs` is set, and at most
 * DEFAULT_RETRY_WAIT_CAP_MS of waiting in all: a wait that would pass it (a long Retry-After)
 * ends the retries instead of being cut short.
 */
export declare const DEFAULT_RETRIES = 2;
export declare const DEFAULT_RETRY_DELAY_MS = 2000;
export declare const DEFAULT_RETRY_WAIT_CAP_MS = 10000;
/**
 * A kit of a container that has just come up answers 502 BACKEND_GATEWAY_ERROR until it is
 * listening, about 10 s after the container reports `running`. Under the default policy a failure
 * isKitStarting() accepts may go again, at most KIT_STARTING_MAX_DELAY_MS apart (a Retry-After is
 * honoured as sent), within the client's `kitStartingWaitMs` of waiting in all
 * (KIT_STARTING_WAIT_MS unless set; 0 turns the wait off). Which requests may go again is still
 * shouldRetryFailure's answer: an idempotent method, never a responseIsFinal request. When the
 * wait runs out, the request fails with KIT_NOT_READY (kitNotReadyMessage).
 */
export declare const KIT_STARTING_MAX_DELAY_MS = 5000;
export declare const KIT_STARTING_WAIT_MS = 20000;
export declare const KIT_NOT_READY = "KIT_NOT_READY";
export declare function isKitStarting(error: RetryableFailure): boolean;
/** The `kitStartingWaitMs` a client runs with: KIT_STARTING_WAIT_MS when unset, else a whole number of milliseconds, 0 or more. */
export declare function resolveKitStartingWaitMs(value: unknown): number;
/** How many more attempts a kit still starting may take within `waitMs`: one per KIT_STARTING_MAX_DELAY_MS, plus one. */
export declare function kitStartingRetries(waitMs: number): number;
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
export declare function deadlineReason(): Error;
export declare function isDeadlineReason(error: unknown): boolean;
/** The message of a request the caller's signal aborted, with the reason it gave (if any). */
export declare function callerAbortMessage(reason: unknown): string;
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
 *      nothing: any method goes again.
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
 */
export declare function shouldRetryFailure(error: RetryableFailure, method: string, retryOnStatuses: readonly number[], responseIsFinal?: boolean, byDefault?: boolean, keyed?: boolean): boolean;
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
