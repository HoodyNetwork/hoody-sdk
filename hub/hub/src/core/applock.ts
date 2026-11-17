// applock.ts: the Hub passcode engine. A lock on this browser, per tab.
//
// Contract:
//   - Lock state lives only in this tab's memory: `locked`, mirrored by the lock host on body[data-hub-locked], and a
//     local counter `tabGen` that every lock moves. Nothing about it is stored or read from another tab. Only a
//     right passcode typed in THIS tab unlocks it (checkPasscode), and only if no lock of this tab happened since the
//     submit, the tab is visible and it still holds its session.
//   - Shared pieces: the record `hub_lock:<uid>` (verifier + wrong-try count; account sessions only), read-modify-
//     written only inside a `hub-lock:<uid>` Web Lock hold; and the lock-only broadcast (shared.js postHubLock), on
//     which a receiving tab of the same uid can only lock.
//   - writeRecordChecked() is the ONLY setItem of `hub_lock:<uid>`: no write onto an absent record unless creating,
//     a read-back, then a session re-check that deletes its own write when the session is gone. The only other
//     removals are removePasscode() (in a verified hold) and shared.js forgetBrowser(). applock.test.ts enumerates
//     every call site.
//   - Verification runs steps 1-5 in ONE hold; anything terminal is only recorded there and runs after
//     release. CANCEL (every lock of this tab, and the host's hide/pagehide/freeze through cancelPending) aborts a
//     queued request through its AbortSignal and races the derivation of a granted one, which then refunds its try.
//   - The page lock starts at boot when a record (valid or not) exists (bootGate), before the first render; the boot
//     fold (step 1) runs in the background. Token sessions have no passcode: the engine stays inert.
//   - DOM-free: the host (core/applock-host.ts) wires events and the body attribute through onLockChange.
import { useSyncExternalStore } from 'react';
import { page } from './ctx';
import { forgetHere } from './lifecycle';
import { holds, shared } from './session';
import { hostEnv } from './host-env';

export const LOCK_PREFIX = 'hub_lock:';
export const LOCK_NOW_PREFIX = 'hub_lock_now:';
export const LOCK_CHANNEL = 'hub-lock';
export const ITER_DEFAULT = 600_000;
export const ITER_MIN = 600_000;
export const ITER_MAX = 2_000_000;
export const IDLE_CHOICES = [1, 5, 15, 60] as const;
export const MAX_TRIES = 10;
/** A derivation slower than this counts as a crypto error (verification step 4). */
export const DERIVE_TIMEOUT_MS = 8_000;
/** The idle clock waits at most this much longer while a Board frame holds focus. */
export const FRAME_GRACE_MS = 15 * 60_000;
const lockName = (uid: string): string => 'hub-lock:' + uid;
const keyOf = (uid: string): string => LOCK_PREFIX + uid;

export type IdleMin = (typeof IDLE_CHOICES)[number];
export interface Tries {
  readonly n: number;
  readonly until: number;
  readonly pending: null | { readonly id: string; readonly at: number };
  readonly out: boolean;
}
export interface LockRecord {
  readonly v: 1;
  readonly kdf: 'pbkdf2-sha256';
  readonly iter: number;
  readonly salt: string;
  readonly hash: string;
  readonly rev: string;
  readonly digits: boolean;
  readonly idleMin: IdleMin;
  readonly onLeave: boolean;
  readonly tries: Tries;
}

