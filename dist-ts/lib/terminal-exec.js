/**
 * Terminal exec/shell — high-level wrappers for remote command execution.
 *
 * Architecture:
 *   This module extends HoodyClient with two convenience methods:
 *
 *   - `terminal.run(command, options?)` — run a command and wait for the result
 *     (like child_process.exec). Uses the HTTP run+poll path of
 *     `terminal.commands`. It lives on the terminal namespace, not at the
 *     root, so it cannot be mistaken for the Hoody Exec kit (`client.exec`).
 *
 *   - `shell(options?)` — open an interactive PTY session (like opening
 *     a remote terminal). Uses WebSocket duplex stream via TerminalClient.
 *
 *   Both methods require a container-scoped client (via `withContainer()`).
 *   `shell` is attached to HoodyClient.prototype via module augmentation and
 *   runtime prototype patching, following the same pattern as exec-scripts.ts;
 *   `terminal.run` is installed on each client's terminal namespace object
 *   (`installTerminalRun`), because that object is per instance.
 */
import { Duplex } from 'stream';
import { HoodyClient } from './hoody-client.js';
import { TerminalClient } from './terminal-client.js';
import { assertContainerScoped } from './terminal-run.js';
import { isProxyAuthPolicy } from './proxy-auth.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Build a WebSocket URL for terminal from urlTemplates directly.
 *
 * We cannot use `getKitUrl('terminal', null, index)` because it throws
 * when container is null. Instead we build from the urlTemplates set by
 * `withContainer()`.
 */
