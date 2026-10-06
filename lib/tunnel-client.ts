/**
 * High-level tunnel API: expose(), pull(), serve(). One-call wrappers that
 * build a TunnelSession, perform connect + bind, and install local
 * forwarding (HTTP fetch / TCP / Bun.serve) so callers don't have to wire
 * the lower-level protocol pieces themselves.
 */

import type { ProxyAuth, ProxyAuthPolicy } from "./proxy-auth.js";
import { TunnelSession, type ConnectOptions, type BindOptions, type BindResult, type JoinTicket, type ResumedBind, type HelloResult } from "./tunnel-session.js";
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
export type { ConnectOptions, BindOptions, BindResult, JoinTicket, ResumedBind, HelloResult } from "./tunnel-session.js";

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
    await session.connect();
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

/**
 * High-level convenience: start a local Bun.serve + connect + expose.
 */
export async function serve(opts: ServeOptions): Promise<TunnelHandle & { url: string }> {
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
