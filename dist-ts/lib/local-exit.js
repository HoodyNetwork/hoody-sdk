/**
 * Local exit proxy: publish a container's HTTPS proxy, exit from this machine.
 *
 * Chain, outermost first:
 *
 *   client ──HTTPS proxy──> <container>-egress.<server>.containers.hoody.com
 *          └─ hoody-egress, upstream = socks5h://127.0.0.1:<port>
 *                └─ hoody-tunnel PULL bind on container loopback
 *                      └─ WebSocket to this process
 *                            └─ SOCKS5 terminated here, destination dialled locally
 *
 * Nothing listens on this machine. The only local sockets are outbound: one
 * WebSocket to the kit, and one TCP connection per proxied request.
 *
 * The container URL is the credential, per Hoody's capability-URL model. Anyone
 * holding it can relay through this machine, so treat it like a password and set
 * proxy permissions when it is going somewhere untrusted.
 */
import { randomBytes } from 'node:crypto';
import { tunnelSocks5 } from './tunnel-socks5.js';
import { deriveSiblingDomain } from './domain-utils.js';
/**
 * Thrown when startup fails AND the container was left with this run's upstream
 * still set.
 *
 * The unwind deliberately does not drop the tunnel in that state: closing it
 * would guarantee the dead-port condition the ordering exists to avoid. But
 * throwing a bare Error then stranded the tunnel — no handle was ever returned,
 * so an SDK caller that stays alive had a live WebSocket it could not reach.
 * ("The tunnel dies with the process" is true of the CLI and false of the SDK.)
 * This carries the escape hatch with the failure.
 */
export class LocalExitStartupError extends Error {
    /** Always false: this error exists precisely for the not-cleared case. */
    upstreamCleared = false;
    /** The loopback port the container is still pointing at. */
    containerPort;
    /**
     * Close the tunnel this failed start left open. Idempotent, and never throws.
     *
     * Doing so leaves the container pointing at a port that no longer answers, so
     * clear the upstream first if you can.
     */
    closeTunnel;
    constructor(message, opts) {
        super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
        this.name = 'LocalExitStartupError';
        this.containerPort = opts.containerPort;
        this.closeTunnel = opts.closeTunnel;
    }
}
const IP_SERVICE = 'https://ip.hoody.com';
/**
 * Deadline for the calls that unwire the container.
 *
 * Teardown runs from a Ctrl+C handler. Without a deadline a stalled request
 * hangs the handler, and because the handler is also what suppresses the
 * process's default exit, the command becomes unkillable short of SIGKILL —
 * which is the one way to guarantee the container is left dirty.
 */
const TEARDOWN_TIMEOUT_MS = 15_000;
function projectIdOf(c) {
    const id = c.project_id ?? c.projectId;
    if (!id)
        throw new Error('local exit: container is missing project_id');
    return id;
}
function serverNameOf(c) {
    const s = typeof c.server === 'string' ? c.server : c.server?.name ?? c.server_name;
    if (!s)
        throw new Error('local exit: container is missing server name');
    return s;
}
/**
 * Find the API base URL a client is configured with.
 *
 * HoodyClient keeps it on the inner HttpClient, not on itself, so reading
 * `client.config.baseURL` finds nothing. This used to fall back to
 * `https://api.hoody.com`, which turned a realm mismatch into a hostname that
 * does not resolve: an account on `.icu` got a tunnel URL under
 * `containers.hoody.com` and the only symptom was "WebSocket error".
 *
 * A wrong realm is not a recoverable default, so this throws instead. Every
 * URL in the chain is derived from this one value.
 */
function resolveClientBaseUrl(client) {
    const candidate = client?.http?.config?.baseURL ??
        client?.config?.baseURL ??
        client?.baseURL;
    if (typeof candidate !== 'string' || candidate.length === 0) {
        throw new Error('local exit: cannot determine the API base URL from the client. ' +
            'Construct it with `new HoodyClient({ baseURL })`.');
    }
    // A non-empty string is not enough. deriveSiblingDomain is deliberately
    // lenient for its other callers and answers `containers.hoody.com` for the
    // three inputs it cannot derive from: an unparseable URL, an empty hostname,
    // and localhost / an IP literal. Reaching that default HERE would reinstate
    // exactly the failure this function exists to prevent, and silently: a client
    // pointed at http://localhost:3000 would mint production `.hoody.com`
    // container URLs. Refuse those three at the boundary instead.
    let host;
    try {
        host = new URL(candidate).hostname;
    }
    catch {
        throw new Error(`local exit: the client's baseURL is not a valid URL (${candidate}). ` +
            'Every container URL is derived from it, so it cannot be guessed.');
    }
    // `localhost.` (trailing root dot) and `foo.localhost` resolve to loopback
    // just as `localhost` does, and an exact-match check let them through to
    // derive `containers.localhost.` / `containers.foo.localhost`.
    const loopbackName = host === 'localhost' || host === 'localhost.' || /(^|\.)localhost\.?$/i.test(host);
    if (!host || loopbackName || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) {
        throw new Error(`local exit: no container realm can be derived from baseURL host "${host}". ` +
            'Point the client at the API hostname for your realm (for example ' +
            'https://api.hoody.com) rather than a loopback or literal address.');
    }
    return candidate;
}
/**
 * The shape a local exit's own upstream has on the wire. Both the installer and
 * the two teardown paths read these, so they live in one place: a drift between
 * "what we write" and "what we recognise as ours" is silent, and its
 * consequence is deleting somebody else's proxy.
 */
