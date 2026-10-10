/**
 * HTTP/TCP stream forwarding for tunnel sessions. Handles STREAM_OPEN
 * dispatch, request body streaming, WebSocket upgrades, and TCP forwarding.
 */
import { FrameType } from "./tunnel-protocol-types.js";
import * as http from "node:http";
import * as net from "node:net";
import { getFastPool } from "./tunnel-local-http-fast.js";
const MAX_CHUNK = 65536;
const agentCache = new Map();
function getAgent(host, port) {
    const key = `${host}:${port}`;
    let agent = agentCache.get(key);
    if (agent)
        return agent;
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
        try {
            agent.destroy();
        }
        catch { }
    }
    agentCache.clear();
}
// Reject peer-supplied HTTP method, request target, and header name/value
// bytes that contain CR, LF, or NUL. Without this, a peer could splice
// `\r\nX-Injected: yes` into a header value and smuggle an extra request
// into the local HTTP service via the tunnel.
const HTTP_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function hasCrLfOrNul(s) {
    return /[\r\n\0]/.test(s);
}
function isValidHttpMethod(m) {
    return typeof m === "string" && HTTP_TOKEN_RE.test(m);
}
function isValidRequestTarget(t) {
    // HTTP/1.1 framing only breaks on CR/LF/NUL and whitespace; other control
    // bytes don't enable smuggling, so we do not reject them here.
    return typeof t === "string" && t.length > 0 && !/[\r\n\0\s]/.test(t);
}
function isValidHeaderName(n) {
    return typeof n === "string" && HTTP_TOKEN_RE.test(n);
}
function isValidHeaderValue(v) {
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
function safeHeaderEntries(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const entry of raw) {
        if (Array.isArray(entry) && entry.length >= 2)
            out.push([entry[0], entry[1]]);
    }
    return out;
}
/**
 * Whether the visitor's headers declare a request body: any Transfer-Encoding, or a
 * Content-Length other than 0. Such a request goes the streaming way whatever its method,
 * so the body that follows is forwarded with framing that matches it.
 */
function declaresBody(raw) {
    for (const [name, value] of safeHeaderEntries(raw)) {
        const lower = String(name).toLowerCase();
        if (lower === "transfer-encoding")
            return true;
        if (lower === "content-length" && String(value).trim() !== "0")
            return true;
    }
    return false;
}
/**
 * One request's end. The first of the peer's RESET, our RESET or our EOF decides it, and
 * nothing is sent after it. Several paths can end one request (the local response failing,
 * the pump's catch, the visitor's RESET and the abort it causes), and each goes through this,
 * so the peer gets one terminal frame and never an answer to its own RESET.
 *
 * It also holds the request to the connection it started on. After a reconnect the session
 * is on a new connection, whose kit numbers its streams from 2 again: a late callback of
 * this request (a pool wait timing out, a local socket closing) must not send on, close or
 * unregister the new connection's stream of the same ID. So the request counts as ended
 * once the session's generation moves, and `off()` removes only this request's handler.
 */
function streamEnd(session, streamId) {
    let ended = false;
    let handler = null;
    const generationOf = () => session.generation;
    const generation = generationOf();
    const isEnded = () => ended || generationOf() !== generation;
    return {
        ended: isEnded,
        /** The peer reset the stream, or the session is gone: it is over, and nothing answers it. */
        peerReset: () => { ended = true; },
        reset: (reason) => {
            if (isEnded())
                return;
            ended = true;
            session.sendReset(streamId, reason);
        },
        eof: () => {
            if (isEnded())
                return;
            ended = true;
            session.sendEof(streamId);
        },
        /** Register this request's handler for its stream. */
        on: (h) => {
            handler = h;
            session.onStream(streamId, h);
        },
        /** Unregister it, and nothing a later request registered for the same ID. */
        off: () => {
            if (handler)
                session.offStream(streamId, handler);
        },
    };
}
/**
 * What the local side of an upgraded or TCP stream sends, passed on in order: each read in
 * frames of at most MAX_CHUNK under the stream's credit, the local socket paused until they
 * are out. The socket's end and close queue behind them (`after`), so an EOF never overtakes
 * DATA still waiting on credit. A stream that has ended, or a send that fails, destroys the
 * socket and drops the rest.
 */