function getTerminalWsUrl(client, serviceIndex = 0) {
    const t = client.urlTemplates?.['terminal'];
    if (!t?.projectId || !t?.containerId || !t?.server) {
        throw new Error('shell() requires a container-scoped client with terminal URL templates');
    }
    const domain = typeof client.resolveContainersDomain === 'function'
        ? client.resolveContainersDomain()
        : 'containers.hoody.com';
    return `wss://${t.projectId}-${t.containerId}-terminal-${serviceIndex}.${t.server}.${domain}`;
}
// ---------------------------------------------------------------------------
// shell() implementation — TerminalShell wrapping TerminalClient
// ---------------------------------------------------------------------------
class TerminalShellImpl extends Duplex {
    _terminal;
    _ready;
    _writeQueue = [];
    _flushing = false;
    _connectFailed = false;
    _eofPushed = false;
    constructor(url, terminalOptions) {
        super({
            objectMode: false,
            readableHighWaterMark: 64 * 1024,
            writableHighWaterMark: 64 * 1024,
        });
        this._terminal = new TerminalClient(url, {
            ...terminalOptions,
            autoConnect: false,
            reconnect: terminalOptions.reconnect ?? false,
        });
        // Pipe terminal output to our readable side
        this._terminal.on('data', (chunk) => {
            if (!this.push(chunk)) {
                this._terminal.pause();
            }
        });
        // FIX: Do NOT manually emit 'close' here.
        // Node.js Duplex streams automatically emit 'close' after _destroy()
        // completes. Manual emission causes a duplicate 'close' event.
        this._terminal.on('close', () => {
            this._pushEof();
        });
        // FIX: When reconnect is enabled, transient errors
        // (e.g. WebSocket connect failures) should NOT destroy the wrapper —
        // TerminalClient will attempt reconnection. Destroying here defeats
        // the reconnect behavior. Only destroy when reconnect is disabled.
        this._terminal.on('error', (err) => {
            if (!terminalOptions.reconnect) {
                this.destroy(err);
            }
            // When reconnect is enabled, TerminalClient handles retries internally
        });
        this._terminal.on('connect', () => {
            // FIX: Reset _connectFailed on successful
            // reconnect so writes are not permanently rejected.
            this._connectFailed = false;
            this.emit('connect');
            this._flushQueue();
        });
        // FIX: On disconnect, only
        // push EOF and drain writes when reconnect is disabled. If reconnect
        // is enabled, a temporary disconnect will reconnect — pushing EOF
        // would permanently end the readable side, causing ERR_STREAM_PUSH_AFTER_EOF
        // when new data arrives after reconnection.
        this._terminal.on('disconnect', (code, reason) => {
            if (!terminalOptions.reconnect) {
                this._pushEof();
                // FIX: Set _connectFailed so future writes
                // are immediately rejected instead of silently queuing forever.
                this._connectFailed = true;
                this._drainQueueWithError(new Error(`Disconnected (code: ${code}, reason: ${reason})`));
            }
            this.emit('disconnect', code, reason);
        });
        // FIX: Handle reconnect exhaustion. TerminalClient
        // emits 'reconnect-failed' when all retry attempts are used up. Without
        // this handler, the wrapper stays in limbo — not closed, not errored,
        // writes stall forever.
        if (terminalOptions.reconnect) {
            this._terminal.on('reconnect-failed', () => {
                this._connectFailed = true;
                this._pushEof();
                this._drainQueueWithError(new Error('Reconnection failed — all retry attempts exhausted'));
                this.destroy(new Error('Reconnection failed'));
            });
        }
        // Connect and expose as a promise
        this._ready = this._terminal.connect().catch((err) => {
            // FIX: If connection fails, drain queued writes
            // with error so callers don't hang indefinitely.
            this._connectFailed = true;
            this._drainQueueWithError(err);
            // FIX: Destroy the stream so consumers
            // using event listeners (not await) receive the error properly.
            this.destroy(err);
            throw err;
        });
        // FIX: Prevent unhandled Promise
        // rejection if consumer uses event listeners instead of awaiting
        // `shell.ready`. The error is already propagated via stream 'error'
        // event above; this just silences the unhandled rejection warning.
        this._ready.catch(() => { });
    }
    get ready() {
        return this._ready;
    }
    get connected() {
        return this._terminal.connected;
    }
    get terminalId() {
        return this._terminal.terminalId;
    }
    resize(cols, rows) {
        this._terminal.resize(cols, rows);
    }
    kill(signal) {
        if (!signal || signal === 'SIGINT') {
            // Send Ctrl+C
            if (this._terminal.connected) {
                this._terminal.write('\x03');
            }
        }
        else {
            // FIX: Mark wrapper as permanently failed so
            // subsequent writes are rejected immediately. kill() with non-SIGINT
            // intentionally terminates the session — it should not be recoverable
            // via reconnect.
            this._connectFailed = true;
            // FIX: Drain queued writes immediately so
            // callbacks don't hang. The disconnect handler only drains when
            // reconnect=false, but kill() is intentional — always drain.
            this._drainQueueWithError(new Error(`Shell killed with ${signal}`));
            // FIX: Push EOF so the readable side ends. Without
            // this, reconnect:true shells would never emit 'end' after kill(),
            // leaving consumers (pipe, await) hanging indefinitely.
            this._pushEof();
            // Disconnect — server will kill the shell process
            this._terminal.disconnect(`kill(${signal})`);
        }
    }
    // -- Duplex implementation --
    _write(chunk, encoding, callback) {
        if (this._connectFailed) {
            callback(new Error('Connection failed'));
            return;
        }
        // FIX: Check queue state to prevent out-of-order
        // writes. If the queue is non-empty or currently flushing, new writes
        // must go through the queue to preserve ordering.
        if (this._terminal.connected && this._writeQueue.length === 0 && !this._flushing) {
            this._terminal.write(chunk, encoding, callback);
        }
        else {
            // Queue writes until connected and queue is drained
            this._writeQueue.push({ chunk, encoding, callback });
        }
    }
    _read(_size) {
        // Data is pushed from TerminalClient's 'data' event
        if (this._terminal) {
            this._terminal.resume();
        }
    }
    // FIX: Implement _final so that shell.end() properly tears
    // down the remote PTY session instead of leaving it orphaned.
    _final(callback) {
        this._terminal.disconnect('stream ended');
        callback();
    }
    _destroy(error, callback) {
        this._drainQueueWithError(error || new Error('Stream destroyed'));
        this._terminal.disconnect('Stream destroyed');
        this._terminal.destroy();
        callback(error);
    }
    /**
     * Push EOF (null) to the readable side exactly once.
     * FIX: Both 'close' and 'disconnect' can fire in
     * sequence. Without this guard, push(null) would be called twice, which
     * is a stream state error.
     */
    _pushEof() {
        if (!this._eofPushed) {
            this._eofPushed = true;
            this.push(null);
        }
    }
    /**
     * Drain all queued writes with an error. Called on destroy or connection failure.
     * FIX: Ensures all pending write callbacks are invoked.
     */
    _drainQueueWithError(error) {
        const pending = this._writeQueue.splice(0);
        for (const queued of pending) {
            queued.callback(error);
        }
    }
    // FIX: Use queueMicrotask to prevent deep recursion
    // if TerminalClient.write() invokes callbacks synchronously. This turns
    // the recursive flush into a trampolined iteration.
    _flushQueue() {
        if (this._flushing || !this._terminal.connected)
            return;
        this._flushing = true;
        const flush = () => {
            // FIX: Re-check connection state between microtasks.
            // The queueMicrotask trampoline yields to the event loop, allowing
            // disconnect events to fire mid-flush. Without this guard, flush()
            // would write to a disconnected socket, causing errors that drain
            // the remaining queue (destroying queued writes that should be
            // preserved for reconnection).
            // FIX: Also check destroyed state — if consumer's write
            // callback called destroy(), the scheduled microtask should bail out.
            if (!this._terminal.connected || this.destroyed) {
                this._flushing = false;
                return;
            }
            const item = this._writeQueue.shift();
            if (!item) {
                this._flushing = false;
                return;
            }
            this._terminal.write(item.chunk, item.encoding, (err) => {
                item.callback(err);
                if (err) {
                    this._flushing = false;
                    this._drainQueueWithError(err);
                    return;
                }
                // Trampoline: defer next flush to avoid stack overflow on
                // synchronous callback paths with large queued write bursts.
                queueMicrotask(flush);
            });
        };
        flush();
    }
}
function shellImpl(options) {
    assertContainerScoped(this);
    const { cwd, shell: shellType, user, env, cols = 80, rows = 24, serviceIndex = 0, timeout = 30000, reconnect = false, } = options || {};
    const wsUrl = getTerminalWsUrl(this, serviceIndex);
    const terminalOptions = {
        cols,
        rows,
        timeout,
        reconnect,
    };
    if (cwd)
        terminalOptions.cwd = cwd;
    if (shellType)
        terminalOptions.shell = shellType;
    if (user)
        terminalOptions.user = user;
    if (env)
        terminalOptions.env = env;
    // Pass Kit proxy authentication to the terminal client
    if (this.kitAuth) {
        const raw = this.kitAuth;
        if (isProxyAuthPolicy(raw)) {
            const resolved = raw.services?.terminal || raw.default;
            if (resolved)
                terminalOptions.kitAuth = resolved;
        }
        else {
            terminalOptions.kitAuth = raw;
        }
    }
    return new TerminalShellImpl(wsUrl, terminalOptions);
}
// ---------------------------------------------------------------------------
// Prototype patching
// ---------------------------------------------------------------------------
const TERMINAL_EXEC_PATCH_MARKER = Symbol.for('hoody.sdk.terminal.exec.patch');
/**
 * Attach `shell()` to HoodyClient.prototype.
 *
 * Idempotent — safe to call multiple times (guarded by Symbol marker).
 * Called automatically when this module is imported.
 */
export function patchTerminalExecPrototype() {
    const prototype = HoodyClient.prototype;
    if (prototype[TERMINAL_EXEC_PATCH_MARKER])
        return;
    prototype.shell = shellImpl;
    prototype[TERMINAL_EXEC_PATCH_MARKER] = true;
}
// `terminal.run` lives in terminal-run.ts (browser-safe); re-exported so existing imports keep working.
export { installTerminalRun } from './terminal-run.js';
// Auto-invoke at import time.
// When imported via hoody-client.ts there is a circular dependency:
//   hoody-client -> terminal-exec -> hoody-client (not yet initialized)
// In that case HoodyClient is not yet available and the patch will be
// applied later by patchHoodyClientMetrics() inside the HoodyClient
// constructor. The try/catch makes this safe for both import orderings.
try {
    patchTerminalExecPrototype();
}
catch {
    // HoodyClient not yet initialized — will be patched later by hoody-client.ts
}
