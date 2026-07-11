/**
 * High-level tunnel API: expose(), pull(), serve(). One-call wrappers that
 * build a TunnelSession, perform connect + bind, and install local
 * forwarding (HTTP fetch / TCP / Bun.serve) so callers don't have to wire
 * the lower-level protocol pieces themselves.
 */

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
  /** Container tunnel WebSocket URL or container hostname. */
  container?: string;
  /** Full WebSocket URL (overrides container). */
  url?: string;
  /** Bearer token for tunnel authentication. */
  token: string;
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
  token: string;
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
  token: string;
  /** Port to expose on the container. Use 0 for auto-assigned random port. */
  containerPort: number;
  /** Bun.serve-compatible fetch handler. */
  fetch: (req: Request) => Response | Promise<Response>;
}

export interface TunnelHandle {
  /** Underlying tunnel session. */
  session: TunnelSession;
  /** Bind result with assigned port and optional publicUrl. */
  bind: BindResult;
  /** Public URL for the exposed service (from BIND_OK). */
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
  if (!opts.token) {
    throw new Error("tunnelExpose: `token` is required");
  }
  const url = opts.url ?? `ws://${opts.container}/api/v1/tunnel/connect`;
  const session = new TunnelSession({ url, token: opts.token });
  try {
    await session.connect();
    // Install forwarding BEFORE awaiting bind() — otherwise a STREAM_OPEN
    // batched with (or arriving immediately after) BIND_OK is dispatched
    // through the default connect() onmessage handler, which has no
    // stream handlers registered and silently drops the frame. The
    // auto-forwarder's onmessage handles BIND_OK (via dispatchFrame) AND
    // STREAM_OPEN, so installing it first closes the race.
    setupAutoForwarding(session, opts.to);
    const bind = await session.bind({
      kind: "http",
      mode: "expose",
      containerPort: opts.containerPort,
      ...(opts.takeover !== undefined && { takeover: opts.takeover }),
    });
    const handle: TunnelHandle = {
      session,
      bind,
      publicUrl: bind.publicUrl,
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

/**
 * High-level convenience: connect + pull in one call.
 */
export async function pull(opts: PullOptions): Promise<TunnelHandle> {
  if (!opts.url && !opts.container) {
    throw new Error("tunnelPull: either `url` or `container` is required");
  }
  if (!opts.token) {
    throw new Error("tunnelPull: `token` is required");
  }
  const url = opts.url ?? `ws://${opts.container}/api/v1/tunnel/connect`;
  const session = new TunnelSession({ url, token: opts.token });
  try {
    await session.connect();
    // Install the TCP stream intercept BEFORE awaiting bind() so
    // STREAM_OPEN frames batched with or immediately following BIND_OK
    // aren't dropped by the default onmessage handler (which has no
    // stream handlers registered at that point). See expose() for the
    // race explanation.
    const origWs = (session as any).ws as WebSocket;
    origWs.onmessage = (event: MessageEvent) => {
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
            (session as any).resetStream?.(frame.header.streamId);
            continue;
          }
          if (payload.kind === "tcp") {
            handleTcpStream(session, frame.header.streamId, opts.to);
            continue;
          }
        }
        (session as any).dispatchFrame(frame, origWs);
      }
    };
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
