/**
 * Exec Dynamic Client — High-level SDK API for discovering and calling user scripts.
 *
 * Extends the generated ExecService with `listCallableScripts()` and
 * `call()` via prototype patching (same pattern as exec-scripts.ts). Both reach
 * the inventory through the `openapi` and `scripts` services that sit on the
 * same `exec` object, so a container-scoped client needs no wiring.
 *
 * Usage:
 *   const scripts = await containerClient.exec.listCallableScripts();
 *   const result = await containerClient.exec.call('my-api', { name: 'foo' });
 */
import { ExecService } from '../generated/exec/exec.service.js';
import { ScriptsService } from '../generated/exec/scripts.service.js';
import { discoverScripts as discoverScriptsCore, } from './exec-dynamic-discovery.js';
import { assertBasePath } from './exec-path-utils.js';
import { dispatchExecScript } from './exec-script-execution.js';
export { scriptPathToName, isValidToolName, sanitizeDescription } from './exec-dynamic-discovery.js';
// ─── In-Memory Cache (for long-lived SDK processes) ──────────────────────────
//
// Partitioned by the discovery service instance (a WeakMap, so a dropped
// client takes its cache with it) and, inside it, by the endpoint that
// discovery resolves to. A container-scoped service carries its container in
// its own default template variables, so two `withContainer()` boxes — or two
// clients for different accounts — never share an entry. An explicit
// `templateVars` override resolves to a different endpoint and so to a
// different entry of the same service.
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const memoryCache = new WeakMap();
let cacheSeq = 0;
let clearedAllAt = 0;
const clearedContainerAt = new Map();
function containerKeyOf(vars) {
    const containerId = vars.containerId ?? vars.container_id ?? '';
    const serviceIndex = vars.serviceIndex ?? vars.service_index ?? '1';
    return `${String(containerId)}:${String(serviceIndex)}`;
}
function resolveCachePartition(services, templateVars) {
    const owner = services.openapi;
    const internals = owner;
    const vars = templateVars ?? {};
    let endpoint;
    try {
        endpoint = typeof internals.buildTemplateUrl === 'function'
            ? internals.buildTemplateUrl('/', vars)
            : JSON.stringify(vars);
    }
    catch {
        endpoint = JSON.stringify(vars);
    }
    const merged = { ...(internals.defaultUrlTemplateVariables ?? {}), ...vars };
    return {
        owner,
        key: `${endpoint}|${services.scripts ? 'schemas' : 'no-schemas'}`,
        containerKey: containerKeyOf(merged),
    };
}
function getFromMemoryCache(owner, key) {
    const partition = memoryCache.get(owner);
    const entry = partition?.get(key);
    if (!partition || !entry)
        return undefined;
    const clearedAt = Math.max(clearedAllAt, clearedContainerAt.get(entry.containerKey) ?? 0);
    if (entry.seq <= clearedAt || Date.now() - entry.fetchedAt > entry.ttlMs) {
        partition.delete(key);
        return undefined;
    }
    return entry.scripts;
}
function setMemoryCache(owner, key, containerKey, scripts, ttlMs = DEFAULT_TTL_MS) {
    let partition = memoryCache.get(owner);
    if (!partition) {
        partition = new Map();
        memoryCache.set(owner, partition);
    }
    partition.set(key, { scripts, fetchedAt: Date.now(), ttlMs, seq: ++cacheSeq, containerKey });
}
/**
 * Clear the in-memory discovery cache (useful after script writes/deletes).
 * With `templateVars`, only entries for that container (+ serviceIndex) are
 * dropped, for every client; without, everything is.
 */
