
export interface ApiErrorRequestContext {
  method: string;
  url: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface ApiErrorResponseDetails {
  statusCode?: number;
  message?: string;
  code?: string;
  details?: unknown;
  [key: string]: unknown;
}

/**
 * What is known about whether a call's request reached a server (ApiError.outcome).
 * - `answered`: the server answered. Either the error has its HTTP status, or the answer
 *   arrived and the client failed after it (status 0): its body stalled or could not be parsed
 *   (PARSE_ERROR), or a response middleware threw.
 * - `not_sent`: provably never reached a server, on any attempt: the call ended before it was
 *   sent (an abort, a request middleware that threw), or the connection could not be opened.
 *   A call whose last attempt never went out, after an earlier one that may have reached the
 *   server (a lost connection, then an abort during the retry wait), says that earlier outcome.
 * - `unknown`: it may have reached the server: a connection lost before the answer, a deadline
 *   that passed first. In a web browser every network error is `unknown`: fetch does not say
 *   whether anything was sent.
 */
export type ApiErrorOutcome = 'not_sent' | 'unknown' | 'answered';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly url: string | undefined;
  readonly method: string | undefined;
  readonly request: ApiErrorRequestContext | undefined;
  readonly response: ApiErrorResponseDetails | unknown;
  /** The answer's Retry-After, in milliseconds, when it carried one (a 429 or a 503). */
  readonly retryAfterMs?: number;
  /**
   * Whether the call's request reached a server, over all its attempts (see ApiErrorOutcome).
   * Set by the SDK's HTTP clients; absent on an error they did not build (one a middleware
   * threw, for example).
   */
  readonly outcome?: ApiErrorOutcome;
  /**
   * How many times this call sent the request, retries and replays included; 0 when it was
   * never sent. When the last answer is a refusal, an earlier send may still have done the
   * work: a DELETE whose first answer was lost, and whose repeat answered 404, may have
   * deleted. Set by the SDK's HTTP clients, like outcome.
   */
  readonly attempts?: number;

  constructor(params: {
    message: string;
    status?: number;
    code?: string;
    url?: string;
    method?: string;
    request?: ApiErrorRequestContext;
    response?: ApiErrorResponseDetails | unknown;
    cause?: unknown;
    retryAfterMs?: number;
    outcome?: ApiErrorOutcome;
    attempts?: number;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status ?? 0;
    this.code = params.code;
    this.url = params.url;
    this.method = params.method;
    this.request = params.request;
    this.response = params.response;
    if (params.retryAfterMs !== undefined) this.retryAfterMs = params.retryAfterMs;
    if (params.outcome !== undefined) this.outcome = params.outcome;
    if (params.attempts !== undefined) this.attempts = params.attempts;

    if (params.cause !== undefined) {
      (this as { cause?: unknown }).cause = params.cause;
    }
  }
}

export function isApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
  return candidate.name === 'ApiError'
    && typeof candidate.status === 'number'
    && typeof candidate.message === 'string';
}

/**
 * HTTP statuses this client treats as worth retrying. 409 is here for one answer only: a
 * refusal whose error code says nothing was done (RETRY_SAFE_CODES).
 */
export type RetryableStatus = 408 | 409 | 425 | 429 | 500 | 502 | 503 | 504;

/** An ApiError whose status is in the retryable set — what isRetryableApiError proves. */
export type RetryableApiError = ApiError & { readonly status: RetryableStatus };

const RETRYABLE_STATUSES: readonly number[] = [408, 425, 429, 500, 502, 503, 504];

/**
 * Error codes with which a server refuses a request before doing anything, and asks for it
 * again: the request can be repeated whatever its method. FILE_PATH_BUSY is hoody-files'
 * 409 for a path another operation holds ("nothing was changed").
 */
export const RETRY_SAFE_CODES: readonly string[] = ['FILE_PATH_BUSY', 'PATH_BUSY'];

// The predicate narrows to RetryableApiError, NOT to ApiError — that distinction is the
// whole point, because this tests a VALUE condition (is the status retryable?) rather
// than a type. Declaring `error is ApiError` made the NEGATIVE branch subtract ApiError,
// so the natural caller
//     if (isApiError(e) && !isRetryableApiError(e)) { e.status }
// saw `e` as `never` and would not compile — for SDK consumers as much as for us.
//
// Two tempting fixes are both wrong. A plain `boolean` return kills the useful positive
// narrowing (`if (isRetryableApiError(e)) { e.status }` leaves `e` as `unknown`). An
// overload pair — (error: ApiError): boolean plus (error: unknown): error is ApiError —
// compiles and fixes both of those, but is UNSOUND for unions: given
// `e: ApiError | null` the first overload does not match, so the negative branch
// subtracts ApiError and silently reports `null` even though a non-retryable ApiError
// reaches it. Narrowing to the honest subtype avoids all three problems: the positive
// branch gains the status refinement, and the negative branch cannot subtract
// RetryableApiError from ApiError, so ApiError survives it.
export function isRetryableApiError(error: unknown): error is RetryableApiError {
  if (!isApiError(error)) return false;
  if (error.status === 409) return typeof error.code === 'string' && RETRY_SAFE_CODES.includes(error.code);
  return RETRYABLE_STATUSES.includes(error.status);
}

/**
 * Whether `error` is an ApiError carrying one of `codes`; narrows `code` to them.
 * Each operation that documents its error codes has an `{Ns}{Service}{Method}ErrorCode`
 * type (types.ts), named like its Request and Response types. Pass it as the type argument
 * and a code the operation does not document is a compile error; `code` then has that
 * type (without a type argument it has exactly the codes passed):
 *
 *     if (isApiErrorCode<AgentBotsMessagesSendErrorCode>(e, 'rate_limited')) { e.code; }
 *
 * Like isRetryableApiError it narrows to a subtype of ApiError, so an ApiError with any
 * other code still reaches the negative branch.
 */
export function isApiErrorCode<C extends string>(error: unknown, ...codes: C[]): error is ApiError & { readonly code: C } {
  return isApiError(error) && typeof error.code === 'string' && (codes as string[]).includes(error.code);
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * An option key an earlier release of the SDK took and this one renamed (`IfMatch` is now `ifMatch`,
 * `XHoodyCwd` is `cwd`, `realm` is `agentRealm`). Thrown before anything is sent: in plain JavaScript an unknown
 * key would be dropped without a word, and an old `IfMatch` would turn a conditional write into an
 * unconditional one. `field` is the retired key; `currentKey` the one to pass instead.
 */
export class RetiredOptionError extends ValidationError {
  constructor(public readonly method: string, public readonly retiredKey: string, public readonly currentKey: string) {
    super(method + ': option "' + retiredKey + '" was renamed to "' + currentKey + '". Pass ' + currentKey + ' instead.', retiredKey);
    this.name = 'RetiredOptionError';
  }
}

/**
 * Refuse every retired key `options` carries (a value other than undefined, own or inherited), with the key that
 * replaced it. Generated methods call it with their own table (sdk-option-names retiredOptionKeys).
 */
export function refuseRetiredOptions(options: unknown, method: string, retired: ReadonlyArray<readonly [string, string]>): void {
  if (options === null || typeof options !== 'object') return;
  const values = options as Record<string, unknown>;
  for (const [key, current] of retired) {
    if (values[key] !== undefined) throw new RetiredOptionError(method, key, current);
  }
}
