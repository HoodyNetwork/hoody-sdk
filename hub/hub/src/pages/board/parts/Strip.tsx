// The Board strip: one row, two zones.
//   The Boards: one named menu, Boards ▾ (every Board, New Board, then the open Board's own rows under its name), the
//   realm's Boards as kit Tabs (rename, reorder and a tab's menu, opened on the tab and dropping from it, are the kit's;
//   a middle-click closes a tab's Board), then New Board right after the last tab (where a tile is dropped to make a
//   Board of it). Boards ▾ and New Board are the kit Tabs' own row slots: they never scroll or stack.
//   This Board's tools (a group, "Board tools"): the tile note, Even out tiles, Layout ▾, Focus, the Broadcast, a thin
//   rule, then Add a program at the row's end (the strip's one primary, yellow; left out while the
//   Board is empty, whose welcome has its own).
// Every control is a toolbar control in the 32 toolbar scope (32 px, 44 on a coarse pointer, as Files): no
// chip cells and no key caps in labels; keys are in tooltips and aria-keyshortcuts. The tile count heads the Layout menu.
// One row at every width it is drawn: the tabs take what the controls leave as a
// scrolling strip (the kit keeps the open tab in view, with chevrons at a side that has more), and the tools step
// down by the room the row has (the kit's useRowFit), never by a fixed width; the temporary words go first:
//   0  every control with its words; the note as its whole sentence;
//   1  the note is its short form (the whole sentence on a press, and as its name); Even out tiles leaves the row
//      (Layout ▾ → Equalise does the same, key =);
//   2  Layout and Focus are icons (their names and keys in their tooltips);
//   3  Boards ▾ is an icon named Boards;
//   4  Add a program shows "Add" after its plus (its name stays "Add a program"): never a bare plus beside New Board's.
// The Broadcast's camera stays an icon at every step (while live, the icon and its Live words): its panel is a popover
// from that button. A Broadcast trigger that narrows (fewer watching) starts the fit again, so the row never stays
// tighter than it needs.
// On phones the strip row is not drawn: the same Boards menu starts the chips row instead. A bar only:
// the page draws the tile area after it, in one place, so hiding the strip (focus mode) never remounts a frame.
import { type Ref, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { NEW_BOARD_DROP, STRIP_LAST_STEP, STRIP_TABS_SHARE } from './Strip.pure';
export { NEW_BOARD_DROP, STRIP_LAST_STEP, STRIP_TABS_SHARE } from './Strip.pure';
export type { StripNote } from './Strip.pure';
import type { StripNote } from './Strip.pure';
import { ActionMenu, Button, IconButton, InfoTip, Tabs, ToolbarScope, Tooltip, useRowFit, type MenuEntry, type MenuList, type RowNeed, type TabItem, type TabsEditHandle } from '@kit';
import { NAME_MAX } from '../model/boards';
import { useT } from './text';
import s from './board.module.css';

export interface StripProps {
  items: readonly TabItem[];
  active: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, to: number) => void;
  tabMenu: (id: string) => readonly MenuEntry[];
  /** The kit's handle on the tabs: the Boards menu's Rename starts the same rename in place as F2. */
  tabsRef?: Ref<TabsEditHandle>;
  /** The in-place rename as it goes: the page holds its data while a draft is typed, as its rename dialog does. */
  onTabEditing?: (state: { id: string; draft: string } | null) => void;
  /** Middle-click on a Board tab: close that Board (the kit calls it only for an enabled tab not being renamed). */
  onCloseTab?: (id: string) => void;
  canCreate: boolean;
  createReason: string;
  onCreate: () => void;
  note: StripNote | null;
  /** Evening out the tile shares makes the note go away: a button beside it. */
  onEven?: (() => void) | null;
  layoutMenu: MenuList | null;
  /** Boards ▾ (one menu for desktop and phone, the page builds it): every Board, New Board, the open Board's rows. */
  boardMenu: MenuList;
  boardMenuOpen: boolean;
  onBoardMenuOpen: (open: boolean) => void;
  onFocus: () => void;
  /** The slot after Focus, before the rule, where the page moves its Broadcast while the strip is drawn. */
  endSlot?: (el: HTMLSpanElement | null) => void;
  /** Add a program: reason set while it cannot add (the Board is full); null while the Board is empty. */
  add: { onPress: () => void; reason: string | null } | null;
  /** A tile dragged over the strip: the Board tab it would move to, or NEW_BOARD_DROP for New Board. */
  dropTarget?: string | null;
}

