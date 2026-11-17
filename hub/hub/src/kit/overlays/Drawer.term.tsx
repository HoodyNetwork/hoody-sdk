// Drawer in the terminal, on prim/Overlay's modal layer: a side sheet on the right, full height, over a
// dimmed page; sizes sm 60 / md 80 / lg 110 columns (480/640/880 px), never wider than the screen less the web's
// collapsed rail (56 px = 7 columns), so the rail strip and the start of the top bar stay in view; under the web's
// phone breakpoint (600 px = 75 columns) it takes the whole screen (Drawer.module.css `@media (width < 600px)`). Where the
// shell draws no sidebar (under SIDEBAR_MIN_COLS) there is no rail to keep: the drawer keeps no strip, and a page strip
// it would leave under MIN_PAGE columns (cut page text) is covered too. Header (‹ Back to…, title, subtitle, actions, ×),
// a scrolling body, and a footer: the outcome (or the reason line) on the left, then secondary, Cancel, primary.
//
// The web contract kept: every close (×, Esc, a press on the scrim, Cancel, a navigation) goes through requestClose:
// refused while busy (a refused navigation says why), asked first when dirty ("Discard changes?" inline in the footer,
// Keep editing focused, so Enter never discards; Esc on the question keeps editing too), never asked while a footer holds a pending change. useDrawer /
// DrawerCancel / reportOutcome / useDrawerParam are the shared ones (Drawer.shared.ts). A context end closes without
// asking. Width: a handle on the left edge (Tab to it) resizes by keys: ← / → 2 columns (Shift 8), Home / End, Enter
// back to the size's own; the width is kept per resizeKey for this process (a terminal has no browser storage).
//
// Not here: returnFocus / closeFocus (the opener keeps its focus: the page saw no key meanwhile), primaryOnPhone (the
// step's own primary stays where it is: a terminal cannot ask the step to hide it), the phone back arrow, className,
// overlayId, the drag resize, the reload confirm.
// Narrow terminals (the rule for every overlay; no phone sheet or tray): a Drawer goes full screen under 75 columns;
// a Popover, Menu, InfoTip or Tooltip stays anchored and is clamped inside the screen; a Dialog is clamped to the width.
import { focusInk } from '../../term/prim/FocusInk';
import { Children, Fragment, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import type * as Web from './Drawer';
import { Button } from '../controls/Button';
import { useStrings } from '../strings';
import { DrawerContext, drawsSomething, NavGuard, useDrawer, useDrawerReports, type DrawerApi } from './Drawer.shared';
import { useCloseOnContextEnd, useOverlayStack } from './shared';
import strings from './strings.en.json';
import { Box, PaneSize, Pressable, Scroll, SIDEBAR_MIN_COLS, Text, useFocusable, useKeys, useTerminalSize, isPressKey, type Key } from '../../term/prim';
import type { ScrollBoxRenderable } from '../../term/prim/otui';
import { Layer, useLayer } from '../../term/prim/Overlay';
import { Dom, RowItem } from '../../term/jsx/dom';
import { mergeRefs, useSem } from '../../term/prim/semantics';

export type { DrawerProps, DrawerSize, DrawerReportState } from './Drawer';
export { useDrawer, useDrawerParam } from './Drawer.shared';

/** Drawer widths in columns (the web's 480 / 640 / 880 px at 8 px a column). */
const SIZE_COLS: Record<Web.DrawerSize, number> = { sm: 60, md: 80, lg: 110 };
const MIN_COLS = 45;
/** The strip of page a drawer always leaves (the web's `calc(100vw - var(--sidebar-w-collapsed))`, 56 px). */
const RAIL_COLS = 7;
/** Where the shell draws no sidebar, the narrowest page strip a drawer leaves beside it; a narrower one is covered. */
const MIN_PAGE = 20;
/** Under this many columns the drawer takes the whole screen (the web's `@media (width < 600px)`). */
const FULL_BELOW = 75;
/** The web's data-narrow: a drawer drawn narrower than 480 px (60 columns) lays its footer out as a phone does. */
const NARROW_BELOW = 60;
/** A page's own footer (`footer`), as the web's `.foot`: one row whose page text (a span or paragraph beside the buttons:
 *  logs Explain's "Sends a new request…") is a flex item that shrinks and wraps, so the buttons keep their row. The row
 *  wraps in reverse, as the web's phone and data-narrow `.foot` (flex-wrap: wrap-reverse: buttons that cannot share a
 *  row stack, the last on top). Full screen or narrow that is the web's own rule; wider, the web's buttons fit by their
 *  pixels while four terminal buttons can need more cells than a 60-column drawer has (billing's held top-up: Cancel,
 *  Stop tracking, Send again, Check again ran 12 cells past the panel at 80 columns), so the row wraps there too, only when it must.
 *  Was: one row that ran past the panel. */
const FOOT_WRAP = { flexWrap: 'wrap-reverse', rowGap: 0 } as const;
/** A page element in the footer row when it sets no flex of its own. Narrow (the web's phone foot): it shrinks, and a
 *  note too long for the buttons' line takes its own. Wider: it takes the room the buttons leave and wraps inside it
 *  (basis 0, so the note never pushes a button to another line; under NOTE_MIN cells it takes its own line instead),
 *  which puts the buttons at the row's end, as the web's `justify-content: flex-end` does. */
const NOTE_MIN = 20;
const WEB_ITEM_NARROW = { flexShrink: 1, minWidth: 0 } as const;
const WEB_ITEM_WIDE = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: NOTE_MIN } as const;
function footItems(footer: ReactNode, narrow: boolean): ReactNode {
  // toArray keys every item, a single footer element included: the items are drawn as a list, and React warns about
  // a list child with no key.
  const items = Children.toArray(isValidElement(footer) && footer.type === Fragment ? (footer.props as { children?: ReactNode }).children : footer);
  // A web element (span, p, div) is a CSS flex item of this ROW: RowItem is the item and takes the element's own flex
  // (billing checkout's `.footReason { flex: 1 1 14rem }`), never against a column, where 14rem would be 28 ROWS of
  // height and the footer would cover the drawer's body. A kit control keeps its width.
  return items.map((c, i) => (isValidElement(c) && (typeof c.type === 'string' || c.type === Dom) ? <RowItem key={c.key ?? `f${i}`} item={narrow ? WEB_ITEM_NARROW : WEB_ITEM_WIDE}>{c}</RowItem> : c));
}
const STEP = 2;
const STEP_BIG = 8;
/** The widths people set, per resizeKey + size, for this process. */
const kept = new Map<string, number>();

