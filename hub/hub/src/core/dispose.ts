// Ends the current core session and leaves core reusable by the next one, in this process.
// Only the terminal Hub's mount teardown calls it; the web never does (a web sign-out stays a page reload).
//
// What survives, by design: the listener sets registered at module load (teardown, notice, purge, bump subscribers, the
// host-env registrations). They are process-scoped, read the CURRENT session's stores, and a subscriber that never
// registers again would be orphaned by clearing them.
//
// resetCoreSteps is the one list of per-session resets. test/env.ts boot() calls it as well, so the test reset and
// the production reset cannot drift (conformance: dispose.conformance.test.ts).
import { resetAgentSignIn } from './agent-signin';
import { resetAppLock } from './applock';
import { resetAttempts } from './attempts';
import { resetBootToken } from './boot-token';
import { resetChanges } from './changes';
import { resetCommerce } from './commerce';
import { resetComputer } from './computer';
import { resetRouting } from './routing';
import { cryptIdleForTests, resetCryptForTests } from './cryptStore';
import { resetCore } from './ctx';
import { resetLeave } from './leave';
import { resetLifecycle } from './lifecycle';
import { resetNotifications } from './notifications';
import { resetOtp } from './otp';
import { resetRealm, runAuthPurge } from './realm';
import { resetPrefs } from './prefs';
import { resetSetup } from './setup';
import { resetStreamMux } from './stream-mux';
import { resetTabLock } from './tab-lock';
import { resetTickets } from './ticket';
import { resetToken } from './token';
import type { Vault } from './crypt/vault';

export type DisposeReason = 'term-quit' | 'term-abort' | 'term-error';

/** Runs every step even when one throws; the first error is then thrown. */
function runAll(steps: ReadonlyArray<() => void>): void {
  let first: { e: unknown } | null = null;
  for (const step of steps) {
    try { step(); } catch (e) { first ??= { e }; }
  }
  if (first) throw first.e;
}

/** Every per-session store back to its boot state. `crypt`: the vault the next session's crypt store opens over (null:
 *  the environment's own). Each reset runs whatever an earlier one threw; the first error is thrown after the last. */
export function resetCoreSteps(crypt: Vault | null = null): void {
  runAll([
    resetCore,
    resetRealm,
    resetComputer,
    resetRouting,
    resetChanges,
    resetPrefs,
    resetLifecycle,
    resetLeave,
    resetNotifications,
    resetTabLock,
    resetTickets,
    resetOtp,
    resetToken,
    resetBootToken,
    resetAgentSignIn,
    resetSetup,
    resetCommerce,
    resetAttempts,
    resetAppLock,
    resetStreamMux,
    () => { resetCryptForTests(crypt); },
  ]);
}

/** Ends the current core session and leaves core reusable by the next one, in this process.
 *  1. The purge a sign-out runs: the purge listeners see it, then the account ends for `reason` (teardown listeners
 *     run). In-flight sends are dropped as on a sign-out; resetChanges clears the sends-out tables.
 *  2. The crypt store finishes what that purge started (a seal), within CRYPT_SETTLE_MS (else CRYPT_SETTLE_TIMEOUT).
 *  3. Every per-session store is reset.
 *  Nothing is armed again here: the next boot (initCore, hookPurge on its own Shared, initLive) arms what a session
 *  needs, and a purge hook latched early would sit on the outgoing mount's Shared. Every reset runs even when step 1,
 *  2 or an earlier reset throws; the first error is thrown (the purge or crypt error before a reset's). */
/** How long a dispose waits for the crypt store to finish what the purge started. A store stuck mid-load (a crash
 *  during its first read) never settles; the dispose then goes on and reports CRYPT_SETTLE_TIMEOUT, so the process can
 *  end (a crashed terminal mount never exited). */
export const CRYPT_SETTLE_MS = 5000;
let cryptIdle: () => Promise<void> = cryptIdleForTests;
let settleMs = CRYPT_SETTLE_MS;
/** Tests: replace the crypt wait and its bound (null restores). */
export const __disposeCoreSeams = {
  setCryptIdle(fn: (() => Promise<void>) | null): void { cryptIdle = fn ?? cryptIdleForTests; },
  setSettleMs(ms: number | null): void { settleMs = ms ?? CRYPT_SETTLE_MS; },
};
function bounded(p: Promise<void>, ms: number): Promise<void> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const over = new Promise<void>((_, reject) => {
    t = setTimeout(() => { reject(new Error('CRYPT_SETTLE_TIMEOUT: the crypt store did not settle; reset anyway')); }, ms);
    (t as { unref?: () => void }).unref?.();
  });
  return Promise.race([p, over]).finally(() => { clearTimeout(t); });
}

export async function disposeCoreSession(reason: DisposeReason): Promise<void> {
  let first: { e: unknown } | null = null;
  try {
    runAuthPurge(undefined, reason);
    await bounded(cryptIdle(), settleMs);
  } catch (e) {
    first = { e };
  }
  try {
    resetCoreSteps(null);
  } catch (e) {
    first ??= { e };
  }
  if (first) throw first.e;
}
