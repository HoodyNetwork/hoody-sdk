// Billing's market helpers (core/commerce-pure.ts) inside a terminal mount, where the browser globals trap
// (TERM_GLOBAL). They read `navigator.locks` and `sessionStorage` straight from globalThis: in the terminal each read
// trapped (caught by their own try, so the lock reads "no Web Locks" and every new money key was refused 'noLocks'),
// and the trap failed the billing goldens (funds, checkout-baremetal-setup). They now go through hostEnv().locks and
// sessionStore(), the terminal session's lock manager and memory store.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import * as C from '../../core/commerce-pure';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('locks and the resume marker work in a billing mount, with no trap', async () => {
  s = await renderPage({ page: 'billing', fx: 'funds', path: '/billing?view=wallet', cols: 80, rows: 24 });
  await s.settle();
  expect(C.hasWebLocks()).toBe(true);
  let held = false;
  expect(await C.withPendingLock(() => { held = C.pendingLockHeld(); return 7; })).toBe(7);
  expect(held).toBe(true);
  C.writeResumeMarker('stock', 'abc', '30');
  expect(C.readResumeMarker()?.id).toBe('abc');
  C.clearResumeMarker();
  expect(C.readResumeMarker()).toBeNull();
  expect(s.traps).toEqual([]);
}, 120_000);
