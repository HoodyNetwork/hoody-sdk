// The Ask dock in a terminal (the web's shell/AskDock.tsx + AppShell's dock modes, in cells).
//   >= ASK_PANE_MIN_COLS columns: a pane on the right of the page, inside the shell's row (the page shrinks, never
//          unmounts). Its width is a pane width (kit/layouts/paneWidth.ts, key `hub.v3.pane.shell.ask`, web px), moved by
//          the rule on its left (PaneSeparator: ←/→, Home/End, Enter resets, mouse drag). The pane is a region, as on the
//          web from 768 px: Esc leaves it (focus back on the page, the dock stays open); Alt+J closes it.
//   below: a full-screen sheet on the overlay layer (the web's phone sheet): Esc or Alt+J closes it.
// Open/closed is kit/ask's useAskDock() (the same store the web and AskPanel use: a page's "Ask" button, AskPanel's
// Close, startAgentConversation all open or close this). The dock is its own FocusRoot: entering it takes the keys from
// the page's root (the page keeps its focused row, undrawn), leaving gives them back to the same row.
// Opening by any entry puts focus in the dock: the panel's registered focus (setAskFocus), else its first tab stop.
// What it shows: provideAskDock(render) when someone provided it (tests, a host), else src/ask's AskPanel, loaded on
// first open (src/ask itself is loaded at shell start, after the host env: loadAsk()).
import { Component, type ReactNode, type RefObject, Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AskDockFrameCtx, type AskDockFrame } from './askDockFrame';
import { isLocked } from '@core/shell';
import { DOCK_MAX, DOCK_MIN, useAskDock } from '@kit/ask';
import { focusFn } from '@kit/ask.pure';
import { PaneSeparator, usePaneWidth } from '@kit/layouts/PaneSeparator';
import { useStrings } from '@kit/strings';
import { Box, PaneSize, Text, useFocusControl, useFocusedNode, useKeys, type FocusControl, type FocusId } from '../prim';
import type { BoxRenderable } from '../prim/otui';
import { Layer, useEnteredKeys, useGlobalKey, useLayerCount } from '../prim/Overlay';
import { hubKey } from './hubKey';
import type { ShellKeymap } from './keymap';
import strings from './strings.en.json';

/** From this many columns the dock is a pane beside the page; below, a full-screen sheet. */
export const ASK_PANE_MIN_COLS = 120;
/** What the pane always leaves of the page (sidebar not counted), in columns. */
export const ASK_PAGE_MIN_COLS = 48;
/** Web px per column (the pane width store keeps web px, as PaneSeparator.term does). */
const CELL_PX = 8;
const RANGE = { min: DOCK_MIN, max: DOCK_MAX, def: 400 } as const;

const isChord = (k: { name?: string; ctrl?: boolean; meta?: boolean; option?: boolean; shift?: boolean; super?: boolean }) =>
  k.name === 'j' && (k.meta === true || k.option === true) && !k.ctrl && !k.shift && k.super !== true;

// ── What the dock shows ───────────────────────────────────────────────────────────────

let provided: (() => ReactNode) | null = null;
const providers = new Set<() => void>();
/** Puts `render` in the dock instead of src/ask's AskPanel (tests, a host with its own panel). Returns the undo. */
export function provideAskDock(render: () => ReactNode): () => void {
  provided = render;
  for (const l of providers) l();
  return () => { if (provided === render) { provided = null; for (const l of providers) l(); } };
}
const useProvided = () => useSyncExternalStore((l) => { providers.add(l); return () => providers.delete(l); }, () => provided, () => provided);

let askModule: Promise<typeof import('../../ask')> | null = null;
/** Loads src/ask once (its active-chat provider registers itself on load). Only after the host env is installed. */
export function loadAsk(): Promise<typeof import('../../ask')> {
  return (askModule ??= import('../../ask'));
}
const LazyPanel = lazy(() => loadAsk().then((m) => ({ default: () => <m.AskPanel /> })));

