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
// Helpers
// ---------------------------------------------------------------------------
function assertContainerScoped(client) {
    const t = client.urlTemplates?.['terminal'];
    if (!t) {
        throw new Error('SSH terminal methods require a container-scoped client. Call withContainer() first.');
    }
    if (!t.projectId || !t.containerId || !t.server) {
        throw new Error('Container-scoped client has incomplete terminal URL templates (missing projectId, containerId, or server).');
    }
}
function getTerminalBaseUrl(client, serviceIndex = 0) {
    const t = client.urlTemplates?.['terminal'];
    if (!t?.projectId || !t?.containerId || !t?.server) {
        throw new Error('SSH terminal methods require complete terminal URL templates');
    }
    const domain = typeof client.resolveContainersDomain === 'function'
        ? client.resolveContainersDomain()
        : 'containers.hoody.com';
    return `https://${t.projectId}-${t.containerId}-terminal-${serviceIndex}.${t.server}.${domain}`;
}
function buildTerminalUrl(client, terminalId, serviceIndex = 0) {
    const base = getTerminalBaseUrl(client, serviceIndex);
    return `${base}?terminal_id=${encodeURIComponent(terminalId)}`;
}
function encodeKey(key) {
    if (!key)
        return undefined;
    if (key.startsWith('-----') || key.includes('\n')) {
        return typeof Buffer !== 'undefined' ? Buffer.from(key).toString('base64') : btoa(key);
    }
    return key;
}
function getTerminalApi(client) {
    const terminalApi = client.terminal ?? client.api?.terminal;
    if (!terminalApi?.sessions) {
        throw new Error('Terminal sessions service not available');
    }
    return terminalApi;
}
// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------
async function createSshTerminalImpl(options) {
    assertContainerScoped(this);
    const api = getTerminalApi(this);
    const si = options.serviceIndex ?? 0;
    const response = await api.sessions.createTerminal({
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
    }, { serviceIndex: si });
    const data = response?.data ?? response;
    const tid = String(data?.terminal_id ?? '');
    return {
        ...data,
        terminal_id: tid,
        terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
        status: String(data?.status ?? 'ok'),
    };
}
async function createLocalTerminalImpl(options) {
    assertContainerScoped(this);
    const api = getTerminalApi(this);
    const o = options || {};
    const si = o.serviceIndex ?? 0;
    const response = await api.sessions.createTerminal({
        terminal_id: o.terminal_id,
        ephemeral: o.terminal_id ? (o.ephemeral ?? false) : (o.ephemeral ?? true),
        shell: o.shell,
        cwd: o.cwd,
        user: o.user,
        cols: o.cols,
        rows: o.rows,
    }, { serviceIndex: si });
    const data = response?.data ?? response;
    const tid = String(data?.terminal_id ?? '');
    return {
        ...data,
        terminal_id: tid,
        terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
        status: String(data?.status ?? 'ok'),
    };
}
async function createDesktopTerminalImpl(options) {
    assertContainerScoped(this);
    const api = getTerminalApi(this);
    const si = options.serviceIndex ?? 0;
    const response = await api.sessions.createTerminal({
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
    }, { serviceIndex: si });
    const data = response?.data ?? response;
    const tid = String(data?.terminal_id ?? '');
    return {
        ...data,
        terminal_id: tid,
        terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
        status: String(data?.status ?? 'ok'),
    };
}
async function executeSshCommandImpl(options) {
    assertContainerScoped(this);
    const api = getTerminalApi(this);
    const si = options.serviceIndex ?? 0;
    if (!api.execution) {
        throw new Error('Terminal execution service not available');
    }
    const response = await api.execution.execute({
        command: options.command,
        timeout: options.timeout,
        wait: options.wait ?? true,
        cwd: options.cwd,
        env: options.env,
    }, {
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
    }, { serviceIndex: si });
    const data = response?.data ?? response;
    const tid = String(data?.terminal_id ?? '');
    return {
        ...data,
        terminal_id: tid,
        terminal_url: tid ? buildTerminalUrl(this, tid, si) : '',
        command_id: String(data?.command_id ?? ''),
        status: String(data?.status ?? 'ok'),
    };
}
// ---------------------------------------------------------------------------
// Prototype patching
// ---------------------------------------------------------------------------
const TERMINAL_SSH_PATCH_MARKER = Symbol.for('hoody.sdk.terminal.ssh.patch');
export function patchTerminalSshPrototype() {
    const prototype = HoodyClient.prototype;
    if (prototype[TERMINAL_SSH_PATCH_MARKER])
        return;
    prototype.createSshTerminal = createSshTerminalImpl;
    prototype.createLocalTerminal = createLocalTerminalImpl;
    prototype.createDesktopTerminal = createDesktopTerminalImpl;
    prototype.executeSshCommand = executeSshCommandImpl;
    prototype[TERMINAL_SSH_PATCH_MARKER] = true;
}
try {
    patchTerminalSshPrototype();
}
catch {
    // HoodyClient not yet initialized — will be patched later
}
