/**
 * SOCKS5 over a hoody-tunnel PULL bind.
 *
 * Binds a loopback port inside the container and terminates SOCKS5 on every
 * connection that arrives there. Nothing listens on the local machine: the
 * tunnel WebSocket is the only transport, so there is no port to firewall and no
 * local listener to secure.
 *
 * Pair this with hoody-egress (`upstream = socks5h://127.0.0.1:<containerPort>`)
 * to get a public HTTPS proxy whose exit IP is this machine.
 */

import { TunnelSession, type BindResult } from './tunnel-session.js';
import { FrameType, type Frame } from './tunnel-protocol-types.js';
import { decodeFrames } from './tunnel-protocol-codec.js';
import {
  handleSocks5Stream,
  createServerState,
  type Socks5ServerOptions,
  type Socks5Stream,
  type Socks5ServerState,
} from './socks5-server.js';

export interface TunnelSocks5Options extends Socks5ServerOptions {
  /** Full `wss://…/api/v1/tunnel/connect` URL. */
  url: string;
  token: string;
  /** Loopback port to bind inside the container. 0 or omitted = kernel-assigned. */
  containerPort?: number;
  /** Loopback host. The kit rejects anything non-loopback. Default 127.0.0.1. */
  host?: string;
  /** Resume a prior session after a disconnect. */
  resumeSessionId?: string;
}

