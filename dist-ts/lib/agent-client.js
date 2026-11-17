import { parseSseStream } from './sse-stream.js';
import { ApiError, RetiredOptionError } from '../generated/errors.js';
import { isProxyAuthPolicy } from './proxy-auth.js';
/**
 * Encode a single URL path segment, REFUSING a relative one.
 *
 * `encodeURIComponent` alone is not sufficient here. It escapes `/`, which stops
 * a multi-segment walk — but dots are unreserved, so `encodeURIComponent('..')`
 * is `'..'` and the value survives intact. Measured against the URL this module
 * builds:
 *
 *     sessionId 'abc'    -> /api/v1/agent/sessions/abc/prompt:stream
 *     sessionId '..'     -> /api/v1/agent/prompt:stream      <- session segment GONE
 *     sessionId '../..'  -> contained (the '/' is escaped)
 *
 * So only the single-segment form escapes, and it drops the session out of the
 * path entirely. Same defect the SDK's whole-value path branch and the CLI's
 * `encodeWholePathParam` already reject; this module cannot import either (it is
 * lib/, they are cli/ and generator-emitted), so the rule is inlined.
 *
 * Checked after percent-decoding, since `%2e%2e` normalises identically.
 */
function encodeSegment(value, label) {
    let decoded = value;
    try {
        decoded = decodeURIComponent(value);
    }
    catch {
        // Malformed escape cannot decode to a dot segment.
    }
    if (value === '.' || value === '..' || decoded === '.' || decoded === '..') {
        throw new Error(`Invalid ${label}: "${value}" is a relative path segment. ` +
            'Relative segments are not allowed because they change which endpoint is called.');
    }
    return encodeURIComponent(value);
}
/** Events that end the session, and every turn on it. A turn itself ends at
 *  its own `agent_done` (see streamAgentPrompt). `stream_done` is NOT terminal —
 *  it only marks end-of-text; tool calls (and the real `agent_done`) follow it. */
const SESSION_END_EVENTS = new Set(['event.quit', 'quit', 'event.session_closed', 'session_closed']);
/** Assistant text-delta event. */
const TEXT_EVENTS = new Set(['event.stream_chunk', 'stream_chunk']);
/** The turn an agent_done or turn_discarded frame closes: its data's `turn_id`, else the envelope's. */
function closedTurn(envelope, inner) {
    const d = inner?.data && typeof inner.data === 'object' ? inner.data : {};
    if (typeof d.turn_id === 'string' && d.turn_id !== '')
        return d.turn_id;
    return envelope && typeof envelope.turn_id === 'string' && envelope.turn_id !== '' ? envelope.turn_id : null;
}
/** Resolve the per-call credential: a policy picks `services.agent`, then
 *  `default`. A legacy `{ claim, token }` object (the old option shape) is read
 *  as an explicit `computerClaim` credential — it was supplied by the caller. */
function resolvePromptAuth(auth) {
    if (!auth)
        return undefined;
    const legacy = auth;
    if (legacy.type === undefined && typeof legacy.claim === 'string' && typeof legacy.token === 'string') {
        return { type: 'computerClaim', claim: legacy.claim, token: legacy.token };
    }
    if (isProxyAuthPolicy(auth))
        return auth.services?.agent ?? auth.default;
    return auth;
}
/**
 * How long an abort of `streamAgentPrompt`'s `signal`, or a `cancel()`, that comes
 * before the agent named the turn waits for its id before it gives up without a cancel.
 */
export const AGENT_ABORT_TURN_ID_WAIT_MS = 10_000;
function abortError(signal) {
    const reason = signal.reason;
    if (reason instanceof Error && reason.name === 'AbortError')
        return reason;
    const err = new Error('streamAgentPrompt: aborted before the turn was sent');
    err.name = 'AbortError';
    return err;
}
/**
 * Dispatch a streaming prompt turn against an existing agent session and return
 * a handle over the SSE event stream. Create the session first via
 * `client.api`-scoped `box.agent.sessions.create(...)`.
 */