/** A tile drag's place on the strip under a point: a Board tab other than `current` (by its label's data-tab-id), New
 *  Board (data-board-new-drop: drawn only while a Board can be made), or null. */
export function stripDropAt(x: number, y: number, current: string): string | null {
  const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  if (!el) return null;
  if (el.closest('[data-board-new-drop]')) return NEW_BOARD_DROP;
  const id = (el.closest('[data-tab-id]') ?? el.closest('[role="tab"]')?.querySelector('[data-tab-id]'))?.getAttribute('data-tab-id');
  return id && id !== current ? id : null;
}

interface FocusControlProps {
  id: string;
  onPress: () => void;
  'data-hub-restore-focus': string;
}

/** Focus from step 2: an icon button named Focus, F in its tooltip. */
function FocusIcon(p: FocusControlProps) {
  const t = useT();
  return <IconButton icon="maximize" label={t('focus')} shortcut="F" aria-keyshortcuts="F" size="toolbar" {...p} />;
}

/** Focus below step 2: its icon and word, F in its tooltip (no key cap in the label). */
function FocusWords(p: FocusControlProps) {
  const t = useT();
  return (
    <Tooltip content={t('focus')} shortcut="F">
      <Button size="toolbar" icon="maximize" aria-keyshortcuts="F" {...p}>
        {t('focus')}
      </Button>
    </Tooltip>
  );
}

/** Focus at the step the row draws: its icon from step 2, its words before. */
function FocusControl({ icon, ...p }: FocusControlProps & { icon: boolean }) {
  return icon ? <FocusIcon {...p} /> : <FocusWords {...p} />;
}

/**
 * What the strip row needs at its current step: its padding, the tools whole (their own width: they never shrink), the
 * column gap, and the Boards' floor. The Boards are Boards ▾, the tabs and New Board after them (the kit Tabs' own row
 * slots); their floor is the whole of them when that narrow, else the larger of the open tab with room for a chevron at
 * each side (two control widths, `--board-btn`) plus Boards ▾ and New Board, and STRIP_TABS_SHARE of the row's inner
 * width: the tools step down before the tabs shrink past it, so a long note goes to its short form rather than leave
 * room for one tab. Below the floor the row steps down.
 */
export const stripRowNeed: RowNeed = (el) => {
  const list = el.querySelector<HTMLElement>('[role="tablist"]');
  const end = el.querySelector<HTMLElement>('[data-strip-end]');
  if (!list || !end) return el.scrollWidth;
  const cs = getComputedStyle(el);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const btn = parseFloat(cs.getPropertyValue('--board-btn')) || 44;
  const extra = [...el.querySelectorAll<HTMLElement>('[data-tabs-before], [data-tabs-after]')].reduce((w, x) => w + x.offsetWidth, 0);
  const open = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  const least = Math.max((open?.offsetWidth ?? 0) + 2 * btn + extra, (el.clientWidth - pad) * STRIP_TABS_SHARE);
  const boards = Math.min(list.scrollWidth + extra, least);
  return pad + boards + (parseFloat(cs.columnGap) || 0) + end.scrollWidth;
};

