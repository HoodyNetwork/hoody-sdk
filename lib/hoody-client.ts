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
 *  - Metrics: wraps getStats (computers/projects) to normalize/humanize
 *    raw stats (see lib/metrics.ts).
 *  - ExecScriptsService prototype: Markdown/file helpers + defaults.
 *  - ExecService prototype: `run` with method/body/query, `call`, `listCallableScripts`, `connect`.
 *  - TerminalExec / TerminalSsh / ExecDynamicClient / Files prototypes.
 *  - sqlite.sql.query / run: SqlService prototype (lib/sqlite-helpers.ts).
 *
 * The HoodyClient subclass also overrides withComputer/withRealm so scoped
 * client instances inherit the same patches via prototype swap in asWrapped.
 */

import {
  HoodyClient as GeneratedHoodyClient,
  type HoodyClientConfig,
  type HoodyCredentials,
  type ComputerLike,
} from '../generated/client.js';
import { ApiError, RetiredOptionError, refuseRetiredOptions } from '../generated/errors.js';
import type { TerminalSessionsConnectWebSocket } from '../generated/terminal/terminal_connect-terminal-web-socket.websocket.js';
import {
  normalizeComputerStatsResponse,
  normalizeProjectStatsResponse,
} from './metrics.js';
import { retireMethods } from './retired-accessor.js';
import { patchExecScriptsServicePrototype } from './exec-scripts.js';
import { patchExecScriptExecutionPrototype } from './exec-script-execution.js';
import { patchTerminalExecPrototype } from './terminal-exec.js';
import { installTerminalRun, type TerminalExecOptions, type TerminalExecResult } from './terminal-run.js';
import { patchTerminalSshPrototype } from './terminal-ssh.js';
import { patchExecDynamicClientPrototype } from './exec-dynamic-client.js';
import { patchFilesServiceExtensions } from './files-service-extensions.js';
import { patchExecRemotePrototype, type ExecRemoteFactory } from './exec-remote.js';
import { patchSqliteHelpersPrototype } from './sqlite-helpers.js';
import { patchKvHelpersPrototype, type SqliteKvStore } from './kv-helpers.js';
import { patchPipeServiceHelpers } from './pipe-service-helpers.js';
import { claimOwnedServices, ownerOf } from './service-owner.js';
import { ProgramsService } from '../generated/daemon/programs.service.js';
// NOTE: patchScreenshotSavePrototype is called from index.ts (not here)
// to avoid circular-import TDZ errors in Bun.
import { listKits, type KitCatalogEntry, type KitCatalogOptions } from './kit-catalog.js';
import { type ProxyAuth, type ProxyAuthPolicy } from './proxy-auth.js';
import { EventsClient } from './events-client.js';
import {
  bumpEventsSession,
  detachEventsSession,
  eventsSessionOf,
  refileEventsSession,
} from './events-session.js';

/**
 * `client.events`, one per client instance. A WeakMap rather than a field:
 * withRealm/withComputer promote base-class instances by prototype swap
 * (asWrapped), so no constructor of this class runs for them.
 */
const EVENTS_BY_CLIENT = new WeakMap<object, EventsClient>();

/** Same key as TUNNEL_OWNER in lib/tunnel-service-extensions.ts, which this browser-shared module must not import. */
const TUNNEL_OWNER = Symbol.for('hoody.sdk.tunnel.owner');

/** Clients inside their own logout(): its finally bumps, so the endpoint hook below must not too. */
const IN_CLIENT_LOGOUT = new WeakSet<object>();
const EVENTS_LOGOUT_HOOK = Symbol('hoody.sdk.events.logout-hook');

/**
 * A direct `client.api.auth.logoutAll()` ends the local session too
 * (the generated hook clears it once the server revoked it), so it must end
 * the events session like logout() does. Installed per instance,
 * over the generated hook, for constructed and prototype-swapped clients.
 */