const LOCAL_EXIT_SCHEME = 'socks5h';
const LOCAL_EXIT_HOST = '127.0.0.1';
/**
 * Does the upstream now on the container belong to somebody other than this
 * handle?
 *
 * Teardown deletes the upstream, and the kit never returns credentials, so a
 * wrong answer here is unrecoverable in one direction: clearing a third party's
 * proxy destroys a configuration nobody can restore. The check used to compare
 * the PORT alone, which is the one field a replacement can share by accident —
 * a hand-set `socks5h://user:pass@203.0.113.10:<same-port>` read as ours and
 * was deleted. Compare every field the wire exposes instead.
 *
 * A field the kit does not send cannot contradict us, so absence is not treated
 * as evidence either way; that keeps this from declaring every upstream foreign
 * (and so leaving dead ports set on every container) if the payload ever loses
 * a field.
 *
 * This narrows the window; it does not close it. Two gaps remain, both needing
 * a kit change rather than an SDK one:
 *
 *   - The read and the delete are two calls, so an exit that takes the
 *     container over in between is still clobbered.
 *   - A replacement that matches on ALL FOUR visible fields is indistinguishable
 *     from ours, because the kit reports `auth` as a bare boolean and never any
 *     credential identity.
 *
 * The second one is narrower than it sounds, and worth stating precisely: two
 * LIVE exits cannot collide on a loopback port at all. The tunnel does a real
 * `TcpListener::bind`, and an occupied port fails with PORT_IN_USE rather than
 * being shared (hoody-tunnel/src/bind/pull.rs:44-55). It takes a stale handle:
 * this exit's listener must already be gone, the port must have been reused by
 * a new exit, and only then does a late teardown on the old handle see an
 * identical status object. `upstreamConfirmedGone` removes that specific
 * sequence; what remains needs an atomic compare-and-delete in the kit, keyed
 * on anything that survives the round trip (an owner token, a credential hash,
 * an ETag) — the SDK cannot supply it, since every discriminator it writes is
 * collapsed to `auth: true` on the way back.
 */
function upstreamIsForeign(owned, containerPort) {
    if (owned?.enabled !== true)
        return false;
    if (owned.port !== containerPort)
        return true;
    if (typeof owned.scheme === 'string' && owned.scheme !== LOCAL_EXIT_SCHEME)
        return true;
    if (typeof owned.host === 'string' && owned.host !== LOCAL_EXIT_HOST)
        return true;
    // Every local exit authenticates its loopback listener, so an unauthenticated
    // upstream on our port was configured by someone else.
    if (typeof owned.auth === 'boolean' && owned.auth !== true)
        return true;
    return false;
}
/**
 * Take the payload out of an SDK envelope.
 *
 * Kit methods return `{statusCode, message, data}`; the kit itself returns the
 * bare object. Accepting both means a change on either side cannot turn a
 * successful read into `undefined`, which here would read as "upstream not set".
 */
function unwrap(res) {
    return (res && typeof res === 'object' && 'data' in res ? res.data : res);
}
/**
 * `api.hoody.com` -> `containers.hoody.com`.
 *
 * This used to be a private re-implementation that "mirrored" lib/domain-utils.
 * It had drifted: the canonical function derives `containers.<host>` for a host
 * it does not recognise, while the copy returned `containers.hoody.com` — so an
 * account on any non-`api.` hostname was handed a production URL for a realm it
 * has nothing to do with. Call the real one; `resolveClientBaseUrl` has already
 * rejected the inputs whose only answer would be a guessed realm.
 */
function containersDomain(baseUrl) {
    return deriveSiblingDomain(baseUrl, 'containers');
}
/** Query ip.hoody.com, optionally through the proxy, and normalize the payload. */
async function readIpService(dispatcherUrl) {
    // Bounded. Without a deadline this call is the one unbounded await in startup:
    // a stalled connection leaves the container relaying publicly while the caller
    // still has no handle to stop it with.
    const init = {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
    };
    // Node's fetch honours a proxy only via --use-env-proxy / NODE_USE_ENV_PROXY,
    // which is process-wide. For a targeted probe we call the service directly and
    // let the CALLER route it, so this helper stays side-effect free.
    if (dispatcherUrl) {
        throw new Error('readIpService: per-request proxying is handled by the caller');
    }
    const res = await fetch(IP_SERVICE, init);
    if (!res.ok)
        throw new Error(`ip.hoody.com returned ${res.status}`);
    const body = await res.json();
    const data = body?.data ?? body;
    const ip = data?.ip;
    if (typeof ip !== 'string' || ip.length === 0) {
        throw new Error('ip.hoody.com response had no data.ip');
    }
    return { ip, country: data?.ip_info?.country, asn: data?.ip_info?.asn?.name };
}
/**
 * Bring up the local exit.
 *
 * Ordering is deliberate: the tunnel is bound and serving BEFORE the upstream is
 * pointed at it, so hoody-egress is never configured to dial a port that does not
 * answer. Teardown reverses it.
 */
