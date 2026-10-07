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
export declare class ApiError extends Error {
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
    });
}
export declare function isApiError(error: unknown): error is ApiError;
/**
 * HTTP statuses this client treats as worth retrying. 409 is here for one answer only: a
 * refusal whose error code says nothing was done (RETRY_SAFE_CODES).
 */
export type RetryableStatus = 408 | 409 | 425 | 429 | 500 | 502 | 503 | 504;
/** An ApiError whose status is in the retryable set — what isRetryableApiError proves. */
export type RetryableApiError = ApiError & {
    readonly status: RetryableStatus;
};
/**
 * Error codes with which a server refuses a request before doing anything, and asks for it
 * again: the request can be repeated whatever its method. FILE_PATH_BUSY is hoody-files'
 * 409 for a path another operation holds ("nothing was changed").
 */
export declare const RETRY_SAFE_CODES: readonly string[];
export declare function isRetryableApiError(error: unknown): error is RetryableApiError;
export declare class ValidationError extends Error {
    field?: string | undefined;
    constructor(message: string, field?: string | undefined);
}