type LocksLike = {
  request: (name: string, o: { mode: 'exclusive'; signal?: AbortSignal }, cb: () => unknown) => Promise<unknown>;
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What the engine reads from the browser and the rest of core; tests replace pieces with configureAppLock. */
export interface LockEnv {
  storage(): StorageLike | null;
  locks(): LocksLike | null;
  subtle(): SubtleCrypto | null;
  random(n: number): Uint8Array;
  /** Wall clock (ms): try waits are shared between tabs. */
  now(): number;
  /** This tab's monotonic clock (ms): idle. */
  mono(): number;
  /** The page's account uid; null for a token session or no session (no passcode then). */
  uid(): string | null;
  /** Storage still holds this page's session (holds(): same uid and sid). */
  sessionOk(): boolean;
  visible(): boolean;
  /** The lock-only broadcast (shared.js postHubLock). */
  post(uid: string): void;
  /** Subscribe to lock messages: channel data, and storage events (key, newValue). */
  listen(onData: (data: unknown) => void, onStorage: (key: string | null, value: string | null) => void): () => void;
  /** The terminal path: Forget this browser without a confirm (default: lifecycle forgetHere({ terminal: true })). */
  terminal(): void;
  timer(fn: () => void, ms: number): () => void;
}

function globalLocks(): LocksLike | null {
  try {
    // The host's lock manager (web: navigator.locks; terminal: the session's), never the global itself.
    const l = hostEnv().locks as LocksLike | null;
    return l && typeof l.request === 'function' ? l : null;
  } catch {
    return null;
  }
}

function accountPage(): { uid: string } | null {
  const p = page();
  return p && p.kind === 'account' ? p : null;
}

const defaultEnv: LockEnv = {
  storage: () => { try { return hostEnv().local; } catch { return null; } },
  locks: globalLocks,
  subtle: () => { try { return globalThis.crypto?.subtle ?? null; } catch { return null; } },
  random: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  now: () => Date.now(),
  mono: () => globalThis.performance.now(),
  uid: () => accountPage()?.uid ?? null,
  sessionOk: () => { const p = page(); return !!p && p.kind === 'account' && holds(p); },
  visible: () => { try { return globalThis.document?.visibilityState !== 'hidden'; } catch { return true; } },
  post: (uid) => { try { shared().postHubLock?.(uid); } catch { /* best effort */ } },
  listen: (onData, onStorage) => {
    let ch: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel === 'function') {
        ch = new BroadcastChannel(LOCK_CHANNEL);
        ch.onmessage = (e) => onData(e.data);
      }
    } catch { ch = null; }
    const st = (e: StorageEvent): void => onStorage(e.key, e.newValue);
    try { globalThis.addEventListener?.('storage', st); } catch { /* no storage events */ }
    return () => {
      try { ch?.close(); } catch { /* closed */ }
      try { globalThis.removeEventListener?.('storage', st); } catch { /* gone */ }
    };
  },
  terminal: () => { forgetHere({ terminal: true }); },
  timer: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
};

let env: LockEnv = defaultEnv;

/** Wire the engine (the lock host, the terminal) or replace pieces in tests. */
export function configureAppLock(e: Partial<LockEnv>): void {
  env = { ...env, ...e };
}

// ── Record ────────────────────────────────────────────────

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function b64Bytes(s: unknown, n: number): boolean {
  if (typeof s !== 'string' || !B64.test(s) || s.length % 4 !== 0) return false;
  try { return atob(s).length === n; } catch { return false; }
}
const toB64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
function fromB64(s: string): Uint8Array {
  const t = atob(s);
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}
function exactKeys(o: object, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
}
const RECORD_KEYS = ['v', 'kdf', 'iter', 'salt', 'hash', 'rev', 'digits', 'idleMin', 'onLeave', 'tries'] as const;
const TRIES_KEYS = ['n', 'until', 'pending', 'out'] as const;

/** The strict record schema: anything else is malformed. */
export function validRecord(x: unknown): x is LockRecord {
  if (!x || typeof x !== 'object' || Array.isArray(x) || !exactKeys(x, RECORD_KEYS)) return false;
  const r = x as Record<string, unknown>;
  if (r.v !== 1 || r.kdf !== 'pbkdf2-sha256') return false;
  if (!Number.isInteger(r.iter) || (r.iter as number) < ITER_MIN || (r.iter as number) > ITER_MAX) return false;
  if (!b64Bytes(r.salt, 16) || !b64Bytes(r.hash, 32) || !b64Bytes(r.rev, 8)) return false;
  if (typeof r.digits !== 'boolean' || typeof r.onLeave !== 'boolean') return false;
  if (!(IDLE_CHOICES as readonly unknown[]).includes(r.idleMin)) return false;
  const t = r.tries;
  if (!t || typeof t !== 'object' || Array.isArray(t) || !exactKeys(t, TRIES_KEYS)) return false;
  const tr = t as Record<string, unknown>;
  if (!Number.isInteger(tr.n) || (tr.n as number) < 0 || (tr.n as number) > MAX_TRIES) return false;
  if (typeof tr.until !== 'number' || !Number.isFinite(tr.until) || typeof tr.out !== 'boolean') return false;
  const p = tr.pending;
  if (p === null) return true;
  if (!p || typeof p !== 'object' || Array.isArray(p) || !exactKeys(p, ['id', 'at'])) return false;
  const pp = p as Record<string, unknown>;
  return typeof pp.id === 'string' && pp.id.length > 0 && pp.id.length <= 64 && typeof pp.at === 'number' && Number.isFinite(pp.at);
}

