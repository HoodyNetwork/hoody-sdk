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
import { TerminalClient, type TerminalClientOptions } from './terminal-client.js';
import { assertContainerScoped, type TerminalExecOptions, type TerminalExecResult } from './terminal-run.js';
import { type ProxyAuth, type ProxyAuthPolicy, isProxyAuthPolicy } from './proxy-auth.js';
import { terminalHostLabel } from './terminal-host.js';

export interface TerminalShellOptions {
  /** Working directory */
  cwd?: string;
  /** Shell type (bash, zsh, fish, sh) */
  shell?: string;
  /** System user */
  user?: string;
  /** Environment variables */
  env?: Record<string, string> | string[];
  /** Terminal columns (default: 80) */
  cols?: number;
  /** Terminal rows (default: 24) */
  rows?: number;
  /**
   * Join the terminal session with this id (1-65535) instead of opening a
   * fresh one. Everyone who joins the same id shares one shell: its input,
   * its output and its state. `1` is the terminal the web UI opens by default.
   * A session opened this way outlives the connection.
   *
   * Omitted (the default), every `shell()` call gets a session of its own: the
   * kit assigns it an id in 40000-65535 (`shell.terminalId`) and cleans it up
   * after the connection closes.
   */
  terminalId?: number | string;
  /**
   * Older spelling of `terminalId`: the terminal host index. `0` (the default)
   * is "no terminal id", a fresh session; any other value joins that session.
   */
  serviceIndex?: number;
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
  /**
   * Auto-reconnect on disconnect (default: false). A reconnect comes back to
   * the same session: a fresh one is pinned to the id the kit gave it. Input
   * written while the connection is down is held and sent once the session is
   * confirmed to be the same one. If it is gone (the kit removes an idle
   * fresh session about a minute after its last client leaves), the shell
   * ends with an error and the held input is dropped; it is never sent to
   * another session.
   */
  reconnect?: boolean;
}

/**
 * Interactive PTY shell session — a Node.js Duplex stream wrapping TerminalClient.
 *
 * Supports `.pipe()`, `.write()`, `.on('data')`, etc.
 *
 * Note: PTY sessions do NOT report exit codes. The shell stays alive until
 * you call `.destroy()` or the connection drops.
 */
export interface TerminalShell extends Duplex {
  /**
   * Resolves when the WebSocket connection is established and the kit has
   * named the session, so `terminalId` is set. A kit that does not name the
   * session within a few seconds does not hold `ready` back: it resolves
   * with `terminalId` still ''.
   */
  readonly ready: Promise<void>;
  /** Whether the underlying WebSocket is connected */
  readonly connected: boolean;
  /** Server-assigned terminal session ID */
  readonly terminalId: string;
  /**
   * Resize the PTY. While a reconnected fresh session is still being
   * confirmed, the size is only recorded; it is sent once the session is
   * confirmed.
   */
  resize(cols: number, rows: number): void;
  /**
   * Send a signal to the running process.
   * - SIGINT: sends Ctrl+C (\x03) to the PTY. With `reconnect`, while a
   *   reconnected fresh session is still being confirmed, the Ctrl+C is held
   *   with the queued input, in order, and sent only once the session is
   *   confirmed; if it is not, it is dropped with the rest.
   * - Any other signal: disconnects the WebSocket (server kills the process)
   */
  kill(signal?: string): void;
  /** Disconnect and clean up */
  destroy(error?: Error): this;
}

// ---------------------------------------------------------------------------
// Module augmentation
// ---------------------------------------------------------------------------

