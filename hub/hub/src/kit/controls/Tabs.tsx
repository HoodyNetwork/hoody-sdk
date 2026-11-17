// Tabs: a strip of folder tabs (Tabs.module.css) over the panels they open, optionally sticky, the open tab in the URL
// (`param`). Use `SegmentedControl` instead for a choice that owns no panel. Standalone for pages that are not a
// DetailPage (account, a drawer with sections, a pane). On narrow containers the bar scrolls sideways with faded
// edges, and the current tab is scrolled into view.
import { type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref, type RefObject, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tab, TabList, TabPanel, Tabs as AriaTabs, type Key } from 'react-aria-components';
import { computerColor } from '@core';
import { Icon } from '../icons';
import { useSearchParam } from '../nav';
import { ActionMenu, type MenuEntry } from '../overlays/Menu';
import { motionOff } from '../perf';
import { useStrings } from '../strings';
import { cx } from './Button';
import strings from './tabs.strings.en.json';
import s from './Tabs.module.css';
import { badgeText, dropIndex } from './Tabs.pure';

// The pure rules live in Tabs.pure.ts (shared with the terminal); their names stay importable from here.
export { dropIndex } from './Tabs.pure';

export interface TabItem<K extends string = string> {
  id: K;
  /** A resolved string. */
  label: string;
  /** A small count or status after the label. */
  badge?: ReactNode;
  /**
   * The unit of a number badge, given its count: `(n) => (n === 1 ? 'task' : 'tasks')`. The badge then reads "3 tasks"
   * (at most 10 characters), and those words are the badge's part of the tab's name. A number badge is a number or a
   * count string ("12", "99+"); any other badge, and every badge without a unit, renders as given.
   */
  badgeUnit?: (n: number) => string;
  /** The panel. Omit on every item to render only the bar (the page draws the body itself). */
  content?: ReactNode;
  /** A route tab: the tab is a link (the page passes `value` from its own route). */
  href?: string;
  isDisabled?: boolean;
}

/**
 * Editable tabs: each handler turns its gesture on. Mouse, keyboard and touch reach every one:
 * rename by double-click, F2 or the ⋯ menu; reorder by drag, Alt+Shift+←/→ or the menu's Move left/right;
 * the ⋯ menu by its button (the open tab; `menuButton: false` drops it), a right-click or long press, or Shift+F10 / the menu key.
 * The page owns the list: it applies a rename or a move and passes the new `items`.
 */
export interface TabsEdit<K extends string = string> {
  /** A new name, trimmed; an empty or unchanged one is never sent. */
  onRename?: (id: K, label: string) => void;
  /** Move tab `id` to index `to` of `items`. */
  onMove?: (id: K, to: number) => void;
  /** The page's own entries for a tab's ⋯ menu (Duplicate, Delete…), after Rename and Move. */
  menu?: (id: K) => readonly MenuEntry[];
  /** A middle-click on an enabled tab (a browser's close-tab gesture), never while a tab is being renamed. A pointer
   *  shortcut only: the page offers the same action in the tab's ⋯ menu. */
  onMiddleClick?: (id: K) => void;
  /** Draw the ⋯ button after the tabs (default true). `false`: no button; the tab menu still opens on a tab (right-click,
   *  long press, Shift+F10, the menu key) and drops from that tab. The page then offers the same rows in a menu of its own. */
  menuButton?: boolean;
  /** The in-place rename as it goes: `{ id, draft }` when it starts and on each keystroke, `null` when it ends (kept
   *  or not). Said only on a change: never on mount, and never when the tabs unmount mid-rename (a page that drops its
   *  tabs with a rename open learns it from its own state). A page holds its data while a draft is typed, as its own
   *  rename dialog would. */
  onEditing?: (state: { id: K; draft: string } | null) => void;
  /** The longest name the rename field takes (the page's own limit): typing or pasting past it is cut there, as a
   *  page's rename dialog field does. Unset: no limit. */
  maxLength?: number;
}

/** What a page can ask of editable tabs from outside them (its own menu's Rename). */
export interface TabsEditHandle<K extends string = string> {
  /** Start the in-place rename of tab `id`, as F2 does (an enabled tab, with `edit.onRename`). It starts two frames later,
   *  after a menu it was chosen in has handed focus back, so the field keeps focus. */
  rename: (id: K) => void;
}

