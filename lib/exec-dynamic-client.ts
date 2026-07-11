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
import type { UserOpenapiService } from '../generated/exec/user-openapi.service.js';
import type { ApiResponse } from '../generated/types.js';
import {
  discoverScripts as discoverScriptsCore,
  type DiscoveredScript,
  type DiscoverOptions,
} from './exec-dynamic-discovery.js';
import { assertBasePath } from './exec-path-utils.js';

// Re-export for consumers
export type { DiscoveredScript, DiscoveredParam, DiscoverOptions, DiscoveryCache } from './exec-dynamic-discovery.js';
export { scriptPathToName, isValidToolName, sanitizeDescription } from './exec-dynamic-discovery.js';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── In-Memory Cache (for long-lived SDK processes) ──────────────────────────

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  scripts: DiscoveredScript[];
  fetchedAt: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry>();

function getCacheKey(templateVars?: Record<string, string | number>): string {
  if (!templateVars) return 'default';
  const containerId = templateVars.containerId ?? templateVars.container_id ?? '';
  const serviceIndex = templateVars.serviceIndex ?? templateVars.service_index ?? '1';
  return `${containerId}:${serviceIndex}`;
}

function getFromMemoryCache(key: string): DiscoveredScript[] | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > entry.ttlMs) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.scripts;
}

function setMemoryCache(key: string, scripts: DiscoveredScript[], ttlMs = DEFAULT_TTL_MS): void {
  memoryCache.set(key, { scripts, fetchedAt: Date.now(), ttlMs });
}

/** Clear the in-memory discovery cache (useful after script writes/deletes). */
export function clearDiscoveryCache(templateVars?: Record<string, string | number>): void {
  if (templateVars) {
    memoryCache.delete(getCacheKey(templateVars));
  } else {
    memoryCache.clear();
  }
}

// ─── Module Augmentation ─────────────────────────────────────────────────────

declare module '../generated/exec/script-execution.service.js' {
  interface ScriptExecutionService {
    /**
     * Discover all user scripts on the connected exec container.
     * Results are cached in-memory for 5 minutes.
     */
    discoverScripts(
      services: ExecDynamicServices,
      options?: DiscoverOptions & { forceRefresh?: boolean },
    ): Promise<DiscoveredScript[]>;

    /**
     * Call a user script by name, using the discovered HTTP method.
     * The script must have been discovered first (or will be auto-discovered).
     */
    callScript<TResponse = unknown>(
      scriptNameOrPath: string,
      params: Record<string, unknown>,
      services: ExecDynamicServices,
      options?: CallScriptOptions,
    ): Promise<ApiResponse<TResponse>>;
  }
}

// ─── Prototype Patching ──────────────────────────────────────────────────────

const EXEC_DYNAMIC_CLIENT_PATCH_MARKER = Symbol.for('hoody.sdk.exec.dynamic-client.patch');