declare module './hoody-client.js' {
  interface HoodyClient {
    /**
     * Open an interactive PTY shell session to the container.
     *
     * Each call opens a fresh session of its own; pass `terminalId` to join a
     * shared one instead (see TerminalShellOptions.terminalId).
     *
     * Returns a Duplex stream that supports `.pipe()`.
     * Requires a container-scoped client (call `withContainer()` first).
     *
     * @example
     * ```ts
     * const scoped = await client.withContainer(container);
     * const sh = scoped.shell();
     * await sh.ready;
     * sh.write('echo hello\n');
     * sh.pipe(process.stdout);
     * ```
     */
    shell(options?: TerminalShellOptions): TerminalShell;
  }
}

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
function getTerminalWsUrl(client: any, serviceIndex = 0): string {
  const t = client.urlTemplates?.['terminal'];
  if (!t?.projectId || !t?.containerId || !t?.server) {
    throw new Error('shell() requires a container-scoped client with terminal URL templates');
  }
  const domain: string =
    typeof client.resolveContainersDomain === 'function'
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

/** One row of the kit's session list, as far as the shell reads it. */
interface SessionRow { is_ephemeral?: unknown; created_at?: unknown }

/**
 * What a fresh (ephemeral) shell needs to come back to its own session after
 * a reconnect. Absent for a shell that joined a named session: that one is
 * addressed by its id from the start.
 */
interface FreshSessionAccess {
  /** WebSocket URL that joins the session with this id. */
  urlFor(terminalId: string): string;
  /** The session's row in the kit's list; undefined when it is not listed. */
  lookup(terminalId: string): Promise<SessionRow | undefined>;
}

/**
 * The creation time in a session row, when the row is usable as identity
 * evidence: an ephemeral session with a real creation time. Anything else is
 * no evidence (undefined).
 */
function sessionBirth(row: SessionRow | undefined): number | string | undefined {
  if (!row || row.is_ephemeral !== true) return undefined;
  const at = row.created_at;
  if (typeof at === 'number') return Number.isFinite(at) && at > 0 ? at : undefined;
  return typeof at === 'string' && at !== '' ? at : undefined;
}

class TerminalShellImpl extends Duplex implements TerminalShell {
  private _terminal: TerminalClient;
  private _ready: Promise<void>;
  private _writeQueue: Array<{
    chunk: Buffer | string;
    encoding: BufferEncoding;
    callback: (error?: Error | null) => void;
  }> = [];
  private _flushing = false;
  private _connectFailed = false;
  private _eofPushed = false;
  /** Set for a fresh session opened with `reconnect` (see FreshSessionAccess). */
  private _fresh: FreshSessionAccess | undefined;
  /** Id of the fresh session reconnects are pinned to; '' until the kit names it. */
  private _pinnedId = '';
  /**
   * Creation time of the pinned session, read while the first connection was
   * still up: the evidence a reconnect is checked against. Resolves undefined
   * when there is none (lookup failed, no row, no creation time, or the
   * connection changed before the answer came).
   */
  private _pinnedBirth: Promise<number | string | undefined> | undefined;
  /** Bumped on every connect and disconnect: names one connection. */
  private _linkGen = 0;
  private _everConnected = false;
  /**
   * A reconnect is up but the session behind it is not confirmed yet. Nothing
   * reaches the socket in this state: the TerminalClient connection is held
   * (TerminalClient.holdSends: no handshake, input, resize, pause or resume),
   * writes and Ctrl+C wait in the queue, and output is kept back in
   * `_heldOutput` until it is known whose it is.
   */
  private _verifying = false;
  private _heldOutput: Buffer[] = [];
  /**
   * Without `reconnect`: the transport error of a connection whose close is
   * still to be reported. The shell ends on that close (see the 'error'
   * handler); the timer ends it if no close comes.
   */
  private _lostError: Error | null = null;
  private _lostTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, terminalOptions: TerminalClientOptions, fresh?: FreshSessionAccess) {
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
    this._terminal.on('data', (chunk: Buffer) => {
      // Not ours until confirmed: delivered on success, discarded otherwise.
      if (this._verifying) { this._heldOutput.push(chunk); return; }
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
    this._terminal.on('error', (err: Error) => {
      if (!terminalOptions.reconnect) {
        // A transport error on an open connection comes just before its
        // close. Ending the shell at the error reported a lost link as a
        // normal close (1000 "Stream destroyed", BT2-TERM-004): end it at
        // the close instead, so 'disconnect' carries the close's own code.
        if (this._terminal.connected && !this.destroyed) {
          if (!this._lostError) {
            this._lostError = err;
            // The close follows the error at once (the transport's frame
            // settle waits at most 1 s); this only bounds a close that never comes.
            this._lostTimer = setTimeout(() => this._endLost(), 2000);
            (this._lostTimer as { unref?: () => void }).unref?.();
          }
          return;
        }
        this.destroy(err);
      }
      // When reconnect is enabled, TerminalClient handles retries internally
    });

    this._fresh = terminalOptions.reconnect ? fresh : undefined;

    // Pin a fresh session to the id the kit gave it. Its first URL is the
    // "no terminal id" host with ephemeral=true, and connecting there again
    // would open ANOTHER session: a reconnect must name this one instead.
    this._terminal.on('terminal-id', (id: string) => {
      const access = this._fresh;
      if (!access || this._pinnedId || !id) return;
      this._pinnedId = id;
      this._terminal.retarget(access.urlFor(id), { ephemeral: false });
      // Every later connection opens held: nothing is sent on it until the
      // session behind it is confirmed (_confirmSameSession).
      this._terminal.holdSends();
      // Evidence only if it was read on the connection that got the id: an
      // answer that arrives after that connection is gone could describe
      // whatever holds the id by then.
      const gen = this._linkGen;
      this._pinnedBirth = access.lookup(id).then(
        (row) => (this._linkGen === gen ? sessionBirth(row) : undefined),
        () => undefined,
      );
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
    this._terminal.on('disconnect', (code: number, reason: string) => {
      this._linkGen++;
      // The close of a lost connection: ends the shell before the drain
      // below, whose write errors would end it first with a generic error.
      if (this._lostError) {
        this.emit('disconnect', code, reason);
        this._endLost(code);
        return;
      }
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
        this._endSession(new Error(
          `shell(): the connection was lost (code: ${code}) before the terminal kit named the session, so it cannot be rejoined`,
        ));
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
    this._ready = this._terminal.connect().then(() => this._waitForTerminalId(
      Math.min(TERMINAL_ID_WAIT_MS, terminalOptions.timeout ?? 30000),
    )).catch((err: Error) => {
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
    this._ready.catch(() => {});
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  get connected(): boolean {
    return this._terminal.connected;
  }

  get terminalId(): string {
    return this._terminal.terminalId;
  }

  resize(cols: number, rows: number): void {
    this._terminal.resize(cols, rows);
  }

  kill(signal?: string): void {
    if (!signal || signal === 'SIGINT') {
      // Send Ctrl+C. Through the same gate as every write: on a connection
      // that is not confirmed yet (or behind input that is still queued) it
      // waits in the queue, so it can never reach a shell before the input
      // typed ahead of it, or a shell that is not this one.
      if (this._terminal.connected) {
        if (this._verifying || this._lostError || this._writeQueue.length > 0 || this._flushing) {
          this._writeQueue.push({ chunk: '\x03', encoding: 'utf8', callback: () => undefined });
        } else {
          this._terminal.write('\x03');
        }
      }
    } else {
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

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (this._connectFailed) {
      callback(new Error('Connection failed'));
      return;
    }

    // FIX: Check queue state to prevent out-of-order
    // writes. If the queue is non-empty or currently flushing, new writes
    // must go through the queue to preserve ordering.
    // A lost connection (_lostError) still reads as connected until its close
    // is reported: a write sent into it would fail and end the shell first.
    if (this._terminal.connected && !this._verifying && !this._lostError && this._writeQueue.length === 0 && !this._flushing) {
      this._terminal.write(chunk, encoding, callback);
    } else {
      // Queue writes until connected and queue is drained
      this._writeQueue.push({ chunk, encoding, callback });
    }
  }

  override _read(_size: number): void {
    // Data is pushed from TerminalClient's 'data' event
    if (this._terminal) {
      this._terminal.resume();
    }
  }

  // FIX: Implement _final so that shell.end() properly tears
  // down the remote PTY session instead of leaving it orphaned.
  override _final(callback: (error?: Error | null) => void): void {
    this._terminal.disconnect('stream ended');
    callback();
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (this._lostTimer) clearTimeout(this._lostTimer);
    this._lostTimer = null;
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
  private async _confirmSameSession(gen: number): Promise<void> {
    const access = this._fresh!;
    const id = this._pinnedId;
    let row: SessionRow | undefined;
    let known: number | string | undefined;
    let failure: unknown;
    try {
      [row, known] = await Promise.all([access.lookup(id), this._pinnedBirth]);
    } catch (err) {
      failure = err;
    }
    if (this.destroyed || gen !== this._linkGen) return;
    const now = sessionBirth(row);
    if (!failure && known !== undefined && now !== undefined && now === known) {
      this._verifying = false;
      this._connectFailed = false;
      // Handshake first (with the current size), then what was kept back.
      this._terminal.releaseSends();
      for (const chunk of this._heldOutput.splice(0)) this.push(chunk);
      this.emit('connect');
      this._flushQueue();
      return;
    }
    this._heldOutput = [];
    let why: string;
    if (failure) {
      why = `it could not be confirmed after the reconnect (${failure instanceof Error ? failure.message : String(failure)})`;
    } else if (known === undefined) {
      why = 'its identity was never recorded, so the session behind the reconnect cannot be confirmed to be the same one';
    } else if (row === undefined) {
      why = 'it no longer exists';
    } else {
      why = 'another session now holds its id';
    }
    const stray = row !== undefined
      ? ` A session with id ${id} exists on the kit and was left untouched; if the reconnect created it, remove it with terminal.sessions.delete('${id}').`
      : '';
    this._endSession(new Error(
      `shell(): terminal session ${id} was lost: ${why}. Input written while disconnected was dropped, not sent to another session.${stray}`,
    ));
  }

  /**
   * Without `reconnect`: end the shell after its connection was lost (the
   * transport error held by the 'error' handler). The session itself may
   * still be running on the kit, so the error says how to rejoin it.
   */
  private _endLost(code?: number): void {
    if (this._lostTimer) clearTimeout(this._lostTimer);
    this._lostTimer = null;
    const cause = this._lostError;
    this._lostError = null;
    if (!cause || this.destroyed) return;
    const id = this._terminal.terminalId;
    this._connectFailed = true;
    this._pushEof();
    this.destroy(Object.assign(new Error(
      `shell(): the connection was lost${code !== undefined ? ` (code: ${code})` : ''}: ${cause.message}. `
      + `The session${id ? ` ${id}` : ''} may still be running on the kit: rejoin it with shell({ terminalId${id ? `: '${id}'` : ''} }), or open the shell with reconnect: true`,
    ), { cause }));
  }

  /** End the shell for good: reject held and later writes, end the readable side, stop reconnecting. */
  private _endSession(error: Error): void {
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
  private _waitForTerminalId(timeoutMs: number): Promise<void> {
    if (this._terminal.terminalId || !this._terminal.connected) return Promise.resolve();
    return new Promise<void>((resolve) => {
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
  private _pushEof(): void {
    if (!this._eofPushed) {
      this._eofPushed = true;
      this.push(null);
    }
  }

  /**
   * Drain all queued writes with an error. Called on destroy or connection failure.
   * FIX: Ensures all pending write callbacks are invoked.
   */
  private _drainQueueWithError(error: Error): void {
    const pending = this._writeQueue.splice(0);
    for (const queued of pending) {
      queued.callback(error);
    }
  }

  // FIX: Use queueMicrotask to prevent deep recursion
  // if TerminalClient.write() invokes callbacks synchronously. This turns
  // the recursive flush into a trampolined iteration.
  private _flushQueue(): void {
    if (this._flushing || this._verifying || this._lostError || !this._terminal.connected) return;
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
      if (!this._terminal.connected || this.destroyed || this._lostError) {
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

function shellImpl(
  this: HoodyClient,
  options?: TerminalShellOptions,
): TerminalShell {
  assertContainerScoped(this);

  const {
    cwd,
    shell: shellType,
    user,
    env,
    cols = 80,
    rows = 24,
    terminalId,
    serviceIndex = 0,
    timeout = 30000,
    reconnect = false,
  } = options || {};

  // The host index picks the session: the containers proxy takes terminal_id
  // from it and overwrites the query. Index 0 is "no terminal id"; the kit
  // serves it only with `ephemeral=true`, which is what gives each shell()
  // call its own session.
  const index = terminalId !== undefined && terminalId !== '' ? Number(terminalId) : serviceIndex;
  if (!Number.isInteger(index) || index < 0 || index > 65535 || (terminalId !== undefined && terminalId !== '' && index === 0)) {
    throw new TypeError(
      `shell(): ${terminalId !== undefined && terminalId !== '' ? `terminalId must be an integer from 1 to 65535, got ${JSON.stringify(terminalId)}` : `serviceIndex must be an integer from 0 to 65535, got ${JSON.stringify(serviceIndex)}`}`,
    );
  }
  // Both given and different: refused, as a per-call serviceIndex that
  // disagrees with terminal_id is everywhere else, never one silently picked.
  if (terminalId !== undefined && terminalId !== '' && options?.serviceIndex !== undefined && options.serviceIndex !== index) {
    throw new TypeError(
      `shell(): serviceIndex ${JSON.stringify(options.serviceIndex)} conflicts with terminalId ${JSON.stringify(terminalId)}; pass terminalId alone`,
    );
  }

  const wsUrl = getTerminalWsUrl(this, index);

  const terminalOptions: TerminalClientOptions = {
    cols,
    rows,
    timeout,
    reconnect,
  };
  if (cwd) terminalOptions.cwd = cwd;
  if (shellType) terminalOptions.shell = shellType;
  if (user) terminalOptions.user = user;
  if (env) terminalOptions.env = env;
  if (index === 0) terminalOptions.ephemeral = true;

  // Pass Kit proxy authentication to the terminal client
  if ((this as any).kitAuth) {
    const raw = (this as any).kitAuth;
    if (isProxyAuthPolicy(raw)) {
      const resolved = raw.services?.terminal || raw.default;
      if (resolved) terminalOptions.kitAuth = resolved;
    } else {
      terminalOptions.kitAuth = raw as ProxyAuth;
    }
  }

  // Only a fresh session needs this: a named one is addressed by its id already.
  const sessions = (): any => ((this as any).terminal ?? (this as any).api?.terminal)?.sessions;
  const fresh: FreshSessionAccess | undefined = index === 0 ? {
    urlFor: (id) => getTerminalWsUrl(this, Number(id)),
    lookup: async (id) => {
      // `cache: false`: with the client's GET cache on, a cached list would
      // show the session as it was, still there with the same creation time,
      // after it is gone or its id reused. Identity is only ever read live.
      const response = await sessions().list({ cache: false });
      const rows: unknown = Array.isArray(response) ? response : response?.data;
      return Array.isArray(rows)
        ? rows.find((row) => String((row as { terminal_id?: unknown })?.terminal_id) === id) as SessionRow | undefined
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
export function patchTerminalExecPrototype(): void {
  const prototype = HoodyClient.prototype as HoodyClient & Record<string | symbol, unknown>;
  if (prototype[TERMINAL_EXEC_PATCH_MARKER]) return;

  prototype.shell = shellImpl;

  prototype[TERMINAL_EXEC_PATCH_MARKER] = true;
}


// `terminal.run` lives in terminal-run.ts (browser-safe); re-exported so existing imports keep working.
export { installTerminalRun } from './terminal-run.js';
export type { TerminalExecOptions, TerminalExecResult } from './terminal-run.js';

// Auto-invoke at import time.
// When imported via hoody-client.ts there is a circular dependency:
//   hoody-client -> terminal-exec -> hoody-client (not yet initialized)
// In that case HoodyClient is not yet available and the patch will be
// applied later by patchHoodyClientMetrics() inside the HoodyClient
// constructor. The try/catch makes this safe for both import orderings.
try {
  patchTerminalExecPrototype();
} catch {
  // HoodyClient not yet initialized — will be patched later by hoody-client.ts
}