class DockBoundary extends Component<{ children: ReactNode; failed: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override componentDidCatch(e: unknown): void { console.error('ask dock:', e); }
  override render(): ReactNode { return this.state.failed ? this.props.failed : this.props.children; }
}

// ── The frame's state, for the panel ─────────────────────────────────────────────────

// In askDockFrame.ts (the panel's terminal parts read it from there, without importing this file).
export { useAskDockFrame, type AskDockFrame } from './askDockFrame';

/** Hands the dock root's focus control out. */
function CtlInto({ into }: { into: RefObject<FocusControl | null> }): null {
  into.current = useFocusControl();
  return null;
}

/** In the dock's root: a focus taken there by a click enters a pane that was not entered. */
function EnterOnFocus({ entered, enter }: { entered: boolean; enter: () => void }): null {
  useFocusedNode((node) => { if (node && !entered) enter(); });
  return null;
}

/** In the dock's root: the shell's chords (Ctrl+K, Alt+R, …) a dock control declined, as from the page. */
function ShellChords({ keymap }: { keymap: ShellKeymap }): null {
  const ctl = useFocusControl();
  useKeys((k) => (k.ctrl || k.meta || k.option ? keymap.capture(hubKey(k), ctl.inField()) : false));
  return null;
}

/** Inside the Suspense, after the panel: its effect runs once the panel is mounted (the panel's own effects, its
 *  focus registration among them, run first), however long the panel took to load. */
function PanelMounted({ on }: { on: () => void }): null {
  useEffect(() => { on(); }, []);
  return null;
}

function Body({ children, onPanel }: { children: ReactNode; onPanel: () => void }) {
  const tt = useStrings(strings);
  const render = useProvided();
  return (
    <DockBoundary failed={<Box padX={1}><Text colour="danger">{tt('dock.failed')}</Text></Box>}>
      <Suspense fallback={<Box padX={1}><Text colour="muted">{tt('dock.loading')}</Text></Box>}>
        {render ? render() : <LazyPanel />}
        <PanelMounted on={onPanel} />
      </Suspense>
      {children}
    </DockBoundary>
  );
}

// ── The slot ─────────────────────────────────────────────────────────────────────────

export interface AskDockSlotProps {
  /** The terminal's width. */
  width: number;
  /** Columns the sidebar (and its gap) take beside the page. */
  side: number;
  keymap: ShellKeymap;
  /** The page's focus: entering the dock remembers nothing of it (the page root keeps it), but a click on the page
   *  while the dock has the keys leaves the dock. Call with the page root's focused id on every change. */
  pageFocus: RefObject<((id: FocusId | null) => void) | null>;
}

/**
 * The dock, drawn by the shell inside its row (as the row's last child). Renders nothing while closed.
 */