export async function startLocalExit(opts) {
    const { client, container } = opts;
    const projectId = projectIdOf(container);
    const server = serverNameOf(container);
    const baseUrl = resolveClientBaseUrl(client);
    const domain = containersDomain(baseUrl);
    const tunnelWs = `wss://${projectId}-${container.id}-tunnel-1.${server}.${domain}/api/v1/tunnel/connect`;
    // Unsuffixed, matching `getKitUrl('egress', …)`, the CLI's getKitBaseUrl and
    // the docs. The edge normalizes a missing index to 1, so this IS index 1 —
    // including for proxy permissions, which are evaluated per index. Emitting
    // `-egress-1` here instead would route identically but break the four-layer
    // parity that tests/unit/egress-url-parity.test.ts exists to hold, after a
    // rename once already split the SDK from the CLI and docs.
    const egressBase = `https://${projectId}-${container.id}-egress.${server}.${domain}`;
    const token = await client.getAuthToken();
    if (!token)
        throw new Error('local exit: client is not authenticated');
    // Container-local SOCKS5 credentials. The loopback port is reachable by every
    // process in the container, so it is never anonymous.
    const auth = {
        username: `hoody-${randomBytes(6).toString('hex')}`,
        password: randomBytes(24).toString('base64url'),
    };
    const errors = [];
    let tunnel;
    // Container-scoped client: every egress call below goes through the generated
    // kit methods, so URL templating and auth stay in one place.
    const box = await client.withContainer(container);
    // Refuse to clobber an upstream somebody else configured. Teardown DELETES the
    // upstream, and the kit never returns credentials, so a third-party proxy
    // replaced here could not be restored afterwards — the user would simply lose
    // it. A stale entry from a killed run is the common case, so the message says
    // how to clear one.
    const existing = unwrap(await box.egress.getUpstream());
    if (existing?.enabled === true && opts.replaceExistingUpstream !== true) {
        const where = `${existing.scheme ?? '?'}://${existing.host ?? '?'}:${existing.port ?? '?'}`;
        throw new Error(`local exit: this container already has an upstream (${where}). ` +
            `Stopping this exit would clear it, and its credentials cannot be read back to restore it. ` +
            `Clear it first, or pass replaceExistingUpstream/--replace-upstream to take it over.`);
    }
    /**
     * True once this run has tried to install its own upstream.
     *
     * The unwind below used to clear unconditionally. With
     * `replaceExistingUpstream` the container may already have had a working
     * third-party upstream, so a failure BEFORE `setUpstream` — a tunnel that
     * would not bind, say — made the unwind delete a configuration this run never
     * replaced and cannot restore, because the kit never returns credentials.
     */
    let upstreamAttempted = false;
    let aliasId;
    let aliasUrl;
    try {
        // 1. Tunnel first: bind and start serving before anything points at it.
        tunnel = await tunnelSocks5({
            url: tunnelWs,
            token,
            containerPort: opts.containerPort ?? 0,
            host: LOCAL_EXIT_HOST,
            auth,
            ...(opts.policy !== undefined && { policy: opts.policy }),
            ...(opts.maxConcurrent !== undefined && { maxConcurrent: opts.maxConcurrent }),
            ...(opts.connectTimeoutMs !== undefined && { connectTimeoutMs: opts.connectTimeoutMs }),
            ...(opts.idleTimeoutMs !== undefined && { idleTimeoutMs: opts.idleTimeoutMs }),
            ...(opts.onConnect !== undefined && { onConnect: opts.onConnect }),
        });
        // 2. Point egress at it. socks5h so DNS resolves on THIS machine too;
        //    with plain socks5 the container would leak destination lookups.
        const upstream = `${LOCAL_EXIT_SCHEME}://${encodeURIComponent(auth.username)}:${encodeURIComponent(auth.password)}` +
            `@${LOCAL_EXIT_HOST}:${tunnel.containerPort}`;
        // Recorded BEFORE the call, not after: a setUpstream that fails ambiguously
        // may still have committed, and the unwind has to consider it ours.
        upstreamAttempted = true;
        await box.egress.setUpstream(upstream);
        // 3. Read back. `auth: true` proves the credential survived the write; the
        //    kit never echoes the secret itself.
        const state = unwrap(await box.egress.getUpstream());
        if (state?.enabled !== true || state?.port !== tunnel.containerPort) {
            throw new Error(`egress upstream read-back mismatch: ${JSON.stringify(state)} ` +
                `(expected enabled=true port=${tunnel.containerPort})`);
        }
        if (state?.auth !== true) {
            throw new Error('egress upstream read-back reports auth=false; credentials were lost');
        }
        // 4. Optional alias so the handed-out URL carries no container id.
        if (opts.alias) {
            const name = opts.alias === true
                ? `exit-${randomBytes(4).toString('hex')}`
                : opts.alias;
            const created = await client.api.proxyAliases.create({
                container_id: container.id,
                program: 'egress',
                alias: name,
            });
            aliasId = created?.data?.id;
            aliasUrl = created?.data?.url ?? `https://${name}.${server}.${domain}`;
            if (!aliasId) {
                // Removal is by id, so without one the alias outlives this process and
                // keeps resolving to a container whose exit is gone. Surface it rather
                // than leaving an orphan nobody knows about.
                errors.push({
                    step: 'createAlias',
                    message: `alias "${name}" was created but the response carried no id, so it cannot be removed automatically; find it with \`hoody proxy list\` and remove it with \`hoody proxy delete <id>\``,
                });
            }
        }
        const proxyUrl = aliasUrl ?? egressBase;
        const verifyExit = async () => {
            const local = await readIpService();
            // Route the probe through the proxy itself by asking the container's egress
            // to fetch it: a CONNECT through proxyUrl is what a real consumer does.
            const exit = await fetchThroughProxy(proxyUrl, IP_SERVICE);
            const data = exit?.data ?? exit;
            return {
                exitIp: data?.ip,
                localIp: local.ip,
                matches: data?.ip === local.ip,
                country: data?.ip_info?.country,
                asn: data?.ip_info?.asn?.name,
            };
        };
        // A dropped WebSocket takes the bind with it, leaving the container
        // configured for a loopback port that no longer answers — every request
        // through its egress then fails, and nothing was watching for it. Unwire
        // the container as soon as the session is gone.
        /**
         * Deliver the session-lost notification without letting the listener steer us.
         *
         * The call used to sit INSIDE the ownership try/catch, so a listener that
         * threw was indistinguishable from a failed ownership read — and the catch's
         * documented response to that is "fall through and clear", which would have
         * deleted the upstream of the OTHER exit that had just taken the container
         * over. The IIFE below is also detached with `void`, so an async listener
         * that rejects would otherwise surface as an unhandled rejection.
         */
        /**
         * Set once a teardown path has CONFIRMED (by read-back) that this exit's
         * upstream is gone.
         *
         * Without it, the session-lost path could clear and verify the upstream,
         * the container's tunnel could then release the loopback port, a NEW exit
         * could bind that same port and install its own upstream — and a later
         * `stop()` on this stale handle would read a status object identical to the
         * one it wrote (same scheme, host, port, and `auth: true`, because the kit
         * never returns credentials) and delete the newcomer's.
         *
         * This is the one leg of that sequence the SDK can remove on its own: a
         * handle that already knows its own upstream is gone has nothing left to
         * clear, so it must not issue another delete no matter what it reads.
         */
        let upstreamConfirmedGone = false;
        const notifySessionLost = (info) => {
            try {
                void Promise.resolve(opts.onSessionLost?.(info)).catch(() => { });
            }
            catch { /* listener's problem */ }
        };
        tunnel.onSessionLost(() => {
            void (async () => {
                // Same ownership rule as stop(): if the upstream now points somewhere
                // else, another exit owns the container and clearing it would take down
                // a working proxy that is not ours.
                let foreign = false;
                try {
                    const owned = unwrap(await box.egress.getUpstream(undefined, { timeoutMs: TEARDOWN_TIMEOUT_MS }));
                    foreign = upstreamIsForeign(owned, tunnel.containerPort);
                }
                catch { /* fall through and clear: our dead port is the worse state */ }
                if (foreign) {
                    notifySessionLost({ upstreamCleared: false });
                    return;
                }
                let ok = false;
                for (let attempt = 0; attempt < 3 && !ok; attempt++) {
                    try {
                        const after = unwrap(await box.egress.disableUpstream(undefined, { timeoutMs: TEARDOWN_TIMEOUT_MS }));
                        ok = after?.enabled === false;
                    }
                    catch { /* reported through the callback below */ }
                }
                if (ok) {
                    // Read back, exactly as stop() does. Trusting the DELETE response
                    // alone made this path weaker than the one beside it, for no reason:
                    // the caller is told `upstreamCleared`, and that has to mean the same
                    // thing whichever path produced it.
                    try {
                        const confirmed = unwrap(await box.egress.getUpstream(undefined, { timeoutMs: TEARDOWN_TIMEOUT_MS }));
                        ok = confirmed?.enabled === false;
                        if (ok)
                            upstreamConfirmedGone = true;
                    }
                    catch {
                        ok = false;
                    }
                }
                if (!ok) {
                    errors.push({
                        step: 'sessionLost',
                        message: 'tunnel died and the upstream could not be cleared; run `hoody --container <id> egress upstream clear`',
                    });
                }
                notifySessionLost({ upstreamCleared: ok });
            })();
        });
        let verification;
        if (opts.verify !== false) {
            verification = await verifyExit();
        }
        const runStop = async () => {
            const report = {
                upstreamCleared: false, upstreamVerified: false, upstreamHandedOver: false,
                tunnelClosed: false, aliasRemoved: false, errors: [...errors],
            };
            // Nothing of ours is left to clear. Re-reading here and comparing would
            // not save us: after the port is released and reused, a new exit's status
            // object is byte-identical to what this handle wrote, so the comparison
            // says "mine" and the delete lands on the newcomer.
            if (upstreamConfirmedGone) {
                report.upstreamCleared = true;
                report.upstreamVerified = true;
                if (aliasId) {
                    try {
                        await client.api.proxyAliases.delete(aliasId, { timeoutMs: TEARDOWN_TIMEOUT_MS });
                        report.aliasRemoved = true;
                        aliasId = undefined;
                    }
                    catch (e) {
                        report.errors.push({ step: 'removeAlias', message: String(e.message) });
                    }
                }
                try {
                    await tunnel?.close();
                    report.tunnelClosed = true;
                }
                catch (e) {
                    report.errors.push({ step: 'closeTunnel', message: String(e.message) });
                }
                return report;
            }
            // Do not clear an upstream that is no longer ours.
            //
            // The upstream is one container-wide setting, so a second exit started
            // against the same container overwrites it. Clearing unconditionally then
            // means this handle's teardown silently disables the OTHER exit — and the
            // same happens when a caller deliberately took over with
            // --replace-upstream. Check that the port still matches ours first.
            try {
                const owned = unwrap(await box.egress.getUpstream(undefined, { timeoutMs: TEARDOWN_TIMEOUT_MS }));
                if (upstreamIsForeign(owned, tunnel.containerPort)) {
                    report.upstreamCleared = false;
                    // NOT `upstreamVerified = true`. The upstream is still enabled — it
                    // just is not ours. Saying "verified" here made the CLI print
                    // "Container restored (upstream cleared)." over a container that is
                    // still proxying through somebody else.
                    report.upstreamVerified = false;
                    report.upstreamHandedOver = true;
                    report.errors.push({
                        step: 'checkOwnership',
                        message: `left the upstream alone: the container now points at ` +
                            `${owned.scheme ?? '?'}://${owned.host ?? '?'}:${owned.port ?? '?'}` +
                            `${owned.auth === false ? ' (unauthenticated)' : ''}, not this exit's ` +
                            `${LOCAL_EXIT_SCHEME}://${LOCAL_EXIT_HOST}:${tunnel.containerPort}. ` +
                            'Something else took the container over.',
                    });
                    if (aliasId) {
                        try {
                            await client.api.proxyAliases.delete(aliasId, { timeoutMs: TEARDOWN_TIMEOUT_MS });
                            report.aliasRemoved = true;
                            aliasId = undefined;
                        }
                        catch (e) {
                            report.errors.push({ step: 'removeAlias', message: String(e.message) });
                        }
                    }
                    try {
                        await tunnel?.close();
                        report.tunnelClosed = true;
                    }
                    catch (e) {
                        report.errors.push({ step: 'closeTunnel', message: String(e.message) });
                    }
                    return report;
                }
            }
            catch (e) {
                // Could not establish ownership. Fall through and clear: leaving our own
                // dead port set is the worse outcome of the two.
                report.errors.push({ step: 'checkOwnership', message: String(e.message) });
            }
            // Order matters: clear the upstream BEFORE dropping the tunnel, so egress
            // is never configured to dial a port that has already gone away.
            for (let attempt = 0; attempt < 3 && !report.upstreamCleared; attempt++) {
                try {
                    const cleared = unwrap(await box.egress.disableUpstream(undefined, { timeoutMs: TEARDOWN_TIMEOUT_MS }));
                    report.upstreamCleared = cleared?.enabled === false;
                    if (!report.upstreamCleared) {
                        report.errors.push({ step: 'disableUpstream', message: JSON.stringify(cleared) });
                    }
                }
                catch (e) {
                    report.errors.push({ step: 'disableUpstream', message: String(e.message) });
                }
            }
            try {
                const after = unwrap(await box.egress.getUpstream(undefined, { timeoutMs: TEARDOWN_TIMEOUT_MS }));
                report.upstreamVerified = after?.enabled === false;
                // Latch it: a retried stop() on this handle has nothing left to clear,
                // and by then the port may belong to a different exit.
                if (report.upstreamVerified)
                    upstreamConfirmedGone = true;
                if (!report.upstreamVerified) {
                    report.errors.push({ step: 'verifyUpstream', message: `still ${JSON.stringify(after)}` });
                }
            }
            catch (e) {
                report.errors.push({ step: 'verifyUpstream', message: String(e.message) });
            }
            // Keep the tunnel up when the upstream could not be cleared.
            //
            // Closing it in that state is the worst outcome available: the container
            // stays configured for a loopback port that no longer answers, so EVERY
            // request through its egress fails until a human intervenes. Holding the
            // tunnel keeps the container working while the caller retries.
            //
            // Honest limit: this only helps a caller that stays alive. The CLI exits
            // straight after stop(), which drops the WebSocket anyway — there the
            // value is the report, which tells the user exactly what to clear. A
            // caller that does keep running must not be trapped either, so
            // `forceStop()` exists to close the tunnel regardless.
            if (report.upstreamVerified) {
                try {
                    await tunnel?.close();
                    report.tunnelClosed = true;
                }
                catch (e) {
                    report.errors.push({ step: 'closeTunnel', message: String(e.message) });
                }
            }
            else {
                report.errors.push({
                    step: 'closeTunnel',
                    message: 'skipped: the upstream is still set, so the tunnel was left open to keep the ' +
                        'container working. Clear it with `hoody --container <id> egress upstream clear`, then stop again.',
                });
            }
            if (aliasId) {
                // Bounded like every other teardown call. Without a deadline this hung
                // forceStop() before it could reach its forced close, which is exactly
                // the situation forceStop() exists to escape.
                try {
                    await client.api.proxyAliases.delete(aliasId, { timeoutMs: TEARDOWN_TIMEOUT_MS });
                    report.aliasRemoved = true;
                    aliasId = undefined;
                }
                catch (e) {
                    report.errors.push({ step: 'removeAlias', message: String(e.message) });
                }
            }
            return report;
        };
        // Teardown runs at most once. A second stop() repeated every API call: with
        // an alias, one delete succeeded and the other returned not-found, so the
        // second report contradicted the first. Concurrent callers now await the
        // same result instead of racing.
        let stopPromise;
        const stop = () => {
            // Memoized while IN FLIGHT, and kept only if it worked.
            //
            // Memoizing unconditionally meant a teardown that failed to clear the
            // upstream could never be retried: every later stop() handed back the
            // same failed report without making a single call, so the documented
            // recovery ("clear it, then stop again") could not work from the SDK.
            // A handover counts as done — there is nothing left of ours to retry.
            if (!stopPromise) {
                stopPromise = runStop().then((report) => {
                    if (!report.upstreamVerified && !report.upstreamHandedOver)
                        stopPromise = undefined;
                    return report;
                }, (err) => { stopPromise = undefined; throw err; });
            }
            return stopPromise;
        };
        const forceStop = async () => {
            const report = await stop();
            if (!report.tunnelClosed) {
                try {
                    await tunnel?.close();
                    report.tunnelClosed = true;
                    // stop() recorded that the tunnel was deliberately left open. It is
                    // not open any more, and a report that says both is worse than either.
                    const idx = report.errors.findIndex((e) => e.step === 'closeTunnel' && e.message.startsWith('skipped:'));
                    if (idx >= 0) {
                        report.errors[idx] = {
                            step: 'closeTunnel',
                            message: 'forced: the upstream could not be verified as cleared, and the tunnel was ' +
                                'closed anyway. The container may point at a dead port — run ' +
                                '`hoody --container <id> egress upstream clear`.',
                        };
                    }
                }
                catch (e) {
                    report.errors.push({ step: 'closeTunnel', message: String(e.message) });
                }
            }
            return report;
        };
        return {
            proxyUrl,
            aliasUrl,
            containerPort: tunnel.containerPort,
            verification,
            activeStreams: () => tunnel.activeStreams(),
            verifyExit,
            stop,
            forceStop,
            [Symbol.asyncDispose]: async () => { await stop(); },
        };
    }
    catch (err) {
        // Unwind in reverse. The tunnel is dropped only once the upstream is
        // confirmed gone, for the same reason as in stop(): a container left
        // pointing at a dead port is worse than a tunnel that lingers until the
        // process exits.
        if (aliasId) {
            // Bounded, like every other teardown call. An unbounded delete here hung
            // the unwind of a startup that had ALREADY failed, turning one error into
            // a command that never returns.
            await client.api.proxyAliases
                .delete(aliasId, { timeoutMs: TEARDOWN_TIMEOUT_MS })
                .catch(() => { });
        }
        // Nothing of ours is set, so there is nothing to unwind — and clearing here
        // would delete whatever was already there.
        let cleared = !upstreamAttempted;
        for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
            try {
                const after = unwrap(await box.egress.disableUpstream(undefined, { timeoutMs: TEARDOWN_TIMEOUT_MS }));
                cleared = after?.enabled === false;
            }
            catch { /* retried below, then reported on the thrown error */ }
        }
        if (cleared) {
            await tunnel?.close().catch(() => { });
            throw err;
        }
        if (tunnel) {
            // Same rule as stop(): do NOT drop the tunnel while the upstream still
            // points at its port. Closing here would guarantee the dead-port state
            // this unwind exists to avoid. The caller needs to know the container was
            // left dirty — AND needs to be able to release the tunnel, which a bare
            // Error did not give them.
            const stranded = tunnel;
            let closed = false;
            throw new LocalExitStartupError(`${err.message}. The container's egress upstream could NOT be cleared — ` +
                `run \`hoody --container <id> egress upstream clear\` against it before using its proxy again. ` +
                `The tunnel is still open; call \`error.closeTunnel()\` to release it.`, {
                cause: err,
                containerPort: stranded.containerPort,
                closeTunnel: async () => {
                    if (closed)
                        return;
                    closed = true;
                    await stranded.close().catch(() => { });
                },
            });
        }
        throw err;
    }
}
/**
 * True once a chunked body has its terminating zero-size chunk.
 *
 * Searching for the literal `\r\n0\r\n` misses the forms RFC 9112 allows —
 * `0;ext=value` and any zero written with leading digits (`00`) — so a
 * conforming response would never be recognised as finished and the read hung
 * until the timeout.
 */
