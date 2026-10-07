/**
 * High-level tunnel API: expose(), pull(), serve(). One-call wrappers that
 * build a TunnelSession, perform connect + bind, and install local
 * forwarding (HTTP fetch / TCP / Bun.serve) so callers don't have to wire
 * the lower-level protocol pieces themselves.
 */

import type { ProxyAuth, ProxyAuthPolicy } from "./proxy-auth.js";
import { TunnelSession, TunnelSessionError, type ConnectOptions, type BindOptions, type BindResult, type JoinTicket, type ResumedBind, type HelloResult, type TunnelCloseInfo, type InboundRouter } from "./tunnel-session.js";
import { setupAutoForwarding, type LocalTarget } from "./tunnel-http-pump.js";
import { FrameType } from "./tunnel-protocol-types.js";
import { decodeFrames } from "./tunnel-protocol-codec.js";
import { handleTcpStream } from "./tunnel-http-pump.js";

// `Bun.serve` is available at runtime under Bun but absent from @types/node.
// This repo does not ship @types/bun as a devDependency, so declare a minimal
// ambient shape for typecheck. If @types/bun is added later, remove this.
declare const Bun: {
  serve: (opts: {
    port: number;
    fetch: (req: Request) => Response | Promise<Response>;
  }) => { port: number; stop(force?: boolean): void };
};

export type { LocalTarget } from "./tunnel-http-pump.js";
export type { ConnectOptions, BindOptions, BindResult, JoinTicket, ResumedBind, HelloResult, TunnelCloseInfo } from "./tunnel-session.js";
export { TunnelSessionError } from "./tunnel-session.js";

export interface ExposeOptions {
  /**
   * Tunnel kit hostname (`PROJECT-CONTAINER-tunnel-1.SERVER.containers.hoody.com`)
   * or its URL. Not a container id. On a `withContainer()` client,
   * `box.tunnel.expose()` resolves this for you.
   */
  container?: string;
  /** Full WebSocket URL (overrides container). */
  url?: string;
  /**
   * @deprecated Ignored and never sent — the tunnel kit does not read it,
   * and sending the account token leaked it to the container. Use `kitAuth`.
   */
  token?: string;
  /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
  kitAuth?: ProxyAuth | ProxyAuthPolicy;
  /** Port to expose on the container. Use 0 for auto-assigned random port. */
  containerPort: number;
  /** Local target to forward traffic to. */
  to: LocalTarget;
  /** Evict any existing binding on the same port. */
  takeover?: boolean;
}

export interface PullOptions {
  container?: string;
  url?: string;
  /**
   * @deprecated Ignored and never sent — the tunnel kit does not read it,
   * and sending the account token leaked it to the container. Use `kitAuth`.
   */
  token?: string;
  /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
  kitAuth?: ProxyAuth | ProxyAuthPolicy;
  /** Port to bind on container loopback. Use 0 for auto-assigned random port. */
  containerPort: number;
  /** Local target to forward traffic to. */
  to: LocalTarget;
  /** Loopback host (default 127.0.0.1). */
  host?: string;
}

export interface ServeOptions {
  container?: string;
  url?: string;
  /**
   * @deprecated Ignored and never sent — the tunnel kit does not read it,
   * and sending the account token leaked it to the container. Use `kitAuth`.
   */
  token?: string;
  /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
  kitAuth?: ProxyAuth | ProxyAuthPolicy;
  /** Port to expose on the container. Use 0 for auto-assigned random port. */
  containerPort: number;
  /** Bun.serve-compatible fetch handler. */
  fetch: (req: Request) => Response | Promise<Response>;
}

const CONNECT_PATH = "/api/v1/tunnel/connect";

/**
 * The tunnel WebSocket URL for a `container` option: a hostname, or an
 * http(s)/ws(s) URL of the tunnel kit. A DNS name gets `wss://`, since the
 * public edge serves TLS only. Loopback, IP literals and single-label hosts
 * (a kit reached directly on a private network) keep plain `ws://`.
 */
