// host-env.ts: the one place core reaches the browser's storage, locks, visibility, page lifecycle, tab channel and
// key vault. A host that is not a browser (the terminal Hub) installs its own HostEnv before core evaluates; with
// none installed every member is today's browser path, read at each call, so the web is unchanged.
//
// - The web default reads its globals lazily at every call (a getter, never a cached value), so a getter or method
//   that throws (a blocked storage, no document) throws inside the caller's own try, as before.
// - Registrations (onExternalChange, onVisibilityChange, onLifecycle, channel().onMessage) made before the env is
//   resolved are held and attached when it resolves; unsubscribing a held one drops it. The env resolves at
//   installHostEnv, at settleHostEnv(), at the first call that is not a registration (a store, a lock, the vault, visible()), or when the
//   task that loaded this module ends (a microtask): the window in which module-load listeners are made. A
//   registration made after that attaches at once, so a runtime registration (leave's) is never held.
// - A held registration that fails to attach does not vanish: the others still attach, then the first failure is
//   thrown from the call that resolved the env (install, the first store/lock/vault call, or the load-window
//   microtask). A caller that made its registrations in one try passes registrationGroup(fn, onError): the first
//   failure skips the rest of that group, and onError (its own catch) takes the error instead of the resolver (an
//   onError that throws is an unhandled failure like any other: the rest still attach).
// - The web default does not guard what the browser would throw: a missing document or a throwing visibility read
//   escapes to the caller as it did, and the callers that always swallowed it (notifications) keep their own catch.
// - onVisibilityChange hands the callback no state: the adapter reads nothing at the event, so a callback's own read and
//   its own catch behave as they did when it was attached to the document directly.
// - installHostEnv is for the process start: once an env is resolved it throws.
import { idbVault, type Vault } from './crypt/vault';
import type { BrowserEnv } from './alerts.pure';

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
  /** Removes every key (web: Storage.clear). Absent: callers remove key by key. */
  clear?(): void;
  /** Why this store cannot remove its keys now, or null. Web storage has no such state (absent). The terminal's store:
   *  'busy' while another Hub holds this account's store, 'failed' once a write to it failed or none could be opened.
   *  Remove all local data refuses while it answers one (local-wipe.ts). */
  cannotDelete?(): 'busy' | 'failed' | null;
}

/** The page's native alerts (web: Notification, navigator, matchMedia, the document), read at each call. */
export interface AlertHost {
  /** What alerts.ts judges support and permission from. */
  facts(): BrowserEnv;
  /** The Notification constructor; undefined where the page has none. */
  readonly Notification: typeof Notification | undefined;
  /** The page's language and direction, for an alert's text. */
  textDir(): { lang: string; dir: string };
  /** Brings the page forward (an alert was clicked). */
  focus(): void;
  /** The site's service worker registration, if it already has one. */
  workerRegistration(): Promise<ServiceWorkerRegistration | undefined>;
  /** The page is out of the person's sight: hidden, or another window has the focus. */
  away(): boolean;
}

/** The subset of LockManager that core calls. `query` is absent where the host cannot answer it (callers treat that as unknown). */
export interface HostLocks {
  request<T>(name: string, o: LockOptions, fn: (lock: Lock | null) => Promise<T> | T): Promise<T>;
  query?(): Promise<LockManagerSnapshot>;
}

export type HostLifecycleEvent =
  | { type: 'beforeunload'; preventDefault(): void; setReturnValue(v: string): void }
  | { type: 'pageshow'; persisted: boolean }
  | { type: 'pagehide'; persisted: boolean }
  | { type: 'online' }
  | { type: 'offline' }
  | { type: 'focus' };

export interface HostChannel {
  post(m: unknown): void;
  onMessage(cb: (m: unknown) => void): () => void;
  close(): void;
}

/** The WebSocket constructor core calls (socket.ts, through transport.ts's real leg). */
export type HostWebSocket = new (url: string, protocols?: string | string[]) => WebSocket;

