// ModelPickList: the one model picker's list. A virtualized single-select
// listbox over a PickView (modelPickLogic): only the rows near the viewport are drawn, so 7,077 models scroll as one
// list with no paging.
//
// Contract (ModelListbox's, kept):
//   - Each heading's rows are a role="group" named by that heading (never an option). Options are role="option" with
//     a stable id (list id + hashed spec), aria-selected only for the caller's value, aria-describedby = state text.
//   - aria-posinset / aria-setsize are the option's place among ALL options of the view (headings not counted), so
//     "214 of 7,077" is true while only a screenful is drawn.
//   - Focus is DOM focus with a roving tabIndex (no aria-activedescendant): the focused option, else the value, else
//     the first option is the tab stop. Arrows (no wrap), Home/End, PageUp/PageDown by 10, Enter/Space activate,
//     every printable key goes to `onType` (the search), Escape asks `onEscape`. One tab stop.
//   - Always drawn, whatever the scroll: the tab stop, the option focus is moving to, and the heading of each drawn
//     row (the heading in force sticks at the top). A move to an option far away draws it, scrolls to it, then
//     focuses it.
//   - Layout is in flow with exact fixed heights: an undrawn run is one aria-hidden spacer of its exact height, so
//     a group's box spans its real extent and its heading sticks only while its own rows pass.
//   - Focus that was in the list stays in it across a view change: the focused option moved to another
//     section is refocused where it now is; one that left the view hands focus to the nearest survivor. A move still
//     waiting for its target to be drawn is dropped when the target leaves the view or focus leaves the list. An asked
//     focus (focusToken) wins over both.
//   - No interactive element inside an option or a heading (stars and Set up live outside the list).
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../controls/Button';
import { useInnerWheel } from '../overlays/innerWheel';
import { type ListOption, ModelOption, optionId, specHash } from './ModelListbox';
import type { PickItem, PickView } from './modelPickLogic';
import v from './ModelPickList.module.css';

export type OptionItem = Extract<PickItem, { kind: 'row' | 'inherit' }>;
export type HeadingItem = Extract<PickItem, { kind: 'heading' }>;

export interface ModelPickListProps {
  id: string;
  labelledBy: string;
  describedBy?: string;
  view: PickView;
  /** The caller's value (aria-selected: '' is the inherit row; null nothing). Selection never follows focus. */
  value: string | null;
  /** The option's words and state for one item (the inherit row's spec is ''). */
  option: (item: OptionItem) => ListOption;
  /** Change it whenever `option` may answer differently for the same item (words it reads besides the item): a drawn
   *  option's words are cached per item, selection, set size and this key. */
  optionKey?: string;
  /** A heading's content; its text names the group. */
  heading: (item: HeadingItem) => ReactNode;
  /** Exact heights in px (a row is fixed: the virtualizer's sizes are the layout's). */
  rowHeight: number;
  headingHeight: number;
  /** Rows drawn beyond the viewport on each side. */
  overscan?: number;
  locked?: boolean;
  onActivate: (spec: string) => void;
  onType?: (ch: string) => void;
  onEscape?: () => boolean;
  /** Move DOM focus to this option when `focusToken` changes (the panel returns from setup, a filter changed). */
  focusSpec?: string | null;
  focusToken?: number;
  className?: string;
  /** Test probe: called each time an option renders. */
  renderProbe?: (spec: string) => void;
}

const PAGE_STEP = 10;
const specOf = (it: OptionItem): string => (it.kind === 'inherit' ? '' : it.row.spec);

