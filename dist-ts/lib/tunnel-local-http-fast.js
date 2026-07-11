/**
 * Custom HTTP/1.1 client for body-less requests (GET/HEAD). Bypasses
 * node:http entirely for ~56% throughput improvement under sustained load.
 */
import * as net from "node:net";
import { sdkLocalFdBudget } from "./tunnel-fd-budget.js";
/**
 * Hard cap on a single response body. Beyond this we reject the request and
 * destroy the socket — otherwise a malicious/runaway upstream can make us
 * buffer indefinitely in RAM (the fast path has no streaming hand-off).
 *
 * Read at request time (not at module load) so env overrides and test hooks
 * can change the cap between requests on the same process.
 */
function resolveMaxResponseBytes() {
    const override = globalThis.__hoodyFastMaxBytes;
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
        return override;
    }
    const raw = process.env?.HOODY_TUNNEL_FAST_MAX_BYTES;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 64 * 1024 * 1024;
}
class TargetPool {
    host;
    port;
    idle = [];
    busy = new Set();
    waiters = [];
    maxSockets;
    constructor(host, port, maxSockets = 64) {
        this.host = host;
        this.port = port;
        this.maxSockets = maxSockets;
    }
    parseHeadersBlock(block) {
        const lines = block.split("\r\n");
        const statusLine = lines[0] ?? "";
        const status = parseInt(statusLine.split(" ")[1] ?? "0", 10);
        const headers = [];
        let contentLength = 0;
        let chunked = false;
        let hasContentLength = false;
        let keepAlive = true;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const idx = line.indexOf(":");
            if (idx < 0)
                continue;
            const name = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            const lower = name.toLowerCase();
            if (lower === "content-length") {
                contentLength = parseInt(value, 10) || 0;
                hasContentLength = true;
            }
            else if (lower === "transfer-encoding") {
                if (value.toLowerCase().includes("chunked"))
                    chunked = true;
            }
            else if (lower === "connection") {
                if (value.toLowerCase().includes("close"))
                    keepAlive = false;
            }
            if (lower === "keep-alive" || lower === "transfer-encoding"
                || lower === "connection" || lower === "upgrade")
                continue;
            headers.push([name, value]);
        }
        return { status, headers, contentLength, chunked, keepAlive, hasContentLength };
    }
    onData(ps, chunk) {
        ps.buffer = Buffer.concat([ps.buffer, chunk]);
        // Cap unparsed header bytes. Without this, a hostile or broken local
        // target could stream bytes without ever terminating headers
        // (CRLFCRLF), growing ps.buffer without bound.
        const MAX_HEADER_BYTES = 64 * 1024;
        if (ps.parsing === "headers" && ps.buffer.length > MAX_HEADER_BYTES) {
            for (const p of ps.inflight)
                p.reject(new Error("local target: response header block > 64KiB"));
            ps.inflight = [];
            ps.alive = false;
            ps.buffer = Buffer.alloc(0);
            try {
                ps.socket.destroy();
            }
            catch { }
            return;
        }
        while (true) {
            if (ps.parsing === "headers") {
                const end = ps.buffer.indexOf("\r\n\r\n");
                if (end < 0)
                    return;
                const block = ps.buffer.subarray(0, end).toString("utf8");
                const parsed = this.parseHeadersBlock(block);
                // Skip 1xx informational responses (100 Continue, 102 Processing,
                // 103 Early Hints) — RFC 9110 §15.2. Forwarding them as the final
                // status would corrupt the caller's HTTP state; re-enter the
                // header-parse loop for the real final response.
                if (parsed.status >= 100 && parsed.status < 200) {
                    ps.buffer = ps.buffer.subarray(end + 4);
                    continue;
                }
                ps.currentStatus = parsed.status;
                ps.currentHeaders = parsed.headers;
                ps.bodyChunks = [];
                ps.buffer = ps.buffer.subarray(end + 4);
                if (!parsed.keepAlive)
                    ps.alive = false;
                if (parsed.chunked) {
                    ps.parsing = "chunk-size";
                    ps.chunkedEncoding = true;
                    ps.closeDelimited = false;
                }
                else if (parsed.hasContentLength) {
                    ps.parsing = "body";
                    ps.bodyRemaining = parsed.contentLength;
                    ps.chunkedEncoding = false;
                    ps.closeDelimited = false;
                    if (parsed.contentLength === 0) {
                        this.completeResponse(ps);
                        continue;
                    }
                }
                else {
                    ps.parsing = "body";
                    ps.bodyRemaining = -1;
                    ps.chunkedEncoding = false;
                    ps.closeDelimited = true;
                    ps.alive = false;
                }
            }
            else if (ps.parsing === "body") {
                if (ps.closeDelimited) {
                    if (ps.buffer.length === 0)
                        return;
                    if (this.enforceBodyCap(ps, ps.buffer.length))
                        return;
                    ps.bodyChunks.push(ps.buffer);
                    ps.bodyBytesSoFar += ps.buffer.length;
                    ps.buffer = Buffer.alloc(0);
                    return;
                }
                if (ps.bodyRemaining > 0) {
                    const take = Math.min(ps.bodyRemaining, ps.buffer.length);
                    if (take === 0)
                        return;
                    if (this.enforceBodyCap(ps, take))
                        return;
                    ps.bodyChunks.push(ps.buffer.subarray(0, take));
                    ps.bodyBytesSoFar += take;
                    ps.buffer = ps.buffer.subarray(take);
                    ps.bodyRemaining -= take;
                }
                if (ps.bodyRemaining === 0) {
                    this.completeResponse(ps);
                }
                else {
                    return;
                }
            }
            else if (ps.parsing === "chunk-size") {
                const eol = ps.buffer.indexOf("\r\n");
                if (eol < 0)
                    return;
                const sizeLine = ps.buffer.subarray(0, eol).toString("utf8").split(";")[0].trim();
                const size = parseInt(sizeLine, 16);
                ps.buffer = ps.buffer.subarray(eol + 2);
                if (!Number.isFinite(size) || size < 0) {
                    ps.alive = false;
                    for (const p of ps.inflight)
                        p.reject(new Error("invalid chunk size"));
                    ps.inflight = [];
                    try {
                        ps.socket.destroy();
                    }
                    catch { }
                    return;
                }
                if (size === 0) {
                    ps.parsing = "chunk-trailer-crlf";
                }
                else {
                    ps.bodyRemaining = size;
                    ps.parsing = "chunk-data";
                }
            }
            else if (ps.parsing === "chunk-data") {
                if (ps.bodyRemaining > 0) {
                    const take = Math.min(ps.bodyRemaining, ps.buffer.length);
                    if (take === 0)
                        return;
                    if (this.enforceBodyCap(ps, take))
                        return;
                    ps.bodyChunks.push(ps.buffer.subarray(0, take));
                    ps.bodyBytesSoFar += take;
                    ps.buffer = ps.buffer.subarray(take);
                    ps.bodyRemaining -= take;
                }
                if (ps.bodyRemaining === 0) {
                    if (ps.buffer.length < 2)
                        return;
                    ps.buffer = ps.buffer.subarray(2);
                    ps.parsing = "chunk-size";
                }
                else {
                    return;
                }
            }
            else if (ps.parsing === "chunk-trailer-crlf") {
                // RFC 9112 §7.1.2 allows OPTIONAL trailer headers between the 0-size
                // chunk and the final empty line:
                //
                //   0\r\n
                //   Trailer-Name: value\r\n
                //   (more trailer lines)\r\n
                //   \r\n        ← terminator
                //
                // Consume each line up to and including the terminating empty line;
                // consuming exactly 2 bytes would leave trailer bytes in the pooled
                // socket's buffer and corrupt the NEXT request's parse.
                for (;;) {
                    const eol = ps.buffer.indexOf("\r\n");
                    if (eol < 0)
                        return; // not enough data yet
                    if (eol === 0) {
                        // Empty line → end of trailers.
                        ps.buffer = ps.buffer.subarray(2);
                        this.completeResponse(ps);
                        break;
                    }
                    // Trailer header line — skip it.
                    ps.buffer = ps.buffer.subarray(eol + 2);
                }
            }
        }
    }
    /**
     * Reject the in-flight request and tear down the socket when the buffered
     * body would exceed MAX_RESPONSE_BYTES. Returns true when enforced so the
     * caller can bail out of the parse step.
     */
    enforceBodyCap(ps, takeBytes) {
        const cap = resolveMaxResponseBytes();
        if (ps.bodyBytesSoFar + takeBytes <= cap)
            return false;
        ps.alive = false;
        const err = new Error(`fast-pool response exceeds MAX_RESPONSE_BYTES (${cap} bytes)`);
        for (const p of ps.inflight)
            p.reject(err);
        ps.inflight = [];
        ps.bodyChunks = [];
        ps.bodyBytesSoFar = 0;
        ps.buffer = Buffer.alloc(0);
        try {
            ps.socket.destroy();
        }
        catch { }
        return true;
    }
    completeResponse(ps) {
        const body = ps.bodyChunks.length === 1
            ? new Uint8Array(ps.bodyChunks[0])
            : (() => {
                const len = ps.bodyChunks.reduce((s, b) => s + b.length, 0);
                const out = new Uint8Array(len);
                let o = 0;
                for (const b of ps.bodyChunks) {
                    out.set(b, o);
                    o += b.length;
                }
                return out;
            })();
        const pending = ps.inflight.shift();
        if (pending) {
            pending.resolve({
                status: ps.currentStatus,
                headers: ps.currentHeaders,
                body,
            });
        }
        ps.parsing = "headers";
        ps.bodyChunks = [];
        ps.bodyBytesSoFar = 0;
        if (ps.inflight.length === 0) {
            this.busy.delete(ps);
            ps.busy = false;
            if (ps.alive && ps.socket.writable) {
                this.idle.push(ps);
                const w = this.waiters.shift();
                if (w) {
                    const taken = this.idle.pop();
                    taken.busy = true;
                    this.busy.add(taken);
                    w(taken);
                }
            }
            else {
                try {
                    ps.socket.destroy();
                }
                catch { }
                // Route through the idempotent per-socket release so the socket
                // 'close' handler's releaseFd() is a no-op.
                ps.releaseFd();
            }
        }
    }
    async createSocket() {
        const ok = await sdkLocalFdBudget.acquire(5000);
        if (!ok)
            return null;
        return new Promise((resolve) => {
            const socket = net.createConnection({ host: this.host, port: this.port });
            socket.setNoDelay(true);
            let connected = false;
            // FD permit is released exactly once across all exit paths (error,
            // close, connect-timeout, completeResponse dead-socket cleanup).
            // Stored on the PooledSocket so non-closure callers can reuse it.
            let fdReleased = false;
            const releaseFd = () => {
                if (fdReleased)
                    return;
                fdReleased = true;
                sdkLocalFdBudget.release();
            };
            const ps = {
                socket,
                buffer: Buffer.alloc(0),
                inflight: [],
                parsing: "headers",
                bodyRemaining: 0,
                bodyChunks: [],
                bodyBytesSoFar: 0,
                currentStatus: 0,
                currentHeaders: [],
                chunkedEncoding: false,
                closeDelimited: false,
                busy: true,
                alive: true,
                releaseFd,
            };
            socket.on("connect", () => { connected = true; resolve(ps); });
            socket.on("data", (chunk) => this.onData(ps, chunk));
            socket.on("error", () => {
                ps.alive = false;
                for (const p of ps.inflight)
                    p.reject(new Error("socket error"));
                ps.inflight = [];
                this.busy.delete(ps);
                const idleIdx = this.idle.indexOf(ps);
                if (idleIdx >= 0)
                    this.idle.splice(idleIdx, 1);
                releaseFd();
                if (!connected)
                    resolve(null);
            });
            socket.on("close", () => {
                ps.alive = false;
                if (ps.closeDelimited && ps.parsing === "body" && ps.inflight.length > 0) {
                    this.completeResponse(ps);
                }
                else {
                    for (const p of ps.inflight)
                        p.reject(new Error("socket closed"));
                    ps.inflight = [];
                }
                this.busy.delete(ps);
                const idleIdx = this.idle.indexOf(ps);
                if (idleIdx >= 0)
                    this.idle.splice(idleIdx, 1);
                if (connected)
                    releaseFd();
            });
            setTimeout(() => {
                if (connected)
                    return;
                // Destroy the socket and release the FD permit — otherwise a
                // hung connect (e.g. dropped packets, silent blackhole) would
                // leave inUse elevated forever.
                try {
                    socket.destroy();
                }
                catch { }
                releaseFd();
                resolve(null);
            }, 5000);
        });
    }
    async acquire() {
        const idle = this.idle.pop();
        if (idle) {
            idle.busy = true;
            this.busy.add(idle);
            return idle;
        }
        if (this.busy.size < this.maxSockets) {
            const sock = await this.createSocket();
            if (!sock)
                return null;
            this.busy.add(sock);
            return sock;
        }
        return new Promise((resolve) => {
            this.waiters.push(resolve);
            setTimeout(() => {
                const idx = this.waiters.indexOf(resolve);
                if (idx >= 0) {
                    this.waiters.splice(idx, 1);
                    resolve(null);
                }
            }, 5000);
        });
    }
    async request(method, path, headerLines) {
        const ps = await this.acquire();
        if (!ps)
            throw new Error("local pool acquire failed");
        return new Promise((resolve, reject) => {
            ps.inflight.push({ resolve, reject });
            const req = `${method} ${path} HTTP/1.1\r\n${headerLines}\r\n`;
            ps.socket.write(req);
        });
    }
    async requestStreaming(method, path, headerLines) {
        const ps = await this.acquire();
        if (!ps)
            throw new Error("local pool acquire failed");
        let responsePromise;
        responsePromise = new Promise((resolve, reject) => {
            ps.inflight.push({ resolve, reject });
        });
        const reqLine = `${method} ${path} HTTP/1.1\r\n${headerLines}Transfer-Encoding: chunked\r\n\r\n`;
        ps.socket.write(reqLine);
        return {
            // Return Promise<void> resolving on `drain` when the underlying
            // socket is backpressured so the tunnel FrameHandler defers WINDOW
            // replenish until local-write pressure clears. Without this, a fast
            // peer + slow local target would buffer the entire body in Node's
            // socket writable queue → OOM.
            writeBody: (chunk) => {
                if (chunk.length === 0)
                    return Promise.resolve();
                const sizeHex = chunk.length.toString(16);
                ps.socket.write(`${sizeHex}\r\n`);
                ps.socket.write(Buffer.from(chunk));
                const ok = ps.socket.write("\r\n");
                if (ok)
                    return Promise.resolve();
                return new Promise((resolve) => {
                    const onDrain = () => {
                        ps.socket.off("close", onClose);
                        resolve();
                    };
                    const onClose = () => {
                        ps.socket.off("drain", onDrain);
                        resolve();
                    };
                    ps.socket.once("drain", onDrain);
                    ps.socket.once("close", onClose);
                });
            },
            endBody: () => { ps.socket.write("0\r\n\r\n"); },
            waitResponse: () => responsePromise,
            abort: () => {
                ps.alive = false;
                try {
                    ps.socket.destroy();
                }
                catch { }
            },
        };
    }
    destroy() {
        for (const ps of this.idle)
            try {
                ps.socket.destroy();
            }
            catch { }
        for (const ps of this.busy)
            try {
                ps.socket.destroy();
            }
            catch { }
        this.idle = [];
        this.busy.clear();
        for (const w of this.waiters)
            w(null);
        this.waiters = [];
    }
}
const pools = new Map();
export function getFastPool(host, port) {
    const key = `${host}:${port}`;
    let pool = pools.get(key);
    if (pool)
        return pool;
    pool = new TargetPool(host, port);
    pools.set(key, pool);
    return pool;
}
export function destroyAllFastPools() {
    for (const p of pools.values())
        p.destroy();
    pools.clear();
}
