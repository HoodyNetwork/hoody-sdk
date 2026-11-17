// Toasts. Inline first: an action's result shows where the action was; a toast is
// for results whose place is gone, or that have no place (a background finish). Copy actions do
// not toast (the copy icon turns into a check).
//   ok / info   one line, 4 s, paused on hover or focus; ok may carry Undo. showErrorToast shows a refusal that sent
//               nothing (not_sent), a dropped answer (stale) and a cancel as info (ERROR_TONE below).
//   warn        one line, 4 s: nothing changed, or a degraded state (a browser refused to keep it). It is
//               information, not a failure, so it needs no fix; a definite failure is an error.
//   error       title + one line, stays until closed, carries the fix (Try again, Open …).
//   unknown     C9: what may have happened ("Deleting {{name}} may have gone through") + what to check, stays until
//               closed, and its action only reads (Check again); never Retry unless the action is idempotent.
// Copy:
//   - The title names its subject and what happened: "{{name}} is deleted.", "Couldn't switch to {{realm}}". The
//     subject is an interpolation, or a noun the title spells out ("Saved views removed.").
//   - A failure (error, unknown) says what to do, in the body or as an action.
//   - An unknown says what may have happened, never done or failed. showErrorToast for a change passes pendingTitle,
//     so its unknown toast names the subject instead of the kit's bare "This may have gone through".
//   - Bare titles are banned: Done, Saved, Deleted, Restored, Stopped, Removed, Copied, Failed, Error, Not allowed,
//     Something went wrong, It's live, It started, Settings saved, Value saved, Run started, "This change …",
//     "That change …", "This may have gone through", and "… doesn't allow that" without a subject.
//   - Server or daemon text and raw codes go in the body or Details only, never in the title.
// An action that returns a promise keeps its toast open, busy, until the promise settles. An unknown
// toast closes only on an explicit `true` (the read proved the outcome), whether the action answers at
// once or through a promise; `false` or a failure (offline) keeps it with a "couldn't check" line, and
// anything else (nothing, a void check) keeps it as it was, Check again ready, so the person is never
// left with nothing on screen while the change may still be held. Other toasts close on any answer
// except `false`. Toast.calls.test.ts holds every call in pages, ask, shell and the kit to these rules, the copy
// rules included (KNOWN_COPY lists today's breaks with their owners).
//
// A toast may carry `faq` (the DialogFaq shape): a FaqLink under the body that opens the answer in a peek (a toast is an
// alertdialog, so the link never navigates). It is not an action (the one-action and C9 rules are untouched); a toast that
// carries one stays until closed, so the peek it opened is never left without its toast.
//
// Placement: bottom inline-end of the content area (bottom-right; bottom-left right to left; phone: full width above the
// bottom bar). The region keeps clear of what it would cover there: a dock on that edge (the Agent panel) moves the
// toasts beside it into the content area, and the controls of an open dialog, drawer or dock sheet that sit in the
// toasts' column (a drawer's footer actions, the dock's composer) lift the toasts above them, never higher than half
// the screen and never off it; when that cannot clear them, the toasts go to the top edge if it is clear. It is
// measured again on page changes, resize, scroll and the end of a transition, while toasts show.
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import {
  type QueuedToast,
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
  UNSTABLE_ToastStateContext as ToastStateContext,
} from 'react-aria-components';
import { Button, IconButton, cx } from '../controls/Button';
import { FaqLink } from '../layouts/Faq';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { ErrorDetails } from './ErrorDetails';
import stateStrings from './strings.en.json';
import s from './Toast.module.css';
// The store (the one queue, showToast and its rules) is shared with the terminal build: Toast.store.ts.
import { TOAST_ICON as ICON, runToastAction, toastQueue, type ToastContentData } from './Toast.store';

import { toastPlacement, trayToastBudget, trayViewportHeight, type Box, type TrayBudget } from './Toast.place';

export { closeToast, showErrorToast, showToast } from './Toast.store';
export { toastPlacement, trayToastBudget, trayViewportHeight } from './Toast.place';
export type { Box, ToastPlace, TrayBudget } from './Toast.place';
export type { ErrorToastOptions, ToastAction, ToastContentData, ToastTone } from './Toast.store';

