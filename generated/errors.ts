
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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly url: string | undefined;
  readonly method: string | undefined;
  readonly request: ApiErrorRequestContext | undefined;
  readonly response: ApiErrorResponseDetails | unknown;

  constructor(params: {
    message: string;
    status?: number;
    code?: string;
    url?: string;
    method?: string;
    request?: ApiErrorRequestContext;
    response?: ApiErrorResponseDetails | unknown;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status ?? 0;
    this.code = params.code;
    this.url = params.url;
    this.method = params.method;
    this.request = params.request;
    this.response = params.response;

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
 *     if (isApiErrorCode<AgentBotsSendMessageErrorCode>(e, 'rate_limited')) { e.code; }
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