export function tunnelConnectUrl(container: string): string {
  const raw = container.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    const u = new URL(raw);
    if (u.protocol === "https:") u.protocol = "wss:";
    else if (u.protocol === "http:") u.protocol = "ws:";
    else if (u.protocol !== "wss:" && u.protocol !== "ws:") {
      throw new Error(`tunnel: unsupported URL scheme "${u.protocol}" in \`container\``);
    }
    const path = u.pathname.replace(/\/+$/, "");
    u.pathname = path.endsWith(CONNECT_PATH) ? path : path + CONNECT_PATH;
    return u.toString();
  }
  const host = raw.replace(/\/+$/, "");
  const u = new URL(`http://${host}`);
  const hostname = u.hostname.toLowerCase().replace(/\.$/, "");
  const direct = hostname.startsWith("[")            // IPv6 literal
    || /^[\d.]+$/.test(hostname)                       // IPv4 literal (URL normalizes 127.1)
    || !hostname.includes(".")                         // localhost, a compose service name
    || hostname.endsWith(".localhost");
  return `${direct ? "ws" : "wss"}://${host}${CONNECT_PATH}`;
}

/**
 * The public URL of a container port exposed through the tunnel kit at
 * `kitUrl` (any form `container` or `url` accepts): the kit's host
 * `<project>-<container>-tunnel-<n>.<server>.<domain>` gives
 * `https://<project>-<container>-http-<port>.<server>.<domain>`, the proxy's
 * route to that port (kit catalog `http-{port}`). For the BIND_OK of a kit
 * run without HOODY_TUNNEL_PUBLIC_URL_PATTERN, whose `publicUrl` is null.
 * Undefined for a host of any other shape (a kit reached directly).
 */
export function exposedPortUrl(kitUrl: string, containerPort: number): string | undefined {
  if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) return undefined;
  const raw = kitUrl.trim();
  let hostname: string;
  try {
    hostname = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`).hostname;
  } catch {
    return undefined;
  }
  hostname = hostname.toLowerCase().replace(/\.$/, "");
  const dot = hostname.indexOf(".");
  if (dot < 0) return undefined;
  const label = /^([a-z0-9][a-z0-9-]*)-tunnel-\d+$/.exec(hostname.slice(0, dot));
  const rest = hostname.slice(dot + 1);
  if (!label || !rest.includes(".")) return undefined;
  return `https://${label[1]}-http-${containerPort}.${rest}`;
}

export interface TunnelHandle {
  /** Underlying tunnel session. */
  session: TunnelSession;
  /** Bind result with assigned port and optional publicUrl. */
  bind: BindResult;
  /** Public URL for the exposed service: BIND_OK's, else `exposedPortUrl()`'s. */
  publicUrl?: string | undefined;
  /** Close the tunnel session. */
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * High-level convenience: connect + expose in one call.
 *
 * Use `containerPort: 0` for auto-assigned random port.
 * Returns the public URL in `handle.publicUrl`.
 */
export async function expose(opts: ExposeOptions): Promise<TunnelHandle> {
  if (!opts.url && !opts.container) {
    throw new Error("tunnelExpose: either `url` or `container` is required");
  }
  const url = opts.url ?? tunnelConnectUrl(opts.container!);
  const session = new TunnelSession({ url, ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}) });
  // Install forwarding BEFORE connect() and bind(): a STREAM_OPEN batched
  // with (or arriving immediately after) BIND_OK would otherwise reach the
  // default dispatcher, which has no stream handler for it and silently drops
  // the frame. The router handles BIND_OK (via dispatchFrame) AND STREAM_OPEN.
  setupAutoForwarding(session, opts.to);
  try {
    await session.connect();
    const bind = await session.bind({
      kind: "http",
      mode: "expose",
      containerPort: opts.containerPort,
      ...(opts.takeover !== undefined && { takeover: opts.takeover }),
    });
    const handle: TunnelHandle = {
      session,
      bind,
      publicUrl: bind.publicUrl || exposedPortUrl(url, bind.containerPort),
      async close() {
        await session.close();
      },
      async [Symbol.asyncDispose]() {
        await session.close();
      },
    };
    return handle;
  } catch (err) {
    // Tear down the session on any failure so callers don't leak an open WebSocket.
    await session.close().catch(() => {});
    throw err;
  }
}

