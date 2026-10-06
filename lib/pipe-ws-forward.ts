/**
 * forwardTcp over the pipe kit's WebSocket relay (`transport: 'ws'`), Node only.
 *
 * One TCP connection rides one relay pair. The relay carries messages 1:1 and
 * closes a pair whose reader falls 2 MiB behind, so the two forwarders
 * flow-control end to end (wire protocol v1):
 *
 *   - data: binary frames of 1-64 KiB, the TCP bytes in order;
 *   - control: text JSON — {"t":"hello","v":1}, {"t":"ack","n":k}, {"t":"fin"};
 *   - each side sends hello on open and no data before the peer's hello (the
 *     connect side dials its service only then), so the relay's pre-pair
 *     queue holds one hello at most;
 *   - credit: a frame of `len` bytes costs len + 64 units; a sender keeps at
 *     most WINDOW (1 MiB) units unacknowledged, pausing its TCP socket;
 *   - the receiver acks (delta) every 256 KiB of units written to its socket,
 *     and acks the remainder when the peer's fin arrives (after the preceding
 *     writes complete), then ends its socket's write half;
 *   - the receiver enforces the window: a frame that is empty, over 64 KiB,
 *     or past WINDOW unacknowledged units closes with 4002 before anything is
 *     written locally, so a misbehaving peer cannot grow the socket buffer;
 *   - a side closes with 1000 once it sent fin, got fin, ended its socket and
 *     all its units are acked. Any other close destroys the local socket.
 */

import type net from 'node:net';

export const FWD_WINDOW = 1024 * 1024;
export const FWD_FRAME_MAX = 64 * 1024;
export const FWD_FRAME_CHARGE = 64;
export const FWD_ACK_EVERY = 256 * 1024;
/** Close code for a wire-protocol violation. */
export const FWD_PROTOCOL_ERROR = 4002;

export interface WsBridge {
  /** Resolves when the WebSocket closed and the local socket is done. */
  done: Promise<void>;
  /** Abort the bridge: close the WebSocket, destroy the local socket. */
  close: () => void;
}

/**
 * Bridge `ws` (already created, open or opening) to a local socket.
 * `local` is the socket itself (listen side) or a dialer called once the
 * peer's hello arrived (connect side).
 */