function hookEventsLogout(client: GeneratedHoodyClient): void {
  const auth = (client as unknown as { api?: { auth?: Record<string | symbol, unknown> } }).api?.auth;
  if (!auth || typeof auth.logoutAll !== 'function' || auth[EVENTS_LOGOUT_HOOK]) return;
  const original = auth.logoutAll as (...args: unknown[]) => Promise<unknown>;
  auth.logoutAll = async (...args: unknown[]) => {
    const result = await original.apply(auth, args);
    if (!IN_CLIENT_LOGOUT.has(client)) bumpEventsSession(client, 'shared');
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
 * module-private; a unit test checks the two agree.
 */
function hasPage(): boolean {
  const g = globalThis as { document?: { baseURI?: unknown }; location?: { href?: unknown; origin?: unknown } };
  const candidates = [g.document ? g.document.baseURI : undefined, g.location ? g.location.href : undefined, g.location ? g.location.origin : undefined];
  return candidates.some((url) => typeof url === 'string' && /^https?:/i.test(url));
}

/**
 * The public account API, used when no baseURL was given, there is no page and
 * the environment names none.
 */
const DEFAULT_BASE_URL = 'https://api.hoody.com';

/**
 * The config a client is constructed with, with the account API filled in
 * when no baseURL was given and there is no page: HOODY_BASE_URL, else
 * HOODY_API_URL (the variables the CLI reads), else the public API. It is read
 * as the account API unless the caller set target; a kit client gets no
 * built-in host, since no public kit URL exists without a computer. Before
 * this an omitted base was '' and every account call failed with "fetch() URL
 * is invalid": nothing in a Hoody computer or an exec script sets either
 * variable. On a page, and for any given baseURL, nothing changes.
 */
function withDefaultBaseURL(config: HoodyClientConfig): HoodyClientConfig {
  // Refuse retired keys on the caller's own object, before the spread below
  // copies it: the error then names what the caller passed.
  refuseRetiredOptions(config, 'HoodyClient', [['forceIPv4', 'forceIpv4'], ['forceIPv4Cache', 'forceIpv4Cache']]);
  if (config.baseURL || hasPage()) return config;
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const fromEnv = env?.HOODY_BASE_URL || env?.HOODY_API_URL;
  if (!fromEnv && config.target === 'kit') return config;
  return { ...config, baseURL: fromEnv || DEFAULT_BASE_URL, target: config.target ?? 'account' };
}

/**
 * The promise withComputer() returns, with each namespace of the client it
 * resolves to (`sqlite`, `files`, `exec`, ...) as a getter that throws: a
 * script that forgot `await` and read `hoody.withComputer(c).sqlite` got
 * `undefined` and failed further down the chain ("undefined is not an object").
 * Only names the client has and a Promise does not are guarded, as
 * non-enumerable properties of this one promise, so `await`, `then`, `catch`
 * and `finally` work as before.
 */
function guardPendingClient(pending: Promise<HoodyClient>, client: object): Promise<HoodyClient> {
  for (const name of Object.keys(client)) {
    if (name in pending) continue;
    const value = (client as Record<string, unknown>)[name];
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) continue;
    Object.defineProperty(pending, name, {
      configurable: true,
      get() {
        throw new Error(
          `withComputer() returns a Promise: write \`const box = await hoody.withComputer(...)\`, then read box.${name}`,
        );
      },
    });
  }
  return pending;
}

/**
 * A daemon program: its id, or `{ name }` for its exact name (which may be all
 * digits, so a name is never guessed from a number).
 */
export type DaemonProgramRef = number | { id: number } | { name: string };

export interface ProgramTerminalConnectOptions {
  /** Watch only: hoody-terminal drops this connection's input. Per connection, not a permission. (The earlier key `readonly` is refused.) */
  readOnly?: boolean;
  /** Size sent in the JSON_DATA handshake (default 80x24). The smallest writable client sets the program's size (read-only clients only when none is writable). (The earlier key `columns` is refused.) */
  cols?: number;
  rows?: number;
  /**
   * Installed before the socket opens, so it receives every output byte. A
   * handler added with `ws.onOutput()` after the promise resolves can miss
   * output that arrived with the handshake (the program's buffered screen).
   */
  onOutput?: (data: Uint8Array) => void;
  /** Called when an established attachment closes; `ws.onDisconnect()` works too. */
  onDisconnect?: (code: number, reason: string) => void;
}

export interface ProgramTerminalConnection {
  /** The program's terminal id: terminal N of the computer. */
  terminalId: number;
  /** The connected socket, after its first server frame. Send keys with `ws.sendInput()`. */
  ws: TerminalSessionsConnectWebSocket;
}

/** The program a ref names, read through the daemon kit the programs service talks to. */
async function programTerminalIdOf(programs: ProgramsService, program: DaemonProgramRef): Promise<number> {
  let row: { id?: unknown; name?: unknown; terminal_id?: unknown };
  let label: string;
  if (typeof program === 'number' || (typeof program === 'object' && program !== null && 'id' in program)) {
    const id = typeof program === 'number' ? program : program.id;
    if (!Number.isInteger(id) || id < 0) {
      throw new TypeError(`program id must be a non-negative integer, got ${String(id)}`);
    }
    row = (await programs.get(id)).data.program;
    label = `program ${id}`;
  } else if (typeof program === 'object' && program !== null && typeof program.name === 'string' && program.name !== '') {
    const name = program.name;
    const { programs: found } = (await programs.list({ name })).data;
    // The daemon filters by exact name already; the check keeps that true here.
    const matches = (found ?? []).filter((p) => p.name === name);
    if (matches.length !== 1) {
      throw new Error(matches.length === 0
        ? `no program named "${name}"`
        : `${matches.length} programs are named "${name}"; pass { id } instead`);
    }
    row = matches[0]!;
    label = `program "${name}"`;
  } else {
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

type MethodTarget = Record<string, unknown>;

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
function wrapAsyncMethod(
  target: MethodTarget | undefined,
  methodName: string,
  transform: (value: unknown) => unknown,
): void {
  if (!target) return;
  const original = target[methodName];
  if (typeof original !== 'function') return;

  target[methodName] = async (...args: unknown[]) => {
    const result = await (original as (...innerArgs: unknown[]) => Promise<unknown>).apply(
      target,
      args,
    );
    try {
      return transform(result);
    } catch {
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
 *  4. Wrap client.api.computers.getStats with normalizeComputerStatsResponse
 *  5. Wrap client.api.projects.getStats with normalizeProjectStatsResponse
 *  6. Set METRICS_PATCH_MARKER to prevent re-patching this instance
 */
export function patchHoodyClientMetrics<T extends GeneratedHoodyClient>(client: T): T {
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
  const tunnelService = (client as unknown as { tunnel?: object }).tunnel;
  if (tunnelService && !Object.prototype.hasOwnProperty.call(tunnelService, TUNNEL_OWNER)) {
    Object.defineProperty(tunnelService, TUNNEL_OWNER, { value: client });
  }
  // patchScreenshotSavePrototype is called once from index.ts at module load time.

  const markerHost = client as unknown as Record<string | symbol, unknown>;
  if (markerHost[METRICS_PATCH_MARKER]) return client;

  const api = (client as unknown as { api?: MethodTarget }).api;
  const computers = api ? (api.computers as MethodTarget | undefined) : undefined;
  const projects = api ? (api.projects as MethodTarget | undefined) : undefined;

  wrapAsyncMethod(computers, 'getStats', normalizeComputerStatsResponse);
  wrapAsyncMethod(projects, 'getStats', normalizeProjectStatsResponse);

  markerHost[METRICS_PATCH_MARKER] = true;
  return client;
}

/** Connect to a daemon program's terminal (see `daemon.programs.connectTerminal`). */
async function connectProgramTerminalImpl(
  scoped: GeneratedHoodyClient,
  program: DaemonProgramRef,
  options: ProgramTerminalConnectOptions = {},
): Promise<ProgramTerminalConnection> {
  // The hand-written keys follow the generated words (readOnly, cols). An old key would be dropped without a
  // word: `readonly` would open a WRITABLE connection, so both are refused by name.
  const legacy = options as { readonly?: unknown; columns?: unknown };
  if (legacy.readonly !== undefined) throw new RetiredOptionError('daemon.programs.connectTerminal', 'readonly', 'readOnly');
  if (legacy.columns !== undefined) throw new RetiredOptionError('daemon.programs.connectTerminal', 'columns', 'cols');
  const terminalId = await programTerminalIdOf(scoped.daemon.programs, program);
  // The terminal is chosen by the HOST index: the computers proxy
  // overwrites a `terminal_id` query parameter from it.
  const ws = await scoped.terminal.sessions.connect(
    options.readOnly !== undefined ? { readonly: options.readOnly } : undefined,
    { serviceIndex: terminalId },
  );

  return new Promise<ProgramTerminalConnection>((resolve, reject) => {
    let state: 'pending' | 'attached' | 'failed' = 'pending';
    const firstFrameSubs: Array<() => void> = [];
    const fail = (code: number, reason: string) => {
      if (state !== 'pending') return;
      state = 'failed';
      for (const off of firstFrameSubs) off();
      // Stops the socket's own reconnect, which a 1006 would schedule.
      try { ws.disconnect(); } catch { /* already closed */ }
      reject(Object.assign(
        new Error(`attach to terminal ${terminalId} failed (${code}${reason ? `: ${reason}` : ''})`),
        { code, reason },
      ));
    };
    const attached = () => {
      if (state !== 'pending') return;
      state = 'attached';
      for (const off of firstFrameSubs) off();
      resolve({ terminalId, ws });
    };

    // Every handler goes on before connect(): a refusal closes the socket
    // right after the upgrade.
    if (options.onOutput) ws.onOutput(options.onOutput);
    ws.onDisconnect((code, reason) => {
      if (state === 'pending') fail(code, reason);
      else if (state === 'attached') options.onDisconnect?.(code, reason);
    });
    firstFrameSubs.push(
      ws.onOutput(attached),
      ws.onSetWindowTitle(attached),
      ws.onSetPreferences(attached),
      ws.onSetTerminalId(attached),
      ws.onSetShellType(attached),
      ws.onUnknownFrame(attached),
    );

    // The handshake goes out from the open event itself. A socket the
    // server closes at once is already closing by the time connect()
    // resolves, and its close (with the real code) is what rejects. Once
    // only: on a reconnect the socket replays the handshake itself.
    const offConnect = ws.onConnect(() => {
      offConnect();
      try {
        ws.sendJsonData({ command: '{', columns: options.cols ?? 80, rows: options.rows ?? 24 });
      } catch { /* closing: the disconnect handler reports it */ }
    });
    ws.connect().catch((err: unknown) => fail(1006, err instanceof Error ? err.message : String(err)));
  });
}

declare module '../generated/daemon/programs.service.js' {
  interface ProgramsService {
  /**
   * The terminal id of a daemon program (`terminal_id`), read from the
   * computer's daemon (the one this service talks to). Its browser URL is `getKitUrl('terminal', computer, id)`.
   * Rejects when the program does not exist or has no terminal.
   */
    getTerminalId(program: DaemonProgramRef): Promise<number>;

  /**
   * Connect to a daemon program's terminal: the program's screen, its input,
   * its size. The socket is terminal N's (`terminal-N` host, N being the
   * program's `terminal_id`) and carries no spawn parameters: the terminal
   * belongs to the running program, so they would be ignored. The program
   * gets the smallest size among the writable clients attached to it
   * (read-only clients count only when none is writable).
   *
   * Resolves once the first server frame arrives. Rejects with an Error whose
   * `code` is the WebSocket close code and `reason` its reason when the attach
   * is refused: 4404 `daemon program not running`, 4409 when a local shell
   * session opened on that id before it became the program's still holds it
   * (delete that session to free the id), 1006 when the upgrade itself
   * failed (credentials, routing). After that, the program ending reaches
   * `onDisconnect` (and `ws.onDisconnect`) as 4404 `daemon program ended`,
   * and the socket does not reconnect after a 4xxx close; a dropped
   * connection (1006) reconnects and attaches again by itself. Close with `ws.disconnect()`: the program keeps
   * running.
   *
   * Authentication is the scoped client's kit authentication (`kitAuth` on
   * this client or `withComputer`); the account token never goes into the
   * socket URL. A `computerClaim` kitAuth travels in headers, which only Node
   * can put on a WebSocket upgrade. In a browser, use a `token` kitAuth with
   * `param` (the proxy reads it from the query string) or a cookie on the
   * kit host.
   */
    connectTerminal(program: DaemonProgramRef, options?: ProgramTerminalConnectOptions): Promise<ProgramTerminalConnection>;
  }
}

const DAEMON_PROGRAMS_PATCH_MARKER = Symbol.for('hoody.sdk.daemon.programs.extensions');

/**
 * Attach `getTerminalId` and `connectTerminal` to ProgramsService.prototype (idempotent).
 * Both need a computer-scoped client: its daemon kit for the lookup, its terminal kit for the socket.
 */
export function patchDaemonProgramsPrototype(): void {
  const proto = ProgramsService.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[DAEMON_PROGRAMS_PATCH_MARKER]) return;
  proto['getTerminalId'] = function getTerminalId(this: ProgramsService, program: DaemonProgramRef): Promise<number> {
    return programTerminalIdOf(this, program);
  };
  proto['connectTerminal'] = function connectTerminal(
    this: ProgramsService,
    program: DaemonProgramRef,
    options?: ProgramTerminalConnectOptions,
  ): Promise<ProgramTerminalConnection> {
    return connectProgramTerminalImpl(ownerOf<GeneratedHoodyClient>(this, 'daemon.programs.connectTerminal'), program, options);
  };
  retireMethods(ProgramsService.prototype, 'daemon.programs', { attachTerminal: 'daemon.programs.connectTerminal()' });
  proto[DAEMON_PROGRAMS_PATCH_MARKER] = true;
}

/**
 * The SDK entry point. One client holds the account session and reaches the
 * account API (`client.api`), the live account events (`client.events`) and,
 * once scoped with `await client.withComputer(...)`, the programs of one
 * computer (`files`, `terminal`, `exec`, `sqlite` and the other namespaces).
 *
 * Construct it with a config (`token`, or `credentials` that log in on first
 * use), or use `HoodyClient.login()` to get a logged-in client. Clients
 * derived with `withComputer()` or `withRealm()` share the session of the
 * client they came from: a refresh, logout or `setSessionToken()` on one
 * applies to all of them.
 */
export class HoodyClient extends GeneratedHoodyClient {
  /** The exec namespace, plus `exec.remote(url, { token })`: the remote channel of a live script (lib/exec-remote.ts). */
  declare readonly exec: GeneratedHoodyClient['exec'] & { remote: ExecRemoteFactory };

  /** The sqlite namespace, with the object form of the KV key calls in `kv`'s type (lib/kv-helpers.ts). */
  declare readonly sqlite: Omit<GeneratedHoodyClient['sqlite'], 'kv'> & { kv: SqliteKvStore };

  /** The terminal namespace, plus `terminal.run(command)`: run a command and wait for the result (lib/terminal-exec.ts). */
  declare readonly terminal: GeneratedHoodyClient['terminal'] & {
    run(command: string, options?: TerminalExecOptions): Promise<TerminalExecResult>;
  };

  /**
   * Promote a GeneratedHoodyClient instance into a fully-patched HoodyClient.
   *
   * The base class methods withComputer/withRealm return a GeneratedHoodyClient.
   * This helper swaps its prototype to HoodyClient.prototype so that the scoped
   * instance gains all HoodyClient overrides, then applies the metrics patches.
   * The prototype swap is a standard pattern for re-typing objects returned by
   * base-class factory methods without re-instantiating them.
   */
  private static asWrapped(client: GeneratedHoodyClient): HoodyClient {
    if (!(client instanceof HoodyClient)) {
      Object.setPrototypeOf(client, HoodyClient.prototype);
    }
    hookEventsLogout(client);
    return patchHoodyClientMetrics(client) as unknown as HoodyClient;
  }

  /**
   * Create a client from `config`. With no `baseURL` outside a web page, the
   * account API is taken from `HOODY_BASE_URL`, else `HOODY_API_URL`, else the
   * public Hoody API (a client whose `target` is `'kit'` gets no default).
   * Makes no request. Throws `RetiredOptionError` when the config carries a
   * retired option name.
   */
  constructor(config: HoodyClientConfig) {
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
  static override async login(
    baseURL: string,
    credentials: HoodyCredentials,
  ): Promise<HoodyClient> {
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
  static listKits(options?: KitCatalogOptions): KitCatalogEntry[] {
    return listKits(options);
  }

  /**
   * Return static catalog metadata for supported Hoody Kit slugs.
   */
  listKits(options?: KitCatalogOptions): KitCatalogEntry[] {
    return HoodyClient.listKits(options);
  }

  /**
   * Static list of known desktop environments for discoverability.
   * The `getDesktopUrl()` method accepts any string — this list is not exhaustive.
   */
  static listDesktopEnvironments(): string[] {
    return ['xfce', 'mate'];
  }

  /**
   * Static list of known desktop environments for discoverability.
   */
  listDesktopEnvironments(): string[] {
    return HoodyClient.listDesktopEnvironments();
  }

  /**
   * Build a desktop URL for a computer. `desktop-{N}` is a public reverse-proxy
   * alias: the proxy injects the desktop/redirect query params and the terminal
   * kit 302s the browser to display-{N+OFFSET} (default OFFSET=1600 server-side).
   *
   * Net browser-visible navigation: `desktop-{N}` → `display-{N+OFFSET}`.
   *
   * @param computer - Computer object with project_id, id, and server fields.
   * @param options.serviceIndex - Desktop instance index (default: 1). Distinct
   *   from regular terminal indices — the proxy offsets internally.
   * @param options.desktopEnv - Desktop environment string (default: server-side
   *   xfce). Only appended to the URL when explicitly provided, so the proxy's
   *   default kicks in otherwise.
   */
  getDesktopUrl(
    computer: ComputerLike,
    options?: { serviceIndex?: number; desktopEnv?: string },
  ): string {
    const baseUrl = this.getKitUrl('desktop', computer, options?.serviceIndex ?? 1);
    const env = options?.desktopEnv;
    // Suppress when env matches the proxy default (xfce) — keeps the URL clean
    // and consistent with the CLI/workspaces helpers.
    if (!env || env === 'xfce') return baseUrl;
    return `${baseUrl}/?desktop_env=${encodeURIComponent(env)}`;
  }

  /**
   * Derive a client scoped to one computer: its namespaces (`files`,
   * `terminal`, `exec`, ...) talk to that computer's programs. Pass a computer
   * object, or an id to have it looked up through the account API; a failed
   * lookup rejects with the API's error. `options.kitAuth` sets the credential
   * sent to the computer's programs, and `options.onKitAuthExpired` is asked
   * for a new one when a program refuses it.
   *
   * Returns a Promise: `const box = await client.withComputer(id)`. Reading a
   * namespace on the un-awaited promise throws an Error that says so.
   */
  override withComputer(
    computerOrId: string | ComputerLike,
    // Mirror the generated base signature so callers can type-check
    // `onKitAuthExpired` without a cast. A narrower `{ kitAuth? }` type
    // would surface an excess-property error on the callback.
    options?: {
      kitAuth?: ProxyAuth | ProxyAuthPolicy;
      onKitAuthExpired?: (namespace: string, error: ApiError) => Promise<ProxyAuth | undefined>;
    },
  ): Promise<HoodyClient> {
    const pending = super.withComputer(computerOrId, options).then((scoped) => HoodyClient.asWrapped(scoped));
    return guardPendingClient(pending, this);
  }

  /**
   * Derive a client scoped to a realm: its account API requests go to that
   * realm's host. `realmId` is 24 hexadecimal characters; `'all'`, `'default'`
   * or `'*'` clears the scope, and anything else throws `ValidationError`. The
   * derived client shares this client's session, and its `events` stream
   * carries that realm's events.
   */
  override withRealm(realmId?: string): HoodyClient {
    const scoped = super.withRealm(realmId);
    return HoodyClient.asWrapped(scoped);
  }

  /**
   * Real-time events of this client's account (or of its realm, on a
   * `withRealm` client): live delivery, recovery from history after a
   * disconnect, and waits. Created on first use; each client instance has
   * its own stream. `api.events` stays the REST history.
   */
  get events(): EventsClient {
    let events = EVENTS_BY_CLIENT.get(this);
    if (!events) {
      const http = this.http as unknown as { clearCache?: () => void };
      events = new EventsClient(this.api.events, undefined, undefined, {
        session: eventsSessionOf(this),
        // A client constructed with credentials logs in on first use.
        prepareCredential: () => this.getAuthToken(),
        // scope_changed: a project's access changed, so cached GETs may
        // show what this account can no longer read.
        onScopeChanged: () => {
          try { http.clearCache?.(); } catch { /* the cache is an optimisation */ }
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

  /**
   * Log this client's session out locally: the access token, refresh token,
   * stored credentials and `kitAuth` are dropped for this client and every
   * client sharing its session. No session is revoked on the server; use
   * `logoutAll()` for that. The events stream's session ends with it: its
   * socket closes and the buffers and cursors of the old session are dropped.
   * Other streams and sockets the caller opened stay open.
   */
  override async logout(): Promise<void> {
    IN_CLIENT_LOGOUT.add(this);
    try {
      await super.logout();
    } finally {
      IN_CLIENT_LOGOUT.delete(this);
      bumpEventsSession(this, 'shared');
    }
  }

  // The generated logoutAll() clears the credentials even when the request fails, so the events
  // session ends either way. The endpoint hook bumps only after a successful revoke.
  /**
   * Revoke every session of the account on the server (all devices and apps),
   * then clear this session as `logout()` does. The local session, and the
   * events stream's session with it, is cleared even when the request fails;
   * the failure is then rethrown.
   */
  override async logoutAll(): Promise<void> {
    IN_CLIENT_LOGOUT.add(this);
    try {
      await super.logoutAll();
    } finally {
      IN_CLIENT_LOGOUT.delete(this);
      bumpEventsSession(this, 'shared');
    }
  }

  /**
   * Set the access token of the whole session: this client and every client
   * sharing its session send it from now on. The refresh token and stored
   * credentials are kept. The events stream's old session ends, and the stream
   * reconnects with the new token when it still has handlers.
   */
  override setSessionToken(token: string): void {
    // The whole shared session changes token.
    super.setSessionToken(token);
    bumpEventsSession(this, 'shared');
  }

  /**
   * Log this client in with credentials, starting a new session, and resolve
   * with the API's login response. The answer of an account with two-factor
   * authentication is a challenge, not a session. The events stream's old
   * session ends whether or not the login succeeds.
   */
  override async login(
    ...args: Parameters<GeneratedHoodyClient['login']>
  ): ReturnType<GeneratedHoodyClient['login']> {
    try {
      return await super.login(...args);
    } finally {
      bumpEventsSession(this, 'shared');
    }
  }

  /**
   * Take over a session obtained elsewhere (a login, two-factor or device-flow
   * response, or tokens saved earlier): the access token becomes the bearer of
   * this client's session and the refresh token is kept for automatic refresh.
   * Returns the access token. Throws `ValidationError` when the value holds a
   * challenge and no session. The events stream moves to the new session.
   */
  override adoptSession(...args: Parameters<GeneratedHoodyClient['adoptSession']>): string {
    const token = super.adoptSession(...args);
    bumpEventsSession(this, 'shared');
    return token;
  }

  /**
   * Set the access token of this client only. The client leaves the session it
   * shared and starts one of its own, with no refresh token; other clients
   * keep theirs. Its events stream follows it to the new session. To change
   * the token of the whole session, use `setSessionToken()`.
   */
  override setToken(token: string): void {
    // setToken moves only this client to a session of its own.
    detachEventsSession(this);
    super.setToken(token);
    refileEventsSession(this);
    bumpEventsSession(this, 'client');
  }
}
