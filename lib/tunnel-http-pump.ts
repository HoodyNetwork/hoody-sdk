/**
 * HTTP/TCP stream forwarding for tunnel sessions. Handles STREAM_OPEN
 * dispatch, request body streaming, WebSocket upgrades, and TCP forwarding.
 */

import { type Frame, FrameType } from "./tunnel-protocol-types.js";
import { decodeFrames } from "./tunnel-protocol-codec.js";
import type { TunnelSession } from "./tunnel-session.js";
import * as http from "node:http";
import * as net from "node:net";
import { sdkLocalFdBudget } from "./tunnel-fd-budget.js";
import { getFastPool } from "./tunnel-local-http-fast.js";

export interface LocalTarget {
  host: string;
  port: number;
}

const MAX_CHUNK = 65536;

const agentCache = new Map<string, any>();

function getAgent(host: string, port: number): any {
  const key = `${host}:${port}`;
  let agent = agentCache.get(key);
  if (agent) return agent;
  agent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30_000,
    maxSockets: 64,
    maxFreeSockets: 16,
    scheduling: "lifo",
  });
  agentCache.set(key, agent);
  return agent;
}

export function destroyAllLocalAgents() {
  for (const agent of agentCache.values()) {
    try { agent.destroy(); } catch {}
  }
  agentCache.clear();
}

// Reject peer-supplied HTTP method, request target, and header name/value
// bytes that contain CR, LF, or NUL. Without this, a peer could splice
// `\r\nX-Injected: yes` into a header value and smuggle an extra request
// into the local HTTP service via the tunnel.
const HTTP_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function hasCrLfOrNul(s: string): boolean {
  return /[\r\n\0]/.test(s);
}
function isValidHttpMethod(m: unknown): boolean {
  return typeof m === "string" && HTTP_TOKEN_RE.test(m);
}
function isValidRequestTarget(t: unknown): boolean {
  // HTTP/1.1 framing only breaks on CR/LF/NUL and whitespace; other control
  // bytes don't enable smuggling, so we do not reject them here.
  return typeof t === "string" && t.length > 0 && !/[\r\n\0\s]/.test(t);
}
function isValidHeaderName(n: unknown): boolean {
  return typeof n === "string" && HTTP_TOKEN_RE.test(n);
}
function isValidHeaderValue(v: unknown): boolean {
  // Framing-critical bytes only: reject CR/LF/NUL. Other control bytes are
  // not a framing risk and pass through.
  return typeof v === "string" && !hasCrLfOrNul(v);
}
/**
 * Return peer-controlled `headers` payload as an iterable of `[name, value]`
 * pairs ONLY when each entry is itself a 2-tuple. A naive `Array.isArray`
 * guard accepts `headers: [1]` or `headers: [{}]` and crashes at the
 * destructure — async HTTP paths fire-and-forget, so the throw surfaces as
 * an unhandled rejection.
 */
function safeHeaderEntries(raw: unknown): Array<[unknown, unknown]> {
  if (!Array.isArray(raw)) return [];
  const out: Array<[unknown, unknown]> = [];
  for (const entry of raw) {
    if (Array.isArray(entry) && entry.length >= 2) out.push([entry[0], entry[1]]);
  }
  return out;
}

function sendResetFrame(session: TunnelSession, streamId: number, reason: string) {
  const reasonBytes = new TextEncoder().encode(reason);
  const resetPayload = new Uint8Array(2 + reasonBytes.length);
  new DataView(resetPayload.buffer).setUint16(0, 0x0006, false);
  resetPayload.set(reasonBytes, 2);
  session.sendFrame({
    header: { frameType: FrameType.Reset, streamId, length: resetPayload.length },
    payload: resetPayload,
  });
}