export function chunkedBodyComplete(payload) {
    let offset = 0;
    while (offset < payload.length) {
        const lineEnd = payload.indexOf('\r\n', offset);
        if (lineEnd < 0)
            return false;
        const sizeText = payload.subarray(offset, lineEnd).toString('ascii').split(';')[0].trim();
        // parseInt happily accepts a valid prefix ('1x' → 1), which would declare a
        // malformed body complete. Require the whole token to be hex.
        if (!/^[0-9a-fA-F]+$/.test(sizeText))
            return false;
        const size = Number.parseInt(sizeText, 16);
        if (!Number.isFinite(size))
            return false;
        if (size === 0) {
            // The last chunk is followed by a trailer section that ends with a blank
            // line. Accepting at `0\r\n` calls a body finished while it is still
            // arriving, so scan the trailers to their terminator.
            let t = lineEnd + 2;
            for (;;) {
                const end = payload.indexOf('\r\n', t);
                if (end < 0)
                    return false; // trailers still arriving
                if (end === t)
                    return true; // blank line: body is complete
                t = end + 2;
            }
        }
        const dataEnd = lineEnd + 2 + size;
        if (payload.length < dataEnd + 2)
            return false;
        // Each chunk's data must be followed by CRLF; anything else is malformed.
        if (payload[dataEnd] !== 0x0d || payload[dataEnd + 1] !== 0x0a)
            return false;
        offset = dataEnd + 2;
    }
    return false;
}
/**
 * Reassemble a `Transfer-Encoding: chunked` body.
 *
 * Exported for tests: framing is where a hand-rolled HTTP reader goes wrong, and
 * the failure mode is a hang rather than an error.
 */
