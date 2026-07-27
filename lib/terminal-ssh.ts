/**
 * Terminal SSH convenience methods — high-level wrappers for SSH terminal creation.
 *
 * Architecture:
 *   This module extends HoodyClient with SSH-specific convenience methods:
 *
 *   - `createSshTerminal(options)` — create an SSH terminal session (ephemeral by default)
 *   - `createLocalTerminal(options?)` — create a local terminal session (ephemeral by default)
 *   - `createDesktopTerminal(options)` — create a desktop terminal with X11 display
 *   - `executeSshCommand(options)` — execute a command on a remote SSH server
 *
 *   All methods require a container-scoped client (via `withContainer()`).
 *   They are attached to HoodyClient.prototype via module augmentation
 *   and runtime prototype patching, following the same pattern as
 *   terminal-exec.ts.
 *
 *   Each method returns `terminal_url` built from the container's URL templates.
 */

import { HoodyClient } from './hoody-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SshTerminalOptions {
  host: string;
  user: string;
  port?: string;
  password?: string;
  /** Raw PEM string or base64-encoded key — auto-encoded if needed */
  key?: string;
  socks5?: { host: string; port?: string; user?: string; pass?: string };
  terminal_id?: string;
  ephemeral?: boolean;
  shell?: string;
  cols?: number;
  rows?: number;
  /**
   * Terminal host index. Defaults to `terminal_id` when it is a positive
   * integer (the proxy derives `terminal_id` from this index), else 0 — the
   * sentinel that pairs with `ephemeral` for an auto-generated session.
   */
  serviceIndex?: number;
}

export interface LocalTerminalOptions {
  terminal_id?: string;
  ephemeral?: boolean;
  shell?: string;
  cwd?: string;
  user?: string;
  cols?: number;
  rows?: number;
  serviceIndex?: number;
}

export interface DesktopTerminalOptions {
  terminal_id: string;
  desktop_env?: 'xfce' | 'mate';
  display?: string;
  shell?: string;
  cwd?: string;
  user?: string;
  cols?: number;
  rows?: number;
  wait_until_display?: boolean;
  wait_timeout?: number;
  serviceIndex?: number;
}

export interface SshExecOptions {
  command: string;
  host: string;
  user: string;
  port?: string;
  password?: string;
  key?: string;
  socks5?: { host: string; port?: string; user?: string; pass?: string };
  terminal_id?: string;
  ephemeral?: boolean;
  timeout?: number;
  wait?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  serviceIndex?: number;
}

export interface TerminalCreateResult {
  terminal_id: string;
  terminal_url: string;
  pid?: number;
  status: string;
  is_ssh?: boolean;
  [key: string]: unknown;
}

export interface SshExecResult {
  terminal_id: string;
  terminal_url: string;
  command_id: string;
  status: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Module augmentation
// ---------------------------------------------------------------------------

declare module './hoody-client.js' {
  interface HoodyClient {
    /**
     * Create an SSH terminal session. Ephemeral by default.
     *
     * @example
     * ```ts
     * const scoped = await client.withContainer(container);
     * const result = await scoped.createSshTerminal({
     *   host: '192.168.1.100',
     *   user: 'admin',
     *   password: 'secret',
     * });
     * console.log(result.terminal_url);
     * ```
     */
    createSshTerminal(options: SshTerminalOptions): Promise<TerminalCreateResult>;

    /**
     * Create a local terminal session (bash/zsh/fish). Ephemeral by default.
     *
     * @example
     * ```ts
     * const scoped = await client.withContainer(container);
     * const result = await scoped.createLocalTerminal({ shell: 'bash' });
     * console.log(result.terminal_url);
     * ```
     */
    createLocalTerminal(options?: LocalTerminalOptions): Promise<TerminalCreateResult>;

    /**
     * Create a desktop terminal session with X11 display.
     * Requires explicit terminal_id — desktop sessions need display/dbus.
     *
     * @example
     * ```ts
     * const scoped = await client.withContainer(container);
     * const result = await scoped.createDesktopTerminal({
     *   terminal_id: '5',
     *   desktop_env: 'xfce',
     * });
     * console.log(result.terminal_url);
     * ```
     */
    createDesktopTerminal(options: DesktopTerminalOptions): Promise<TerminalCreateResult>;

