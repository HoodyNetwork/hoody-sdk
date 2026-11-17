// The Outcome hooks (C9), shared by the web Outcome line and the terminal one: what an outcome input stands for, the
// Check again runner, the leave toast for a pending outcome, the facts behind a shown outcome and the "done" flash.
// No DOM and no styles: Outcome.tsx draws the web line, Outcome.term.tsx the terminal one.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { alive, onBump, type Ctx, type ErrorInfo } from '@core';
import { type OutcomeInput, type OutcomeKind, type OutcomeLike, toOutcome } from '../outcome';
import { KIND_OUTCOME, shownKind, useErrorInfo, withOutcome } from '../states/ErrorDetails';
import { closeToast, showToast } from '../states/Toast';
import { useStrings } from '../strings';
import strings from './forms.strings.en.json';
import { safeCapture } from './wipe';

/** toOutcome, stable per input (a bare kind gives the same object every render). */
export function useOutcome(input: OutcomeInput): OutcomeLike | null {
  return useMemo(() => toOutcome(input), [input]);
}

/** A check that may return a promise: `checking` is tracked here unless the page passes it. Resolving
 *  (or returning) `true` means the read proved the outcome: only then does a sticky "may have gone
 *  through" toast close (Toast); `false` means it could not, and anything else proves nothing. */
export type CheckFn = () => Promise<unknown> | unknown;

export function useCheck(onCheck: CheckFn | undefined, checking?: boolean): [boolean, (() => void) | undefined] {
  const [own, setOwn] = useState(false);
  const live = useRef(true);
  // Checks still out. A check that ends while the effects are stopped (a page kept loaded, hidden) cannot set state;
  // shown again, the place reads what is still out.
  const out = useRef(0);
  useEffect(() => {
    live.current = true;
    if (out.current === 0) setOwn(false);
    return () => {
      live.current = false;
    };
  }, []);
  const run = useCallback(() => {
    if (!onCheck) return;
    let r: unknown;
    try {
      r = onCheck();
    } catch {
      return;
    }
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      out.current += 1;
      setOwn(true);
      const end = () => {
        out.current -= 1;
        if (live.current && out.current === 0) setOwn(false);
      };
      (r as Promise<unknown>).then(end, end);
    }
  }, [onCheck]);
  return [checking ?? own, onCheck ? run : undefined];
}

/**
 * When the place showing a `pending` outcome goes away (a drawer closed, a row left the view) while
 * its context still lives, the outcome moves to a sticky toast with the same Check again.
 * `facts` (the surface's error facts): pending facts count as pending, and the toast keeps their Details.
 * A page kept loaded behind another (useKeepPage) goes away the same way when it hides: the toast shows while the
 * person is elsewhere. Shown again, the toast it opened closes once the place shows the outcome inline (`inline`: false
 * while the place renders without it, a branch with no outcome line) or the outcome is no longer unknown, so it never
 * closes with the unknown left nowhere; a later hide replaces it rather than adding a second one.
 * `subject`: what the change was to ("the alias of Production"); the toast's title names it (Toast.tsx copy policy).
 * Without one the title is the kit's bare "This may have gone through" (listed as known copy in states/Toast.calls.test.ts).
 * Returns `settled()`: the place proved the outcome and is about to go (a pick that closes it): no toast opens when
 * it goes, and one it opened closes. Called at once, before the place goes, since an effect may not run first.
 */
