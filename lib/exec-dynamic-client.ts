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

import { ExecService } from '../generated/exec/exec.service.js';
import { ScriptsService } from '../generated/exec/scripts.service.js';
import type { OpenapiService } from '../generated/exec/openapi.service.js';
import type { ApiResponse } from '../generated/types.js';
import {
  listCallableScripts as listCallableScriptsCore,
  type CallableScript,
  type ListCallableScriptsOptions,
} from './exec-dynamic-discovery.js';
import { assertBasePath } from './exec-path-utils.js';
import { dispatchExecScript, type ExecScriptCallOptions } from './exec-script-execution.js';

// Re-export for consumers
export type { CallableScript, CallableScriptParam, ListCallableScriptsOptions, CallableScriptsCache } from './exec-dynamic-discovery.js';
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

// ─── In-Memory Cache (for long-lived SDK processes) ──────────────────────────
//
// Partitioned by the discovery service instance (a WeakMap, so a dropped
// client takes its cache with it) and, inside it, by the endpoint that
// discovery resolves to. A computer-scoped service carries its computer in
// its own default template variables, so two `withComputer()` boxes — or two
// clients for different accounts — never share an entry. An explicit
// `templateVars` override resolves to a different endpoint and so to a
// different entry of the same service.

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  scripts: CallableScript[];
  fetchedAt: number;
  ttlMs: number;
  /** Sequence number at write time; compared against clear markers. */
  seq: number;
  /** `${computerId}:${serviceIndex}` of the resolved endpoint. */
  computerKey: string;
}

const memoryCache = new WeakMap<object, Map<string, CacheEntry>>();
let cacheSeq = 0;
let clearedAllAt = 0;
const clearedComputerAt = new Map<string, number>();

function computerKeyOf(vars: Record<string, unknown>): string {
  const computerId = vars.computerId ?? vars.computer_id ?? '';
  const serviceIndex = vars.serviceIndex ?? vars.service_index ?? '1';
  return `${String(computerId)}:${String(serviceIndex)}`;
}

function resolveCachePartition(
  services: ExecDynamicServices,
  templateVars: Record<string, string | number> | undefined,
): { owner: object; key: string; computerKey: string } {
  const owner = services.openapi as unknown as object;
  const internals = owner as {
    buildTemplateUrl?: (p: string, v: Record<string, unknown>) => string;
    defaultUrlTemplateVariables?: Record<string, unknown>;
  };
  const vars = templateVars ?? {};
  let endpoint: string;
  try {
    endpoint = typeof internals.buildTemplateUrl === 'function'
      ? internals.buildTemplateUrl('/', vars)
      : JSON.stringify(vars);
  } catch {
    endpoint = JSON.stringify(vars);
  }
  const merged = { ...(internals.defaultUrlTemplateVariables ?? {}), ...vars };
  return {
    owner,
    key: `${endpoint}|${services.scripts ? 'schemas' : 'no-schemas'}`,
    computerKey: computerKeyOf(merged),
  };
}

function getFromMemoryCache(owner: object, key: string): CallableScript[] | undefined {
  const partition = memoryCache.get(owner);
  const entry = partition?.get(key);
  if (!partition || !entry) return undefined;
  const clearedAt = Math.max(clearedAllAt, clearedComputerAt.get(entry.computerKey) ?? 0);
  if (entry.seq <= clearedAt || Date.now() - entry.fetchedAt > entry.ttlMs) {
    partition.delete(key);
    return undefined;
  }
  return entry.scripts;
}

function setMemoryCache(
  owner: object,
  key: string,
  computerKey: string,
  scripts: CallableScript[],
  ttlMs = DEFAULT_TTL_MS,
): void {
  let partition = memoryCache.get(owner);
  if (!partition) {
    partition = new Map();
    memoryCache.set(owner, partition);
  }
  partition.set(key, { scripts, fetchedAt: Date.now(), ttlMs, seq: ++cacheSeq, computerKey });
}

/**
 * Clear the in-memory discovery cache (useful after script writes/deletes).
 * With `templateVars`, only entries for that computer (+ serviceIndex) are
 * dropped, for every client; without, everything is.
 */
export function clearCallableScriptsCache(templateVars?: Record<string, string | number>): void {
  const marker = ++cacheSeq;
  if (templateVars) {
    clearedComputerAt.set(computerKeyOf(templateVars), marker);
  } else {
    clearedAllAt = marker;
    clearedComputerAt.clear();
  }
}

// ─── Module Augmentation ─────────────────────────────────────────────────────

declare module '../generated/exec/exec.service.js' {
  interface ExecService {
    /**
     * List the user scripts the connected exec computer can run by name.
     * Results are cached in-memory for 5 minutes.
     *
     * `services` is only for a caller that holds the discovery services apart from the
     * `exec` object; by default they are read from it.
     */
    listCallableScripts(
      options?: ListCallableScriptsOptions & { forceRefresh?: boolean; services?: ExecDynamicServices },
    ): Promise<CallableScript[]>;

