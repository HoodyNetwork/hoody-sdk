/**
 * Events API Types
 * Local type definitions for the Events WebSocket implementation.
 *
 * These types are defined locally (not code-generated) because the Events
 * WebSocket protocol is not part of the OpenAPI spec — it uses a custom
 * Socket.IO-based message format.
 */
import { type EphemeralEventType, type EventType, type HoodyEventMap, type ResourceTypeFor } from './events-catalog.js';
/** A server-to-client event message received over the WebSocket. */
export interface EventServerMessage {
    /** Dot-separated event identifier, e.g. "container.running" or "auth.token.created". */
    event_type: string;
    /** UUID of the resource that triggered the event (container ID, project ID, etc.). */
    resource_id: string;
    /** Top-level resource category (e.g. "container", "project"). Optional for some event types. */
    resource_type?: string;
    /** ISO 8601 timestamp of when the event was emitted on the server. */
    timestamp: string;
    /** Event-specific payload; shape varies per event_type. */
    data?: any;
}
/**
 * Payload for the client-to-server `subscribe` and `unsubscribe` frames.
 *
 * The action is the Socket.IO event name, not a field: send this object as
 * `socket.emit('subscribe', payload)` or `socket.emit('unsubscribe', payload)`.
 *
 * Subscribing joins a delivery room. It does not select event types, and there is no way to do
 * so: the server broadcasts every event type to the rooms a connection holds — its own user room,
 * its realm rooms, and any project or container room joined here — so filtering by `event_type`
 * belongs on the client, which is what {@link EventsClient}'s per-type handlers do.
 *
 * This interface previously declared `action`, `event_types`, `resource_id` and `resource_type`.
 * The server reads none of those names, and nothing in this SDK ever sent one, so anybody who
 * hand-rolled a subscribe from the exported type got silence with no error. Omitting both fields
 * below is valid and joins no additional room.
 */
export interface EventClientMessage {
    /** 24-hex project id. Joins that project's delivery room. */
    projectId?: string;
    /** 24-hex container id. Joins that container's delivery room. */
    containerId?: string;
    /**
     * `'activity'` selects the live-only `activity.logged` feed:
     * `subscribe {type:'activity'}` opts the socket in, `unsubscribe
     * {type:'activity'}` out. The server answers with an
     * `activity_subscribed` frame. The opt-in lives on the socket, so it is
     * sent again after every welcome.
     */
    type?: 'activity';
}
/** Who caused a change. `id` is present only when the recipient may see it. */
export interface EventActor {
    kind: 'user' | 'system';
    id?: string;
}
/** How much of a resource the recipient may see in this row. */
export type EventVisibility = 'full' | 'removed' | 'nameless';
/**
 * One event as history returns it (without `type`). The live frame has the
 * same fields plus `type: 'event'`. Every field after `timestamp` is optional
 * here because an older hoody-api sends only `event`, `eventId`, `data` and
 * `timestamp`; the SDK fills the rest with explicit nulls.
 */
