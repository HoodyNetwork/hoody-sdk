
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

/** HTTP statuses this client treats as worth retrying. */
export type RetryableStatus = 408 | 425 | 429 | 500 | 502 | 503 | 504;

/** An ApiError whose status is in the retryable set — what isRetryableApiError proves. */
export type RetryableApiError = ApiError & { readonly status: RetryableStatus };

const RETRYABLE_STATUSES: readonly number[] = [408, 425, 429, 500, 502, 503, 504];

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
  return RETRYABLE_STATUSES.includes(error.status);
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