    /**
     * Call a user script by name, using the discovered HTTP method.
     * The script must have been discovered first (or will be auto-discovered).
     */
    call<TResponse = unknown>(
      scriptNameOrPath: string,
      params?: Record<string, unknown>,
      options?: CallScriptOptions & { services?: ExecDynamicServices },
    ): Promise<ApiResponse<TResponse>>;
  }
}

/** The discovery services of an `exec` object: its own `openapi` and `scripts` children. */
function servicesOf(exec: ExecService, given?: ExecDynamicServices): ExecDynamicServices {
  if (given) return given;
  const children = exec as unknown as Partial<ExecDynamicServices>;
  if (!children.openapi) {
    throw new Error('exec.call and exec.listCallableScripts need the exec.openapi service; pass options.services when the exec object was built without it');
  }
  return { openapi: children.openapi, scripts: children.scripts };
}

// ─── Prototype Patching ──────────────────────────────────────────────────────

const EXEC_DYNAMIC_CLIENT_PATCH_MARKER = Symbol.for('hoody.sdk.exec.dynamic-client.patch');

/** Installs `listCallableScripts()` and `call()` on the generated exec service. Runs once: a second call does nothing. */
export function patchExecDynamicClientPrototype(): void {
  const prototype = ExecService.prototype as unknown as Record<string | symbol, unknown>;
  if (prototype[EXEC_DYNAMIC_CLIENT_PATCH_MARKER]) return;

  prototype['listCallableScripts'] = async function listCallableScripts(
    this: ExecService,
    options?: ListCallableScriptsOptions & { forceRefresh?: boolean; services?: ExecDynamicServices },
  ): Promise<CallableScript[]> {
    const services = servicesOf(this, options?.services);
    const { owner, key, computerKey } = resolveCachePartition(services, options?.templateVars);

    if (!options?.forceRefresh) {
      const cached = getFromMemoryCache(owner, key);
      if (cached) return cached;
    }

    const scripts = await listCallableScriptsCore(
      services.openapi,
      services.scripts,
      options,
    );

    setMemoryCache(owner, key, computerKey, scripts);
    return scripts;
  };

  prototype['call'] = async function call<TResponse = unknown>(
    this: ExecService,
    scriptNameOrPath: string,
    params: Record<string, unknown> = {},
    options?: CallScriptOptions & { services?: ExecDynamicServices },
  ): Promise<ApiResponse<TResponse>> {
    // Discover scripts to resolve name -> path + method
    const discoverOpts: ListCallableScriptsOptions & { services?: ExecDynamicServices } = {};
    if (options?.templateVars) discoverOpts.templateVars = options.templateVars;
    if (options?.signal) discoverOpts.signal = options.signal;
    if (options?.services) discoverOpts.services = options.services;
    const scripts = await this.listCallableScripts(discoverOpts);

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
    const normalizedMethod = String(options?.method ?? script.httpMethod ?? 'GET').toUpperCase();

    // Substitute path parameters (e.g., [id] -> actual value). Values are
    // substituted RAW and every segment is percent-encoded exactly once
    // below, so a value with a space, `%` or `/` reaches the script intact
    // (a `/` inside a value stays inside its one segment as %2F).
    const pathParamNames = new Set(script.parameters.filter((p) => p.isPathParam).map((p) => p.name));
    const missingPathParams: string[] = [];
    const execPath = script.scriptPath.split('/').map((segment) => encodeURIComponent(
      segment.replace(/\[([^\]]+)\]/g, (_match, paramName: string) => {
        const value = params[paramName];
        if (value === undefined || value === null) {
          missingPathParams.push(paramName);
          return `[${paramName}]`;
        }
        return String(value);
      }),
    )).join('/');

    if (missingPathParams.length > 0) {
      throw new Error(
        `Missing required path parameter(s): ${missingPathParams.join(', ')} for script "${scriptNameOrPath}"`,
      );
    }

    // Validate the resolved path using the robust multi-layer decoder
    assertBasePath(execPath, 'call');

    // Separate non-path params
    const execParams: Record<string, unknown> = {};
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
    const callOptions: ExecScriptCallOptions = {
      method: normalizedMethod as ExecScriptCallOptions['method'],
      ...(options?.templateVars ? { templateVars: options.templateVars as ExecScriptCallOptions['templateVars'] } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.headers ? { headers: options.headers } : {}),
      ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options?.retries !== undefined ? { retries: options.retries } : {}),
      ...(options?.middlewareContext ? { middlewareContext: options.middlewareContext } : {}),
      ...(hasParams ? (isQueryMethod ? { query: execParams } : { body: execParams }) : {}),
    };
    return dispatchExecScript<TResponse>(this, execPath, callOptions);
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
    // Clear all in-memory caches — we don't know which computer this belongs to
    clearCallableScriptsCache();
    return result;
  } as ScriptsService['write'];

  scriptsProto.delete = async function patchedDelete(
    this: ScriptsService,
    ...args: Parameters<ScriptsService['delete']>
  ) {
    const result = await originalDelete.apply(this, args);
    clearCallableScriptsCache();
    return result;
  } as ScriptsService['delete'];

  scriptsProto[SCRIPTS_INVALIDATION_MARKER] = true;
}

// Auto-invoke at import time
patchExecDynamicClientPrototype();
