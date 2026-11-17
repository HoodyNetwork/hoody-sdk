// Drawer: a modal side panel for creating or editing one object; full screen on phones. Use Dialog instead for a
// confirm or a decision with at most 3 fields, and Sheet for a phone-only full-screen picker. React Aria gives the
// focus trap, Escape, scrim click and scroll lock; this adds the rest of the contract:
//   - sizes sm / md / lg, a head bar, a scrolling body, and a sticky footer with the Outcome slot at the start and
//     Cancel + primary at the end;
//   - the dirty guard: ×, Esc, scrim, Cancel, browser Back and leaving the page all ask
//     "Discard changes?" inline in the footer first (no second dialog); a reload gets the browser's own confirm;
//   - in flight (`busy`) nothing closes it, so the answer always has its place (C9); an unknown
//     outcome may be closed on, and the kit Outcome line (OutcomeSlot / FormFooter) leaves its
//     "may have gone through" toast behind;
//   - focus returns to the invoker, or to `returnFocus()` / the page title when it is gone;
//   - one drawer at a time (a sub-flow replaces the body and passes `onBack`);
//   - resizable: a separator on the inline-start edge, drag or keys (see DrawerResizer); the width
//     is remembered per panel on this browser and never exceeds the viewport less the rail; phones keep the full-screen sheet.
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useRouter } from '@tanstack/react-router';
import { Button, IconButton, cx } from '../controls/Button';
import { CardScopeReset } from '../layouts/CardEdge';
import { useStrings } from '../strings';
import { OverlayClosedNotice, useCloseOnContextEnd, useFocusReturn, useIsPhone, useOverlayStack, useScrollReach } from './shared';
import strings from './strings.en.json';
import s from './Drawer.module.css';
import footRow from './footRow.module.css';
// The context, the footers' reports and the URL-kept drawer hook are shared with the terminal build: Drawer.shared.ts.
import { type DrawerApi, DrawerContext, drawsSomething, NavGuard, useDrawer, useDrawerReports } from './Drawer.shared';

export { useDrawer, useDrawerParam } from './Drawer.shared';
export type { DrawerReportState } from './Drawer.shared';

export type DrawerSize = 'sm' | 'md' | 'lg';

export interface DrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One line under the title. */
  subtitle?: ReactNode;
  /** sm 480 (1-5 fields), md 640 (create forms), lg 880 (form with a section rail). Phones get the full screen. */
  size?: DrawerSize;
  /** The primary action, rightmost in the footer (a kit Button, `variant="primary"`). */
  primary?: ReactNode;
  /** Extra footer actions, left of Cancel. */
  secondary?: ReactNode;
  /** The kit Outcome line (`<Outcome>`; C9 state, "Saved"), on the left of the footer. */
  outcome?: ReactNode;
  /** A visible line at the footer's start: why the primary is off, in the gate's order
   *  (the first reason only), or what pressing it does. Shown at every width (touch has no hover); an `outcome` takes
   *  its place while there is one. Keep the primary a ReasonButton too, for focus and screen readers. Part of the
   *  structured footer: a custom `footer` replaces it (put the line in that footer). */
  reason?: ReactNode;
  /** A guided setup's primary: it lives in the open step's foot, and the drawer's sticky footer mirrors
   *  it while the drawer's body is under 600 px wide (`data-foot-primary` on the body then tells the step to hide its
   *  own; the footer then lays out as on a phone, the reason line above the buttons). Ignored when `primary` or a
   *  custom `footer` is given: the body is never marked when the footer cannot mirror it. */
  primaryOnPhone?: ReactNode;
  /**
   * The kit Cancel button (guarded by `dirty`, refused while `busy`). On by default with
   * `primary`/`outcome`; a string relabels it ("Close" once a secret was shown); `false` drops it.
   */
  cancel?: boolean | string;
  /** A free-form footer instead of primary/secondary/outcome (e.g. a FormFooter). */
  footer?: ReactNode;
  /** Header actions beside the close button. */
  actions?: ReactNode;
  /** The body holds unsaved input: every close asks first, inline in the footer (not while the footer holds a pending change: nothing can be discarded). */
  dirty?: boolean;
  /** The ask's sentence, e.g. "Close? These won't be shown again" for shown-once secrets. */
  discardText?: string;
  /** The ask's confirm label (default "Discard"). */
  discardLabel?: string;
  /** A send is in flight: × / Esc / scrim / Cancel wait for its answer. */
  busy?: boolean;
  /** A sub-flow replaced the body: the header's leading arrow calls this (and the × closes, on a phone too). */
  onBack?: () => void;
  /** The back arrow's name and tooltip, "Back to <the step it returns to>". */
  backLabel?: string;
  /** Focus target on close when the invoker is gone (the next row, say). Default: the page title. */
  returnFocus?: () => HTMLElement | null | undefined;
  /**
   * Focus target on close that wins over the invoker, for a close that took the person elsewhere on the page (a tile
   * that jumps to a section): a programmatic target (tabindex="-1"), focused without a scroll. null: the usual return.
   */
  closeFocus?: () => HTMLElement | null | undefined;
  /**
   * Names this panel for its remembered width. Required: every panel keeps its own width, and no two panels share
   * a key anywhere in the Hub (`Drawer.resizekeys.test.ts` checks it). The size joins the name. A component that wraps
   * a Drawer takes the key from its caller and forwards it.
   */
  resizeKey: string;
  /**
   * What the body's top now says, when that can change while the drawer is open (the notice a refused send puts above
   * the review): each time it changes to a value that is not null or undefined, the body scrolls back to its top, so
   * the notice is seen from wherever the press was made (a Confirm at the body's end). Nothing moves on open or when
   * the value goes back to null.
   */
  topNote?: string | number | null;
  className?: string;
  /** The overlay's name: `data-hub-overlay` on the open drawer's dialog element (see DialogProps.overlayId). */
  overlayId?: string;
  children: ReactNode;
}