interface CommonProps<K extends string> {
  items: readonly TabItem<K>[];
  /** Accessible name of the tab bar. */
  label: string;
  /** Stick the bar to the top of its scroll container (under a detail header). */
  sticky?: boolean;
  /** Content shown after the tabs, at the bar's end (a count, a small action). */
  end?: ReactNode;
  /** A control on the strip's own row before the tabs (a page's menu of them). Never stacks, never scrolls. */
  before?: ReactNode;
  /** A control on the strip's own row right after the last tab, outside the scroll (a New tab button that stays in
   *  reach however many tabs there are). Never stacks, unlike `end`. */
  after?: ReactNode;
  /** The computer's colour: a band at the top of the bar, so it stays on screen with the sticky bar. Normalised
   * here; a missing or invalid colour draws nothing. */
  accent?: string;
  /** With `accent`: `always` (default) shows the band at every width; `narrow` only below 600 px of content, where a
   * detail header above the bar scrolls away and carries its own band at wider widths. */
  accentWhen?: 'always' | 'narrow';
  className?: string;
  panelClassName?: string;
  /**
   * Bar-only tabs (no item `content`): the page body for the open tab. It renders as that tab's
   * panel, so the tab names a panel that exists (aria-controls) and the body is labelled by the tab.
   * Without it, the tabs name no panel at all.
   */
  children?: ReactNode;
  /** Rename, reorder and a per-tab ⋯ menu. Without it the bar is plain. */
  edit?: TabsEdit<K>;
  /** With `edit`, the handle a page's own menu uses to start a rename in place. */
  editRef?: Ref<TabsEditHandle<K>>;
  /** A tab something the page drags (not a tab) would land on: drawn as a drop place. The page finds it under the
   *  pointer by the tab label's `data-tab-id`. */
  dropTargetId?: K | null;
  /** The bar shares its row with toolbar controls (a strip's own buttons beside it): the tabs reach --sp-2 below those
   *  controls, onto the line, the open tab --sp-2 taller than them with its label on their text line, and the `before`
   *  and `after` slots end --sp-2 above the line, level with the row's other controls. */
  toolbarRow?: boolean;
}

export interface TabsProps<K extends string = string> extends CommonProps<K> {
  /** The open tab (controlled). Ignored when `param` is set. */
  value?: K;
  onChange?: (value: K) => void;
  /** Keep the open tab in the URL under this search parameter (the first tab leaves it clean). */
  param?: string;
  /** With `param`: push a history entry per switch instead of replacing it. */
  push?: boolean;
}

/**
 * A sideways-scrolling strip (tabs, a section nav on a phone): fades the edges that have more beyond
 * them and keeps the current item in view (a cut label must never be the only sign of more).
 * Put `ref` on the scrolling element and `fadeClassName` in its classes; `current` is the current
 * item's key, `selector` finds its element inside the strip.
 */
export function useStripEdges<E extends HTMLElement = HTMLDivElement>(current: string | undefined, selector = '[data-selected]') {
  const { ref, edges } = useOverflowEdges<E>(current, selector);
  return { ref, edges, fadeClassName: cx(edges.start && s.fadeStart, edges.end && s.fadeEnd) };
}

/**
 * The chevron beside a side of a strip that has more, so the strip says so even when the fade lies over
 * empty space. Null while that side has nothing beyond it. `side` is logical: a press scrolls toward that side and
 * the chevron points to it, right to left as well (the direction is read at the press; the icon mirrors in CSS). A pointer shortcut only (hidden from assistive tech,
 * out of the tab order): keyboard users move with the arrow keys, which scroll the strip. Pair it with
 * `useStripEdges` and put it beside the scrolling element, in the same flex row, so it never covers a label.
 */