export type RecordRead = { state: 'none' } | { state: 'malformed' } | { state: 'valid'; rec: LockRecord };

/** The stored record of `uid`. Unreadable storage counts as malformed (fail closed: lock screen, Forget only). */
export function readRecord(uid: string): RecordRead {
  let raw: string | null;
  try {
    const s = env.storage();
    if (!s) return { state: 'malformed' };
    raw = s.getItem(keyOf(uid));
  } catch {
    return { state: 'malformed' };
  }
  if (raw === null) return { state: 'none' };
  try {
    const rec: unknown = JSON.parse(raw);
    return validRecord(rec) ? { state: 'valid', rec } : { state: 'malformed' };
  } catch {
    return { state: 'malformed' };
  }
}

export type WriteAnswer = 'ok' | 'gone' | 'failed';

/**
 * The only writer of `hub_lock:<uid>`. Call it inside a `hub-lock:<uid>` hold.
 *   1. Read the record. Absent and not `create` → 'gone' (a Forget or a Remove deleted it; nothing recreates it).
 *      Present but malformed → 'failed' (never overwritten).
 *   2. One setItem of the complete record build(current) (null → 'failed', nothing written), read back, validated.
 *   3. Storage no longer holds this page's session → delete the record if it is still byte-identical to what step
 *      2 wrote, and answer 'gone'.
 *   4. 'ok'.
 */
export function writeRecordChecked(uid: string, build: (cur: LockRecord | null) => LockRecord | null, o: { create?: boolean } = {}): WriteAnswer {
  const s = env.storage();
  if (!s) return 'failed';
  const key = keyOf(uid);
  let cur: LockRecord | null = null;
  try {
    const raw = s.getItem(key);
    if (raw === null) {
      if (!o.create) return 'gone';
    } else {
      const parsed: unknown = JSON.parse(raw);
      if (!validRecord(parsed)) return 'failed';
      cur = parsed;
    }
  } catch {
    return 'failed';
  }
  const next = build(cur);
  if (!next || !validRecord(next)) return 'failed';
  const text = JSON.stringify(next);
  try {
    s.setItem(key, text);
    const back = s.getItem(key);
    if (back !== text || !validRecord(JSON.parse(back))) return 'failed';
  } catch {
    return 'failed';
  }
  if (!env.sessionOk()) {
    try { if (s.getItem(key) === text) s.removeItem(key); } catch { /* the next Forget removes it */ }
    return 'gone';
  }
  return 'ok';
}

/** The wait after the n-th wrong try; 10 is terminal. */
export function waitMs(n: number): number {
  if (n <= 4) return 0;
  if (n === 5) return 30_000;
  if (n === 6) return 60_000;
  if (n === 7) return 5 * 60_000;
  if (n === 8) return 15 * 60_000;
  return 60 * 60_000;
}

/** Fold an abandoned reservation as one wrong try with its wait; reservation 10 → `out`. */
function folded(cur: LockRecord): LockRecord {
  const p = cur.tries.pending;
  if (!p) return cur;
  const n = cur.tries.n;
  return { ...cur, tries: { n, pending: null, until: Math.max(cur.tries.until, p.at + waitMs(n)), out: cur.tries.out || n >= MAX_TRIES } };
}

// ── Passcode rules and the verifier ──────────────────────

export type PasscodeProblem = 'short' | 'long' | 'weak';

/** Passcode rules: 4-64 characters after NFKC; no single repeated character, no straight run of digits or letters. */
export function passcodeProblem(pass: string): PasscodeProblem | null {
  const chars = [...pass.normalize('NFKC')];
  if (chars.length < 4) return 'short';
  if (chars.length > 64) return 'long';
  if (chars.every((c) => c === chars[0])) return 'weak';
  const low = chars.map((c) => c.toLowerCase());
  const kind = (c: string): 'd' | 'l' | null => (/^[0-9]$/.test(c) ? 'd' : /^[a-z]$/.test(c) ? 'l' : null);
  const k0 = kind(low[0] as string);
  if (k0 && low.every((c) => kind(c) === k0)) {
    const codes = low.map((c) => c.charCodeAt(0));
    const step = (codes[1] as number) - (codes[0] as number);
    if ((step === 1 || step === -1) && codes.every((c, i) => i === 0 || c - (codes[i - 1] as number) === step)) return 'weak';
  }
  return null;
}