export interface ResumeExposeOptions {
  /** As ExposeOptions.container. */
  container?: string;
  /** Full WebSocket URL (overrides container). */
  url?: string;
  /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
  kitAuth?: ProxyAuth | ProxyAuthPolicy;
  /** The dropped session's id (`TunnelSession.id`, read while it was connected). */
  sessionId: string;
  /** Local target the resumed EXPOSE binds forward to. */
  to: LocalTarget;
  /** Abort the attempt: see ResumeControl.signal. */
  signal?: AbortSignal;
  /** See ResumeControl.handshakeTimeoutMs. */
  handshakeTimeoutMs?: number;
}

/** How a caller bounds and cancels one resume attempt. */
export interface ResumeControl {
  /**
   * Aborting ends the attempt for good: its socket is closed and its timers
   * cleared, and if the kit had already resumed the session its binds are
   * released (UNBIND) without one stream reaching the local target. The call
   * then rejects with `TunnelResumeAbortedError`.
   */
  signal?: AbortSignal;
  /** Give up on HELLO_OK after this long (the session's own limit is 30 s). */
  handshakeTimeoutMs?: number;
}

/** A resume attempt was aborted through its `signal`. */
export class TunnelResumeAbortedError extends Error {
  constructor() {
    super("tunnel: resume aborted");
    this.name = "TunnelResumeAbortedError";
  }
}

/**
 * session.connect() for a resume attempt, under the caller's signal and
 * handshake limit. Rejects after the session is fully closed when either ends
 * the attempt, including an abort that lands after HELLO_OK.
 */
async function connectResume(session: TunnelSession, control: ResumeControl): Promise<void> {
  const { signal } = control;
  if (signal?.aborted) throw new TunnelResumeAbortedError();
  let timedOut = false;
  let closed: Promise<void> | null = null;
  const stop = () => {
    // No stream opened from here on reaches the local target; everything else
    // (UNBIND_OK above all) still reaches the session so its close completes.
    session.setInboundRouter((frame, ws) => {
      if (frame.header.frameType === FrameType.StreamOpen) {
        session.sendReset(frame.header.streamId, "tunnel-closed");
        return;
      }
      session.dispatchFrame(frame, ws);
    });
    closed ??= session.close().catch(() => {});
  };
  const limit = control.handshakeTimeoutMs;
  const timer = limit === undefined
    ? null
    : setTimeout(() => { timedOut = true; stop(); }, Math.max(0, limit));
  signal?.addEventListener("abort", stop, { once: true });
  try {
    await session.connect();
  } catch (err) {
    if (closed) await closed;
    if (signal?.aborted) throw new TunnelResumeAbortedError();
    if (timedOut) throw new Error(`HELLO_OK: timed out after ${Math.max(0, limit!)}ms`);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  if (signal?.aborted) {
    stop();
    await closed;
    throw new TunnelResumeAbortedError();
  }
}

export interface ResumedTunnel {
  session: TunnelSession;
  /** HELLO_OK: `resumed` is true; `resumedBinds` are the binds the session holds again. */
  hello: HelloResult;
  /**
   * `hello.resumedBinds`, each EXPOSE bind with the public URL expose() gives
   * it (HELLO_OK carries none, so `exposedPortUrl()`'s).
   */
  binds: Array<ResumedBind & { publicUrl?: string | undefined }>;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Reclaim a dropped session while the kit still parks it with its bindings
 * (its `takeover_grace`, during which the port answers ALREADY_BOUND to anyone
 * else): HELLO with `resume.sessionId`, then the same forwarding expose()
 * installs, to `to`. Never takes a port over.
 *
 * Resolves null when the kit answered but did not resume (the grace is over or
 * the id is unknown); the fresh session it opened instead is closed. Throws
 * when there was no HELLO_OK (unreachable, or "resume grace expired").
 */
export async function resumeExpose(opts: ResumeExposeOptions): Promise<ResumedTunnel | null> {
  if (!opts.url && !opts.container) {
    throw new Error("tunnelResume: either `url` or `container` is required");
  }
  const url = opts.url ?? tunnelConnectUrl(opts.container!);
  const session = new TunnelSession({
    url,
    ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}),
    resumeSessionId: opts.sessionId,
  });
  // Resumed binds take traffic as soon as HELLO_OK is out, and their first
  // STREAM_OPEN can arrive in the same read: forwarding must exist before
  // connect(), since code after `await connect()` runs too late for it.
  setupAutoForwarding(session, opts.to);
  try {
    await connectResume(session, opts);
    const hello = session.hello;
    if (!hello?.resumed) {
      await session.close().catch(() => {});
      return null;
    }
    const binds = hello.resumedBinds.map((b) =>
      b.mode === "expose" ? { ...b, publicUrl: exposedPortUrl(url, b.containerPort) } : { ...b },
    );
    return {
      session,
      hello,
      binds,
      async close() {
        await session.close();
      },
      async [Symbol.asyncDispose]() {
        await session.close();
      },
    };
  } catch (err) {
    await session.close().catch(() => {});
    throw err;
  }
}