/**
 * A Cancel button that closes the enclosing Drawer through its dirty guard. `variant="primary"` makes it the footer's
 * Done (nothing is left to send, as after a key is shown once): the same guarded close, drawn as the primary.
 */
export function DrawerCancel({ label, variant = 'secondary' }: { label?: string; variant?: 'primary' | 'secondary' }) {
  const t = useStrings(strings);
  const drawer = useDrawer();
  return (
    <Button chip={false} variant={variant} isDisabled={!drawer || drawer.busy} onPress={() => drawer?.requestClose()}>
      {label ?? t('cancel')}
    </Button>
  );
}

type Ask = { kind: 'close' } | { kind: 'nav'; proceed: () => void; reset: () => void };

export function Drawer({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  size = 'md',
  primary,
  secondary,
  outcome,
  reason,
  primaryOnPhone,
  cancel,
  footer,
  actions,
  dirty = false,
  discardText,
  discardLabel,
  busy: busyProp = false,
  onBack,
  backLabel,
  returnFocus,
  closeFocus,
  resizeKey,
  topNote,
  className,
  overlayId,
  children,
}: DrawerProps) {
  const t = useStrings(strings);
  const phone = useIsPhone();
  const resize = useDrawerWidth(isOpen, size, resizeKey);
  const [ask, setAskState] = useState<Ask | null>(null);
  // Focus before the ask, restored by Keep editing (the ask's buttons leave the DOM).
  const beforeAsk = useRef<Element | null>(null);
  const askOpen = useRef(false);
  // Counts every request for the ask: each one mounts the ask afresh (scroll into view, focus, flash).
  const [askPulse, setAskPulse] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  // topNote: back to the body's top when what stands there changed (not on the first render: a drawer opens at its top).
  const topNoteSeen = useRef(topNote);
  useEffect(() => {
    if (topNoteSeen.current === topNote) return;
    topNoteSeen.current = topNote;
    if (topNote !== null && topNote !== undefined && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [topNote]);
  // A body that scrolls with nothing focusable inside (every field disabled while a save is pending) takes
  // keyboard focus itself, so it can still be scrolled from the keyboard (axe scrollable-region-focusable).
  const bodyReach = useScrollReach(bodyRef, isOpen);
  const footPrimary = useFootPrimary(bodyRef, isOpen && footer === undefined && primary === undefined && drawsSomething(primaryOnPhone), phone);
  const setAsk = useCallback((next: Ask | null) => {
    // A second ask over an open one keeps the field focused before the first (its buttons hold focus now).
    if (next && !askOpen.current) beforeAsk.current = document.activeElement;
    askOpen.current = next !== null;
    if (next) setAskPulse((n) => n + 1);
    setAskState(next);
  }, []);
  const router = useRouter({ warn: false });
  const hasRouter = Boolean(router);
  // Read after a discarded navigation step settles: a same-page Back keeps the page mounted, so a drawer held in the
  // page's own state would otherwise stay open over a URL that moved on.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  // One entry per reporting footer (Drawer.shared.ts): one ending (or unmounting) never lifts another's busy.
  const { reportOutcome, reported } = useDrawerReports();
  const busy = busyProp || reported.busy;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const asksRef = useRef(false);
  // A footer holding a "may have gone through" change: nothing can be discarded (it may have
  // applied), so closing or leaving never asks; the footer's leave toast fires once, on the real close.
  const asks = dirty && !reported.pending;
  asksRef.current = asks;
  useOverlayStack('drawer', isOpen);
  useFocusReturn(isOpen, returnFocus, closeFocus);
  useCloseOnContextEnd(isOpen, () => {
    setAsk(null);
    onOpenChange(false);
  });

  useEffect(() => {
    if (!isOpen || !asks) setAsk(null);
  }, [isOpen, asks, setAsk]);

  // A navigation refused while a change runs: say why until it settles (never a Discard then).
  const [busyRefused, setBusyRefused] = useState(false);
  useEffect(() => {
    if (!busy || !isOpen) setBusyRefused(false);
  }, [busy, isOpen]);
  // Escape refused while a change runs (React Aria ignores it: isKeyboardDismissDisabled): say why until it settles, as
  // Dialog does. Any Escape inside this drawer counts, wherever focus sits; one inside a dialog stacked on top is that
  // dialog's.
  const [escRefused, setEscRefused] = useState(false);
  if (escRefused && (!busy || !isOpen)) setEscRefused(false);
  useEffect(() => {
    if (!isOpen || !busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const shell = bodyRef.current?.closest('[role="dialog"]');
      const inDialog = e.target instanceof Element ? e.target.closest('[role="dialog"], [role="alertdialog"]') : null;
      if (inDialog && inDialog !== shell) return;
      setEscRefused(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen, busy]);
  // A change that starts while a leave-ask is open withdraws it: Discard must not unmount a running change.
  useEffect(() => {
    if (busy && ask?.kind === 'nav') {
      ask.reset();
      setAsk(null);
      setBusyRefused(true);
    }
  }, [busy, ask, setAsk]);
  const onNavBlock = useCallback(
    (proceed: () => void, reset: () => void) => {
      if (busyRef.current) {
        reset();
        setBusyRefused(true);
        return;
      }
      if (!asksRef.current) {
        proceed();
        return;
      }
      setAsk({ kind: 'nav', proceed, reset });
    },
    [setAsk],
  );

  const requestClose = useCallback(() => {
    if (busy) return;
    if (asks) setAsk({ kind: 'close' });
    else onOpenChange(false);
  }, [busy, asks, onOpenChange, setAsk]);

  const discard = () => {
    if (busyRef.current) return;
    const current = ask;
    setAsk(null);
    if (current?.kind !== 'nav') {
      onOpenChange(false);
      return;
    }
    // Once the step has resolved, a drawer still mounted and still open (held in component state, the page kept) is
    // closed; one the step closed itself (open follows the URL) or a page that left gets no call.
    const after = () => {
      if (mounted.current && openRef.current) onOpenChangeRef.current(false);
    };
    const stop = router?.subscribe('onResolved', () => {
      stop?.();
      after();
    });
    current.proceed();
    if (!stop) window.requestAnimationFrame(after);
  };
  const keep = () => {
    if (ask?.kind === 'nav') ask.reset();
    setAsk(null);
    const back = beforeAsk.current;
    window.requestAnimationFrame(() => {
      if (back instanceof HTMLElement && back.isConnected && bodyRef.current?.closest('[role="dialog"]')?.contains(back)) back.focus();
      else bodyRef.current?.querySelector<HTMLElement>('input, textarea, select, button, [tabindex="0"]')?.focus();
    });
  };

  // Focus never sits on nothing while the drawer is open: when the focused control
  // goes away or is disabled (a save pending, the body swapping to an outcome), or the drawer opens onto a
  // disabled field, focus moves to the scrolling body when it takes focus, else the drawer itself (it holds
  // Escape and names itself). Never to a field: a combobox opens its list on focus. A focused ask button,
  // popover or nested dialog is left alone.
  useEffect(() => {
    if (!isOpen) return;
    const root = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!root) return;
    let frame = 0;
    const rescue = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!root.isConnected) return;
        const lost = !active || active === document.body || !active.isConnected || (root.contains(active) && active.matches(':disabled'));
        if (!lost) return;
        const body = root.querySelector<HTMLElement>('[data-drawer-body][tabindex="0"]');
        (body ?? root).focus();
      });
    };
    rescue();
    const watch = new MutationObserver(rescue);
    watch.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'tabindex'] });
    root.addEventListener('focusout', rescue);
    return () => {
      window.cancelAnimationFrame(frame);
      watch.disconnect();
      root.removeEventListener('focusout', rescue);
    };
  }, [isOpen]);

  const api = useMemo<DrawerApi>(() => ({ requestClose, dirty, busy, reportOutcome }), [requestClose, dirty, busy, reportOutcome]);
  const mirrored = footPrimary ? primaryOnPhone : undefined;
  const structured = primary !== undefined || secondary !== undefined || outcome !== undefined || reason !== undefined || mirrored !== undefined;
  const showCancel = cancel === undefined ? structured : cancel !== false;
  const cancelLabel = typeof cancel === 'string' ? cancel : undefined;
  const hasFooter = footer !== undefined || structured || showCancel;

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => (open ? onOpenChange(true) : requestClose())}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      className={s.scrim}
    >
      <Modal
        className={cx(s.drawer, s[size], !phone && resize.stored !== null && s.sized, className)}
        data-narrow={!phone && (resize.shown < NARROW_BELOW || footPrimary) ? '' : undefined}
        {...(!phone && resize.stored !== null ? { style: { '--drawer-w': `${resize.stored}px` } as CSSProperties } : {})}
      >
        <OverlayClosedNotice />
        <Dialog className={s.dialog} data-hub-overlay={overlayId} aria-label={title} aria-busy={busy || undefined}>
          <DrawerContext.Provider value={api}>
            <CardScopeReset>
              {/* Inside the dialog, so it is part of the named dialog; absolutely placed on the drawer's inline-start edge. */}
              {!phone && <DrawerResizer resize={resize} label={t('resize')} valueText={t('resizeValue', { width: resize.shown })} />}
              {hasRouter && isOpen && (dirty || busy) && <NavGuard onBlock={onNavBlock} />}
              {/* One grid with fixed slots (Drawer.module.css .head): [leading | title, subtitle | actions, ×]. At most one
                  leading control, never two back-looking arrows: a sub-flow's way back when there is one (the × then
                  closes, a phone too), else on a phone the arrow that closes. One close control in the DOM, never two of
                  one name left to a stylesheet. While busy it stays reachable, with why it waits as its reason
                  (soft-disabled), never a name swap. */}
              <header className={s.head} data-lead={onBack || phone ? '' : undefined}>
                {onBack ? (
                  <IconButton icon="arrow-left" label={backLabel ?? t('back', { title })} className={s.lead} isDisabled={busy} disabledReason={busy ? t('busyHint') : undefined} onPress={onBack} />
                ) : (
                  phone && <IconButton icon="arrow-left" label={t('close')} className={s.lead} isDisabled={busy} disabledReason={busy ? t('busyHint') : undefined} onPress={requestClose} />
                )}
                <Heading slot="title" className={s.title}>
                  {title}
                </Heading>
                {subtitle && <p className={s.subtitle}>{subtitle}</p>}
                {(actions || !phone || onBack) && (
                  <div className={s.trail}>
                    {actions}
                    {(!phone || onBack) && (
                      <IconButton
                        icon="x"
                        label={t('close')}
                        shortcut="Esc"
                        className={s.close}
                        isDisabled={busy}
                        disabledReason={busy ? t('busyHint') : undefined}
                        onPress={requestClose}
                      />
                    )}
                  </div>
                )}
              </header>
              <div ref={bodyRef} className={s.body} data-drawer-body="" data-foot-primary={footPrimary ? '' : undefined} {...(bodyReach ? { tabIndex: 0 } : {})}>
                {children}
              </div>
              {(busyRefused || escRefused) && (
                <p className={s.askText} role="status">
                  {busyRefused ? t('busyLeave') : t('busyHint')}
                </p>
              )}
              {ask && !busy ? (
                <AskFooter
                  key={askPulse}
                  text={discardText ?? t('discardAsk')}
                  keepLabel={t('keepEditing')}
                  discardLabel={discardLabel ?? t('discard')}
                  onKeep={keep}
                  onDiscard={discard}
                />
              ) : (
                hasFooter && (
                  <footer className={cx(s.foot, footRow.row)}>
                    {footer ?? (
                      <>
                        <div className={s.outcome}>
                          {drawsSomething(outcome) ? outcome :
                            (reason !== undefined && reason !== null && (
                              <p className={s.reason} data-drawer-reason="">
                                {reason}
                              </p>
                            ))}
                        </div>
                        {secondary}
                        {showCancel && <DrawerCancel {...(cancelLabel ? { label: cancelLabel } : {})} />}
                        {primary ?? mirrored}
                      </>
                    )}
                  </footer>
                )
              )}
            </CardScopeReset>
          </DrawerContext.Provider>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * The leave ask. Whenever it is asked for it comes into view, Keep editing takes focus (so Enter never discards by
 * accident) and the bar flashes once: the ask sits at the foot of a drawer whose close button is at the top, so it
 * must not be missed. While a phone's keyboard is open the drawer is sized to the visible viewport, so the ask is
 * not behind the keys.
 */
