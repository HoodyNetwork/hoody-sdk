// The one scroll owner of a page region in the terminal (terminal-only; layouts and ScrollRegion use it).
// - Wheel scrolls it (the engine's scroll box).
// - PageUp / PageDown / Home / End (and ctrl-u / ctrl-d) scroll it when the focused control does not take the key:
//   the newest region mounted answers first (a detail pane over its list).
// - `keep`: the position is kept per key (a page's route) across navigation within one mount (a new mount starts at the top), as the web keeps a page's
//   scroll when you come back to it.
// - scrollTo(id): an anchor inside it (data id on a Box) is brought to the top (SettingsPage's section jump).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ScrollBoxRenderable } from '../../term/prim/otui';
import { revealTarget } from '../../term/prim/Scroll';
import { Scroll, useFocusControl, useFocusedNode, useKeys, type FocusControl, type Key, type ScrollProps } from '../../term/prim';
import { clearOfSticky, PageFlowRoot, stickyPadding } from '../../term/jsx/sticky';
import { sessionSlot } from '../../term/env/session';
import { OwnerCtx, RegionRowsCtx, type ScrollOwner } from './scrollOwner';

type Emitter = { on(e: 'change', f: (x: { position: number }) => void): void; off(e: 'change', f: (x: { position: number }) => void): void };

// Per mount (sessionSlot): a fresh mount, another account's or the next golden case's, opens every page at the top;
// a module-level map let one mount's places reach the next in the same process.
const keptOf = sessionSlot('layouts.keptScroll', () => new Map<string, number>());
/** Forget kept positions (tests). */
export function __resetKeptScroll(): void { keptOf().clear(); }

// Every mounted scroll owner, newest last: revealAnchor asks each for an anchor (focusSection, a deep link). `from`
// starts the next Tab at an anchor it holds, in the focus root it is drawn in.
const owners = new Set<{ owner: ScrollOwner; from(id: string): void }>();
/** Bring the anchor (an engine id on a Box) into view in whichever page scroll owner holds it. False: none does, or
 *  the one that does cannot show it (it sits in a pane hidden at this size). */
export function revealAnchor(id: string, align: 'start' | 'nearest' = 'start'): boolean {
  for (const o of [...owners].reverse()) if (o.owner.reveal(id, align)) return true;
  return false;
}
/** focusSection: bring the anchor to the top, as revealAnchor, and move the sequential-focus start to it. The web
 *  focuses the section's heading (tabIndex -1), so the next Tab goes to the first control in the section: here the focus
 *  is dropped and the next Tab goes to the first stop in or after the anchor, Shift-Tab to the last one before it
 *  (prim/focus.ts focusFrom). Revealing alone left the focus where it was: on a control that a tab change had removed,
 *  Tab went back to the sidebar. False: no owner holds it. */
export function landAnchor(id: string): boolean {
  for (const o of [...owners].reverse()) if (o.owner.reveal(id, 'start')) { o.from(id); return true; }
  return false;
}

// The contexts and the OwnScroll stand-down live in scrollOwner.tsx (React only), re-exported here.
export { OwnScroll, useRegionRows, useScrollOwner, type ScrollOwner } from './scrollOwner';

/** True for a key that scrolls a page. Returns the step in viewports (±0.9) or rows (±Infinity = an end). */
export function scrollStep(k: Pick<Key, 'name' | 'ctrl' | 'shift' | 'meta'>): { unit: 'viewport' | 'end'; by: number } | null {
  if (k.meta) return null;
  if (k.name === 'pagedown' || (k.ctrl && k.name === 'd')) return { unit: 'viewport', by: k.ctrl ? 0.5 : 0.9 };
  if (k.name === 'pageup' || (k.ctrl && k.name === 'u')) return { unit: 'viewport', by: k.ctrl ? -0.5 : -0.9 };
  if (k.name === 'home' && !k.ctrl) return { unit: 'end', by: -1 };
  if (k.name === 'end' && !k.ctrl) return { unit: 'end', by: 1 };
  return null;
}

export interface PageBodyProps extends Omit<ScrollProps, 'scrollRef' | 'children'> {
  /** Key the position is kept under (a route); none = not kept. */
  keep?: string;
  /** Answer the Page keys (default true; a nested region that has its own focus stop says false). */
  keys?: boolean;
  /** Told the new top row after every move, by wheel, key, a reveal or a restore (SettingsPage's scroll-spy). */
  onScroll?: (top: number, owner: ScrollOwner) => void;
  children?: ReactNode;
}