export interface TunnelSocks5Handle {
  session: TunnelSession;
  bind: BindResult;
  /** The loopback port the kit actually bound. Feed this to the egress upstream. */
  containerPort: number;
  /**
   * Live conversations on the exit, counted from stream creation rather than
   * from the dial, so streams still handshaking are included. That is what
   * `maxConcurrent` caps.
   */
  activeStreams(): number;
  /**
   * Fires once if the session ends on its own (WebSocket drop, kit restart),
   * as opposed to a caller-initiated close(). The bind is gone at that point,
   * so anything pointing at the container port must be unwired.
   */
  onSessionLost(cb: () => void): () => void;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/** Adapt one tunnel stream id to the transport seam the SOCKS5 machine expects. */
function makeStream(
  session: TunnelSession,
  streamId: number,
  onDone?: () => void,
): Socks5Stream {
  let onData: ((b: Uint8Array) => void | Promise<void>) | undefined;
  let onEnd: (() => void) | undefined;
  let onReset: (() => void) | undefined;
  let detachClose: (() => void) | undefined;
  let done = false;
  /** Fires once, whichever side ends the stream, so the owner can forget it. */
  const finished = () => { if (!done) { done = true; onDone?.(); } };

  session.onStream(streamId, (frame: Frame) => {
    switch (frame.header.frameType) {
      case FrameType.Data:
        // Returning the promise defers inbound WINDOW replenishment until the
        // sink has consumed the bytes, so credit tracks the real consumer.
        return onData?.(frame.payload);
      case FrameType.Eof:
        // A half-close: the peer is done SENDING, but the origin's response is
        // still on its way back through us. Tearing down here dropped the
        // handle from `live` and detached the session-close listener, so a
        // WebSocket drop mid-response could no longer collect the still-open
        // upstream socket. Cleanup belongs to our own end()/reset() or an
        // inbound RESET.
        onEnd?.();
        return;
      case FrameType.Reset:
        session.offStream(streamId);
        detachClose?.();
        finished();
        onReset?.();
        return;
      default:
        return;
    }
  });

  // An abrupt WebSocket drop produces no per-stream EOF, so without this the
  // upstream socket would linger until its own idle timeout.
  const withClose = session as unknown as { onClose?: (cb: () => void) => () => void };
  if (typeof withClose.onClose === 'function') {
    detachClose = withClose.onClose(() => onReset?.());
  }

  // Use the session's lifecycle call, not a raw frame: it also closes this
  // stream's credit gate. A raw RESET left the gate allocated for the life of
  // the session, so every refused stream leaked one.
  const sendReset = (reason: string) => session.sendReset(streamId, reason);

  return {
    write: (bytes) => session.sendData(streamId, bytes),
    endWrite() {
      // EOF only: the peer stops expecting data from us, but the stream stays
      // attached so its still-open direction keeps working. `end()` below is the
      // teardown; conflating the two turned the origin's half-close into a full
      // close and dropped whatever the client was still uploading.
      try { session.sendEof(streamId); } catch { /* session already gone */ }
    },
    end() {
      try { session.sendEof(streamId); } finally {
        session.offStream(streamId);
        detachClose?.();
        finished();
      }
    },
    reset(reason) {
      try { sendReset(reason); } catch { /* session already gone */ } finally {
        session.offStream(streamId);
        detachClose?.();
        finished();
      }
    },
    onData(cb) { onData = cb; },
    onEnd(cb) { onEnd = cb; },
    onReset(cb) { onReset = cb; },
  };
}

/**
 * Connect, bind a loopback PULL port, and serve SOCKS5 on it.
 */
export async function tunnelSocks5(opts: TunnelSocks5Options): Promise<TunnelSocks5Handle> {
  if (!opts.url) throw new Error('tunnelSocks5: `url` is required');
  if (!opts.auth?.username || !opts.auth?.password) {
    // Refuse rather than default to anonymous: this port is reachable by every
    // process in the container.
    throw new Error('tunnelSocks5: `auth` with username and password is required');
  }

  // Validate BEFORE connecting. `handleSocks5Stream` throws on a bad
  // maxConcurrent, but by then makeStream() has already registered onStream and
  // onClose for that id, and the throw escapes the WebSocket message handler —
  // so the stream is never reset or deregistered and every open leaks a
  // listener. Fail at the call that can still report it to the caller.
  if (opts.maxConcurrent !== undefined
      && (!Number.isInteger(opts.maxConcurrent) || opts.maxConcurrent < 1)) {
    throw new Error(
      `tunnelSocks5: maxConcurrent must be a positive integer, got ${String(opts.maxConcurrent)}`,
    );
  }

  const session = new TunnelSession({
    url: opts.url,
    token: opts.token,
    ...(opts.resumeSessionId !== undefined && { resumeSessionId: opts.resumeSessionId }),
  });
  const state: Socks5ServerState = createServerState();
  const live = new Map<number, { close(reason?: string): void }>();

  try {
    await session.connect();

    // Install on EVERY WebSocket, before bind() resolves. Two distinct races:
    // a v2 session can deliver STREAM_OPEN on a secondary socket, and a
    // STREAM_OPEN batched with BIND_OK arrives before bind() returns.
    for (const ws of session.getAllWebSockets()) {
      if (!ws) continue;
      ws.onmessage = (event: MessageEvent) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        let decoded;
        try { decoded = decodeFrames(data); } catch { return; }
        for (const frame of decoded.frames) {
          if (frame.header.frameType === FrameType.StreamOpen) {
            const streamId = frame.header.streamId;
            let payload: { kind?: string };
            try {
              payload = JSON.parse(new TextDecoder().decode(frame.payload));
            } catch {
              // Peer-controlled JSON: a throw here would kill the message loop
              // for every other stream on this socket.
              (session as unknown as { resetStream?: (id: number) => void }).resetStream?.(streamId);
              continue;
            }
            if (payload.kind === 'tcp') {
              // `live` exists so close() can tear down conversations still in
              // progress. Without the removal below it also retained every
              // finished one — with its socket and closures — so memory grew
              // with TOTAL connections served, not concurrent ones. A
              // long-running exit proxy is exactly where that matters.
              // An over-cap stream is refused synchronously inside
              // handleSocks5Stream, so its onDone runs BEFORE the set below.
              // Inserting unconditionally would file an already-dead handle
              // that nothing ever removes — the same unbounded growth the
              // delete was added to prevent, reached from the refusal path.
              let doneEarly = false;
              const handle = handleSocks5Stream(
                makeStream(session, streamId, () => {
                  doneEarly = true;
                  live.delete(streamId);
                }),
                opts,
                state,
              );
              if (!doneEarly) live.set(streamId, handle);
              continue;
            }
            // Only TCP conversations belong on this session — the bind below is
            // `kind: 'tcp'`. Refuse anything else HERE rather than passing it to
            // the generic dispatcher: that pins the stream id in the session's
            // `streamWs` map, which is unpinned only on EOF or RESET, and a peer
            // farming stream ids sends neither. Admission control does not catch
            // it either, because no SOCKS stream is constructed and `state.active`
            // never moves — so `maxConcurrent` is bypassed entirely and the map
            // grows for the life of the tunnel. Mirrors the malformed-JSON arm.
            (session as unknown as { resetStream?: (id: number) => void }).resetStream?.(streamId);
            continue;
          }
          session.dispatchFrame(frame, ws);
        }
      };
    }

    const bind = await session.bind({
      kind: 'tcp',
      mode: 'pull',
      containerPort: opts.containerPort ?? 0,
      ...(opts.host !== undefined && { host: opts.host }),
    });

    let closingByCaller = false;
    // Remember that the session was lost. startLocalExit subscribes only
    // after several awaited calls, and a drop inside that window used to fire
    // into an empty listener set and be forgotten — leaving a dead exit that
    // reported itself healthy.
    let sessionLost = false;
    const lostListeners = new Set<() => void>();
    const announceLost = () => {
      for (const cb of lostListeners) { try { cb(); } catch { /* listener's problem */ } }
      lostListeners.clear();
    };
    session.onClose(() => {
      if (closingByCaller) return;
      sessionLost = true;
      announceLost();
    });

    const close = async () => {
      closingByCaller = true;
      for (const handle of live.values()) {
        try { handle.close('tunnel closing'); } catch { /* best effort */ }
      }
      live.clear();
      await session.close();
    };

    return {
      session,
      bind,
      containerPort: bind.containerPort,
      activeStreams: () => state.active,
      onSessionLost(cb: () => void) {
        if (sessionLost) { queueMicrotask(() => { try { cb(); } catch { /* listener's problem */ } }); return () => {}; }
        lostListeners.add(cb);
        return () => { lostListeners.delete(cb); };
      },
      close,
      [Symbol.asyncDispose]: close,
    };
  } catch (err) {
    await session.close().catch(() => {});
    throw err;
  }
}