function AskFooter({
  text,
  keepLabel,
  discardLabel,
  onKeep,
  onDiscard,
}: {
  text: string;
  keepLabel: string;
  discardLabel: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    bar.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    bar.querySelector('button')?.focus();
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const drawer = bar.closest('[role="dialog"]')?.parentElement;
    if (!vv || !drawer) return;
    const fit = () => {
      if (vv.height < window.innerHeight - 1) {
        drawer.style.setProperty('--drawer-vv-h', `${vv.height}px`);
        drawer.style.setProperty('--drawer-vv-top', `${vv.offsetTop}px`);
      } else {
        drawer.style.removeProperty('--drawer-vv-h');
        drawer.style.removeProperty('--drawer-vv-top');
      }
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      drawer.style.removeProperty('--drawer-vv-h');
      drawer.style.removeProperty('--drawer-vv-top');
    };
  }, []);
  return (
    <footer ref={ref} className={cx(s.foot, s.ask)} role="alert" data-attention="">
      <span className={s.askText}>{text}</span>
      <span className={cx(s.askButtons, footRow.row)}>
        <Button variant="secondary" onPress={onKeep}>
          {keepLabel}
        </Button>
        <Button tone="danger" onPress={onDiscard}>
          {discardLabel}
        </Button>
      </span>
    </footer>
  );
}