// The shell's route outlet (PageOutlet) is a page's scroll owner by default, so a page drawn without a kit layout still
// scrolls (wheel, Page keys, Tab follows the focus). A kit layout that draws its own PageBody claims the outlet: the
// outlet then stands down to a box exactly the viewport's height (no scroll, no keys), so its PageBody is bounded and is
// the one owner: never a scroll inside a scroll. The outlet keeps the same element when it stands down (no remount of
// the page); only the engine box's scroll axis and content height change.
const OutletCtx = createContext<{ claim(): () => void } | null>(null);

/** The shell's route outlet: the default scroll owner of the page under it. `keep`: the route, to keep its position. */
export function PageOutlet({ keep, children }: { keep?: string; children?: ReactNode }): ReactNode {
  const [claims, setClaims] = useState(0);
  const api = useMemo(() => ({ claim() { setClaims((n) => n + 1); return () => setClaims((n) => n - 1); } }), []);
  return (
    <OutletCtx.Provider value={api}>
      <OwnerScroll {...(keep !== undefined ? { keep } : {})} standDown={claims > 0}>{children}</OwnerScroll>
    </OutletCtx.Provider>
  );
}

/** A layout that bounds its own regions (a list pane that scrolls itself, a detail with its own PageBody) claims the
 *  outlet as a PageBody does: the outlet stands down to the viewport's height, so the layout's `grow` boxes are
 *  bounded and a kit list under it sees no scroll owner (it fills its pane and windows its rows). Without the claim
 *  the page root sat in the outlet's auto-height content: it grew as tall as its list, the page scrolled, and the
 *  list drew a second scroll inside it (long apps, schedules or logs lists; a full-height thumb in support).
 *  Inside a PageBody (OutletCtx null) it claims nothing: the layout then flows in that body. */
export function useOutletClaim(on = true): void {
  const outlet = useContext(OutletCtx);
  useLayoutEffect(() => (on ? outlet?.claim() : undefined), [outlet, on]);
}

export function PageBody(p: PageBodyProps): ReactNode {
  const outlet = useContext(OutletCtx);
  // Claimed before paint, so the outlet stands down in the same frame the page first draws.
  useLayoutEffect(() => outlet?.claim(), [outlet]);
  return <OutletCtx.Provider value={null}><OwnerScroll {...p} /></OutletCtx.Provider>;
}

type Up = { visible?: boolean; parent?: Up | null };
/** True when the node or an ancestor is not drawn (`visible: false`, which a Box `hidden` sets). */
function hiddenUp(node: unknown): boolean {
  for (let a = node as Up | null; a; a = a.parent ?? null) if (a.visible === false) return true;
  return false;
}

