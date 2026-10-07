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
import { assertBasePath } from './exec-path-utils.js';

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
    run<TResponse = unknown>(
      path: string,
      options?: ExecScriptCallOptions,
    ): Promise<ApiResponse<TResponse>>;
  }
}

/**
 * Percent-encode a script path one segment at a time, exactly once.
 * One leading `/` is accepted and dropped: `/health` is the path as it appears
 * after the exec origin in a URL, and names the same script as `health`.
 * The rest is validated (no further leading `/`, no `.`/`..` segments, no
 * backslash or NUL, including percent-hidden forms).
 */
export function encodeExecScriptPath(path: string, helperName: string): string {
  const trimmed = path.trim();
  const relative = trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed.slice(1) : trimmed;
  const normalized = assertBasePath(relative, helperName);
  return normalized.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

const REQUEST_OPTION_KEYS = [
  'signal', 'timeoutMs', 'retries', 'retryDelayMs', 'retryOnStatuses',
  'middlewareContext', 'authRetry', 'rawResponse', 'responseType', 'headers',
] as const;

/**
 * Dispatch one request to an already-encoded script path through the
 * service's own (namespace-wrapped) HttpClient, so kit credentials,
 * retries, middleware and ApiError behave as for every generated method.
 */
export function dispatchExecScript<TResponse = unknown>(
  service: ExecService,
  encodedPath: string,
  options: ExecScriptCallOptions = {},
): Promise<ApiResponse<TResponse>> {
  const method = String(options.method ?? 'GET').toUpperCase();
  const internals = service as unknown as {
    buildTemplateUrl: (p: string, v: Record<string, unknown>) => string;
    http: { request: (method: string, url: string, data: Record<string, unknown>) => Promise<unknown> };
  };
  const requestUrl = internals.buildTemplateUrl(
    `/${encodedPath}`,
    (options.templateVars ?? {}) as Record<string, unknown>,
  );
  const requestData: Record<string, unknown> = {};
  for (const key of REQUEST_OPTION_KEYS) {
    if (options[key] !== undefined) requestData[key] = options[key];
  }
  if (options.query !== undefined) {
    const query: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) query[k] = v;
    }
    if (Object.keys(query).length > 0) requestData.query = query;
  }
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    requestData.body = options.body;
  }
  // A script is arbitrary code: a status it returned cannot be told from a
  // platform failure, and a retry would run it again. Its answer is final;
  // `retries` covers only a request that never reached the container.
  requestData.responseIsFinal = true;
  return internals.http.request(method, requestUrl, requestData) as Promise<ApiResponse<TResponse>>;
}

// Global Symbol used as a once-guard so the prototype patch is idempotent.
// Symbol.for ensures a single shared key even if the module is loaded multiple times.
const EXEC_SCRIPT_EXECUTION_PATCH_MARKER = Symbol.for('hoody.sdk.exec.run.patch');

export function patchExecScriptExecutionPrototype(): void {
  const prototype = ExecService.prototype as unknown as Record<string | symbol, unknown>;
  if (prototype[EXEC_SCRIPT_EXECUTION_PATCH_MARKER]) return;

  prototype['run'] = async function run<TResponse = unknown>(
    this: ExecService,
    path: string,
    options?: ExecScriptCallOptions,
  ): Promise<ApiResponse<TResponse>> {
    const encodedPath = encodeExecScriptPath(path, 'run');
    return dispatchExecScript<TResponse>(this, encodedPath, options ?? {});
  };

  prototype[EXEC_SCRIPT_EXECUTION_PATCH_MARKER] = true;
}

patchExecScriptExecutionPrototype();