export function StripMore({ side, edges, scroller }: { side: 'start' | 'end'; edges: StripEdges; scroller: RefObject<HTMLElement | null> }) {
  if (!edges[side]) return null;
  const attention = side === 'start' ? edges.startBadge : edges.endBadge;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      data-more={side}
      data-attention={attention ? '' : undefined}
      className={s.more}
      onClick={() => {
        const el = scroller.current;
        if (!el) return;
        el.dispatchEvent(new Event(HAND_SCROLL));
        const rtl = getComputedStyle(el).direction === 'rtl';
        const toward = (side === 'start' ? -1 : 1) * (rtl ? -1 : 1);
        const step = Math.max(80, el.clientWidth * 0.6);
        const fromStart = Math.max(0, rtl ? -el.scrollLeft : el.scrollLeft);
        const rest = side === 'start' ? fromStart : el.scrollWidth - el.clientWidth - fromStart;
        // Within one step of the edge, an instant scroll aimed past it: the clamp lands on the edge even when the strip's
        // width changes on the way (a chevron mounting or unmounting).
        if (rest <= step) el.scrollTo({ left: toward * el.scrollWidth, behavior: 'auto' });
        else el.scrollBy({ left: toward * step, behavior: motionOff() ? 'auto' : 'smooth' });
      }}
    >
      <Icon name={side === 'start' ? 'chevron-left' : 'chevron-right'} size="sm" />
    </button>
  );
}

/**
 * Which sides of a strip have more beyond them, and which of those hide a badge: a tab's count or
 * mark wholly past that edge, so its chevron carries a dot instead of the badge going unseen ("Chat apps 2" on a phone).
 */
type StripEdges = { start: boolean; end: boolean; startBadge?: boolean; endBadge?: boolean };

/** Sent to a strip's scroller by a control outside it that scrolls it for the person (StripMore). */
const HAND_SCROLL = 'strip-hand-scroll';
const SCROLL_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/** Fade the edges that have more tabs beyond them, and keep the current tab visible. */
function useOverflowEdges<E extends HTMLElement = HTMLDivElement>(current: string | undefined, selector = '[data-selected]') {
  const ref = useRef<E>(null);
  const [edges, setEdges] = useState<StripEdges>({ start: false, end: false, startBadge: false, endBadge: false });
  // The person scrolled the strip since the current tab last changed: keeping it in view stops until it changes, so a
  // press is never undone when the other edge appears. Only input marks it (a sideways wheel, a touch, pen or
  // middle-button press, a mouse press on the strip's own scrollbar, a scroll key, a chevron), never a scroll event: a layout clamp or the hook's own write is not the person's.
  const byHand = useRef(false);
  const frame = useRef(0);
  const kept = useRef<string | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hand = () => {
      byHand.current = true;
      cancelAnimationFrame(frame.current);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 || e.shiftKey) hand();
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button === 1) hand();
      // A mouse press on a visible scrollbar of the strip itself (below its content box) is the start of a drag by hand.
      else if (e.button === 0 && e.target === el && el.offsetHeight > el.clientHeight && e.offsetY >= el.clientHeight) hand();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) hand();
    };
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = Math.abs(el.scrollLeft);
      // The strip's own chevrons (beside it, in its row) take their width from it. Overflow they alone cause is none:
      // hidden, they give that width back and the tabs fit, so a chevron never stays only because it is shown.
      let chevrons = 0;
      for (const c of el.parentElement?.children ?? []) if (c !== el && c.hasAttribute('data-more')) chevrons += (c as HTMLElement).offsetWidth;
      const over = max > chevrons + 1;
      const start = over && left > 1;
      const end = over && max - left > 1;
      // A badge wholly past an edge (screen sides, read back to logical ones for right to left).
      let leftBadge = false;
      let rightBadge = false;
      if (start || end) {
        const box = el.getBoundingClientRect();
        for (const b of el.querySelectorAll<HTMLElement>(`.${s.badge}`)) {
          const r = b.getBoundingClientRect();
          if (r.right <= box.left + 1) leftBadge = true;
          else if (r.left >= box.right - 1) rightBadge = true;
        }
      }
      const rtl = (start || end) && getComputedStyle(el).direction === 'rtl';
      const startBadge = start && (rtl ? rightBadge : leftBadge);
      const endBadge = end && (rtl ? leftBadge : rightBadge);
      setEdges((prev) => {
        const next = { start, end, startBadge, endBadge };
        return prev.start === start && prev.end === end && prev.startBadge === startBadge && prev.endBadge === endBadge ? prev : next;
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('pointerdown', onPointer);
    el.addEventListener('keydown', onKey);
    el.addEventListener(HAND_SCROLL, hand);
    // The overflow also changes inside a scroller of the same width, with no scroll: the tabs or items grow (a rename, a
    // late font) or one is added. So the scroller's children are watched too, those added later included.
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    ro?.observe(el);
    for (const child of el.children) ro?.observe(child);
    // The whole subtree is watched: a badge that moves from one tab to another of the same
    // width changes no size, yet which side hides a badge changes. Only the scroller's own children get a size watch.
    const mo = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver((records) => {
      for (const r of records) {
        if (r.target === el) {
          for (const n of r.addedNodes) if (n instanceof Element) ro?.observe(n);
          for (const n of r.removedNodes) if (n instanceof Element) ro?.unobserve(n);
        }
      }
      update();
    });
    mo?.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointer);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener(HAND_SCROLL, hand);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);
  useEffect(() => {
    // Keep the current tab clear of the faded edges, scrolling only the bar. A frame later: the
    // tab collection renders its items after the first commit.
    if (kept.current !== current) {
      kept.current = current;
      byHand.current = false;
    }
    if (byHand.current) return;
    frame.current = requestAnimationFrame(() => {
      const el = ref.current;
      const tab = el?.querySelector<HTMLElement>(selector);
      if (byHand.current || !el || !tab) return;
      const pad = 32;
      const box = el.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      if (r.left - pad < box.left) el.scrollLeft -= box.left - (r.left - pad);
      else if (r.right + pad > box.right) el.scrollLeft += r.right + pad - box.right;
    });
    return () => cancelAnimationFrame(frame.current);
    // Again when an edge appears or goes: its chevron narrows the bar; not after a scroll by hand.
  }, [current, selector, edges.start, edges.end]);
  return { ref, edges };
}

