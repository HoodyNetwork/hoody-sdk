/**
 * SDK client wrapper that patches the generated HoodyClient at runtime.
 *
 * The code-generated client returns raw API responses. This module wraps
 * selected async methods so their return values are post-processed (metrics
 * normalization) and augments several service prototypes with typed helpers.
 * Authentication, retries, and middleware (including `X-Hoody-Signature`
 * capture) remain the responsibility of the generated HttpClient surface.
 *
 * Patches applied on each client instance:
 *  - Metrics: wraps getStats (containers/projects) to normalize/humanize
 *    raw stats (see lib/metrics.ts).
 *  - ExecScriptsService prototype: Markdown/file helpers + defaults.
 *  - ExecScriptExecution prototype: typed helpers.
 *  - TerminalExec / TerminalSsh / ExecDynamicClient / Files prototypes.
 *
 * The HoodyClient subclass also overrides withContainer/withRealm so scoped
 * client instances inherit the same patches via prototype swap in asWrapped.
 */
import { HoodyClient as GeneratedHoodyClient, } from '../generated/client.js';
import { normalizeContainerStatsResponse, normalizeProjectStatsResponse, } from './metrics.js';
import { patchExecScriptsServicePrototype } from './exec-scripts.js';
import { patchExecScriptExecutionPrototype } from './exec-script-execution.js';
import { patchTerminalExecPrototype } from './terminal-exec.js';
import { patchTerminalSshPrototype } from './terminal-ssh.js';
import { patchExecDynamicClientPrototype } from './exec-dynamic-client.js';
import { patchFilesServiceExtensions } from './files-service-extensions.js';
// NOTE: patchScreenshotSavePrototype is called from index.ts (not here)
// to avoid circular-import TDZ errors in Bun.
import { getKitCatalogEntries } from './kit-catalog.js';
/**
 * Symbol-based idempotency guard.
 * Stored as a property on the client instance to prevent double-patching.
 * A Symbol is used (rather than a string key) so the marker is invisible to
 * JSON serialization and cannot collide with API-generated property names.
 */
const METRICS_PATCH_MARKER = Symbol('hoody.sdk.metrics.patch');
/**
 * Replace an async method on `target` with a wrapper that calls `transform`
 * on the resolved value before returning it.
 *
 * Pattern: target[methodName] = async (...args) => transform(await original(...args))
 *
 * This is the core mechanism used by patchHoodyClientMetrics to intercept
 * API responses for post-processing without modifying the generated client code.
 * Silently no-ops if target is undefined or the method does not exist.
 */
function wrapAsyncMethod(target, methodName, transform) {
    if (!target)
        return;
    const original = target[methodName];
    if (typeof original !== 'function')
        return;
    target[methodName] = async (...args) => {
        const result = await original.apply(target, args);
        try {
            return transform(result);
        }
        catch {
            // Transform failures must not surface as raw errors — return untransformed
            return result;
        }
    };
}
/**
 * Apply all runtime patches to a generated HoodyClient instance.
 *
 * Patch sequence:
 *  1. Patch ExecScriptsService prototype (one-time, idempotent via its own guard)
 *  2. Patch ExecScriptExecution prototype (one-time, idempotent via its own guard)
 *  3. Check METRICS_PATCH_MARKER on this instance; if already set, return early
 *  4. Wrap client.api.containers.getStats with normalizeContainerStatsResponse
 *  5. Wrap client.api.projects.getStats with normalizeProjectStatsResponse
 *  6. Set METRICS_PATCH_MARKER to prevent re-patching this instance
 */
export function patchHoodyClientMetrics(client) {
    patchExecScriptsServicePrototype();
    patchExecScriptExecutionPrototype();
    patchTerminalExecPrototype();
    patchTerminalSshPrototype();
    patchExecDynamicClientPrototype();
    patchFilesServiceExtensions();
    // patchScreenshotSavePrototype is called once from index.ts at module load time.
    const markerHost = client;
    if (markerHost[METRICS_PATCH_MARKER])
        return client;
    const api = client.api;
    const containers = api ? api.containers : undefined;
    const projects = api ? api.projects : undefined;
    wrapAsyncMethod(containers, 'getStats', normalizeContainerStatsResponse);
    wrapAsyncMethod(projects, 'getStats', normalizeProjectStatsResponse);
    markerHost[METRICS_PATCH_MARKER] = true;
    return client;
}
export class HoodyClient extends GeneratedHoodyClient {
    /**
     * Promote a GeneratedHoodyClient instance into a fully-patched HoodyClient.
     *
     * The base class methods withContainer/withRealm return a GeneratedHoodyClient.
     * This helper swaps its prototype to HoodyClient.prototype so that the scoped
     * instance gains all HoodyClient overrides, then applies the metrics patches.
     * The prototype swap is a standard pattern for re-typing objects returned by
     * base-class factory methods without re-instantiating them.
     */
    static asWrapped(client) {
        if (!(client instanceof HoodyClient)) {
            Object.setPrototypeOf(client, HoodyClient.prototype);
        }
        return patchHoodyClientMetrics(client);
    }
    constructor(config) {
        super(config);
        patchHoodyClientMetrics(this);
    }
    static async authenticate(baseURL, credentials) {
        const client = new HoodyClient({
            baseURL,
            credentials,
        });
        await client.login(credentials);
        return client;
    }
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    static getKitCatalog(options) {
        return getKitCatalogEntries(options);
    }
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    getKitCatalog(options) {
        return HoodyClient.getKitCatalog(options);
    }
    /**
     * Static list of known desktop environments for discoverability.
     * The `getDesktopUrl()` method accepts any string — this list is not exhaustive.
     */
    static getDesktopEnvironments() {
        return ['xfce', 'mate'];
    }
    /**
     * Static list of known desktop environments for discoverability.
     */
    getDesktopEnvironments() {
        return HoodyClient.getDesktopEnvironments();
    }
    /**
     * Build a desktop URL for a container. `desktop-{N}` is a public reverse-proxy
     * alias: the proxy injects the desktop/redirect query params and the terminal
     * kit 302s the browser to display-{N+OFFSET} (default OFFSET=1600 server-side).
     *
     * Net browser-visible navigation: `desktop-{N}` → `display-{N+OFFSET}`.
     *
     * @param container - Container object with project_id, id, and server fields.
     * @param options.serviceIndex - Desktop instance index (default: 1). Distinct
     *   from regular terminal indices — the proxy offsets internally.
     * @param options.desktopEnv - Desktop environment string (default: server-side
     *   xfce). Only appended to the URL when explicitly provided, so the proxy's
     *   default kicks in otherwise.
     */
    getDesktopUrl(container, options) {
        const baseUrl = this.getKitUrl('desktop', container, options?.serviceIndex ?? 1);
        const env = options?.desktopEnv;
        // Suppress when env matches the proxy default (xfce) — keeps the URL clean
        // and consistent with the CLI/workspaces helpers.
        if (!env || env === 'xfce')
            return baseUrl;
        return `${baseUrl}/?desktop_env=${encodeURIComponent(env)}`;
    }
    async withContainer(containerOrId, 
    // Mirror the generated base signature so callers can type-check
    // `onKitAuthExpired` without a cast. A narrower `{ kitAuth? }` type
    // would surface an excess-property error on the callback.
    options) {
        const scoped = await super.withContainer(containerOrId, options);
        return HoodyClient.asWrapped(scoped);
    }
    withRealm(realmId) {
        const scoped = super.withRealm(realmId);
        return HoodyClient.asWrapped(scoped);
    }
}