export async function streamAgentPrompt(client, args) {
    const { computer, sessionId, text } = args;
    if (!sessionId)
        throw new Error('streamAgentPrompt: sessionId is required');
    if (!computer?.id)
        throw new Error('streamAgentPrompt: computer.id is required');
    // The gate policy is `gatePolicy` (the generated methods' key); an old `policy` would be dropped
    // without a word and the turn would pause on its gates instead.
    if (args.policy !== undefined) {
        throw new RetiredOptionError('streamAgentPrompt', 'policy', 'gatePolicy');
    }
    const auth = resolvePromptAuth(args.auth);
    // An explicit per-call credential gets a derived client whose kitAuth it is
    // (withComputer is local: no request for a computer object). Without one,
    // the caller's client and ITS kitAuth are used as-is. The namespace lets a
    // kitAuth policy select its `agent` entry.
    const scoped = auth ? await client.withComputer(computer, { kitAuth: auth }) : client;
    const middlewareContext = { _kitNamespace: 'agent' };
    const base = scoped.getKitUrl('agent', computer, args.serviceIndex ?? 1);
    // The gate policy travels as the X-Hoody-Gate-Policy header only (below), never as the `?policy=` query.
    const url = `${base}/api/v1/agent/sessions/${encodeSegment(sessionId, 'sessionId')}/prompt:stream`;
    // A signal already aborted: nothing has been sent, so nothing runs.
    if (args.signal?.aborted)
        throw abortError(args.signal);
    // The fetch has its own abort, never the caller's signal: aborting the request
    // before the agent answered would leave a dispatched turn running with no id to
    // cancel it by. The caller's abort becomes the turn-scoped cancel (stopTurn), once
    // the turn id is known. `stopping` tells the read loop that stopTurn settles `done`.
    let stopping = false;
    // What the read loop would have done when the stream ended during the cancel had no
    // stop been under way: run when the agent answers that the cancel stopped nothing (stopTurn).
    // Declared before the read loop, which sets it.
    let unstoppedEnd = null;
    const ac = new AbortController();
    let abortRequested = false;
    let abortTimer;
    // Set once the handle exists: what an abort does then (stop the named turn, or wait for its id).
    let onAbortRequested = null;
    // Called when the turn id did not come in time; before the response it aborts the request.
    let onTurnIdTimeout = () => ac.abort();
    const onAbort = () => {
        if (abortRequested)
            return;
        abortRequested = true;
        abortTimer = setTimeout(() => onTurnIdTimeout(), AGENT_ABORT_TURN_ID_WAIT_MS);
        onAbortRequested?.();
    };
    const releaseSignal = () => {
        if (args.signal)
            args.signal.removeEventListener('abort', onAbort);
        if (abortTimer !== undefined)
            clearTimeout(abortTimer);
    };
    if (args.signal)
        args.signal.addEventListener('abort', onAbort, { once: true });
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
    };
    if (args.gatePolicy)
        headers['X-Hoody-Gate-Policy'] = String(args.gatePolicy);
    const body = { text };
    if (args.toolMode)
        body.tool_mode = args.toolMode;
    if (args.dirScope)
        body.dir_scope = args.dirScope;
    // The client's streaming seam: injected transport, request middleware
    // (kitAuth), Authorization stripped on the kit URL, non-2xx → ApiError.
    let res;
    try {
        res = await scoped.http.stream('POST', url, {
            headers,
            body,
            signal: ac.signal,
            middlewareContext,
        });
    }
    catch (err) {
        releaseSignal();
        if (abortRequested && ac.signal.aborted) {
            throw new Error(`streamAgentPrompt: aborted, and the agent did not answer the prompt within ${AGENT_ABORT_TURN_ID_WAIT_MS / 1000} s, ` +
                'so no cancel was sent: the turn may still be running (list the session\'s turns to check)', { cause: err });
        }
        throw err;
    }
    if (!res.body) {
        releaseSignal();
        throw new ApiError({
            message: `agent prompt:stream failed (${res.status}): empty response body`,
            status: res.status,
            request: { method: 'POST', url, headers: {} },
            response: null,
        });
    }
    const mkQ = () => ({ items: [], waiters: [], ended: false, consumed: false });
    const push = (q, v) => {
        const w = q.waiters.shift();
        if (w) {
            w.resolve({ value: v, done: false });
            return;
        }
        if (q.consumed)
            q.items.push(v); // drop if nobody is (or has begun) iterating
    };
    // A read already waiting when the turn fails gets the failure, like every read after it:
    // ending it as `done` would let a `for await` loop finish normally with partial output.
    const end = (q, err) => {
        q.ended = true;
        q.err = err;
        let w;
        while ((w = q.waiters.shift())) {
            if (err)
                w.reject(err);
            else
                w.resolve({ value: undefined, done: true });
        }
    };
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
                    return new Promise((resolve, reject) => q.waiters.push({ resolve, reject }));
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
    // cancel() resolves once the stop is over: its cancel answered or failed, the wait for the
    // turn id given up, or the turn ended first.
    let stopOver;
    const stopSettled = new Promise((resolve) => { stopOver = resolve; });
    done.then(() => stopOver(), () => stopOver());
    // The turn this request dispatched. The header names it; a browser the gateway
    // did not expose the header to learns it from the replay_boundary frame.
    // Without the header, the frames before that boundary are the replay, which can
    // hold another turn's agent_done (this dispatch queued behind it): the turns the
    // replay closes wait in closedInReplay, and the boundary settles ours if it is
    // there. While neither has named it, the first agent_done after the replay ends the turn.
    // A body that closes before any boundary arrived named no turn: its first agent_done
    // (firstDoneInReplay) ends the turn then.
    let turnId = res.headers?.get('x-hoody-turn-id') || null;
    let inReplay = turnId === null;
    const closedInReplay = new Map();
    let firstDoneInReplay = null;
    // Control frames the gateway emits that are NOT turn events: `replay_boundary`
    // carries the watched turn's id (read, then skipped); `end` closes the stream cleanly; `lagged` means
    // the gateway DROPPED this slow subscriber — the turn continues server-side, so
    // surfacing it as an error makes the truncation observable instead of a silent
    // partial `text`. NOTE: `retry` is deliberately NOT skipped — `event.retry`
    // ("LLM call retried") is a real turn event a caller may want to observe; the
    // SSE `retry:` reconnect *directive* never reaches here as a frame (it carries
    // no `data:` line), so skipping `retry` would only swallow the real event.
    const SKIP_CONTROL = new Set(['replay_boundary', 'event.replay_boundary']);
    // The first settle wins: a cancel answered after the turn ended changes nothing.
    let settledDone = false;
    const finishOk = (terminal, data, text = acc) => {
        if (settledDone)
            return;
        settledDone = true;
        resolveDone({ terminal, text, data });
        end(eventsQ);
        end(textQ);
    };
    const errToApiError = (payload) => {
        const msg = (payload && typeof payload === 'object' && payload.message) || 'agent stream error';
        return new ApiError({ message: String(msg), status: 0, request: { method: 'POST', url, headers: {} }, response: payload });
    };
    const finishErr = (err) => {
        if (settledDone)
            return;
        settledDone = true;
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
                if (SKIP_CONTROL.has(type) || SKIP_CONTROL.has(bare)) {
                    if (inReplay) {
                        inReplay = false;
                        const named = inner?.data && typeof inner.data === 'object' ? inner.data.turn_id : undefined;
                        if (typeof named === 'string' && named !== '') {
                            turnId = named;
                            const settle = closedInReplay.get(named);
                            if (settle) {
                                settle();
                                return;
                            }
                            // An abort that waited for the id: stop the turn it names now.
                            if (abortRequested)
                                void stopTurn(named);
                        }
                    }
                    continue;
                }
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
                const promptEvent = { type, data: inner?.data ?? null, seq };
                if (envelope && typeof envelope.incarnation === 'string')
                    promptEvent.incarnation = envelope.incarnation;
                if (envelope && envelope.gate && typeof envelope.gate === 'object')
                    promptEvent.gate = envelope.gate;
                push(eventsQ, promptEvent);
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
                else if (bare === 'agent_done') {
                    const named = closedTurn(envelope, inner);
                    const data = inner?.data ?? null;
                    if (inReplay) {
                        // A turn the replay closed: settled at the boundary if it is ours.
                        const err = lastError;
                        const text = acc;
                        const settle = () => (err !== null ? finishErr(errToApiError(err)) : finishOk(type, data, text));
                        if (named !== null && !closedInReplay.has(named))
                            closedInReplay.set(named, settle);
                        if (firstDoneInReplay === null)
                            firstDoneInReplay = settle;
                        lastError = null;
                        continue;
                    }
                    if (turnId !== null && named !== turnId) {
                        // Another turn on the same session ended: not ours. Any error notice
                        // seen since is that turn's, whatever turn_id the gateway stamped on
                        // it (a queued dispatch's id goes on the running turn's errors), as
                        // the gateway clears its own error slate at a foreign terminator.
                        lastError = null;
                        continue;
                    }
                    // agent_done preceded by an error = a failed turn (daemon status:error).
                    if (lastError !== null) {
                        finishErr(errToApiError(lastError));
                        return;
                    }
                    finishOk(type, data);
                    return;
                }
                else if (bare === 'turn_discarded') {
                    // The dispatch was dropped unrun (queued behind a turn waiting on a
                    // gate): it gets no agent_done. Ours ends the turn, cancelled.
                    const named = closedTurn(envelope, inner);
                    const data = inner?.data ?? null;
                    if (inReplay) {
                        const text = acc;
                        if (named !== null && !closedInReplay.has(named))
                            closedInReplay.set(named, () => finishOk(type, data, text));
                        continue;
                    }
                    if (turnId !== null && named === turnId) {
                        finishOk(type, data);
                        return;
                    }
                }
                else if (SESSION_END_EVENTS.has(type)) {
                    // quit and session_closed end the session: clean terminals, never an error.
                    finishOk(type, inner?.data ?? null);
                    return;
                }
            }
            if (inReplay && firstDoneInReplay !== null) {
                firstDoneInReplay();
                return;
            }
            // Stream closed without an explicit terminal event (agent_done/quit/end) =
            // a dropped/truncated turn — surface it rather than resolving as success
            // with a partial `text`. Prefer a recorded error notice if present.
            const truncated = () => {
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
            };
            // A stop is under way: the stream closing after its cancel is no truncation,
            // unless the agent answers that the cancel stopped nothing (stopTurn runs it then).
            if (stopping) {
                unstoppedEnd = truncated;
                return;
            }
            truncated();
        }
        catch (err) {
            // stopTurn aborted the stream: it settles `done` from the cancel's answer.
            if (stopping) {
                unstoppedEnd = () => finishErr(err);
                return;
            }
            // Every stop of ours sets `stopping` first: any other abort of the stream is a
            // dropped stream, not a cancelled turn.
            finishErr(err);
        }
        finally {
            if (!stopping)
                releaseSignal();
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
    // One stop at a time: cancel() and the signal share it, so the turn gets one cancel.
    // It takes the turn's id: a cancel without one would stop whatever turn runs on the session.
    let stopRun = null;
    function stopTurn(named) {
        if (stopRun)
            return stopRun;
        stopping = true;
        stopRun = (async () => {
            // POST the cancel on the same kit URL, through the same transport and
            // with the same credential selection the prompt used.
            let failure = null;
            let stopped = true;
            try {
                const cancelUrl = `${base}/api/v1/agent/sessions/${encodeSegment(sessionId, 'sessionId')}/cancel`;
                // The turn-scoped cancel: it stops this turn if it is running and nothing
                // else, so a cancel that arrives after the turn ended cannot stop a newer one.
                const answer = await scoped.http.request('POST', cancelUrl, {
                    middlewareContext,
                    retries: 0,
                    cache: false,
                    body: { turn_id: named },
                    headers: { 'Content-Type': 'application/json' },
                });
                // `matched: false`: the agent ran no such turn (it had ended), so nothing was
                // stopped. An answer without the field counts as stopped.
                stopped = answer?.data?.matched !== false;
            }
            catch (err) {
                failure = err;
            }
            releaseSignal();
            if (failure === null && !stopped) {
                // The turn's own end settles `done`: the stream goes on, or, when it ended
                // during the cancel, `done` settles as it would have without a stop.
                stopping = false;
                const end = unstoppedEnd;
                unstoppedEnd = null;
                end?.();
                stopOver();
                return;
            }
            ac.abort();
            // A turn that ended meanwhile has settled `done` already; these do nothing then.
            if (failure === null)
                finishOk('cancelled', null);
            else {
                finishErr(new Error(`agent turn cancel failed (${failure?.message ?? String(failure)}): the turn may still be running`, { cause: failure }));
            }
            stopOver();
        })();
        return stopRun;
    }
    // cancel() is the signal's stop, called by hand: it never goes out without the turn id.
    const cancel = async () => {
        // The stream is over and named no turn: nothing can name it any more, so nothing is sent.
        if (settledDone && turnId === null)
            return;
        onAbort();
        // Sent now or earlier: wait for its answer; else wait for the id (or its wait to give up).
        await (stopRun ?? stopSettled);
    };
    // The caller's signal: stop the turn once its id is known, never a cancel without one.
    onAbortRequested = () => { if (turnId !== null)
        void stopTurn(turnId); };
    onTurnIdTimeout = () => {
        if (turnId !== null || stopping)
            return;
        stopping = true;
        releaseSignal();
        ac.abort();
        finishErr(new Error(`streamAgentPrompt: aborted, and the stream named no turn within ${AGENT_ABORT_TURN_ID_WAIT_MS / 1000} s, ` +
            'so no cancel was sent: the turn may still be running (list the session\'s turns to check)'));
        stopOver();
    };
    if (abortRequested)
        onAbortRequested();
    return { events: iter(eventsQ), text: iter(textQ), done, cancel };
}
