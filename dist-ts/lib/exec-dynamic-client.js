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
import { ScriptExecutionService } from '../generated/exec/script-execution.service.js';
import { ScriptsService } from '../generated/exec/scripts.service.js';
import { discoverScripts as discoverScriptsCore, } from './exec-dynamic-discovery.js';
import { assertBasePath } from './exec-path-utils.js';
export { scriptPathToName, isValidToolName, sanitizeDescription } from './exec-dynamic-discovery.js';
// ─── In-Memory Cache (for long-lived SDK processes) ──────────────────────────
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const memoryCache = new Map();
function getCacheKey(templateVars) {
    if (!templateVars)
        return 'default';
    const containerId = templateVars.containerId ?? templateVars.container_id ?? '';
    const serviceIndex = templateVars.serviceIndex ?? templateVars.service_index ?? '1';
    return `${containerId}:${serviceIndex}`;
}
function getFromMemoryCache(key) {
    const entry = memoryCache.get(key);
    if (!entry)
        return undefined;
    if (Date.now() - entry.fetchedAt > entry.ttlMs) {
        memoryCache.delete(key);
        return undefined;
    }
    return entry.scripts;
}
function setMemoryCache(key, scripts, ttlMs = DEFAULT_TTL_MS) {
    memoryCache.set(key, { scripts, fetchedAt: Date.now(), ttlMs });
}
/** Clear the in-memory discovery cache (useful after script writes/deletes). */
export function clearDiscoveryCache(templateVars) {
    if (templateVars) {
        memoryCache.delete(getCacheKey(templateVars));
    }
    else {
        memoryCache.clear();
    }
}
// ─── Prototype Patching ──────────────────────────────────────────────────────
const EXEC_DYNAMIC_CLIENT_PATCH_MARKER = Symbol.for('hoody.sdk.exec.dynamic-client.patch');
export function patchExecDynamicClientPrototype() {
    const prototype = ScriptExecutionService.prototype;
    if (prototype[EXEC_DYNAMIC_CLIENT_PATCH_MARKER])
        return;
    prototype.discoverScripts = async function discoverScripts(services, options) {
        const cacheKey = getCacheKey(options?.templateVars);
        if (!options?.forceRefresh) {
            const cached = getFromMemoryCache(cacheKey);
            if (cached)
                return cached;
        }
        const scripts = await discoverScriptsCore(services.openapi, services.scripts, options);
        setMemoryCache(cacheKey, scripts);
        return scripts;
    };
    prototype.callScript = async function callScript(scriptNameOrPath, params, services, options) {
        // Discover scripts to resolve name -> path + method
        const discoverOpts = {};
        if (options?.templateVars)
            discoverOpts.templateVars = options.templateVars;
        if (options?.signal)
            discoverOpts.signal = options.signal;
        const scripts = await this.discoverScripts(services, discoverOpts);
        // Find by name (exact match) or by scriptPath
        const script = scripts.find((s) => s.name === scriptNameOrPath || s.scriptPath === scriptNameOrPath || s.path === scriptNameOrPath);
        if (!script) {
            throw new Error(`Script "${scriptNameOrPath}" not found. Available: ${scripts.map((s) => s.name).join(', ') || '(none)'}`);
        }
        // Method: explicit override > discovered
        const method = options?.method ?? script.httpMethod;
        const templateVars = options?.templateVars;
        const requestOptions = options?.signal ? { signal: options.signal } : undefined;
        // Substitute path parameters (e.g., [id] -> actual value)
        const pathParamNames = new Set(script.parameters.filter((p) => p.isPathParam).map((p) => p.name));
        const missingPathParams = [];
        let execPath = script.scriptPath.replace(/\[([^\]]+)\]/g, (_match, paramName) => {
            const value = params[paramName];
            if (value === undefined || value === null) {
                missingPathParams.push(paramName);
                return `[${paramName}]`;
            }
            return encodeURIComponent(String(value));
        });
        if (missingPathParams.length > 0) {
            throw new Error(`Missing required path parameter(s): ${missingPathParams.join(', ')} for script "${scriptNameOrPath}"`);
        }
        // Validate the resolved path using the robust multi-layer decoder
        assertBasePath(execPath, 'callScript');
        // Separate non-path params
        const execParams = {};
        for (const [k, v] of Object.entries(params)) {
            if (!pathParamNames.has(k)) {
                execParams[k] = v;
            }
        }
        // Dispatch shape depends on the resolved method: GET goes through the
        // generated `execute()` (GET-only) so URL templating + request options
        // match the rest of the generated client surface; POST/PUT/PATCH/DELETE
        // bypass `execute()` and dispatch directly via the HTTP client so both
        // the method and the request body reach the server.
        const normalizedMethod = String(method ?? 'GET').toUpperCase();
        const isBodyMethod = normalizedMethod === 'POST' || normalizedMethod === 'PUT' || normalizedMethod === 'PATCH' || normalizedMethod === 'DELETE';
        if (!isBodyMethod) {
            const queryEntries = Object.entries(execParams).filter(([, v]) => v !== undefined && v !== null);
            if (queryEntries.length > 0) {
                const qs = queryEntries
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
                    .join('&');
                execPath = `${execPath}?${qs}`;
            }
            return this.execute(execPath, templateVars, requestOptions);
        }
        // Body-methods dispatch directly through the underlying HTTP client.
        // `this.http` is protected on the generated base class; we access it
        // intentionally here to honor the declared method + body without duplicating
        // the generator's URL-template + middleware plumbing.
        const builtUrl = this.buildTemplateUrl?.(`/${encodeURI(execPath).replace(/^\//, '')}`, (templateVars ?? {}))
            ?? `/${execPath.replace(/^\//, '')}`;
        const requestUrl = builtUrl.replace('{path}', () => encodeURIComponent(execPath));
        const requestData = {};
        if (Object.keys(execParams).length > 0)
            requestData.body = execParams;
        if (options?.signal)
            requestData.signal = options.signal;
        const httpAny = this.http;
        const verb = normalizedMethod.toLowerCase();
        return httpAny[verb](requestUrl, requestData);
    };
    prototype[EXEC_DYNAMIC_CLIENT_PATCH_MARKER] = true;
    // ─── Auto-invalidation: patch ScriptsService to clear cache on write/delete ──
    patchScriptsServiceForInvalidation();
}
const SCRIPTS_INVALIDATION_MARKER = Symbol.for('hoody.sdk.exec.scripts.invalidation.patch');
function patchScriptsServiceForInvalidation() {
    const scriptsProto = ScriptsService.prototype;
    if (scriptsProto[SCRIPTS_INVALIDATION_MARKER])
        return;
    const originalWrite = scriptsProto.write;
    const originalDelete = scriptsProto.delete;
    scriptsProto.write = async function patchedWrite(...args) {
        const result = await originalWrite.apply(this, args);
        // Clear all in-memory caches — we don't know which container this belongs to
        clearDiscoveryCache();
        return result;
    };
    scriptsProto.delete = async function patchedDelete(...args) {
        const result = await originalDelete.apply(this, args);
        clearDiscoveryCache();
        return result;
    };
    scriptsProto[SCRIPTS_INVALIDATION_MARKER] = true;
}
// Auto-invoke at import time
patchExecDynamicClientPrototype();
