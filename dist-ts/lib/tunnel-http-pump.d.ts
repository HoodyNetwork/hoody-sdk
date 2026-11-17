/**
 * HTTP/TCP stream forwarding for tunnel sessions. Handles STREAM_OPEN
 * dispatch, request body streaming, WebSocket upgrades, and TCP forwarding.
 */
import type { TunnelSession } from "./tunnel-session.js";
export interface LocalTarget {
    host: string;
    port: number;
}
/** Destroy every keep-alive HTTP agent this module holds for local targets, closing their idle sockets, and forget them. */
export declare function destroyAllLocalAgents(): void;
/**
 * Serve one HTTP request that arrived on tunnel stream `streamId`: forward the request described by
 * `openPayload` to the local `target` and write the response back on the stream. The returned
 * promise resolves as soon as forwarding has started, not when the response is complete; a failure
 * resets the stream and never rejects here.
 */
export declare function handleHttpStream(session: TunnelSession, streamId: number, openPayload: any, target: LocalTarget): Promise<void>;
/**
 * Handle an incoming TCP STREAM_OPEN by forwarding to a local TCP server.
 */
export declare function handleTcpStream(session: TunnelSession, streamId: number, target: LocalTarget): void;
/**
 * Set up automatic stream forwarding for a session.
 * Intercepts STREAM_OPEN frames and forwards to the appropriate local target.
 *
 * Installed as the session's inbound router, so it covers every socket the
 * session has or opens later (v2 secondaries included). Call it before
 * `connect()` when the kit can open a stream right behind HELLO_OK (a resumed
 * session): see `TunnelSession.setInboundRouter()`.
 */
export declare function setupAutoForwarding(session: TunnelSession, httpTarget: LocalTarget, tcpTarget?: LocalTarget): void;
