// session.ts: the terminal Hub's HostEnv. One process env, installed once (preinstall.ts) before core evaluates, whose
// stores, vault and lock table belong to the CURRENT mount session: mountTerminalHub begins one, and its teardown ends
// it, so the next mount in the same process starts with nothing of the last one.
//
// - With no session open, a store, vault or lock read throws TERM_NO_SESSION: core reading host state outside a mount
//   is a bug, never "this host has no storage".
// - A handle kept from an ended session (a store, the vault, the lock manager) throws TERM_SESSION_ENDED, so it can never
//   read or write the next session's state; the vault's keys and records are dropped at the end. A lock request still
//   waiting at the end is refused with an AbortError, and an ifAvailable callback not yet run never runs.
// - The page is always visible; visibility, lifecycle and external-change listeners never fire (one process, no other
//   tab, no page lifecycle); there is no tab channel. Registrations are accepted with or without a session: core's
//   module-load listeners are process-scoped and outlive sessions.
import { installHostEnv, type HostEnv, type HostLocks, type KeyValueStore } from '../../core/host-env';
import { createMemoryLocks } from '../../core/host-locks-memory';
import { memoryVault } from '../../core/crypt/memory-vault';
import type { Vault } from '../../core/crypt/vault';
import { MAX_LINK_URL, safeCopyText } from '../prim/safe';

/**
 * What the host (the CLI, a runner) lends one mount: each member is optional and absent means the facility is absent
 * (callers show the text or address instead). The Hub never gets a credential through these.
 */
/** Where the web Hub is served (the API: /auth/home serves Hub v3; routes live in the hash). */
const WEB_HUB_PATH = '/auth/home';

export interface TermHostServices {
  /** Puts text on the system clipboard (e.g. OSC 52). Called only on an explicit user action, with text already
   *  bounded and stripped of control characters. */
  copy?(text: string): void;
  /** Opens an http(s) address in the user's browser. Gets a checked absolute address, never a Hub route. */
  openExternal?(url: string): void;
  /** The web Hub's origin (https://…), for links someone else can open (share links); absent = no such links. */
  webOrigin?: string;
}

/** An http(s) address fit to hand to the host: absolute, no control characters or spaces, bounded. */
export function externalUrlOk(url: string): boolean {
  if (typeof url !== 'string' || url.length > MAX_LINK_URL || /[\u0000-\u0020\u007f-\u009f]/.test(url)) return false;
  try { const u = new URL(url); return (u.protocol === 'https:' || u.protocol === 'http:') && u.username === '' && u.password === ''; } catch { return false; }
}

export interface TermSession {
  /** Ends the session: its stores and vault are dropped, its locks released, its waiting lock requests refused. Idempotent. */
  end(): void;
  /** False once ended. */
  live(): boolean;
  /** This session's own stores (never another session's, whatever is current); throws TERM_SESSION_ENDED once ended. */
  stores(): { local: KeyValueStore; session: KeyValueStore };
  /** Puts a storage seam over this session's local store (term/env/persist.ts over the host's files): from now on core
   *  reads and writes its local keys through `seam`; null takes it away. stores().local stays the memory under it. */
  seamLocal(seam: KeyValueStore | null): void;
}

interface Live {
  ended: boolean;
  local: KeyValueStore;
  /** The seam over `local` (seamLocal), or null: what core is handed as its local store. */
  seam: KeyValueStore | null;
  session: KeyValueStore;
  vault: Vault;
  locks: HostLocks;
  host: TermHostServices;
  abort: AbortController;
  handle: TermSession;
  /** Per-mount state of term modules (sessionSlot): created on first use, dropped with the session. */
  slots: Map<SessionSlot<unknown>, unknown>;
}

let current: Live | null = null;

/** A piece of per-mount state a term module keeps (a store, an id map, a counter). */
export interface SessionSlot<T> { readonly name: string; readonly make: () => T }
// Outside a mount (a component test drawing without a session) a slot lives here; every session start and end drops
// it, so nothing crosses from one mount (or test draw) into the next.
const detached = new Map<SessionSlot<unknown>, unknown>();

