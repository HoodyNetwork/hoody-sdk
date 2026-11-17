// Toasts in the terminal: the same store (Toast.store.ts: one queue, showToast / showErrorToast / closeToast, the
// tone and action rules), drawn by Toaster as a stack in the bottom-right corner, newest at the bottom, above every
// layer. The shell mounts <Toaster /> once, as the web AppShell does.
//
// Timing is the web's: an ok / info / warn toast closes after its timeout (4 s), counted only while it shows and
// paused while the pointer is over the stack or the keyboard is in it; error, unknown and a toast with a FAQ link stay
// until closed. At most 3 show; the rest wait.
//
// A toast never takes the focus by itself. F6 enters the stack (the web's landmark key): Tab then moves between its
// buttons (Details, the action, ×), Enter presses, Esc or F6 leaves and the focus is back where it was. The stack's top
// toast's frame says "F6" in its top border while toasts show, so the key is found (no row of its own over the page). The mouse presses any button directly.
//
// Placement starts from the web's rule (toastPlacement, Toast.place.ts): the stack lifts above the controls of an open
// dialog or drawer that sit in its column, never higher than half the screen, else the top edge. In the terminal a
// drawer is often controls from top to bottom with only short runs of text between them, so the terminal's own rule
// is kept instead: the lowest such place that covers no control (text such as numbered steps may be covered); when
// every place covers one, the place covering the fewest, never the focused one (toastSpot). The controls are read from
// the semantics tree (dialog / alertdialog nodes, their buttons, links and fields) after each layout pass while toasts show.
// Not here: the web's dock and phone tray (no dock or tray in the terminal).
import { focusInk } from '../../term/prim/FocusInk';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import type * as Web from './Toast';
import { Button } from '../controls/Button';
import { FaqLink } from '../layouts/Faq';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { ErrorDetails } from './ErrorDetails';
import stateStrings from './strings.en.json';
import { runToastAction, toastQueue, type ToastContentData, type ToastTone } from './Toast.store';
import { createToastQueue } from './Toast.queue';
import { Box, Pressable, Text, useTerminalSize, type Colour } from '../../term/prim';
import { Above, TOP_Z, opaqueRaw, useEnteredKeys, useGlobalKey } from '../../term/prim/Overlay';
import { mergeRefs, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { useRenderer } from '../../term/prim/engine';
import type { BoxRenderable } from '../../term/prim/otui';
import type { Box as PlaceBox } from './Toast.place';

export { closeToast, showErrorToast, showToast } from './Toast.store';
export { toastPlacement, trayToastBudget, trayViewportHeight } from './Toast.place';
export type { ErrorToastOptions, ToastAction, ToastContentData, ToastTone } from './Toast.store';
export type { Box, ToastPlace, TrayBudget } from './Toast.place';

/** The stack's width in columns (the web's 360 px). */
const TOAST_COLS = 45;

/** The tone's mark (never colour alone) and colour; `unknown` is the pending clock. */
const MARK: Readonly<Record<ToastTone, string>> = { ok: '✓', info: 'i', warn: '!', error: '✗', unknown: '◷' };
const TONE: Readonly<Record<ToastTone, Colour>> = { ok: 'ok', info: 'blueText', warn: 'warn', error: 'danger', unknown: 'warn' };

type Queued = ReturnType<typeof toastQueue>['visibleToasts'][number];

/** The web's CONTROLS (button, a[href], input, textarea, select, [role=button], [contenteditable]) as roles. */
const CONTROL_ROLES: ReadonlySet<Role> = new Set<Role>(['button', 'link', 'textbox', 'searchbox', 'checkbox', 'switch', 'radio', 'combobox', 'slider', 'spinbutton', 'tab', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio']);

/** A control's cells, and whether it has the focus. */
type Control = PlaceBox & { focused: boolean };

/** The cells of every control inside an open dialog or drawer (the web's `[role=dialog] CONTROLS`). */
function overlayControls(tree: readonly SemNode[]): Control[] {
  const out: Control[] = [];
  const take = (ns: readonly SemNode[], inDialog: boolean): void => {
    for (const n of ns) {
      const d = inDialog || n.role === 'dialog' || n.role === 'alertdialog';
      const [x, y, w, h] = n.box;
      if (d && CONTROL_ROLES.has(n.role) && w > 0 && h > 0) out.push({ left: x, top: y, right: x + w, bottom: y + h, focused: n.states.focused === true });
      take(n.children, d);
    }
  };
  take(tree, false);
  return out;
}

/** Where the stack goes: its distance from the bottom, or the top edge. */
type Spot = { bottom: number } | { top: number };
const GAP = 1;

/**
 * The stack's place: of the places from the usual one up to the web's highest lift (half the
 * screen), then the top edge, the lowest that covers no control of an open dialog (static text may be covered). When
 * each covers one: the one covering the fewest, leaving the focused control clear when any place does.
 */
function toastSpot(o: { cols: number; rows: number; stack: number; width: number; controls: readonly Control[] }): Spot {
  const right = o.cols - GAP;
  const left = right - o.width;
  const max = Math.max(GAP, Math.min(o.rows / 2, o.rows - o.stack - GAP));
  const spots: Array<{ spot: Spot; top: number }> = [];
  for (let b = GAP; b <= max; b++) spots.push({ spot: { bottom: b }, top: o.rows - b - o.stack });
  spots.push({ spot: { top: GAP }, top: GAP });
  const under = (top: number): Control[] => o.controls.filter((c) => c.right > left && c.left < right && c.bottom > top && c.top < top + o.stack);
  const scored = spots.map((x) => { const c = under(x.top); return { spot: x.spot, n: c.length, focus: c.some((k) => k.focused) }; });
  const pool = scored.some((x) => !x.focus) ? scored.filter((x) => !x.focus) : scored;
  return pool.reduce((a, x) => (x.n < a.n ? x : a)).spot;
}

type QueueLike = Pick<ReturnType<typeof toastQueue>, 'subscribe' | 'visibleToasts' | 'close' | 'pauseAll' | 'resumeAll'>;

function useVisible(q: QueueLike): readonly Queued[] {
  return useSyncExternalStore((fn) => q.subscribe(fn), () => q.visibleToasts, () => q.visibleToasts);
}

/** `hint`: the stack's key, set into the top toast's frame (no row of its own over the page). */
function ToastItem({ toast, queue, timed, hint }: { toast: Queued; queue: QueueLike; timed: boolean; hint?: string }): ReactElement {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  const [busy, setBusy] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);
  const c = toast.content;
  const tone = c.tone ?? 'ok';
  // The timer runs only while the toast shows (React Aria's useToast: reset on show, pause on leave).
  useEffect(() => {
    if (!timed || !toast.timer || !toast.timeout) return;
    toast.timer.reset(toast.timeout);
    return () => toast.timer?.pause();
  }, [toast, timed]);
  const run = () => runToastAction(c, busy, { close: () => queue.close(toast.key), setBusy, setNoAnswer });
  return (
    // The frame's cells keep the ground under them; the card colour fills only inside it (prim/Overlay.ts: a
    // filled frame cell showed a band of card colour outside the line, a second edge). The hint sits on the top edge as
    // its own opaque strip (on a transparent frame the engine's title let the page show between its words).
    <Box border borderColour={TONE[tone]} raw={{ backgroundColor: 'transparent' }} clip={false}>
      {hint ? <Box absolute={{ top: -1, right: 1 }} z={1} bg="card" raw={opaqueRaw('card')}><Text colour={TONE[tone]} truncate>{` ${hint} `}</Text></Box> : null}
      <Box grow={1} bg="card" raw={opaqueRaw('card')} padX={1}>
        <Box dir="row" gap={1}>
          <Text colour={TONE[tone]} bold>{MARK[tone]}</Text>
          <Text bold grow={1}>{c.title}</Text>
          <Pressable shrink={0} onPress={() => queue.close(toast.key)}>
            {({ focused }) => <Text colour="muted" {...focusInk(focused)}>× {t('toast.dismiss')}</Text>}
          </Pressable>
        </Box>
        {c.body ? <Text colour="muted">{c.body}</Text> : null}
        {c.faq ? <Box dir="row"><FaqLink item={c.faq.item}>{c.faq.label}</FaqLink></Box> : null}
        {noAnswer ? <Text colour="warn">! {ts('toast.noAnswer')}</Text> : null}
        {c.details || c.action ? (
          <Box dir="row" gap={2}>
            {c.details ? <ErrorDetails error={c.details} mode="button" /> : null}
            {c.action ? <Button variant="ghost" size="sm" onPress={run} busy={busy}>{c.action.label}</Button> : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

/** The toast stack; the shell renders it once. */
export const Toaster: typeof Web.Toaster = () => {
  const shown = useVisible(toastQueue());
  const { width: cols, height: rows } = useTerminalSize();
  const [entered, setEntered] = useState(false);
  const [hover, setHover] = useState(false);
  const any = shown.length > 0;
  if (entered && !any) setEntered(false);
  const keys = useEnteredKeys(entered && any, () => setEntered(false));
  useGlobalKey((k) => {
    if (k.name !== 'f6') return false;
    if (!entered && !any) return false;
    // Shift+F6 from outside the stack is the previous area's key (the shell's regions), never the way in.
    if (k.shift && !entered) return false;
    setEntered((e) => !e);
    return true;
  });
  // Paused while the keyboard is in the stack or the pointer is over it (the web pauses on hover and on focus within).
  // Resumed only after a pause: the queue's resume restarts a running timer a second time.
  const paused = useRef(false);
  const hold = any && (entered || hover);
  useEffect(() => {
    if (hold && !paused.current) { toastQueue().pauseAll(); paused.current = true; }
    else if (!hold && paused.current) { toastQueue().resumeAll(); paused.current = false; }
  }, [hold, shown]);
  // The place against the open overlays' controls (toastSpot), measured after each layout pass while toasts show; a
  // changed result moves the stack (one more pass, which measures the same and stops). Held while the keyboard is in
  // the stack: the drawer's control then has no focus, and the stack must not move under the person's keys.
  const renderer = useRenderer();
  const [spot, setSpot] = useState<Spot>({ bottom: GAP });
  const own = useRef<BoxRenderable | null>(null);
  const inStack = useRef(entered);
  inStack.current = entered;
  const boxRef = useMemo(() => mergeRefs(keys.panel, own), [keys.panel]);
  if (!any && !('bottom' in spot && spot.bottom === GAP)) setSpot({ bottom: GAP });
  const width = Math.min(TOAST_COLS, Math.max(10, cols - 2));
  useEffect(() => {
    const n = own.current as (BoxRenderable & { onLifecyclePass?: (() => void) | null }) | null;
    if (!any || !n || !renderer) return;
    const pass = (): void => {
      if (n.isDestroyed || inStack.current) return;
      const next = toastSpot({ cols, rows, stack: n.height, width, controls: overlayControls(semanticsOf({ root: renderer.root })) });
      setSpot((s) => ('top' in s ? 'top' in next && s.top === next.top : 'bottom' in next && s.bottom === next.bottom) ? s : next);
    };
    const before = n.onLifecyclePass ?? null;
    n.onLifecyclePass = before ? () => { before(); pass(); } : pass;
    return () => { if (!n.isDestroyed) n.onLifecyclePass = before; };
  }, [any, renderer, cols, rows, width]);
  if (!any) return <></>;
  return (
    <Above>
      <Box
        absolute={{ ...spot, right: 1 }}
        width={width}
        maxHeight={Math.max(3, rows - 2)}
        z={TOP_Z}
        boxRef={boxRef}
        raw={{ onMouseOver: () => setHover(true), onMouseOut: () => setHover(false) }}
      >
        {/* Newest at the bottom, nearest the corner (the web's column-reverse). */}
        {keys.wrap([...shown].reverse().map((toast, i) => <ToastItem key={toast.key} toast={toast} queue={toastQueue()} timed {...(i === 0 ? { hint: entered ? 'Esc / F6 leave' : 'F6' } : {})} />))}
      </Box>
    </Above>
  );
};

/** The gallery's still view: the same items from a queue of their own, in place, no timers. */
export const ToastPreview: typeof Web.ToastPreview = ({ toasts, label }) => {
  const [own] = useState(() => {
    const q = createToastQueue<ToastContentData>({ maxVisibleToasts: Infinity });
    for (const c of [...toasts].reverse()) q.add(c);
    return q;
  });
  const shown = useVisible(own);
  return (
    <Box>
      <Text colour="muted">{label}</Text>
      {shown.map((toast) => <ToastItem key={toast.key} toast={toast} queue={own} timed={false} />)}
    </Box>
  );
};