export function clearDiscoveryCache(templateVars) {
    const marker = ++cacheSeq;
    if (templateVars) {
        clearedContainerAt.set(containerKeyOf(templateVars), marker);
    }
    else {
        clearedAllAt = marker;
        clearedContainerAt.clear();
    }
}
/** The discovery services of an `exec` object: its own `openapi` and `scripts` children. */
function servicesOf(exec, given) {
    if (given)
        return given;
    const children = exec;
    if (!children.openapi) {
        throw new Error('exec.call and exec.listCallableScripts need the exec.openapi service; pass options.services when the exec object was built without it');
    }
    return { openapi: children.openapi, scripts: children.scripts };
}
// ─── Prototype Patching ──────────────────────────────────────────────────────
const EXEC_DYNAMIC_CLIENT_PATCH_MARKER = Symbol.for('hoody.sdk.exec.dynamic-client.patch');
export function patchExecDynamicClientPrototype() {
    const prototype = ExecService.prototype;
    if (prototype[EXEC_DYNAMIC_CLIENT_PATCH_MARKER])
        return;
    prototype['listCallableScripts'] = async function listCallableScripts(options) {
        const services = servicesOf(this, options?.services);
        const { owner, key, containerKey } = resolveCachePartition(services, options?.templateVars);
        if (!options?.forceRefresh) {
            const cached = getFromMemoryCache(owner, key);
            if (cached)
                return cached;
        }
        const scripts = await discoverScriptsCore(services.openapi, services.scripts, options);
        setMemoryCache(owner, key, containerKey, scripts);
        return scripts;
    };
    prototype['call'] = async function call(scriptNameOrPath, params = {}, options) {
        // Discover scripts to resolve name -> path + method
        const discoverOpts = {};
        if (options?.templateVars)
            discoverOpts.templateVars = options.templateVars;
        if (options?.signal)
            discoverOpts.signal = options.signal;
        if (options?.services)
            discoverOpts.services = options.services;
        const scripts = await this.listCallableScripts(discoverOpts);
        // Find by name (exact match) or by scriptPath
        const script = scripts.find((s) => s.name === scriptNameOrPath || s.scriptPath === scriptNameOrPath || s.path === scriptNameOrPath);
        if (!script) {
            throw new Error(`Script "${scriptNameOrPath}" not found. Available: ${scripts.map((s) => s.name).join(', ') || '(none)'}`);
        }
        // Method: explicit override > discovered
        const normalizedMethod = String(options?.method ?? script.httpMethod ?? 'GET').toUpperCase();
        // Substitute path parameters (e.g., [id] -> actual value). Values are
        // substituted RAW and every segment is percent-encoded exactly once
        // below, so a value with a space, `%` or `/` reaches the script intact
        // (a `/` inside a value stays inside its one segment as %2F).
        const pathParamNames = new Set(script.parameters.filter((p) => p.isPathParam).map((p) => p.name));
        const missingPathParams = [];
        const execPath = script.scriptPath.split('/').map((segment) => encodeURIComponent(segment.replace(/\[([^\]]+)\]/g, (_match, paramName) => {
            const value = params[paramName];
            if (value === undefined || value === null) {
                missingPathParams.push(paramName);
                return `[${paramName}]`;
            }
            return String(value);
        }))).join('/');
        if (missingPathParams.length > 0) {
            throw new Error(`Missing required path parameter(s): ${missingPathParams.join(', ')} for script "${scriptNameOrPath}"`);
        }
        // Validate the resolved path using the robust multi-layer decoder
        assertBasePath(execPath, 'call');
        // Separate non-path params
        const execParams = {};
        for (const [k, v] of Object.entries(params)) {
            if (!pathParamNames.has(k)) {
                execParams[k] = v;
            }
        }
        // GET/HEAD: the remaining params are a real query string. Every other
        // method sends them as the JSON body. Both go through the service's own
        // HttpClient, so kitAuth, retries, middleware and ApiError apply.
        const isQueryMethod = normalizedMethod === 'GET' || normalizedMethod === 'HEAD';
        const hasParams = Object.keys(execParams).length > 0;
        const callOptions = {
            method: normalizedMethod,
            ...(options?.templateVars ? { templateVars: options.templateVars } : {}),
            ...(options?.signal ? { signal: options.signal } : {}),
            ...(options?.headers ? { headers: options.headers } : {}),
            ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
            ...(options?.retries !== undefined ? { retries: options.retries } : {}),
            ...(options?.middlewareContext ? { middlewareContext: options.middlewareContext } : {}),
            ...(hasParams ? (isQueryMethod ? { query: execParams } : { body: execParams }) : {}),
        };
        return dispatchExecScript(this, execPath, callOptions);
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
