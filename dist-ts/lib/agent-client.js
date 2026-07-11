import { parseSseStream } from './pipe-stream.js';
import { ApiError } from '../generated/errors.js';
/** Terminal events that END a turn. `stream_done` is NOT terminal — it only
 *  marks end-of-text; tool calls (and the real `agent_done`) follow it. */
const TERMINAL_EVENTS = new Set(['event.agent_done', 'agent_done', 'event.quit', 'quit']);
/** Assistant text-delta event. */
const TEXT_EVENTS = new Set(['event.stream_chunk', 'stream_chunk']);
/** Mint a container claim via the public authorize() API and pair it with the
 *  client's auth token (the claim object is JSON-stringified for the header,
 *  matching the CLI / proxy-auth-middleware contract). */
async function mintKitAuth(client, container) {
    const containerId = container.id;
    if (!containerId)
        throw new Error('streamAgentPrompt: container.id is required');
    const resp = await client.api.containers.authorize(containerId);
    const claimRaw = resp?.data?.container_claim ?? resp?.data?.claim;
    if (!claimRaw)
        throw new Error('authorize response contained no container_claim');
    const token = resp?.data?.token ?? resp?.data?.x_hoody_token ?? (await client.getAuthToken());
    if (!token)
        throw new Error('no auth token available for agent kit handshake');
    return {
        claim: typeof claimRaw === 'string' ? claimRaw : JSON.stringify(claimRaw),
        token: String(token),
    };
}
/**
 * Dispatch a streaming prompt turn against an existing agent session and return
 * a handle over the SSE event stream. Create the session first via
 * `client.api`-scoped `box.agent.sessions.createSession(...)`.
 */
