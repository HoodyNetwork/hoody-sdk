/**
 * High-level tunnel API: expose(), pull(), serve(). One-call wrappers that
 * build a TunnelSession, perform connect + bind, and install local
 * forwarding (HTTP fetch / TCP / Bun.serve) so callers don't have to wire
 * the lower-level protocol pieces themselves.
 */
import { TunnelSession } from "./tunnel-session.js";
import { setupAutoForwarding } from "./tunnel-http-pump.js";
import { FrameType } from "./tunnel-protocol-types.js";
import { decodeFrames } from "./tunnel-protocol-codec.js";
import { handleTcpStream } from "./tunnel-http-pump.js";
/**
 * High-level convenience: connect + expose in one call.
 *
 * Use `containerPort: 0` for auto-assigned random port.
 * Returns the public URL in `handle.publicUrl`.
 */
export async function expose(opts) {
    if (!opts.url && !opts.container) {
        throw new Error("tunnelExpose: either `url` or `container` is required");
    }
    if (!opts.token) {
        throw new Error("tunnelExpose: `token` is required");
    }
    const url = opts.url ?? `ws://${opts.container}/api/v1/tunnel/connect`;
    const session = new TunnelSession({ url, token: opts.token });
    try {
        await session.connect();
        // Install forwarding BEFORE awaiting bind() — otherwise a STREAM_OPEN
        // batched with (or arriving immediately after) BIND_OK is dispatched
        // through the default connect() onmessage handler, which has no
        // stream handlers registered and silently drops the frame. The
        // auto-forwarder's onmessage handles BIND_OK (via dispatchFrame) AND
        // STREAM_OPEN, so installing it first closes the race.
        setupAutoForwarding(session, opts.to);
        const bind = await session.bind({
            kind: "http",
            mode: "expose",
            containerPort: opts.containerPort,
            ...(opts.takeover !== undefined && { takeover: opts.takeover }),
        });
        const handle = {
            session,
            bind,
            publicUrl: bind.publicUrl,
            async close() {
                await session.close();
            },
            async [Symbol.asyncDispose]() {
                await session.close();
            },
        };
        return handle;
    }
    catch (err) {
        // Tear down the session on any failure so callers don't leak an open WebSocket.
        await session.close().catch(() => { });
        throw err;
    }
}
/**
 * High-level convenience: connect + pull in one call.
 */
export async function pull(opts) {
    if (!opts.url && !opts.container) {
        throw new Error("tunnelPull: either `url` or `container` is required");
    }
    if (!opts.token) {
        throw new Error("tunnelPull: `token` is required");
    }
    const url = opts.url ?? `ws://${opts.container}/api/v1/tunnel/connect`;
    const session = new TunnelSession({ url, token: opts.token });
    try {
        await session.connect();
        // Install the TCP stream intercept BEFORE awaiting bind() so
        // STREAM_OPEN frames batched with or immediately following BIND_OK
        // aren't dropped by the default onmessage handler (which has no
        // stream handlers registered at that point). See expose() for the
        // race explanation.
        const origWs = session.ws;
        origWs.onmessage = (event) => {
            const data = new Uint8Array(event.data);
            let result;
            try {
                result = decodeFrames(data);
            }
            catch {
                return;
            }
            for (const frame of result.frames) {
                if (frame.header.frameType === FrameType.StreamOpen) {
                    // Guard JSON.parse on peer-controlled STREAM_OPEN payload. Without
                    // this, malformed JSON would throw synchronously and kill the
                    // onmessage handler for the rest of the session.
                    let payload;
                    try {
                        payload = JSON.parse(new TextDecoder().decode(frame.payload));
                    }
                    catch {
                        session.resetStream?.(frame.header.streamId);
                        continue;
                    }
                    if (payload.kind === "tcp") {
                        handleTcpStream(session, frame.header.streamId, opts.to);
                        continue;
                    }
                }
                session.dispatchFrame(frame, origWs);
            }
        };
        const bind = await session.bind({
            kind: "tcp",
            mode: "pull",
            containerPort: opts.containerPort,
            ...(opts.host !== undefined && { host: opts.host }),
        });
        return {
            session,
            bind,
            // Propagate bind.publicUrl (parity with expose()). Without this,
            // pull() returns `handle.publicUrl === undefined` even when the bind
            // result carries a public URL.
            publicUrl: bind.publicUrl,
            async close() { await session.close(); },
            async [Symbol.asyncDispose]() { await session.close(); },
        };
    }
    catch (err) {
        await session.close().catch(() => { });
        throw err;
    }
}
/**
 * High-level convenience: start a local Bun.serve + connect + expose.
 */
export async function serve(opts) {
    // Start local server on random port
    const server = Bun.serve({
        port: 0,
        fetch: opts.fetch,
    });
    const localPort = server.port;
    try {
        const handle = await expose({
            ...opts,
            to: { host: "127.0.0.1", port: localPort },
        });
        return {
            ...handle,
            // If the kit assigned a public URL (tunnel is exposed externally),
            // use that. Otherwise fall back to the local server URL — NOT
            // opts.containerPort (which is the *container* port, not local).
            url: handle.publicUrl ?? `http://127.0.0.1:${localPort}`,
            async close() {
                server.stop(true);
                await handle.close();
            },
            async [Symbol.asyncDispose]() {
                server.stop(true);
                await handle.close();
            },
        };
    }
    catch (err) {
        server.stop(true);
        throw err;
    }
}
/** Re-export for direct low-level access. */
export { TunnelSession } from "./tunnel-session.js";
/** Re-export connect for the tunnel namespace */
export { TunnelSession as connect } from "./tunnel-session.js";
