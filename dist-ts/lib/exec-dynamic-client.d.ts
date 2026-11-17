/**
 * Exec Dynamic Client — High-level SDK API for discovering and calling user scripts.
 *
 * Extends the generated ExecService with `listCallableScripts()` and
 * `call()` via prototype patching (same pattern as exec-scripts.ts). Both reach
 * the inventory through the `openapi` and `scripts` services that sit on the
 * same `exec` object, so a computer-scoped client needs no wiring.
 *
 * Usage:
 *   const scripts = await computerClient.exec.listCallableScripts();
 *   const result = await computerClient.exec.call('my-api', { name: 'foo' });
 */
import { ScriptsService } from '../generated/exec/scripts.service.js';
import type { OpenapiService } from '../generated/exec/openapi.service.js';
import type { ApiResponse } from '../generated/types.js';
import { type CallableScript, type ListCallableScriptsOptions } from './exec-dynamic-discovery.js';
export type { CallableScript, CallableScriptParam, ListCallableScriptsOptions, CallableScriptsCache } from './exec-dynamic-discovery.js';
export { scriptPathToName, isValidToolName, sanitizeDescription } from './exec-dynamic-discovery.js';
export interface CallScriptOptions {
    /**
     * Explicit method override. Matches the full set `callScript` can dispatch;
     * when omitted, the discovered method for the script is used.
     */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined;
    signal?: AbortSignal | undefined;
    templateVars?: Record<string, string | number> | undefined;
    /** Extra request headers for the script call. */
    headers?: Record<string, string> | undefined;
    /** Header timeout for the script call (ms). */
    timeoutMs?: number | undefined;
    /**
     * Retry budget for the script call. A script is arbitrary code, so whatever
     * it answers is final (a 500, 502 or 429 included, for every method): only a
     * call that never reached the computer (the connection could not be opened)
     * is sent again. Sending it again after an answer would run the script again.
     */
    retries?: number | undefined;
    /** Context handed to request middleware. */
    middlewareContext?: Record<string, unknown> | undefined;
}
export interface ExecDynamicServices {
    openapi: OpenapiService;
    scripts?: ScriptsService | undefined;
}
/**
 * Clear the in-memory discovery cache (useful after script writes/deletes).
 * With `templateVars`, only entries for that computer (+ serviceIndex) are
 * dropped, for every client; without, everything is.
 */
export declare function clearCallableScriptsCache(templateVars?: Record<string, string | number>): void;
declare module '../generated/exec/exec.service.js' {
    interface ExecService {
        /**
         * List the user scripts the connected exec computer can run by name.
         * Results are cached in-memory for 5 minutes.
         *
         * `services` is only for a caller that holds the discovery services apart from the
         * `exec` object; by default they are read from it.
         */
        listCallableScripts(options?: ListCallableScriptsOptions & {
            forceRefresh?: boolean;
            services?: ExecDynamicServices;
        }): Promise<CallableScript[]>;
        /**
         * Call a user script by name, using the discovered HTTP method.
         * The script must have been discovered first (or will be auto-discovered).
         */
        call<TResponse = unknown>(scriptNameOrPath: string, params?: Record<string, unknown>, options?: CallScriptOptions & {
            services?: ExecDynamicServices;
        }): Promise<ApiResponse<TResponse>>;
    }
}
/** Installs `listCallableScripts()` and `call()` on the generated exec service. Runs once: a second call does nothing. */
export declare function patchExecDynamicClientPrototype(): void;