/** Declares a slot: `const menus = sessionSlot('menus', () => ({ open: null }))`, then `menus()` is this mount's value. */
export function sessionSlot<T>(name: string, make: () => T): () => T {
  const slot: SessionSlot<T> = { name, make };
  return () => {
    const m = current && !current.ended ? current.slots : detached;
    if (!m.has(slot as SessionSlot<unknown>)) m.set(slot as SessionSlot<unknown>, make());
    return m.get(slot as SessionSlot<unknown>) as T;
  };
}

/** Names of the slots this session (or, with none open, the detached set) holds: for the leak test. */
export function sessionSlotNames(): string[] {
  return [...(current ? current.slots : detached).keys()].map((k) => k.name).sort();
}

const endedError = (): Error => new Error('TERM_SESSION_ENDED');

// A session's memory store; drop() empties it at the end, so a kept handle holds no content either
// (unreachable through the API is not the same as gone).
/** Tests only: how many entries a session store holds, readable after its end (to prove the end emptied it). */
export const STORE_SIZE = Symbol.for('hoody.term.storeSize');
function memoryStore(live: () => boolean): KeyValueStore & { drop(): void; [STORE_SIZE]: () => number } {
  const m = new Map<string, string>();
  const check = () => { if (!live()) throw endedError(); };
  return {
    drop() { m.clear(); },
    [STORE_SIZE]: () => m.size,
    getItem(k) { check(); return m.get(String(k)) ?? null; },
    setItem(k, v) { check(); m.set(String(k), String(v)); },
    removeItem(k) { check(); m.delete(String(k)); },
    key(i) { check(); return [...m.keys()][i] ?? null; },
    get length() { check(); return m.size; },
  };
}

// The memory vault behind a liveness check; end() drops it, so a kept handle neither reads nor writes after the end.
function sessionVault(live: () => boolean): { vault: Vault; drop(): void } {
  let inner: Vault | null = memoryVault();
  const v = (): Vault => { if (!live() || !inner) throw endedError(); return inner; };
  return {
    vault: {
      keys: async (a) => v().keys(a),
      putKey: async (a, id, k) => v().putKey(a, id, k),
      deleteKeys: async (a, keep) => v().deleteKeys(a, keep),
      account: async (a) => v().account(a),
      putAccount: async (r) => v().putAccount(r),
      forget: async (a, epoch) => v().forget(a, epoch),
    },
    drop: () => { inner = null; },
  };
}

function sessionLocks(abort: AbortController, live: () => boolean): HostLocks {
  const inner = createMemoryLocks().locks;
  return {
    // Web Locks' two forms: request(name, fn) and request(name, options, fn) (core uses both).
    request: ((name: string, ...rest: unknown[]) => {
      const fn = rest[rest.length - 1] as Parameters<HostLocks['request']>[2];
      const o = (rest.length > 1 ? rest[0] : {}) as LockOptions;
      if (typeof fn !== 'function') return Promise.reject(new TypeError('LOCK_CALLBACK_REQUIRED'));
      if (!live()) return Promise.reject(endedError());
      const signal = o.signal ? AbortSignal.any([o.signal, abort.signal]) : abort.signal;
      // The memory manager runs an ifAvailable callback on a later tick without looking at the signal again.
      const run: typeof fn = (lock) => (live() ? fn(lock) : Promise.reject(new DOMException('The lock request is aborted', 'AbortError')));
      return inner.request(name, { ...o, signal }, run);
    }) as HostLocks['request'],
    query() {
      if (!live()) return Promise.reject(endedError());
      return inner.query!();
    },
  };
}

