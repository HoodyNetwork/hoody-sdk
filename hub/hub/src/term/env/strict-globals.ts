// strict-globals.ts: the terminal process's browser globals. It defines exactly the three values the router needs
// (window.origin, self.__TSR_ROUTER__, scrollTo as a no-op); every other DOM global, and every other member of
// window or self, is a getter that records {name, stack} in the ledger and throws TermGlobalError, constructors
// included. Every trap also goes to the process's
// trap journal (below), which clear() and a re-install never empty. The term test preload fails each test that recorded
// a trap it did not declare with expectTraps(), so a touch is caught even when the code that made it swallowed the
// throw: storage or document use never degrades silently in the terminal.
//
// Nothing the reading code chose is stored: a trap is recorded under a fixed label, a
// STRICT_GLOBALS name or `window.<one of them>`, else `window.*` / `self.*` (a lookup like window["TOKEN_…"] keeps no
// trace of its key), and its stack is taken from a fixed message. The same label is the thrown error's. The journal is
// drained at each test teardown once judged, and bounded (JOURNAL_MAX rows, then counted: a full journal is itself an
// undeclared trap); a mount's ledger is bounded the same way.
//
// Runtime globals the terminal really has (timers, URL, TextEncoder, crypto, Event/EventTarget/AbortSignal,
// DOMException, MessageChannel, performance) are not DOM globals and stay as they are.

export class TermGlobalError extends Error {
  constructor(readonly global: string) {
    super('TERM_GLOBAL: ' + global + ' is not available in the terminal Hub');
    this.name = 'TermGlobalError';
  }
}

export interface LedgerRow { readonly name: string; readonly stack: string }

export interface StrictGlobals {
  ledger(): readonly LedgerRow[];
  /** Empties the ledger; the traps stay. */
  clear(): void;
  /** Puts every global back as it was before install. */
  restore(): void;
  /** Called on every trap as it is recorded (a mount fails on the first one); returns the undo. */
  onTrap(listener: (row: LedgerRow) => void): () => void;
}

/** The DOM globals trapped on globalThis (window and self are trapped member by member, see below). */
export const STRICT_GLOBALS: readonly string[] = Object.freeze([
  'document', 'localStorage', 'sessionStorage', 'indexedDB', 'IDBKeyRange', 'navigator', 'BroadcastChannel',
  'StorageEvent', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'location', 'history', 'matchMedia',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'getComputedStyle', 'getSelection',
  'innerWidth', 'innerHeight', 'devicePixelRatio', 'screen', 'visualViewport', 'parent', 'top', 'opener', 'frames',
  'postMessage', 'open', 'close', 'alert', 'confirm', 'prompt', 'print', 'Notification', 'caches', 'customElements',
  'CSS', 'Image', 'HTMLElement', 'Element', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
  'onbeforeunload', 'onpageshow', 'onpagehide', 'onstorage', 'onvisibilitychange',
]);

// No allowances: every library probe of a browser global (TanStack router/history, query-core, use-sync-external-store,
// react-stately, OpenTUI's worker check) is answered at LOAD time by src/term/env/strict-probes.ts (loader and ship
// bundler), so any read that reaches a trap here is a real use and fails the mount. A new probe gets a rule there,
// never a pass here.

/** What window.origin reports: an opaque origin, never a host (the terminal has no page origin). */
const ORIGIN = 'null';

let installed = false;
let active: StrictGlobals | null = null;

/** The label a trap is recorded and thrown under: fixed vocabulary only. */
export function trapLabelOf(label: 'window' | 'self' | null, key: string): string {
  if (label === null) return STRICT_GLOBALS.includes(key) ? key : 'global';
  return STRICT_GLOBALS.includes(key) ? `${label}.${key}` : `${label}.*`;
}

/** Rows a journal or a ledger keeps; past it traps are only counted. */
export const JOURNAL_MAX = 1000;

// The trap journal: the traps of every install in this process not yet judged, in order. Not emptied by clear() or
// restore(); drained by trapTeardown once its verdict is given. `base` counts rows drained, `lost` rows past the bound.
const journal: LedgerRow[] = [];
let base = 0;
let lost = 0;
let lostAtMark = 0;
let expected: Set<string> | '*' = new Set();

/** Where the journal stands now (the test preload marks it before each test). */
export function trapJournalMark(): number { lostAtMark = lost; return base + journal.length; }
/** Rows the journal holds now (tests of the bound and the drain). */
export function trapJournalSize(): number { return journal.length; }
/** Declares traps the running test makes on purpose: global names (as recorded: 'document', 'window.localStorage'), or
 *  '*' for a test of the traps themselves. Forgotten at the next mark (resetExpectedTraps). */
export function expectTraps(...names: string[]): void {
  if (names.includes('*')) { expected = '*'; return; }
  if (expected !== '*') for (const n of names) expected.add(n);
}
export function resetExpectedTraps(): void { expected = new Set(); }