async function forwardFetch(
  session: TunnelSession,
  streamId: number,
  openPayload: any,
  target: LocalTarget,
) {
  const { method, target: reqTarget, headers: reqHeaders } = openPayload;

  // Validate peer-controlled method/target to prevent HTTP request smuggling.
  if (!isValidHttpMethod(method) || !isValidRequestTarget(reqTarget)) {
    sendResetFrame(session, streamId, "invalid-method-or-target");
    session.offStream(streamId);
    return;
  }

  session.onStream(streamId, (f) => {
    if (f.header.frameType === FrameType.Eof || f.header.frameType === FrameType.Reset) {
      session.offStream(streamId);
    }
  });

  let headerLines = `Host: ${target.host}:${target.port}\r\n`;
  // Shape-validate each header entry before destructuring.
  for (const [name, value] of safeHeaderEntries(reqHeaders)) {
    const lower = String(name).toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "upgrade"
        || lower === "keep-alive" || lower === "transfer-encoding"
        || lower === "proxy-authenticate" || lower === "proxy-authorization"
        || lower === "te" || lower === "trailer") continue;
    // Drop headers whose name or value contains CR/LF/NUL/invalid tokens.
    if (!isValidHeaderName(name) || !isValidHeaderValue(value)) continue;
    headerLines += `${name}: ${value}\r\n`;
  }

  try {
    const pool = getFastPool(target.host, target.port);
    const res = await pool.request(method, reqTarget, headerLines);
    session.sendResponseHead(streamId, res.status, res.headers);
    if (res.body.length > 0) {
      if (res.body.length <= MAX_CHUNK) {
        await session.sendData(streamId, res.body);
      } else {
        for (let off = 0; off < res.body.length; off += MAX_CHUNK) {
          const end = Math.min(off + MAX_CHUNK, res.body.length);
          await session.sendData(streamId, res.body.subarray(off, end));
        }
      }
    }
    session.sendEof(streamId);
    session.offStream(streamId);
  } catch {
    sendResetFrame(session, streamId, "local connect failed");
    session.offStream(streamId);
  }
}