function OwnerScroll({ keep, keys = true, onScroll, children, standDown = false, ...rest }: PageBodyProps & { standDown?: boolean }): ReactNode {
  const ref = useRef<ScrollBoxRenderable | null>(null);
  const [regionRows, setRegionRows] = useState<number | null>(null);
  const { onSize: toldSize, ...scrollRest } = rest;
  const onSize = useCallback((w: number, h: number) => { setRegionRows(h); toldSize?.(w, h); }, [toldSize]);
  // Scroll anchoring (the web's overflow-anchor: auto) for a revealed anchor (a jump, a ?section= deep link): content
  // above it that changes size later (a table loading) would push it off its row while scrollTop stays. Each frame the
  // anchor keeps its row until the reader moves the scroll (wheel, keys, a focus that scrolls): any scrollTop the
  // anchor did not set ends it, as does a new reveal.
  // `row` null: not placed yet (revealed before layout, as a deep link's mount-time reveal: the engine scrolls it once
  // laid out); the first laid-out pass brings it into view and takes its row from there.
  // `seek`: a 'start' reveal asks for the first row, whatever row it got. On a page still short when it is revealed (a
  // deep link followed before the page's last rows were laid out) the scroll is clamped at the page's end and the
  // anchor sits lower (AI "Advanced" opened 2 rows short of its place in 5 of 8 draws). While it seeks, its row is not
  // kept: as the page grows below it, it moves up with the page's end. The seeking ends on the first row, or where it
  // stands when the reader acts (a focus they moved: a click, Tab; what they open then grows the page under their
  // hand and must not move it); from then on the row is kept as above. No timer: the same on a slow machine.
  const anchor = useRef<{ id: string; align: 'start' | 'nearest'; row: number | null; top: number; seek: boolean } | null>(null);
  const owner = useMemo<ScrollOwner>(() => ({
    reveal(id, align = 'start') {
      const r = ref.current;
      const n = r && !r.isDestroyed ? r.findDescendantById(id) : undefined;
      // An anchor under a hidden box (a list pane a one-pane detail hides, Box `hidden`) is not revealed: scrolling to
      // it shows nothing, and the caller then does what it does for an anchor that is not on the page (a FAQ link
      // unfolds the answer where it is, as the web's does for a question it cannot reach).
      if (!r || !n || hiddenUp(n)) return false;
      r.scrollChildIntoView(id, { align });
      const seek = align === 'start';
      anchor.current = r.scrollHeight > 0 ? { id, align, row: n.y - r.content.y - r.scrollTop, top: r.scrollTop, seek } : { id, align, row: null, top: 0, seek };
      return true;
    },
    by(n) { const r = ref.current; if (r && !r.isDestroyed) r.scrollBy(n); },
    top() { return ref.current?.scrollTop ?? 0; },
    offsetOf(id) {
      const r = ref.current;
      const n = r && !r.isDestroyed ? r.findDescendantById(id) : undefined;
      // Against the content's own top: both screen positions come from the same layout pass, so the answer holds even
      // when asked from the scroll notification, before the next layout has moved them.
      return r && n ? n.y - r.content.y : undefined;
    },
    rows() { return ref.current?.viewport.height ?? 0; },
    end() { const r = ref.current; return r && !r.isDestroyed ? Math.max(0, r.scrollHeight - r.viewport.height) : 0; },
  }), []);
  const told = useRef(onScroll);
  told.current = onScroll;
  // True while the pass below moves the scroll to hold a revealed anchor: not the reader's move, so onScroll (a
  // scroll-spy, which marks the last section at the page's end) is not told.
  const holding = useRef(false);
  useEffect(() => {
    // The bar part is an EventEmitter (engine: "change" with the new offset, after every move); its d.ts does not resolve
    // the base class here, so name the two calls used.
    const bar = ref.current?.verticalScrollBar as unknown as Emitter | undefined;
    if (!bar) return;
    const on = ({ position }: { position: number }) => { if (!holding.current) told.current?.(position, owner); };
    bar.on('change', on);
    return () => { bar.off('change', on); };
  }, [owner]);
  const onKey = useCallback((k: Key) => {
    const s = scrollStep(k);
    const r = ref.current;
    if (!s || !r || r.isDestroyed) return false;
    if (s.unit === 'end') r.scrollTo(s.by < 0 ? 0 : Number.MAX_SAFE_INTEGER);
    else r.scrollBy(s.by, 'viewport');
    return true;
  }, []);
  useKeys((k) => (keys && !standDown ? onKey(k) : false));
  // Focus moved (Tab, a click, focus()): the Scroll brings it into view; a sticky header or footer inside this owner
  // would still cover it, so it is moved clear of them too (the web gets this from scroll-padding on the page).
  useFocusedNode((node, how) => {
    const r = ref.current;
    // The reader moved the focus: a seeking anchor stays on the row it has. A focus dropped to nothing is not the
    // reader's move (landAnchor's own focusFrom right after its reveal, a focused control removed).
    const a = anchor.current;
    if (a?.seek && how !== 'auto' && node && r && !r.isDestroyed) {
      const n = a.row === null ? undefined : r.findDescendantById(a.id);
      if (n) { a.row = n.y - r.content.y - r.scrollTop; a.seek = false; }
    }
    if (standDown || how === 'auto' || !node || !r || r.isDestroyed) return;
    let inside = false;
    for (let p: { parent?: unknown } | null = node as unknown as { parent?: unknown }; p; p = (p.parent as { parent?: unknown } | null | undefined) ?? null) if (p === (r as unknown)) { inside = true; break; }
    if (!inside) return;
    const pad = stickyPadding(r, node);
    if (pad.top === 0 && pad.bottom === 0) return;
    const tgt = revealTarget(node, r); // a field's frame, so its label clears the sticky header too
    const at = clearOfSticky({ top: tgt.y - r.content.y, height: tgt.height }, r.scrollTop, r.viewport.height, pad);
    if (at !== r.scrollTop) r.scrollTo(at);
  });
  useEffect(() => {
    const r = ref.current as (ScrollBoxRenderable & { onLifecyclePass?: (() => void) | null }) | null;
    if (!r) return;
    const pass = (): void => {
      const a = anchor.current;
      if (!a || r.isDestroyed) return;
      const n = r.findDescendantById(a.id);
      if (!n) { anchor.current = null; return; }
      if (a.row === null) {
        if (r.scrollHeight === 0) return;
        r.scrollChildIntoView(a.id, { align: a.align });
        a.row = n.y - r.content.y - r.scrollTop;
        a.top = r.scrollTop;
        return;
      }
      // Where the scroll stands with the anchor on its row (seeking: the first row), as near as the page's ends allow.
      const end = Math.max(0, r.scrollHeight - r.viewport.height);
      const want = Math.min(Math.max(0, n.y - r.content.y - (a.seek ? 0 : a.row)), end);
      // Moved by someone else: kept only when that move put the anchor there (a second reveal of it, the engine's own
      // clamp when the page got shorter); else the reader scrolled, and the anchor is let go.
      if (r.scrollTop !== a.top) {
        if (r.scrollTop !== want) { anchor.current = null; return; }
        a.top = r.scrollTop;
        return;
      }
      if (want !== r.scrollTop) {
        holding.current = true;
        try { r.scrollTo(want); } finally { holding.current = false; }
        a.top = r.scrollTop;
      }
      // Seeking: the row it has now is the one kept once the reader acts; on the first row the seeking is over.
      if (a.seek) { a.row = n.y - r.content.y - r.scrollTop; if (a.row <= 0) a.seek = false; }
    };
    const before = r.onLifecyclePass ?? null;
    r.onLifecyclePass = before ? () => { before(); pass(); } : pass;
    return () => { anchor.current = null; if (!r.isDestroyed) r.onLifecyclePass = before; };
  }, []);
  const focusCtl = useFocusControl();
  useEffect(() => {
    if (standDown) return;
    const entry = {
      owner,
      from(id: string) {
        const r = ref.current;
        const n = r && !r.isDestroyed ? r.findDescendantById(id) : undefined;
        if (n) focusCtl.focusFrom(n as unknown as Parameters<FocusControl['focusFrom']>[0]);
      },
    };
    owners.add(entry);
    return () => { owners.delete(entry); };
  }, [owner, standDown, focusCtl]);
  // Standing down: the content is the viewport's height and does not scroll (the claiming PageBody inside is bounded).
  // It still follows the focus (followFocus stays on): Tab's clipping check (prim/focus.ts clippedAway) skips a node
  // hidden by a scroll that does not, which would hide everything below the inner fold; with no room to scroll, the
  // follow clamps to the top and moves nothing.
  useLayoutEffect(() => {
    const r = ref.current;
    if (!r || r.isDestroyed) return;
    if (standDown) r.scrollTo(0);
    r.scrollY = !standDown;
    (r as unknown as { contentOptions: Record<string, unknown> }).contentOptions = { flexDirection: 'column', height: standDown ? '100%' : 'auto' };
  }, [standDown]);
  // The newest scroll node, kept after every layout: the way-out below remembers the position of the node drawn last
  // (it may have been replaced since the restore ran), not of the one the restore saw.
  const newest = useRef<ScrollBoxRenderable | null>(null);
  useLayoutEffect(() => { if (ref.current) newest.current = ref.current; });
  // Restore once laid out; remember on the way out.
  useEffect(() => {
    if (!keep) return;
    const r = ref.current;
    const at = keptOf().get(keep);
    // A route with no kept position starts at the top (the shell's outlet outlives a page change; a PageBody is new).
    if (r && !r.isDestroyed) r.scrollTo(at ?? 0);
    const last = newest;
    return () => { const x = last.current ?? r; if (x && !x.isDestroyed) keptOf().set(keep, x.scrollTop); };
  }, [keep]);
  return (
    <OwnerCtx.Provider value={standDown ? null : owner}>
      {/* A compat page root drawn straight in a scrolling owner lays out as in the web's block scroll container
          (jsx/dom.ts: no shrinking to the viewport); a stood-down outlet scrolls nothing, so it says false. */}
      <Scroll dir="column" grow={1} minHeight={0} followFocus {...scrollRest} onSize={onSize} scrollRef={ref}>
        <RegionRowsCtx.Provider value={regionRows}><PageFlowRoot.Provider value={!standDown}>{children}</PageFlowRoot.Provider></RegionRowsCtx.Provider>
      </Scroll>
    </OwnerCtx.Provider>
  );
}