/** PBKDF2-HMAC-SHA-256 over the NFKC, UTF-8 passcode; 32 bytes. */
export async function deriveVerifier(pass: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const subtle = env.subtle();
  if (!subtle) throw new Error('no WebCrypto');
  const key = await subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: iter }, key, 256));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== 32 || b.length !== 32) return false;
  let d = 0;
  for (let i = 0; i < 32; i++) d |= (a[i] as number) ^ (b[i] as number);
  return d === 0;
}

/** The derivation raced against the 8 s cap and CANCEL. */
function deriveRaced(pass: string, rec: LockRecord, signal: AbortSignal): Promise<Uint8Array | 'timeout' | 'cancelled' | 'error'> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve('cancelled'); return; }
    let done = false;
    const finish = (r: Uint8Array | 'timeout' | 'cancelled' | 'error'): void => {
      if (done) return;
      done = true;
      stop();
      signal.removeEventListener('abort', onAbort);
      resolve(r);
    };
    const onAbort = (): void => finish('cancelled');
    const stop = env.timer(() => finish('timeout'), DERIVE_TIMEOUT_MS);
    signal.addEventListener('abort', onAbort);
    let salt: Uint8Array;
    try { salt = fromB64(rec.salt); } catch { finish('error'); return; }
    deriveVerifier(pass, salt, rec.iter).then((b) => finish(b), () => finish('error'));
  });
}

// ── This tab's lock ───────────────────────────────────────

let locked = false;
let tabGen = 0;
let removed = false;
let noLocks = false;
let lastInput = 0;
let version = 0;
let receiverStop: (() => void) | null = null;
const listeners = new Set<() => void>();
const cancels = new Set<AbortController>();

function notify(): void {
  version++;
  for (const l of [...listeners]) {
    try { l(); } catch { /* a listener never stops a lock */ }
  }
}

/** CANCEL: every verification or setup of this tab ends; a queued request is aborted. */
export function cancelPending(): void {
  const all = [...cancels];
  cancels.clear();
  for (const c of all) c.abort();
}

function newCancel(): AbortController {
  const c = new AbortController();
  cancels.add(c);
  return c;
}

function lockHere(): void {
  tabGen++;
  locked = true;
  cancelPending();
  notify();
}

function unlockHere(): void {
  locked = false;
  lastInput = env.mono();
  notify();
}

function hasRecord(uid: string): boolean {
  return readRecord(uid).state !== 'none';
}

/** Lock this tab when its account has a passcode here (a record, valid or not). True when it locked. */
export function lockTab(): boolean {
  const uid = env.uid();
  if (!uid || !hasRecord(uid)) return false;
  lockHere();
  return true;
}

/** Lock now: this tab synchronously, then the lock-only broadcast for every tab. */
export function lockNow(): boolean {
  const uid = env.uid();
  if (!lockTab() || !uid) return false;
  env.post(uid);
  return true;
}

/** The host's hide/pagehide/freeze: CANCEL always; lock when "Lock when I leave the app" is on (or the record is
 *  unreadable). */
export function leaveTab(): void {
  cancelPending();
  const uid = env.uid();
  if (!uid) return;
  const r = readRecord(uid);
  if (r.state === 'malformed' || (r.state === 'valid' && r.rec.onLeave)) lockHere();
}

/** Input in this tab (the host calls it on pointer, key and wheel input). */
export function noteInput(): void {
  lastInput = env.mono();
}

/** The idle rule: no input in this tab for idleMin, plus at most 15 minutes while a Board frame holds focus
 *  and the page is visible. True when it locked. */
export function checkIdle(o: { frameFocus?: boolean } = {}): boolean {
  const uid = env.uid();
  if (locked || !uid) return false;
  const r = readRecord(uid);
  if (r.state === 'none') return false;
  if (r.state === 'malformed') { lockHere(); return true; }
  const limit = r.rec.idleMin * 60_000 + (o.frameFocus && env.visible() ? FRAME_GRACE_MS : 0);
  if (env.mono() - lastInput < limit) return false;
  lockHere();
  return true;
}

