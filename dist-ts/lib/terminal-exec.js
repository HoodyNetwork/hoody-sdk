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
import { terminalHostLabel } from './terminal-host.js';
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
    // terminalHostLabel: an id of 10000 or more does not fit `terminal-<N>` in a
    // DNS label; it gets the proxy's short `t-<N>` (lib/terminal-host.ts).
    return `wss://${terminalHostLabel(t.projectId, t.containerId, serviceIndex)}.${t.server}.${domain}`;
}
// ---------------------------------------------------------------------------
// shell() implementation — TerminalShell wrapping TerminalClient
// ---------------------------------------------------------------------------
/**
 * How long `ready` waits for the kit to name the session after the socket is
 * open. The frame follows the upgrade at once; the bound only keeps a kit that
 * never sends it from holding `ready` for the whole connection timeout.
 */
const TERMINAL_ID_WAIT_MS = 5000;
/**
 * The creation time in a session row, when the row is usable as identity
 * evidence: an ephemeral session with a real creation time. Anything else is
 * no evidence (undefined).
 */
function sessionBirth(row) {
    if (!row || row.is_ephemeral !== true)
        return undefined;
    const at = row.created_at;
    if (typeof at === 'number')
        return Number.isFinite(at) && at > 0 ? at : undefined;
    return typeof at === 'string' && at !== '' ? at : undefined;
}
class TerminalShellImpl extends Duplex {
    _terminal;
    _ready;
    _writeQueue = [];
    _flushing = false;
    _connectFailed = false;
    _eofPushed = false;
    /** Set for a fresh session opened with `reconnect` (see FreshSessionAccess). */
    _fresh;
    /** Id of the fresh session reconnects are pinned to; '' until the kit names it. */
    _pinnedId = '';
    /**
     * Creation time of the pinned session, read while the first connection was
     * still up: the evidence a reconnect is checked against. Resolves undefined
     * when there is none (lookup failed, no row, no creation time, or the
     * connection changed before the answer came).
     */
    _pinnedBirth;
    /** Bumped on every connect and disconnect: names one connection. */
    _linkGen = 0;
    _everConnected = false;
    /**
     * A reconnect is up but the session behind it is not confirmed yet. Nothing
     * reaches the socket in this state: the TerminalClient connection is held
     * (TerminalClient.holdSends: no handshake, input, resize, pause or resume),
     * writes and Ctrl+C wait in the queue, and output is kept back in
     * `_heldOutput` until it is known whose it is.
     */
    _verifying = false;
    _heldOutput = [];
    constructor(url, terminalOptions, fresh) {
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
            // Not ours until confirmed: delivered on success, discarded otherwise.
            if (this._verifying) {
                this._heldOutput.push(chunk);
                return;
            }
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
        this._fresh = terminalOptions.reconnect ? fresh : undefined;
        // Pin a fresh session to the id the kit gave it. Its first URL is the
        // "no terminal id" host with ephemeral=true, and connecting there again
        // would open ANOTHER session: a reconnect must name this one instead.
        this._terminal.on('terminal-id', (id) => {
            const access = this._fresh;
            if (!access || this._pinnedId || !id)
                return;
            this._pinnedId = id;
            this._terminal.retarget(access.urlFor(id), { ephemeral: false });
            // Every later connection opens held: nothing is sent on it until the
            // session behind it is confirmed (_confirmSameSession).
            this._terminal.holdSends();
            // Evidence only if it was read on the connection that got the id: an
            // answer that arrives after that connection is gone could describe
            // whatever holds the id by then.
            const gen = this._linkGen;
            this._pinnedBirth = access.lookup(id).then((row) => (this._linkGen === gen ? sessionBirth(row) : undefined), () => undefined);
        });
        this._terminal.on('connect', () => {
            this._linkGen++;
            if (this._fresh && this._everConnected) {
                // A reconnect of a fresh session. The kit creates a session for an id
                // it no longer has, so being connected does not prove this is the
                // shell the held input was typed for: confirm before sending any.
                this._verifying = true;
                this._heldOutput = [];
                void this._confirmSameSession(this._linkGen);
                return;
            }
            this._everConnected = true;
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
            this._linkGen++;
            if (!terminalOptions.reconnect) {
                this._pushEof();
                // FIX: Set _connectFailed so future writes
                // are immediately rejected instead of silently queuing forever.
                this._connectFailed = true;
                this._drainQueueWithError(new Error(`Disconnected (code: ${code}, reason: ${reason})`));
            }
            this.emit('disconnect', code, reason);
            // A fresh session that was lost before the kit named it cannot be
            // found again; a reconnect would open another one.
            if (this._fresh && this._everConnected && !this._pinnedId && !this.destroyed) {
                this._endSession(new Error(`shell(): the connection was lost (code: ${code}) before the terminal kit named the session, so it cannot be rejoined`));
            }
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
        // Connect and expose as a promise. `ready` also waits for the kit's
        // SET_TERMINAL_ID frame, which follows the upgrade: without the wait
        // `terminalId` was still '' right after `await shell.ready`.
        this._ready = this._terminal.connect().then(() => this._waitForTerminalId(Math.min(TERMINAL_ID_WAIT_MS, terminalOptions.timeout ?? 30000))).catch((err) => {
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
            // Send Ctrl+C. Through the same gate as every write: on a connection
            // that is not confirmed yet (or behind input that is still queued) it
            // waits in the queue, so it can never reach a shell before the input
            // typed ahead of it, or a shell that is not this one.
            if (this._terminal.connected) {
                if (this._verifying || this._writeQueue.length > 0 || this._flushing) {
                    this._writeQueue.push({ chunk: '\x03', encoding: 'utf8', callback: () => undefined });
                }
                else {
                    this._terminal.write('\x03');
                }
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
        if (this._terminal.connected && !this._verifying && this._writeQueue.length === 0 && !this._flushing) {
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
     * After a reconnect of a fresh session: release the held input only when
     * the session behind THIS connection is proven to be the one it was typed
     * for. Proof is a session the kit lists under the pinned id, ephemeral, with
     * exactly the creation time recorded while the first connection was up.
     *
     * Everything short of that ends the shell and drops the input: no recorded
     * creation time to compare with, a failed lookup, no row, another creation
     * time, a session that is not ephemeral. An id can be reused, so "a session
     * with this id exists" proves nothing.
     *
     * `gen` names the connection being confirmed. An answer that arrives after
     * that connection is gone says nothing about the one that replaced it: it is
     * discarded, and the newer connection waits for its own confirmation.
     *
     * Nothing is deleted here. A reconnect to an id the kit no longer has makes
     * it create a plain session, but the list cannot tell that one from a
     * session someone else opened under the same id, so it is left in place
     * and named in the error.
     */
    async _confirmSameSession(gen) {
        const access = this._fresh;
        const id = this._pinnedId;
        let row;
        let known;
        let failure;
        try {
            [row, known] = await Promise.all([access.lookup(id), this._pinnedBirth]);
        }
        catch (err) {
            failure = err;
        }
        if (this.destroyed || gen !== this._linkGen)
            return;
        const now = sessionBirth(row);
        if (!failure && known !== undefined && now !== undefined && now === known) {
            this._verifying = false;
            this._connectFailed = false;
            // Handshake first (with the current size), then what was kept back.
            this._terminal.releaseSends();
            for (const chunk of this._heldOutput.splice(0))
                this.push(chunk);
            this.emit('connect');
            this._flushQueue();
            return;
        }
        this._heldOutput = [];
        let why;
        if (failure) {
            why = `it could not be confirmed after the reconnect (${failure instanceof Error ? failure.message : String(failure)})`;
        }
        else if (known === undefined) {
            why = 'its identity was never recorded, so the session behind the reconnect cannot be confirmed to be the same one';
        }
        else if (row === undefined) {
            why = 'it no longer exists';
        }
        else {
            why = 'another session now holds its id';
        }
        const stray = row !== undefined
            ? ` A session with id ${id} exists on the kit and was left untouched; if the reconnect created it, remove it with terminal.sessions.delete('${id}').`
            : '';
        this._endSession(new Error(`shell(): terminal session ${id} was lost: ${why}. Input written while disconnected was dropped, not sent to another session.${stray}`));
    }
    /** End the shell for good: reject held and later writes, end the readable side, stop reconnecting. */
    _endSession(error) {
        this._connectFailed = true;
        this._drainQueueWithError(error);
        this._pushEof();
        this.destroy(error);
    }
    /**
     * Resolve once the kit has named the session. Never rejects and never
     * outlives the connection: a close, or `timeoutMs` without the frame, also
     * resolve (the connection itself is up; `terminalId` is then still '').
     */
    _waitForTerminalId(timeoutMs) {
        if (this._terminal.terminalId || !this._terminal.connected)
            return Promise.resolve();
        return new Promise((resolve) => {
            const done = () => {
                clearTimeout(timer);
                this._terminal.off('terminal-id', done);
                this._terminal.off('disconnect', done);
                this._terminal.off('close', done);
                resolve();
            };
            const timer = setTimeout(done, timeoutMs);
            this._terminal.on('terminal-id', done);
            this._terminal.on('disconnect', done);
            this._terminal.on('close', done);
        });
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
        if (this._flushing || this._verifying || !this._terminal.connected)
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
    const { cwd, shell: shellType, user, env, cols = 80, rows = 24, terminalId, serviceIndex = 0, timeout = 30000, reconnect = false, } = options || {};
    // The host index picks the session: the containers proxy takes terminal_id
    // from it and overwrites the query. Index 0 is "no terminal id"; there the
    // kit joins the shared terminal 1 unless the connection asks for
    // `ephemeral=true`, which is what gives each shell() call its own session.
    const index = terminalId !== undefined && terminalId !== '' ? Number(terminalId) : serviceIndex;
    if (!Number.isInteger(index) || index < 0 || index > 65535 || (terminalId !== undefined && terminalId !== '' && index === 0)) {
        throw new TypeError(`shell(): ${terminalId !== undefined && terminalId !== '' ? `terminalId must be an integer from 1 to 65535, got ${JSON.stringify(terminalId)}` : `serviceIndex must be an integer from 0 to 65535, got ${JSON.stringify(serviceIndex)}`}`);
    }
    const wsUrl = getTerminalWsUrl(this, index);
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
    if (index === 0)
        terminalOptions.ephemeral = true;
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
    // Only a fresh session needs this: a named one is addressed by its id already.
    const sessions = () => (this.terminal ?? this.api?.terminal)?.sessions;
    const fresh = index === 0 ? {
        urlFor: (id) => getTerminalWsUrl(this, Number(id)),
        lookup: async (id) => {
            // `cache: false`: with the client's GET cache on, a cached list would
            // show the session as it was, still there with the same creation time,
            // after it is gone or its id reused. Identity is only ever read live.
            const response = await sessions().list({ cache: false });
            const rows = Array.isArray(response) ? response : response?.data;
            return Array.isArray(rows)
                ? rows.find((row) => String(row?.terminal_id) === id)
                : undefined;
        },
    } : undefined;
    return new TerminalShellImpl(wsUrl, terminalOptions, fresh);
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