export interface EventHistoryItem {
    event: string;
    /** The per-recipient row id; the de-duplication key. */
    eventId: string;
    /** Admission (commit) time, ISO-8601. */
    timestamp: string;
    data?: unknown;
    /** Opaque, scope-bound; null only for ephemeral events. Compare for equality only. */
    cursor?: string | null;
    schema_version?: number;
    change_id?: string;
    operation_id?: string | null;
    resource_type?: string;
    resource_id?: string;
    project_id?: string | null;
    container_id?: string | null;
    realm_ids?: string[];
    all_realms?: boolean;
    visibility?: EventVisibility;
    cause_event_id?: string | null;
    actor?: EventActor;
    ephemeral?: boolean;
}
/** A live event frame on the `message` channel. */
export interface EventWireFrame extends EventHistoryItem {
    type: 'event';
}
/** First frame of an admitted connection. */
export interface WelcomeFrame {
    type: 'welcome';
    connectionId: string;
    userId: string;
    realmId: string | null;
    /** The scope's history fence at admission; where a fresh consumer resumes from. */
    boundary_cursor?: string;
    /** The newest readable row, or the zero cursor. */
    latest_cursor?: string;
    retention_days?: number;
    timestamp: string;
}
/** Sent every 30 s. A change of `latest_cursor` means history has rows the socket may not have delivered. */
export interface TickFrame {
    type: 'tick';
    latest_cursor: string;
}
export interface PongFrame {
    type: 'pong';
    timestamp?: string;
}
/** A refusal. `error` is a code. */
export interface ErrorFrame {
    type: 'error';
    error: string;
    message?: string;
    timestamp?: string;
    data?: unknown;
}
/** The server ended an admitted connection. `reason` is a code. */
export interface RevokedFrame {
    type: 'revoked';
    reason: string;
    message?: string;
    timestamp?: string;
}
/** Access to a project changed for this user; cached reads of it are stale. */
export interface ScopeChangedFrame {
    type: 'scope_changed';
    project_id: string;
    reason: 'PROJECT_ACCESS_REVOKED' | string;
}
/** The server's answer to an activity opt-in. */
export interface ActivitySubscribedFrame {
    type: 'activity_subscribed';
    enabled: boolean;
    timestamp?: string;
}
/** Every non-event frame on the `message` channel. */
export type ServerControlFrame = WelcomeFrame | TickFrame | PongFrame | ErrorFrame | RevokedFrame | ScopeChangedFrame | ActivitySubscribedFrame;
/** Anything the server sends on the `message` channel. */
export type ServerFrame = EventWireFrame | ServerControlFrame;
/**
 * Server wire-format for `message` events, as far as the legacy normaliser
 * needs it. Kept as the parameter type of {@link normalizeServerMessage}.
 */
type ServerWireMessage = Pick<EventWireFrame, 'event' | 'data' | 'timestamp' | 'eventId'> & Partial<EventWireFrame>;
/**
 * Normalise the server's wire-format into the legacy consumer-facing shape.
 *
 * A frame that carries the C1 top-level `resource_type`/`resource_id` is
 * taken at its word. Only a frame from an older hoody-api without them falls
 * back to guessing from the payload shape.
 */
export declare function normalizeServerMessage(m: ServerWireMessage): EventServerMessage;
interface HoodyEventBase<T extends EventType> {
    /** The per-recipient event id (`eventId`); stable across live and replayed delivery. */
    id: string;
    type: T;
    /** Same as `type`; kept so legacy `EventServerMessage` consumers keep working. */
    event_type: T;
    /** Admission (commit) time, ISO-8601. */
    timestamp: string;
    data: HoodyEventMap[T];
    resource_type: ResourceTypeFor<T>;
    resource_id: string;
    project_id: string | null;
    container_id: string | null;
    realm_ids: string[];
    all_realms: boolean;
    visibility: EventVisibility;
    schema_version: number;
    /** Shared by every row of one mutation; null from an older server. */
    change_id: string | null;
    /** The 32-hex command id of the operation this event reports, if any. */
    operation_id: string | null;
    cause_event_id: string | null;
    actor: EventActor | null;
    /** True when the event came from history during catch-up rather than from the live socket. */
    replayed: boolean;
    /**
     * stream() only: persisted events may be missing right before this one
     * (losing a persisted event is a gap). Refetch what you show,
     * as for any gap.
     */
    gap_before?: EventsStreamGap;
}
/**
 * An event yielded by stream(). `resume_after` is the stream's resume point
 * as of this event: persist it after handling the event, and pass it back as
 * stream({after}) to continue. Resuming is at-least-once (events after the
 * point may repeat; de-duplicate by `id`) and never skips one. It is null
 * without history (an older server). `cursor` is the event's own position
 * and is NOT a resume point: frames can arrive out of order (a lost frame is
 * replayed after a later one), so resuming after an event's cursor can skip
 * events the stream had not yielded yet.
 */