/** Begins a mount session. One at a time: a second while one is open throws TERM_SESSION_ACTIVE. */
export function beginTermSession(host: TermHostServices = {}): TermSession {
  if (current) throw new Error('TERM_SESSION_ACTIVE');
  const abort = new AbortController();
  const s = {} as Live;
  const live = () => !s.ended;
  const vault = sessionVault(live);
  detached.clear();
  Object.assign(s, {
    slots: new Map(),
    ended: false,
    local: memoryStore(live),
    seam: null,
    session: memoryStore(live),
    vault: vault.vault,
    locks: sessionLocks(abort, live),
    host: { ...host },
    abort,
    handle: {
      end() {
        if (s.ended) return;
        s.ended = true;
        if (current === s) current = null;
        s.slots.clear();
        // Contents and host references go too, not only access: a kept handle reaches empty maps and no service.
        (s.local as ReturnType<typeof memoryStore>).drop();
        (s.session as ReturnType<typeof memoryStore>).drop();
        s.seam = null;
        s.host = {};
        detached.clear();
        vault.drop();
        abort.abort(new DOMException('The lock request is aborted', 'AbortError'));
      },
      live,
      stores() {
        if (s.ended) throw endedError();
        return { local: s.local, session: s.session };
      },
      seamLocal(seam: KeyValueStore | null) {
        if (s.ended) throw endedError();
        s.seam = seam;
      },
    },
  });
  current = s;
  return s.handle;
}

/** The open session, or null. */
export function currentTermSession(): TermSession | null {
  return current?.handle ?? null;
}

function now(): Live {
  if (!current) throw new Error('TERM_NO_SESSION');
  return current;
}

const off = (): void => {};

// A host service of ONE session (the one a handle was taken in), or null once that session ended or another is
// current: a handle kept by mount A, called after A ended, never reaches mount B's clipboard
// or browser.
const serviceOf = <K extends keyof TermHostServices>(s: Live | null, k: K): NonNullable<TermHostServices[K]> | null => {
  if (!s || s.ended || current !== s) return null;
  return (s.host[k] ?? null) as NonNullable<TermHostServices[K]> | null;
};

const env: HostEnv = {
  get local() { const s = now(); return s.seam ?? s.local; },
  get session() { return now().session; },
  get vault() { return now().vault; },
  get locks() { return now().locks; },
  onExternalChange: () => off,
  visible: () => true,
  onVisibilityChange: () => off,
  onLifecycle: () => off,
  channel: () => null,
  // A secure context for WebCrypto: a local process with no page origin (the browser's isSecureContext rule is about
  // page origins), whose getRandomValues is the runtime's own strong source. So the vault encrypts as on the web.
  secureContext: true,
  get clipboard() {
    const s = current;
    if (!serviceOf(s, 'copy')) return null;
    return {
      write(text: string): boolean {
        const copy = serviceOf(s, 'copy');
        const safe = safeCopyText(text);
        if (!copy || safe === null) return false;
        try { copy(safe); return true; } catch { return false; }
      },
    };
  },
  get openExternal() {
    const s = current;
    if (!serviceOf(s, 'openExternal')) return undefined;
    return (url: string): boolean => {
      const open = serviceOf(s, 'openExternal');
      if (!open || !externalUrlOk(url)) return false;
      try { open(url); return true; } catch { return false; }
    };
  },
  files: null,
  browserPage: false,
  // No Hub-started workers: a worker's fetch bypasses the mount's transport and its fence, so
  // uploads stay on the page engine, whose every send goes through transport().
  workers: false,
  // App-lock passcodes are not offered in the terminal: memory storage, no cross-process lock
  // and no visibility signal cannot protect an unattended mount; the UI says unsupported and setPasscode refuses.
  passcodeLock: false,
  // The web Hub's origin, when the host gave one: links built from it open the same Hub on the web.
  get pageAddress() {
    const o = current?.host.webOrigin;
    if (!o) return null;
    try { const u = new URL(o); if (u.protocol !== 'https:' || u.origin !== o) return null; return { origin: o, pathname: WEB_HUB_PATH, search: '' }; } catch { return null; }
  },
};

/** The terminal env (the object installTermEnv gives core). */
export function termHostEnv(): HostEnv {
  return env;
}

/** Installs the terminal env into core. Once per process, before core resolves its env (preinstall.ts). */
export function installTermEnv(): void {
  installHostEnv(env);
}
