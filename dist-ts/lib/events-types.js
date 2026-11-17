/**
 * Events API Types
 * Local type definitions for the Events WebSocket implementation.
 *
 * These types are defined locally (not code-generated) because the Events
 * WebSocket protocol is not part of the OpenAPI spec — it uses a custom
 * Socket.IO-based message format.
 */
import { parse as parseEngineUri } from 'engine.io-client';
import { Manager } from 'socket.io-client';
import { ValidationError } from '../generated/errors.js';
import { normalizeEventsTransports } from './socketio-node-transport.js';
import { isEphemeralEventType, } from './events-catalog.js';
/**
 * Normalise the server's wire-format into the legacy consumer-facing shape.
 *
 * A frame that carries the top-level `resource_type`/`resource_id` is
 * taken at its word. Only a frame from an older API without them falls
 * back to guessing from the payload shape.
 */
export function normalizeServerMessage(m) {
    if (typeof m.resource_id === 'string' && m.resource_id.length > 0) {
        return {
            event_type: m.event,
            resource_id: m.resource_id,
            ...(typeof m.resource_type === 'string' ? { resource_type: m.resource_type } : {}),
            timestamp: m.timestamp,
            ...(m.data !== undefined ? { data: m.data } : {}),
        };
    }
    const payload = (m.data ?? {});
    // The API's computer broadcasts send `data: { computer: { id, … } }`
    // without a top-level resource_id. Read nested `computer.id` /
    // `project.id` so `onComputerEvents()` and similar resource-id filters
    // don't silently drop every computer event.
    const nestedComputer = (payload.computer && typeof payload.computer === 'object')
        ? payload.computer
        : undefined;
    const nestedProject = (payload.project && typeof payload.project === 'object')
        ? payload.project
        : undefined;
    const resourceId = payload.resource_id ??
        payload.resourceId ??
        payload.computer_id ??
        payload.project_id ??
        nestedComputer?.id ??
        nestedProject?.id ??
        payload.id ??
        '';
    const resourceType = payload.resource_type ??
        payload.resourceType ??
        (payload.computer ? 'computer' : payload.project ? 'project' : undefined);
    return {
        event_type: m.event,
        resource_id: String(resourceId),
        ...(resourceType ? { resource_type: resourceType } : {}),
        timestamp: m.timestamp,
        ...(m.data !== undefined ? { data: m.data } : {}),
    };
}
const nullableString = (v) => (typeof v === 'string' ? v : null);
/**
 * Build the consumer envelope from a live frame or a history item. Returns
 * null for a frame without the two fields every server has always sent
 * (`event` and `eventId`): such a frame cannot be routed or de-duplicated.
 */
export function toHoodyEvent(item, replayed) {
    if (!item || typeof item !== 'object')
        return null;
    if (typeof item.event !== 'string' || item.event.length === 0)
        return null;
    if (typeof item.eventId !== 'string' || item.eventId.length === 0)
        return null;
    // Ephemeral is what the frame says, or what the catalog says of a frame
    // from a server that does not send the flag yet. A persisted event
    // without a cursor (an older server) keeps cursor '' so the union stays
    // honest about its type; recovery never reads a cursor off an event.
    const ephemeral = item.ephemeral === true || (item.ephemeral === undefined && isEphemeralEventType(item.event));
    const legacy = normalizeServerMessage(item);
    const event = {
        id: item.eventId,
        type: item.event,
        event_type: item.event,
        timestamp: typeof item.timestamp === 'string' ? item.timestamp : '',
        data: (item.data ?? {}),
        resource_type: typeof item.resource_type === 'string' ? item.resource_type : (legacy.resource_type ?? ''),
        resource_id: legacy.resource_id,
        project_id: nullableString(item.project_id),
        computer_id: nullableString(item.computer_id),
        realm_ids: Array.isArray(item.realm_ids) ? item.realm_ids.filter((r) => typeof r === 'string') : [],
        all_realms: item.all_realms === true,
        visibility: item.visibility === 'removed' || item.visibility === 'nameless' ? item.visibility : 'full',
        schema_version: typeof item.schema_version === 'number' ? item.schema_version : 1,
        change_id: nullableString(item.change_id),
        operation_id: nullableString(item.operation_id),
        cause_event_id: nullableString(item.cause_event_id),
        actor: item.actor && typeof item.actor === 'object' && (item.actor.kind === 'user' || item.actor.kind === 'system')
            ? { kind: item.actor.kind, ...(typeof item.actor.id === 'string' ? { id: item.actor.id } : {}) }
            : null,
        replayed,
        cursor: ephemeral ? null : (typeof item.cursor === 'string' ? item.cursor : ''),
        ephemeral,
    };
    return event;
}
/** True for a `message` frame the runtime should treat as a control frame. */
export function isControlFrame(frame) {
    if (!frame || typeof frame !== 'object')
        return false;
    const t = frame.type;
    return typeof t === 'string' && t !== 'event';
}
/**
 * Socket.IO-backed WebSocket client for the Hoody Events stream.
 *
 * Wraps `socket.io-client` with the Hoody-specific surface that
 * {@link EventsManager} and {@link EventsClient} consume:
 *   - `connect()` resolves on the first `connect` event (or rejects on error)
 *   - `onEvent(cb)` normalises the server's `message` payload into
 *     {@link EventServerMessage} before invoking `cb`
 *   - `on*` lifecycle hooks return real unsubscribe functions
 *   - `disconnect()` tears down the transport
 *
 * Construction is cheap: the underlying socket is created with
 * `autoConnect: false` so consumers control when the network op starts. Call
 * `connect()` to open the transport.
 */