/**
 * The end slot moves to its own row under the strip when the tabs and the end do not fit on one row, so
 * it never squeezes the tab list. Both widths are natural ones (the list is max-content; the end is max-content,
 * capped at the bar), so the answer does not depend on where the end sits now.
 */
/** The strip's own controls beside its list (the ⋯ button, the before and after slots): direct children of this bar's strip. */
const ownSlots = (bar: Element): HTMLElement[] => [...bar.querySelectorAll<HTMLElement>(`:scope > .${s.strip} > .${s.tabMenu}`)];

function useEndStacks(
  bar: RefObject<HTMLDivElement | null>,
  endEl: RefObject<HTMLDivElement | null>,
  scroller: RefObject<HTMLDivElement | null>,
  on: boolean,
  slots: string,
): boolean {
  const [stacked, setStacked] = useState(false);
  const check = useRef(() => undefined as void);
  check.current = () => {
    const b = bar.current;
    const e = endEl.current;
    const list = scroller.current?.querySelector('[role="tablist"]');
    if (!on || !b || !e || !list) return setStacked(false);
    const cs = getComputedStyle(b);
    const inner = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    // Every control on this strip's row beside the list: the ⋯ button, and the before/after slots when they are set.
    // Only the strip's own (its direct children): an editable Tabs inside a slot or the end is never counted.
    const menu = ownSlots(b).reduce((w, el) => w + el.getBoundingClientRect().width, 0);
    const need = list.getBoundingClientRect().width + menu + (parseFloat(cs.columnGap) || 0) + e.getBoundingClientRect().width;
    setStacked(need > inner + 0.5);
  };
  // After every render (a tab, its label or the end's content may have changed), and on every resize of the bar, the
  // list, the end or the strip's own controls. Setting the same value again renders nothing. The controls come and go
  // (the ⋯ wrapper mounts once a tab can have a menu): every render observes the ones now drawn.
  const ro = useRef<{ obs: ResizeObserver; seen: Set<Element> } | null>(null);
  useLayoutEffect(() => {
    check.current();
    const r = ro.current;
    if (r && bar.current) for (const el of ownSlots(bar.current)) if (!r.seen.has(el)) { r.seen.add(el); r.obs.observe(el); }
  });
  useEffect(() => {
    if (!on || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => check.current());
    const seen = new Set<Element>();
    for (const el of [bar.current, endEl.current, scroller.current?.querySelector('[role="tablist"]'), ...(bar.current ? ownSlots(bar.current) : [])]) if (el) { seen.add(el); obs.observe(el); }
    ro.current = { obs, seen };
    return () => { obs.disconnect(); ro.current = null; };
  }, [on, bar, endEl, scroller, slots]);
  return on && stacked;
}

