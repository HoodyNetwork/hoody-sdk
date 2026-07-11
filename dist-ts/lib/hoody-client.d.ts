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
import { HoodyClient as GeneratedHoodyClient, type HoodyClientConfig, type ContainerLike } from '../generated/client.js';
import { ApiError } from '../generated/errors.js';
import './terminal-exec.js';
import './terminal-ssh.js';
import { type KitCatalogEntry, type KitCatalogOptions } from './kit-catalog.js';
import { type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';
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
export declare function patchHoodyClientMetrics<T extends GeneratedHoodyClient>(client: T): T;
export declare class HoodyClient extends GeneratedHoodyClient {
    /**
     * Promote a GeneratedHoodyClient instance into a fully-patched HoodyClient.
     *
     * The base class methods withContainer/withRealm return a GeneratedHoodyClient.
     * This helper swaps its prototype to HoodyClient.prototype so that the scoped
     * instance gains all HoodyClient overrides, then applies the metrics patches.
     * The prototype swap is a standard pattern for re-typing objects returned by
     * base-class factory methods without re-instantiating them.
     */
    private static asWrapped;
    constructor(config: HoodyClientConfig);
    static authenticate(baseURL: string, credentials: {
        username: string;
        password: string;
    }): Promise<HoodyClient>;
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    static getKitCatalog(options?: KitCatalogOptions): KitCatalogEntry[];
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    getKitCatalog(options?: KitCatalogOptions): KitCatalogEntry[];
    /**
     * Static list of known desktop environments for discoverability.
     * The `getDesktopUrl()` method accepts any string — this list is not exhaustive.
     */
    static getDesktopEnvironments(): string[];
    /**
     * Static list of known desktop environments for discoverability.
     */
    getDesktopEnvironments(): string[];
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
    getDesktopUrl(container: ContainerLike, options?: {
        serviceIndex?: number;
        desktopEnv?: string;
    }): string;
    withContainer(containerOrId: string | ContainerLike, options?: {
        kitAuth?: ProxyAuth | ProxyAuthPolicy;
        onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
    }): Promise<HoodyClient>;
    withRealm(realmId?: string): HoodyClient;
}
