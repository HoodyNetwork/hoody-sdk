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
 *  - ExecService prototype: `run` with method/body/query, `call`, `listCallableScripts`, `connect`.
 *  - TerminalExec / TerminalSsh / ExecDynamicClient / Files prototypes.
 *  - sqlite.sql.query / run: SqlService prototype (lib/sqlite-helpers.ts).
 *
 * The HoodyClient subclass also overrides withContainer/withRealm so scoped
 * client instances inherit the same patches via prototype swap in asWrapped.
 */
import { HoodyClient as GeneratedHoodyClient, } from '../generated/client.js';
import { normalizeContainerStatsResponse, normalizeProjectStatsResponse, } from './metrics.js';
import { patchExecScriptsServicePrototype } from './exec-scripts.js';
import { patchExecScriptExecutionPrototype } from './exec-script-execution.js';
import { patchTerminalExecPrototype } from './terminal-exec.js';
import { installTerminalRun } from './terminal-run.js';
import { patchTerminalSshPrototype } from './terminal-ssh.js';
import { patchExecDynamicClientPrototype } from './exec-dynamic-client.js';
import { patchFilesServiceExtensions } from './files-service-extensions.js';
import { patchExecRemotePrototype } from './exec-remote.js';
import { patchSqliteHelpersPrototype } from './sqlite-helpers.js';
import { patchKvHelpersPrototype } from './kv-helpers.js';
import { patchPipeServiceHelpers } from './pipe-service-helpers.js';
import { claimOwnedServices, ownerOf } from './service-owner.js';
import { ProgramsService } from '../generated/daemon/programs.service.js';
// NOTE: patchScreenshotSavePrototype is called from index.ts (not here)
// to avoid circular-import TDZ errors in Bun.
import { listKits } from './kit-catalog.js';
import { EventsClient } from './events-client.js';
import { bumpEventsSession, detachEventsSession, eventsSessionOf, refileEventsSession, } from './events-session.js';
/**
 * `client.events`, one per client instance. A WeakMap rather than a field:
 * withRealm/withContainer promote base-class instances by prototype swap
 * (asWrapped), so no constructor of this class runs for them.
 */
const EVENTS_BY_CLIENT = new WeakMap();
/** Same key as TUNNEL_OWNER in lib/tunnel-service-extensions.ts, which this browser-shared module must not import. */
const TUNNEL_OWNER = Symbol.for('hoody.sdk.tunnel.owner');
/** Clients inside their own logout(): its finally bumps, so the endpoint hook below must not too. */
const IN_CLIENT_LOGOUT = new WeakSet();
const EVENTS_LOGOUT_HOOK = Symbol('hoody.sdk.events.logout-hook');
/**
 * A direct `client.api.auth.logoutAll()` ends the local session too
 * (the generated hook clears it once the server revoked it), so it must end
 * the events session like logout() does. Installed per instance,
 * over the generated hook, for constructed and prototype-swapped clients.
 */
function hookEventsLogout(client) {
    const auth = client.api?.auth;
    if (!auth || typeof auth.logoutAll !== 'function' || auth[EVENTS_LOGOUT_HOOK])
        return;
    const original = auth.logoutAll;
    auth.logoutAll = async (...args) => {
        const result = await original.apply(auth, args);
        if (!IN_CLIENT_LOGOUT.has(client))
            bumpEventsSession(client, 'shared');
        return result;
    };
    auth[EVENTS_LOGOUT_HOOK] = true;
}
/**
 * Whether this runtime's fetch has an http(s) base to resolve a relative URL
 * against, where an omitted baseURL means that origin: the document's base URL
 * in a page, the location in a worker, or only its origin (a blob: or data:
 * worker). It is the rule of the generated transports (_transportBase in
 * generated/client.ts and both HTTP clients), which are generator-emitted and
 * module-private; default-base-url.test.ts checks the two agree.
 */
function hasPage() {
    const g = globalThis;
    const candidates = [g.document ? g.document.baseURI : undefined, g.location ? g.location.href : undefined, g.location ? g.location.origin : undefined];
    return candidates.some((url) => typeof url === 'string' && /^https?:/i.test(url));
}
/**
 * The public account API, used when no baseURL was given, there is no page and
 * the environment names none. The domain is rewritten at deploy, like the
 * containers domain the generated client defaults to.
 */