/**
 * Per-call `connect(options)` keys socket.io reads once, at construction: the
 * packet parser, the Manager's timer functions, and the Socket's copied
 * `ackTimeout` / `retries`. A per-call value that differs is refused.
 */
const CONSTRUCTION_ONLY_OPTIONS = ['parser', 'useNativeTimers', 'ackTimeout', 'retries'];
/** Per-call keys the Manager holds behind a setter; `Manager.opts` alone would not move them. */
const MANAGER_SETTER_OPTIONS = [
    'timeout', 'reconnection', 'reconnectionAttempts', 'reconnectionDelay', 'reconnectionDelayMax', 'randomizationFactor',
];
/**
 * What `io(url, options)` derives from the URL (socket.io-client `url.js` and
 * `lookup`): the Manager endpoint is the URL as given, query included; the
 * namespace is the URL's path, `/` for an origin-only URL. The engine.io `path`
 * option is never the namespace.
 */
function parseEventsUrl(url) {
    // socket.io-client's own resolution (its `url()`), shape for shape: a URL that starts
    // with `//` takes the page's protocol, one that starts with `/` the page's host, and
    // one without a scheme the page's protocol (https where there is no page).
    const loc = typeof location !== 'undefined' && location ? location : undefined;
    let uri = url;
    if (uri.charAt(0) === '/') {
        if (!loc) {
            throw new ValidationError(`events: "${url}" has no host. A relative events URL only works in a browser page; pass an absolute URL.`, 'url');
        }
        uri = uri.charAt(1) === '/' ? loc.protocol + uri : loc.host + uri;
    }
    if (!/^(https?|wss?):\/\//.test(uri))
        uri = (loc ? loc.protocol + '//' : 'https://') + uri;
    const parsed = parseEngineUri(uri);
    // Never connect on an empty host: engine.io would fall back to the page's own host,
    // and the connection and its credential would go there.
    if (!parsed.host) {
        throw new ValidationError(`events: "${url}" has no host; pass an absolute URL.`, 'url');
    }
    return { source: parsed.source, namespace: parsed.path || '/', query: parsed.query || '', queryKey: parsed.queryKey || {} };
}
/**
 * The Socket.IO connection of the events stream: one socket on its own Manager, never shared
 * with another `io()` call in the process. The namespace is the path of `url`.
 *
 * It opens with WebSocket first and does not reconnect by itself (`reconnection: false`):
 * the events runtime that owns it decides when to connect again.
 */
export class EventsSocketTransport {
    /** True between the socket's `connect` and `disconnect`. */
    connected = false;
    url;
    defaultOptions;
    /** This wrapper's own Manager: never shared, never replaced. */
    manager;
    socket;
    /**
     * Builds the socket without connecting; call {@link connect}. `url` must be absolute outside a
     * browser page; a URL with no host throws a ValidationError. `options` are socket.io-client
     * options: `autoConnect` is always off, `reconnection` is off unless set, and `transports`
     * defaults to WebSocket first.
     */
    constructor(url, options = {}) {
        this.url = url;
        // Normalise: we own `autoConnect` so `connect()` can return a real promise.
        //
        // WebSocket first, by default. The API may refuse a long-polling handshake (400), and
        // socket.io-client does NOT fall back from a failed polling handshake to websocket
        // unless `tryAllTransports` is set — so a polling-first client would never connect.
        // A caller whose own proxy in front of the API supports polling can still pass `transports` explicitly.
        //
        // Outside a browser the list is normalised to transport classes, with the SDK's own
        // WebSocket transport in the websocket slot (socketio-node-transport.ts).
        //
        // `reconnection: false` by default: socket.io-client does not reconnect after a server
        // namespace disconnect anyway (every refusal and revocation is one), and a client-side
        // retry loop racing the runtime's own loop reconnected with a stale token.
        // EventsManager owns every retry (`reconnection: false`).
        this.defaultOptions = {
            reconnection: false,
            ...options,
            transports: normalizeEventsTransports(options.transports),
            autoConnect: false,
        };
        // Not `io()`: it reuses a cached Manager per origin + path and then ignores the new
        // options, so a raw `io()` elsewhere in the process could decide which transport SDK
        // events open with. This is what `io(url, options)` does, minus the cache.
        const parsed = parseEventsUrl(this.url);
        const managerOptions = { ...this.defaultOptions };
        this.manager = new Manager(parsed.source, managerOptions);
        if (parsed.query && !managerOptions.query)
            managerOptions.query = parsed.queryKey;
        // The Socket gets the same option bag `io()` passes it: `auth` (the caller's callback
        // by identity, so it is read on every CONNECT), `ackTimeout`, `retries`.
        this.socket = this.manager.socket(parsed.namespace, managerOptions);
        // Keep `connected` in sync with the transport.
        this.socket.on('connect', () => { this.connected = true; });
        this.socket.on('disconnect', () => { this.connected = false; });
    }
    /**
     * Open the transport. Resolves on first `connect`, rejects on first
     * `connect_error` (the initial handshake failure).
     *
     * If called while already connected, resolves immediately.
     *
     * Per-call options (e.g. a freshly-refreshed `auth.token`) are merged onto
     * the constructor options for this connect attempt. This is how token
     * rotation before reconnect is supposed to flow through to the handshake.
     * `parser`, `useNativeTimers`, `ackTimeout` and `retries` are fixed at
     * construction: a per-call value that differs throws a ValidationError
     * and changes nothing.
     */
    connect(options = {}) {
        if (this.socket.connected) {
            this.connected = true;
            return Promise.resolve();
        }
        if (options && Object.keys(options).length > 0)
            this.applyConnectOptions(options);
        return new Promise((resolve, reject) => {
            const onConnect = () => {
                this.socket.off('connect', onConnect);
                this.socket.off('connect_error', onConnectError);
                this.connected = true;
                resolve();
            };
            const onConnectError = (err) => {
                this.socket.off('connect', onConnect);
                this.socket.off('connect_error', onConnectError);
                reject(err instanceof Error ? err : new Error(String(err)));
            };
            this.socket.on('connect', onConnect);
            this.socket.on('connect_error', onConnectError);
            this.socket.connect();
        });
    }
    /** Apply per-call connect options to the Manager and Socket this wrapper already owns. */
    applyConnectOptions(options) {
        // Everything that can refuse is checked before anything is changed.
        for (const key of CONSTRUCTION_ONLY_OPTIONS) {
            if (key in options && !Object.is(options[key], this.defaultOptions[key])) {
                throw new ValidationError(`events: \`${key}\` is fixed when the socket is constructed; pass it to the constructor, not to connect()`, key);
            }
        }
        const transports = 'transports' in options ? normalizeEventsTransports(options.transports) : undefined;
        const managerOpts = this.manager.opts;
        const setters = this.manager;
        for (const [key, value] of Object.entries(options)) {
            if (key === 'autoConnect' || key === 'auth' || key === 'transports')
                continue;
            if (CONSTRUCTION_ONLY_OPTIONS.includes(key))
                continue;
            // Read at the next engine.io construction: path, query, extraHeaders, …
            managerOpts[key] = value;
            if (MANAGER_SETTER_OPTIONS.includes(key) && value !== undefined) {
                setters[key].call(this.manager, value);
            }
        }
        if (transports)
            managerOpts.transports = transports;
        if (options.auth) {
            // A callback is kept by identity: socket.io calls it on every CONNECT. An object
            // is merged over the current object auth.
            const current = this.socket.auth;
            const auth = typeof options.auth === 'function'
                ? options.auth
                : { ...(current && typeof current === 'object' ? current : {}), ...options.auth };
            managerOpts.auth = auth;
            this.socket.auth = auth;
        }
    }
    /** Close the socket. The argument is accepted and not used. */
    disconnect(_reason) {
        this.connected = false;
        this.socket.disconnect();
    }
    /** Listen to a raw socket event, control frames included. */
    on(event, callback) {
        this.socket.on(event, callback);
    }
    /** Send `event` to the server, with `data` when it is not `undefined`. */
    emit(event, data) {
        if (data === undefined)
            this.socket.emit(event);
        else
            this.socket.emit(event, data);
    }
    /** Remove `callback` from `event`; with no callback, every listener of `event`. */
    off(event, callback) {
        if (callback === undefined)
            this.socket.off(event);
        else
            this.socket.off(event, callback);
    }
    /** Remove every listener from the socket, this wrapper's own `connected` tracking included. */
    removeAllListeners() {
        this.socket.removeAllListeners();
    }
    // --- Lifecycle hooks: each returns a single-use unsubscribe function ---
    //
    // EventsManager.cleanupWsListeners iterates the returned unsubscribers
    // on disconnect — they MUST be real functions (not no-ops) so listeners
    // detach when the manager tears down.
    /** Call `callback` on every `connect`. Returns the function that removes it. */
    onConnect(callback) {
        const handler = () => callback();
        this.socket.on('connect', handler);
        return () => this.socket.off('connect', handler);
    }
    /**
     * Call `callback` on every `disconnect`. Returns the function that removes it. `reason` is
     * socket.io's reason; `code` is made up to fit the signature: 1000 for a disconnect the
     * server asked for, 1006 for anything else.
     */
    onDisconnect(callback) {
        const handler = (reason) => {
            // socket.io gives a reason string; there's no protocol close code at
            // this layer. Synthesize a code so the signature matches callers.
            const code = reason === 'io server disconnect' ? 1000 : 1006;
            callback(code, reason ?? 'disconnect');
        };
        this.socket.on('disconnect', handler);
        return () => this.socket.off('disconnect', handler);
    }
    /** Call `callback` on each reconnection attempt of the Manager (none happen unless `reconnection` was turned on). Returns the function that removes it. */
    onReconnectAttempt(callback) {
        const handler = (attempt) => callback(attempt);
        this.manager.on('reconnect_attempt', handler);
        return () => this.manager.off('reconnect_attempt', handler);
    }
    /** Call `callback` when the Manager's own reconnection succeeds (only with `reconnection` turned on). Returns the function that removes it. */
    onReconnect(callback) {
        const handler = (attempt) => callback(attempt);
        this.manager.on('reconnect', handler);
        return () => this.manager.off('reconnect', handler);
    }
    /** Call `callback` on a failed handshake (`connect_error`) and on a Manager `error`, always with an Error. Returns the function that removes it. */
    onError(callback) {
        const handler = (err) => {
            callback(err instanceof Error ? err : new Error(String(err)));
        };
        this.socket.on('connect_error', handler);
        this.manager.on('error', handler);
        return () => {
            this.socket.off('connect_error', handler);
            this.manager.off('error', handler);
        };
    }
    /**
     * Data events only, in the legacy shape. Control frames (`welcome`,
     * `tick`, `error`, `revoked`, …) share the `message` channel and are NOT
     * events: delivering them here made every `onAnyEvent` listener fire on
     * them with `event_type: undefined`.
     */
    onEvent(callback) {
        const handler = (raw) => {
            if (!raw || typeof raw !== 'object' || raw.type !== 'event')
                return;
            try {
                callback(normalizeServerMessage(raw));
            }
            catch {
                // Malformed payloads are dropped rather than propagating into
                // the socket error channel — isolation is the contract.
            }
        };
        this.socket.on('message', handler);
        return () => this.socket.off('message', handler);
    }
    /** Every `message` frame, raw: event frames and control frames alike. */
    onFrame(callback) {
        const handler = (raw) => {
            if (!raw || typeof raw !== 'object')
                return;
            callback(raw);
        };
        this.socket.on('message', handler);
        return () => this.socket.off('message', handler);
    }
    /**
     * The socket-level `error` event. The API sends some refusals there
     * (`{type:'error', error}`), REALM_SELECTION_CONFLICT among them; for one
     * release they are sent on `message` too. `error` is not a reserved
     * socket.io client event, so only a listener on it sees them.
     */
    onSocketError(callback) {
        const handler = (raw) => {
            if (!raw || typeof raw !== 'object')
                return;
            const code = raw.error;
            if (typeof code !== 'string')
                return;
            callback({ ...raw, type: 'error', error: code });
        };
        this.socket.on('error', handler);
        return () => this.socket.off('error', handler);
    }
    /**
     * The cause of a transport failure, as engine.io reports it: the Manager's
     * `error` (an engine.io TransportError whose `description` is the
     * WebSocket's own error event) and the Socket's `connect_error`. Fires
     * before the `disconnect` that follows, and may fire more than once for one
     * failure.
     */
    onTransportError(callback) {
        const handler = (cause) => callback(cause);
        this.manager.on('error', handler);
        this.socket.on('connect_error', handler);
        return () => {
            this.manager.off('error', handler);
            this.socket.off('connect_error', handler);
        };
    }
    /** Raw socket.io `disconnect`, with socket.io's reason string. */
    onClose(callback) {
        const handler = (reason) => callback(typeof reason === 'string' ? reason : 'disconnect');
        this.socket.on('disconnect', handler);
        return () => this.socket.off('disconnect', handler);
    }
}