function ToastItem({ toast }: { toast: QueuedToast<ToastContentData> }) {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  const [busy, setBusy] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);
  // The queue this toast came from (the app's, or a gallery preview's own).
  const state = useContext(ToastStateContext);
  const tone = toast.content.tone ?? 'ok';
  const action = toast.content.action;
  const run = () => runToastAction(toast.content, busy, { close: () => state?.close(toast.key), setBusy, setNoAnswer });
  return (
    <AriaToast toast={toast} className={cx(s.toast, s[tone])} data-outcome={tone === 'unknown' ? 'pending' : tone === 'error' ? 'failed' : undefined}>
      <Icon name={ICON[tone]} className={s.icon} />
      <ToastContent className={s.content}>
        <Text slot="title" className={s.title}>
          {toast.content.title}
        </Text>
        {toast.content.body && (
          <Text slot="description" className={s.body}>
            {toast.content.body}
          </Text>
        )}
        {toast.content.faq && (
          <span className={s.body} data-toast-faq="">
            <FaqLink item={toast.content.faq.item}>{toast.content.faq.label}</FaqLink>
          </span>
        )}
        {noAnswer && (
          <span className={s.body} role="status">
            {ts('toast.noAnswer')}
          </span>
        )}
      </ToastContent>
      {toast.content.details && <ErrorDetails error={toast.content.details} mode="button" className={s.details} />}
      {action && (
        <Button variant="ghost" size="sm" className={s.action} onPress={run} busy={busy}>
          {action.label}
        </Button>
      )}
      {/* The kit's ghost buttons: RAC's toast reaches the close one through its `slot`. */}
      <IconButton slot="close" icon="x" size="sm" className={s.close} label={t('toast.dismiss')} />
    </AriaToast>
  );
}

const CONTROLS = 'button, a[href], input, textarea, select, [role="button"], [contenteditable="true"]';
const boxOf = (el: Element): Box | null => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
};

/** Measures the page and moves the region (CSS variables and data-at, no re-render) while toasts show. Returns what it
 *  measured against (the dialogs, the dock, the floating action button and the Bot composer), so their size changes can
 *  be watched. */
function place(region: HTMLElement): Element[] {
  const tray = document.querySelector<HTMLElement>('[data-hub-tray]');
  if (tray) return placeBesideTray(region, tray);
  leaveTray(region);
  // The usual bottom place is measured every time, at the top too (it changes with the phone breakpoint): the top
  // fallback is dropped while measuring and set again below, in the same frame, so nothing paints in between.
  delete region.dataset.at;
  const style = getComputedStyle(region);
  const gap = parseFloat(style.insetInlineEnd) - (parseFloat(style.getPropertyValue('--toast-end')) || 0);
  const box = region.getBoundingClientRect();
  const base = window.innerHeight - box.bottom - (parseFloat(style.getPropertyValue('--toast-lift')) || 0);
  const full = box.width >= window.innerWidth - 2 * gap - 1;
  const dockEl = document.querySelector('[data-hub-dock]');
  const dock = dockEl ? boxOf(dockEl) : null;
  // The dock's controls count too: a side dock moves the column off them anyway, a dock sheet (phone) lifts it.
  const containers = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((d) => !region.contains(d));
  if (dockEl && dock) containers.push(dockEl);
  // Controls fixed or sticky at the foot of the page sit under the toasts' column on a phone: the page's floating action
  // button and the Bot composer. Their controls count like a dialog's, so the toasts lift above them.
  containers.push(...document.querySelectorAll('[data-hub-fab], [data-say-dock]'));
  const controls = containers.flatMap((c) => [...c.querySelectorAll(CONTROLS)].map(boxOf).filter((b): b is Box => b !== null));
  const placed = toastPlacement({
    viewW: window.innerWidth,
    viewH: window.innerHeight,
    base,
    stack: box.height,
    width: full ? 0 : box.width,
    gap,
    dock,
    controls,
    rtl: style.direction === 'rtl',
  });
  const end = `${Math.round(placed.end)}px`;
  const lift = `${Math.round(placed.lift)}px`;
  if (region.style.getPropertyValue('--toast-end') !== end) region.style.setProperty('--toast-end', end);
  if (region.style.getPropertyValue('--toast-lift') !== lift) region.style.setProperty('--toast-lift', lift);
  if (placed.top) region.dataset.at = 'top';
  return containers;
}

