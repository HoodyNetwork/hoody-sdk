/**
 * Exec script execution extension — runtime augmentation of the generated
 * ExecService.
 *
 * Architecture pattern: TypeScript "declare module" augmentation + prototype
 * patching. This file replaces the generated GET-only `exec.run(path, ...)` with
 * `exec.run(path, { method, query, body, headers })`: any method, a query, a
 * body and headers, through the service's own HttpClient (kitAuth, retries,
 * middleware, ApiError), with the script path percent-encoded exactly once.
 * The prototype is patched at module load time so the method exists at runtime.
 *
 * Callers can bind the response type from a companion .schema.json /
 * .openapi.json contract:
 *
 *   const result = await box.exec.run<MyResBody>('my-script', { method: 'POST', body: payload });
 *   // result is ApiResponse<MyResBody>
 *
 * The `as` casts are safe because the transport answers `unknown` payloads;
 * the generic merely narrows the type at the call-site.
 */
import { ExecService } from '../generated/exec/exec.service.js';
import type { ExecServiceBase } from '../generated/exec/exec.service.generated.js';
import type { ApiResponse } from '../generated/types.js';
export type ExecExecutionTemplateVars = Parameters<ExecServiceBase['__run']>[1];
/**
 * Request options accepted by `exec.run`: everything the transport takes
 * (signal, timeoutMs, retries, middlewareContext, rawResponse, responseType, …)
 * plus per-request `headers`.
 */
export type ExecExecutionRequestOptions = NonNullable<Parameters<ExecServiceBase['__run']>[2]> & {
    headers?: Record<string, string> | undefined;
};
/** HTTP methods a user script can be dispatched with. */
export type ExecScriptMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Options for `exec.run`. */
export type ExecScriptCallOptions = ExecExecutionRequestOptions & {
    /** HTTP method; defaults to GET. */
    method?: ExecScriptMethod | Lowercase<ExecScriptMethod> | undefined;
    /** Query parameters, sent as a real query string (never folded into the path). */
    query?: Record<string, unknown> | undefined;
    /** Request body (ignored for GET/HEAD). Objects are sent as JSON. */
    body?: unknown;
    /** Per-call URL template variables (projectId/containerId/serviceIndex/server). */
    templateVars?: ExecExecutionTemplateVars;
};
declare module '../generated/exec/exec.service.js' {
    interface ExecService {
        /**
         * Run a user script with any method, a query, a body and headers, through
         * the SDK transport (kitAuth, retries, middleware, ApiError).
         *
         * `path` is the script path, NOT percent-encoded: each segment is encoded
         * exactly once here. A leading `/` is optional (`'/health'` = `'health'`).
         *
         *   await box.exec.run('search', { query: { q: 'hi' } });
         *   await box.exec.run('items/42', { method: 'PUT', body: { name: 'x' } });
         */
        run<TResponse = unknown>(path: string, options?: ExecScriptCallOptions): Promise<ApiResponse<TResponse>>;
    }
}
/**
 * Percent-encode a script path one segment at a time, exactly once.
 * One leading `/` is accepted and dropped: `/health` is the path as it appears
 * after the exec origin in a URL, and names the same script as `health`.
 * The rest is validated (no further leading `/`, no `.`/`..` segments, no
 * backslash or NUL, including percent-hidden forms).
 */
export declare function encodeExecScriptPath(path: string, helperName: string): string;
/**
 * Dispatch one request to an already-encoded script path through the
 * service's own (namespace-wrapped) HttpClient, so kit credentials,
 * retries, middleware and ApiError behave as for every generated method.
 */
export declare function dispatchExecScript<TResponse = unknown>(service: ExecService, encodedPath: string, options?: ExecScriptCallOptions): Promise<ApiResponse<TResponse>>;
export declare function patchExecScriptExecutionPrototype(): void;
