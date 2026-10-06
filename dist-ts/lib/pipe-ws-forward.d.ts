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
export declare const FWD_WINDOW: number;
export declare const FWD_FRAME_MAX: number;
export declare const FWD_FRAME_CHARGE = 64;
export declare const FWD_ACK_EVERY: number;
/** Close code for a wire-protocol violation. */
export declare const FWD_PROTOCOL_ERROR = 4002;
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
export declare function bridgeTcpOverWs(ws: WebSocket, local: net.Socket | (() => net.Socket), label?: string): WsBridge;