async function forwardHttpStream(
  session: TunnelSession,
  streamId: number,
  openPayload: any,
  target: LocalTarget,
) {
  const { method, target: reqTarget, headers: reqHeaders } = openPayload;

  // Validate peer-controlled method/target to prevent HTTP request smuggling.
  if (!isValidHttpMethod(method) || !isValidRequestTarget(reqTarget)) {
    sendResetFrame(session, streamId, "invalid-method-or-target");
    session.offStream(streamId);
    return;
  }

  let headerLines = `Host: ${target.host}:${target.port}\r\n`;
  // Shape-validate each header entry before destructuring.
  for (const [name, value] of safeHeaderEntries(reqHeaders)) {
    const lower = String(name).toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "upgrade"
        || lower === "keep-alive" || lower === "transfer-encoding"
        || lower === "content-length"
        || lower === "proxy-authenticate" || lower === "proxy-authorization"
        || lower === "te" || lower === "trailer") continue;
    // Drop headers whose name or value contains CR/LF/NUL/invalid tokens.
    if (!isValidHeaderName(name) || !isValidHeaderValue(value)) continue;
    headerLines += `${name}: ${value}\r\n`;
  }

  const methodUpper = String(method).toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(methodUpper);

  let finished = false;
  type BufferedFrame = { kind: "data" | "eof" | "reset"; payload?: Uint8Array };
  const earlyBuffer: BufferedFrame[] = [];
  // Cap pre-ready earlyBuffer bytes to defend against peer-driven OOM:
  // STREAM_OPEN + continuous DATA frames arriving before
  // pool.requestStreaming() resolves would otherwise grow the buffer without
  // bound while the session replenishes WINDOW credit on every handled frame.
  const HTTP_EARLY_BUFFER_CAP = 1 * 1024 * 1024; // 1 MiB
  let earlyBufferedBytes = 0;
  let handleReady: { writeBody: (c: Uint8Array) => Promise<void>; endBody: () => void; abort: () => void } | null = null;

  session.onStream(streamId, (f) => {
    if (finished) return;
    // dispatch may return a Promise when the local socket is backpressured;
    // returning it from the FrameHandler defers inbound WINDOW replenish so
    // the peer pauses sending.
    const dispatch = (b: BufferedFrame): void | Promise<void> => {
      if (!handleReady) {
        const incoming = b.kind === "data" && b.payload ? b.payload.byteLength : 0;
        if (earlyBufferedBytes + incoming > HTTP_EARLY_BUFFER_CAP) {
          finished = true;
          sendResetFrame(session, streamId, "early-buffer-overflow");
          session.offStream(streamId);
          earlyBuffer.length = 0;
          earlyBufferedBytes = 0;
          return;
        }
        earlyBufferedBytes += incoming;
        earlyBuffer.push(b);
        return;
      }
      if (b.kind === "data" && hasBody) return handleReady.writeBody(b.payload!);
      else if (b.kind === "eof") handleReady.endBody();
      else if (b.kind === "reset") {
        finished = true;
        handleReady.abort();
        session.offStream(streamId);
      }
    };
    if (f.header.frameType === FrameType.Data) return dispatch({ kind: "data", payload: f.payload });
    else if (f.header.frameType === FrameType.Eof) return dispatch({ kind: "eof" });
    else if (f.header.frameType === FrameType.Reset) return dispatch({ kind: "reset" });
  });

  try {
    const pool = getFastPool(target.host, target.port);
    const handle = await pool.requestStreaming(method, reqTarget, headerLines);
    // If the early-buffer overflowed (finished=true) while
    // requestStreaming() was in flight, abort the resolved handle so the
    // pool slot / socket FD is released instead of waiting forever for
    // chunks. Also observe the internal responsePromise so the socket-close
    // rejection triggered by abort() does not surface as an unhandled
    // rejection (Node 22 default: process exit) for library consumers that
    // lack a global unhandledRejection handler.
    if (finished) {
      try { handle.abort(); } catch {}
      try { handle.waitResponse().catch(() => {}); } catch {}
      earlyBuffer.length = 0;
      return;
    }
    // Keep `handleReady` null while draining so new frames arriving during
    // `await writeBody` are queued via the onStream dispatcher into
    // `earlyBuffer` instead of bypassing the still-draining buffer. We
    // drain via .shift() so any frames pushed during the await are picked
    // up in FIFO order before we expose `handleReady`.
    while (earlyBuffer.length > 0) {
      if (finished) break;
      const b = earlyBuffer.shift()!;
      if (b.kind === "data" && hasBody) await handle.writeBody(b.payload!);
      else if (b.kind === "eof") handle.endBody();
      else if (b.kind === "reset") {
        finished = true;
        handle.abort();
        try { handle.waitResponse().catch(() => {}); } catch {}
        session.offStream(streamId);
      }
    }
    earlyBuffer.length = 0;
    // If the early-buffer cap was breached DURING the async drain (new
    // frames arriving while we were awaiting writeBody set finished=true
    // via the dispatcher's overflow path), the handle was never aborted and
    // handle.waitResponse() would hang until the upstream timeout, leaking
    // the fast-pool slot + local FD. Abort now.
    if (finished) {
      try { handle.abort(); } catch {}
      try { handle.waitResponse().catch(() => {}); } catch {}
      return;
    }
    // All pre-handoff frames drained in order; safe to expose the handle to
    // the onStream dispatcher for live frames.
    handleReady = handle;

    if (!hasBody) handle.endBody();

    const res = await handle.waitResponse();
    session.sendResponseHead(streamId, res.status, res.headers);
    if (res.body.length > 0) {
      if (res.body.length <= MAX_CHUNK) {
        await session.sendData(streamId, res.body);
      } else {
        for (let off = 0; off < res.body.length; off += MAX_CHUNK) {
          const end = Math.min(off + MAX_CHUNK, res.body.length);
          await session.sendData(streamId, res.body.subarray(off, end));
        }
      }
    }
    finished = true;
    session.sendEof(streamId);
    session.offStream(streamId);
  } catch {
    if (!finished) {
      finished = true;
      sendResetFrame(session, streamId, "local connect failed");
      session.offStream(streamId);
    }
  }
}

export async function handleHttpStream(
  session: TunnelSession,
  streamId: number,
  openPayload: any,
  target: LocalTarget,
) {
  forwardHttpStream(session, streamId, openPayload, target);
}