export async function streamAgentPrompt(client, args) {
    const { container, sessionId, text } = args;
    if (!sessionId)
        throw new Error('streamAgentPrompt: sessionId is required');
    const auth = args.auth ?? (await mintKitAuth(client, container));
    const base = client.getKitUrl('agent', container, args.serviceIndex ?? 1);
    const qs = args.policy ? `?policy=${encodeURIComponent(args.policy)}` : '';
    const url = `${base}/api/v1/agent/sessions/${encodeURIComponent(sessionId)}/prompt:stream${qs}`;
    // Internal abort so cancel() can tear down the fetch independently of the
    // caller-supplied signal. `cancelled` lets the read loop treat the resulting
    // AbortError as a clean stop rather than a rejected `done`.
    let cancelled = false;
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    if (args.signal) {
        if (args.signal.aborted)
            ac.abort();
        else
            args.signal.addEventListener('abort', onAbort, { once: true });
    }
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Hoody-Container-Claim': auth.claim,
        'X-Hoody-Token': auth.token,
    };
    if (args.policy === 'auto_approve')
        headers['X-Hoody-Gate-Policy'] = 'auto_approve';
    const body = { text };
    if (args.toolMode)
        body.tool_mode = args.toolMode;
    if (args.dirScope)
        body.dir_scope = args.dirScope;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ac.signal,
    });
    if (!res.ok || !res.body) {
        let detail;
        try {
            detail = await res.json();
        }
        catch { /* ignore */ }
        throw new ApiError({
            message: `agent prompt:stream failed (${res.status})`,
            status: res.status,
            request: { method: 'POST', url, headers: {} },
            response: detail,
        });
    }
    const mkQ = () => ({ items: [], waiters: [], ended: false, consumed: false });
    const push = (q, v) => {
        const w = q.waiters.shift();
        if (w) {
            w({ value: v, done: false });
            return;
        }
        if (q.consumed)
            q.items.push(v); // drop if nobody is (or has begun) iterating
    };
    const end = (q, err) => { q.ended = true; q.err = err; let w; while ((w = q.waiters.shift()))
        w({ value: undefined, done: true }); };
    const iter = (q) => ({
        [Symbol.asyncIterator]() {
            q.consumed = true;
            return {
                next() {
                    if (q.items.length)
                        return Promise.resolve({ value: q.items.shift(), done: false });
                    if (q.err)
                        return Promise.reject(q.err);
                    if (q.ended)
                        return Promise.resolve({ value: undefined, done: true });
                    return new Promise((resolve) => q.waiters.push(resolve));
                },
            };
        },
    });
    const eventsQ = mkQ();
    const textQ = mkQ();
    let acc = '';
    let resolveDone;
    let rejectDone;
    const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    // Prevent an unhandledRejection crash when the caller only iterates
    // events/text (or calls cancel()) and never attaches a handler to `done`.
    done.catch(() => { });
    // Control frames the gateway emits that are NOT turn events: `replay_boundary`
    // is stream-setup noise (skip); `end` closes the stream cleanly; `lagged` means
    // the gateway DROPPED this slow subscriber — the turn continues server-side, so
    // surfacing it as an error makes the truncation observable instead of a silent
    // partial `text`. NOTE: `retry` is deliberately NOT skipped — `event.retry`
    // ("LLM call retried") is a real turn event a caller may want to observe; the
    // SSE `retry:` reconnect *directive* never reaches here as a frame (it carries
    // no `data:` line), so skipping `retry` would only swallow the real event.
    const SKIP_CONTROL = new Set(['replay_boundary', 'event.replay_boundary']);
    const finishOk = (terminal, data) => {
        resolveDone({ terminal, text: acc, data });
        end(eventsQ);
        end(textQ);
    };
    const errToApiError = (payload) => {
        const msg = (payload && typeof payload === 'object' && payload.message) || 'agent stream error';
        return new ApiError({ message: String(msg), status: 0, request: { method: 'POST', url, headers: {} }, response: payload });
    };
    const finishErr = (err) => {
        rejectDone(err);
        end(eventsQ, err);
        end(textQ, err);
    };
    // `event.error` is NOT a turn terminator. The daemon emits NON-terminal error
    // notices mid-turn (auto-reply budget, attachment-dropped, pin-unavailable —
    // and for idle control commands that never reach agent_done) and ALWAYS
    // follows a FATAL error with `agent_done`. So we RECORD the latest error and
    // keep reading; only an `agent_done` preceded by an error fails the turn
    // (mirrors the daemon's prompt:sync status:error logic). Bailing on the first
    // `event.error` would truncate a still-running turn — or return before a
    // confirm gate the error preceded is parked.
    let lastError = null;
    (async () => {
        try {
            for await (const sse of parseSseStream(res.body)) {
                // Skip data-less frames — e.g. the gateway's leading `retry: 5000`
                // reconnect directive, which the SSE parser surfaces with empty data.
                if (typeof sse.data === 'string' && sse.data.trim() === '')
                    continue;
                // `parseSseStream` yields { event, data: string }. The `data` payload is
                // the full gatedEvent {seq, event:{type,data}} — unwrap it. Control
                // frames (lagged/end/replay_boundary) have no `.event` key.
                let envelope = sse.data;
                if (typeof envelope === 'string') {
                    try {
                        envelope = JSON.parse(envelope);
                    }
                    catch {
                        envelope = null;
                    }
                }
                const inner = (envelope && typeof envelope === 'object' && envelope.event && typeof envelope.event === 'object')
                    ? envelope.event
                    : { type: sse.event ?? 'message', data: envelope };
                const type = inner?.type ?? sse.event ?? 'message';
                const bare = type.replace(/^event\./, '');
                const seq = (envelope && typeof envelope.seq === 'number') ? envelope.seq : null;
                if (SKIP_CONTROL.has(type) || SKIP_CONTROL.has(bare))
                    continue;
                if (bare === 'lagged') {
                    throw new ApiError({
                        message: 'agent stream lagged: the gateway dropped this subscriber (output too slow); reconnect with ?since=<seq>',
                        status: 0,
                        request: { method: 'POST', url, headers: {} },
                        response: inner?.data ?? envelope,
                    });
                }
                if (bare === 'end') {
                    finishOk('end', inner?.data ?? null);
                    return;
                }
                push(eventsQ, { type, data: inner?.data ?? null, seq });
                if (TEXT_EVENTS.has(type)) {
                    const delta = (inner?.data && typeof inner.data === 'object' && typeof inner.data.text === 'string')
                        ? inner.data.text : '';
                    if (delta) {
                        acc += delta;
                        push(textQ, delta);
                    }
                }
                else if (bare === 'error') {
                    // Record; do NOT terminate (see note above). The event was already
                    // pushed to eventsQ so consumers still see the notice.
                    lastError = inner?.data ?? { message: 'agent stream error' };
                }
                else if (TERMINAL_EVENTS.has(type)) {
                    // agent_done preceded by an error = a failed turn (daemon status:error).
                    // quit is its own clean terminal (daemon status:quit), never an error.
                    if (lastError !== null && (type === 'event.agent_done' || type === 'agent_done')) {
                        finishErr(errToApiError(lastError));
                        return;
                    }
                    finishOk(type, inner?.data ?? null);
                    return;
                }
            }
            // Stream closed without an explicit terminal event (agent_done/quit/end) =
            // a dropped/truncated turn — surface it rather than resolving as success
            // with a partial `text`. Prefer a recorded error notice if present.
            if (lastError !== null) {
                finishErr(errToApiError(lastError));
                return;
            }
            finishErr(new ApiError({
                message: 'agent stream closed before the turn completed (no agent_done/quit) — the reply may be truncated',
                status: 0,
                request: { method: 'POST', url, headers: {} },
                response: null,
            }));
        }
        catch (err) {
            // A caller-/cancel-initiated abort is a clean stop, not an error.
            const aborted = cancelled || ac.signal.aborted || err?.name === 'AbortError';
            if (aborted) {
                finishOk('cancelled', null);
                return;
            }
            rejectDone(err);
            end(eventsQ, err);
            end(textQ, err);
        }
        finally {
            if (args.signal)
                args.signal.removeEventListener('abort', onAbort);
            // Tear down the underlying HTTP body once the turn is over. parseSseStream
            // only releaseLock()s on exit — it does NOT cancel the body — and the
            // daemon keeps the SSE response open past agent_done (until the session/
            // request context closes). Without this, every completed turn would leak
            // an open connection until GC. Aborting after resolve/reject is harmless
            // (the read has already finished); a no-op if cancel() already aborted.
            try {
                ac.abort();
            }
            catch { /* ignore */ }
        }
    })();
    const cancel = async () => {
        cancelled = true;
        // POST the cancel on the same kit URL + claim headers (parity with the
        // prompt POST — reuse the minted claim rather than re-resolving auth).
        try {
            const cancelUrl = `${base}/api/v1/agent/sessions/${encodeURIComponent(sessionId)}/cancel`;
            await fetch(cancelUrl, {
                method: 'POST',
                headers: { 'X-Hoody-Container-Claim': auth.claim, 'X-Hoody-Token': auth.token },
            });
        }
        catch { /* best-effort */ }
        ac.abort();
    };
    return { events: iter(eventsQ), text: iter(textQ), done, cancel };
}