// ── Resizing ────────────────────────────────────────────────────────────────────

const MIN_WIDTH = 360;
/** The widest a drawer is stored or drawn (a huge window never writes a width reading refuses). */
const MAX_WIDTH = 8000;
/** Under this body width (content box) a guided setup's primary moves to the sticky footer. */
const FOOT_PRIMARY_BELOW = 600;

function padInline(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  return (parseFloat(cs.paddingInlineStart) || 0) + (parseFloat(cs.paddingInlineEnd) || 0);
}

/** Whether the footer mirrors the open step's primary: the body's content is under 600 px (on a phone, or a drawer
 *  drawn or resized narrow). Before a width is known (no layout yet), the phone viewport decides. */
function useFootPrimary(bodyRef: RefObject<HTMLDivElement | null>, wanted: boolean, phone: boolean): boolean {
  const [narrow, setNarrow] = useState(phone);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!wanted || !body) return;
    const judge = () => {
      const w = body.clientWidth - padInline(body);
      setNarrow(w > 0 ? w < FOOT_PRIMARY_BELOW : phone);
    };
    judge();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(judge);
    ro.observe(body);
    return () => ro.disconnect();
  }, [bodyRef, wanted, phone]);
  return wanted && narrow;
}

/** Below this drawn width the footer lays out as on a phone (the discard ask and the buttons would not fit one row). */
const NARROW_BELOW = 480;
const KEY_STEP = 16;
const KEY_STEP_BIG = 64;
const SIZE_WIDTH: Record<DrawerSize, number> = { sm: 480, md: 640, lg: 880 };
/** The registered purge prefix of pane widths (core/registry.ts): a drawer's width leaves with the account like the list panes'. */
const STORE_PREFIX = 'hub.v3.pane.drawer.';