function localToStream(session, streamId, end, socket) {
    let chain = Promise.resolve();
    let queued = 0;
    return {
        forward: (bytes) => {
            queued++;
            socket.pause();
            chain = chain.then(async () => {
                try {
                    for (let offset = 0; offset < bytes.length; offset += MAX_CHUNK) {
                        if (end.ended())
                            throw new Error(`stream ${streamId} ended`);
                        await session.sendData(streamId, new Uint8Array(bytes.subarray(offset, Math.min(offset + MAX_CHUNK, bytes.length))));
                    }
                }
                catch {
                    try {
                        socket.destroy();
                    }
                    catch { }
                }
                if (--queued === 0)
                    socket.resume();
            });
        },
        after: (fn) => {
            chain = chain.then(fn).catch(() => { });
        },
    };
}
/**
 * Call `fn` once the session is gone (its primary socket closed, or `close()`), and return
 * what detaches it. Mock sessions in tests may have no `onClose`.
 */
function onSessionGone(session, fn) {
    const s = session;
    return typeof s.onClose === "function" ? s.onClose(fn) : () => { };
}
async function forwardFetch(session, streamId, openPayload, target) {
    const { method, target: reqTarget, headers: reqHeaders } = openPayload;
    // Validate peer-controlled method/target to prevent HTTP request smuggling.
    if (!isValidHttpMethod(method) || !isValidRequestTarget(reqTarget)) {
        session.sendReset(streamId, "invalid-method-or-target");
        session.offStream(streamId);
        return;
    }
    // The visitor's RESET aborts the local request at once: an idle response (server-sent
    // events, long-poll) would otherwise keep its local connection until it sent again. The
    // request's EOF only ends a body this request does not have: one that declares a body is
    // routed to forwardHttpStream, and DATA arriving here anyway is dropped.
    const end = streamEnd(session, streamId);
    const visitorGone = new AbortController();
    end.on((f) => {
        if (f.header.frameType === FrameType.Reset) {
            end.peerReset();
            end.off();
            visitorGone.abort();
        }
    });
    // So does the session going away, with nothing left to send it on. The pool is shared
    // by local target: an idle response would otherwise keep its slot past a reconnect.
    const detachSessionGone = onSessionGone(session, () => {
        end.peerReset();
        end.off();
        visitorGone.abort();
    });
    let headerLines = `Host: ${target.host}:${target.port}\r\n`;
    // Shape-validate each header entry before destructuring.
    for (const [name, value] of safeHeaderEntries(reqHeaders)) {
        const lower = String(name).toLowerCase();
        if (lower === "host" || lower === "connection" || lower === "upgrade"
            || lower === "keep-alive" || lower === "transfer-encoding"
            || lower === "content-length"
            || lower === "proxy-authenticate" || lower === "proxy-authorization"
            || lower === "te" || lower === "trailer")
            continue;
        // Drop headers whose name or value contains CR/LF/NUL/invalid tokens.
        if (!isValidHeaderName(name) || !isValidHeaderValue(value))
            continue;
        headerLines += `${name}: ${value}\r\n`;
    }
    const sink = responseSink(session, streamId, end);
    try {
        const pool = getFastPool(target.host, target.port);
        await pool.request(method, reqTarget, headerLines, sink, visitorGone.signal);
        // Nothing, if the visitor's RESET ended the stream first.
        end.eof();
        end.off();
    }
    catch {
        end.reset(sink.headSent() ? "local response cut" : "local connect failed");
        end.off();
    }
    finally {
        detachSessionGone();
    }
}
/**
 * The local response, streamed to the stream as the pool parses it: the head at once, then
 * each body piece under the stream's credit. Nothing waits for the whole body, so a body of
 * any size passes and its first byte leaves when the local target sends it.
 *
 * No frame crosses a MAX_CHUNK boundary of the body, as when the body was sent whole: pieces
 * come in whatever sizes the local socket reads, and a frame sized by them could need more
 * than the credit left in a window the peer refills only once it is spent.
 */