/**
 * High-level convenience: connect + pull in one call.
 */
export async function pull(opts: PullOptions): Promise<TunnelHandle> {
  if (!opts.url && !opts.container) {
    throw new Error("tunnelPull: either `url` or `container` is required");
  }
  const url = opts.url ?? tunnelConnectUrl(opts.container!);
  const session = new TunnelSession({ url, ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}) });
  try {
    await session.connect();
    // Install the TCP stream intercept BEFORE awaiting bind() so
    // STREAM_OPEN frames batched with or immediately following BIND_OK
    // aren't dropped by the default onmessage handler (which has no
    // stream handlers registered at that point). See expose() for the
    // race explanation.
    // Attach to EVERY WebSocket, not just the primary. A v2 session opens
    // secondary sockets and the kit may deliver STREAM_OPEN on any of them; a
    // primary-only interceptor silently drops those streams, because the default
    // handler has no stream handler registered for a kit-initiated id. expose()
    // covers every socket through setupAutoForwarding's inbound router.
    for (const ws of session.getAllWebSockets()) {
      if (!ws) continue;
      ws.onmessage = (event: MessageEvent) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        let result;
        try { result = decodeFrames(data); } catch { return; }
        for (const frame of result.frames) {
          if (frame.header.frameType === FrameType.StreamOpen) {
            // Guard JSON.parse on peer-controlled STREAM_OPEN payload. Without
            // this, malformed JSON would throw synchronously and kill the
            // onmessage handler for the rest of the session.
            let payload: any;
            try {
              payload = JSON.parse(new TextDecoder().decode(frame.payload));
            } catch {
              session.sendReset(frame.header.streamId, "malformed-stream-open");
              continue;
            }
            if (payload.kind === "tcp") {
              handleTcpStream(session, frame.header.streamId, opts.to);
              continue;
            }
            // This session binds only tcp PULL ports; nothing answers another kind.
            session.sendReset(frame.header.streamId, "unsupported-stream-kind");
            continue;
          }
          session.dispatchFrame(frame, ws);
        }
      };
    }
    const bind = await session.bind({
      kind: "tcp",
      mode: "pull",
      containerPort: opts.containerPort,
      ...(opts.host !== undefined && { host: opts.host }),
    });
    return {
      session,
      bind,
      // Propagate bind.publicUrl (parity with expose()). Without this,
      // pull() returns `handle.publicUrl === undefined` even when the bind
      // result carries a public URL.
      publicUrl: bind.publicUrl,
      async close() { await session.close(); },
      async [Symbol.asyncDispose]() { await session.close(); },
    };
  } catch (err) {
    await session.close().catch(() => {});
    throw err;
  }
}