export function AskDockSlot({ width, side, keymap, pageFocus }: AskDockSlotProps) {
  const tt = useStrings(strings);
  const dock = useAskDock();
  const pane = width >= ASK_PANE_MIN_COLS;
  const [entered, setEntered] = useState(false);
  const [px, setPx] = usePaneWidth('shell', 'ask', RANGE);
  const ctl = useRef<FocusControl | null>(null);
  const body = useRef<BoxRenderable | null>(null);
  // Counts the panel's mounts: a panel that loaded after the short looks below gave up still gets the focus.
  const [panelMounts, setPanelMounts] = useState(0);
  const saved = useRef<FocusId | null>(null);
  const layers = useLayerCount();
  const ownLayer = dock.isOpen && (pane ? entered : true);

  const leave = () => {
    if (!pane) { dock.close(); return; }
    saved.current = ctl.current?.current() ?? null;
    ctl.current?.blur();
    setEntered(false);
  };
  const { wrap, panel } = useEnteredKeys(dock.isOpen && pane && entered, leave);

  // Opened (any entry), or a sheet that became a pane while open: focus goes in.
  const wasOpen = useRef(false);
  const wasPane = useRef(pane);
  useEffect(() => {
    const opened = dock.isOpen && !wasOpen.current;
    const toPane = dock.isOpen && pane && !wasPane.current;
    wasOpen.current = dock.isOpen;
    wasPane.current = pane;
    if (!dock.isOpen) { setEntered(false); saved.current = null; return; }
    if (opened || toPane) setEntered(true);
  }, [dock.isOpen, pane]);

  // Into the dock once its root is drawn (after useEnteredKeys's own first-stop focus, which this refines): where it
  // was left, else the panel's own focus, else the first tab stop of the panel (never the width rule).
  const live = dock.isOpen && (pane ? entered : true);
  useEffect(() => {
    if (!live) return;
    // A sheet's root is drawn by the overlay layer a turn later than a pane's, and the panel itself loads lazily: with
    // nothing focused yet, look again (a few short turns), so the first key after opening is the composer's. A panel
    // slower than those turns is not waited for by time: its mount (panelMounts) runs this again.
    let id: ReturnType<typeof setTimeout>;
    const go = (left: number): void => {
      const c = ctl.current;
      if (c) {
        if (saved.current !== null) { c.restore(saved.current); saved.current = null; if (c.current() !== null) return; }
        if (focusFn?.() && c.current() !== null) return;
        if (!c.focusFirst(body.current)) c.focusFirst();
        if (c.current() !== null) return;
      }
      if (left > 0) id = setTimeout(() => go(left - 1), 30);
    };
    id = setTimeout(() => go(10), 0);
    return () => clearTimeout(id);
  }, [live, pane, panelMounts]);

  // A click on the page while the dock has the keys: back to the page (its click already moved the page's focus).
  pageFocus.current = (id) => { if (pane && entered && id !== null) { ctl.current?.blur(); setEntered(false); } };

  // Alt+J: open or close, from the page, a field, or inside the dock; not under a dialog, a menu or the lock screen.
  useGlobalKey((k) => {
    if (k.eventType === 'release' || !isChord(k)) return false;
    if (isLocked() || layers - (ownLayer ? 1 : 0) > 0) return false;
    dock.toggle();
    return true;
  });

  if (!dock.isOpen) return null;
  const frame: AskDockFrame = { mode: pane ? 'pane' : 'sheet', entered: pane ? entered : true, leave };
  const inner = (
    <AskDockFrameCtx value={frame}>
      <CtlInto into={ctl} />
      <ShellChords keymap={keymap} />
      {pane && <EnterOnFocus entered={entered} enter={() => setEntered(true)} />}
      <Box dir="row" grow={1} shrink={1} minWidth={0}>
        {pane && <PaneSeparator value={px} range={RANGE} onChange={setPx} dir={-1} label={tt('dock.resize')} />}
        <PaneSize dir="column" grow={1} shrink={1} minWidth={0} clip boxRef={body}>
          <Body onPanel={() => setPanelMounts((n) => n + 1)}>{null}</Body>
        </PaneSize>
      </Box>
    </AskDockFrameCtx>
  );

  if (!pane) {
    return (
      <Layer open kind="modal" place={{ at: 'full' }} frame="none" onEscape={() => dock.close()} initialFocus="none" sem={{ role: 'complementary', name: tt('dock.name') }}>
        {inner}
      </Layer>
    );
  }
  // The pane's columns: the stored width, never leaving the page less than ASK_PAGE_MIN_COLS.
  const cols = Math.max(DOCK_MIN / CELL_PX, Math.min(Math.round(px / CELL_PX), width - side - ASK_PAGE_MIN_COLS));
  return (
    <Box dir="column" width={cols} shrink={0} boxRef={panel} sem={{ role: 'complementary', name: tt('dock.name') }}>
      {wrap(inner)}
    </Box>
  );
}