function forwardUpgradeToLocal(
  session: TunnelSession,
  streamId: number,
  openPayload: any,
  target: LocalTarget,
) {
  const { method, target: reqTarget, headers: reqHeaders } = openPayload;

  const sendReset = (reason: string) => {
    const reasonBytes = new TextEncoder().encode(reason);
    const resetPayload = new Uint8Array(2 + reasonBytes.length);
    new DataView(resetPayload.buffer).setUint16(0, 0x0006, false);
    resetPayload.set(reasonBytes, 2);
    session.sendFrame({
      header: { frameType: FrameType.Reset, streamId, length: resetPayload.length },
      payload: resetPayload,
    });
  };

  // Validate peer-controlled method/target BEFORE touching the socket.
  if (!isValidHttpMethod(method) || !isValidRequestTarget(reqTarget)) {
    sendReset("invalid-method-or-target");
    session.offStream(streamId);
    return;
  }
  const headerObj: Record<string, string> = {};
  // Shape-validate each header entry before destructuring.
  for (const [name, value] of safeHeaderEntries(reqHeaders)) {
    // Drop CR/LF/NUL/invalid-token headers so they cannot be spliced into the upgrade request.
    if (!isValidHeaderName(name) || !isValidHeaderValue(value)) continue;
    headerObj[name as string] = value as string;
  }
  headerObj["host"] = `${target.host}:${target.port}`;

  const socket = net.createConnection({ host: target.host, port: target.port });
  socket.setNoDelay(true);
  // Destroy the upstream socket when the session closes. Per-stream EOF/Reset
  // frames alone don't fire on an abrupt session teardown (WS drop without
  // FIN), so the upstream TCP socket would otherwise stay open until its
  // server-side idle timeout.
  //
  // Guard the session.onClose call (parity with handleTcpStream). Test
  // harnesses pass mock TunnelSession instances without onClose; the
  // unguarded call crashes at runtime.
  const sessionWithClose = session as { onClose?: (cb: () => void) => () => void };
  const detachSessionClose = typeof sessionWithClose.onClose === 'function'
    ? sessionWithClose.onClose(() => {
        try { socket.destroy(); } catch {}
        session.offStream(streamId);
      })
    : () => {};
  socket.once("close", () => {
    detachSessionClose();
  });

  let buffer = Buffer.alloc(0);
  let headersParsed = false;
  const MAX_HEAD = 32 * 1024; // cap at 32KB of header data
  const MAX_CHUNK = 65536;

  const onHeadersReady = (statusLine: string, headerLines: string[], leftover: Buffer) => {
    headersParsed = true;

    const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})/);
    const status = match ? parseInt(match[1]!, 10) : 502;

    const respHeaders: [string, string][] = [];
    for (const line of headerLines) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      const lower = name.toLowerCase();
      if (["keep-alive", "transfer-encoding"].includes(lower)) continue;
      respHeaders.push([name, value]);
    }

    session.sendResponseHead(streamId, status, respHeaders);

    // If the upstream didn't actually switch protocols, forward body bytes as
    // regular HTTP body. We don't parse chunked/content-length — just stream
    // the rest of the socket until it closes.
    if (leftover.length > 0) {
      // Fire-and-forget: called inline from a Node socket data callback.
      // sendData() is async (flow-control) and can reject on a closed
      // session/stream; attach a catch so the rejection doesn't escape as
      // an unhandled promise rejection.
      session.sendData(streamId, new Uint8Array(leftover)).catch(() => {
        try { socket.destroy(); } catch {}
      });
    }

    session.onStream(streamId, (f) => {
      if (f.header.frameType === FrameType.Data) {
        // Await socket drain before inbound WINDOW replenishment.
        const ok = socket.write(Buffer.from(f.payload));
        if (!ok) {
          return new Promise<void>((resolve) => {
            const cleanup = () => {
              socket.off('drain', onDrain);
              socket.off('close', onClose);
              socket.off('error', onClose);
            };
            const onDrain = () => { cleanup(); resolve(); };
            const onClose = () => { cleanup(); resolve(); };
            socket.once('drain', onDrain);
            socket.once('close', onClose);
            socket.once('error', onClose);
          });
        }
        return;
      } else if (f.header.frameType === FrameType.Eof || f.header.frameType === FrameType.Reset) {
        socket.end();
        session.offStream(streamId);
      }
    });
  };

  socket.on("data", async (chunk: Buffer) => {
    if (headersParsed) {
      // Pause the socket so credit backpressure flows back to the local
      // peer (TCP buffer fills, peer slows). Resume after the awaits clear.
      socket.pause();
      try {
        if (chunk.length <= MAX_CHUNK) {
          await session.sendData(streamId, new Uint8Array(chunk));
        } else {
          for (let offset = 0; offset < chunk.length; offset += MAX_CHUNK) {
            const end = Math.min(offset + MAX_CHUNK, chunk.length);
            await session.sendData(streamId, new Uint8Array(chunk.subarray(offset, end)));
          }
        }
      } catch {
        // Stream/session closed mid-send — drop further bytes.
        socket.destroy();
        return;
      }
      socket.resume();
      return;
    }

    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > MAX_HEAD) {
      sendReset("response headers too large");
      socket.destroy();
      return;
    }

    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    const headerBlock = buffer.slice(0, headerEnd).toString("utf8");
    const leftover = buffer.slice(headerEnd + 4);
    const lines = headerBlock.split("\r\n");
    const statusLine = lines.shift() || "";
    onHeadersReady(statusLine, lines, leftover);
  });

  socket.on("end", () => {
    if (headersParsed) {
      session.sendEof(streamId);
    } else {
      sendReset("upstream closed before response");
    }
    session.offStream(streamId);
  });

  socket.on("error", () => {
    if (!headersParsed) {
      sendReset("local connect failed");
    }
    session.offStream(streamId);
  });

  socket.on("connect", () => {
    // Normalize `Connection:` to "Upgrade" only. Don't append ", close":
    // Node's http.Server honors `Connection: close` literally and closes
    // the socket right after emitting 101, which breaks real WebSocket
    // upgrades. Bare "Upgrade" matches what real WS clients send and lets
    // both Node and spec-compliant servers hand over the socket cleanly.
    const connKey = Object.keys(headerObj).find((k) => k.toLowerCase() === "connection");
    if (connKey) delete headerObj[connKey];
    headerObj["Connection"] = "Upgrade";

    const lines: string[] = [`${method} ${reqTarget} HTTP/1.1`];
    for (const [name, value] of Object.entries(headerObj)) {
      lines.push(`${name}: ${value}`);
    }
    lines.push("", "");
    socket.write(lines.join("\r\n"));
  });
}