export function usePendingToast(outcome: OutcomeLike | null, onCheck: CheckFn | undefined, enabled = true, facts?: ErrorInfo | null, inline = true, subject?: string): () => void {
  const t = useStrings(strings);
  const latest = useRef<{ pending: boolean; ctx: Ctx | null; onCheck: CheckFn | undefined; facts: ErrorInfo | null; outcome: OutcomeLike | null; subject: string | undefined }>({
    pending: false,
    ctx: null,
    onCheck,
    facts: null,
    outcome: null,
    subject: undefined,
  });
  // The outcome settled() retired: it stays retired while the place holds that same outcome (effects that run again on
  // a kept page's return do not bring it back).
  const retired = useRef<OutcomeLike | null>(null);
  const pending = !!outcome && shownKind(outcome.kind, facts) === 'pending';
  // The toast is the pending outcome: its Details say so even when the caller's facts were worked out as failed.
  const details = useMemo(() => (facts ? (pending ? withOutcome(facts, 'pending') : facts) : null), [facts, pending]);
  useEffect(() => {
    const cur = latest.current;
    // Read here, not at render: settled() may have run in an earlier effect of this same pass.
    const still = pending && outcome !== retired.current;
    if (still && !cur.pending) cur.ctx = safeCapture();
    cur.pending = still;
    cur.onCheck = onCheck;
    cur.facts = details;
    cur.outcome = outcome;
    cur.subject = subject?.trim() || undefined;
  }, [pending, onCheck, details, outcome, subject]);
  // The toast waits a tick, so StrictMode's simulated unmount/remount never fires it.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The toast this place opened (and its context watch), while it is open.
  const opened = useRef<{ id: string; off: () => void } | null>(null);
  const shut = () => {
    if (!opened.current) return;
    closeToast(opened.current.id);
    opened.current.off();
    opened.current = null;
  };
  // The toast stays only while the place, shown again, still has the outcome unknown and no line for it; back inline
  // (or settled meanwhile: a result that landed on return) it closes.
  const toastOnly = pending && !inline;
  useEffect(() => {
    if (!toastOnly) shut();
  }, [toastOnly]);
  useEffect(() => {
    clearTimeout(timer.current);
    // The same object the tracking effect mutates, so the cleanup reads the latest state.
    const cur = latest.current;
    return () => {
      if (!enabled || !cur.pending || !cur.ctx) return;
      const ctx = cur.ctx;
      const check = cur.onCheck;
      const facts = cur.facts;
      const named = cur.subject;
      timer.current = setTimeout(() => {
        if (!alive(ctx)) return;
        // One toast per place: one still open from an earlier hide gives way to this one.
        shut();
        const id = showToast({
          tone: 'unknown',
          title: named ? t('outcome.toastTitleOf', { subject: named }) : t('outcome.toastTitle'),
          body: t('outcome.toastBody'),
          ...(check ? { action: { label: t('outcome.check'), onAction: () => check() } } : {}),
          ...(facts ? { details: facts } : {}),
        });
        // Its Check again belongs to this context: an account or realm switch (any bump but 'late') closes it,
        // as the overlays close (useCloseOnContextEnd).
        const off = onBump((reason) => {
          if (reason === 'late') return;
          closeToast(id);
          off();
          if (opened.current?.id === id) opened.current = null;
        });
        opened.current = { id, off };
      }, 0);
    };
    // Mount/unmount only: the ref carries the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useCallback(() => {
    retired.current = latest.current.outcome;
    latest.current.pending = false;
    // A hide's toast still waiting its tick would open for an outcome now proved.
    clearTimeout(timer.current);
    shut();
  }, []);
}

/** The facts behind a shown outcome (none for `done`), and the kind the surface shows (shownKind). */
export function useOutcomeFacts(o: OutcomeLike | null, error: unknown): { info: ErrorInfo | null; kind: OutcomeKind | undefined } {
  // The outcome's kind is the page's C9 decision: the facts take it, except that pending facts stay pending.
  const info = useErrorInfo(o && o.kind !== 'done' ? error : undefined, o ? KIND_OUTCOME[o.kind] : undefined);
  return { info, kind: o ? shownKind(o.kind, info) : undefined };
}

/**
 * True for `ms` after an outcome turns `done` (a new done object, or a new `ms`, restarts it); Infinity keeps it.
 * A done outcome is one object per result: a caller that builds a fresh `{ kind: 'done' }` on every render restarts the
 * flash on every render (useOutcome keeps one object per input).
 */
export function useDoneFlash(o: OutcomeLike | null, ms = 2400): boolean {
  const kind = o?.kind;
  const [shown, setShown] = useState(false);
  // The done object that flashed, for which `ms`, and when its flash ends. The effect runs again for that same object
  // when a page kept loaded shows (and in StrictMode): it shows only the time left, so an ended flash never shows twice.
  // An outcome that is not done, or a flash turned off (`ms` 0), forgets it: the same object done again, or the flash
  // turned on again, flashes again.
  const flashed = useRef<{ o: OutcomeLike; ms: number; until: number } | null>(null);
  // A layout effect: a page shown again after its flash ended clears it before the browser paints.
  useLayoutEffect(() => {
    if (kind !== 'done' || !o || ms <= 0) {
      flashed.current = null;
      setShown(false);
      return;
    }
    if (flashed.current?.o !== o || flashed.current.ms !== ms) flashed.current = { o, ms, until: Date.now() + ms };
    const left = flashed.current.until - Date.now();
    if (left <= 0) {
      setShown(false);
      return;
    }
    setShown(true);
    if (left === Infinity) return;
    const id = setTimeout(() => setShown(false), left);
    return () => clearTimeout(id);
    // A fresh outcome object (a second save) restarts the flash; its kind alone would not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, kind === 'done' ? o : null, ms]);
  return shown;
}
