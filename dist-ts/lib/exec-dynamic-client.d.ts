/**
 * Exec Dynamic Client — High-level SDK API for discovering and calling user scripts.
 *
 * Extends the generated ScriptExecutionService with `discoverScripts()` and
 * `callScript()` via prototype patching (same pattern as exec-scripts.ts).
 *
 * Usage:
 *   const scripts = await containerClient.exec.execution.discoverScripts();
 *   const result = await containerClient.exec.execution.callScript('my-api', { name: 'foo' });
 */
import { ScriptsService } from '../generated/exec/scripts.service.js';
import type { UserOpenapiService } from '../generated/exec/user-openapi.service.js';
import type { ApiResponse } from '../generated/types.js';
import { type DiscoveredScript, type DiscoverOptions } from './exec-dynamic-discovery.js';
export type { DiscoveredScript, DiscoveredParam, DiscoverOptions, DiscoveryCache } from './exec-dynamic-discovery.js';
export { scriptPathToName, isValidToolName, sanitizeDescription } from './exec-dynamic-discovery.js';
export interface CallScriptOptions {
    /**
     * Explicit method override. Matches the full set `callScript` can dispatch;
     * when omitted, the discovered method for the script is used.
     */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined;
    signal?: AbortSignal | undefined;
    templateVars?: Record<string, string | number> | undefined;
}
export interface ExecDynamicServices {
    openapi: UserOpenapiService;
    scripts?: ScriptsService | undefined;
}
/** Clear the in-memory discovery cache (useful after script writes/deletes). */
export declare function clearDiscoveryCache(templateVars?: Record<string, string | number>): void;
declare module '../generated/exec/script-execution.service.js' {
    interface ScriptExecutionService {
        /**
         * Discover all user scripts on the connected exec container.
         * Results are cached in-memory for 5 minutes.
         */
        discoverScripts(services: ExecDynamicServices, options?: DiscoverOptions & {
            forceRefresh?: boolean;
        }): Promise<DiscoveredScript[]>;
        /**
         * Call a user script by name, using the discovered HTTP method.
         * The script must have been discovered first (or will be auto-discovered).
         */
        callScript<TResponse = unknown>(scriptNameOrPath: string, params: Record<string, unknown>, services: ExecDynamicServices, options?: CallScriptOptions): Promise<ApiResponse<TResponse>>;
    }
}
export declare function patchExecDynamicClientPrototype(): void;
