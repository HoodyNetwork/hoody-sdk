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
export class EventsSession {
    listeners = new Set();
    gen = 0;
    /** Increases on every bump. The runtime records it and discards work started under an older value. */
    get generation() {
        return this.gen;
    }
    /** End the current session for this runtime: listeners close the socket and drop all state. */
    bump() {
        this.gen++;
        for (const listener of [...this.listeners]) {
            try {
                listener();
            }
            catch {
                // A listener failing must not keep another runtime on the old session.
            }
        }
    }
    onBump(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
const WeakRefCtor = globalThis.WeakRef;
function weakRef(target) {
    return WeakRefCtor ? new WeakRefCtor(target) : { deref: () => target };
}
/** One EventsSession per client instance. */
const sessionByClient = new WeakMap();
/**
 * Every EventsSession whose client shares one generated session state. Keyed
 * by that state object, which the generated client shares by reference
 * between a client and the clients derived from it.
 */
const sessionsBySharedState = new WeakMap();
/** The generated client's shared session state (private there; read, never written, here). */
function sharedStateOf(client) {
    const state = client.session;
    return state && typeof state === 'object' ? state : undefined;
}
function register(state, session) {
    if (!state)
        return;
    let set = sessionsBySharedState.get(state);
    if (!set) {
        set = new Set();
        sessionsBySharedState.set(state, set);
    }
    for (const ref of set) {
        const live = ref.deref();
        if (!live)
            set.delete(ref);
        else if (live === session)
            return;
    }
    set.add(weakRef(session));
}
/** The EventsSession of `client`, created on first use. */
export function eventsSessionOf(client) {
    let session = sessionByClient.get(client);
    if (!session) {
        session = new EventsSession();
        sessionByClient.set(client, session);
    }
    // Registered on every lookup: setToken() moves the client to a new shared
    // state, and a lookup afterwards files it under the new one.
    register(sharedStateOf(client), session);
    return session;
}
/**
 * End the events session of `client`.
 *
 * `scope: 'shared'` (logout, login, adoptSession) ends it for every client of
 * the same generated session, since those calls replace or end that session
 * for all of them. `scope: 'client'` (setToken) ends it only for `client`.
 */
export function bumpEventsSession(client, scope) {
    const own = sessionByClient.get(client);
    const targets = new Set();
    if (own)
        targets.add(own);
    if (scope === 'shared') {
        const state = sharedStateOf(client);
        const set = state ? sessionsBySharedState.get(state) : undefined;
        if (set) {
            for (const ref of [...set]) {
                const live = ref.deref();
                if (live)
                    targets.add(live);
                else
                    set.delete(ref);
            }
        }
    }
    for (const session of targets)
        session.bump();
}
/**
 * Take `client`'s runtime off its current shared state. Called before
 * setToken() moves the client to a session of its own, so a later logout of
 * the clients it leaves behind no longer reaches its stream.
 */
export function detachEventsSession(client) {
    const own = sessionByClient.get(client);
    const state = sharedStateOf(client);
    const set = own && state ? sessionsBySharedState.get(state) : undefined;
    if (!set)
        return;
    for (const ref of [...set]) {
        const live = ref.deref();
        if (!live || live === own)
            set.delete(ref);
    }
}
/** File `client`'s runtime under its current shared state (after setToken moved it). */
export function refileEventsSession(client) {
    const own = sessionByClient.get(client);
    if (own)
        register(sharedStateOf(client), own);
}