/** Whether Toaster paused the timed toasts because a tray left no band for them (the queued branch of trayToastBudget). */
let trayPaused = false;
/** The tray whose max height Toaster set, so leaving tray mode gives it back its own (CSS) height. */
let sizedTray: HTMLElement | null = null;
const px = (v: number) => `${Math.round(v)}px`;
const setVar = (el: HTMLElement, name: string, v: string | null) => {
  if (v === null) el.style.removeProperty(name);
  else if (el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v);
};

/** No tray open, or no toast left to place: the region's tray mode ends (when the region is still there), the tray gets
 *  its own height back, and toasts the tray held back show again with their timers running on. Called on teardown
 *  too, whether or not the region is still in the document, so the pause never outlives the Toaster. */
function leaveTray(region: HTMLElement | null) {
  if (region) {
    delete region.dataset.tray;
    setVar(region, '--toast-band', null);
  }
  setVar(document.documentElement, '--toast-stack-h', null);
  if (sizedTray) {
    setVar(sizedTray, '--tray-max', null);
    sizedTray = null;
  }
  if (trayPaused) {
    trayPaused = false;
    toastQueue().resumeAll();
  }
}

/**
 * A phone tray is open (`[data-hub-tray]`): the toasts go to the top and share the visual viewport by
 * trayToastBudget. The tray's reserves are its own (--tray-r1/--tray-r3): token sums, with a two-line menu's tallest row
 * as drawn (Menu.module.css .tray[data-two-line]); T_min is
 * one toast's title line + Close. Unqueued, the region becomes a band of height B that scrolls inside; queued, no toast
 * shows and the timed ones pause until the tray closes or the viewport grows. Writes CSS variables and data attributes
 * only (no re-render).
 */
function placeBesideTray(region: HTMLElement, tray: HTMLElement): Element[] {
  const vvh = trayViewportHeight(window.visualViewport, document.documentElement.clientHeight, window.innerHeight);
  const rootStyle = getComputedStyle(document.documentElement);
  const gap = parseFloat(rootStyle.getPropertyValue('--sp-2')) || 8;
  // The tray's reserves are its own (Menu.module.css --tray-r1/--tray-r3), read resolved; Toaster measures no row itself.
  // A change to them (a two-line tray's tallest row) is a style change on the tray, which re-runs this placement.
  const ts = getComputedStyle(tray);
  // Unreadable (no @property: the value stays a calc() string), they are unknown, never zero: the toasts queue and the
  // tray keeps its own CSS floor (no --tray-max).
  const r1 = parseFloat(ts.getPropertyValue('--tray-r1'));
  const r3 = parseFloat(ts.getPropertyValue('--tray-r3'));
  const known = r1 > 0 && r3 > 0;
  const first = region.querySelector<HTMLElement>('[role="alertdialog"]');
  let tMin = 56;
  if (first) {
    const fs = getComputedStyle(first);
    const close = first.querySelector('[slot="close"]')?.getBoundingClientRect().height ?? 0;
    const title = parseFloat(getComputedStyle(first.querySelector('[slot="title"]') ?? first).lineHeight) || 0;
    tMin = Math.max(close, title) + parseFloat(fs.paddingBlockStart) + parseFloat(fs.paddingBlockEnd) + parseFloat(fs.borderBlockStartWidth) + parseFloat(fs.borderBlockEndWidth);
  }
  const b: TrayBudget = known
    ? trayToastBudget({ vvh, r1, r3, gap, tMin, stack: region.scrollHeight })
    : { R: 0, B: 0, T: 0, M: 0, queued: true, full: true };
  region.dataset.at = 'top';
  region.dataset.tray = b.queued ? 'queued' : 'band';
  setVar(region, '--toast-end', '0px');
  setVar(region, '--toast-lift', '0px');
  setVar(region, '--toast-band', px(Math.max(b.B, 0)));
  setVar(document.documentElement, '--toast-stack-h', px(b.T));
  // Below R the tray's own CSS takes the viewport (min(100dvh, --tray-r1), scrolling whole): no budget is written then.
  if (sizedTray && sizedTray !== tray) setVar(sizedTray, '--tray-max', null);
  sizedTray = tray;
  setVar(tray, '--tray-max', b.full ? null : px(b.M));
  // Queued: every placement pauses, not only the first: a toast arriving meanwhile starts its timer when it mounts, and
  // the placement its arrival triggers (the frame after) pauses it.
  if (b.queued) {
    trayPaused = true;
    toastQueue().pauseAll();
  } else if (trayPaused) {
    trayPaused = false;
    toastQueue().resumeAll();
  }
  return [tray];
}