const DEFAULT_BASE_URL = 'https://api.hoody.com';
/**
 * The config a client is constructed with, with the account API filled in
 * when no baseURL was given and there is no page: HOODY_BASE_URL, else
 * HOODY_API_URL (the variables the CLI reads), else the public API. It is read
 * as the account API unless the caller set target; a kit client gets no
 * built-in host, since no public kit URL exists without a container. Before
 * this an omitted base was '' and every account call failed with "fetch() URL
 * is invalid": nothing in a Hoody container or an exec script sets either
 * variable. On a page, and for any given baseURL, nothing changes.
 */
function withDefaultBaseURL(config) {
    if (config.baseURL || hasPage())
        return config;
    const env = typeof process !== 'undefined' ? process.env : undefined;
    const fromEnv = env?.HOODY_BASE_URL || env?.HOODY_API_URL;
    if (!fromEnv && config.target === 'kit')
        return config;
    return { ...config, baseURL: fromEnv || DEFAULT_BASE_URL, target: config.target ?? 'account' };
}
/**
 * The promise withContainer() returns, with each namespace of the client it
 * resolves to (`sqlite`, `files`, `exec`, ...) as a getter that throws: a
 * script that forgot `await` and read `hoody.withContainer(c).sqlite` got
 * `undefined` and failed further down the chain ("undefined is not an object").
 * Only names the client has and a Promise does not are guarded, as
 * non-enumerable properties of this one promise, so `await`, `then`, `catch`
 * and `finally` work as before.
 */
