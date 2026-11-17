// The wipe signal for secret entry and display. Shared by
// SecretField, SecretInput and TextField type="password"; it never reads or keeps a value.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from '@tanstack/react-router';
import { capture, holdSecret, hostEnv, isLocked, onLockChange, type Ctx } from '@core';

export function safeCapture(): Ctx | null {
  try {
    return capture();
  } catch {
    return null;
  }
}

/** The current path, or '' outside a router (a field rendered on its own still mounts). */
function usePathIfRouted(): string {
  const router = useRouter({ warn: false }) as ReturnType<typeof useRouter> | undefined;
  const sub = useCallback((cb: () => void) => (router ? router.subscribe('onResolved', cb) : () => undefined), [router]);
  const read = () => router?.state.location.pathname ?? '';
  return useSyncExternalStore(sub, read, read);
}

/**
 * Calls `wipe` when the place's context ends: a route change, a `resetKey` change, page hide, the passcode lock, or
 * core ending the context it mounted in (realm switch, sign-out, account change, view change).
 * It keeps listening after each end, so a second realm switch or view change wipes again.
 * `enabled: false` listens to nothing (a field that holds no secret).
 */
export function useWipeOn(wipe: () => void, resetKey?: unknown, enabled = true): void {
  const latest = useRef(wipe);
  latest.current = wipe;
  const path = usePathIfRouted();
  // Compare with what was seen, not "first run": StrictMode re-runs effects on the same values.
  const seen = useRef({ path, resetKey });
  useEffect(() => {
    if (seen.current.path === path && Object.is(seen.current.resetKey, resetKey)) return;
    seen.current = { path, resetKey };
    if (enabled) latest.current();
  }, [path, resetKey, enabled]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const onHide = () => latest.current();
    const offHide = hostEnv().onLifecycle('pagehide', onHide);
    // The passcode lock covers the page; a secret on screen or in a field must not wait under it.
    const offLock = onLockChange(() => { if (isLocked()) latest.current(); });
    // core drops a held value when its context ends; a sentinel held in the current context carries
    // that signal here without the kit reaching into core's internals. After each end a new one is
    // held in the context that replaced it (none once signed out: holdSecret refuses a dead one).
    let off: (() => void) | undefined;
    let sentinel: ReturnType<typeof holdSecret> = null;
    const arm = () => {
      const ctx = safeCapture();
      sentinel = ctx ? holdSecret('wipe-signal', ctx) : null;
      off = sentinel?.onDrop(() => {
        if (!live) return;
        latest.current();
        queueMicrotask(() => live && arm());
      });
    };
    arm();
    return () => {
      live = false;
      offHide();
      offLock();
      off?.();
      sentinel?.drop();
    };
  }, [enabled]);
}
