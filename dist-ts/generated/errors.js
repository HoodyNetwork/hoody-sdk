export class ApiError extends Error {
    status;
    code;
    url;
    method;
    request;
    response;
    constructor(params) {
        super(params.message);
        this.name = 'ApiError';
        this.status = params.status ?? 0;
        this.code = params.code;
        this.url = params.url;
        this.method = params.method;
        this.request = params.request;
        this.response = params.response;
        if (params.cause !== undefined) {
            this.cause = params.cause;
        }
    }
}
export function isApiError(error) {
    if (error instanceof ApiError) {
        return true;
    }
    if (!error || typeof error !== 'object') {
        return false;
    }
    const candidate = error;
    return candidate.name === 'ApiError'
        && typeof candidate.status === 'number'
        && typeof candidate.message === 'string';
}
const RETRYABLE_STATUSES = [408, 425, 429, 500, 502, 503, 504];
/**
 * Error codes with which a server refuses a request before doing anything, and asks for it
 * again: the request can be repeated whatever its method. FILE_PATH_BUSY is hoody-files'
 * 409 for a path another operation holds ("nothing was changed").
 */
export const RETRY_SAFE_CODES = ['FILE_PATH_BUSY', 'PATH_BUSY'];
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
export function isRetryableApiError(error) {
    if (!isApiError(error))
        return false;
    if (error.status === 409)
        return typeof error.code === 'string' && RETRY_SAFE_CODES.includes(error.code);
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
export function isApiErrorCode(error, ...codes) {
    return isApiError(error) && typeof error.code === 'string' && codes.includes(error.code);
}
export class ValidationError extends Error {
    field;
    constructor(message, field) {
        super(message);
        this.field = field;
        this.name = 'ValidationError';
    }
}