function guardPendingClient(pending, client) {
    for (const name of Object.keys(client)) {
        if (name in pending)
            continue;
        const value = client[name];
        if (value === null || (typeof value !== 'object' && typeof value !== 'function'))
            continue;
        Object.defineProperty(pending, name, {
            configurable: true,
            get() {
                throw new Error(`withContainer() returns a Promise: write \`const box = await hoody.withContainer(...)\`, then read box.${name}`);
            },
        });
    }
    return pending;
}
/** The program a ref names, read through the daemon kit the programs service talks to. */
async function programTerminalIdOf(programs, program) {
    let row;
    let label;
    if (typeof program === 'number' || (typeof program === 'object' && program !== null && 'id' in program)) {
        const id = typeof program === 'number' ? program : program.id;
        if (!Number.isInteger(id) || id < 0) {
            throw new TypeError(`program id must be a non-negative integer, got ${String(id)}`);
        }
        row = (await programs.get(id)).data.program;
        label = `program ${id}`;
    }
    else if (typeof program === 'object' && program !== null && typeof program.name === 'string' && program.name !== '') {
        const name = program.name;
        const { programs: found } = (await programs.list({ name })).data;
        // The daemon filters by exact name already; the check keeps that true here.
        const matches = (found ?? []).filter((p) => p.name === name);
        if (matches.length !== 1) {
            throw new Error(matches.length === 0
                ? `no program named "${name}"`
                : `${matches.length} programs are named "${name}"; pass { id } instead`);
        }
        row = matches[0];
        label = `program "${name}"`;
    }
    else {
        throw new TypeError('program must be an id, { id } or { name }');
    }
    const terminalId = row.terminal_id;
    if (typeof terminalId !== 'number' || !Number.isInteger(terminalId) || terminalId < 1 || terminalId > 65535) {
        throw new Error(`${label} has no terminal (its terminal_id is not set)`);
    }
    return terminalId;
}
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
 *  1. Patch the hand-written helpers onto the generated service prototypes (exec, terminal, files,
 *     sqlite, daemon, ...; one-time, each idempotent via its own guard)
 *  2. Stamp each service that hosts a helper with its owner (lib/service-owner.ts) and install
 *     `terminal.run` on this instance's terminal object
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
    patchExecRemotePrototype();
    patchSqliteHelpersPrototype();
    patchKvHelpersPrototype();
    patchPipeServiceHelpers();
    patchDaemonProgramsPrototype();
    // The helpers that live on a service read their client back from it.
    claimOwnedServices(client);
    // terminal is a per-instance object, so terminal.run is installed per instance.
    installTerminalRun(client);
    // box.tunnel.expose/pull/serve (lib/tunnel-service-extensions.ts, Node-only)
    // read the URL from the service and the kit credential from this client.
    const tunnelService = client.tunnel;
    if (tunnelService && !Object.prototype.hasOwnProperty.call(tunnelService, TUNNEL_OWNER)) {
        Object.defineProperty(tunnelService, TUNNEL_OWNER, { value: client });
    }
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
/** Attach to a daemon program's terminal (see `daemon.programs.attachTerminal`). */
async function attachProgramTerminalImpl(scoped, program, options = {}) {
    const terminalId = await programTerminalIdOf(scoped.daemon.programs, program);
    // The terminal is chosen by the HOST index: the containers proxy
    // overwrites a `terminal_id` query parameter from it.
    const ws = await scoped.terminal.sessions.connect(options.readonly !== undefined ? { readonly: options.readonly } : undefined, { serviceIndex: terminalId });
    return new Promise((resolve, reject) => {
        let state = 'pending';
        const firstFrameSubs = [];
        const fail = (code, reason) => {
            if (state !== 'pending')
                return;
            state = 'failed';
            for (const off of firstFrameSubs)
                off();
            // Stops the socket's own reconnect, which a 1006 would schedule.
            try {
                ws.disconnect();
            }
            catch { /* already closed */ }
            reject(Object.assign(new Error(`attach to terminal ${terminalId} failed (${code}${reason ? `: ${reason}` : ''})`), { code, reason }));
        };
        const attached = () => {
            if (state !== 'pending')
                return;
            state = 'attached';
            for (const off of firstFrameSubs)
                off();
            resolve({ terminalId, ws });
        };
        // Every handler goes on before connect(): a refusal closes the socket
        // right after the upgrade.
        if (options.onOutput)
            ws.onOutput(options.onOutput);
        ws.onDisconnect((code, reason) => {
            if (state === 'pending')
                fail(code, reason);
            else if (state === 'attached')
                options.onDisconnect?.(code, reason);
        });
        firstFrameSubs.push(ws.onOutput(attached), ws.onSetWindowTitle(attached), ws.onSetPreferences(attached), ws.onSetTerminalId(attached), ws.onSetShellType(attached), ws.onUnknownFrame(attached));
        // The handshake goes out from the open event itself. A socket the
        // server closes at once is already closing by the time connect()
        // resolves, and its close (with the real code) is what rejects. Once
        // only: on a reconnect the socket replays the handshake itself.
        const offConnect = ws.onConnect(() => {
            offConnect();
            try {
                ws.sendJsonData({ command: '{', columns: options.columns ?? 80, rows: options.rows ?? 24 });
            }
            catch { /* closing: the disconnect handler reports it */ }
        });
        ws.connect().catch((err) => fail(1006, err instanceof Error ? err.message : String(err)));
    });
}
const DAEMON_PROGRAMS_PATCH_MARKER = Symbol.for('hoody.sdk.daemon.programs.extensions');
/**
 * Attach `getTerminalId` and `attachTerminal` to ProgramsService.prototype (idempotent).
 * Both need a container-scoped client: its daemon kit for the lookup, its terminal kit for the socket.
 */
