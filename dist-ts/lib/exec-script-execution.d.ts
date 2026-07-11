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
export type ExecExecutionTemplateVars = Parameters<ScriptExecutionService['execute']>[1];
export type ExecExecutionRequestOptions = Parameters<ScriptExecutionService['execute']>[2];
declare module '../generated/exec/script-execution.service.js' {
    interface ScriptExecutionService {
        executeTypedGet<TResponse = unknown>(path: string, templateVars?: ExecExecutionTemplateVars, requestOptions?: ExecExecutionRequestOptions): Promise<ApiResponse<TResponse>>;
        executeTypedPost<TRequest = Record<string, unknown>, TResponse = unknown>(path: string, data?: TRequest, templateVars?: ExecExecutionTemplateVars, requestOptions?: ExecExecutionRequestOptions): Promise<ApiResponse<TResponse>>;
    }
}
export declare function patchExecScriptExecutionPrototype(): void;
