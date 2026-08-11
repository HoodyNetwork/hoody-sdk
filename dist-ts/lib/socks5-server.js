/**
 * SOCKS5 server (RFC 1928 + RFC 1929), terminated in-process.
 *
 * This is the engine behind the local exit proxy: hoody-egress inside the
 * container chains to `socks5h://127.0.0.1:<port>`, that port is a hoody-tunnel
 * PULL bind, and every accepted connection arrives here as a stream. We speak
 * SOCKS5 on it and dial the destination from THIS machine, so the exit IP is the
 * local one.
 *
 * The transport is abstracted behind `Socks5Stream` rather than taking a
 * TunnelSession directly, so the protocol machine is exercised by unit tests with
 * no kit, no sockets, and no network.
 *
 * Only CONNECT is implemented. BIND and UDP ASSOCIATE are refused, and IPv6
 * destinations are refused, which keeps the authorization surface to one code
 * path in net-destination-policy.
 */
import * as net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { resolveAndAuthorize, DestinationDeniedError, } from './net-destination-policy.js';
// ── Wire constants (RFC 1928 / RFC 1929) ─────────────────────────────────────
const VER = 0x05;
const AUTH_VER = 0x01;
const M_NOAUTH = 0x00;
const M_USERPASS = 0x02;
const M_NONE = 0xff;
const CMD_CONNECT = 0x01;
const ATYP_V4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_V6 = 0x04;
const REP_OK = 0x00;
const REP_GENERAL = 0x01;
const REP_NOT_ALLOWED = 0x02;
const REP_NET_UNREACH = 0x03;
const REP_HOST_UNREACH = 0x04;
const REP_REFUSED = 0x05;
const REP_TTL_EXPIRED = 0x06;
const REP_CMD_UNSUP = 0x07;
const REP_ATYP_UNSUP = 0x08;
/** Handshake bytes we will buffer before giving up. A greeting is tens of bytes. */
const MAX_HANDSHAKE_BYTES = 8 * 1024;
/** Matches the tunnel protocol's own frame payload cap; larger writes are split. */
const MAX_CHUNK = 65_536;
/**
 * Unflushed bytes tolerated on one upstream socket before the stream is killed.
 *
 * Generous on purpose: a normal slow destination drains long before this. It can
 * only be reached by a peer that keeps sending after the socket has signalled it
 * is full, which is precisely the abuse case, since tunnel flow control is
 * advisory and the peer chooses whether to honour it.
 */
const MAX_RELAY_BUFFER_BYTES = 8 * 1024 * 1024;
export function createServerState() {
    return { active: 0 };
}
function errnoToReply(code) {
    switch (code) {
        case 'ECONNREFUSED': return { rep: REP_REFUSED, reason: 'refused' };
        case 'EHOSTUNREACH': return { rep: REP_HOST_UNREACH, reason: 'unreachable' };
        case 'ENETUNREACH': return { rep: REP_NET_UNREACH, reason: 'unreachable' };
        case 'ETIMEDOUT': return { rep: REP_TTL_EXPIRED, reason: 'connect-timeout' };
        default: return { rep: REP_GENERAL, reason: 'unreachable' };
    }
}
function denyReplyCode(reason) {
    switch (reason) {
        case 'private-destination-blocked': return REP_NOT_ALLOWED;
        case 'port-not-allowed': return REP_NOT_ALLOWED;
        case 'ipv6-unsupported': return REP_ATYP_UNSUP;
        case 'dns-failed': return REP_HOST_UNREACH;
        default: return REP_GENERAL;
    }
}
/** Constant-time credential compare so the loopback port is not a timing oracle. */
function credentialsMatch(a, b) {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
        // Still burn a comparison so length alone is not learnable from timing.
        timingSafeEqual(ab, ab);
        return false;
    }
    return timingSafeEqual(ab, bb);
}
/**
 * Drive one SOCKS5 conversation on `stream`.
 *
 * Returns a handle so the owner can tear the connection down (session close,
 * server shutdown) without waiting for the peer.
 */