export function patchDaemonProgramsPrototype() {
    const proto = ProgramsService.prototype;
    if (proto[DAEMON_PROGRAMS_PATCH_MARKER])
        return;
    proto['getTerminalId'] = function getTerminalId(program) {
        return programTerminalIdOf(this, program);
    };
    proto['attachTerminal'] = function attachTerminal(program, options) {
        return attachProgramTerminalImpl(ownerOf(this, 'daemon.programs.attachTerminal'), program, options);
    };
    proto[DAEMON_PROGRAMS_PATCH_MARKER] = true;
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
        hookEventsLogout(client);
        return patchHoodyClientMetrics(client);
    }
    constructor(config) {
        super(withDefaultBaseURL(config));
        hookEventsLogout(this);
        patchHoodyClientMetrics(this);
    }
    /**
     * Identify the account with either `username` or `email` (see
     * HoodyCredentials) — the server rejects the wrong field for the value.
     *
     * Resolves only with a logged-in client. An account with two-factor
     * authentication rejects with `TwoFactorRequiredError`; `await
     * error.complete(code)` finishes the login and resolves to that client.
     */
    static async login(baseURL, credentials) {
        const client = new HoodyClient({
            baseURL,
            credentials,
        });
        await client.loginForSession(credentials);
        return client;
    }
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    static listKits(options) {
        return listKits(options);
    }
    /**
     * Return static catalog metadata for supported Hoody Kit slugs.
     */
    listKits(options) {
        return HoodyClient.listKits(options);
    }
    /**
     * Static list of known desktop environments for discoverability.
     * The `getDesktopUrl()` method accepts any string — this list is not exhaustive.
     */
    static listDesktopEnvironments() {
        return ['xfce', 'mate'];
    }
    /**
     * Static list of known desktop environments for discoverability.
     */
    listDesktopEnvironments() {
        return HoodyClient.listDesktopEnvironments();
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
    withContainer(containerOrId, 
    // Mirror the generated base signature so callers can type-check
    // `onKitAuthExpired` without a cast. A narrower `{ kitAuth? }` type
    // would surface an excess-property error on the callback.
    options) {
        const pending = super.withContainer(containerOrId, options).then((scoped) => HoodyClient.asWrapped(scoped));
        return guardPendingClient(pending, this);
    }
    withRealm(realmId) {
        const scoped = super.withRealm(realmId);
        return HoodyClient.asWrapped(scoped);
    }
    /**
     * Real-time events of this client's account (or of its realm, on a
     * `withRealm` client): live delivery, recovery from history after a
     * disconnect, and waits. Created on first use; each client instance has
     * its own stream. `api.events` stays the REST history.
     */
    get events() {
        let events = EVENTS_BY_CLIENT.get(this);
        if (!events) {
            const http = this.http;
            events = new EventsClient(this.api.events, undefined, undefined, {
                session: eventsSessionOf(this),
                // A client constructed with credentials logs in on first use.
                prepareCredential: () => this.getAuthToken(),
                // C5 scope_changed: a project's access changed, so cached GETs may
                // show what this account can no longer read.
                onScopeChanged: () => {
                    try {
                        http.clearCache?.();
                    }
                    catch { /* the cache is an optimisation */ }
                },
            });
            EVENTS_BY_CLIENT.set(this, events);
        }
        return events;
    }
    // Session changes end the events stream's session: the
    // socket closes and every buffer and cursor of the old session is dropped.
    // The bump runs after `super`, so the stream reconnects (when it still has
    // handlers) with the new session's token.
    async logout() {
        IN_CLIENT_LOGOUT.add(this);
        try {
            await super.logout();
        }
        finally {
            IN_CLIENT_LOGOUT.delete(this);
            bumpEventsSession(this, 'shared');
        }
    }
    // The generated logoutAll() clears the credentials even when the request fails, so the events
    // session ends either way. The endpoint hook bumps only after a successful revoke.
    async logoutAll() {
        IN_CLIENT_LOGOUT.add(this);
        try {
            await super.logoutAll();
        }
        finally {
            IN_CLIENT_LOGOUT.delete(this);
            bumpEventsSession(this, 'shared');
        }
    }
    setSessionToken(token) {
        // The whole shared session changes token.
        super.setSessionToken(token);
        bumpEventsSession(this, 'shared');
    }
    async login(...args) {
        try {
            return await super.login(...args);
        }
        finally {
            bumpEventsSession(this, 'shared');
        }
    }
    adoptSession(...args) {
        const token = super.adoptSession(...args);
        bumpEventsSession(this, 'shared');
        return token;
    }
    setToken(token) {
        // setToken moves only this client to a session of its own.
        detachEventsSession(this);
        super.setToken(token);
        refileEventsSession(this);
        bumpEventsSession(this, 'client');
    }
}