    /**
     * Execute a command on a remote SSH server. Ephemeral by default, wait=true.
     *
     * @example
     * ```ts
     * const scoped = await client.withContainer(container);
     * const result = await scoped.executeSshCommand({
     *   command: 'ls -la /var/log',
     *   host: '192.168.1.100',
     *   user: 'admin',
     *   password: 'secret',
     * });
     * console.log(result.stdout);
     * ```
     */
    executeSshCommand(options: SshExecOptions): Promise<SshExecResult>;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertContainerScoped(client: any): void {
  const t = client.urlTemplates?.['terminal'];
  if (!t) {
    throw new Error(
      'SSH terminal methods require a container-scoped client. Call withContainer() first.',
    );
  }
  if (!t.projectId || !t.containerId || !t.server) {
    throw new Error(
      'Container-scoped client has incomplete terminal URL templates (missing projectId, containerId, or server).',
    );
  }
}

function getTerminalBaseUrl(client: any, serviceIndex = 0): string {
  const t = client.urlTemplates?.['terminal'];
  if (!t?.projectId || !t?.containerId || !t?.server) {
    throw new Error('SSH terminal methods require complete terminal URL templates');
  }
  const domain: string =
    typeof client.resolveContainersDomain === 'function'
      ? client.resolveContainersDomain()
      : 'containers.hoody.com';
  return `https://${t.projectId}-${t.containerId}-terminal-${serviceIndex}.${t.server}.${domain}`;
}

/**
 * Host index for a terminal request. The containers proxy injects
 * `terminal_id` from the SNI index and force-overwrites any client-sent
 * value, so an explicit terminal id only takes effect when it IS the index —
 * `terminal-7` *is* `terminal_id=7`. With no id the index is 0, the kit's
 * "no terminal id" sentinel these helpers pair with `ephemeral: true` to get
 * an auto-generated session (40000-65535).
 */
function terminalServiceIndex(explicit: number | undefined, terminalId?: string): number {
  if (explicit !== undefined) return explicit;
  const n = Number(terminalId);
  return terminalId !== undefined && Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Connect URL for a session that was just created. The terminal id belongs in
 * the HOST (`…-terminal-<id>.…`), not the query: the containers proxy injects
 * `terminal_id` from the SNI index and force-overwrites whatever the client
 * sent, so an appended `?terminal_id=` never reached the kit — the URL
 * resolved to `terminal-<serviceIndex>` instead (index 0 = the kit's "no
 * terminal id" sentinel, which spawns a fresh ephemeral session rather than
 * attaching to the one just created). `serviceIndex` remains the fallback for
 * a non-numeric id.
 */
function buildTerminalUrl(client: any, terminalId: string, serviceIndex = 0): string {
  const n = Number(terminalId);
  const index = Number.isInteger(n) && n > 0 ? n : serviceIndex;
  return getTerminalBaseUrl(client, index);
}

function encodeKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (key.startsWith('-----') || key.includes('\n')) {
    return typeof Buffer !== 'undefined' ? Buffer.from(key).toString('base64') : btoa(key);
  }
  return key;
}

function getTerminalApi(client: any): any {
  const terminalApi = client.terminal ?? client.api?.terminal;
  if (!terminalApi?.sessions) {
    throw new Error('Terminal sessions service not available');
  }
  return terminalApi;
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

async function createSshTerminalImpl(
  this: HoodyClient,
  options: SshTerminalOptions,
): Promise<TerminalCreateResult> {
  assertContainerScoped(this);
  const api = getTerminalApi(this);
  const si = terminalServiceIndex(options.serviceIndex, options.terminal_id);

  const response = await api.sessions.createTerminal(
    {
      ssh_host: options.host,
      ssh_user: options.user,
      ssh_port: options.port,
      ssh_password: options.password,
      ssh_key: encodeKey(options.key),
      socks5_host: options.socks5?.host,
      socks5_port: options.socks5?.port,
      socks5_user: options.socks5?.user,
      socks5_pass: options.socks5?.pass,
      terminal_id: options.terminal_id,
      ephemeral: options.terminal_id ? (options.ephemeral ?? false) : (options.ephemeral ?? true),
      shell: options.shell,
      cols: options.cols,
      rows: options.rows,
    },
    { serviceIndex: si },
  );

  const data = response?.data ?? response;
  const tid = String(data?.terminal_id ?? '');
  return {
    ...data,
    terminal_id: tid,
    terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
    status: String(data?.status ?? 'ok'),
  } as TerminalCreateResult;
}

async function createLocalTerminalImpl(
  this: HoodyClient,
  options?: LocalTerminalOptions,
): Promise<TerminalCreateResult> {
  assertContainerScoped(this);
  const api = getTerminalApi(this);
  const o = options || {};
  const si = terminalServiceIndex(o.serviceIndex, o.terminal_id);

  const response = await api.sessions.createTerminal(
    {
      terminal_id: o.terminal_id,
      ephemeral: o.terminal_id ? (o.ephemeral ?? false) : (o.ephemeral ?? true),
      shell: o.shell,
      cwd: o.cwd,
      user: o.user,
      cols: o.cols,
      rows: o.rows,
    },
    { serviceIndex: si },
  );

  const data = response?.data ?? response;
  const tid = String(data?.terminal_id ?? '');
  return {
    ...data,
    terminal_id: tid,
    terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
    status: String(data?.status ?? 'ok'),
  } as TerminalCreateResult;
}

async function createDesktopTerminalImpl(
  this: HoodyClient,
  options: DesktopTerminalOptions,
): Promise<TerminalCreateResult> {
  assertContainerScoped(this);
  const api = getTerminalApi(this);
  const si = terminalServiceIndex(options.serviceIndex, options.terminal_id);

  const response = await api.sessions.createTerminal(
    {
      terminal_id: options.terminal_id,
      desktop: true,
      desktop_env: options.desktop_env,
      display: options.display ?? options.terminal_id,
      shell: options.shell,
      cwd: options.cwd,
      user: options.user,
      cols: options.cols,
      rows: options.rows,
      wait_until_display: options.wait_until_display,
      wait_timeout: options.wait_timeout,
    },
    { serviceIndex: si },
  );

  const data = response?.data ?? response;
  const tid = String(data?.terminal_id ?? '');
  return {
    ...data,
    terminal_id: tid,
    terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
    status: String(data?.status ?? 'ok'),
  } as TerminalCreateResult;
}

async function executeSshCommandImpl(
  this: HoodyClient,
  options: SshExecOptions,
): Promise<SshExecResult> {
  assertContainerScoped(this);
  const api = getTerminalApi(this);
  const si = terminalServiceIndex(options.serviceIndex, options.terminal_id);

  if (!api.execution) {
    throw new Error('Terminal execution service not available');
  }

  const response = await api.execution.execute(
    {
      command: options.command,
      timeout: options.timeout,
      wait: options.wait ?? true,
      cwd: options.cwd,
      env: options.env,
    },
    {
      ssh_host: options.host,
      ssh_user: options.user,
      ssh_port: options.port,
      ssh_password: options.password,
      ssh_key: encodeKey(options.key),
      terminal_id: options.terminal_id,
      ephemeral: options.terminal_id ? (options.ephemeral ?? false) : (options.ephemeral ?? true),
      socks5_host: options.socks5?.host,
      socks5_port: options.socks5?.port,
      socks5_user: options.socks5?.user,
      socks5_pass: options.socks5?.pass,
    },
    { serviceIndex: si },
  );

  const data = response?.data ?? response;
  const tid = String(data?.terminal_id ?? '');
  return {
    ...data,
    terminal_id: tid,
    terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
    command_id: String(data?.command_id ?? ''),
    status: String(data?.status ?? 'ok'),
  } as SshExecResult;
}

// ---------------------------------------------------------------------------
// Prototype patching
// ---------------------------------------------------------------------------

const TERMINAL_SSH_PATCH_MARKER = Symbol.for('hoody.sdk.terminal.ssh.patch');

export function patchTerminalSshPrototype(): void {
  const prototype = HoodyClient.prototype as HoodyClient & Record<string | symbol, unknown>;
  if (prototype[TERMINAL_SSH_PATCH_MARKER]) return;

  prototype.createSshTerminal = createSshTerminalImpl;
  prototype.createLocalTerminal = createLocalTerminalImpl;
  prototype.createDesktopTerminal = createDesktopTerminalImpl;
  prototype.executeSshCommand = executeSshCommandImpl;

  prototype[TERMINAL_SSH_PATCH_MARKER] = true;
}

try {
  patchTerminalSshPrototype();
} catch {
  // HoodyClient not yet initialized — will be patched later
}