/** Routes a PULL session's inbound frames: tcp STREAM_OPEN to `to`, everything else to the session. */
function pullRouter(session: TunnelSession, to: LocalTarget): InboundRouter {
  return (frame, ws) => {
    if (frame.header.frameType === FrameType.StreamOpen) {
      let payload: any;
      try {
        payload = JSON.parse(new TextDecoder().decode(frame.payload));
      } catch {
        session.sendReset(frame.header.streamId, "malformed-stream-open");
        return;
      }
      if (payload.kind === "tcp") {
        handleTcpStream(session, frame.header.streamId, to);
        return;
      }
      session.sendReset(frame.header.streamId, "unsupported-stream-kind");
      return;
    }
    session.dispatchFrame(frame, ws);
  };
}

export interface ResumePullOptions {
  /** As PullOptions.container. */
  container?: string;
  /** Full WebSocket URL (overrides container). */
  url?: string;
  /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
  kitAuth?: ProxyAuth | ProxyAuthPolicy;
  /** The dropped session's id (`TunnelSession.id`, read while it was connected). */
  sessionId: string;
  /** Local TCP target the resumed PULL binds forward to. */
  to: LocalTarget;
  /** Abort the attempt: see ResumeControl.signal. */
  signal?: AbortSignal;
  /** See ResumeControl.handshakeTimeoutMs. */
  handshakeTimeoutMs?: number;
}

/**
 * resumeExpose() for a pull() session: reclaim a dropped session while the kit
 * still parks it, and forward its resumed PULL binds' TCP streams to `to`.
 * Resolves null when the kit answered but did not resume; throws when there
 * was no HELLO_OK.
 */
export async function resumePull(opts: ResumePullOptions): Promise<ResumedTunnel | null> {
  if (!opts.url && !opts.container) {
    throw new Error("tunnelResume: either `url` or `container` is required");
  }
  const url = opts.url ?? tunnelConnectUrl(opts.container!);
  const session = new TunnelSession({
    url,
    ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}),
    resumeSessionId: opts.sessionId,
  });
  // Before connect(), as in resumeExpose(): a resumed bind's first STREAM_OPEN
  // can arrive in the same read as HELLO_OK.
  session.setInboundRouter(pullRouter(session, opts.to));
  try {
    await connectResume(session, opts);
    const hello = session.hello;
    if (!hello?.resumed) {
      await session.close().catch(() => {});
      return null;
    }
    return {
      session,
      hello,
      binds: hello.resumedBinds.map((b) => ({ ...b })),
      async close() { await session.close(); },
      async [Symbol.asyncDispose]() { await session.close(); },
    };
  } catch (err) {
    await session.close().catch(() => {});
    throw err;
  }
}

/** How long the kit parks a dropped session's binds by default (`--takeover-grace`). */
export const TUNNEL_RESUME_WINDOW_MS = 60_000;

export interface KeepTunnelAliveOptions {
  /** Which driver opened the tunnel: decides how resumed binds forward. */
  mode: "expose" | "pull";
  /** As ExposeOptions.container. */
  container?: string;
  /** Full WebSocket URL (overrides container). */
  url?: string;
  /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
  kitAuth?: ProxyAuth | ProxyAuthPolicy;
  /** Local target the binds forward to. */
  to: LocalTarget;
  /** How long after a drop to keep trying to resume. Default: the kit's 60 s hold. */
  resumeWindowMs?: number;
  /** First delay between attempts (default 500 ms); it doubles up to `maxRetryDelayMs` (default 5 s). */
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  /** The connection dropped; a resume is about to be tried. */
  onLost?: (info: TunnelCloseInfo) => void;
  /** One resume attempt failed and another will follow. */
  onRetry?: (attempt: number, error: Error) => void;
  /** The session is back, with its binds. */
  onResumed?: (session: TunnelSession) => void;
}

