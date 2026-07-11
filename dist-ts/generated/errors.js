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
export function isRetryableApiError(error) {
    if (!isApiError(error))
        return false;
    return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
}
export class ValidationError extends Error {
    field;
    constructor(message, field) {
        super(message);
        this.field = field;
        this.name = 'ValidationError';
    }
}