function TabsView<K extends string>({ items, label, sticky, end, before, after, accent, accentWhen = 'always', className, panelClassName, children, value, onChange, edit, editRef, dropTargetId, toolbarRow }: CommonProps<K> & { value: K | undefined; onChange: (v: K) => void }) {
  const current = items.some((x) => x.id === value && !x.isDisabled) ? value : items.find((x) => !x.isDisabled)?.id;
  const { ref, edges } = useOverflowEdges(current);
  const panels = items.some((x) => x.content !== undefined);
  const body = !panels && children !== undefined && current !== undefined;
  // Bar only, no body: React Aria still points the selected tab at a panel id, which would name an
  // element that does not exist (axe aria-valid-attr-value, critical). The bar draws no panel, so
  // its tabs name none. Strips on mount and when the bar turns panel-less; the observer below catches every later
  // set (a selection change sets the attribute again, late tabs arrive with it).
  const panelless = !panels && !body;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!panelless || !el) return;
    const strip = () => {
      for (const tab of el.querySelectorAll('[role="tab"][aria-controls]')) tab.removeAttribute('aria-controls');
    };
    strip();
    // The tab collection renders its items after the first commit: catch them as they arrive.
    const mo = new MutationObserver(strip);
    mo.observe(el, { subtree: true, childList: true, attributeFilter: ['aria-controls'] });
    return () => mo.disconnect();
  }, [panelless, ref]);
  const t = useStrings(strings);
  const barRef = useRef<HTMLDivElement>(null);
  const band = computerColor({ color: accent });
  const endRef = useRef<HTMLDivElement>(null);
  const stacked = useEndStacks(barRef, endRef, ref, Boolean(end), `${before !== undefined}|${after !== undefined}|${Boolean(edit) && edit?.menuButton !== false}`);
  const [editing, setEditing] = useState<K | null>(null);
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<K | null>(null);
  const [said, setSaid] = useState('');
  const dragged = useRef<K | null>(null);
  // The tab being dragged (drawn dimmed) and where it would land: a bar before or after the tab under the pointer.
  const [dragging, setDragging] = useState<K | null>(null);
  const [drop, setDrop] = useState<{ id: K; after: boolean } | null>(null);
  /** How the open menu was opened: on a tab (focus returns to the open tab) or by its ⋯ button. */
  const opener = useRef<'tab' | null>(null);
  const indexOf = (id: K) => items.findIndex((x) => x.id === id);
  const enabled = (id: K) => items.some((x) => x.id === id && !x.isDisabled);
  // The tab an event is about: the label under the pointer, or the focused tab's label for a key.
  const tabOf = (el: EventTarget | null): K | null => {
    const node = el instanceof Element ? el : null;
    const tab = node?.closest('[data-tab-id]') ?? node?.closest('[role="tab"]')?.querySelector('[data-tab-id]');
    const id = tab?.getAttribute('data-tab-id');
    return id !== null && id !== undefined && items.some((x) => x.id === id) ? (id as K) : null;
  };
  const editingRef = useRef<K | null>(null);
  editingRef.current = editing;
  // The rename's course for the page, only when it changes (the first render, with no rename, says nothing).
  const onEditing = useRef(edit?.onEditing);
  onEditing.current = edit?.onEditing;
  const saidEdit = useRef<string | null>(null);
  useEffect(() => {
    const now = editing === null ? null : JSON.stringify([editing, draft]);
    if (now === saidEdit.current) return;
    saidEdit.current = now;
    onEditing.current?.(editing === null ? null : { id: editing, draft });
  }, [editing, draft]);
  // The tab being renamed is gone (the page removed it): the rename ends, its draft dropped, and the page hears null.
  useEffect(() => {
    if (editing !== null && !items.some((x) => x.id === editing)) setEditing(null);
  }, [editing, items]);
  const labelEl = (id: K | undefined) => [...(ref.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])].find((el) => el.dataset.tabId === id);
  // Focus goes back to the open tab once a rename or a tab's menu ends: never to the body, the ⋯ button or a
  // tab that is not open (focusing a tab selects it). A frame later, after the field or menu has gone.
  // A rename that began meanwhile keeps focus in its field.
  const focusOpenTab = () =>
    requestAnimationFrame(() => {
      if (editingRef.current === null) labelEl(current)?.closest<HTMLElement>('[role="tab"]')?.focus();
    });
  // The rename field sits over the tab, outside it (a tab holds no other control): where to draw it.
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const startRename = (id: K) => {
    if (!edit?.onRename || !enabled(id)) return;
    const tab = labelEl(id)?.closest<HTMLElement>('[role="tab"]');
    const sc = ref.current;
    if (!tab || !sc) return;
    setMenuFor(null);
    const a = tab.getBoundingClientRect();
    const b = sc.getBoundingClientRect();
    setBox({ left: a.left - b.left + sc.scrollLeft, top: a.top - b.top, width: a.width, height: a.height });
    setDraft(items.find((x) => x.id === id)?.label ?? '');
    setEditing(id);
  };
  const stopRename = (keep: boolean) => {
    if (editing === null) return;
    const name = draft.trim();
    const was = items.find((x) => x.id === editing)?.label;
    setEditing(null);
    focusOpenTab();
    if (keep && name && name !== was) edit?.onRename?.(editing, name);
  };
  const move = (id: K, to: number) => {
    const from = indexOf(id);
    if (!edit?.onMove || from < 0 || to < 0 || to >= items.length || to === from) return;
    edit.onMove(id, to);
    setSaid(t('tabs.moved', { name: items[from]?.label ?? '', n: to + 1, total: items.length }));
  };
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!edit || editing !== null) return;
    const id = tabOf(e.target);
    if (id === null) return;
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (step !== 0 && e.altKey && e.shiftKey && edit.onMove) {
      e.preventDefault();
      e.stopPropagation();
      move(id, indexOf(id) + step);
    } else if (e.key === 'F2' && edit.onRename) {
      e.preventDefault();
      e.stopPropagation();
      startRename(id);
    } else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      e.stopPropagation();
      opener.current = 'tab';
      setMenuFor(id);
    }
  };
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const id = tabOf(e.target);
    if (id !== null) startRename(id);
  };
  // The middle button: its press would start the browser's autoscroll (held off on a tab); its click closes.
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 && edit?.onMiddleClick && tabOf(e.target) !== null) e.preventDefault();
  };
  const onAuxClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1 || !edit?.onMiddleClick || editing !== null) return;
    const id = tabOf(e.target);
    if (id === null || !enabled(id)) return;
    e.preventDefault();
    edit.onMiddleClick(id);
  };
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    const id = tabOf(e.target);
    if (id === null || editing !== null) return;
    e.preventDefault();
    opener.current = 'tab';
    setMenuFor(id);
  };
  // Where a drag over this event's tab would land: the side is the pointer's half of that tab (its reading order in a
  // right-to-left strip). In a gap between tabs, where the bar is drawn, it is the nearer tab's. Null off the tabs,
  // and on a spot that leaves the dragged tab where it is.
  const dropAt = (e: DragEvent<HTMLDivElement>): { id: K; after: boolean; to: number } | null => {
    const from = dragged.current === null ? -1 : indexOf(dragged.current);
    const hit = e.target instanceof Element ? e.target : null;
    let tab = hit?.closest('[role="tab"]') ?? null;
    if (!tab && hit && (hit === e.currentTarget || hit.getAttribute('role') === 'tablist')) {
      let best = Infinity;
      for (const el of e.currentTarget.querySelectorAll('[role="tab"]')) {
        const r = el.getBoundingClientRect();
        const d = Math.max(r.left - e.clientX, e.clientX - r.right, 0);
        if (d < best) [best, tab] = [d, el];
      }
    }
    const id = tabOf(tab);
    if (from < 0 || id === null || !tab) return null;
    const r = tab.getBoundingClientRect();
    const right = e.clientX >= r.left + r.width / 2;
    const after = getComputedStyle(tab).direction === 'rtl' ? !right : right;
    const to = dropIndex(from, indexOf(id), after);
    return to === null ? null : { id, after, to };
  };
  const endDrag = () => {
    dragged.current = null;
    setDragging(null);
    setDrop(null);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (dragged.current === null) return;
    const at = dropAt(e);
    if (at?.id !== drop?.id || at?.after !== drop?.after) setDrop(at && { id: at.id, after: at.after });
    // No drop where the tab would stay put: the pointer shows it, and no bar is drawn.
    if (!at) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setDrop(null);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const from = dragged.current;
    const at = dropAt(e);
    endDrag();
    if (from === null || !at) return;
    e.preventDefault();
    move(from, at.to);
  };
  // The menu hands focus back (to its button, or the tab it was opened on) a frame after it closes: a rename
  // chosen there starts after that, or the field would lose focus at once and end the edit.
  const afterMenu = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const menuTab = menuFor ?? current;
  const menuItems = (id: K | undefined): MenuEntry[] => {
    if (id === undefined) return [];
    const i = indexOf(id);
    const own = edit?.menu?.(id) ?? [];
    return [
      ...(edit?.onRename ? [{ id: 'tabs.rename', label: t('tabs.rename'), icon: 'pen' as const, shortcut: 'F2', isDisabled: !enabled(id), onAction: () => afterMenu(() => startRename(id)) }] : []),
      ...(edit?.onMove
        ? [
            { id: 'tabs.left', label: t('tabs.moveLeft'), icon: 'arrow-left' as const, shortcut: 'Alt+Shift+←', isDisabled: i <= 0, onAction: () => move(id, i - 1) },
            { id: 'tabs.right', label: t('tabs.moveRight'), icon: 'arrow-right' as const, shortcut: 'Alt+Shift+→', isDisabled: i >= items.length - 1, onAction: () => move(id, i + 1) },
          ]
        : []),
      ...(own.length > 0 ? ['-' as const, ...own] : []),
    ];
  };
  // The page's Rename runs after its own menu has handed focus back, like this bar's menu does (afterMenu).
  const renameNow = useRef(startRename);
  renameNow.current = startRename;
  useImperativeHandle(editRef, () => ({ rename: (id: K) => void requestAnimationFrame(() => requestAnimationFrame(() => renameNow.current(id))) }), []);
  // Without the ⋯ button the menu drops from the tab it is about, read when it opens and as it is placed.
  const buttonless = edit?.menuButton === false;
  const menuTabNow = useRef(menuTab);
  menuTabNow.current = menuTab;
  const tabAnchor = useMemo<RefObject<Element | null>>(
    () => ({
      get current() {
        const id = menuTabNow.current;
        const el = [...(ref.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])].find((x) => x.dataset.tabId === id);
        return el?.closest('[role="tab"]') ?? null;
      },
    }),
    [ref],
  );
  const editingItem = editing === null ? undefined : items.find((x) => x.id === editing);
  const renameField =
    editingItem && box ? (
      <input
        className={s.rename}
        style={{ left: box.left, top: box.top, width: Math.max(box.width, 96), height: box.height }}
        aria-label={t('tabs.renameLabel', { name: editingItem.label })}
        value={draft}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the person just asked to rename this tab
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        {...(edit?.maxLength !== undefined ? { maxLength: edit.maxLength } : {})}
        onChange={(e) => setDraft(edit?.maxLength !== undefined ? e.currentTarget.value.slice(0, edit.maxLength) : e.currentTarget.value)}
        onKeyDown={(e) => {
          // The strip's own keys (F2, moves, the menu) are not for the field.
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            stopRename(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            stopRename(false);
          }
        }}
        onBlur={() => stopRename(true)}
      />
    ) : null;
  const tabLabel = (x: TabItem<K>) => (
      <span
        className={s.label}
        data-tab-id={x.id}
        draggable={edit?.onMove && !x.isDisabled ? true : undefined}
        onDragStart={
          edit?.onMove && !x.isDisabled
            ? (e) => {
                dragged.current = x.id;
                setDragging(x.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', x.label);
              }
            : undefined
        }
        // Ends every drag: a drop, a drop elsewhere, Escape.
        onDragEnd={endDrag}
      >
        {x.label}
      </span>
  );
  return (
    <AriaTabs
      selectedKey={current}
      onSelectionChange={(k: Key) => {
        if (String(k) !== current) onChange(String(k) as K);
      }}
      className={cx(s.tabs, className)}
    >
      <div ref={barRef} className={cx(s.bar, sticky && s.sticky, band && s.hasAccent)} data-stacked={stacked || undefined} data-toolbar-row={toolbarRow ? '' : undefined}>
        {band && <span className={s.accent} aria-hidden="true" data-tab-accent={band} data-accent-when={accentWhen} style={{ ['--computer' as string]: band }} />}
        <div className={s.strip} data-hug={after !== undefined || undefined}>
          {before !== undefined && (
            <span className={s.tabMenu} data-tabs-before="">
              {before}
            </span>
          )}
          <StripMore side="start" edges={edges} scroller={ref} />
          <div
            ref={ref}
            className={cx(s.scroller, edges.start && s.fadeStart, edges.end && s.fadeEnd)}
            {...(edit ? { onKeyDownCapture, onDoubleClick, onContextMenu, onDragOver, onDragLeave, onDrop, onMouseDown, onAuxClick } : {})}
          >
            <TabList aria-label={label} className={s.list}>
              {items.map((x) => (
                <Tab key={x.id} id={x.id} href={x.href} isDisabled={x.isDisabled} className={s.tab} data-drop={drop?.id === x.id ? (drop.after ? 'after' : 'before') : undefined} data-dragging={dragging === x.id || undefined} data-drop-target={dropTargetId === x.id || undefined}>
                  {edit ? tabLabel(x) : <span className={s.label}>{x.label}</span>}
                  {x.badge !== undefined && <span className={s.badge}>{badgeText(x.badge, x.badgeUnit)}</span>}
                </Tab>
              ))}
            </TabList>
            {renameField}
          </div>
          <StripMore side="end" edges={edges} scroller={ref} />
          {after !== undefined && (
            <span className={s.tabMenu} data-tabs-after="">
              {after}
            </span>
          )}
          {edit && menuTab !== undefined ? (
            buttonless ? (
              <ActionMenu
                items={menuItems(menuTab)}
                label={t('tabs.actions', { name: items.find((x) => x.id === menuTab)?.label ?? '' })}
                trigger={null}
                anchor={tabAnchor}
                placement="bottom start"
                isOpen={menuFor !== null}
                onOpenChange={(o) => {
                  if (o) return;
                  setMenuFor(null);
                  // Every open is on a tab: focus goes back to the open tab, unless a rename chosen there takes it.
                  afterMenu(focusOpenTab);
                  opener.current = null;
                }}
              />
            ) : (
              <span className={s.tabMenu}>
                <ActionMenu
                  items={menuItems(menuTab)}
                  label={t('tabs.actions', { name: items.find((x) => x.id === menuTab)?.label ?? '' })}
                  size="sm"
                  isOpen={menuFor !== null}
                  onOpenChange={(o) => {
                    setMenuFor(o ? (menuFor ?? current ?? null) : null);
                    // Opened on a tab (right-click, Shift+F10): focus goes back to the open tab, unless a rename
                    // chosen there is taking it.
                    if (!o && opener.current === 'tab') afterMenu(focusOpenTab);
                    if (!o) opener.current = null;
                  }}
                />
              </span>
            )
          ) : null}
          {edit ? (
            <span className={s.srOnly} aria-live="polite">
              {said}
            </span>
          ) : null}
        </div>
        {end && (
          <div ref={endRef} className={s.end}>
            {end}
          </div>
        )}
      </div>
      {panels &&
        items.map((x) => (
          <TabPanel key={x.id} id={x.id} className={cx(s.panel, panelClassName)}>
            {x.content}
          </TabPanel>
        ))}
      {body && (
        // Keyed by the open tab: React Aria keeps a panel's first id, so without the key a switch leaves the tab naming
        // a panel id that does not exist (axe aria-valid-attr-value). The body is the open tab's, so it starts afresh on a switch.
        <TabPanel key={current} id={current} className={cx(s.bodyPanel, panelClassName)}>
          {children}
        </TabPanel>
      )}
    </AriaTabs>
  );
}

function UrlTabs<K extends string>({ param, push, onChange, ...rest }: CommonProps<K> & { param: string; push?: boolean; onChange?: (v: K) => void }) {
  const [value, setValue] = useSearchParam(param);
  const first = rest.items[0]?.id;
  return (
    <TabsView
      {...rest}
      value={value as K | undefined}
      onChange={(v) => {
        setValue(v === first ? undefined : v, { replace: !push });
        onChange?.(v);
      }}
    />
  );
}

/** The tab strip and its panels; with `param` the open tab lives in the URL, else it is controlled by `value`. */
export function Tabs<K extends string = string>({ param, push, value, onChange, ...rest }: TabsProps<K>) {
  if (param) return <UrlTabs {...rest} param={param} push={push} onChange={onChange} />;
  return <TabsView {...rest} value={value} onChange={(v) => onChange?.(v)} />;
}
