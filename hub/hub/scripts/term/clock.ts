// A frozen clock for golden frames: "in 3 minutes", "Today 16:54" and log times must not change from run to run.
// Date.now() and `new Date()` answer one fixed instant; timers keep running on the real clock (setTimeout), and the
// runners measure their own waits with performance.now. Call before the Hub's modules read the time.
const Real = Date;

/** The instant golden frames are drawn at (a weekday morning, UTC). */
export const GOLDEN_NOW = Date.UTC(2026, 10, 11, 9, 0, 0);

let frozen = false;
// Who keeps the fixture clock: `pinned` = a runner process or a test file that froze it for good (freezeClock,
// seedRandom, fixtureClock; a test file gives it back with thawClock in its afterAll); `holds` = open renderPage
// sessions (holdFixtureClock). The real clock and randomness come back when neither keeps them: a test file that drew
// a page must not leave the next file of the same bun process on a frozen Date.now (timing tests read 0 ms) or on a
// seeded randomUUID.
let pinned = false;
let holds = 0;
let savedTz: string | undefined;
function installClock(at: number): void {
  if (frozen) return;
  frozen = true;
  savedTz = process.env.TZ;
  process.env.TZ = 'UTC';
  // A Proxy of the real constructor: `new Date()` and `Date()` (the call form, a string) answer `at`; any argument is
  // passed through; Date.now() is `at`; instanceof, Date.UTC/parse and the prototype stay the real ones.
  const FrozenDate: DateConstructor = new Proxy(Real, {
    construct: (T, a: unknown[], nt): object => Reflect.construct(T, a.length === 0 ? [at] : a, nt === FrozenDate ? T : nt),
    apply: () => new Real(at).toString(),
    get: (T, k, r) => (k === 'now' ? () => at : Reflect.get(T, k, r)),
  });
  (globalThis as { Date: DateConstructor }).Date = FrozenDate;
}
export function freezeClock(at = GOLDEN_NOW): void {
  pinned = true;
  installClock(at);
}

/** The fixture clock and seeded randomness for one renderPage session; the returned release gives them back when no
 *  other session holds them and nothing pinned them. Releasing twice is a no-op. */
export function holdFixtureClock(): () => void {
  installClock(GOLDEN_NOW);
  installRandom();
  holds++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds--;
    if (holds === 0 && !pinned) restoreReal();
  };
}

/** A test file that pinned the clock (freezeClock, fixtureClock) gives it back: in its afterAll. Sessions still open
 *  keep it until they close. */
export function thawClock(): void {
  pinned = false;
  if (holds === 0) restoreReal();
}

function restoreReal(): void {
  if (frozen) {
    frozen = false;
    (globalThis as { Date: DateConstructor }).Date = Real;
    if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;
  }
  if (seeded) {
    seeded = false;
    Math.random = realRandom;
    const c = globalThis.crypto as unknown as Record<string, unknown>;
    for (const [k, d] of realCrypto) { if (d) Object.defineProperty(c, k, d); else delete c[k]; }
  }
}

/** Whether this process draws on the fixture clock (freezeClock ran). */
export const clockFrozen = (): boolean => frozen;

/**
 * THE fixture clock of every runner that draws fixture frames (render.ts renderPage: goldens, the render CLI, tests;
 * dev.ts: the shots via termshot): one frozen instant (GOLDEN_NOW, UTC) for Date and Intl, and seeded randomness.
 * Relative times and day groups ("Yesterday", "20 days ago") then draw the same at any real time
 * (fixture-clock.term.test.ts). Idempotent. performance.now stays real: the Hub uses it for durations only.
 */
export function fixtureClock(): void {
  freezeClock();
  seedRandom();
}

// Seeded randomness for golden frames: a generated name ("gentle-amber-gecko"), a picked colour or a random id must
// draw the same in every run. Math.random, crypto.getRandomValues and crypto.randomUUID answer from a PRNG reseeded at
// the start of each case (reseedRandom, called by render.ts), so a case's frames do not depend on the cases before it.
// Golden runs only (fixture data): never installed in a shipped process.
let seeded = false;
let state = 0;
const SEED = 0x9e3779b9;
const next32 = (): number => {
  // xorshift32
  state ^= state << 13; state >>>= 0;
  state ^= state >>> 17;
  state ^= state << 5; state >>>= 0;
  return state;
};
const realRandom = Math.random;
const realCrypto: [string, PropertyDescriptor | undefined][] = ['getRandomValues', 'randomUUID'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis.crypto, k)]);
export function seedRandom(): void {
  pinned = true;
  installRandom();
}
function installRandom(): void {
  if (seeded) return;
  seeded = true;
  state = SEED;
  Math.random = () => next32() / 0x100000000;
  const c = globalThis.crypto as Crypto;
  const fill = <T extends ArrayBufferView | null>(a: T): T => {
    if (a) { const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < b.length; i++) b[i] = next32() & 0xff; }
    return a;
  };
  Object.defineProperty(c, 'getRandomValues', { value: fill, configurable: true, writable: true });
  Object.defineProperty(c, 'randomUUID', {
    configurable: true, writable: true,
    value: () => {
      const b = fill(new Uint8Array(16));
      b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
      const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
  });
}
/** Restarts the sequence (each case). A no-op unless seedRandom ran. */
export function reseedRandom(): void { if (seeded) state = SEED; }
