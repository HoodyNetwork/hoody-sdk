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
import { type Socks5ServerOptions } from './socks5-server.js';
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
/**
 * Connect, bind a loopback PULL port, and serve SOCKS5 on it.
 */
export declare function tunnelSocks5(opts: TunnelSocks5Options): Promise<TunnelSocks5Handle>;