export type HoodyStreamEvent<T extends EventType = EventType> = HoodyEvent<T> & {
    resume_after: string | null;
};
/** The in-band gap mark stream() puts on the first event it yields after a loss. */
export interface EventsStreamGap {
    /**
     * `overflow`: the consumer fell more than `maxBytes` behind and buffered
     * events were dropped, or the `after` replay passed `maxReplayPages`.
     * The others: history could not be read from the cursor, in this
     * stream's `after` replay or in the runtime's own recovery.
     */
    reason: 'cursor_invalid' | 'cursor_expired' | 'history_reset' | 'overflow';
    /** How many buffered persisted events were dropped; present only for buffer overflow. */
    dropped?: number;
}
/** A persisted event: it is in history and carries a cursor. */
export interface PersistedHoodyEvent<T extends EventType = EventType> extends HoodyEventBase<T> {
    cursor: string;
    ephemeral: false;
}
/** A live-only event (`activity.logged`): never persisted, never replayed; losing one is never a gap. */
export interface EphemeralHoodyEvent<T extends EventType = EventType> extends HoodyEventBase<T> {
    cursor: null;
    ephemeral: true;
}
type HoodyEventOf<T extends EventType> = T extends EphemeralEventType ? EphemeralHoodyEvent<T> : PersistedHoodyEvent<T>;
/** The event a handler receives: a union discriminated on `type` (and on `ephemeral`). */
export type HoodyEvent<T extends EventType = EventType> = T extends EventType ? HoodyEventOf<T> : never;
/**
 * Build the consumer envelope from a live frame or a history item. Returns
 * null for a frame without the two fields every server has always sent
 * (`event` and `eventId`): such a frame cannot be routed or de-duplicated.
 */
export declare function toHoodyEvent(item: EventHistoryItem, replayed: boolean): HoodyEvent | null;
/** True for a `message` frame the runtime should treat as a control frame. */
export declare function isControlFrame(frame: unknown): frame is ServerControlFrame;
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
export declare class ApiConnecteventstreamWebSocket {
    connected: boolean;
    private readonly url;
    private readonly defaultOptions;
    private socket;
    constructor(url: string, options?: Record<string, any>);
    /**
     * Open the transport. Resolves on first `connect`, rejects on first
     * `connect_error` (the initial handshake failure).
     *
     * If called while already connected, resolves immediately.
     *
     * Per-call options (e.g. a freshly-refreshed `auth.token`) are merged onto
     * the constructor options for this connect attempt. This is how token
     * rotation before reconnect is supposed to flow through to the handshake.
     */
    connect(options?: Record<string, any>): Promise<void>;
    disconnect(_reason?: string): void;
    on(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, data?: any): void;
    off(event: string, callback?: (...args: any[]) => void): void;
    removeAllListeners(): void;
    onConnect(callback: () => void): () => void;
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    onReconnectAttempt(callback: (attempt: number) => void): () => void;
    onReconnect(callback: (attempt: number) => void): () => void;
    onError(callback: (error: Error) => void): () => void;
    /**
     * Data events only, in the legacy shape. Control frames (`welcome`,
     * `tick`, `error`, `revoked`, …) share the `message` channel and are NOT
     * events: delivering them here made every `onAnyEvent` listener fire on
     * them with `event_type: undefined`.
     */
    onEvent(callback: (event: EventServerMessage) => void): () => void;
    /** Every `message` frame, raw: event frames and control frames alike. */
    onFrame(callback: (frame: ServerFrame) => void): () => void;
    /**
     * The socket-level `error` event. hoody-api sends some refusals there
     * (`{type:'error', error}`), REALM_SELECTION_CONFLICT among them; for one
     * release they are sent on `message` too. `error` is not a reserved
     * socket.io client event, so only a listener on it sees them.
     */
    onSocketError(callback: (frame: ErrorFrame) => void): () => void;
    /** Raw socket.io `disconnect`, with socket.io's reason string. */
    onClose(callback: (reason: string) => void): () => void;
}
export {};