/** A token's px value (`--sidebar-w-collapsed`), or the fallback where the stylesheet is not loaded. */
function tokenPx(name: string, fallback: number): number {
  try {
    const v = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

/** A stored width: a whole number of px between the narrowest and the widest, else not stored (fails closed). */
function readStored(storeKey: string): number | null {
  try {
    const raw = window.localStorage.getItem(storeKey);
    if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
    const v = Number(raw);
    return v >= MIN_WIDTH && v <= MAX_WIDTH ? v : null;
  } catch {
    return null;
  }
}

function writeStored(storeKey: string, w: number | null): void {
  try {
    if (w === null) window.localStorage.removeItem(storeKey);
    else window.localStorage.setItem(storeKey, String(Math.round(w)));
  } catch {
    /* storage refused: the width lasts for this page only */
  }
}

interface DrawerWidth {
  /** The person's width in px, or null for the size's own. The CSS keeps a wide one inside the viewport. */
  stored: number | null;
  /** The width the separator reports: the stored (or the size's) width inside [min, max]. */
  shown: number;
  min: number;
  max: number;
  /** A width while dragging (not kept yet) or after a key (kept at once). */
  set: (w: number, keep: boolean) => void;
  keep: () => void;
  reset: () => void;
}

function useDrawerWidth(isOpen: boolean, size: DrawerSize, resizeKey: string): DrawerWidth {
  // The panel's name is read when the drawer opens (the page it opens on), not on every render.
  const storeKey = useMemo(() => (isOpen ? `${STORE_PREFIX}${resizeKey}.${size}.width` : null), [isOpen, resizeKey, size]);
  const [stored, setStored] = useState<number | null>(null);
  const [viewport, setViewport] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const latest = useRef<number | null>(null);
  useEffect(() => {
    const v = storeKey === null ? null : readStored(storeKey);
    latest.current = v;
    setStored(v);
  }, [storeKey]);
  useEffect(() => {
    if (!isOpen) return;
    const on = () => setViewport(window.innerWidth);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [isOpen]);
  const max = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, viewport - tokenPx('--sidebar-w-collapsed', 56)));
  const clamp = (w: number) => Math.min(max, Math.max(MIN_WIDTH, w));
  const shown = Math.round(clamp(stored ?? SIZE_WIDTH[size]));
  const set = useCallback(
    (w: number, kept: boolean) => {
      latest.current = w;
      setStored(w);
      if (kept && storeKey !== null) writeStored(storeKey, w);
    },
    [storeKey],
  );
  const keep = useCallback(() => {
    if (storeKey !== null && latest.current !== null) writeStored(storeKey, latest.current);
  }, [storeKey]);
  const reset = useCallback(() => {
    latest.current = null;
    setStored(null);
    if (storeKey !== null) writeStored(storeKey, null);
  }, [storeKey]);
  return { stored, shown, min: MIN_WIDTH, max, set, keep, reset };
}

/**
 * The drawer's resize separator (WAI-ARIA window splitter) on its inline-start edge. Its value is the drawer's width in
 * px. ArrowLeft moves the edge left (wider in a left-to-right page; the other way in a right-to-left one), 16 px a step
 * (Shift 64), Home the narrowest, End the widest, Enter or a double click the size's own width. A drag follows the
 * pointer and keeps its width when it ends. Pointer capture keeps a drag over an iframe in the body.
 */
function DrawerResizer({ resize, label, valueText }: { resize: DrawerWidth; label: string; valueText: string }) {
  const drag = useRef<{ id: number; x: number; w: number } | null>(null);
  const rtl = () => (document.documentElement.dir === 'rtl' ? -1 : 1);
  const clamp = (w: number) => Math.min(resize.max, Math.max(resize.min, Math.round(w)));
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    if (e.key === 'ArrowLeft') resize.set(clamp(resize.shown + step * rtl()), true);
    else if (e.key === 'ArrowRight') resize.set(clamp(resize.shown - step * rtl()), true);
    else if (e.key === 'Home') resize.set(resize.min, true);
    else if (e.key === 'End') resize.set(resize.max, true);
    else if (e.key === 'Enter') resize.reset();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    const drawn = e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
    drag.current = { id: e.pointerId, x: e.clientX, w: drawn > 0 ? drawn : resize.shown };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // The default of a pointer press is cancelled (no text selection while dragging), which also skips its focus: take it here, so the keys work after a drag.
    e.currentTarget.focus();
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    resize.set(clamp(d.w + (d.x - e.clientX) * rtl()), false);
  };
  const stop = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    resize.keep();
  };
  return (
    // A focusable separator is the window-splitter widget; the lint rules see a static role.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <div
      role="separator"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={resize.min}
      aria-valuemax={resize.max}
      aria-valuenow={resize.shown}
      aria-valuetext={valueText}
      className={s.resizer}
      onKeyDown={onKeyDown}
      onDoubleClick={resize.reset}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    />
  );
}
