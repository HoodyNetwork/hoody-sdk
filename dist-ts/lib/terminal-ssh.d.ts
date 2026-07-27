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
export interface SshTerminalOptions {
    host: string;
    user: string;
    port?: string;
    password?: string;
    /** Raw PEM string or base64-encoded key — auto-encoded if needed */
    key?: string;
    socks5?: {
        host: string;
        port?: string;
        user?: string;
        pass?: string;
    };
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
    socks5?: {
        host: string;
        port?: string;
        user?: string;
        pass?: string;
    };
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
export declare function patchTerminalSshPrototype(): void;