export interface HostEnv {
  /** localStorage; null where the host has none. */
  readonly local: KeyValueStore | null;
  /** sessionStorage; null where the host has none. */
  readonly session: KeyValueStore | null;
  /** Where the base keys live (web: the IndexedDB vault); null where the host has none. */
  readonly vault: Vault | null;
  /** navigator.locks; null where the host has none. */
  readonly locks: HostLocks | null;
  /** Another context wrote storage (web: the window 'storage' event). A null key means the area was cleared. */
  onExternalChange(cb: (area: 'local' | 'session', key: string | null) => void): () => void;
  /** False only when the page is known hidden. */
  visible(): boolean;
  /** The page's visibility changed; the callback reads visible() itself, in its own control flow. */
  onVisibilityChange(cb: () => void): () => void;
  onLifecycle<T extends HostLifecycleEvent['type']>(type: T, cb: (e: Extract<HostLifecycleEvent, { type: T }>) => void): () => void;
  /** A same-origin broadcast channel; null where the host has none. */
  channel(name: string): HostChannel | null;
  /** The WebSocket constructor (web: globalThis.WebSocket); absent or null where the host has none. */
  readonly webSocket?: HostWebSocket | null;
  /** The address this Hub is open at, for a link someone else can open (web: the page's location); absent or null
   * where the host has no address of its own (a terminal). */
  readonly pageAddress?: { origin: string; pathname: string; search: string } | null;
  /** True only where the Hub runs as a web page (browser APIs such as Notification and matchMedia exist). Never infer
   *  it from pageAddress: a terminal mount may carry the web Hub's address for share links. */
  readonly browserPage?: boolean;
  /** Writes text to the system clipboard, on an explicit user action only. False when the host refused it or has no
   *  clipboard; absent or null where the host has none (callers then show the text to copy by hand). */
  readonly clipboard?: { write(text: string): boolean } | null;
  /** Opens an http(s) address outside the Hub (web: a new tab; terminal: the host's browser). False when refused or
   *  impossible; absent where the host cannot (callers then show the address). Never a Hub route: those navigate. */
  openExternal?(url: string): boolean;
  /** Saving files to the device. Absent or null where the host cannot (a terminal): callers leave the action out. */
  readonly files?: { save(name: string, data: Blob | string): Promise<boolean> } | null;
  /** False where the host cannot keep an app-lock passcode safe (a terminal: memory storage, no cross-process lock,
   *  no visibility signal): lockSupport() is then false, so the passcode UI says unsupported and setPasscode refuses.
   *  Absent = supported if the storage, locks and WebCrypto checks pass (the web). */
  readonly passcodeLock?: boolean;
  /** True where WebCrypto runs in a secure context, so the vault may encrypt (its only randomness is
   *  crypto.getRandomValues). Web: the browser's isSecureContext, read at each call. A terminal sets true: a local
   *  process with no page origin, whose getRandomValues is the runtime's own strong source. Absent = false. */
  readonly secureContext?: boolean;
  /** The proxy domain computer port addresses are built under (web: the page's data-proxy-domain attribute, raw; an
   *  unrendered {{placeholder}} is judged by hosts.ts). Absent or null = none: no address is built. A terminal never
   *  discovers it (no page to read). */
  readonly proxyDomain?: string | null;
  /** The Hub route the page shows, as its hash (web: location.hash, e.g. '#/keys/new'). Absent or null where the host
   *  has no address bar (a terminal): errors.ts then names no page unless the caller passes one. */
  readonly pageRoute?: string | null;
  /** The IndexedDB factory local-wipe.ts lists and deletes databases with (web: globalThis.indexedDB); absent or null
   *  where the host has none (a terminal keeps no database). */
  readonly idbFactory?: IDBFactory | null;
  /** Cache Storage (web: globalThis.caches); absent or null where the host has none. */
  readonly cacheStorage?: CacheStorage | null;
  /** The page's native alerts; absent or null where the host has none (a terminal): alerts read as unsupported. */
  readonly alertHost?: AlertHost | null;
  /** True only where the Hub may start its own module workers (web: a Worker constructor exists). A worker's network
   *  calls bypass transport() (upload.worker.ts uses the native fetch), so a host whose every request must pass its
   *  transport (a terminal live mount) leaves this absent: uploads then stay on the page engine. */
  readonly workers?: boolean;
}