export const DrawerCancel: typeof Web.DrawerCancel = ({ label, variant = 'secondary' }) => {
  const t = useStrings(strings);
  const drawer = useDrawer();
  return (
    <Button variant={variant} isDisabled={!drawer || drawer.busy} onPress={() => drawer?.requestClose()}>
      {label ?? t('cancel')}
    </Button>
  );
};

/** A button that takes the focus when it mounts (the ask's Keep editing). */
function FocusedButton({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'danger' }) {
  const f = useFocusable({ onKey: (k: Key) => { if (isPressKey(k)) { onPress(); return true; } return false; } });
  useEffect(() => { f.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const semRef = useSem({ name: label }, { role: 'button', focus: f });
  const ref = useMemo(() => mergeRefs(f.ref, semRef), [f.ref, semRef]);
  return (
    <Box dir="row" shrink={0} boxRef={ref} onPress={() => { f.focus(); onPress(); }}>
      <Text colour={tone === 'danger' ? 'danger' : 'ink'} {...focusInk(f.focused)}>[{label}]</Text>
    </Box>
  );
}

function HeadButton({ label, name, disabled, onPress }: { label: string; name: string; disabled: boolean; onPress: () => void }) {
  const layer = useLayer();
  return (
    <Pressable dir="row" shrink={0} disabled={disabled || layer?.settled === false} onPress={onPress} sem={{ name }}>
      {({ focused }) => <Text colour={disabled ? 'faint' : 'muted'} {...focusInk(focused)}>{label}</Text>}
    </Pressable>
  );
}

/** The width handle on the left edge: keys resize (the web's separator). */
function Resizer({ width, min, max, onWidth, onReset }: { width: number; min: number; max: number; onWidth: (w: number) => void; onReset: () => void }) {
  const layer = useLayer();
  const f = useFocusable({
    disabled: layer?.settled === false,
    onKey: (k) => {
      const step = k.shift ? STEP_BIG : STEP;
      if (k.name === 'left') onWidth(Math.min(max, width + step));
      else if (k.name === 'right') onWidth(Math.max(min, width - step));
      else if (k.name === 'home') onWidth(min);
      else if (k.name === 'end') onWidth(max);
      else if (k.name === 'return') onReset();
      else return false;
      return true;
    },
  });
  const { height } = useTerminalSize();
  const mid = Math.floor(height / 2);
  const line = Array.from({ length: height }, (_, i) => (f.focused && i === mid ? '◂' : f.focused && i === mid + 1 ? '▸' : '┃')).join('\n');
  return (
    <Box boxRef={f.ref} width={1} shrink={0} onPress={() => f.focus()}>
      <Text colour={f.focused ? 'focus' : 'lineStrong'}>{line}</Text>
    </Box>
  );
}

/** The screen-size facts of an open drawer (mounted only while open: a closed drawer listens to nothing). */
function Sized({ width, children }: { width: number; children: (s: { full: boolean; max: number; cols: number }) => ReactNode }) {
  const { width: cols } = useTerminalSize();
  return <>{children({ full: cols < FULL_BELOW, max: Math.max(MIN_COLS, cols - (cols >= SIDEBAR_MIN_COLS ? RAIL_COLS : 0)), cols })}</>;
}

type Ask = { kind: 'close' } | { kind: 'nav'; proceed: () => void; reset: () => void };

/** The scrolling body. It follows the focus (Tab), and PageUp / PageDown / Home / End scroll it when the focused control
 *  does not take the key, as a page's body does (layouts/termScroll): text below the last control was out of reach at
 *  80x24 (a free server panel's "Renewal and billing"). Inside the Layer, so only this drawer's keys. */
function DrawerBody({ topNote, children }: { topNote?: string | number | null; children?: ReactNode }) {
  const ref = useRef<ScrollBoxRenderable | null>(null);
  // topNote (DrawerProps): back to the top when what stands there changed, never on the first render.
  const seen = useRef(topNote);
  useEffect(() => {
    if (seen.current === topNote) return;
    seen.current = topNote;
    const r = ref.current;
    if (topNote !== null && topNote !== undefined && r && !r.isDestroyed) r.scrollTo(0);
  }, [topNote]);
  useKeys((k) => {
    const r = ref.current;
    // Nothing to scroll: the key goes on (to a handler inside the body, if one ever takes Page keys).
    if (!r || r.isDestroyed || k.meta || k.ctrl || r.scrollHeight <= r.viewport.height) return false;
    // The page body's steps (layouts/termScroll scrollStep; not imported: the import graph counts that file as web).
    if (k.name === 'pagedown') r.scrollBy(0.9, 'viewport');
    else if (k.name === 'pageup') r.scrollBy(-0.9, 'viewport');
    else if (k.name === 'home') r.scrollTo(0);
    else if (k.name === 'end') r.scrollTo(Number.MAX_SAFE_INTEGER);
    else return false;
    return true;
  });
  return <Scroll followFocus grow={1} shrink={1} scrollRef={ref}>{children}</Scroll>;
}

export const Drawer: typeof Web.Drawer = ({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  size = 'md',
  primary,
  secondary,
  outcome,
  reason,
  cancel,
  footer,
  actions,
  dirty = false,
  discardText,
  discardLabel,
  busy: busyProp = false,
  onBack,
  backLabel,
  resizeKey,
  topNote,
  children,
}) => {
  const t = useStrings(strings);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askPulse, setAskPulse] = useState(0);
  const asking = useCallback((next: Ask | null) => {
    if (next) setAskPulse((n) => n + 1);
    setAsk(next);
  }, []);
  const hasRouter = Boolean(useRouter({ warn: false }));
  const { reportOutcome, reported } = useDrawerReports();
  const busy = busyProp || reported.busy;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const asks = dirty && !reported.pending;
  const asksRef = useRef(asks);
  asksRef.current = asks;
  useOverlayStack('drawer', isOpen);
  useCloseOnContextEnd(isOpen, () => {
    asking(null);
    onOpenChange(false);
  });
  useEffect(() => {
    if (!isOpen || !asks) setAsk(null);
  }, [isOpen, asks]);
  const [busyRefused, setBusyRefused] = useState(false);
  useEffect(() => {
    if (!busy || !isOpen) setBusyRefused(false);
  }, [busy, isOpen]);
  useEffect(() => {
    if (busy && ask?.kind === 'nav') {
      ask.reset();
      setAsk(null);
      setBusyRefused(true);
    }
  }, [busy, ask]);
  const onNavBlock = useCallback((proceed: () => void, reset: () => void) => {
    if (busyRef.current) {
      reset();
      setBusyRefused(true);
      return;
    }
    if (!asksRef.current) {
      proceed();
      return;
    }
    asking({ kind: 'nav', proceed, reset });
  }, [asking]);
  // Esc while busy says why nothing closed, as the web's busy hint; it goes once the drawer is free or closed.
  const [escRefused, setEscRefused] = useState(false);
  if (escRefused && (!busy || !isOpen)) setEscRefused(false);
  const requestClose = useCallback(() => {
    if (busy) return;
    if (asks) asking({ kind: 'close' });
    else onOpenChange(false);
  }, [busy, asks, onOpenChange, asking]);
  const discard = () => {
    if (busyRef.current) return;
    const current = ask;
    setAsk(null);
    if (current?.kind === 'nav') current.proceed();
    else onOpenChange(false);
  };
  const keep = () => {
    if (ask?.kind === 'nav') ask.reset();
    setAsk(null);
  };

  // Width: the person's (kept per panel and size), else the size's own; never past the screen.
  const keyOf = `${resizeKey}.${size}`;
  const [own, setOwn] = useState<number | null>(() => kept.get(keyOf) ?? null);
  useEffect(() => { if (isOpen) setOwn(kept.get(keyOf) ?? null); }, [isOpen, keyOf]);
  const width = Math.max(MIN_COLS, own ?? SIZE_COLS[size]);
  const setWidth = (w: number) => { kept.set(keyOf, w); setOwn(w); };
  const resetWidth = () => { kept.delete(keyOf); setOwn(null); };

  const api = useMemo<DrawerApi>(() => ({ requestClose, dirty, busy, reportOutcome }), [requestClose, dirty, busy, reportOutcome]);
  const structured = primary !== undefined || secondary !== undefined || outcome !== undefined || reason !== undefined;
  const showCancel = cancel === undefined ? structured : cancel !== false;
  const cancelLabel = typeof cancel === 'string' ? cancel : undefined;
  const hasFooter = footer !== undefined || structured || showCancel;
  const reasonNode: ReactNode = reason !== undefined && reason !== null ? (typeof reason === 'string' ? <Text colour="muted">{reason}</Text> : reason) : null;

  return (
    <Layer
      open={isOpen}
      kind="modal"
      place={{ at: 'right', width, keep: RAIL_COLS, keepFrom: SIDEBAR_MIN_COLS, minPage: MIN_PAGE, fullBelow: FULL_BELOW }}
      frame="none"
      initialFocus="first"
      sem={{ role: 'dialog', name: title }}
      // Esc on the open question answers it the safe way (Keep editing), so a second Esc never asks the same question again.
      onEscape={busy ? () => setEscRefused(true) : ask ? keep : requestClose}
      onOutside={() => { if (!busy) requestClose(); }}
    >
      <DrawerContext.Provider value={api}>
        {hasRouter && isOpen && (dirty || busy) && <NavGuard onBlock={onNavBlock} />}
        <Sized width={width}>{({ full, max, cols }) => (
        <Box dir="row" grow={1}>
          {!full ? <Resizer width={Math.min(width, max)} min={MIN_COLS} max={max} onWidth={setWidth} onReset={resetWidth} /> : null}
          <Box grow={1} pad={{ left: 1, right: 1 }}>
            {/* Only the body scrolls: the head, rule, ask and footer never shrink. */}
            <Box dir="row" gap={1} shrink={0}>
              <Box grow={1}>
                {onBack && <HeadButton label={`‹ ${backLabel ?? t('back', { title })}`} name={backLabel ?? t('back', { title })} disabled={busy} onPress={onBack} />}
                <Text bold>{title}</Text>
                {subtitle !== undefined && subtitle !== null && (typeof subtitle === 'string' ? <Text colour="muted">{subtitle}</Text> : <Box dir="row">{subtitle}</Box>)}
              </Box>
              {actions !== undefined && actions !== null && <Box dir="row" gap={1} shrink={0}>{actions}</Box>}
              <HeadButton label={busy ? '×' : 'Esc ×'} name={busy ? t('busyHint') : t('close')} disabled={busy} onPress={requestClose} />
            </Box>
            {/* Fills the width it gets (never a counted rule that wraps when the panel is clamped). */}
            <Box height={1} shrink={0} border={['top']} borderColour="line" />
            <PaneSize shrink={1}><DrawerBody topNote={topNote}>{children}</DrawerBody></PaneSize>
            {(busyRefused || escRefused) && <Text colour="warn" shrink={0}>! {busyRefused ? t('busyLeave') : t('busyHint')}</Text>}
            {ask && !busy ? (
              <Box key={askPulse} dir="row" gap={2} border={['top']} borderColour="warn" shrink={0}>
                <Text colour="warn" bold grow={1}>! {discardText ?? t('discardAsk')}</Text>
                <FocusedButton label={t('keepEditing')} onPress={keep} />
                <FocusedButtonPlain label={discardLabel ?? t('discard')} onPress={discard} />
              </Box>
            ) : (
              hasFooter && (footer !== undefined ? (
                // The rule on its own box: the engine places wrap-reverse lines over a border of the wrapping box.
                <Box border={['top']} borderColour="line" shrink={0}>
                  <Box dir="row" gap={2} raw={FOOT_WRAP}>{footItems(footer, full || Math.min(width, max) < NARROW_BELOW)}</Box>
                </Box>
              ) : (
                <Box dir="row" gap={2} border={['top']} borderColour="line" shrink={0}>
                  <Box grow={1} shrink={1}>{drawsSomething(outcome) ? outcome : reasonNode}</Box>
                  {secondary}
                  {showCancel && <DrawerCancel {...(cancelLabel ? { label: cancelLabel } : {})} />}
                  {primary}
                </Box>
              ))
            )}
          </Box>
        </Box>
        )}</Sized>
      </DrawerContext.Provider>
    </Layer>
  );
};

/** The ask's Discard: the kit's danger button look, never focused first. */
function FocusedButtonPlain({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button tone="danger" onPress={onPress}>{label}</Button>;
}