/** Keeps the region placed while toasts show, at most once a frame: on any change to the page (a dialog or the dock
 *  opening, a toast added), on resize, on any scroll (a drawer body scrolling a button under the toasts), at the end of
 *  a transition or animation (an overlay sliding in), and when the region, a dialog or the dock changes size. Idle while
 *  no toast shows. */
function useToastPlacement(): void {
  useEffect(() => {
    let frame = 0;
    let observer: MutationObserver | null = null;
    let sizes: ResizeObserver | null = null;
    let watched = new Set<Element>();
    const run = () => {
      frame = 0;
      const region = document.querySelector<HTMLElement>('[data-hub-toasts]');
      if (!region || !sizes) return;
      const now = new Set([region, ...place(region)]);
      // Only new elements are observed (each reports once when observed), so watching never loops.
      for (const el of watched) if (!now.has(el)) sizes.unobserve(el);
      for (const el of now) if (!watched.has(el)) sizes.observe(el);
      watched = now;
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    const EVENTS = ['scroll', 'transitionend', 'animationend'] as const;
    const stop = () => {
      leaveTray(document.querySelector<HTMLElement>('[data-hub-toasts]'));
      observer?.disconnect();
      sizes?.disconnect();
      observer = null;
      sizes = null;
      watched = new Set();
      window.removeEventListener('resize', later);
      window.visualViewport?.removeEventListener('resize', later);
      for (const e of EVENTS) document.removeEventListener(e, later, true);
    };
    const sync = () => {
      const showing = toastQueue().visibleToasts.length > 0;
      if (showing && !observer) {
        observer = new MutationObserver(later);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] });
        sizes = new ResizeObserver(later);
        window.addEventListener('resize', later);
        window.visualViewport?.addEventListener('resize', later);
        for (const e of EVENTS) document.addEventListener(e, later, { capture: true, passive: true });
      } else if (!showing && observer) stop();
      if (showing) later();
    };
    const off = toastQueue().subscribe(sync);
    sync();
    return () => {
      off();
      stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}

/** The toast region; AppShell renders it once. */
export function Toaster() {
  const t = useStrings(kitStrings);
  useToastPlacement();
  return (
    <ToastRegion queue={toastQueue()} className={s.region} aria-label={t('toast.region')} data-hub-toasts="">
      {({ toast }) => <ToastItem toast={toast} />}
    </ToastRegion>
  );
}

/**
 * The gallery's still view of toasts: the same toast items, from a queue of their own, laid out in place (no corner, no
 * timers). `toasts` is read once, when it mounts; closing one removes it.
 */
export function ToastPreview({ toasts, label }: { toasts: readonly ToastContentData[]; label: string }) {
  const [own] = useState(() => {
    const q = new ToastQueue<ToastContentData>();
    for (const c of [...toasts].reverse()) q.add(c);
    return q;
  });
  const shown = useSyncExternalStore(
    (fn) => own.subscribe(fn),
    () => own.visibleToasts,
    () => own.visibleToasts,
  );
  return (
    <ToastStateContext.Provider value={own}>
      <div className={s.preview} role="group" aria-label={label}>
        {shown.map((toast) => (
          <ToastItem key={toast.key} toast={toast} />
        ))}
      </div>
    </ToastStateContext.Provider>
  );
}