/**
 * Handle an incoming TCP STREAM_OPEN by forwarding to a local TCP server.
 */
export function handleTcpStream(
  session: TunnelSession,
  streamId: number,
  target: LocalTarget,
) {
  const { createConnection } = net;

  let localReady = false;
  let localSocket: any = null;
  let finished = false;
  const buffered: Frame[] = [];
  let bufferedBytes = 0;
  // Bound the pre-connect queue so a peer flooding DATA before the local
  // TCP socket opens can't OOM the process. When we hit the cap, reset the
  // stream back to the peer and drop the socket attempt.
  const PRE_CONNECT_BUFFER_CAP = 1 * 1024 * 1024; // 1 MiB

  session.onStream(streamId, (frame) => {
    if (finished) return;
    if (frame.header.frameType === FrameType.Data) {
      if (localReady && localSocket) {
        // Return a Promise that resolves on socket `drain` when the kernel
        // buffer is full, so the session defers inbound WINDOW
        // replenishment until the local sink has consumed the bytes.
        const s = localSocket;
        const ok = s.write(Buffer.from(frame.payload));
        if (!ok) {
          return new Promise<void>((resolve) => {
            const cleanup = () => {
              s.off('drain', onDrain);
              s.off('close', onClose);
              s.off('error', onClose);
            };
            const onDrain = () => { cleanup(); resolve(); };
            const onClose = () => { cleanup(); resolve(); };
            s.once('drain', onDrain);
            s.once('close', onClose);
            s.once('error', onClose);
          });
        }
        return;
      }
      const incoming = frame.payload?.byteLength ?? 0;
      if (bufferedBytes + incoming > PRE_CONNECT_BUFFER_CAP) {
        finished = true;
        buffered.length = 0;
        bufferedBytes = 0;
        try { (session as { resetStream?: (id: number) => void }).resetStream?.(streamId); } catch {}
        session.offStream(streamId);
        return;
      }
      buffered.push(frame);
      bufferedBytes += incoming;
    } else if (frame.header.frameType === FrameType.Eof || frame.header.frameType === FrameType.Reset) {
      // Mark finished so any later `connect` callback knows not to flush
      // stale buffered bytes and so any more incoming frames are ignored.
      finished = true;
      if (localSocket) localSocket.end();
      // Drop any buffered bytes that arrived before EOF/RESET — they must
      // not leak to the local service post-close.
      buffered.length = 0;
      session.offStream(streamId);
    }
  });

  const socket = createConnection({ host: target.host, port: target.port }, () => {
    if (finished) {
      // Stream was closed (EOF/RESET) before the TCP connect completed.
      // Destroy the socket without touching the (already-cleared) buffer.
      try { socket.destroy(); } catch {}
      return;
    }
    localSocket = socket;
    localReady = true;
    for (const f of buffered) {
      socket.write(Buffer.from(f.payload));
    }
    buffered.length = 0;
  });

  // Destroy the upstream TCP socket when the session itself closes, not just
  // when a stream EOF/RESET arrives — abrupt WS drops without frame-level EOF
  // would otherwise leak the local TCP socket until the local service's idle
  // timeout fires. `onClose` is guarded with a typeof check so test harnesses
  // using a mock TunnelSession that omits the hook still work.
  const sessionWithClose = session as unknown as {
    onClose?: (fn: () => void) => () => void;
  };
  let detachSessionClose: (() => void) | null = null;
  if (typeof sessionWithClose.onClose === 'function') {
    detachSessionClose = sessionWithClose.onClose(() => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch {}
      session.offStream(streamId);
    });
    socket.once("close", () => {
      detachSessionClose?.();
    });
  }

  socket.on("data", async (chunk: Buffer) => {
    // Pause local socket while we await credit so TCP backpressure flows
    // back to the user's local service. Resume once enqueued.
    socket.pause();
    try {
      await session.sendData(streamId, new Uint8Array(chunk));
    } catch {
      socket.destroy();
      return;
    }
    socket.resume();
  });

  socket.on("end", () => {
    if (finished) return;
    finished = true;
    session.sendEof(streamId);
    session.offStream(streamId);
  });

  socket.on("error", () => {
    if (finished) return;
    finished = true;
    const reason = new TextEncoder().encode("local connect failed");
    const resetPayload = new Uint8Array(2 + reason.length);
    new DataView(resetPayload.buffer).setUint16(0, 0x0006, false);
    resetPayload.set(reason, 2);
    session.sendFrame({
      header: { frameType: FrameType.Reset, streamId, length: resetPayload.length },
      payload: resetPayload,
    });
    // Unregister the stream handler — without this the handler leaks.
    session.offStream(streamId);
  });
}