export function decodeChunked(payload) {
    let offset = 0;
    const parts = [];
    while (offset < payload.length) {
        const lineEnd = payload.indexOf('\r\n', offset);
        if (lineEnd < 0)
            break;
        // A chunk-size line may carry extensions after a ';' — ignore them.
        const sizeText = payload.subarray(offset, lineEnd).toString('ascii').split(';')[0].trim();
        // Strict, matching chunkedBodyComplete. `parseInt` takes any valid prefix,
        // so 'Expires: x' parses as 0xE and a trailer line gets consumed as a chunk
        // header — which also meant the terminator check below was doing no work,
        // because a malformed line happened to stop the loop by other means.
        if (!/^[0-9a-fA-F]+$/.test(sizeText))
            break;
        const size = Number.parseInt(sizeText, 16);
        if (!Number.isFinite(size))
            break;
        if (size === 0)
            break; // terminator, including `0;ext=…` and `00`
        const start = lineEnd + 2;
        parts.push(payload.subarray(start, start + size));
        offset = start + size + 2; // skip the chunk's trailing CRLF
    }
    return Buffer.concat(parts).toString('utf8');
}
export function readProxiedResponse(body) {
    // Skip 1xx interim responses (100-continue, 103 Early Hints). They are
    // complete header blocks with no body, so treating the first block as the
    // answer would read the wrong headers and then wait forever.
    let head = body;
    let consumed = 0;
    let statusLine = '';
    let sep = -1;
    for (;;) {
        sep = head.indexOf('\r\n\r\n');
        if (sep < 0)
            return { kind: 'pending' };
        statusLine = head.subarray(0, head.indexOf('\r\n')).toString('utf8');
        // 101 is a FINAL status, not an interim one: skipping it waits forever for a
        // header block that will never come.
        if (!/^HTTP\/1\.[01][ \t]+1\d\d(?![0-9])/.test(statusLine)
            || /^HTTP\/1\.[01][ \t]+101(?![0-9])/.test(statusLine))
            break;
        consumed += sep + 4;
        head = body.subarray(consumed);
    }
    const rawHeaders = head.subarray(0, sep).toString('utf8');
    const payload = head.subarray(sep + 4);
    // `\d{3}` alone matches the first three digits of "2000", so a four-digit
    // status read as 200 and a garbage response was accepted as success.
    const status = Number(/^HTTP\/1\.[01][ \t]+(\d{3})(?![0-9])/.exec(statusLine)?.[1] ?? 0);
    if (status === 0)
        return { kind: 'error', message: `malformed status line: "${statusLine}"` };
    // Transfer-Encoding wins over Content-Length (RFC 9112 §6.1). Reading a
    // chunked body as fixed-length starts at the chunk-size line and either fails
    // to parse or stops at the wrong byte. The token must be matched on word
    // boundaries, or a coding named `x-chunked` is read as `chunked`.
    const teValues = [...rawHeaders.matchAll(/^transfer-encoding:[ \t]*([^\r\n]*)/gim)]
        .flatMap((m) => m[1].split(',').map((v) => v.trim().toLowerCase()));
    const hasTransferEncoding = teValues.length > 0;
    const isChunked = teValues.includes('chunked');
    // Content-Length is only authoritative when there is no Transfer-Encoding at
    // all (RFC 9112 §6.3), not merely when the coding is something other than
    // chunked. The value must be the WHOLE token: `\d+` alone accepts `2junk`.
    // Two DIFFERENT Content-Length headers are a smuggling signal, not a choice
    // to make — reject rather than pick the first.
    const lengths = hasTransferEncoding
        ? []
        : [...rawHeaders.matchAll(/^content-length:[ \t]*([^\r\n]*)/gim)].map((m) => m[1].trim());
    if (new Set(lengths).size > 1) {
        return { kind: 'error', message: 'proxy response declared conflicting Content-Length values' };
    }
    const lengthToken = lengths[0];
    if (lengthToken !== undefined && !/^\d+$/.test(lengthToken)) {
        return { kind: 'error', message: `proxy response had a malformed Content-Length: "${lengthToken}"` };
    }
    let text;
    // Bodyless statuses come FIRST: RFC 9112 6.3 gives them the highest framing
    // precedence, above Transfer-Encoding and Content-Length. Evaluating them last
    // meant a perfectly valid `304 Not Modified` carrying `Content-Length: 7` —
    // which 304 is explicitly allowed to send, echoing the size the corresponding
    // 200 would have had — sat at `pending` waiting for seven body bytes that are
    // never coming, and was then reported as truncated at EOF.
    if (status === 204 || status === 304 || status === 101) {
        // Bodyless (RFC 9110). They carry no framing header, so without this they
        // satisfy no rule here and the read hangs to the timeout on a response that
        // was complete on arrival. 101 belongs with them: it is a FINAL status whose
        // connection becomes a different protocol, so there is no body to wait for.
        // Merely declining to skip it as interim was not enough — it then fell
        // through to the close-delimited branch and hung exactly as before.
        text = '';
    }
    else if (isChunked) {
        if (!chunkedBodyComplete(payload))
            return { kind: 'pending' };
        text = decodeChunked(payload);
    }
    else if (lengthToken !== undefined) {
        const want = Number(lengthToken);
        if (payload.length < want)
            return { kind: 'pending' };
        text = payload.subarray(0, want).toString('utf8');
    }
    else {
        // Neither framing header: the only remaining signal is EOF.
        return { kind: 'pending' };
    }
    return { kind: 'complete', status, text };
}
/**
 * Issue a request through an HTTPS proxy using only Node builtins.
 *
 * `fetch` cannot be pointed at a proxy per-call without a dispatcher, and a
 * dispatcher means a dependency. So this speaks CONNECT directly over TLS: one
 * TLS session to the proxy, `CONNECT host:443`, then a second TLS session inside
 * it to the origin. That is exactly what a browser does, and it keeps the SDK
 * dependency-free.
 */
