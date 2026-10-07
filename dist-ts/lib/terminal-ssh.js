/**
 * Terminal SSH convenience methods — high-level wrappers for SSH terminal creation.
 *
 * Architecture:
 *   This module extends the generated terminal services with SSH-specific convenience methods:
 *
 *   - `terminal.sessions.createSsh(options)` — create an SSH terminal session (ephemeral by default)
 *   - `terminal.sessions.createLocal(options?)` — create a local terminal session (ephemeral by default)
 *   - `terminal.sessions.createDesktop(options)` — create a desktop terminal with X11 display
 *   - `terminal.commands.runSsh(options)` — run a command on a remote SSH server
 *
 *   All methods require a container-scoped client (via `withContainer()`).
 *   They are attached to SessionsService.prototype / CommandsService.prototype via module
 *   augmentation and runtime prototype patching, following the same pattern as exec-scripts.ts.
 *   The owning client (for the container URL templates) is read back from the service
 *   (lib/service-owner.ts).
 *
 *   Each method returns `terminal_url` built from the container's URL templates.
 */
import { SessionsService } from '../generated/terminal/sessions.service.js';
import { CommandsService } from '../generated/terminal/commands.service.js';
import { ownerOf } from './service-owner.js';
import { terminalHostLabel } from './terminal-host.js';
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
    // terminalHostLabel: an index of 10000 or more (every ephemeral session) does
    // not fit `terminal-<N>` in a DNS label; it gets the proxy's short `t-<N>`.
    return `https://${terminalHostLabel(t.projectId, t.containerId, serviceIndex)}.${t.server}.${domain}`;
}
/**
 * Host index for a terminal request. The containers proxy injects
 * `terminal_id` from the SNI index and force-overwrites any client-sent
 * value, so an explicit terminal id only takes effect when it IS the index —
 * `terminal-7` *is* `terminal_id=7`. With no id the index is 0, the kit's
 * "no terminal id" sentinel these helpers pair with `ephemeral: true` to get
 * an auto-generated session (40000-65535).
 */
function terminalServiceIndex(explicit, terminalId) {
    if (explicit !== undefined)
        return explicit;
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
 * a non-numeric id. Ids of 10000 and up (every ephemeral session) use the
 * proxy's short `t-<id>` label, because `terminal-<id>` is then one character
 * too long for DNS (lib/terminal-host.ts).
 */
function buildTerminalUrl(client, terminalId, serviceIndex = 0) {
    const n = Number(terminalId);
    const index = Number.isInteger(n) && n > 0 ? n : serviceIndex;
    return getTerminalBaseUrl(client, index);
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
    const si = terminalServiceIndex(options.serviceIndex, options.terminal_id);
    const response = await api.sessions.create({
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
    const si = terminalServiceIndex(o.serviceIndex, o.terminal_id);
    const response = await api.sessions.create({
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
    const si = terminalServiceIndex(options.serviceIndex, options.terminal_id);
    const response = await api.sessions.create({
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
    const si = terminalServiceIndex(options.serviceIndex, options.terminal_id);
    if (!api.commands) {
        throw new Error('Terminal commands service not available');
    }
    const response = await api.commands.run({
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
    const sessions = SessionsService.prototype;
    if (sessions[TERMINAL_SSH_PATCH_MARKER])
        return;
    sessions['createSsh'] = function createSsh(options) {
        return createSshTerminalImpl.call(ownerOf(this, 'terminal.sessions.createSsh'), options);
    };
    sessions['createLocal'] = function createLocal(options) {
        return createLocalTerminalImpl.call(ownerOf(this, 'terminal.sessions.createLocal'), options);
    };
    sessions['createDesktop'] = function createDesktop(options) {
        return createDesktopTerminalImpl.call(ownerOf(this, 'terminal.sessions.createDesktop'), options);
    };
    CommandsService.prototype['runSsh'] = function runSsh(options) {
        return executeSshCommandImpl.call(ownerOf(this, 'terminal.commands.runSsh'), options);
    };
    sessions[TERMINAL_SSH_PATCH_MARKER] = true;
}
try {
    patchTerminalSshPrototype();
}
catch {
    // HoodyClient not yet initialized — will be patched later
}