/** The verdict a test teardown gives (the term test preload throws it): the undeclared traps since `mark`, or null. */
export function undeclaredTrapError(mark: number): Error | null {
  const extra = unexpectedTrapsSince(mark);
  if (!extra.length) return null;
  const where = (s: string) => s.split('\n').slice(1).find((l) => /\/src\//.test(l) && !/strict-globals\.ts/.test(l))?.trim() ?? '(no source frame)';
  return new Error(`TERM_TRAP_UNDECLARED: ${extra.length} strict-global trap(s) in this test, caught or not: ` +
    extra.slice(0, 5).map((r) => `${r.name} ${where(r.stack)}`).join('; ') + '. Route the read to its owner (hostEnv()), or expectTraps() in a test that traps on purpose.');
}

// The enforcement's own test (trap-journal.term.test.ts): one teardown keeps its verdict instead of throwing it.
let probing = false;
let lastVerdict: Error | null | undefined;
/** The next teardown stores its verdict (verdictOfProbe) instead of failing the test. Tests of the enforcement only. */
export function probeTrapVerdict(): void { probing = true; lastVerdict = undefined; }
export function verdictOfProbe(): Error | null | undefined { return lastVerdict; }
/** The teardown the term test preload runs after every test. */
export function trapTeardown(mark: number): void {
  const err = undeclaredTrapError(mark);
  resetExpectedTraps();
  // Judged: the rows go (a later test marks after them anyway), so the journal never grows across a run.
  base += journal.length;
  journal.length = 0;
  lostAtMark = lost;
  if (probing) { probing = false; lastVerdict = err; return; }
  if (err) throw err;
}
/** Whether the term test preload enforces (it sets this when it registers the teardown). */
export let trapTeardownRegistered = false;
export function markTrapTeardownRegistered(): void { trapTeardownRegistered = true; }
/** Traps recorded since `mark` that the running test did not declare. */
export function unexpectedTrapsSince(mark: number): LedgerRow[] {
  const e = expected;
  const out = journal.slice(Math.max(0, mark - base)).filter((r) => e !== '*' && !e.has(r.name)).map((r) => ({ ...r }));
  // Traps past the bound were counted, not kept: they are undeclared unless the test declared '*'.
  if (lost > lostAtMark && e !== '*') out.push({ name: 'journal-full', stack: '' });
  return out;
}

/** The strict globals installed in this process (by install-strict.ts, a runner or the lifecycle), or null. */
export function activeStrictGlobals(): StrictGlobals | null {
  return active;
}

/** Every forbidden global records and throws, constructors included, in the terminal process and in tests alike (the
 *  old `harness` mode, where a constructor read as absent, is gone: render.ts loads preinstall first). */
export function installStrictGlobals(): StrictGlobals {
  if (installed) throw new Error('STRICT_GLOBALS_INSTALLED');
  installed = true;
  const rows: LedgerRow[] = [];
  let restored = false;
  const g = globalThis as Record<string, unknown>;
  const listeners = new Set<(row: LedgerRow) => void>();
  const record = (name: string): void => {
    // A fixed message: the stack's first line never carries a name the reader chose.
    const row = Object.freeze({ name, stack: new Error('TERM_GLOBAL').stack ?? '' });
    if (rows.length < JOURNAL_MAX) rows.push(row);
    if (journal.length < JOURNAL_MAX) journal.push(row); else lost++;
    // A listener's own failure never turns into the trap's: the trap still throws TermGlobalError below.
    for (const l of [...listeners]) { try { l({ ...row }); } catch { /* the listener's problem */ } }
  };
  const trap = (name: string): never => {
    record(name);
    throw new TermGlobalError(name);
  };

  const saved = new Map<string, PropertyDescriptor | undefined>();
  const define = (name: string, d: PropertyDescriptor) => {
    if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, enumerable: false, ...d });
  };

  for (const name of STRICT_GLOBALS) {
    define(name, {
      get: () => trap(name),
      set: () => { trap(name); },
    });
  }

  // window and self share one target: origin and __TSR_ROUTER__ are real, symbols pass (inspection), the rest traps.
  const target: Record<string, unknown> = { origin: ORIGIN, __TSR_ROUTER__: undefined };
  const face = (label: 'window' | 'self') => new Proxy(target, {
    get(t, k) {
      if (typeof k === 'symbol' || k === 'origin' || k === '__TSR_ROUTER__') return t[k as string];
      return trap(trapLabelOf(label, k));
    },
    set(t, k, v) {
      if (k === '__TSR_ROUTER__') { t[k] = v; return true; }
      return trap(trapLabelOf(label, String(k)));
    },
  });
  define('window', { value: face('window'), writable: false });
  define('self', { value: face('self'), writable: false });
  define('scrollTo', { value: (): void => {}, writable: false });

  const handle: StrictGlobals = {
    ledger: () => rows.map((r) => ({ ...r })),
    clear: () => { rows.length = 0; },
    onTrap(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    restore() {
      if (restored) return;
      restored = true;
      for (const [name, d] of saved) {
        if (d) Object.defineProperty(globalThis, name, d);
        else delete g[name];
      }
      saved.clear();
      listeners.clear();
      installed = false;
      if (active === handle) active = null;
    },
  };
  active = handle;
  return handle;
}
