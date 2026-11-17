// What a Drawer shares with the code inside it and with the terminal build's Drawer (Drawer.term.tsx): its context
// (useDrawer, the footer reports), the URL-kept drawer hook and the small rules both drawers draw by. Nothing here
// touches a document; Drawer.tsx re-exports the public names.
import { createContext, Fragment, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlocker, useRouter } from '@tanstack/react-router';
import { onLifecycle } from '@core/shell';
import { useSearchParam } from '../nav';
import { allowNextNavigation, takeAllowedNavigation } from './shared';

export interface DrawerApi {
  /** Close as the user would: asks first when dirty, refused while busy. */
  requestClose: () => void;
  dirty: boolean;
  busy: boolean;
  /**
   * A footer inside the drawer (FormFooter) reports its send state under its own `key` (useId): several can report
   * at once (the drawer's form and a step nested in it), and any reported `busy` refuses closing like the `busy` prop.
   * A pending outcome lets the drawer close without asking to discard, unless the reporter is `nested` (its change
   * is not the drawer's dirty form). The leave toast for a pending outcome stays with the footer's Outcome line, which
   * unmounts with the drawer. `null` on unmount.
   */
  reportOutcome: (key: string, state: DrawerReportState | null) => void;
}

export interface DrawerReportState {
  pending: boolean;
  busy: boolean;
  onCheck?: () => void;
  /** A step nested in the drawer's form (a key setup): its pending outcome does not stand for the drawer's unsaved changes. */
  nested?: boolean;
}

export const DrawerContext = createContext<DrawerApi | null>(null);

/** Inside a Drawer: its guarded close (for a footer's own Cancel). `null` outside a drawer. */
export function useDrawer(): DrawerApi | null {
  return useContext(DrawerContext);
}

/** The footers' reports: one entry per reporting footer, so one ending (or unmounting) never lifts another's busy. */
export function useDrawerReports(): { reportOutcome: DrawerApi['reportOutcome']; reported: { busy: boolean; pending: boolean } } {
  const [reports, setReports] = useState<ReadonlyMap<string, { pending: boolean; busy: boolean; nested: boolean }>>(() => new Map());
  const reportOutcome = useCallback<DrawerApi['reportOutcome']>((key, st) => {
    setReports((prev) => {
      const cur = prev.get(key);
      if (st === null && !cur) return prev;
      const nested = st?.nested === true;
      if (st && cur && cur.busy === st.busy && cur.pending === st.pending && cur.nested === nested) return prev;
      const next = new Map(prev);
      if (st === null) next.delete(key);
      else next.set(key, { pending: st.pending, busy: st.busy, nested });
      return next;
    });
  }, []);
  const reported = useMemo(() => {
    let rBusy = false;
    let pending = false;
    for (const r of reports.values()) {
      rBusy ||= r.busy;
      pending ||= r.pending && !r.nested;
    }
    return { busy: rBusy, pending };
  }, [reports]);
  return { reportOutcome, reported };
}

/** Whether a node draws anything: React draws nothing for null, undefined, a boolean (`ready && <Button/>` while not ready) or an
 *  empty string, so a mirror of one is no mirror. */
export function drawsSomething(x: ReactNode): boolean {
  // An array or a fragment draws something only when one of its items does ([], [false], <>{false}</> draw nothing).
  // A component element counts as drawing: what it renders is its own contract (a mirror must draw its primary).
  if (Array.isArray(x)) return x.some((i: ReactNode) => drawsSomething(i));
  if (isValidElement<{ children?: ReactNode }>(x) && x.type === Fragment) return drawsSomething(x.props.children);
  return x !== undefined && x !== null && typeof x !== 'boolean' && x !== '';
}

/**
 * Blocks browser Back/Forward and leaving the page while the drawer is dirty or busy (a busy drawer
 * refuses outright: a running change is never unmounted), and asks the browser
 * to confirm a reload. The page's own same-page URL writes (closing a URL-kept drawer after a save)
 * pass, and so does a deliberate close (Discard, useDrawerParam's close).
 * When the core leaves the page (its lifecycle 'leaving' event, sent right before it navigates: another tab's sign-out
 * or account switch, a 401, a finished logout), the browser is not asked: a leave-site question there would hold a tab
 * whose account is already torn down. A context end that keeps the page (a realm switch, a fallback, a
 * suspension, a logout still waiting for its work or stopped on a retry panel) keeps the question for a drawer still open.
 */
export function NavGuard({ onBlock }: { onBlock: (proceed: () => void, reset: () => void) => void }) {
  const leaving = useRef(false);
  useEffect(() => onLifecycle((e) => { if (e.kind === 'leaving') leaving.current = true; }), []);
  const blocker = useBlocker({
    shouldBlockFn: ({ action, current, next }) => {
      if (takeAllowedNavigation()) return false;
      return action === 'BACK' || action === 'FORWARD' || action === 'GO' || current.pathname !== next.pathname;
    },
    enableBeforeUnload: () => !leaving.current,
    withResolver: true,
  });
  const onBlockRef = useRef(onBlock);
  onBlockRef.current = onBlock;
  useEffect(() => {
    if (blocker.status === 'blocked') onBlockRef.current(blocker.proceed, blocker.reset);
  }, [blocker.status, blocker.proceed, blocker.reset]);
  return null;
}

// ── URL-kept drawers ─────────────────────────────────────────────────────────────────

/** Per parameter, the history index its opener pushed from, so `close` can step back instead of piling up. */
const pushedFrom = new Map<string, number>();

function entryIndex(state: unknown): number | undefined {
  const i = (state as { __TSR_index?: unknown } | undefined)?.__TSR_index;
  return typeof i === 'number' ? i : undefined;
}

/**
 * A drawer whose open state lives in the URL (`?edit=<id>`), so a link can open it and Back closes
 * it. Returns the value (e.g. the id being edited), an opener (pushes a history entry) and a closer:
 * it steps back over the entry its opener pushed (so Back afterwards does not reopen the drawer) and
 * otherwise removes the parameter in place. A close never trips the dirty guard; ask first.
 */
export function useDrawerParam(param: string): [string | undefined, (value: string) => void, () => void] {
  const [value, set] = useSearchParam(param);
  const router = useRouter({ warn: false });
  const open = useCallback(
    (v: string) => {
      const from = router ? entryIndex(router.history.location.state) : undefined;
      if (from === undefined) pushedFrom.delete(param);
      else pushedFrom.set(param, from);
      set(v);
    },
    [set, param, router],
  );
  const close = useCallback(() => {
    allowNextNavigation();
    const from = pushedFrom.get(param);
    pushedFrom.delete(param);
    const now = router ? entryIndex(router.history.location.state) : undefined;
    if (router && from !== undefined && now === from + 1) router.history.back();
    else set(undefined, { replace: true });
  }, [set, param, router]);
  return [value, open, close];
}