export function Strip(p: StripProps) {
  const t = useT();
  const rowRef = useRef<HTMLDivElement>(null);
  // What the row holds (not how it is drawn): a change starts the fit again from step 0. The open tab is part of it,
  // its width being the tabs' floor. The note by its shape, digits masked: a tile added or removed
  // changes a number only, which never restarts the fit (it would close a note's tip or a menu open from the row; a
  // number that grows the row still steps it down after that render).
  const shape = (x: string | null | undefined) => (x ?? '').replace(/\d+/g, '#');
  // The end slot is filled by another part (Broadcast's trigger, whose Live words are its label while it runs) that
  // renders on its own: what it shows is read here (words and names), so a change renders the strip and is fitted
  // like the strip's own. A grown count steps the row down after that render; a new kind (Live, ended) restarts the fit.
  const slotEl = useRef<HTMLSpanElement | null>(null);
  const [slotSays, setSlotSays] = useState('');
  // A slot that narrows (Live · 123 watching → Live · 2 watching: the same masked shape) frees room the fit cannot see
  // (its widths were measured at the wider slot): each narrowing counts into the key, so the fit starts again from
  // step 0, after any popup open from the row has closed (the key is held while one shows).
  const [slotNarrowed, setSlotNarrowed] = useState(0);
  const { endSlot } = p;
  const slotRef = useCallback((el: HTMLSpanElement | null) => {
    slotEl.current = el;
    endSlot?.(el);
  }, [endSlot]);
  useEffect(() => {
    const el = slotEl.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    // The slot and the Broadcast's portal node have no box (display: contents): the width is that of the boxes inside.
    const boxes = (n: Element): Element[] => [...n.children].flatMap((c) => (getComputedStyle(c).display === 'contents' ? boxes(c) : [c]));
    const width = () => boxes(el).reduce((w, c) => w + c.getBoundingClientRect().width, 0);
    let wide = width();
    const narrowed = () => {
      const w = width();
      if (w < wide - 0.5) setSlotNarrowed((n) => n + 1);
      wide = w;
    };
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(narrowed);
    // The boxes come and go with what the Broadcast shows: observe the ones there now.
    const observe = () => {
      ro?.disconnect();
      for (const c of boxes(el)) ro?.observe(c);
    };
    const read = () => {
      setSlotSays([el.textContent ?? '', ...[...el.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label'))].join('\u0001'));
      observe();
      narrowed();
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label'] });
    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, []);
  const holds = [p.items.map((x) => x.label).join('\u0001'), p.active, p.add ? (p.add.reason ?? '+') : '-', p.canCreate, shape(p.note?.full), !!p.onEven, !!p.layoutMenu, shape(slotSays), slotNarrowed].join('\u0002');
  // While a popup opened from the row shows (the note's tip, the Layout or Boards menu: its trigger says aria-expanded),
  // the key keeps its value from before it opened: a new kind of note (paged, fitted, one at a time) restarts the fit
  // only once the popup closes, so its trigger is never swapped from under it. useRowFit holds its measured steps the
  // same way.
  const [popup, setPopup] = useState(false);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const read = () => setPopup(el.querySelector('[aria-expanded="true"]') !== null);
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded'] });
    return () => mo.disconnect();
  }, []);
  const [kept, setKept] = useState(holds);
  if (!popup && kept !== holds) setKept(holds);
  const step = useRowFit(rowRef, STRIP_LAST_STEP, popup ? kept : holds, true, stripRowNeed);
  // The note is kept the same way: a note that goes while its tip is open (the tiles now fit) stays, as last shown,
  // until the tip closes, so the tip is never pulled from under its reader. The kept note follows every note shown,
  // popup or not; only its going waits. Compared by its text: the page passes a new object each render.
  const [keptNote, setKeptNote] = useState<StripNote | null>(p.note);
  if ((!popup || p.note) && (keptNote?.full !== p.note?.full || keptNote?.short !== p.note?.short)) setKeptNote(p.note);
  const note = popup && !p.note ? keptNote : p.note;
  const noteShort = step >= 1;
  const wideNarrow = step >= 2;
  const boardsIcon = step >= 3;
  const addShort = step >= 4;
  // Crossing a step swaps a control for another element (Button for IconButton): the keyboard follows it. `held` is the
  // control focus last went to in the strip row; it clears when focus or a press goes anywhere else, so a swap never takes
  // focus from elsewhere. Leaving focus mode is the same case: the shell focuses Focus, then the first measure swaps it.
  const held = useRef<string | null>(null);
  const ids = { add: useId(), layout: useId(), focus: useId(), even: useId(), boards: useId() };
  const { add: addId, layout: layoutId, focus: focusId, even: evenId, boards: boardsId } = ids;
  useEffect(() => {
    const end = rowRef.current;
    if (!end) return;
    // Any focus or press outside the held control itself lets it go (a press on the note inside the row too).
    const away = (e: Event) => {
      const own = held.current ? document.getElementById(held.current) : null;
      if (!(e.target instanceof Node) || !own?.contains(e.target)) held.current = null;
    };
    const into = (e: FocusEvent) => {
      const id = e.target instanceof Element ? e.target.closest('button')?.id : undefined;
      held.current = id && [addId, layoutId, focusId, evenId, boardsId].includes(id) ? id : null;
    };
    end.addEventListener('focusin', into);
    document.addEventListener('focusin', away, true);
    document.addEventListener('pointerdown', away, true);
    return () => {
      end.removeEventListener('focusin', into);
      document.removeEventListener('focusin', away, true);
      document.removeEventListener('pointerdown', away, true);
    };
  }, [addId, layoutId, focusId, evenId, boardsId]);
  useLayoutEffect(() => {
    const key = held.current;
    const now = document.activeElement;
    if (!key || (now && now !== document.body && now.isConnected)) return;
    // Even out tiles leaves the row at step 1: its keyboard goes to Layout, whose Equalise does the same.
    (document.getElementById(key) ?? (key === evenId ? document.getElementById(layoutId) : null))?.focus({ preventScroll: true });
  }, [noteShort, wideNarrow, boardsIcon, addShort, evenId, layoutId]);
  // The tab rename's course for the page. Tabs says nothing when it unmounts mid-rename (the strip goes when
  // the window turns phone-sized): the strip says the end itself, so the page drops the rename and any hold it took.
  const tabEditing = useRef(p.onTabEditing);
  tabEditing.current = p.onTabEditing;
  const tabEditOpen = useRef(false);
  const onTabEditing = useCallback((st: { id: string; draft: string } | null) => {
    tabEditOpen.current = st !== null;
    tabEditing.current?.(st);
  }, []);
  useEffect(() => () => {
    if (tabEditOpen.current) {
      tabEditOpen.current = false;
      tabEditing.current?.(null);
    }
  }, []);
  const full = p.add?.reason ?? null;
  // Boards ▾ at the row's start: the Boards' one menu, with a word; from step 3 an icon named Boards. It drops
  // bottom start, over the first tile's name side, never over a tile's controls.
  const boardsMenu = (
    <ActionMenu
      items={p.boardMenu}
      label={t('boards')}
      placement="bottom start"
      isOpen={p.boardMenuOpen}
      onOpenChange={p.onBoardMenuOpen}
      trigger={
        boardsIcon ? (
          <IconButton icon="board" id={boardsId} label={t('boards')} size="toolbar" />
        ) : (
          <Button size="toolbar" icon="board" iconEnd="chevron-down" id={boardsId}>
            {t('boards')}
          </Button>
        )
      }
    />
  );
  // New Board right after the last tab, an icon at every step: never leaving the row, it is where a tile is
  // dropped to make a Board of it. At 9 Boards it is soft-disabled: focusable, it says why.
  const newBoard = p.canCreate ? (
    <IconButton icon="plus" label={t('board.new')} size="toolbar" onPress={p.onCreate} data-board-new-drop="" data-strip-new="" dropTarget={p.dropTarget === NEW_BOARD_DROP} />
  ) : (
    <IconButton icon="plus" label={t('board.new')} size="toolbar" isDisabled disabledReason={p.createReason} data-strip-new="" />
  );
  return (
    // The 32 toolbar scope: a box of its own with no layout (display: contents), so the row lays out as without it.
    <ToolbarScope size="32">
      <div ref={rowRef} className={s.stripRow} data-strip-step={step}>
        {/* The tab list is named Board tabs, so it is never read as the Boards menu button. No ⋯ after the tabs: a
            tab's menu opens on the tab (right-click, long press, Shift+F10) and drops from it; Boards ▾ has the same rows. */}
        <Tabs
          items={p.items}
          label={t('board.tabs')}
          value={p.active}
          onChange={p.onSelect}
          className={s.tabsRoot}
          before={boardsMenu}
          after={newBoard}
          editRef={p.tabsRef}
          edit={{ onRename: p.onRename, onMove: p.onMove, menu: p.tabMenu, menuButton: false, maxLength: NAME_MAX, ...(p.onTabEditing ? { onEditing: onTabEditing } : {}), ...(p.onCloseTab ? { onMiddleClick: p.onCloseTab } : {}) }}
          dropTargetId={p.dropTarget || null}
          toolbarRow
        />
        <span className={s.stripEnd} data-strip-end="" role="group" aria-label={t('board.tools')}>
          {/* The note is read whole: in words at step 0, then its short form, a press away from the whole sentence (a
              title is out of reach by touch), which is also its name. */}
          {note && (noteShort ? (
            <span className={s.noteShort}>
              <InfoTip text={note.full} subject="">
                <span aria-hidden="true" className={s.note}>{note.short}</span>
                <span className={s.srOnly}>{note.full}</span>
              </InfoTip>
            </span>
          ) : (
            <span className={s.note}>{note.full}</span>
          ))}
          {p.onEven && !noteShort && (
            <Tooltip content={t('overflow.even')} shortcut="=">
              <Button size="toolbar" id={ids.even} onPress={p.onEven}>
                {t('overflow.even')}
              </Button>
            </Tooltip>
          )}
          {p.layoutMenu && (
            <ActionMenu
              items={p.layoutMenu}
              label={t('layout')}
              trigger={
                wideNarrow ? (
                  <IconButton icon="columns" id={ids.layout} label={t('layout')} size="toolbar" />
                ) : (
                  <Button size="toolbar" icon="columns" iconEnd="chevron-down" id={ids.layout}>
                    {t('layout')}
                  </Button>
                )
              }
            />
          )}
          {/* Leaving focus mode draws this strip again (the old button is gone): the shell puts the keyboard back here. Its
              name is its own label (Focus), so the name starts with what it shows (WCAG 2.5.3); F is in its tooltip and
              aria-keyshortcuts. From step 2 it is an icon button named Focus. */}
          <FocusControl icon={wideNarrow} id={ids.focus} onPress={p.onFocus} data-hub-restore-focus="" />
          {/* The Broadcast (a quiet video icon button; while live, its Live words beside the icon) sits with the other
              view tools, just before the rule. */}
          <span ref={slotRef} className={s.endSlot} data-strip-slot="" />
          {/* Add a program at the row's end, past a rule: the strip's one primary, yellow with no chip
              and no key cap (N in its tooltip and aria-keyshortcuts). It keeps a word at every step ("Add" at the last),
              so the row never shows two bare plus buttons. Toolbar size, as every other control of the row: one height. While the Board is full it is soft-disabled: it stays in the
              Tab order, a press does nothing, and it says its reason. */}
          {p.add && <span className={s.stripRule} aria-hidden="true" />}
          {p.add && (full === null ? (
            <Tooltip content={t('board.addProgram')} shortcut="N">
              <Button variant="primary" chip={false} size="toolbar" icon="plus" id={ids.add} aria-keyshortcuts="N" aria-label={addShort ? t('board.addProgram') : undefined} onPress={p.add.onPress}>
                {addShort ? t('board.addShort') : t('board.addProgram')}
              </Button>
            </Tooltip>
          ) : (
            <Button variant="primary" chip={false} size="toolbar" icon="plus" id={ids.add} aria-label={addShort ? t('board.addProgram') : undefined} isDisabled disabledReason={full}>
              {addShort ? t('board.addShort') : t('board.addProgram')}
            </Button>
          ))}
        </span>
      </div>
    </ToolbarScope>
  );
}