const noop = (): void => {};

function areaOf(e: StorageEvent): 'local' | 'session' {
  try { if (e.storageArea && e.storageArea === globalThis.sessionStorage) return 'session'; } catch { /* storage blocked */ }
  return 'local';
}

let idb: { factory: IDBFactory; vault: Vault } | null = null;

/** The browser path: each member reads its global at the call. */
export const webHostEnv: HostEnv = {
  get local() { return (globalThis.localStorage as KeyValueStore | undefined) ?? null; },
  get session() { return (globalThis.sessionStorage as KeyValueStore | undefined) ?? null; },
  get vault() {
    const factory = globalThis.indexedDB as IDBFactory | undefined;
    if (!factory) return null;
    if (!idb || idb.factory !== factory) idb = { factory, vault: idbVault(factory) };
    return idb.vault;
  },
  get locks() { return ((globalThis.navigator as { locks?: HostLocks } | undefined)?.locks) ?? null; },
  get webSocket() { return (globalThis.WebSocket as HostWebSocket | undefined) ?? null; },
  get browserPage() { return typeof window !== 'undefined'; },
  get secureContext() { return (globalThis as { isSecureContext?: unknown }).isSecureContext === true; },
  get pageAddress() {
    if (typeof window === 'undefined') return null;
    const { origin, pathname, search } = window.location;
    return { origin, pathname, search };
  },
  get proxyDomain() {
    try { return (globalThis.document && document.documentElement && document.documentElement.getAttribute('data-proxy-domain')) || null; } catch { return null; }
  },
  get pageRoute() {
    try { return typeof window === 'undefined' ? null : window.location.hash; } catch { return null; }
  },
  get idbFactory() { return (globalThis.indexedDB as IDBFactory | undefined) ?? null; },
  get cacheStorage() { return (globalThis as { caches?: CacheStorage }).caches ?? null; },
  get alertHost() { return typeof window === 'undefined' ? null : webAlertHost; },
  get workers() { return typeof Worker === 'function'; },
  openExternal(url) {
    if (typeof window === 'undefined' || !/^https?:\/\//i.test(url)) return false;
    try { window.open(url, '_blank', 'noopener,noreferrer'); return true; } catch { return false; }
  },
  onExternalChange(cb) {
    if (typeof window === 'undefined') return noop;
    const on = (e: StorageEvent) => { cb(areaOf(e), e.key); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  },
  visible() {
    return document.visibilityState !== 'hidden';
  },
  onVisibilityChange(cb) {
    const on = () => { cb(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  },
  onLifecycle(type, cb) {
    if (typeof window === 'undefined') return noop;
    const on = (e: Event) => {
      if (type === 'beforeunload') {
        cb({ type, preventDefault: () => e.preventDefault(), setReturnValue: (v: string) => { (e as BeforeUnloadEvent).returnValue = v; } } as never);
      } else if (type === 'pageshow' || type === 'pagehide') {
        cb({ type, persisted: (e as PageTransitionEvent).persisted } as never);
      } else {
        cb({ type } as never);
      }
    };
    window.addEventListener(type, on);
    return () => window.removeEventListener(type, on);
  },
  channel(name) {
    if (typeof BroadcastChannel === 'undefined') return null;
    const bc = new BroadcastChannel(name);
    (bc as unknown as { unref?: () => void }).unref?.(); // Node's channel (tests): an open one never keeps the runner alive
    return {
      post: (m) => { bc.postMessage(m); },
      onMessage(cb) {
        const on = (e: MessageEvent) => { cb(e.data); };
        bc.addEventListener('message', on);
        return () => bc.removeEventListener('message', on);
      },
      close: () => { bc.close(); },
    };
  },
};

/** The browser's alerts: each member reads its global at the call (as alerts.ts did before it read them here). */
const webAlertHost: AlertHost = {
  facts() {
    const nav = window.navigator;
    let standalone = false;
    try {
      standalone = (nav as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      standalone = false;
    }
    return {
      hasNotification: typeof window.Notification === 'function',
      permission: typeof window.Notification === 'function' ? window.Notification.permission : undefined,
      secure: window.isSecureContext !== false,
      ua: nav.userAgent,
      platform: nav.platform,
      touch: nav.maxTouchPoints,
      standalone,
    };
  },
  get Notification() { return window.Notification; },
  textDir() { const root = window.document.documentElement; return { lang: root.lang, dir: root.dir }; },
  focus() { window.focus(); },
  workerRegistration() { return Promise.resolve(window.navigator.serviceWorker?.getRegistration()); },
  away() {
    try {
      return document.hidden || !document.hasFocus();
    } catch {
      return false;
    }
  },
};

let resolved: HostEnv | null = null;
let installed: HostEnv | null = null;

// A registration made before the env resolved: what was asked, and the real unsubscribe once it is attached.
interface Group { onError?: (e: unknown) => void }
interface Held { attach(env: HostEnv): () => void; off: (() => void) | null; dropped: boolean; group: Group | null }
let held: Held[] = [];
let group: Group | null = null;

function resolve(): HostEnv {
  if (resolved) return resolved;
  resolved = installed ?? webHostEnv;
  const todo = held;
  held = [];
  const failed = new Set<Group>();
  let first: { e: unknown } | null = null;
  for (const h of todo) {
    if (h.dropped) continue;
    if (h.group && failed.has(h.group)) { h.dropped = true; continue; }
    try {
      const off = h.attach(resolved);
      if (h.dropped) off(); // it unsubscribed while it was attaching
      else h.off = off;
    } catch (e) {
      h.dropped = true;
      if (h.group) failed.add(h.group);
      if (h.group?.onError) {
        try { h.group.onError(e); } catch (e2) { if (!first) first = { e: e2 }; } // a handler's own fault is unhandled: the others still attach
      } else if (!first) first = { e };
    }
  }
  if (first) throw first.e;
  return resolved;
}

/** Registers now when the env is resolved, else holds the registration for the resolve. The returned function unsubscribes either way. */
function register(attach: (env: HostEnv) => () => void): () => void {
  if (resolved) return attach(resolved);
  const h: Held = { attach, off: null, dropped: false, group };
  held.push(h);
  return () => {
    if (h.dropped) return;
    h.dropped = true;
    const off = h.off;
    h.off = null;
    if (off) off();
    else held = held.filter((x) => x !== h);
  };
}

/** Registrations made inside fn are one group (a caller's single try): while they are held, the first to fail to attach
 *  skips the rest of the group, and `onError` (the caller's own catch) takes that error instead of the resolver. A
 *  registration made once the env is resolved attaches at once and throws into the caller's try, so needs neither. */
export function registrationGroup<T>(fn: () => T, onError?: (e: unknown) => void): T {
  const prev = group;
  group = { onError };
  try { return fn(); } finally { group = prev; }
}

// The load window closes when the task that evaluated this module ends: a host installs before that (its pre-install is
// the first import), and a web page with none gets the browser path with nothing missed in between.
if (typeof queueMicrotask === 'function') queueMicrotask(() => { resolve(); });

/** The process's one env. Call before anything reads it; a second call, or one after the env resolved, throws. */
export function installHostEnv(env: HostEnv): void {
  if (resolved || installed) throw new Error('HOST_ENV_ALREADY_RESOLVED');
  installed = env;
  resolve();
}

/** Resolves the env now: registrations still held for the load window attach here. A failure of one is thrown from this
 *  call, as from any call that resolves the env. A caller that must not miss an event from the moment it subscribes calls it
 *  right after registering (script-asks). */
export function settleHostEnv(): void { resolve(); }

/** Tests only: drop the installed env and the held registrations (not attached). Leaves the env resolved to the browser
 *  path, as a page is after its load window; `unresolved` leaves it open instead, to test the load window itself. */
export function resetHostEnvForTests(o: { unresolved?: boolean } = {}): void {
  resolved = null;
  installed = null;
  held = [];
  group = null;
  if (!o.unresolved) resolve();
}

// The face core calls. Its members resolve the env on first use; registrations are held until then.
const face: HostEnv = {
  get local() { return resolve().local; },
  get session() { return resolve().session; },
  get vault() { return resolve().vault; },
  get locks() { return resolve().locks; },
  get webSocket() { return resolve().webSocket ?? null; },
  get pageAddress() { return resolve().pageAddress ?? null; },
  get browserPage() { return resolve().browserPage === true; },
  get clipboard() { return resolve().clipboard ?? null; },
  get files() { return resolve().files ?? null; },
  get passcodeLock() { return resolve().passcodeLock; },
  get secureContext() { return resolve().secureContext === true; },
  get proxyDomain() { return resolve().proxyDomain ?? null; },
  get pageRoute() { return resolve().pageRoute ?? null; },
  get idbFactory() { return resolve().idbFactory ?? null; },
  get cacheStorage() { return resolve().cacheStorage ?? null; },
  get alertHost() { return resolve().alertHost ?? null; },
  get workers() { return resolve().workers === true; },
  // The opener is read ONCE, here: a handle kept by mount A calls A's bound opener, never the one the env serves later
  get openExternal() { const env = resolve(); const f = env.openExternal; return f ? (url: string) => f.call(env, url) : undefined; },
  visible: () => resolve().visible(),
  onExternalChange: (cb) => register((env) => env.onExternalChange(cb)),
  onVisibilityChange: (cb) => register((env) => env.onVisibilityChange(cb)),
  onLifecycle: (type, cb) => register((env) => env.onLifecycle(type, cb)),
  channel: (name) => (resolved ? resolved.channel(name) : deferredChannel(name)),
};

/** A channel asked for before the env resolved: its subscriptions are registrations (held until the env resolves), the
 *  real channel is opened from the resolved env on the first subscription or post, and close() before that cancels
 *  them without opening one. Where the env has no channel it does nothing (a resolved env answers null at once). */
function deferredChannel(name: string): HostChannel {
  let real: HostChannel | null | undefined;
  let closed = false;
  const subs = new Set<() => void>();
  const open = (): HostChannel | null => {
    if (real === undefined && !closed) resolve(); // flushing the held subscriptions opens it through here
    if (real === undefined) real = closed ? null : resolve().channel(name);
    return real;
  };
  return {
    post(m) { if (!closed) open()?.post(m); },
    onMessage(cb) {
      if (closed) return noop;
      const off = register(() => open()?.onMessage(cb) ?? noop);
      const once = () => { subs.delete(once); off(); };
      subs.add(once);
      return once;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const off of [...subs]) off();
      subs.clear();
      if (real) real.close();
      real = null;
    },
  };
}

export function hostEnv(): HostEnv {
  return face;
}

/** localStorage, or a throw where the host has none (a caller's own try treats it as storage unavailable, as the missing global did). */
export function localStore(): KeyValueStore {
  const s = face.local;
  if (!s) throw new Error('STORAGE_UNAVAILABLE');
  return s;
}

/** sessionStorage, or a throw where the host has none. */
export function sessionStore(): KeyValueStore {
  const s = face.session;
  if (!s) throw new Error('STORAGE_UNAVAILABLE');
  return s;
}