/** How a kept tunnel ended. */
export interface TunnelEnd {
  /** True when `close()` ended it. False when it dropped and could not be resumed. */
  deliberate: boolean;
  /** Why it ended, in words. */
  reason: string;
  /** `RESUME_EXPIRED` when a drop could not be resumed before the hold ran out. */
  code?: "RESUME_EXPIRED";
}

export interface KeptTunnel {
  /** The current session: replaced after each successful resume. */
  readonly session: TunnelSession;
  /** Settles (never rejects) when the tunnel is over. */
  readonly ended: Promise<TunnelEnd>;
  /** Close the tunnel for good, releasing its binds. */
  close(): Promise<void>;
}

/**
 * Keep an expose() / pull() tunnel up across connection drops. When the
 * session drops without `close()`, the kit parks its binds for the takeover
 * grace; this reconnects with the session id inside that window so the same
 * ports keep serving. `ended` settles with the reason once the tunnel is over:
 * a deliberate close, or a drop that could not be resumed in time.
 */
export function keepTunnelAlive(
  handle: { session: TunnelSession; close(): Promise<void> },
  opts: KeepTunnelAliveOptions,
): KeptTunnel {
  if (!opts.url && !opts.container) {
    throw new Error("keepTunnelAlive: either `url` or `container` is required");
  }
  const url = opts.url ?? tunnelConnectUrl(opts.container!);
  const windowMs = opts.resumeWindowMs ?? TUNNEL_RESUME_WINDOW_MS;
  const maxDelay = opts.maxRetryDelayMs ?? 5_000;
  let current: { session: TunnelSession; close(): Promise<void> } = handle;
  let sessionId = handle.session.id;
  let closedByCaller = false;
  let over = false;
  let wake: (() => void) | null = null;
  /** The resume in flight: its abort handle, and the loop that ends once the attempt is torn down. */
  let resumeAbort: AbortController | null = null;
  let resuming: Promise<void> | null = null;
  let finish!: (end: TunnelEnd) => void;
  const ended = new Promise<TunnelEnd>((resolve) => { finish = resolve; });
  const end = (e: TunnelEnd) => { if (!over) { over = true; finish(e); } };

  const sleep = (ms: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { wake = null; resolve(); }, ms);
    wake = () => { clearTimeout(timer); wake = null; resolve(); };
  });

  const resume = async (lost: TunnelCloseInfo, dropped: TunnelSession): Promise<void> => {
    // The dropped session is finished whatever comes next: close what it still
    // holds (a v2 session keeps its secondary sockets open when only the
    // primary drops), so neither a resume nor a failure leaves them behind.
    await dropped.close().catch(() => {});
    if (closedByCaller) return;
    try { opts.onLost?.(lost); } catch { /* observer errors never stop the resume */ }
    const deadline = Date.now() + windowMs;
    let delay = opts.retryDelayMs ?? 500;
    let attempt = 0;
    let last = lost.reason;
    while (!closedByCaller) {
      // The hold is checked before every attempt, and an attempt gets only the
      // time that is left of it: nothing is tried, or waited for, past the deadline.
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      attempt++;
      const abort = new AbortController();
      resumeAbort = abort;
      try {
        const args = {
          url,
          ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}),
          sessionId,
          to: opts.to,
          signal: abort.signal,
          handshakeTimeoutMs: remaining,
        };
        const resumed = opts.mode === "pull" ? await resumePull(args) : await resumeExpose(args);
        if (resumed) {
          if (closedByCaller) { await resumed.close().catch(() => {}); return; }
          current = resumed;
          sessionId = resumed.session.id;
          watch(resumed.session);
          try { opts.onResumed?.(resumed.session); } catch { /* observer */ }
          return;
        }
        // The kit answered but holds no parked session under that id: either its
        // grace ran out, or it has not noticed the drop yet. Only time tells.
        last = "the kit no longer holds the session (its resume grace is over)";
      } catch (err) {
        if (closedByCaller) return;
        const error = err instanceof Error ? err : new Error(String(err));
        if (error instanceof TunnelSessionError && error.code === "RESUME_EXPIRED") {
          end({ deliberate: false, reason: `${lost.reason}; resume refused: ${error.message}`, code: "RESUME_EXPIRED" });
          return;
        }
        last = error.message;
        try { opts.onRetry?.(attempt, error); } catch { /* observer */ }
      } finally {
        if (resumeAbort === abort) resumeAbort = null;
      }
      if (closedByCaller) return;
      const left = deadline - Date.now();
      if (left <= 0) break;
      await sleep(Math.min(delay, left));
      delay = Math.min(delay * 2, maxDelay);
    }
    if (closedByCaller) return;
    end({
      deliberate: false,
      reason: `${lost.reason}; could not resume within ${Math.round(windowMs / 1000)} s: ${last}`,
      code: "RESUME_EXPIRED",
    });
  };

  const closed = (session: TunnelSession, info: TunnelCloseInfo) => {
    if (closedByCaller || over) return;
    if (info.deliberate) { end({ deliberate: true, reason: info.reason }); return; }
    const run = resume(info, session).finally(() => { if (resuming === run) resuming = null; });
    resuming = run;
  };
  const watch = (session: TunnelSession) => {
    // A session that ended before this point already told its listeners; one
    // registered now would wait forever. Its recorded end is acted on instead.
    const already = session.closeInfo;
    if (already) { closed(session, already); return; }
    session.onClose((info) => closed(session, info));
  };
  watch(handle.session);

  return {
    get session() { return current.session; },
    ended,
    async close() {
      closedByCaller = true;
      // A resume in flight is ended here, not left to finish: its socket and
      // handshake timer go now, the backoff sleep is cut short, and a session
      // the kit had already resumed is unbound before `ended` settles.
      resumeAbort?.abort();
      wake?.();
      try {
        await current.close();
        await resuming;
      } finally {
        end({ deliberate: true, reason: "closed by client" });
      }
    },
  };
}