/** The lock-message receiver: a message of this uid locks; it reads only `t` and `uid`. */
export function startLockReceiver(): () => void {
  receiverStop?.();
  const stop = env.listen(
    (data) => {
      if (!data || typeof data !== 'object') return;
      const d = data as { t?: unknown; uid?: unknown };
      const uid = env.uid();
      if (d.t === 'lock' && !!uid && d.uid === uid) lockTab();
    },
    (key, value) => {
      const uid = env.uid();
      if (uid && key === LOCK_NOW_PREFIX + uid && value !== null) lockTab();
      // This account's record changed in another tab (a wrong try's count and wait, out, removal), or the area was
      // cleared: the lock view re-reads it. Only a notification: the locked state is untouched.
      else if (uid && (key === null || key === LOCK_PREFIX + uid)) notify();
    },
  );
  receiverStop = stop;
  return () => { stop(); if (receiverStop === stop) receiverStop = null; };
}

export function isLocked(): boolean { return locked; }

/** Subscribe to lock/unlock (synchronous: the host sets the body attribute in the listener). */
export function onLockChange(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export interface LockView {
  readonly locked: boolean;
  /** The record of this account: 'malformed' means no verifier (Forget only). */
  readonly record: RecordRead['state'];
  /** The passcode was removed in another window since this tab locked: Reload. */
  readonly removed: boolean;
  /** A record exists but this browser has no Web Locks: Forget only. */
  readonly noWebLocks: boolean;
  /** The stored tries of a valid record (null otherwise): the screen shows a stored wait and a stored `out` (the
   *  terminal path ran and the page is still here: its Forget failed) without a check of its own first. */
  readonly tries: { readonly n: number; readonly until: number; readonly out: boolean } | null;
}

export function lockView(): LockView {
  const uid = env.uid();
  const r: RecordRead = uid ? readRecord(uid) : { state: 'none' };
  const tries = r.state === 'valid' ? { n: r.rec.tries.n, until: r.rec.tries.until, out: r.rec.tries.out } : null;
  return { locked, record: r.state, removed, noWebLocks: noLocks, tries };
}

const subscribe = (l: () => void): (() => void) => onLockChange(l);
export function useLocked(): boolean {
  return useSyncExternalStore(subscribe, isLocked, isLocked);
}
/** Re-renders on every lock change; read lockView() in render. */
export function useLockVersion(): number {
  const v = (): number => version;
  return useSyncExternalStore(subscribe, v, v);
}

/** WebCrypto subtle, localStorage and Web Locks; without all three no passcode can be set. */
export function lockSupport(): boolean {
  // An explicit host refusal first (HostEnv.passcodeLock: the terminal): never inferred from the storage kind.
  let refused = false;
  try { refused = hostEnv().passcodeLock === false; } catch { refused = false; }
  if (refused) return false;
  return !!env.subtle() && !!env.storage() && !!env.locks();
}

// ── Holds ─────────────────────────────────────────────────

type Held<T> = T | 'cancelled' | 'nolocks' | 'error';

async function hold<T>(uid: string, signal: AbortSignal, body: () => Promise<T>): Promise<Held<T>> {
  const L = env.locks();
  if (!L) return 'nolocks';
  if (signal.aborted) return 'cancelled';
  try {
    return (await L.request(lockName(uid), { mode: 'exclusive', signal }, body)) as T;
  } catch {
    return signal.aborted ? 'cancelled' : 'error';
  }
}

export type Verdict =
  | { k: 'right' }
  | { k: 'wrong'; n: number; until: number }
  | { k: 'wait'; until: number }
  | { k: 'terminal' }
  | { k: 'removed' }
  | { k: 'noVerifier' }
  | { k: 'check' }
  | { k: 'cancelled' };

const gone = (w: WriteAnswer): Verdict => (w === 'gone' ? { k: 'removed' } : { k: 'check' });

/** Verification step 1: refuse on `out`, fold an abandoned reservation; a record = go on with it. */
function stepOne(uid: string, st: { terminal: boolean }): Verdict | LockRecord {
  const r = readRecord(uid);
  if (r.state === 'none') return { k: 'removed' };
  if (r.state === 'malformed') return { k: 'noVerifier' };
  let rec = r.rec;
  if (rec.tries.out) { st.terminal = true; return { k: 'terminal' }; }
  if (rec.tries.pending) {
    const w = writeRecordChecked(uid, (cur) => (cur && cur.tries.pending ? folded(cur) : null));
    if (w !== 'ok') return gone(w);
    const again = readRecord(uid);
    if (again.state !== 'valid') return { k: 'check' };
    rec = again.rec;
    if (rec.tries.out) { st.terminal = true; return { k: 'terminal' }; }
  }
  return rec;
}

/** Verification steps 1-5 inside the caller's hold. Settings run their write in the same hold after a right answer. */
async function verifyInHold(uid: string, pass: string, signal: AbortSignal, st: { terminal: boolean }): Promise<Verdict> {
  const one = stepOne(uid, st);
  if ('k' in one) return one;
  if (env.now() < one.tries.until) return { k: 'wait', until: one.tries.until };
  const id = toB64(env.random(12));
  const at = env.now();
  const reserved = writeRecordChecked(uid, (cur) => (cur && !cur.tries.pending && !cur.tries.out && cur.tries.n < MAX_TRIES ? { ...cur, tries: { ...cur.tries, n: cur.tries.n + 1, pending: { id, at } } } : null));
  if (reserved !== 'ok') return gone(reserved);
  const mine = readRecord(uid);
  if (mine.state !== 'valid' || mine.rec.tries.pending?.id !== id) return { k: 'check' };
  const rec = mine.rec;
  const n = rec.tries.n;
  const ours = (cur: LockRecord | null): cur is LockRecord => !!cur && cur.tries.pending?.id === id;
  const refund = (): WriteAnswer => writeRecordChecked(uid, (cur) => (ours(cur) ? { ...cur, tries: { ...cur.tries, n: cur.tries.n - 1, pending: null } } : null));
  const d = await deriveRaced(pass, rec, signal);
  if (d === 'cancelled' || signal.aborted) {
    const w = refund();
    return w === 'gone' ? { k: 'removed' } : { k: 'cancelled' };
  }
  if (d === 'timeout' || d === 'error') return gone(refund());
  if (sameBytes(d, fromB64(rec.hash))) {
    const w = writeRecordChecked(uid, (cur) => (ours(cur) ? { ...cur, tries: { ...cur.tries, n: 0, pending: null } } : null));
    return w === 'ok' ? { k: 'right' } : gone(w);
  }
  const out = n >= MAX_TRIES;
  const until = env.now() + waitMs(n);
  const w = writeRecordChecked(uid, (cur) => (ours(cur) ? { ...cur, tries: { n: cur.tries.n, pending: null, until, out } } : null));
  if (w !== 'ok') return gone(w);
  if (out) { st.terminal = true; return { k: 'terminal' }; }
  return { k: 'wrong', n, until };
}

function runTerminal(): void {
  try { env.terminal(); } catch { /* the lock screen stays; the next load comes back here */ }
  // Still here: its Forget failed (a 'purged' answer has left). The screen re-reads lockView (tries.out) and offers Try again.
  notify();
}

function heldVerdict(h: Held<Verdict>): Verdict | { k: 'noWebLocks' } {
  if (h === 'nolocks') return { k: 'noWebLocks' };
  if (h === 'cancelled') return { k: 'cancelled' };
  if (h === 'error') return { k: 'check' };
  return h;
}

// ── Public flows ──────────────────────────────────────────

export type CheckResult = Exclude<Verdict, { k: 'right' }> | { k: 'unlocked' } | { k: 'again' } | { k: 'noWebLocks' } | { k: 'noSession' };

function settle(v: { k: string }): void {
  if (v.k === 'removed' && !removed) { removed = true; notify(); }
  if (v.k === 'noWebLocks' && !noLocks) { noLocks = true; notify(); }
}

/** Unlock this tab. Terminal outcomes run the terminal path after the hold ended. */
export async function checkPasscode(pass: string): Promise<CheckResult> {
  const uid = env.uid();
  if (!uid) return { k: 'noSession' };
  const g = tabGen;
  const c = newCancel();
  const st = { terminal: false };
  let v: Verdict | { k: 'noWebLocks' };
  try {
    v = heldVerdict(await hold(uid, c.signal, () => verifyInHold(uid, pass, c.signal, st)));
  } finally {
    cancels.delete(c);
  }
  if (st.terminal) { runTerminal(); return { k: 'terminal' }; }
  settle(v);
  if (v.k !== 'right') return v;
  // A CANCEL that landed after the hold ended but before its answer got here (a hide with onLeave off changes no
  // tabGen) still wins: the tab may be visible again by now, and the cancelled check applies nothing.
  if (tabGen === g && !c.signal.aborted && env.visible() && env.sessionOk()) {
    unlockHere();
    return { k: 'unlocked' };
  }
  return { k: 'again' };
}

/** The boot fold: verification step 1 in the background with the CANCEL signal; a terminal it finds runs after release. */
async function bootFold(uid: string): Promise<void> {
  if (!env.locks()) { settle({ k: 'noWebLocks' }); return; }
  const c = newCancel();
  const st = { terminal: false };
  let h: Held<Verdict | LockRecord>;
  try {
    h = await hold(uid, c.signal, () => Promise.resolve(stepOne(uid, st)));
  } finally {
    cancels.delete(c);
  }
  if (st.terminal) { runTerminal(); return; }
  if (h && typeof h === 'object' && 'k' in h) settle(h);
  // A folded reservation wrote a wait: the screen re-reads lockView (tries.until).
  else notify();
}

/** The gate, called at the end of bootCore before the first render: a record (valid or not) locks this tab
 *  synchronously; the boot fold runs in the background. True when the tab starts locked. */
export function bootGate(): boolean {
  lastInput = env.mono();
  const uid = env.uid();
  if (!uid || !hasRecord(uid)) return false;
  lockHere();
  void bootFold(uid);
  return true;
}

export interface LockSettings {
  readonly digits: boolean;
  readonly idleMin: IdleMin;
  readonly onLeave: boolean;
}

function freshRecord(s: LockSettings, salt: Uint8Array, hash: Uint8Array, iter: number): LockRecord {
  return {
    v: 1, kdf: 'pbkdf2-sha256', iter, salt: toB64(salt), hash: toB64(hash), rev: toB64(env.random(8)),
    digits: s.digits, idleMin: s.idleMin, onLeave: s.onLeave, tries: { n: 0, until: 0, pending: null, out: false },
  };
}

async function newVerifier(pass: string, signal: AbortSignal): Promise<{ salt: Uint8Array; hash: Uint8Array } | 'cancelled' | 'check'> {
  const salt = env.random(16);
  const stub = { salt: toB64(salt), iter: ITER_DEFAULT } as LockRecord;
  const d = await deriveRaced(pass, stub, signal);
  if (d === 'cancelled' || signal.aborted) return 'cancelled';
  if (d === 'timeout' || d === 'error') return 'check';
  return { salt, hash: d };
}

export type SetResult = 'set' | 'changed' | 'notSaved' | 'unsupported' | 'cancelled' | 'check' | 'noSession' | PasscodeProblem;

/** First set (Setup): derive first; then, inside the hold, refuse unless no record exists and the page still
 *  holds its session; write through writeRecordChecked({create}), which re-checks the session after the write. */
export async function setPasscode(pass: string, s: LockSettings): Promise<SetResult> {
  const uid = env.uid();
  if (!uid) return 'noSession';
  if (!lockSupport()) return 'unsupported';
  const problem = passcodeProblem(pass);
  if (problem) return problem;
  const c = newCancel();
  try {
    const v = await newVerifier(pass, c.signal);
    if (v === 'cancelled' || v === 'check') return v;
    const rec = freshRecord(s, v.salt, v.hash, ITER_DEFAULT);
    const h = await hold(uid, c.signal, async (): Promise<SetResult> => {
      if (readRecord(uid).state !== 'none' || !env.sessionOk()) return 'changed';
      const w = writeRecordChecked(uid, (cur) => (cur === null ? rec : null), { create: true });
      return w === 'ok' ? 'set' : w === 'gone' ? 'changed' : 'notSaved';
    });
    if (h === 'nolocks') return 'unsupported';
    if (h === 'error') return 'notSaved';
    return h;
  } finally {
    cancels.delete(c);
  }
}

type Refused = Exclude<CheckResult, { k: 'unlocked' } | { k: 'again' }>;
export type ChangeResult = { k: 'saved' } | { k: 'notSaved' } | { k: 'unsupported' } | { k: 'problem'; problem: PasscodeProblem } | { k: 'needsNumeric' } | Refused;

/** Change passcode, timer or leave switch (Settings): the current passcode and the new values first; Save
 *  verifies (steps 1-5, same try count) and writes in ONE hold. `needsNumeric`: Numbers only asked for over a kept
 *  passcode that holds more than digits; verified (the try is settled as right), nothing else written. A new passcode's verifier is derived before the lock
 *  and every save takes a fresh `rev`. Terminal outcomes run the terminal path after release. */
export async function changeLock(current: string, s: LockSettings & { passcode?: string }): Promise<ChangeResult> {
  const uid = env.uid();
  if (!uid) return { k: 'noSession' };
  if (!lockSupport()) return { k: 'unsupported' };
  if (s.passcode !== undefined) {
    const problem = passcodeProblem(s.passcode);
    if (problem) return { k: 'problem', problem };
  }
  const c = newCancel();
  const st = { terminal: false };
  let out: ChangeResult;
  try {
    let nv: { salt: Uint8Array; hash: Uint8Array } | null = null;
    if (s.passcode !== undefined) {
      const v = await newVerifier(s.passcode, c.signal);
      if (v === 'cancelled' || v === 'check') return { k: v };
      nv = v;
    }
    const fresh = nv;
    const h = await hold(uid, c.signal, async (): Promise<ChangeResult> => {
      const v = await verifyInHold(uid, current, c.signal, st);
      if (v.k !== 'right') return v;
      // Numbers only describes the passcode in force: a save that keeps the passcode cannot set it over one with
      // letters (another window may have written that after the sheet opened). Checked on the verified passcode,
      // in this hold; nothing is written and a numeric replacement is asked for.
      if (!fresh && s.digits && !/^[0-9]+$/.test(current.normalize('NFKC'))) return { k: 'needsNumeric' };
      const w = writeRecordChecked(uid, (cur) => (cur ? {
        ...cur, digits: s.digits, idleMin: s.idleMin, onLeave: s.onLeave, rev: toB64(env.random(8)),
        ...(fresh ? { salt: toB64(fresh.salt), hash: toB64(fresh.hash), iter: ITER_DEFAULT } : {}),
      } : null));
      return w === 'ok' ? { k: 'saved' } : w === 'gone' ? { k: 'removed' } : { k: 'notSaved' };
    });
    out = h === 'nolocks' ? { k: 'noWebLocks' } : h === 'cancelled' ? { k: 'cancelled' } : h === 'error' ? { k: 'check' } : h;
  } finally {
    cancels.delete(c);
  }
  if (st.terminal) { runTerminal(); return { k: 'terminal' }; }
  settle(out);
  return out;
}

export type RemoveResult = { k: 'deleted' } | { k: 'notSaved' } | Refused;

/** Remove: verify the current passcode, then delete the record in the SAME hold. */
export async function removePasscode(current: string): Promise<RemoveResult> {
  const uid = env.uid();
  if (!uid) return { k: 'noSession' };
  const c = newCancel();
  const st = { terminal: false };
  let out: RemoveResult;
  try {
    const h = await hold(uid, c.signal, async (): Promise<RemoveResult> => {
      const v = await verifyInHold(uid, current, c.signal, st);
      if (v.k !== 'right') return v;
      const s = env.storage();
      if (!s) return { k: 'notSaved' };
      try {
        s.removeItem(keyOf(uid));
        return s.getItem(keyOf(uid)) === null ? { k: 'deleted' } : { k: 'notSaved' };
      } catch {
        return { k: 'notSaved' };
      }
    });
    out = h === 'nolocks' ? { k: 'noWebLocks' } : h === 'cancelled' ? { k: 'cancelled' } : h === 'error' ? { k: 'check' } : h;
  } finally {
    cancels.delete(c);
  }
  if (st.terminal) { runTerminal(); return { k: 'terminal' }; }
  settle(out);
  return out;
}

/** The record's settings for the Account section, or null without a valid record. */
export function lockSettings(): (LockSettings & { readonly set: true }) | null {
  const uid = env.uid();
  if (!uid) return null;
  const r = readRecord(uid);
  return r.state === 'valid' ? { set: true, digits: r.rec.digits, idleMin: r.rec.idleMin, onLeave: r.rec.onLeave } : null;
}

/** A passcode record is stored for the shown account, readable or not: alerts then say nothing but a count
 *  (showAlert). An unreadable record or storage counts as stored (fail closed). */
export function passcodeStored(): boolean {
  const uid = env.uid();
  return !!uid && readRecord(uid).state !== 'none';
}

/** The app lock back to its boot state (session disposal, dispose.ts; tests). */
export function resetAppLock(): void {
  cancelPending();
  receiverStop?.();
  receiverStop = null;
  env = defaultEnv;
  locked = false;
  tabGen = 0;
  removed = false;
  noLocks = false;
  lastInput = 0;
  version = 0;
  listeners.clear();
}
