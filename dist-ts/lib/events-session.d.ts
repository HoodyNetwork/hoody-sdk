/**
 * Binds the events runtime to the client session.
 *
 * An events stream belongs to one session: its socket authenticated with
 * that session's token, and its cursors are bound to that session's scope
 *. When the session changes (logout, login, adoptSession, setToken),
 * the socket must close and every buffer, replay state and cursor must be
 * dropped, so nothing read under one account is ever delivered or resumed
 * under another.
 *
 * The generated client already tracks a session `generation`, but privately,
 * so `lib/hoody-client.ts` overrides the four session methods and calls
 * {@link bumpEventsSession} around `super`. A session is shared by a client
 * and every client derived from it (withRealm/withContainer), and logout,
 * login and adoptSession end it for all of them; setToken moves only the one
 * client to a session of its own.
 */
/** The session handle one events runtime listens to. */
export declare class EventsSession {
    private readonly listeners;
    private gen;
    /** Increases on every bump. The runtime records it and discards work started under an older value. */
    get generation(): number;
    /** End the current session for this runtime: listeners close the socket and drop all state. */
    bump(): void;
    onBump(listener: () => void): () => void;
}
/** The EventsSession of `client`, created on first use. */
export declare function eventsSessionOf(client: object): EventsSession;
/**
 * End the events session of `client`.
 *
 * `scope: 'shared'` (logout, login, adoptSession) ends it for every client of
 * the same generated session, since those calls replace or end that session
 * for all of them. `scope: 'client'` (setToken) ends it only for `client`.
 */
export declare function bumpEventsSession(client: object, scope: 'shared' | 'client'): void;
/**
 * Take `client`'s runtime off its current shared state. Called before
 * setToken() moves the client to a session of its own, so a later logout of
 * the clients it leaves behind no longer reaches its stream.
 */
export declare function detachEventsSession(client: object): void;
/** File `client`'s runtime under its current shared state (after setToken moved it). */
export declare function refileEventsSession(client: object): void;
