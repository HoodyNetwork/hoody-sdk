/**
 * HTTP/TCP stream forwarding for tunnel sessions. Handles STREAM_OPEN
 * dispatch, request body streaming, WebSocket upgrades, and TCP forwarding.
 */
import type { TunnelSession } from "./tunnel-session.js";
export interface LocalTarget {
    host: string;
    port: number;
}
export declare function destroyAllLocalAgents(): void;
export declare function handleHttpStream(session: TunnelSession, streamId: number, openPayload: any, target: LocalTarget): Promise<void>;
/**
 * Handle an incoming TCP STREAM_OPEN by forwarding to a local TCP server.
 */
export declare function handleTcpStream(session: TunnelSession, streamId: number, target: LocalTarget): void;
/**
 * Set up automatic stream forwarding for a session.
 * Intercepts STREAM_OPEN frames and forwards to the appropriate local target.
 */
export declare function setupAutoForwarding(session: TunnelSession, httpTarget: LocalTarget, tcpTarget?: LocalTarget): void;