export function ModelPickList(p: ModelPickListProps) {
  const { id, labelledBy, describedBy, view, rowHeight, headingHeight, locked, focusSpec, focusToken, renderProbe } = p;
  const items = view.items;
  const boxRef = useRef<HTMLDivElement>(null);
  // The list takes the wheel while the pointer is on it, also mid-run of the host's scroll.
  useInnerWheel(boxRef);

  // Options in order (item index of each), the item index of each spec, and exact offsets.
  const { optIdx, idxOfSpec, offset, heads } = useMemo(() => {
    const optIdx: number[] = [];
    const idxOfSpec = new Map<string, number>();
    const offset = new Float64Array(items.length + 1);
    const heads: number[] = [];
    items.forEach((it, i) => {
      offset[i + 1] = offset[i]! + (it.kind === 'heading' ? headingHeight : rowHeight);
      if (it.kind === 'heading') heads.push(i);
      else {
        optIdx.push(i);
        idxOfSpec.set(specOf(it), i);
      }
    });
    return { optIdx, idxOfSpec, offset, heads };
  }, [items, rowHeight, headingHeight]);
  const specs = useMemo(() => optIdx.map((i) => specOf(items[i] as OptionItem)), [optIdx, items]);

  const [active, setActive] = useState<string | null>(null);
  const lastPos = useRef(0);
  const hadFocus = useRef(false);
  const pending = useRef<string | null>(null);
  const [, bump] = useState(0);

  const selected = p.value !== null && idxOfSpec.has(p.value) ? p.value : null;
  const stop = active !== null && idxOfSpec.has(active) ? active : (selected ?? specs[0] ?? null);
  // Kept drawn: the tab stop, an option focus is moving to (read each render: a move bumps one) and the
  // caller's value, so its aria-selected stays in the tree wherever focus goes.
  const keep: number[] = [];
  for (const sp of [stop, pending.current, selected]) {
    const i = sp === null ? undefined : idxOfSpec.get(sp);
    if (i !== undefined) keep.push(i);
  }
  const keepKey = keep.join(',');

  const rangeExtractor = useCallback(
    (range: Range) => {
      const set = new Set(defaultRangeExtractor(range));
      for (const i of keep) set.add(i);
      // The heading of every drawn row (the one in force sticks).
      for (const i of [...set]) {
        const h = view.headingOf[i] ?? -1;
        if (h >= 0) set.add(h);
      }
      return [...set].sort((a, b) => a - b);
    },
    [keepKey, view.headingOf], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => boxRef.current,
    estimateSize: (i) => (items[i]?.kind === 'heading' ? headingHeight : rowHeight),
    getItemKey: (i) => items[i]?.key ?? i,
    overscan: p.overscan ?? 8,
    rangeExtractor,
  });
  const drawn = virtualizer.getVirtualItems().map((x) => x.index);

  const focusSpecNow = useCallback(
    (spec: string | undefined) => {
      if (spec === undefined) return;
      const el = document.getElementById(optionId(id, spec));
      if (el) {
        el.focus();
        pending.current = null;
        return;
      }
      // Not drawn yet: keep it drawn, scroll to it, focus after the next render.
      pending.current = spec;
      const i = idxOfSpec.get(spec);
      if (i !== undefined) virtualizer.scrollToIndex(i, { align: 'auto' });
      bump((n) => n + 1);
    },
    [id, idxOfSpec, virtualizer],
  );

  // An asked focus is the pair (focusToken, focusSpec): it is served once, as soon as both are given, whichever arrives
  // last; while it waits to be served it wins over the move and the recoveries below.
  const servedToken = useRef<number | null>(null);
  const askPending = () => focusToken !== undefined && focusToken !== servedToken.current && focusSpec !== undefined && focusSpec !== null;

  // Focus that leaves the list on purpose (to another control, or a press anywhere outside it) ends its claim: no
  // recovery pulls it back and a pending move is dropped. Read from focusin/pointerdown outside the list, never from
  // blur, which some engines send while an option is being removed (Chromium) and others not at all.
  useEffect(() => {
    const away = (e: Event) => {
      const box = boxRef.current;
      if (!box || (e.target instanceof Node && box.contains(e.target))) return;
      hadFocus.current = false;
      pending.current = null;
    };
    document.addEventListener('focusin', away, true);
    document.addEventListener('pointerdown', away, true);
    return () => {
      document.removeEventListener('focusin', away, true);
      document.removeEventListener('pointerdown', away, true);
    };
  }, []);

  // A pending move whose target left the view is dropped (it must not take focus if the target comes back later).
  useLayoutEffect(() => {
    if (pending.current !== null && !idxOfSpec.has(pending.current)) pending.current = null;
  }, [idxOfSpec]);

  // A move to an undrawn option: once drawn, focus it.
  useLayoutEffect(() => {
    const spec = pending.current;
    if (spec === null || askPending()) return;
    const el = document.getElementById(optionId(id, spec));
    if (el) {
      pending.current = null;
      el.focus();
    }
  });

  // Nearest survivor: the focused option left the view while focus was inside the list. A focused option the view
  // kept but moved (another section: Current, Favourites) was unmounted and mounted again: focus goes back to it.
  useLayoutEffect(() => {
    if (active === null || askPending() || pending.current !== null) return;
    const lost = document.activeElement === document.body || document.activeElement === null;
    if (idxOfSpec.has(active)) {
      if (hadFocus.current && lost) focusSpecNow(active);
      return;
    }
    const was = hadFocus.current && (lost || boxRef.current?.contains(document.activeElement));
    setActive(null);
    if (was && specs.length) focusSpecNow(specs[Math.min(lastPos.current, specs.length - 1)]);
  }, [specs, active, idxOfSpec, focusSpecNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // An asked focus, served once per token.
  useLayoutEffect(() => {
    if (!askPending()) return;
    servedToken.current = focusToken!;
    focusSpecNow(idxOfSpec.has(focusSpec!) ? focusSpec! : specs[0]);
  }, [focusToken, focusSpec]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = useRef({ specs, locked, p, focusSpecNow });
  latest.current = { specs, locked, p, focusSpecNow };

  const onPick = useCallback(
    (spec: string) => {
      const l = latest.current;
      if (l.locked) return;
      const opt = document.getElementById(optionId(id, spec));
      if (opt?.getAttribute('aria-disabled') === 'true') return;
      l.p.onActivate(spec);
    },
    [id],
  );
  const onFocusOpt = useCallback((spec: string) => {
    hadFocus.current = true;
    const i = latest.current.specs.indexOf(spec);
    if (i >= 0) lastPos.current = i;
    setActive(spec);
  }, []);
  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, spec: string) => {
      const l = latest.current;
      const i = l.specs.indexOf(spec);
      const go = (j: number) => {
        e.preventDefault();
        l.focusSpecNow(l.specs[Math.max(0, Math.min(l.specs.length - 1, j))]);
      };
      switch (e.key) {
        case 'ArrowDown':
          return go(i + 1);
        case 'ArrowUp':
          return go(i - 1);
        case 'Home':
          return go(0);
        case 'End':
          return go(l.specs.length - 1);
        case 'PageDown':
          return go(i + PAGE_STEP);
        case 'PageUp':
          return go(i - PAGE_STEP);
        case 'Enter':
        case ' ':
          e.preventDefault();
          onPick(spec);
          return;
        case 'Escape':
          if (l.p.onEscape?.()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && l.p.onType) {
            e.preventDefault();
            l.p.onType(e.key);
          }
      }
    },
    [onPick],
  );

  // One options object per item and selection, so a memoised row re-renders only when its tab stop changes.
  // Valid while the item, its selection, the set size and the caller's optionKey are unchanged.
  const cache = useRef(new WeakMap<PickItem, { sel: boolean; total: number; key: string | undefined; o: ListOption }>());
  const optionFor = (it: OptionItem, sel: boolean): ListOption => {
    const c = cache.current.get(it);
    if (c && c.sel === sel && c.total === view.total && c.key === p.optionKey) return c.o;
    const o = { ...p.option(it), selected: sel, posinset: it.pos, setsize: view.total };
    cache.current.set(it, { sel, total: view.total, key: p.optionKey, o });
    return o;
  };

  // Layout: segments (before the first heading, then one per heading), each drawn rows plus exact spacers.
  const drawnSet = new Set(drawn);
  const spacer = (key: string, h: number) => (h > 0 ? <div key={key} aria-hidden="true" className={v.spacer} style={{ height: h }} /> : null);
  const rowsOf = (from: number, to: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let gapFrom = from;
    for (let i = from; i < to; i++) {
      if (!drawnSet.has(i)) continue;
      out.push(spacer(`s${gapFrom}`, offset[i]! - offset[gapFrom]!));
      const it = items[i] as OptionItem;
      const spec = specOf(it);
      out.push(
        <ModelOption
          key={it.key}
          listId={id}
          o={optionFor(it, spec === selected)}
          className={v.row}
          tabbable={spec === stop}
          onKey={onKey}
          onPick={onPick}
          onFocusOpt={onFocusOpt}
          probe={renderProbe}
        />,
      );
      gapFrom = i + 1;
    }
    out.push(spacer(`s${gapFrom}`, offset[to]! - offset[gapFrom]!));
    return out;
  };
  const body: ReactNode[] = [];
  const firstHead = heads[0] ?? items.length;
  body.push(...rowsOf(0, firstHead));
  heads.forEach((h, k) => {
    const end = heads[k + 1] ?? items.length;
    const it = items[h] as HeadingItem;
    if (!drawnSet.has(h)) {
      body.push(spacer(`g${h}`, offset[end]! - offset[h]!));
      return;
    }
    const hid = `${id}-g-${specHash(it.key)}`;
    body.push(
      <div key={it.key} role="group" aria-labelledby={hid} className={v.group}>
        <div id={hid} className={v.head} style={{ height: headingHeight }}>
          {p.heading(it)}
        </div>
        {rowsOf(h + 1, end)}
      </div>,
    );
  });

  return (
    <div
      ref={boxRef}
      id={id}
      role="listbox"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={locked || undefined}
      className={cx(v.list, p.className)}
      style={{ ['--mp-row-h' as string]: `${rowHeight}px` }}
      data-rows={view.total}
    >
      {body}
    </div>
  );
}
