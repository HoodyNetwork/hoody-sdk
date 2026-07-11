
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

export function isRetryableApiError(error: unknown): error is ApiError {
  if (!isApiError(error)) return false;
  return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
