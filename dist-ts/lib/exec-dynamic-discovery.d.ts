/**
 * Exec Dynamic Discovery — SDK-side runtime discovery of user scripts on exec
 * computers. Fetches the script inventory via `openapi.listScripts()` and parses
 * each entry's metadata (HTTP method, parameters, tags) into
 * `CallableScript` objects consumed by SDK callers and agent surfaces.
 *
 * Security:
 *   - Script names sanitized to [a-z0-9-], max 64 chars
 *   - Schema bombs rejected: max 20 params, max 10KB schema
 *   - No .md companion content is included (prompt injection vector)
 *   - Path traversal prevented via assertBasePath
 */
import type { OpenapiService } from '../generated/exec/openapi.service.js';
import type { ScriptsService } from '../generated/exec/scripts.service.js';
export declare const MAX_PARAMS_PER_SCRIPT = 20;
export declare const MAX_SCHEMA_SIZE_BYTES = 10240;
export declare const MAX_TOOL_NAME_LENGTH = 64;
export interface CallableScript {
    name: string;
    path: string;
    label?: string | undefined;
    description?: string | undefined;
    tags?: string[] | undefined;
    httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    scriptPath: string;
    parameters: CallableScriptParam[];
    hasRequestBody: boolean;
    requestBodySchema?: Record<string, unknown> | undefined;
    responseSchema?: Record<string, unknown> | undefined;
    outputMode?: 'table' | 'detail' | 'value' | 'json' | undefined;
    tableColumns?: Array<{
        field: string;
        header: string;
        width?: number;
    }> | undefined;
}
export interface CallableScriptParam {
    name: string;
    flag: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    description?: string | undefined;
    defaultValue?: unknown;
    choices?: string[] | undefined;
    isPathParam: boolean;
    isQueryParam: boolean;
    isBodyParam: boolean;
}
export interface CallableScriptsCache {
    version: number;
    computerId: string;
    fetchedAt: string;
    ttlMs: number;
    scripts: CallableScript[];
}
export interface ListCallableScriptsOptions {
    signal?: AbortSignal | undefined;
    /** Template vars for exec computer URL resolution */
    templateVars?: Record<string, string | number> | undefined;
}
/**
 * Convert a script file path to a CLI-friendly kebab-case name.
 * Examples:
 *   "api/users.ts" -> "api-users"
 *   "api/users/[id].ts" -> "api-users-id"
 *   "health.ts" -> "health"
 */
export declare function scriptPathToName(path: string): string;
/**
 * Validate a tool name against the allowed pattern.
 */
export declare function isValidToolName(name: string): boolean;
/**
 * Extract parameters from a JSON Schema `properties` object.
 * Respects the MAX_PARAMS_PER_SCRIPT limit.
 */
export declare function extractParamsFromSchema(schema: Record<string, unknown> | undefined, httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'): CallableScriptParam[];
/**
 * Extract path parameters from file-based routing patterns.
 * Example: "api/users/[id].ts" yields a path param "id".
 */
export declare function extractPathParams(scriptPath: string): CallableScriptParam[];
/**
 * Sanitize text for use in tool descriptions.
 * Strips control characters, escape sequences, and HTML tags.
 * Max 200 chars.
 */
export declare function sanitizeDescription(text: string | undefined): string | undefined;
/**
 * Discover user scripts from an exec computer.
 *
 * Calls `openapi.listScripts()` to get the script inventory, then enriches
 * each entry with schema information where available.
 *
 * For scripts that declare `hasSchema: true` but don't include inline schema,
 * this function loads the companion `.schema.json` via the ScriptsService
 * before delegating to the shared parser. The raw-response adapter in
 * `exec-dynamic-discovery-cli.ts` is the variant used when only the raw
 * `openapi.listScripts` response is available (no ScriptsService handle) and
 * therefore skips this enrichment step.
 */
export declare function listCallableScripts(openapiService: OpenapiService, scriptsService: ScriptsService | undefined, options?: ListCallableScriptsOptions): Promise<CallableScript[]>;