export function handleSocks5Stream(stream, opts, state = createServerState()) {
    const policy = opts.policy ?? {};
    const connectTimeoutMs = opts.connectTimeoutMs ?? 10_000;
    const idleTimeoutMs = opts.idleTimeoutMs ?? 300_000;
    const handshakeTimeoutMs = opts.handshakeTimeoutMs ?? 30_000;
    // `state.active > NaN` and `state.active > Infinity` are both always false, so
    // a non-finite cap does not raise the limit — it removes admission control
    // entirely, silently. Anything that is not a positive integer is a caller
    // mistake, and failing loudly is the only safe reading of it.
    const maxConcurrent = opts.maxConcurrent ?? 128;
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
        throw new Error(`handleSocks5Stream: maxConcurrent must be a positive integer, got ${String(opts.maxConcurrent)}`);
    }
    // There is no anonymous mode, and an empty configured credential is exactly
    // that: `credentialsMatch('', '')` is true, so a client sending ULEN=0/PLEN=0
    // would authenticate. `tunnelSocks5` already refuses empty credentials, but
    // this function is exported on its own, so the guard belongs here too.
    if (!opts.auth || !opts.auth.username || !opts.auth.password) {
        throw new Error('handleSocks5Stream: `auth` with a non-empty username and password is required');
    }
    let phase = 'greeting';
    /** Narrowing-proof read: `phase` is mutated from async callbacks. */
    const currentPhase = () => phase;
    let buf = Buffer.alloc(0);
    let upstream = null;
    let counted = false;
    let idleTimer;
    let handshakeTimer;
    /** Set while a TCP connect attempt is pending, so die() can cancel its timer. */
    let cancelConnectTimer;
    /** Backoff between connect retries. Cancellable, or it outlives the stream. */
    let retryTimer;
    /**
     * Half-close bookkeeping. A direction ending is not the conversation ending:
     * the stream is only finished once BOTH sides have sent their EOF.
     */
    let clientEnded = false;
    /** The one in-flight drain wait for `upstream`, shared by every blocked write. */
    let drainWaiter;
    let upstreamEnded = false;
    const started = Date.now();
    let bytesUp = 0;
    let bytesDown = 0;
    let reported = false;
    let target = { host: '', port: 0, ip: undefined };
    const report = (ok, reason, detail) => {
        if (reported)
            return;
        reported = true;
        // A caller's telemetry callback is not allowed to break the protocol: an
        // exception here used to skip the reset/end that follows, leaving the
        // container-side stream open forever.
        try {
            opts.onConnect?.({
                host: target.host,
                port: target.port,
                resolvedIp: target.ip,
                ok,
                reason,
                detail,
                bytesUp,
                bytesDown,
                durationMs: Date.now() - started,
            });
        }
        catch { /* a broken listener is the listener's problem */ }
    };
    const release = () => {
        if (counted) {
            state.active--;
            counted = false;
        }
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = undefined;
        }
        if (handshakeTimer) {
            clearTimeout(handshakeTimer);
            handshakeTimer = undefined;
        }
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = undefined;
        }
    };
    const die = (reason, wire, detail) => {
        if (phase === 'dead')
            return;
        phase = 'dead';
        // The connect attempt owns a timer that only its own handlers clear. A
        // client reset mid-connect destroys the socket without necessarily emitting
        // 'error', so without this the timer survives to fire on a dead stream.
        if (cancelConnectTimer) {
            cancelConnectTimer();
            cancelConnectTimer = undefined;
        }
        try {
            upstream?.destroy();
        }
        catch { /* already gone */ }
        release();
        report(false, reason, detail ?? wire);
        try {
            stream.reset(wire ?? reason);
        }
        catch { /* peer gone */ }
    };
    const finish = () => {
        if (phase === 'dead')
            return;
        phase = 'dead';
        release();
        report(true);
        try {
            stream.end();
        }
        catch { /* peer gone */ }
    };
    const send = async (bytes) => {
        try {
            await stream.write(bytes);
            return true;
        }
        catch {
            die('unreachable', 'send failed');
            return false;
        }
    };
    /** BND.ADDR/BND.PORT are reported as 0.0.0.0:0, which RFC 1928 permits. */
    const reply = (rep) => send(new Uint8Array([VER, rep, 0x00, ATYP_V4, 0, 0, 0, 0, 0, 0]));
    const bumpIdle = () => {
        if (idleTimer)
            clearTimeout(idleTimer);
        idleTimer = setTimeout(() => die('idle-timeout', 'idle timeout'), idleTimeoutMs);
    };
    const dial = async (host, port) => {
        target = { host, port, ip: undefined };
        // Claim the stream BEFORE the first await. Everything below yields, and
        // bytes arriving during a yield must not be read as another request.
        phase = 'dialing';
        let authorized;
        try {
            authorized = await resolveAndAuthorize(host, port, policy, opts.lookup ? { lookup: opts.lookup } : {});
        }
        catch (err) {
            const reason = err instanceof DestinationDeniedError ? err.reason : 'dns-failed';
            await reply(denyReplyCode(reason));
            // Pass the error's OWN message, not a restatement of the reason code.
            // `detail` exists for "when the reason alone does not say", and
            // `destination refused: private-destination-blocked` says nothing the
            // reason did not — it printed as
            // "(private-destination-blocked: destination refused: private-destination-blocked)".
            // The error message names the offending address, which is the part an
            // operator actually needs and which distinguishes loopback from RFC1918.
            die(reason, err.message);
            return;
        }
        target.ip = authorized.ip;
        // Resolution yields, and the peer may have gone away during it. Dialling
        // now would open an outbound connection on behalf of a stream that no
        // longer exists.
        if (currentPhase() === 'dead')
            return;
        // Retry the TCP connect on transient errors only. A refusal or an
        // unreachable host is an answer and is surfaced immediately; a reset or
        // timeout mid-handshake is worth one more try, since the alternative is
        // failing a request the destination would have served. Never retry once
        // bytes have flowed, because the peer cannot un-see a partial exchange.
        const RETRYABLE = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN']);
        const maxAttempts = 2;
        // Bound the whole dialing phase.
        //
        // The handshake timer exempts 'dialing' so a slow-but-healthy connect is not
        // killed, and the per-attempt connect timers cover the TCP handshake. That
        // left one gap with no deadline at all: the 10-byte SOCKS reply is written
        // through the tunnel, and if flow control never grants credit that write
        // waits forever, holding a concurrency slot and an established socket. Arm a
        // budget derived from the caller's own timeouts rather than a fixed number,
        // so raising connectTimeoutMs cannot make this fire on a healthy dial: every
        // attempt's own deadline, plus one handshake period of slack for the reply.
        if (handshakeTimer)
            clearTimeout(handshakeTimer);
        handshakeTimer = setTimeout(() => {
            const p = currentPhase();
            if (p === 'relay' || p === 'dead')
                return;
            die('connect-timeout', 'dial did not complete in time');
        }, connectTimeoutMs * maxAttempts + handshakeTimeoutMs);
        const attemptConnect = (attempt) => {
            // Dial the AUTHORIZED ADDRESS, never the hostname. Re-resolving here would
            // reopen the rebinding window that resolveAndAuthorize just closed.
            //
            // allowHalfOpen keeps our writable half open when the origin sends FIN.
            // With Node's default the origin's half-close silently ended our side too,
            // so a client still uploading had its data dropped on the floor.
            const sock = net.createConnection({
                host: authorized.ip,
                port: authorized.port,
                allowHalfOpen: true,
            });
            sock.setNoDelay(true);
            upstream = sock;
            let settled = false;
            /** True once TCP is up: distinguishes "connect failed" from "died after". */
            let connected = false;
            cancelConnectTimer = () => clearTimeout(connectTimer);
            const connectTimer = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                try {
                    sock.destroy();
                }
                catch { /* already gone */ }
                if (attempt < maxAttempts && currentPhase() !== 'dead') {
                    attemptConnect(attempt + 1);
                    return;
                }
                void reply(REP_TTL_EXPIRED).then(() => die('connect-timeout', 'connect timeout'));
            }, connectTimeoutMs);
            sock.once('connect', async () => {
                settled = true;
                connected = true;
                clearTimeout(connectTimer);
                if (currentPhase() === 'dead') {
                    sock.destroy();
                    return;
                }
                if (!(await reply(REP_OK))) {
                    sock.destroy();
                    return;
                }
                // The reply yields. In that window the socket can fail, and the peer can
                // go away — answering REP_OK and flipping to 'relay' on a dead socket is
                // a false success the client then waits on.
                if (currentPhase() === 'dead' || sock.destroyed) {
                    sock.destroy();
                    return;
                }
                phase = 'relay';
                if (handshakeTimer) {
                    clearTimeout(handshakeTimer);
                    handshakeTimer = undefined;
                }
                bumpIdle();
                // Bytes the client pipelined behind its request belong to the tunnel now.
                if (buf.length > 0) {
                    sock.write(buf);
                    bytesUp += buf.length;
                    buf = Buffer.alloc(0);
                }
                // A client half-close that arrived while we were dialling was deferred to
                // here: ending the socket at the time would have queued FIN ahead of the
                // flush above, making that write a write-after-end and losing the upload.
                if (clientEnded)
                    sock.end();
                // Reconcile an EOF deferred above. Both handlers returned early while
                // dialling, so without this the conversation is fully ended on both
                // sides with no further event to collect it, and only the idle timer
                // eventually reaps it — reported as a timeout rather than a clean close.
                if (upstreamEnded) {
                    if (clientEnded) {
                        finish();
                        return;
                    }
                    try {
                        stream.endWrite();
                    }
                    catch { /* peer gone */ }
                }
                sock.resume();
            });
            // Serialize downstream writes and keep a handle on the last one.
            //
            // Node emits 'end' once the 'data' listeners have been CALLED, not once
            // their promises settle. An async listener that is still awaiting flow
            // control therefore races the end handler, and whoever calls
            // `stream.end()` first truncates the response. That is invisible at low
            // volume — credit is always available — and shows up under concurrency as
            // the peer seeing "unexpected eof while reading" on a stream this side
            // reported as a clean success. Measured at 30-way concurrency: 2 of 150.
            let writes = Promise.resolve();
            sock.on('data', (chunk) => {
                bumpIdle();
                // Pause while awaiting credit so TCP backpressure reaches the origin
                // instead of buffering an unbounded amount in this process.
                sock.pause();
                writes = writes.then(async () => {
                    try {
                        for (let off = 0; off < chunk.length; off += MAX_CHUNK) {
                            const end = Math.min(off + MAX_CHUNK, chunk.length);
                            await stream.write(new Uint8Array(chunk.subarray(off, end)));
                        }
                        bytesDown += chunk.length;
                    }
                    catch {
                        // The tunnel refused the bytes. Destroying the socket alone emits
                        // only 'close', which nothing listens for, so the slot stayed
                        // charged until the idle deadline — and if the origin had already
                        // ended, finish() went on to report success after losing response
                        // bytes. Terminate the conversation explicitly instead.
                        die('unreachable', 'downstream write failed', 'tunnel refused response bytes');
                        return;
                    }
                    if (currentPhase() !== 'dead')
                        sock.resume();
                });
            });
            // The origin is done sending. Pass that on as a half-close once every
            // queued write has reached the tunnel, but do NOT tear the conversation
            // down: the client may still be uploading, and with allowHalfOpen our
            // writable half is still good. The stream finishes when both sides have
            // ended, or when the idle deadline collects a client that never does.
            const onUpstreamEnd = () => {
                if (phase === 'dead')
                    return;
                upstreamEnded = true;
                // Defer while dialling, exactly as a client half-close is deferred.
                //
                // The socket exists before REP_OK has been accepted, so an origin that
                // answers with an immediate FIN reaches this handler while the phase is
                // still 'dialing'. Acting on it there sent tunnel EOF AHEAD of the SOCKS
                // reply — measured: endWrite ran with phase=dialing and the reply landed
                // after it. sendEof closes the stream's credit gate, so the pending
                // reply then rejects and the client is left with a closed stream instead
                // of a CONNECT result. The relay handover reconciles both flags once the
                // reply is through.
                if (phase !== 'relay')
                    return;
                if (clientEnded) {
                    finish();
                    return;
                }
                try {
                    stream.endWrite();
                }
                catch { /* peer gone */ }
            };
            sock.on('end', () => { void writes.then(onUpstreamEnd, onUpstreamEnd); });
            sock.on('error', async (err) => {
                clearTimeout(connectTimer);
                const p = currentPhase();
                if (p === 'relay' || p === 'dead') {
                    die('unreachable', 'upstream error');
                    return;
                }
                if (connected) {
                    // TCP came up and then the socket failed while the success reply was
                    // still in flight. `settled` is already true, so the retry arm below
                    // would return silently and the connect handler would go on to declare
                    // 'relay' on a socket that is gone.
                    die('unreachable', 'upstream error', `upstream failed before relay: ${err.code ?? 'error'}`);
                    return;
                }
                if (settled)
                    return;
                settled = true;
                if (attempt < maxAttempts && RETRYABLE.has(err.code ?? '')) {
                    // Small backoff so an instantaneous reset does not spin. Held in a
                    // cancellable handle: an uncancelled one keeps the event loop alive
                    // after the stream is already dead.
                    retryTimer = setTimeout(() => {
                        retryTimer = undefined;
                        if (currentPhase() !== 'dead')
                            attemptConnect(attempt + 1);
                    }, 50);
                    return;
                }
                const { rep, reason } = errnoToReply(err.code);
                await reply(rep);
                die(reason, `connect failed: ${err.code ?? 'error'}`);
            });
        };
        attemptConnect(1);
    };
    /**
     * Advance the handshake over whatever is buffered.
     *
     * Stops at `dialing` as well as `relay`/`dead`: once a CONNECT has been
     * accepted, remaining bytes are payload for the upstream, not another request.
     */
    const pumpOnce = async () => {
        while (phase !== 'relay' && phase !== 'dead' && phase !== 'dialing') {
            if (phase === 'greeting') {
                if (buf.length < 2)
                    return;
                if (buf[0] !== VER) {
                    die('not-socks5', 'not socks5');
                    return;
                }
                const n = buf[1];
                if (buf.length < 2 + n)
                    return;
                const methods = new Set(buf.subarray(2, 2 + n));
                buf = buf.subarray(2 + n);
                if (!methods.has(M_USERPASS)) {
                    await send(new Uint8Array([VER, M_NONE]));
                    die('no-acceptable-auth', 'client offered no username/password method');
                    return;
                }
                if (!(await send(new Uint8Array([VER, M_USERPASS]))))
                    return;
                // `send` resolving does not mean the stream is still alive: a reset that
                // arrived while the write was in flight already ran die(). Advancing the
                // phase unconditionally brought the machine back from 'dead', and it went
                // on to consume the buffered request and dial — after the slot had been
                // released and the transport handle discarded.
                if (currentPhase() === 'dead')
                    return;
                phase = 'auth';
                continue;
            }
            if (phase === 'auth') {
                // VER(1)=1 | ULEN(1) | UNAME | PLEN(1) | PASSWD
                if (buf.length < 2)
                    return;
                if (buf[0] !== AUTH_VER) {
                    die('auth-failed', 'bad auth version');
                    return;
                }
                const ulen = buf[1];
                if (buf.length < 3 + ulen)
                    return;
                const plen = buf[2 + ulen];
                const total = 3 + ulen + plen;
                if (buf.length < total)
                    return;
                const user = buf.subarray(2, 2 + ulen).toString('utf8');
                const pass = buf.subarray(3 + ulen, total).toString('utf8');
                buf = buf.subarray(total);
                const ok = credentialsMatch(user, opts.auth.username) &&
                    credentialsMatch(pass, opts.auth.password);
                if (!(await send(new Uint8Array([AUTH_VER, ok ? 0x00 : 0x01]))))
                    return;
                if (!ok) {
                    die('auth-failed', 'authentication failed');
                    return;
                }
                // Same resurrection hazard as the greeting reply above.
                if (currentPhase() === 'dead')
                    return;
                phase = 'request';
                continue;
            }
            // phase === 'request'
            if (buf.length < 4)
                return;
            if (buf[0] !== VER) {
                die('not-socks5', 'bad request version');
                return;
            }
            // RFC 1928: RSV is reserved and MUST be 0x00. Accepting anything else
            // means accepting a request no conforming client sends.
            if (buf[2] !== 0x00) {
                die('not-socks5', 'reserved byte must be zero');
                return;
            }
            const cmd = buf[1];
            const atyp = buf[3];
            let host;
            let cursor;
            if (atyp === ATYP_V4) {
                if (buf.length < 10)
                    return;
                host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
                cursor = 8;
            }
            else if (atyp === ATYP_DOMAIN) {
                // The length byte itself must be present before it can be read. With
                // exactly 4 bytes buffered, `buf[4]` is undefined, `7 + undefined` is
                // NaN, and `buf.length < NaN` is false — so the guard below waved the
                // request through and the parse ran on garbage. Tunnel frames split
                // wherever the peer's writes land, so this boundary is reachable.
                if (buf.length < 5)
                    return;
                const dlen = buf[4];
                if (buf.length < 7 + dlen)
                    return;
                host = buf.subarray(5, 5 + dlen).toString('utf8');
                cursor = 5 + dlen;
            }
            else if (atyp === ATYP_V6) {
                if (buf.length < 22)
                    return;
                await reply(REP_ATYP_UNSUP);
                die('ipv6-unsupported', 'IPv6 destinations are not supported');
                return;
            }
            else {
                await reply(REP_ATYP_UNSUP);
                die('ipv6-unsupported', 'unknown address type');
                return;
            }
            const port = buf.readUInt16BE(cursor);
            buf = buf.subarray(cursor + 2);
            if (cmd !== CMD_CONNECT) {
                await reply(REP_CMD_UNSUP);
                die('command-unsupported', 'only CONNECT is supported');
                return;
            }
            // dial() owns the phase from here: it flips to 'relay' on success and to
            // 'dead' on any refusal, so the loop must not continue past this point.
            await dial(host, port);
            return;
        }
    };
    /**
     * Serialize handshake parsing.
     *
     * `pumpOnce` awaits on every reply it sends, and data arriving during one of
     * those awaits used to start a SECOND loop over the same `buf`: two parsers
     * racing on one buffer, each consuming bytes the other had already read. The
     * 'dialing' phase closed the dangerous CONNECT case, but greeting and auth
     * were still exposed. Only one loop runs at a time; work that arrives while it
     * is running is picked up by the re-check instead of a parallel loop.
     */
    let pumping = false;
    let pumpQueued = false;
    const pump = async () => {
        if (pumping) {
            pumpQueued = true;
            return;
        }
        pumping = true;
        try {
            do {
                pumpQueued = false;
                await pumpOnce();
            } while (pumpQueued && phase !== 'relay' && phase !== 'dead' && phase !== 'dialing');
        }
        finally {
            pumping = false;
        }
    };
    // Admission control happens HERE, not at dial time.
    //
    // Counting only dialled streams left two holes: a stream that stalls before
    // CONNECT is never counted (so any number of them can accumulate), and the
    // old check ran before an awaited DNS lookup, so a burst could all pass the
    // cap before any of them incremented it. Charging a slot at creation closes
    // both, and `release()` on every terminal path keeps it exact.
    state.active++;
    counted = true;
    if (state.active > maxConcurrent) {
        // No SOCKS reply: the handshake has not happened, so there is no reply the
        // peer could parse. Resetting the stream is the protocol-correct refusal.
        die('concurrency-limit', 'too many concurrent streams');
        return { close(reason = 'server closing') { die('unreachable', reason); } };
    }
    handshakeTimer = setTimeout(() => {
        const p = currentPhase();
        // 'dialing' is exempt: that stream finished its handshake and is waiting on
        // DNS and a TCP connect, both of which carry their own deadlines. Without
        // this a slow-but-healthy connect is killed by the handshake timer whenever
        // connectTimeoutMs is raised or handshakeTimeoutMs lowered.
        if (p === 'relay' || p === 'dead' || p === 'dialing')
            return;
        die('connect-timeout', 'handshake timeout');
    }, handshakeTimeoutMs);
    stream.onData((bytes) => {
        if (phase === 'dead')
            return;
        if (phase === 'relay') {
            bumpIdle();
            const sock = upstream;
            if (!sock)
                return;
            bytesUp += bytes.byteLength;
            const ok = sock.write(Buffer.from(bytes));
            if (!ok) {
                // Backpressure here is ADVISORY, and the peer may simply ignore it.
                //
                // The session replenishes the tunnel window from `.then()` on the
                // promise below rather than awaiting it before delivering the next
                // frame, so a peer that keeps sending while the socket is full is not
                // actually throttled. Node buffers every write regardless of the
                // `false` return, so the unflushed bytes are the real growth — one
                // stream can hold as much memory as the peer cares to send.
                if (sock.writableLength > MAX_RELAY_BUFFER_BYTES) {
                    die('backpressure-exceeded', 'peer ignored flow control', `${sock.writableLength} bytes unflushed to the destination`);
                    return;
                }
                // One waiter per socket, not one per frame: a fresh Promise with three
                // listeners on every frame trips MaxListenersExceededWarning and grows
                // the listener set without bound. Everyone awaits the same drain.
                drainWaiter ??= new Promise((resolve) => {
                    const done = () => {
                        sock.off('drain', done);
                        sock.off('close', done);
                        sock.off('error', done);
                        drainWaiter = undefined;
                        resolve();
                    };
                    sock.once('drain', done);
                    sock.once('close', done);
                    sock.once('error', done);
                });
                return drainWaiter;
            }
            return;
        }
        // Bound EVERY non-relay phase here, synchronously, before allocating.
        //
        // Deferring this to pump() does not work and the reason is not obvious:
        // pump() is re-entrant-guarded, so while it sits mid-await on a reply that
        // the tunnel has not granted credit for, every later onData call returns at
        // `if (pumping)` without ever reaching the cap inside its loop. The peer
        // chooses that precondition — it advertises the initial window in HELLO, and
        // a 1-byte window blocks the 2-byte method-selection reply indefinitely.
        // Measured: 16 MiB accepted on one unauthenticated stream, no deny, no reset.
        //
        // Checked before the concat so an oversized frame is refused rather than
        // copied, and so repeated concatenation cannot go quadratic on the way up.
        //
        // This is the SINGLE enforcement point. `pump()` used to carry a copy, but
        // once the bound moved here `buf` can never exceed it by the time pump runs
        // — the copy was unreachable by construction, and a mutation gate confirmed
        // no test could tell it apart from a no-op. An inert guard that reads as a
        // live one is worse than no guard, so it is gone rather than kept "for
        // defence in depth".
        if (buf.length + bytes.byteLength > MAX_HANDSHAKE_BYTES) {
            die('handshake-too-large', 'handshake too large');
            return;
        }
        buf = Buffer.concat([buf, Buffer.from(bytes)]);
        // While dialling, bytes are the client pipelining its payload behind the
        // request. They belong to the upstream once it is up (the relay handover
        // flushes `buf`), never to the request parser — so pump() must not see them.
        if (phase === 'dialing')
            return;
        return pump();
    });
    stream.onEnd(() => {
        if (phase === 'dead')
            return;
        clientEnded = true;
        if (phase === 'relay') {
            // Ordinary half-close: pass the FIN to the origin and keep reading its
            // response. finish() only once the origin has ended too.
            upstream?.end();
            if (upstreamEnded)
                finish();
            return;
        }
        if (phase === 'dialing') {
            // The dial is still in flight. Ending the socket here queues FIN ahead of
            // the pipelined bytes that the relay handover flushes, which makes that
            // flush a write-after-end and loses the upload; calling finish() here
            // instead cancelled a connection the client had legitimately half-closed.
            // Defer: the handover applies the FIN once the payload is out.
            return;
        }
        // greeting / auth / request: the peer left mid-handshake. There is no
        // destination and no conversation, so this is not a success — reporting it
        // as one filled the telemetry with ok:true events for host:"" port:0.
        die('client-closed', 'client closed during handshake');
    });
    stream.onReset(() => die('unreachable', 'client reset'));
    return {
        close(reason = 'server closing') {
            die('unreachable', reason);
        },
    };
}