/**
 * Set up automatic stream forwarding for a session.
 * Intercepts STREAM_OPEN frames and forwards to the appropriate local target.
 */
export function setupAutoForwarding(
  session: TunnelSession,
  httpTarget: LocalTarget,
  tcpTarget?: LocalTarget,
) {
  const allWs = session.getAllWebSockets();
  for (const ws of allWs) {
    if (!ws) continue;
    attachAutoForwarder(ws, session, httpTarget, tcpTarget);
  }
}

function attachAutoForwarder(
  ws: WebSocket,
  session: TunnelSession,
  httpTarget: LocalTarget,
  tcpTarget?: LocalTarget,
) {
  ws.onmessage = (event: MessageEvent) => {
    const data = new Uint8Array(event.data as ArrayBuffer);
    let result;
    try { result = decodeFrames(data); } catch { return; }
    for (const frame of result.frames) {
      if (frame.header.frameType === FrameType.StreamOpen) {
        const streamId = frame.header.streamId;
        session.dispatchFrame(frame, ws);
        // Peer-supplied JSON: a malformed STREAM_OPEN payload would throw
        // out of the WebSocket onmessage callback and kill the message
        // loop. Reset the stream and keep the session alive so a single
        // corrupt frame can't take down every other in-flight stream on
        // the same socket.
        let payload: any;
        try {
          payload = JSON.parse(new TextDecoder().decode(frame.payload));
        } catch (err) {
          // Best-effort reset so the peer sees EOF on this stream instead
          // of a hung socket. Swallow reset errors too.
          try { (session as { resetStream?: (id: number) => void }).resetStream?.(streamId); } catch {}
          continue;
        }

        if (payload.kind === "http") {
          if (payload.isUpgrade) {
            forwardUpgradeToLocal(session, streamId, payload, httpTarget);
            continue;
          }
          const methodUpper = String(payload.method || "GET").toUpperCase();
          if (methodUpper === "GET" || methodUpper === "HEAD") {
            forwardFetch(session, streamId, payload, httpTarget);
          } else {
            forwardHttpStream(session, streamId, payload, httpTarget);
          }
          continue;
        }
        if (payload.kind === "tcp" && tcpTarget) {
          handleTcpStream(session, streamId, tcpTarget);
          continue;
        }
      }
      session.dispatchFrame(frame, ws);
    }
  };
}