/**
 * High-level convenience: start a local Bun.serve + connect + expose.
 * Bun only: it runs the handler with `Bun.serve`.
 */
export async function serve(opts: ServeOptions): Promise<TunnelHandle & { url: string }> {
  if (typeof Bun === "undefined") {
    throw new Error(
      "tunnel.serve() requires Bun (it runs the handler with Bun.serve). "
        + "On Node, start your own server with http.createServer() and pass its port to expose().",
    );
  }
  // Start local server on random port
  const server = Bun.serve({
    port: 0,
    fetch: opts.fetch,
  });
  const localPort = server.port;
  try {
    const handle = await expose({
      ...opts,
      to: { host: "127.0.0.1", port: localPort },
    });
    return {
      ...handle,
      // If the kit assigned a public URL (tunnel is exposed externally),
      // use that. Otherwise fall back to the local server URL — NOT
      // opts.containerPort (which is the *container* port, not local).
      url: handle.publicUrl ?? `http://127.0.0.1:${localPort}`,
      async close() {
        server.stop(true);
        await handle.close();
      },
      async [Symbol.asyncDispose]() {
        server.stop(true);
        await handle.close();
      },
    };
  } catch (err) {
    server.stop(true);
    throw err;
  }
}

/** Re-export for direct low-level access. */
export { TunnelSession } from "./tunnel-session.js";

/** Re-export connect for the tunnel namespace */
export { TunnelSession as connect } from "./tunnel-session.js";