export function bridgeTcpOverWs(
  ws: WebSocket,
  local: net.Socket | (() => net.Socket),
  label = 'forwardTcp',
): WsBridge {
  ws.binaryType = 'arraybuffer';
  let sock: net.Socket | null = typeof local === 'function' ? null : local;
  const preSock: Uint8Array[] = [];     // data that arrived while the dial is pending

  let gotHello = false;
  let sentFin = false;
  let gotFin = false;
  let localEof = false;
  let localEnded = false;
  let finished = false;

  let sentUnits = 0;
  let ackedUnits = 0;
  let recvUnits = 0;      // units received and not yet acked back
  let pendingAck = 0;     // units written locally, not yet acked
  let writesInFlight = 0;
  const outQueue: Uint8Array[] = [];

  let opened = false;
  let failure = '';       // the socket's error text (the `ws` package names the HTTP status)
  let broken = '';        // why this side cut the tunnel (local connection lost, protocol error)
  let resolveDone!: () => void;
  let rejectDone!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => { resolveDone = res; rejectDone = rej; });
  done.catch(() => { /* surfaced to callers that await it */ });

  const send = (m: string | Uint8Array) => { try { ws.send(m); } catch { /* closing */ } };
  const closeWs = (code: number, reason: string) => { try { ws.close(code, reason); } catch { /* closing */ } };
  const protocolError = (why: string) => {
    broken ||= `protocol error: ${why}`;
    closeWs(FWD_PROTOCOL_ERROR, 'forwardTcp protocol error.');
    sock?.destroy(new Error(`${label}: protocol error: ${why}`));
  };

  const sendAck = () => {
    if (pendingAck === 0) return;
    send(JSON.stringify({ t: 'ack', n: pendingAck }));
    recvUnits -= pendingAck;
    pendingAck = 0;
  };

  const maybeClose = () => {
    if (!finished && sentFin && gotFin && localEnded && ackedUnits === sentUnits) {
      finished = true;
      closeWs(1000, '');
    }
  };

  // Peer's fin: finish the preceding writes, ack the remainder, end our write half.
  const maybeEndLocal = () => {
    if (!gotFin || writesInFlight > 0 || sock === null || localEnded) return;
    sendAck();
    sock.end(() => { localEnded = true; maybeClose(); });
  };

  const writeLocal = (data: Uint8Array) => {
    const cost = data.byteLength + FWD_FRAME_CHARGE;
    writesInFlight++;
    sock!.write(data, (err) => {
      writesInFlight--;
      if (err) return;
      pendingAck += cost;
      if (pendingAck >= FWD_ACK_EVERY) sendAck();
      maybeEndLocal();
    });
  };

  // Send queued local bytes while the window allows; then fin if EOF was seen.
  const pump = () => {
    // Nothing (data or fin) goes out before the peer's hello; hello calls pump().
    if (!gotHello) return;
    while (outQueue.length > 0) {
      const f = outQueue[0]!;
      const cost = f.byteLength + FWD_FRAME_CHARGE;
      if (sentUnits - ackedUnits + cost > FWD_WINDOW) { sock?.pause(); return; }
      outQueue.shift();
      sentUnits += cost;
      send(f);
    }
    if (localEof) {
      if (!sentFin) { sentFin = true; send(JSON.stringify({ t: 'fin' })); maybeClose(); }
      return;
    }
    sock?.resume();
  };

  const attach = (s: net.Socket) => {
    (s as net.Socket & { allowHalfOpen?: boolean }).allowHalfOpen = true;
    s.on('data', (chunk: Buffer) => {
      for (let off = 0; off < chunk.length; off += FWD_FRAME_MAX) {
        outQueue.push(new Uint8Array(chunk.subarray(off, off + FWD_FRAME_MAX)));
      }
      pump();
    });
    s.on('end', () => { localEof = true; pump(); });
    s.on('error', () => { /* 'close' follows */ });
    s.on('close', () => {
      // Both halves ended normally: the close waits for the last acks.
      if (localEof && localEnded) return;
      if (!finished) { finished = true; broken ||= 'the local connection was lost'; closeWs(4001, 'forwardTcp local connection ended.'); }
    });
    for (const d of preSock.splice(0)) writeLocal(d);
    maybeEndLocal();
  };
  if (sock) { sock.pause(); attach(sock); }   // flows once the peer's hello arrives (pump)

  const onOpen = () => { opened = true; send(JSON.stringify({ t: 'hello', v: 1 })); };
  ws.addEventListener('open', onOpen);
  // A refused upgrade or failed connect: 'close' follows and tears the bridge
  // down. Without a listener the `ws` package would throw the error.
  ws.addEventListener('error', (ev: Event) => { failure ||= String((ev as { message?: string }).message ?? ''); });

  ws.addEventListener('message', (ev: MessageEvent) => {
    if (finished) return;
    const d = ev.data as unknown;
    if (typeof d === 'string') {
      let msg: { t?: unknown; v?: unknown; n?: unknown } | null = null;
      try { msg = JSON.parse(d); } catch { /* invalid */ }
      if (msg === null || typeof msg !== 'object') return protocolError('malformed control message');
      if (msg.t === 'hello') {
        if (gotHello) return protocolError('second hello');
        if (msg.v !== 1) return protocolError(`unsupported version ${String(msg.v)}`);
        gotHello = true;
        if (sock === null && typeof local === 'function') { sock = local(); attach(sock); }
        pump();
        return;
      }
      if (!gotHello) return protocolError('control before hello');
      if (msg.t === 'ack') {
        const n = msg.n;
        if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > sentUnits - ackedUnits) {
          return protocolError('invalid ack');
        }
        ackedUnits += n;
        pump();
        maybeClose();
        return;
      }
      if (msg.t === 'fin') {
        if (gotFin) return protocolError('second fin');
        gotFin = true;
        maybeEndLocal();
        return;
      }
      return protocolError('unknown control message');
    }
    const data = d instanceof ArrayBuffer ? new Uint8Array(d)
      : new Uint8Array((d as ArrayBufferView).buffer, (d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteLength);
    if (!gotHello || gotFin) return protocolError('data outside hello..fin');
    const cost = data.byteLength + FWD_FRAME_CHARGE;
    if (data.byteLength === 0 || data.byteLength > FWD_FRAME_MAX || recvUnits + cost > FWD_WINDOW) {
      return protocolError('frame size or window exceeded');
    }
    recvUnits += cost;
    if (sock === null) { preSock.push(data); return; }
    writeLocal(data);
  });

  const onClose = (ev: { code: number }) => {
    finished = true;
    outQueue.length = 0;
    if (!opened) {
      // Never connected (refused upgrade, bad credentials, unreachable): a failure, not an end.
      sock?.destroy();
      rejectDone(new Error(`${label}: WebSocket connection failed${failure ? `: ${failure}` : ` (${ev.code})`}`));
      return;
    }
    // 1000 is a finished tunnel or a deliberate close() on either side; any
    // other code (a peer's lost connection 4001, a protocol error, the kit
    // going away) or a cut on this side is a failure.
    const settle = () => {
      if (ev.code === 1000 && !broken) resolveDone();
      else rejectDone(new Error(`${label}: the tunnel failed: ${broken || (ev.code === 4001 ? "the peer's local connection was lost (4001)" : `closed with code ${ev.code}`)}`));
    };
    if (sock) {
      // A normal close after fin both ways: our end() is already under way.
      // After the peer's fin alone, the local service may still be sending:
      // nothing carries that half any more, so the connection is closed.
      if (!(ev.code === 1000 && gotFin && localEof)) sock.destroy();
      if (sock.destroyed || sock.writableFinished) settle();
      else sock.once('close', settle);
    } else {
      settle();
    }
  };
  ws.addEventListener('close', (ev: Event) => onClose(ev as CloseEvent));
  // The socket may have opened or failed before these listeners existed (it is
  // created by an async helper): replay what was missed.
  if (ws.readyState === 1) onOpen();
  else if (ws.readyState === 3) onClose({ code: 1006 });

  return {
    done,
    close: () => {
      finished = true;
      closeWs(1000, 'Closed.');
      sock?.destroy();
    },
  };
}