export async function fetchThroughProxy(proxyUrl, targetUrl) {
    const tls = await import('node:tls');
    const proxy = new URL(proxyUrl);
    const target = new URL(targetUrl);
    const proxyPort = proxy.port ? Number(proxy.port) : 443;
    const targetPort = target.port ? Number(target.port) : 443;
    return new Promise((resolve, reject) => {
        // A hostile or broken peer must not be able to grow these without bound:
        // both are accumulated with repeated Buffer.concat, so unbounded input is
        // quadratic copying as well as unbounded memory, for up to the full timeout.
        const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
        let settled = false;
        const settle = (fn) => {
            // Reachable twice: a JSON parse failure settles, then throws inside its own
            // callback, and the catch settles again. Promise resolution is one-shot, so
            // the visible result was already correct, but the cleanup ran twice.
            if (settled)
                return;
            settled = true;
            cleanup();
            fn();
        };
        let outer;
        let inner;
        const timer = setTimeout(() => settle(() => reject(new Error('proxy request timed out'))), 30_000);
        const cleanup = () => {
            clearTimeout(timer);
            try {
                inner?.destroy();
            }
            catch { /* gone */ }
            try {
                outer?.destroy();
            }
            catch { /* gone */ }
        };
        outer = tls.connect({ host: proxy.hostname, port: proxyPort, servername: proxy.hostname }, () => {
            outer.write(`CONNECT ${target.hostname}:${targetPort} HTTP/1.1\r\n` +
                `Host: ${target.hostname}:${targetPort}\r\n\r\n`);
        });
        outer.on('error', (e) => settle(() => reject(e)));
        let head = Buffer.alloc(0);
        const onConnectReply = (chunk) => {
            head = Buffer.concat([head, chunk]);
            if (head.length > MAX_RESPONSE_BYTES) {
                settle(() => reject(new Error('proxy sent an oversized CONNECT response')));
                return;
            }
            const end = head.indexOf('\r\n\r\n');
            if (end < 0)
                return;
            const status = head.subarray(0, head.indexOf('\r\n')).toString('utf8');
            if (!/^HTTP\/1\.[01][ \t]+200(?![0-9])/.test(status)) {
                settle(() => reject(new Error(`proxy CONNECT refused: ${status}`)));
                return;
            }
            outer.off('data', onConnectReply);
            inner = tls.connect({ socket: outer, servername: target.hostname }, () => {
                // Preserve the query, and put a non-default port in Host. Dropping
                // either silently requests a different resource than the caller named.
                const requestTarget = `${target.pathname || '/'}${target.search || ''}`;
                const hostHeader = target.port ? `${target.hostname}:${target.port}` : target.hostname;
                inner.write(`GET ${requestTarget} HTTP/1.1\r\n` +
                    `Host: ${hostHeader}\r\naccept: application/json\r\nconnection: close\r\n\r\n`);
            });
            inner.on('error', (e) => settle(() => reject(e)));
            // Complete on the response's own framing, not on EOF.
            //
            // `connection: close` is a request, not a guarantee: measured against the
            // live edge, the full 1.8 KB response arrived in ~400ms and the socket
            // then stayed open, so waiting for 'end' hung until the 30s timeout while
            // the same request through curl finished in under a second. Content-Length
            // and the chunked terminator both tell us when the body is done.
            let body = Buffer.alloc(0);
            const tryComplete = () => {
                const res = readProxiedResponse(body);
                if (res.kind === 'pending')
                    return false;
                if (res.kind === 'error') {
                    settle(() => reject(new Error(res.message)));
                    return true;
                }
                // A JSON error body is still JSON. Without this a 500 was resolved as a
                // successful reading, and the exit-IP check reported nonsense instead of
                // failing.
                if (res.status < 200 || res.status >= 300) {
                    settle(() => reject(new Error(`${target.hostname} returned HTTP ${res.status || '?'} through the proxy`)));
                    return true;
                }
                try {
                    settle(() => resolve(JSON.parse(res.text)));
                }
                catch (e) {
                    settle(() => reject(new Error(`could not parse response: ${e.message}`)));
                }
                return true;
            };
            inner.on('data', (d) => {
                body = Buffer.concat([body, d]);
                if (body.length > MAX_RESPONSE_BYTES) {
                    settle(() => reject(new Error('response through the proxy exceeded the size limit')));
                    return;
                }
                tryComplete();
            });
            inner.on('end', () => {
                if (tryComplete())
                    return;
                // Walk to the FINAL header block: judging the first one lets a short
                // body hide behind a 1xx, whose block carries no framing header.
                let cursor = 0;
                let headers = '';
                let bodyStart = -1;
                for (;;) {
                    const at = body.indexOf('\r\n\r\n', cursor);
                    if (at < 0)
                        break;
                    const block = body.subarray(cursor, at).toString('utf8');
                    const line = block.split('\r\n')[0] ?? '';
                    if (/^HTTP\/1\.[01][ \t]+1\d\d(?![0-9])/.test(line)
                        && !/^HTTP\/1\.[01][ \t]+101(?![0-9])/.test(line)) {
                        cursor = at + 4;
                        continue;
                    }
                    headers = block;
                    bodyStart = at + 4;
                    break;
                }
                if (bodyStart < 0) {
                    settle(() => reject(new Error('proxy response ended before any headers were complete')));
                    return;
                }
                if (/^content-length:/im.test(headers) || /^transfer-encoding:/im.test(headers)) {
                    // Framing was declared and tryComplete() still says short: the peer
                    // closed mid-body. Salvaging turns a truncated read into a confident
                    // answer.
                    settle(() => reject(new Error('proxy response ended before the declared body was complete')));
                    return;
                }
                // A close-delimited response is still subject to its status line — the
                // framed path rejects a 500, so this one must too.
                const eofStatus = Number(/^HTTP\/1\.[01][ \t]+(\d{3})(?![0-9])/.exec(headers.split('\r\n')[0] ?? '')?.[1] ?? 0);
                if (eofStatus < 200 || eofStatus >= 300) {
                    settle(() => reject(new Error(`${target.hostname} returned HTTP ${eofStatus || '?'} through the proxy`)));
                    return;
                }
                // Parse the body as it arrived. Hunting for the first '{' and the last
                // '}' accepted `junk{"data":…}junk` as a valid reading, which is exactly
                // the case where the answer should not be trusted: the exit-IP check
                // would report an address extracted from a response that was not JSON.
                const payload = body.subarray(bodyStart).toString('utf8').trim();
                try {
                    settle(() => resolve(JSON.parse(payload)));
                }
                catch (e) {
                    settle(() => reject(new Error(`could not parse response: ${e.message}`)));
                }
            });
        };
        outer.on('data', onConnectReply);
    });
}