function responseSink(session, streamId, end) {
    let sent = false;
    let offset = 0;
    return {
        headSent: () => sent,
        head: (status, headers) => {
            sent = true;
            if (!end.ended())
                session.sendResponseHead(streamId, status, headers);
        },
        // At the failure itself, not once the pump hears of it: a WINDOW read in between would
        // let the send waiting on credit go out after the response had failed.
        fail: () => end.reset("local response cut"),
        body: async (chunk) => {
            for (let off = 0; off < chunk.length;) {
                if (end.ended())
                    throw new Error(`stream ${streamId} ended`);
                const n = Math.min(chunk.length - off, MAX_CHUNK - (offset % MAX_CHUNK));
                await session.sendData(streamId, chunk.subarray(off, off + n));
                off += n;
                offset += n;
            }
        },
    };
}
async function forwardHttpStream(session, streamId, openPayload, target) {
    const { method, target: reqTarget, headers: reqHeaders } = openPayload;
    // Validate peer-controlled method/target to prevent HTTP request smuggling.
    if (!isValidHttpMethod(method) || !isValidRequestTarget(reqTarget)) {
        session.sendReset(streamId, "invalid-method-or-target");
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
            || lower === "te" || lower === "trailer")
            continue;
        // Drop headers whose name or value contains CR/LF/NUL/invalid tokens.
        if (!isValidHeaderName(name) || !isValidHeaderValue(value))
            continue;
        headerLines += `${name}: ${value}\r\n`;
    }
    const methodUpper = String(method).toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(methodUpper) || declaresBody(reqHeaders);
    let finished = false;
    const earlyBuffer = [];
    // Cap pre-ready earlyBuffer bytes to defend against peer-driven OOM:
    // STREAM_OPEN + continuous DATA frames arriving before
    // pool.requestStreaming() resolves would otherwise grow the buffer without
    // bound while the session replenishes WINDOW credit on every handled frame.
    const HTTP_EARLY_BUFFER_CAP = 1 * 1024 * 1024; // 1 MiB
    let earlyBufferedBytes = 0;
    let handleReady = null;
    const end = streamEnd(session, streamId);
    end.on((f) => {
        // At once, buffered or not: the abort it leads to must not answer it.
        if (f.header.frameType === FrameType.Reset)
            end.peerReset();
        if (finished)
            return;
        // dispatch may return a Promise when the local socket is backpressured;
        // returning it from the FrameHandler defers inbound WINDOW replenish so
        // the peer pauses sending.
        const dispatch = (b) => {
            if (!handleReady) {
                const incoming = b.kind === "data" && b.payload ? b.payload.byteLength : 0;
                if (earlyBufferedBytes + incoming > HTTP_EARLY_BUFFER_CAP) {
                    finished = true;
                    end.reset("early-buffer-overflow");
                    end.off();
                    earlyBuffer.length = 0;
                    earlyBufferedBytes = 0;
                    return;
                }
                earlyBufferedBytes += incoming;
                earlyBuffer.push(b);
                return;
            }
            if (b.kind === "data" && hasBody)
                return handleReady.writeBody(b.payload);
            else if (b.kind === "eof")
                handleReady.endBody();
            else if (b.kind === "reset") {
                finished = true;
                handleReady.abort();
                end.off();
            }
        };
        if (f.header.frameType === FrameType.Data)
            return dispatch({ kind: "data", payload: f.payload });
        else if (f.header.frameType === FrameType.Eof)
            return dispatch({ kind: "eof" });
        else if (f.header.frameType === FrameType.Reset)
            return dispatch({ kind: "reset" });
    });
    // The session going away ends the request as the visitor's RESET does, with nothing to
    // send: the local request is aborted, here or once the pool hands over its handle.
    const detachSessionGone = onSessionGone(session, () => {
        end.peerReset();
        if (finished)
            return;
        finished = true;
        end.off();
        handleReady?.abort();
    });
    const sink = responseSink(session, streamId, end);
    try {
        const pool = getFastPool(target.host, target.port);
        const handle = await pool.requestStreaming(method, reqTarget, headerLines, sink);
        // If the early-buffer overflowed (finished=true) while
        // requestStreaming() was in flight, abort the resolved handle so the
        // pool slot / socket FD is released instead of waiting forever for
        // chunks. Also observe the internal responsePromise so the socket-close
        // rejection triggered by abort() does not surface as an unhandled
        // rejection (Node 22 default: process exit) for library consumers that
        // lack a global unhandledRejection handler.
        if (finished) {
            try {
                handle.abort();
            }
            catch { }
            try {
                handle.waitResponse().catch(() => { });
            }
            catch { }
            earlyBuffer.length = 0;
            return;
        }
        // Keep `handleReady` null while draining so new frames arriving during
        // `await writeBody` are queued via the onStream dispatcher into
        // `earlyBuffer` instead of bypassing the still-draining buffer. We
        // drain via .shift() so any frames pushed during the await are picked
        // up in FIFO order before we expose `handleReady`.
        while (earlyBuffer.length > 0) {
            if (finished)
                break;
            const b = earlyBuffer.shift();
            if (b.kind === "data" && hasBody)
                await handle.writeBody(b.payload);
            else if (b.kind === "eof")
                handle.endBody();
            else if (b.kind === "reset") {
                finished = true;
                handle.abort();
                try {
                    handle.waitResponse().catch(() => { });
                }
                catch { }
                end.off();
            }
        }
        earlyBuffer.length = 0;
        // If the early-buffer cap was breached DURING the async drain (new
        // frames arriving while we were awaiting writeBody set finished=true
        // via the dispatcher's overflow path), the handle was never aborted and
        // handle.waitResponse() would hang until the upstream timeout, leaking
        // the fast-pool slot + local FD. Abort now.
        if (finished) {
            try {
                handle.abort();
            }
            catch { }
            try {
                handle.waitResponse().catch(() => { });
            }
            catch { }
            return;
        }
        // All pre-handoff frames drained in order; safe to expose the handle to
        // the onStream dispatcher for live frames.
        handleReady = handle;
        if (!hasBody)
            handle.endBody();
        await handle.waitResponse();
        finished = true;
        end.eof();
        end.off();
    }
    catch {
        if (!finished) {
            finished = true;
            end.reset(sink.headSent() ? "local response cut" : "local connect failed");
            end.off();
        }
    }
    finally {
        detachSessionGone();
    }
}
export async function handleHttpStream(session, streamId, openPayload, target) {
    forwardHttpStream(session, streamId, openPayload, target);
}
function forwardUpgradeToLocal(session, streamId, openPayload, target) {
    const { method, target: reqTarget, headers: reqHeaders } = openPayload;
    // The session's RESET, never a raw frame: it also closes the stream's credit gate, so a
    // send waiting on it rejects and gives back the session credit it holds.
    const end = streamEnd(session, streamId);
    // Validate peer-controlled method/target BEFORE touching the socket.
    if (!isValidHttpMethod(method) || !isValidRequestTarget(reqTarget)) {
        end.reset("invalid-method-or-target");
        end.off();
        return;
    }
    const headerObj = {};
    // Shape-validate each header entry before destructuring.
    for (const [name, value] of safeHeaderEntries(reqHeaders)) {
        // Drop CR/LF/NUL/invalid-token headers so they cannot be spliced into the upgrade request.
        if (!isValidHeaderName(name) || !isValidHeaderValue(value))
            continue;
        headerObj[name] = value;
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
    const sessionWithClose = session;
    const detachSessionClose = typeof sessionWithClose.onClose === 'function'
        ? sessionWithClose.onClose(() => {
            // Ended first: the socket's close comes later, and must send nothing.
            end.peerReset();
            try {
                socket.destroy();
            }
            catch { }
            end.off();
        })
        : () => { };
    let buffer = Buffer.alloc(0);
    let headersParsed = false;
    const MAX_HEAD = 32 * 1024; // cap at 32KB of header data
    const out = localToStream(session, streamId, end, socket);
    // From the start, not once the local headers arrive, and until the local side ends or
    // closes: the visitor can reset the stream at any time, and that ends this request.
    end.on((f) => {
        if (f.header.frameType === FrameType.Reset) {
            end.peerReset();
            end.off();
            // Destroy, never end: a half-closed local socket that stays silent would keep the
            // connection, and the session's close listener, for the life of the session.
            socket.destroy();
            return;
        }
        // The request's EOF (the kit sends it at once: an upgrade has no body) and any DATA
        // only matter once the local service has answered.
        if (!headersParsed)
            return;
        if (f.header.frameType === FrameType.Data) {
            // Await socket drain before inbound WINDOW replenishment.
            const ok = socket.write(Buffer.from(f.payload));
            if (!ok) {
                return new Promise((resolve) => {
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
        }
        else if (f.header.frameType === FrameType.Eof) {
            // Half-close only: the stream is not over until the local side ends or closes, and
            // the visitor can still reset it.
            socket.end();
        }
    });
    const onHeadersReady = (statusLine, headerLines, leftover) => {
        headersParsed = true;
        if (end.ended()) {
            socket.destroy();
            return;
        }
        const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})/);
        const status = match ? parseInt(match[1], 10) : 502;
        const respHeaders = [];
        for (const line of headerLines) {
            const idx = line.indexOf(":");
            if (idx < 0)
                continue;
            const name = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            const lower = name.toLowerCase();
            if (["keep-alive", "transfer-encoding"].includes(lower))
                continue;
            respHeaders.push([name, value]);
        }
        session.sendResponseHead(streamId, status, respHeaders);
        // The bytes that came with the head (a 101's first frames, or the body when the
        // local service did not switch protocols) go first, in order with the rest.
        if (leftover.length > 0)
            out.forward(leftover);
    };
    socket.on("data", (chunk) => {
        if (headersParsed) {
            out.forward(chunk);
            return;
        }
        buffer = Buffer.concat([buffer, chunk]);
        // The cap is on the head alone: the read that ends it can carry the bytes after it too
        // (a short 101 and the first frames, sent together), and those go out as DATA.
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if ((headerEnd < 0 ? buffer.length : headerEnd + 4) > MAX_HEAD) {
            end.reset("response headers too large");
            socket.destroy();
            return;
        }
        if (headerEnd < 0)
            return;
        const headerBlock = buffer.slice(0, headerEnd).toString("utf8");
        const leftover = buffer.slice(headerEnd + 4);
        const lines = headerBlock.split("\r\n");
        const statusLine = lines.shift() || "";
        onHeadersReady(statusLine, lines, leftover);
    });
    // Only the local side's clean end waits behind the DATA before it. A failure, or a close
    // with no end before it, decides the RESET at once: the RESET closes the stream's credit
    // gate, so a send still waiting on it gives its session credit back instead of holding it
    // for a connection that is gone. Until then the handler stays, so a visitor's RESET is
    // taken as the end and nothing answers it.
    let localEnded = false;
    socket.on("end", () => {
        // Bun emits `end` on a socket we destroy ourselves: that is no end from the local side.
        if (socket.destroyed)
            return;
        localEnded = true;
        out.after(() => {
            if (headersParsed) {
                end.eof();
            }
            else {
                end.reset("upstream closed before response");
            }
            end.off();
        });
    });
    socket.on("error", () => {
        end.reset(headersParsed ? "local connection reset" : "local connect failed");
        end.off();
    });
    socket.once("close", () => {
        const closed = () => {
            detachSessionClose();
            end.reset(headersParsed ? "local connection reset" : "upstream closed before response");
            end.off();
        };
        if (localEnded)
            out.after(closed);
        else
            closed();
    });
    socket.on("connect", () => {
        // Normalize `Connection:` to "Upgrade" only. Don't append ", close":
        // Node's http.Server honors `Connection: close` literally and closes
        // the socket right after emitting 101, which breaks real WebSocket
        // upgrades. Bare "Upgrade" matches what real WS clients send and lets
        // both Node and spec-compliant servers hand over the socket cleanly.
        const connKey = Object.keys(headerObj).find((k) => k.toLowerCase() === "connection");
        if (connKey)
            delete headerObj[connKey];
        headerObj["Connection"] = "Upgrade";
        const lines = [`${method} ${reqTarget} HTTP/1.1`];
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
export function handleTcpStream(session, streamId, target) {
    const { createConnection } = net;
    let localReady = false;
    let localSocket = null;
    // Two ends, kept apart: the visitor's EOF ends only what the visitor sends, and the
    // local service can still answer it; `end` is the stream's end (our EOF or RESET,
    // either side's RESET, the session's close), after which nothing more is sent.
    const end = streamEnd(session, streamId);
    let visitorDone = false;
    const buffered = [];
    let bufferedBytes = 0;
    // Bound the pre-connect queue so a peer flooding DATA before the local
    // TCP socket opens can't OOM the process. When we hit the cap, reset the
    // stream back to the peer and drop the socket attempt.
    const PRE_CONNECT_BUFFER_CAP = 1 * 1024 * 1024; // 1 MiB
    const socket = createConnection({ host: target.host, port: target.port }, () => {
        if (end.ended()) {
            // Stream was reset before the TCP connect completed.
            // Destroy the socket without touching the (already-cleared) buffer.
            try {
                socket.destroy();
            }
            catch { }
            return;
        }
        localSocket = socket;
        localReady = true;
        for (const f of buffered) {
            socket.write(Buffer.from(f.payload));
        }
        buffered.length = 0;
        if (visitorDone)
            socket.end();
    });
    end.on((frame) => {
        // A RESET ends both directions, even after the visitor's EOF: destroy, never end, as a
        // half-closed local socket that stays silent would keep the socket. The socket itself,
        // not `localSocket`: a connect still pending is cancelled too.
        if (frame.header.frameType === FrameType.Reset) {
            end.peerReset();
            buffered.length = 0;
            socket.destroy();
            end.off();
            return;
        }
        if (end.ended() || visitorDone)
            return;
        if (frame.header.frameType === FrameType.Data) {
            if (localReady && localSocket) {
                // Return a Promise that resolves on socket `drain` when the kernel
                // buffer is full, so the session defers inbound WINDOW
                // replenishment until the local sink has consumed the bytes.
                const s = localSocket;
                const ok = s.write(Buffer.from(frame.payload));
                if (!ok) {
                    return new Promise((resolve) => {
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
                buffered.length = 0;
                bufferedBytes = 0;
                end.reset("pre-connect-buffer-overflow");
                socket.destroy();
                end.off();
                return;
            }
            buffered.push(frame);
            bufferedBytes += incoming;
        }
        else if (frame.header.frameType === FrameType.Eof) {
            // The visitor has sent everything: half-close, now or once connected, after the
            // bytes buffered before it. The handler stays: the visitor can still reset.
            visitorDone = true;
            if (localSocket)
                localSocket.end();
        }
    });
    // Destroy the upstream TCP socket when the session itself closes, not just
    // when a stream EOF/RESET arrives — abrupt WS drops without frame-level EOF
    // would otherwise leak the local TCP socket until the local service's idle
    // timeout fires. `onClose` is guarded with a typeof check so test harnesses
    // using a mock TunnelSession that omits the hook still work.
    const sessionWithClose = session;
    let detachSessionClose = null;
    if (typeof sessionWithClose.onClose === 'function') {
        // Even once ended: an EOF either way only half-closed the socket.
        detachSessionClose = sessionWithClose.onClose(() => {
            end.peerReset();
            try {
                socket.destroy();
            }
            catch { }
            end.off();
        });
    }
    // Paused while each read waits for credit, so backpressure reaches the local service.
    const out = localToStream(session, streamId, end, socket);
    socket.on("data", (chunk) => out.forward(chunk));
    // The handler and the session's close listener stay until the stream's terminal goes, behind
    // the DATA before it: a socket that has closed while its DATA and EOF wait for credit has not
    // ended the stream, and a visitor's RESET in the meantime still cancels them.
    socket.once("close", () => {
        out.after(() => {
            detachSessionClose?.();
            end.off();
        });
    });
    socket.on("end", () => {
        // Bun emits `end` on a socket we destroy ourselves: that is no end from the local side.
        if (socket.destroyed)
            return;
        out.after(() => {
            end.eof();
            end.off();
        });
    });
    socket.on("error", () => {
        end.reset("local connect failed");
        // Unregister the stream handler — without this the handler leaks.
        end.off();
    });
}
/**
 * Set up automatic stream forwarding for a session.
 * Intercepts STREAM_OPEN frames and forwards to the appropriate local target.
 *
 * Installed as the session's inbound router, so it covers every socket the
 * session has or opens later (v2 secondaries included). Call it before
 * `connect()` when the kit can open a stream right behind HELLO_OK (a resumed
 * session): see `TunnelSession.setInboundRouter()`.
 */
export function setupAutoForwarding(session, httpTarget, tcpTarget) {
    session.setInboundRouter((frame, ws) => routeAutoForwarded(frame, ws, session, httpTarget, tcpTarget));
}
function routeAutoForwarded(frame, ws, session, httpTarget, tcpTarget) {
    if (frame.header.frameType === FrameType.StreamOpen) {
        const streamId = frame.header.streamId;
        session.dispatchFrame(frame, ws);
        // Peer-supplied JSON: a malformed STREAM_OPEN payload would throw
        // out of the WebSocket onmessage callback and kill the message
        // loop. Reset the stream and keep the session alive so a single
        // corrupt frame can't take down every other in-flight stream on
        // the same socket.
        let payload;
        try {
            payload = JSON.parse(new TextDecoder().decode(frame.payload));
        }
        catch {
            // Refuse the stream so the visitor gets an answer instead of waiting
            // for a response that will never come.
            session.sendReset(streamId, "malformed-stream-open");
            return;
        }
        if (payload.kind === "http") {
            if (payload.isUpgrade) {
                forwardUpgradeToLocal(session, streamId, payload, httpTarget);
                return;
            }
            // GET/HEAD take the body-less fast path only when they declare no body: forwarding
            // a Content-Length without the bytes behind it hangs the local app, or leaves the owed
            // bytes to be read from the next request on the pooled connection.
            const methodUpper = String(payload.method || "GET").toUpperCase();
            if ((methodUpper === "GET" || methodUpper === "HEAD") && !declaresBody(payload.headers)) {
                forwardFetch(session, streamId, payload, httpTarget);
            }
            else {
                forwardHttpStream(session, streamId, payload, httpTarget);
            }
            return;
        }
        if (payload.kind === "tcp" && tcpTarget) {
            handleTcpStream(session, streamId, tcpTarget);
            return;
        }
        // A kind nothing here forwards (tcp without a tcpTarget, or unknown):
        // nothing would ever answer it, so refuse it too.
        session.sendReset(streamId, "unsupported-stream-kind");
        return;
    }
    session.dispatchFrame(frame, ws);
}
