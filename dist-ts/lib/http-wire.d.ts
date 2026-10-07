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
/** The fields of a failed attempt that shouldRetry() reads. */
export interface RetryableFailure {
    status: number;
    code?: string | undefined;
    cause?: unknown;
}
/**
 * Whether a failed attempt may be sent again. One rule, in this order:
 *   1. This client's own timeout or abort, a refused redirect and a missing fetch are final.
 *   2. A request that never reached a server (the connection could not be opened) ran
 *      nothing: any method goes again.
 *   3. A refusal whose code says nothing was done (RETRY_SAFE_CODES): any method goes again.
 *   4. A request marked responseIsFinal stops here: its handler is arbitrary code, so a status
 *      it returned is an answer, and a lost connection may have followed a run.
 *   5. Otherwise the request may have been handled. An idempotent method (GET, HEAD, OPTIONS,
 *      PUT, DELETE) goes again on a lost connection or a status in retryOnStatuses; any
 *      other method only on 429, which refuses before handling.
 * `byDefault` (nobody set `retries`): a method that is not idempotent goes again only by rule 2.
 */
export declare function shouldRetryFailure(error: RetryableFailure, method: string, retryOnStatuses: readonly number[], responseIsFinal?: boolean, byDefault?: boolean): boolean;
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