export function patchExecDynamicClientPrototype(): void {
  const prototype = ScriptExecutionService.prototype as ScriptExecutionService & Record<string | symbol, unknown>;
  if (prototype[EXEC_DYNAMIC_CLIENT_PATCH_MARKER]) return;

  prototype.discoverScripts = async function discoverScripts(
    this: ScriptExecutionService,
    services: ExecDynamicServices,
    options?: DiscoverOptions & { forceRefresh?: boolean },
  ): Promise<DiscoveredScript[]> {
    const cacheKey = getCacheKey(options?.templateVars);

    if (!options?.forceRefresh) {
      const cached = getFromMemoryCache(cacheKey);
      if (cached) return cached;
    }

    const scripts = await discoverScriptsCore(
      services.openapi,
      services.scripts,
      options,
    );

    setMemoryCache(cacheKey, scripts);
    return scripts;
  };

  prototype.callScript = async function callScript<TResponse = unknown>(
    this: ScriptExecutionService,
    scriptNameOrPath: string,
    params: Record<string, unknown>,
    services: ExecDynamicServices,
    options?: CallScriptOptions,
  ): Promise<ApiResponse<TResponse>> {
    // Discover scripts to resolve name -> path + method
    const discoverOpts: DiscoverOptions = {};
    if (options?.templateVars) discoverOpts.templateVars = options.templateVars;
    if (options?.signal) discoverOpts.signal = options.signal;
    const scripts = await this.discoverScripts(services, discoverOpts);

    // Find by name (exact match) or by scriptPath
    const script = scripts.find(
      (s) => s.name === scriptNameOrPath || s.scriptPath === scriptNameOrPath || s.path === scriptNameOrPath,
    );

    if (!script) {
      throw new Error(
        `Script "${scriptNameOrPath}" not found. Available: ${scripts.map((s) => s.name).join(', ') || '(none)'}`,
      );
    }

    // Method: explicit override > discovered
    const method = options?.method ?? script.httpMethod;
    const templateVars = options?.templateVars as Parameters<ScriptExecutionService['execute']>[1];
    const requestOptions = options?.signal ? { signal: options.signal } : undefined;

    // Substitute path parameters (e.g., [id] -> actual value)
    const pathParamNames = new Set(script.parameters.filter((p) => p.isPathParam).map((p) => p.name));
    const missingPathParams: string[] = [];
    let execPath = script.scriptPath.replace(/\[([^\]]+)\]/g, (_match, paramName: string) => {
      const value = params[paramName];
      if (value === undefined || value === null) {
        missingPathParams.push(paramName);
        return `[${paramName}]`;
      }
      return encodeURIComponent(String(value));
    });

    if (missingPathParams.length > 0) {
      throw new Error(
        `Missing required path parameter(s): ${missingPathParams.join(', ')} for script "${scriptNameOrPath}"`,
      );
    }

    // Validate the resolved path using the robust multi-layer decoder
    assertBasePath(execPath, 'callScript');

    // Separate non-path params
    const execParams: Record<string, unknown> = {};
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
      return this.execute(execPath, templateVars, requestOptions) as Promise<ApiResponse<TResponse>>;
    }

    // Body-methods dispatch directly through the underlying HTTP client.
    // `this.http` is protected on the generated base class; we access it
    // intentionally here to honor the declared method + body without duplicating
    // the generator's URL-template + middleware plumbing.
    const builtUrl = (this as unknown as {
      buildTemplateUrl?: (p: string, v: Record<string, unknown>) => string;
    }).buildTemplateUrl?.(`/${encodeURI(execPath).replace(/^\//, '')}`, (templateVars ?? {}) as Record<string, unknown>)
      ?? `/${execPath.replace(/^\//, '')}`;
    const requestUrl = builtUrl.replace('{path}', () => encodeURIComponent(execPath));
    const requestData: Record<string, unknown> = {};
    if (Object.keys(execParams).length > 0) requestData.body = execParams;
    if (options?.signal) requestData.signal = options.signal;
    const httpAny = (this as unknown as { http: Record<string, (...args: unknown[]) => Promise<unknown>> }).http;
    const verb = normalizedMethod.toLowerCase() as 'post' | 'put' | 'patch' | 'delete';
    return httpAny[verb]!(requestUrl, requestData) as Promise<ApiResponse<TResponse>>;
  };

  prototype[EXEC_DYNAMIC_CLIENT_PATCH_MARKER] = true;

  // ─── Auto-invalidation: patch ScriptsService to clear cache on write/delete ──
  patchScriptsServiceForInvalidation();
}

const SCRIPTS_INVALIDATION_MARKER = Symbol.for('hoody.sdk.exec.scripts.invalidation.patch');

function patchScriptsServiceForInvalidation(): void {
  const scriptsProto = ScriptsService.prototype as ScriptsService & Record<string | symbol, unknown>;
  if (scriptsProto[SCRIPTS_INVALIDATION_MARKER]) return;

  const originalWrite = scriptsProto.write as ScriptsService['write'];
  const originalDelete = scriptsProto.delete as ScriptsService['delete'];

  scriptsProto.write = async function patchedWrite(
    this: ScriptsService,
    ...args: Parameters<ScriptsService['write']>
  ) {
    const result = await originalWrite.apply(this, args);
    // Clear all in-memory caches — we don't know which container this belongs to
    clearDiscoveryCache();
    return result;
  } as ScriptsService['write'];

  scriptsProto.delete = async function patchedDelete(
    this: ScriptsService,
    ...args: Parameters<ScriptsService['delete']>
  ) {
    const result = await originalDelete.apply(this, args);
    clearDiscoveryCache();
    return result;
  } as ScriptsService['delete'];

  scriptsProto[SCRIPTS_INVALIDATION_MARKER] = true;
}

// Auto-invoke at import time
patchExecDynamicClientPrototype();
