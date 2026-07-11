/**
 * Exec script execution extensions — runtime augmentation of the generated
 * ScriptExecutionService.
 *
 * Architecture pattern: TypeScript "declare module" augmentation + prototype
 * patching. This file:
 *  1. Extends the generated ScriptExecutionService interface with two new
 *     methods (executeTypedGet, executeTypedPost) via `declare module`.
 *  2. Monkey-patches the prototype at module load time so the methods exist
 *     at runtime.
 *
 * This approach keeps generated code untouched while adding ergonomic,
 * type-safe wrappers. Callers can bind request/response types from companion
 * .schema.json / .openapi.json contracts:
 *
 *   const result = await service.executeTypedPost<MyReqBody, MyResBody>(
 *     '/scripts/my-script', payload
 *   );
 *   // result is ApiResponse<MyResBody>
 *
 * Generic type safety: TRequest and TResponse flow through the entire call
 * chain — from the caller, through the normalised path, into the underlying
 * generated method, and back as a typed ApiResponse<TResponse>. The `as`
 * casts are safe because the generated methods accept/return `unknown`
 * payloads; the generics merely narrow the type at the call-site.
 */

import { ScriptExecutionService } from '../generated/exec/script-execution.service.js';
import type { ApiResponse } from '../generated/types.js';
import { assertBasePath } from './exec-path-utils.js';

export type ExecExecutionTemplateVars = Parameters<ScriptExecutionService['execute']>[1];
export type ExecExecutionRequestOptions = Parameters<ScriptExecutionService['execute']>[2];

declare module '../generated/exec/script-execution.service.js' {
  interface ScriptExecutionService {
    executeTypedGet<TResponse = unknown>(
      path: string,
      templateVars?: ExecExecutionTemplateVars,
      requestOptions?: ExecExecutionRequestOptions,
    ): Promise<ApiResponse<TResponse>>;

    executeTypedPost<TRequest = Record<string, unknown>, TResponse = unknown>(
      path: string,
      data?: TRequest,
      templateVars?: ExecExecutionTemplateVars,
      requestOptions?: ExecExecutionRequestOptions,
    ): Promise<ApiResponse<TResponse>>;
  }
}

// Global Symbol used as a once-guard so the prototype patch is idempotent.
// Symbol.for ensures a single shared key even if the module is loaded multiple times.
const EXEC_SCRIPT_EXECUTION_PATCH_MARKER = Symbol.for('hoody.sdk.exec.script-execution.patch');

function normalizeScriptPath(path: string, helperName: string): string {
  return assertBasePath(path, helperName);
}

export function patchExecScriptExecutionPrototype(): void {
  const prototype = ScriptExecutionService.prototype as ScriptExecutionService & Record<string | symbol, unknown>;
  if (prototype[EXEC_SCRIPT_EXECUTION_PATCH_MARKER]) return;

  prototype.executeTypedGet = function executeTypedGet<TResponse = unknown>(
    this: ScriptExecutionService,
    path: string,
    templateVars?: ExecExecutionTemplateVars,
    requestOptions?: ExecExecutionRequestOptions,
  ): Promise<ApiResponse<TResponse>> {
    const normalizedPath = normalizeScriptPath(path, 'executeTypedGet');
    return this.execute(normalizedPath, templateVars, requestOptions) as Promise<ApiResponse<TResponse>>;
  };

  prototype.executeTypedPost = function executeTypedPost<TRequest = Record<string, unknown>, TResponse = unknown>(
    this: ScriptExecutionService,
    path: string,
    data?: TRequest,
    templateVars?: ExecExecutionTemplateVars,
    requestOptions?: ExecExecutionRequestOptions,
  ): Promise<ApiResponse<TResponse>> {
    const normalizedPath = normalizeScriptPath(path, 'executeTypedPost');
    // Dispatch through the underlying HTTP client directly rather than
    // `execute()` (which is GET-only and encodes `data` as a query string)
    // so the POST method + body actually reach the server. Same pattern as
    // exec-dynamic-client's callScript for body methods.
    const builtUrl = (this as unknown as {
      buildTemplateUrl?: (p: string, v: Record<string, unknown>) => string;
    }).buildTemplateUrl?.(
      `/${encodeURI(normalizedPath).replace(/^\//, '')}`,
      (templateVars ?? {}) as Record<string, unknown>,
    ) ?? `/${normalizedPath.replace(/^\//, '')}`;
    const requestUrl = builtUrl.replace('{path}', () => encodeURIComponent(normalizedPath));
    const requestData: Record<string, unknown> = {};
    if (data !== undefined && data !== null) requestData.body = data;
    if (requestOptions && typeof requestOptions === 'object') {
      const ro = requestOptions as Record<string, unknown>;
      if (ro.signal) requestData.signal = ro.signal;
      if (ro.headers) requestData.headers = ro.headers;
    }
    const httpAny = (this as unknown as { http: Record<string, (...args: unknown[]) => Promise<unknown>> }).http;
    return httpAny.post!(requestUrl, requestData) as Promise<ApiResponse<TResponse>>;
  };

  prototype[EXEC_SCRIPT_EXECUTION_PATCH_MARKER] = true;
}

patchExecScriptExecutionPrototype();
