// The Board view: the strip, the tile grid (or one tile at a time with chips), focus
// mode, the picker, arranging by mouse, touch and keyboard, and the notice band.
//
// Contract, in plain words:
//   - Only the active Board's live tiles have frames; switching Boards or realms unmounts the old frames (the page
//     remounts per core generation). Maximise and one-at-a-time keep the other frames mounted but hidden and inert.
//   - Width never changes the saved layout. A Board pages when its layout does not give every tile 240 x 160 here, and a
//     Fit Board past 4 tiles always: pages of the reading order, as many tiles a page as fit at 240 x 160 (4, 2 or 1,
//     model/geom.ts boardPages), the page following the active slot. At 1 a page, and on a phone, that is one tile at a
//     time (chips). Tiles off the page stay mounted, hidden and inert. A new tile on a Board that pages goes last.
//   - Keys are declared once with usePageShortcuts (listed in ? and the palette). A parent-key message is accepted
//     only from a tile's own frame window AND its address's origin; anything else is ignored silently.
//   - While a divider or a tile is dragged, a shield covers every frame, and another tab's write waits (hold).
//   - Copy link and ↗ use the share address (no Board options, no token); Export writes the Board only.
import { accountForgets, alive, capture, computerState, errorInfo, save, useCurrentComputer, useRealms, realmLabel } from '@core';
import {
  Band, Button, ConfirmDialog, Dialog, Skeleton, TextField, showToast, useChromeHidden, openShortcutsSheet, useIsPhone, useMedia, usePageLink, useServedPageLink, usePageShortcuts,
  useSearchParam, ActionMenu, IconButton, MenuThumb, PRESS_HOLD_MS, Splitter, cx, followPageLink, useGo, type MenuAction, type MenuEntry, type MenuList, type PageShortcut, type TabsEditHandle,
} from '@kit';
import { ADD_WAIT_MS, useAddLinks, type AddLinks } from './addLinks';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { computersAt, computersDomain, handleOf, useBoardComputers, useExpiredComputers, type BoardComputer } from '../computers';
import { useBoards, type BoardsApi, type LockedRefusal, type UPDATING } from '../data';
import {
  activeBoard, addTile, applyPreset, boardSlots, closeSlot, copyName, createBoard, duplicateBoard, equaliseBoard, filledCount,
  focusSlot, focusToward, importBoard, isRefusal, MAX_BOARDS, MAX_SLOTS, moveSlot, nextSession, onActive, pushRecent, renameBoard, reorderBoard,
  resizeActive, setActiveBoard, setBoardRatio, setKeepLoaded, setTile, splitAt, stepBoard, boardByNumber, swapSlots, swapToward, toggleMax, splitEnd, splitSideFor, PAGE_MAX,
  isProgramTile, tileComputer, clearRecents, dropRecent, restoreRecents, type Board, type RealmBoards, type Refusal, type Tile as TileKind, type TileRef,
  boardFor, keyedAddTile, type KeyedAdd, moveTileToBoard, NAME_MAX, type MoveTarget,
} from '../model/boards';
import { boardPages, dividers, dropZone, fits, PAD, pageCapacity, pageHeir, ratioLabel, tileBoxes, type Box, type Divider as Split } from '../model/geom';
import { navLayoutAt, overflowsAt, pagedAt } from '../paging';
import { parseRealmBoards, toStored } from '../model/persist';
import { boardHeight, layoutFits, presetFitsIn, scrollStyles, useFollowActive, useScrollEntry, setBoardMode } from '../scroll';
import { dragRatio, equalise, isSlot, nodeAt, PRESETS, PRESET_CELLS, PRESET_SLOTS, setRatio, slots, type Path, type Preset, type Side, type SplitNode } from '../model/tree';
import { useBoardPower } from './lifecycle';
import { hiddenSenderHold, useComputerLinks, useHeldFromLinks } from './computerLinks';
import { useT, type T } from './text';
import s from './board.module.css';
import { Chips, chipDropAt } from './Chips';
import { watchBodyPress } from './bodyPress';
import { EmptySlot, type QuickTerminal } from './EmptySlot';
import type { FrameHandle, FrameState } from './Frame';
import { Picker, type PickerStep } from './Picker';
import type { SshPrefill } from './SshForm';
import { boardAddPath, convTileUrl, hubOrigin, isNewTerminal, links, openTile, parseConnectSsh, programViewPath, tileConv, type BoardKey } from '../links';
import { newTerminalNumber, readLiveFor } from '../addNew';
import { CATALOG, startView } from '../embed/catalog';
import { NEW_BOARD_DROP, Strip, stripDropAt } from './Strip';
import { Broadcast } from '../broadcast/Broadcast';
import { Tile } from './Tile';
import { useHubScheme } from './scheme';
import { boardHtml, htmlFileName, htmlTile, type HtmlText } from '../boardHtml';
import { boardDefaults, boardInfo, browserTarget, shellShown, shellTarget, terminalMenu, tileName, type TileInfo } from './tileInfo';
import { RestartDialog } from './RestartDialog';
import { ShellDialog } from './ShellDialog';
import { DevToolsDialog, type DevToolsTarget } from './DevToolsDialog';
import { MoveTileDialog, type MoveCapture } from './MoveTileDialog';
import { ClosedBoardsDialog, closeText, restoreText, useOneAtATime } from './ClosedBoardsDialog';
import { useClosedBoards, type ClosedRefusal } from '../closed';
import { tilesShowing, type ShellAt, type ShellTarget } from './shellChange';
import { useCatalog } from './useCatalog';
import { refusedParams } from '../embed/options';
import { changedCount, OptionsPanel, type Saved } from '../options';

const DRAG_PX = 4;
// The kit's hold time: its hold bar on the header fills over exactly this wait (kit/controls/pressFeedback.ts).
const TOUCH_HOLD_MS = PRESS_HOLD_MS;
const KEYBOARD_RATIO = 0.7;
const NARROW_TILE = 480;
const SIDES: readonly Side[] = ['left', 'right', 'up', 'down'];
const ARROW: Record<Side, string> = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const VIM: Record<Side, string> = { left: 'h', right: 'l', up: 'k', down: 'j' };
const SIDE_KEY: Record<Side, { swap: string; resize: string }> = {
  left: { swap: 'key.swapLeft', resize: 'key.resizeLeft' },
  right: { swap: 'key.swapRight', resize: 'key.resizeRight' },
  up: { swap: 'key.swapUp', resize: 'key.resizeUp' },
  down: { swap: 'key.swapDown', resize: 'key.resizeDown' },
};

const rand = () => Math.random();
/** The DOM id of a Board slot's element (focus and aria targets). */
const domId = (board: string, slot: string) => `board-${board}-${slot}`;
/** Frames to wait for a fresh tile's iframe before the keys fall back to the Board (an agent tile signs in first). */
const ENTER_TRIES = 30;
const realmText = (id: string, t: T): string => {
  const n = realmLabel(id);
  return n.kind === 'alias' || n.kind === 'short' ? n.text : n.kind === 'all' ? t('view.allRealms') : t('realm.global');
};

export { ADD_WAIT_MS, TAKEN_KEEP, useAddLinks } from './addLinks';

export function BoardView() {
  const t = useT();
  const api = useBoards();
  const adds = useAddLinks();
  // A Rename dialog open when the value stopped opening goes with the remount, and its draft with it (the draft and the
  // Board's name are that value): the person is told the name they typed was not kept, naming neither.
  // BoardReady reports only its own opens and closes, never a remount.
  const renameOpen = useRef(false);
  const shownGen = useRef(api.lockGen);
  useEffect(() => {
    if (shownGen.current === api.lockGen) return;
    shownGen.current = api.lockGen;
    if (!renameOpen.current) return;
    renameOpen.current = false;
    showToast({ title: t('rename.lost'), tone: 'info' });
  }, [api.lockGen, t]);
  // A close from a BoardReady the lock has already replaced (its rename ending as it unmounts) is not a close the person
  // made: the lock reads the rename as open and says it was not kept. Only the BoardReady of the current lockGen closes it.
  const liveGen = useRef(api.lockGen);
  liveGen.current = api.lockGen;
  const onRenaming = useCallback((open: boolean, gen?: number) => {
    if (!open && gen !== undefined && gen !== liveGen.current) return;
    renameOpen.current = open;
  }, []);
  if (!api.ready) return <Skeleton variant="card" />;
  return <BoardReady key={api.lockGen} api={api} adds={adds} onRenaming={onRenaming} />; // a value that stops opening drops every dialog and drag (lockGen)
}

/**
 * `strip`: the strip place under the pointer (a Board tab, NEW_BOARD_DROP, or null), taking over from `target`.
 * `chip`: the tile chip under the pointer (another slot's chip, a swap), taking over from `target` too.
 */
interface DragTile { from: string; x0: number; y0: number; x: number; y: number; on: boolean; target: string | null; zone: ReturnType<typeof dropZone>; strip: string | null; chip: string | null }
/** The tile chips row's height: the shell lifts its focus-mode restore button above it. */
const CHIPS_ROW = 44;

interface DragDivider { path: Path; ratio: number; div: Split }

function BoardReady({ api, adds, onRenaming }: { api: BoardsApi; adds: AddLinks; onRenaming: (open: boolean, gen?: number) => void }) {
  const t = useT();
  const { state, apply } = api;
  // Never the bare name `closed`: in a browser it is window.closed when out of scope.
  const closedBoards = useClosedBoards(api);
  const closedOne = useOneAtATime(); // one change of Closed Boards at a time: the dialog's and Close's Undo share it
  const board = activeBoard(state);
  const comps = useBoardComputers();
  // The computer the top bar shows: the welcome's Open a terminal opens a new terminal there.
  const current = useCurrentComputer();
  // A tile whose computer the whole list lacks: the API leaves a computer whose server's rental ended out of that list,
  // so one read that includes those decides between the subscription card and "deleted or moved" (tileInfo). Read
  // only while such a tile is on the shown Board, never on a timer, and again whenever the computers asked about
  // change (`missing`: their ids): a rental that ends while the Board is open is never judged by an older answer.
  const missing = comps.rows !== null && !comps.failed && comps.complete
    ? [...new Set(Object.values(board.tiles).flatMap((x) => {
        const on = x ? tileComputer(x) : null;
        return on && !comps.rows!.some((c) => c.id === on.computer) ? [on.computer] : [];
      }))].sort().join(',')
    : '';
  const listLacks = missing !== '';
  const ended = useExpiredComputers(missing);
  const retryComputers = () => { comps.retry(); ended.retry(); };
  const scheme = useHubScheme();
  const power = useBoardPower(comps.rows, comps.retry);
  const billingLink = usePageLink('billing');
  const cat = useCatalog();
  const realms = useRealms();
  const phone = useIsPhone();
  const coarse = useMedia('(pointer: coarse)');
  const computersLink = usePageLink('computers');
  const computersServed = useServedPageLink('computers');
  const go = useGo();
  const computerLinks = useComputerLinks(t);
  const heldFromLink = useHeldFromLinks(t);
  const [bParam, setBParam] = useSearchParam('b');
  // A Connect over SSH link (links.ts boardConnectSshLink): its values fill the picker's form once.
  const [connectParam] = useSearchParam('connect');
  const [cComputer] = useSearchParam('computer');
  const [cHost] = useSearchParam('host');
  const [cUser] = useSearchParam('user');
  const [cPort] = useSearchParam('port');
  // Add links taken by useAddLinks: each tile goes on the active Board once.
  const { queue: addQueue, settle: addSettle, done: addDone, told: addTold, dest: addDest } = adds;
  // A first list read that stays unanswered ADD_WAIT_MS while links wait.
  const addWaiting = addQueue.length > 0 && comps.rows === null && !comps.failed;
  const [addSlow, setAddSlow] = useState(false);
  // The tile an Add link put on the Board, to enter after the change is drawn (held above the readiness gate).
  const { enter: addEnter, setEnter: setAddEnter } = adds;
  const [sshPrefill, setSshPrefill] = useState<SshPrefill | null>(null);

  // ---- size of the Board area (frames follow the frame, never the viewport) ----
  const areaRef = useRef<HTMLDivElement | null>(null);

  // ---- the Broadcast: one node for the Board's lifetime, so hiding the strip never ends a broadcast ----
  // Broadcast renders into this node (a portal); the node moves into the strip's end slot while the strip is drawn
  // and into a hidden holder when it is not (phones, focus mode). Its Broadcaster lives as long as the Board view.
  const castNode = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('span');
    el.className = s.portalNode ?? '';
    return el;
  }, []);
  const castHolder = useRef<HTMLSpanElement | null>(null);
  const castSlot = useCallback((el: HTMLSpanElement | null) => {
    if (!castNode) return;
    const to = el ?? castHolder.current;
    if (to && castNode.parentNode !== to) to.appendChild(castNode);
  }, [castNode]);
  const holdCast = useCallback((el: HTMLSpanElement | null) => {
    castHolder.current = el;
    if (el && castNode && !castNode.isConnected) el.appendChild(castNode);
  }, [castNode]);
  // The view holds the area: its size is the room the Board has (Scroll mode grows the area past it).
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => setSize((p) => (p && p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- phone keyboard open: the chips hide so the frame keeps the room ----
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const on = () => setKeyboardOpen(vv.height < window.innerHeight * KEYBOARD_RATIO);
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);

  // ---- /board?b=<id>: select that Board, then drop the parameter (an unknown id leaves the active Board) ----
  useEffect(() => {
    if (!bParam) return;
    apply((st) => setActiveBoard(st, bParam));
    setBParam(undefined, { replace: true });
  }, [bParam, apply, setBParam]);

  // ---- focus mode ----
  const [focus, setFocus] = useState(false);

  // ---- frames: state, reloads, windows (parent keys), focus inside ----
  const [frameStates, setFrameStates] = useState<Record<string, FrameState>>({});
  const [reloads, setReloads] = useState<Record<string, number>>({});
  // The tile whose Options panel is open (tile menu, the "N changed" chip, O).
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const frames = useRef(new Map<string, FrameHandle | null>());
  const wins = useRef(new Map<string, { win: Window; origin: string }>());
  const [inside, setInside] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [boardMenu, setBoardMenu] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [changeFor, setChangeFor] = useState<{ slot: string; step: PickerStep } | null>(null);
  const [shellFor, setShellFor] = useState<{ slot: string; target: ShellTarget } | null>(null);
  const [restartFor, setRestartFor] = useState<ShellTarget | null>(null);
  const [devtoolsFor, setDevtoolsFor] = useState<DevToolsTarget | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  // The Board whose Download as HTML is being confirmed (its id: the dialog shows only while that Board is the open one).
  const [htmlFor, setHtmlFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [moving, setMoving] = useState<MoveCapture | null>(null);
  const [said, setSaid] = useState('');
  const surface = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [warned, setWarned] = useState(false);

  // Frames belong to the active Board only: a Board switch forgets the old ones' states. Only a switch: a kept Board
  // shown again runs this effect too, and its frames' load states and an open picker (a Connect still unanswered)
  // are what it had.
  const boardShown = useRef(board.id);
  useEffect(() => {
    if (boardShown.current === board.id) return;
    boardShown.current = board.id;
    setFrameStates({}); setInside(null); setMenuFor(null); setPickerFor(null);
  }, [board.id]);

  const realmId = realms.selected;
  const realmName = realmText(realmId, t);
  // Which realm shows: the tile stripe is the computer's own colour; in All realms each tile names its realm.
  const realmCtx = useMemo(() => ({ selected: realmId, rows: realms.rows }), [realmId, realms.rows]);

  const infos = useMemo(
    () => boardInfo(board, { computers: comps.rows, failed: comps.failed, complete: comps.complete, ...(listLacks ? { expired: ended } : {}), cat, domain: computersDomain(), origin: typeof window !== 'undefined' ? window.location.origin : '', scheme, t }, realmCtx),
    [board, comps.rows, comps.failed, comps.complete, listLacks, ended, cat, scheme, t, realmCtx],
  );
  const infoOf = (slot: string) => infos.find((i) => i.slot === slot) ?? null;
  const labelOf = (b: Board) => b.name || t('board.main');
  const full = boardSlots(board).length >= MAX_SLOTS;
  const boardsFull = state.boards.length >= MAX_BOARDS;
  const fullRealmText = realmId === 'all' ? t('board.fullAll') : t('board.fullRealm', { realm: realmName });

  // ---- layout geometry ----
  const [divDrag, setDivDrag] = useState<DragDivider | null>(null);
  const [drag, setDrag] = useState<DragTile | null>(null);
  // The header a pointer holds now: shown at once at the press, before the drag threshold; null otherwise.
  const [pressed, setPressed] = useState<{ slot: string; phase: 'hold' | 'press' } | null>(null);
  const layout = divDrag ? setRatio(board.layout, divDrag.path, divDrag.ratio) : board.layout;
  // The Board pages (past 4 tiles in Fit, or a layout that does not fit here): pages of the reading order, the page
  // following the active slot. Maximised, a Board with room for more than one tile a page shows that tile instead.
  const overflows = phone || (size !== null && overflowsAt({ mode: board.mode, layout }, size.w, size.h));
  const capacity = phone || !size ? 1 : pageCapacity(size.w, size.h);
  const single = overflows && capacity === 1;
  const paging = overflows && size && !single && !board.max ? boardPages(layout, board.active, capacity, size.w, size.h) : null;
  const pager = paging && paging.pages.length > 1 ? paging : null;
  // In Scroll the height grows but the width does not: tiles added one by one can end up too narrow, and even shares may fit.
  const evenFixes = !!paging && !!size && board.mode === 'scroll' && layoutFits(board.mode, equalise(board.layout), size.w, size.h);
  const pageKey = paging ? paging.index + '/' + paging.pages.length + '/' + capacity : '';
  const hasChips = single || !!pager;
  // The shell's restore button sits above the chips row (44) whenever the chips show.
  useChromeHidden(focus, () => setFocus(false), { lift: hasChips ? CHIPS_ROW : 0 });
  // The area's height: the view's in Fit, one tile at a time or maximised; grown in Scroll from the saved layout, so a
  // divider drag keeps the area still under the pointer.
  const areaH = size ? (single || paging || board.max ? size.h : boardHeight(board.mode, board.layout, size.h)) : 0;
  const boxes: Record<string, Box> = paging ? { ...paging.boxes } : size ? tileBoxes(layout, size.w, areaH) : {};
  const fullBox: Box | null = size ? { left: PAD, top: PAD, width: size.w - 2 * PAD, height: size.h - 2 * PAD } : null;
  const shown = single ? board.active : board.max;
  const divs = size && !single && !paging && !board.max ? dividers(layout, size.w, areaH) : [];
  // Asked of the Board a change is made on, at the view's size when it is made: another tab's write may have moved the
  // Board since this render (data.ts replays), and a read that was out may answer after a resize.
  const viewNow = useRef({ size, phone });
  viewNow.current = { size, phone };
  const overflowing = (b: Board) => { const v = viewNow.current; return v.phone || (v.size !== null && overflowsAt(b, v.size.w, v.size.h)); };
  // The tile that takes over a closed one: its page's, on a Board that pages.
  const heirOf = (b: Board, slot: string) => { const v = viewNow.current; return !v.phone && v.size !== null && pagedAt(b, v.size.w, v.size.h) ? pageHeir(b.layout, slot, pageCapacity(v.size.w, v.size.h)) : undefined; };
  // What the arrows and swaps move over: the page on screen, otherwise the saved layout.
  const drawn = (b: Board) => { const v = viewNow.current; return !v.phone && v.size !== null ? navLayoutAt(b, v.size.w, v.size.h) : b.layout; };
  useFollowActive(viewRef, { key: board.id + ':' + board.active, box: single || paging || board.max ? undefined : boxes[board.active], viewH: size?.h ?? 0, mode: board.mode, paused: !!drag?.on || !!divDrag });

  // ---- changes (one place for refusals, undo labels and live messages) ----
  const say = (m: string) => setSaid(m);
  // UPDATING has no text of its own: the 'updating' notice band says it (data.ts).
  const refusalText = (r: Refusal | typeof UPDATING): string => (r.refused === 'BOARD_FULL' ? t('board.full') : r.refused === 'BOARDS_FULL' ? fullRealmText : r.refused === 'SESSIONS_FULL' ? t('board.sessionsFull') : r.refused === 'NAME_INVALID' ? t('board.nameInvalid') : '');
  const change = (op: (s: RealmBoards, held: ReadonlySet<string>) => RealmBoards | Refusal, record?: string): boolean => {
    const r = apply(op, record !== undefined ? { record } : {});
    if (r) {
      const text = refusalText(r);
      // A capacity refusal is said once (the Board stays full); a name that cannot be one is said each time it is tried.
      if (text && (!warned || r.refused === 'NAME_INVALID')) { showToast({ title: text, tone: 'info' }); if (r.refused !== 'NAME_INVALID') setWarned(true); }
      return false;
    }
    return true;
  };
  const onBoardOp = (f: (b: Board, taken: Set<string>) => Board | Refusal, record?: string) => change((st, held) => onActive(st, f, held), record);

  const focusSurface = useCallback(() => surface.current?.focus({ preventScroll: true }), []);
  // One pending entry at a time: entering, leaving, opening the picker, switching Boards or unmounting cancels it,
  // and it acts only while focus has not gone somewhere of the person's own choosing (another tile, a dialog, a field).
  const entryGen = useRef(0);
  const enterTile = (slot: string) => {
    entryGen.current++;
    const f = frames.current.get(slot);
    if (f) { f.focus(); setInside(slot); } else if (!infoOf(slot)?.tile) openPicker(slot);
  };
  // Enter a tile whose frame may not be mounted yet (a fresh pick, an agent signing in): wait up to `tries` frames,
  // then fall back to the Board surface (a stopped computer's card has no frame). The request is taken when it is
  // made (`later`: its first try waits one frame), never at its first try: its generation, the focus it began from and
  // its Board. Each try first checks that the request is still the newest, on the same Board, and that focus is
  // unclaimed: where it was when the request was made, on the page body, the Board surface, or this tile. Focus the
  // person moved elsewhere (another tile, a dialog, a field) wins.
  const enterSoon = (slot: string, tries: number, later = false) => {
    const gen = ++entryGen.current, from = document.activeElement, boardId = boardIdRef.current;
    const step = (left: number) => {
      if (gen !== entryGen.current || boardIdRef.current !== boardId) return;
      const a = document.activeElement;
      const unclaimed = !a || a === from || a === document.body || a === surface.current || !!document.getElementById(domId(boardId, slot))?.contains(a);
      if (!unclaimed) return;
      const f = frames.current.get(slot);
      if (f?.element()) { f.focus(); setInside(slot); return; }
      if (left > 0) requestAnimationFrame(() => step(left - 1));
      else focusSurface();
    };
    if (later) requestAnimationFrame(() => step(tries));
    else step(tries);
  };
  const leaveTile = (slot: string) => { entryGen.current++; activate(slot); setInside(null); focusSurface(); };
  // The Board menu closed with focus back on its button (Escape, or an item that opened nothing): the keys go to the
  // Board surface, so the Board keys work at once (`s` splits). Focus an item moved elsewhere (a
  // dialog, a field, a press outside, another menu's button) stays there. Checked after the menu's own focus restore,
  // which lands on the menu's button (a press does not focus it first, so the focus at open says nothing). The button
  // is this menu's own: the one open menu's trigger, taken at the close, before the page draws it closed.
  // A Rename chosen in that menu starts the kit's rename in place in those same frames: the field takes focus then, so
  // that close leaves focus alone (it would end the rename before it began).
  const renameChosen = useRef(false);
  const onBoardMenu = (open: boolean) => {
    setBoardMenu(open);
    if (open) return;
    const own = document.querySelector('[aria-haspopup="true"][aria-expanded="true"]');
    const renaming = renameChosen.current;
    renameChosen.current = false;
    // Two frames: the menu's restore runs in a frame of its own, asked for after this close.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!renaming && own && a === own && a.getAttribute('aria-expanded') !== 'true' && !a.closest('[role="dialog"]')) focusSurface();
    }));
  };
  // A press on a live tile outside its header and its controls enters the program on its release (bodyPress.ts):
  // one gesture at a time. Only a press that qualifies replaces the current one (a second finger leaves the first
  // finger's press alone; the same pointer pressing again already ended it). The gesture belongs to the Board it
  // started on: a switch ends it, and a release after one enters nothing, even on a duplicated Board whose tile (same
  // slot) React kept. A tile unmounted before the release enters nothing. A touch or pen press that qualifies cancels
  // its compatibility mouse events (the click stays): their mousedown, after the release, would take the focus back to
  // the Board. The entry waits one frame (enterSoon later), with enterSoon's own guards.
  const bodyPress = useRef<(() => void) | null>(null);
  const startBodyEnter = (slot: string) => (e: ReactPointerEvent) => {
    const boardId = boardIdRef.current;
    const next = watchBodyPress(e, e.currentTarget as HTMLElement, !!frames.current.get(slot)?.element(), DRAG_PX, () => {
      bodyPress.current = null;
      if (boardIdRef.current === boardId) enterSoon(slot, 0, true);
    });
    if (!next) return;
    bodyPress.current?.();
    bodyPress.current = next;
    if (e.pointerType !== 'mouse') e.preventDefault();
  };
  useEffect(() => () => { bodyPress.current?.(); bodyPress.current = null; }, [board.id]);
  const activate = (slot: string) => {
    if (slot === board.active) return;
    if (apply((st) => onActive(st, (b) => focusSlot(b, slot)))) return; // refused (another tab's value opens): not active
    const i = infoOf(slot);
    if (i) say(t('live.active', { label: i.label }));
  };

  // ---- picker ----
  // Every picker open cancels a pending entry: the picker's own focus does not count as claimed once
  // it closes, so the entry would otherwise act on a later frame.
  const showPicker = (slot: string | null) => { if (slot !== null) entryGen.current++; setPickerFor(slot); };
  const openPicker = (slot: string) => { activate(slot); showPicker(slot); };
  // Add (the bar's, and the N key) opens the picker on the Board's first empty slot: that slot's own Add names N.
  const firstEmpty = boardSlots(board).find((x) => !board.tiles[x]);
  const addProgram = () => {
    if (firstEmpty) { openPicker(firstEmpty); return; }
    let fresh = '';
    // On a Board that pages, or the add that makes it page, the new slot goes last and earlier tiles keep their page.
    if (onBoardOp((b) => {
      const last = overflowing(b) || (b.mode !== 'scroll' && boardSlots(b).length >= PAGE_MAX);
      const r = last ? splitEnd(b, rand) : splitAt(b, b.active, splitSideFor(b, b.active), rand);
      if (isRefusal(r)) return r;
      fresh = r.slot;
      return r.board;
    }, t('undo.split'))) showPicker(fresh);
  };
  const pick = (slot: string, tile: TileKind, verb: 'add' | 'change') => {
    const name = tileName(tile, t);
    change((st, held) => {
      const r = onActive(st, (b, taken) => { const x = setTile(b, slot, tile, rand, { taken }); return isRefusal(x) ? x : focusSlot(x, slot); }, held);
      return isRefusal(r) || !isProgramTile(tile) ? r : pushRecent(r, tile);
    }, t(verb === 'add' ? 'undo.add' : 'undo.change', { name }));
    setPickerFor(null);
    setChangeFor(null);
    setSshPrefill(null);
    // The keys go to the new program at once: typing after a pick never lands on the Board keys.
    enterSoon(slot, ENTER_TRIES, true);
  };
  // The link's values are read once, then the address drops them (the Board keeps only its own `b`), and the picker
  // opens on Connect over SSH, as Add a program would.
  useEffect(() => {
    const pre = parseConnectSsh({ connect: connectParam, computer: cComputer, host: cHost, user: cUser, port: cPort });
    if (!pre) return;
    go(bParam ? links.boardById(String(bParam)) : links.board, { replace: true });
    setSshPrefill(pre);
    addProgram();
    // Only a new link counts; the values are read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectParam]);
  // A first list read unanswered for ADD_WAIT_MS while links wait (the read has no timeout of its own).
  useEffect(() => {
    if (!addWaiting) return; // once said, slow stays: the notice is not repeated, and a later answer settles the links
    const id = setTimeout(() => setAddSlow(true), ADD_WAIT_MS);
    return () => clearTimeout(id);
  }, [addWaiting]);
  // A "new terminal" link waits for its computer's live sessions (readLiveFor, at most ADD_WAIT_MS) so its
  // number is past them, and settles once placed: one read per request; a Board that goes before the read answers adds
  // nothing, and the link waits for the next Board (which reads again), as any waiting link does. While a drag or a
  // rename holds the state (api.isHeld(): set at once by hold(), before any render) no read starts, and an answer that
  // comes during one is dropped: the release reads again, so the merge applyFresh does never lands under a held
  // interaction.
  const isHeld = api.isHeld;
  // A hold belongs to a drag or a rename of this view: when the view goes (the Board stops being ready, or lockGen
  // moves) its dialogs and drags go with it, so its hold goes too, or nothing would merge and no link would read again.
  const releaseHold = api.hold;
  useEffect(() => () => releaseHold(false), [releaseHold]);
  const newReads = useRef(new Map<number, AbortController>());
  useEffect(() => {
    const m = newReads.current;
    return () => { for (const ac of m.values()) ac.abort(); m.clear(); };
  }, []);
  // The terminal goes on one Board: the one the link names, else the one active when its first read starts (kept by
  // useAddLinks, so a later read for the same request keeps it). When the answer comes and that Board is no longer the
  // active one (another Board was chosen, or it is gone), nothing is added and a notice says so.
  function addNewTerminal(n: number, c: BoardComputer, named: string | undefined) {
    if (newReads.current.has(n)) return;
    const dest = addDest.current.get(n) ?? named ?? activeBoard(api.state).id;
    addDest.current.set(n, dest);
    const ac = new AbortController();
    newReads.current.set(n, ac);
    void readLiveFor(c, ac.signal, ADD_WAIT_MS).then((live) => {
      // Gone with its Board, or settled meanwhile (the list stopped showing its computer): nothing more.
      if (ac.signal.aborted || addDone.current >= n) return;
      newReads.current.delete(n);
      // A hold began while the read was out, rendered or not (isHeld reads it at once): read again after the release
      // (the queue effect follows api.held).
      if (isHeld()) return;
      // The number over every Board as stored now, another tab's included (applyFresh merges first; an op that
      // changes nothing writes only what the merge owes). The placement right after runs in the same task on that state.
      // Refused (another tab's value opens): the link stays queued, unsettled, and is read again once that value opens.
      let k: number | null = null;
      if (api.applyFresh((st) => { k = newTerminalNumber(st, c.id, live); return st; })?.refused === 'UPDATING') return;
      addSettle(n);
      if (k === null) { showToast({ title: t('add.noNumber'), tone: 'info' }); return; }
      const session: number = k;
      const view = startView(CATALOG, 'terminal');
      const tile: TileKind = { project: c.project_id, computer: c.id, program: 'terminal', session, ...(view !== undefined ? { view } : {}) };
      let at: string | null = null;
      let moved = false;
      const refused = apply((st, held) => {
        if (activeBoard(st).id !== dest) { moved = true; return { refused: 'NOT_FOUND' } as const; }
        const x = onActive(st, (b, taken) => { const y = addTile(b, tile, rand, taken, overflowing(b)); if (isRefusal(y)) return y; at = y.slot; return y.board; }, held);
        return isRefusal(x) ? x : pushRecent(x, tile);
      }, { record: t('undo.add', { name: tileName(tile, t) }) });
      if (moved) { showToast({ title: t('add.moved'), tone: 'info' }); return; }
      if (refused) { if (refused.refused === 'UPDATING') showToast({ title: t('notice.updating'), tone: 'info' }); else showToast({ title: t('add.full'), tone: 'info' }); }
      else if (at) setAddEnter(at);
    });
  }
  // A keyed Add link (Open with): the launch's tile goes on its program board on that computer
  // ("Nano · atlas", found by its key, made when there is none), committed under the cross-tab lock against the stored
  // Boards (data.ts applyLocked), in one undo step on that board (a board made by it goes back to empty). The launch
  // already runs, so a refusal adds and changes nothing and offers its own view: Show it (the single-program view); an
  // add whose store was not seen through is said as not known (C9), with the same Show it.
  function landOnProgramBoard(c: BoardComputer, program: TileRef['program'], session: number, key: BoardKey) {
    const view = startView(CATALOG, program);
    const tile: TileRef = { project: c.project_id, computer: c.id, program, session, ...(view !== undefined ? { view } : {}) };
    const add: KeyedAdd = { for: { c: c.id, k: key.k }, name: `${key.label} · ${c.name}` };
    let at: string | null = null;
    let made: Board | undefined;
    let full = '';
    void api.applyLocked((st, r, held) => {
      const x = keyedAddTile(st, add, tile, r, held, overflowing);
      if (isRefusal(x)) { const b = boardFor(st, add.for); full = b ? labelOf(b) : ''; return x; }
      at = x.slot;
      made = x.made;
      return x.state;
    }, { record: t('undo.add', { name: tileName(tile, t) }), made: () => made }).then((r: LockedRefusal | null) => {
      if (!r) { if (at) setAddEnter(at); return; }
      const words = { name: key.label, computer: c.name, board: full };
      const show = { label: t('keyed.show'), onAction: () => go(programViewPath({ handle: handleOf(c), program, session })) };
      if (r.refused === 'NOT_KNOWN') { showToast({ title: t('keyed.unknown', words), tone: 'unknown', action: show /* noDetails: the store was accepted and its answer not seen yet (data.ts NOT_KNOWN); there is no rejection */ }); return; }
      const title = r.refused === 'BOARDS_FULL' ? t('keyed.boardsFull', words) : r.refused === 'BOARD_FULL' ? t('keyed.boardFull', words) : t('keyed.notAdded', words);
      showToast({ title, tone: 'info', action: show });
    });
  }
  // The oldest waiting link, once a list read proves something: the computer is the realm list's one with that exact
  // id (rows a failed refresh kept still prove it is there); the tile goes where Add to Board puts one (the first empty
  // slot, else a split of the active tile), to recents, with an undo, and gets the keys. A full Board adds nothing and
  // says so for this link. A successful read without the computer: nothing is added, and a notice says so. A failed
  // read, or a first read unanswered for ADD_WAIT_MS, proves nothing: the links wait (the list's own rereads, or Try
  // again, settle them while the Board is open), and one notice covers every link not yet told. Each request settles
  // once (addDone).
  useEffect(() => {
    const r = addQueue[0];
    if (!r || addDone.current >= r.n) return;
    // Where a tile goes depends on whether the Board pages at its size: the link waits for the first measure (this effect
    // runs again on it; the measure effect above sets it in the same commit).
    if (size === null) return;
    // Another tab's value is opening (rendered, or read now before its render): the link waits for it, unsettled (this
    // effect runs again on api.refreshing).
    if (api.refreshing || api.isRefreshing()) return;
    const c = comps.rows?.find((x) => x.id === r.ref.cid);
    // A settled request's live read is dropped with it.
    const dropRead = () => { newReads.current.get(r.n)?.abort(); newReads.current.delete(r.n); };
    if (!c) {
      if (comps.rows !== null && !comps.failed && !comps.complete) {
        // The first page of a longer list: no read of it proves the computer is absent, and rereading page 1 cannot change that.
        dropRead();
        addSettle(r.n);
        showToast({ title: t('add.listPartial'), tone: 'info' });
      } else if (comps.rows !== null && !comps.failed) {
        dropRead();
        addSettle(r.n);
        showToast({ title: t('add.notFound'), tone: 'info' });
      } else if ((comps.failed || addSlow) && addQueue[addQueue.length - 1]!.n > addTold.current) {
        addTold.current = addQueue[addQueue.length - 1]!.n;
        const count = addQueue.length;
        const retry = { label: t('tile.tryAgain'), onAction: comps.retry };
        // A definite read failure is an error with its Details; a slow read, or one that sent nothing (offline), is information.
        const info = comps.failed ? errorInfo(comps.error) : null;
        showToast(info ? { title: t('add.listFailed', { count }), tone: info.outcome === 'failed' ? 'error' : 'info', details: info, action: retry } : { title: t('add.listSlow', { count }), tone: 'info', action: retry });
      }
      return;
    }
    const ref = r.ref;
    if (isNewTerminal(ref)) { if (!api.isHeld()) addNewTerminal(r.n, c, r.board); return; }
    addSettle(r.n);
    if ('program' in ref && ref.board) { landOnProgramBoard(c, ref.program, ref.session, ref.board); return; }
    const opens = 'program' in ref && ref.open ? openTile(ref.program, ref.open) : null;
    const view = 'program' in ref ? (opens ? opens.view : startView(CATALOG, ref.program)) : undefined;
    const tile: TileKind = 'program' in ref
      ? { project: c.project_id, computer: c.id, program: ref.program, session: ref.session, ...(view !== undefined ? { view } : {}), ...(opens ? { params: opens.params } : {}) }
      : { project: c.project_id, computer: c.id, protocol: 'http', port: ref.port, ...(ref.path !== undefined ? { path: ref.path } : {}) };
    let at: string | null = null;
    // apply, not change(): change() says a refusal once per mount; each link hears its own.
    const refused = apply((st, held) => {
      const x = onActive(st, (b, taken) => { const y = addTile(b, tile, rand, taken, overflowing(b)); if (isRefusal(y)) return y; at = y.slot; return y.board; }, held);
      return isRefusal(x) || !isProgramTile(tile) ? x : pushRecent(x, tile);
    }, { record: t('undo.add', { name: tileName(tile, t) }) });
    if (refused) { if (refused.refused === 'UPDATING') showToast({ title: t('notice.updating'), tone: 'info' }); else showToast({ title: t('add.full'), tone: 'info' }); }
    else if (at) setAddEnter(at);
    // The queue, the list and the wait are what count; the rest is read with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addQueue, comps.rows, comps.failed, comps.complete, addSlow, api.held, api.refreshing, size === null]);
  // The keys go to the added tile after the change is drawn (enterSoon follows the Board shown then; the tile went on
  // that Board, the active one). Scheduled by an effect, so StrictMode's second run schedules it again after its
  // cleanup cancelled the first.
  useEffect(() => {
    if (!addEnter) return;
    enterSoon(addEnter, ENTER_TRIES, true);
    setAddEnter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addEnter]);
  const allTiles = useMemo(() => state.boards.flatMap((b) => Object.values(b.tiles).filter(isProgramTile)), [state.boards]);
  const boardTiles = useMemo(() => Object.values(board.tiles).filter(isProgramTile), [board.tiles]);
  // The chats this Board holds, by canonical link: the picker's Conversation step marks them "On this Board".
  const boardChats = useMemo(() => Object.values(board.tiles).flatMap((x) => { const r = tileConv(x); return r ? [convTileUrl(hubOrigin(), r)] : []; }), [board.tiles]);
  const onRecent = useMemo(() => ({
    drop: (r: TileRef) => { api.apply((s) => dropRecent(s, r)); },
    clear: () => {
      const before = api.state.recents;
      // The list is this realm's and this account's: its Undo puts it back only there. api.apply writes under whatever
      // the page shows when it runs (data.ts), so the scope is taken now and checked at the press: after a realm,
      // account or Forget switch nothing is restored, and the toast says so.
      const owner = capture();
      const forgets = accountForgets();
      if (api.apply(clearRecents)) return; // refused (the 'updating' band says why): nothing cleared, nothing to undo
      showToast({ title: t('recent.cleared'), action: { label: t('undo.label'), onAction: () => {
        if (!alive(owner) || capture().realm !== owner.realm || accountForgets() !== forgets) { showToast({ title: t('recent.notRestored'), tone: 'info' }); return; }
        api.apply((s) => restoreRecents(s, before));
      } } });
    },
  }), [api, t]);
  const pickerBase = {
    computers: comps.rows, failed: comps.failed, complete: comps.complete, onRetry: comps.retry, recents: state.recents, known: allTiles, onBoard: boardTiles, onBoardChats: boardChats,
    realmName: realmId === 'all' ? null : realmName, onComputers: computersLink ? () => followPageLink(computersLink, go) : null,
    power, heldFrom: heldFromLink, onRecent,
  };
  // The welcome's Open a terminal: the Board's own new-terminal Add link on the current computer (as Computers' New
  // terminal), so the tile gets the number past the computer's live sessions and lands as that link's does. Only for a
  // computer the Board's list holds: absent without one, off with the reason while it is not running.
  const currentRow = current ? comps.rows?.find((c) => c.id === current.container.id) : undefined;
  const quickTerminal: QuickTerminal | null = !current || !currentRow
    ? null
    : computerState(currentRow.status) !== 'running'
      ? { off: t('empty.terminalOff', { name: currentRow.name }) }
      : {
          open: () => {
            // The link names this Board, so the terminal goes here or nowhere.
            const path = boardAddPath(current, { kind: 'terminal', session: 'new' });
            if (path) go(path + '&' + new URLSearchParams({ b: board.id }).toString(), { replace: true, keepScroll: true });
          },
        };
  const recentChips = state.recents.slice(0, 3).map((r) => ({ tile: r, label: t('tile.label', { name: t('tile.name', { program: r.program, session: r.session }), computer: comps.rows?.find((c) => c.id === r.computer)?.name ?? t('tile.unknownComputer') }) }));

  // ---- tile actions ----
  // A toast's Undo is for the change it names only: the step that change recorded (taken right after it, data.ts
  // undoMark). Once that step is not the newest of the Board active at the press (a later change, another Board,
  // another tab, a realm switch), nothing is undone and the toast says so; it never undoes another step.
  const undoToast = () => {
    const mark = api.undoMark();
    return { label: t('undo.label'), onAction: () => { if (!api.undoOwn(mark)) showToast({ title: t('undo.notLast'), tone: 'info' }); } };
  };
  const close = (slot: string) => {
    const i = infoOf(slot);
    const empty = !i?.tile;
    // On a Board that pages, the next tile of the page takes over, so closing a tile stays on its page.
    if (!onBoardOp((b) => closeSlot(b, slot, heirOf(b, slot)), empty ? t('undo.closeEmpty') : t('undo.close', { name: i?.name ?? '' }))) return;
    showToast({ title: empty ? t('tile.closedEmpty') : i?.state === 'live' ? t('tile.closed', { name: i.name, computer: i.computerName }) : t('tile.closedIdle'), action: undoToast() });
    say(t('live.closed'));
  };
  const reload = (slot: string) => setReloads((r) => ({ ...r, [slot]: (r[slot] ?? 0) + 1 }));
  // A changed terminal (Change shell): every tile of the Board shown now that still is that terminal reloads; a
  // tile replaced since (another program, number or an ssh tile) is left alone.
  const boardNow = useRef(board);
  boardNow.current = board;
  const reloadTerminal = (at: ShellAt) => { for (const slot of tilesShowing(boardNow.current.tiles, at)) reload(slot); };
  // Save is one undo step; a running frame reloads once with the new address (an agent asks for a fresh token).
  // A sign-in token typed into a plain option is not stored (storageRefusal): say so instead of dropping it silently.
  const tokenNotice = (params: Saved['params']) => {
    const n = refusedParams(params).length;
    if (n) showToast({ title: t('tile.tokenNotSaved', { count: n }), tone: 'warn' });
  };
  const saveOptions = (slot: string, next: Saved) => {
    const i = infoOf(slot);
    const tile = i?.tile;
    if (!i || !tile || !isProgramTile(tile)) return;
    const { view: _v, params: _p, dropped: _d, ...ref } = tile;
    const updated = { ...ref, ...(next.view !== undefined ? { view: next.view } : {}), ...(Object.keys(next.params).length ? { params: next.params } : {}) };
    if (!onBoardOp((b, taken) => setTile(b, slot, updated, rand, { taken, keepTid: true }), t('undo.options', { name: i.name }))) return;
    const running = i.state === 'live' && !!i.url;
    if (running) reload(slot);
    showToast({ title: running ? t('options.reloaded', { name: i.name }) : t('options.saved', { name: i.name }), action: undoToast() });
  };
  const changedOf = (i: TileInfo): number => (cat && i.tile && isProgramTile(i.tile) ? changedCount(cat, i.tile.program, i.tile.view, i.tile.params ?? {}) : 0);
  const toggleMaximise = (slot: string) => apply((st) => onActive(st, (b) => toggleMax(b, slot)));
  const split = (slot: string, side: Side) => {
    let fresh = '';
    if (onBoardOp((b) => { const r = overflowing(b) ? splitEnd(b, rand) : splitAt(b, slot, side, rand); if (isRefusal(r)) return r; fresh = r.slot; return r.board; }, t('undo.split'))) showPicker(fresh);
  };
  const duplicateTile = (slot: string) => {
    const tile = board.tiles[slot];
    const box = boxes[slot];
    if (!tile) return;
    const side: Side = box && box.width < NARROW_TILE ? 'down' : 'right';
    // A program tile gets the lowest free session, read from the Boards the change is made on (its own label stays the
    // default); every number in use refuses (SESSIONS_FULL) and nothing is added. A web or port tile is the same address again.
    change((st, held) => {
      const session = isProgramTile(tile) ? nextSession(st, tile.computer, tile.program) : 0;
      if (isRefusal(session)) return session;
      const copy: TileKind = isProgramTile(tile)
        ? { project: tile.project, computer: tile.computer, program: tile.program, session, ...(tile.view ? { view: tile.view } : {}), ...(tile.params ? { params: tile.params } : {}) }
        : tile;
      return onActive(st, (b, taken) => { const r = overflowing(b) ? splitEnd(b, rand) : splitAt(b, slot, side, rand); if (isRefusal(r)) return r; return setTile(r.board, r.slot, copy, rand, { taken }); }, held);
    }, t('undo.duplicate', { name: infoOf(slot)?.name ?? '' }));
  };
  // Move to another Board: what moves is captured when the move begins (the tile by its id and its
  // Board), and committed under the cross-tab lock on the Boards as stored, so a tile closed, replaced or moved off
  // meanwhile is refused (moveTileToBoard NOT_FOUND) and nothing moves. Both Boards' undo steps go (one would put the
  // tile back while the other still holds it): the toast's Move back is the way back.
  const openMove = (slot: string) => {
    const tid = board.tiles[slot]?.tid;
    if (tid) setMoving({ tid, fromBoardId: board.id, name: infoOf(slot)?.name ?? '' });
  };
  const moveTile = (c: MoveCapture, target: MoveTarget, back = false) => {
    let toId = target.kind === 'board' ? target.toBoardId : '';
    let toName = '';
    const named: MoveTarget = target.kind === 'new' ? { kind: 'new', name: [...(target.name ?? '')].slice(0, NAME_MAX).join('') } : target;
    void api.applyLocked((st, r, _held, stored) => {
      const m = moveTileToBoard(st, { tid: c.tid, fromBoardId: c.fromBoardId, target: named, deleted: stored.gone }, r);
      if (isRefusal(m)) return m;
      toId = m.toBoardId;
      const to = m.state.boards.find((b) => b.id === m.toBoardId);
      toName = to ? labelOf(to) : '';
      return m.state;
    }, { clearUndoIds: () => [c.fromBoardId, toId] }).then((r) => {
      if (r?.refused === 'NOT_FOUND') { showToast({ title: t('move.stale', { name: c.name }), tone: 'info' }); return; }
      if (r) { sayLocked(r, fullRealmText); return; }
      if (!toId || !toName) return;
      say(t('live.moved', { name: c.name, board: toName }));
      if (back) showToast({ title: t('move.movedBack', { name: c.name, board: toName }), tone: 'ok' });
      else showToast({ title: t('move.moved', { name: c.name, board: toName }), tone: 'ok', action: { label: t('move.back'), onAction: () => moveTile({ tid: c.tid, fromBoardId: toId, name: c.name }, { kind: 'board', toBoardId: c.fromBoardId }, true) } });
      setTimeout(() => focusSurface(), 0);
    });
  };
  const swapWith = (a: string, b: string) => {
    if (onBoardOp((x) => swapSlots(x, a, b), t('undo.swap'))) say(t('live.swapped', { label: infoOf(b)?.label ?? '' }));
  };

  const shellEntry = (i: TileInfo): MenuEntry[] => {
    const target = shellTarget(i);
    return target
      ? [
          { id: 'shell', label: t('tile.shell'), opens: true, onAction: () => setShellFor({ slot: i.slot, target }) },
          { id: 'restart', label: t('tile.restart'), opens: true, onAction: () => setRestartFor(target) },
        ]
      : [];
  };
  const tileMenu = (i: TileInfo): MenuEntry[] => {
    const others = infos.filter((o) => o.slot !== i.slot);
    // Sessions and options belong to the tile programs; a port, a Bot, a script or a web address has neither, so its Duplicate
    // promises no new session.
    const prog = isProgramTile(i.tile);
    return [
      { id: 'program', label: t('tile.changeProgram'), opens: true, onAction: () => setChangeFor({ slot: i.slot, step: 'program' }) },
      ...(prog ? [{ id: 'session', label: t('tile.changeSession'), opens: true, onAction: () => setChangeFor({ slot: i.slot, step: 'session' }) } as MenuEntry] : []),
      ...others.map((o): MenuEntry => ({ id: 'swap-' + o.slot, label: t('tile.swapWith', { label: o.label }), onAction: () => swapWith(i.slot, o.slot) })),
      { id: 'split-r', label: t('tile.splitRight'), shortcut: 'S', isDisabled: full, disabledReason: full ? t('board.full') : undefined, onAction: () => split(i.slot, 'right') },
      { id: 'split-d', label: t('tile.splitDown'), shortcut: 'V', isDisabled: full, disabledReason: full ? t('board.full') : undefined, onAction: () => split(i.slot, 'down') },
      { id: 'dup', label: t(prog ? 'tile.duplicate' : 'tile.duplicateSame'), isDisabled: full, disabledReason: full ? t('board.full') : undefined, onAction: () => duplicateTile(i.slot) },
      ...(i.tile ? [{ id: 'move', label: t('tile.moveTo'), shortcut: 'B', opens: true, onAction: () => openMove(i.slot) } as MenuEntry] : []),
      '-',
      ...(prog ? [{ id: 'options', label: t('tile.options'), shortcut: 'O', opens: true, onAction: () => setOptionsFor(i.slot) } as MenuEntry] : []),
      ...(i.shareUrl ? [{ id: 'copy', label: t('tile.copyLink'), copy: i.shareUrl, onAction: () => undefined } as MenuEntry] : []),
      ...terminalMenu(i, t),
      ...shellEntry(i),
      ...(browserTarget(i) ? [{ id: 'devtools', label: t('tile.devtools'), opens: true, onAction: () => setDevtoolsFor(browserTarget(i)) } as MenuEntry] : []),
      ...computerLinks(i.computer, power(i.computer)),
      '-',
      { id: 'close', label: t('tile.close'), shortcut: 'X', onAction: () => close(i.slot) },
    ];
  };

  // ---- Boards ----
  // A new Board (New, Duplicate, Import) is committed under the cross-tab lock against the stored Boards (data.ts
  // applyLocked, Open with): the nine-Board cap is checked again on what another tab stored meanwhile.
  const sayLocked = (r: LockedRefusal | null, full: string) => {
    if (r?.refused === 'NOT_KNOWN') showToast({ title: t('board.unknown'), tone: 'unknown' /* noDetails: the store was accepted and its answer not seen yet (data.ts NOT_KNOWN); there is no rejection */ });
    else if (r) showToast({ title: r.refused === 'NOT_ADDED' ? t('board.notAdded') : r.refused === 'BOARDS_FULL' ? full : refusalText(r), tone: 'info' });
  };
  const createNew = () => {
    void api.applyLocked((st, r) => createBoard(st, r, t('board.numbered', { n: st.boards.length + 1 }))).then((r) => sayLocked(r, fullRealmText));
  };
  const duplicate = (id: string) => {
    void api.applyLocked((st, r, held) => {
      const src = st.boards.find((b) => b.id === id);
      return src ? duplicateBoard(st, id, r, copyName(labelOf(src), t('board.copyWord'), st.boards.map(labelOf)), held) : st;
    }).then((r) => sayLocked(r, fullRealmText));
  };
  const exportBoard = () => {
    const doc = { kind: 'hoody-board', v: 1, board: toStored({ v: 1, active: board.id, boards: [board], recents: [] }).boards[0] };
    save(`board-${labelOf(board)}.json`, [JSON.stringify(doc, null, 2)], { maxBytes: 65536 }); // reason: the bytes of the downloaded Board file
  };
  // Download as HTML: a static copy made here, in the browser, from what the Board shows (boardHtml.ts). No request.
  const downloadHtml = async () => {
    setHtmlFor(null);
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const text: HtmlText = {
      saved: t('html.saved', { date }), notSynced: t('html.notSynced'), openHub: t('html.openHub'), openNew: t('tile.openNew'), empty: t('empty.chip'),
      cardHub: t('html.cardHub'), cardNoAddress: t('html.cardNoAddress'),
    };
    const origin = hubOrigin();
    let ok = false;
    try {
      const html = await boardHtml({
        board: labelOf(board), realm: realmId === 'all' ? null : realmName, hubUrl: origin ? `${origin}/auth/home#${links.board}` : '', text, layout: board.layout,
        tiles: Object.fromEntries(infos.map((i) => [i.slot, htmlTile(i, text)])),
      });
      ok = 'ok' in save(htmlFileName(realmId === 'all' ? null : realmName, state.boards.map(labelOf), state.boards.findIndex((b) => b.id === board.id), now), [html], { maxBytes: 262144 }); // reason: the bytes of the downloaded page (8 tiles at most)
    } catch { ok = false; }
    if (!ok) showToast({ title: t('html.failed', { name: labelOf(board) }), body: t('html.failedBody'), tone: 'error' /* noDetails: the file is made in the browser; no request, so no rejection to show */, action: { label: t('html.retry'), onAction: () => { void downloadHtml(); } } });
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    let raw: unknown = null;
    try { raw = f.size <= 65536 ? JSON.parse(await f.text()) : null; } catch { raw = null; }
    const doc = raw && typeof raw === 'object' ? (raw as { kind?: unknown; v?: unknown; board?: unknown }) : null;
    const loaded = doc && doc.kind === 'hoody-board' && doc.v === 1 ? parseRealmBoards({ v: 1, active: (doc.board as { id?: unknown })?.id, boards: [doc.board], recents: [] }) : null;
    const b = loaded && loaded.notice === null ? loaded.state.boards[0] : undefined;
    // The fix of a wrong file is another file: the toast's action opens the file chooser again.
    if (!b) { showToast({ title: t('board.notABoard'), tone: 'error', action: { label: t('board.chooseFile'), onAction: () => fileInput.current?.click() } }); return; }
    const r = await api.applyLocked((st, rr, held) => importBoard(st, b, rr, held));
    sayLocked(r, realmId === 'all' ? t('board.importFullAll') : t('board.importFull', { realm: realmName }));
    // Imported: the new Board opens at once (importBoard makes it active) and its name is announced (live.board), so no toast.
  };
  const switchTo = (op: (st: RealmBoards) => RealmBoards | Refusal) => {
    entryGen.current++;
    const r = apply(op);
    if (!r) setTimeout(() => focusSurface(), 0);
  };
  useEffect(() => { say(t('live.board', { name: labelOf(board) })); }, [board.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close Board: the Board goes to Closed Boards first, then off the strip (closed.ts close). Its
  // toast's Undo makes it again from its entry (restore). A Board with no tile is not kept, so it has no Undo.
  const closeBoard = (id: string) => {
    const b = state.boards.find((x) => x.id === id);
    if (!b) return;
    const name = labelOf(b);
    void closedBoards.close(id).then((r) => {
      if ('refused' in r) { showToast(closeText(t, name, r) /* noDetails: an outcome told by its own words, no rejection to show (an unknown one is tone unknown) */); return; }
      const cid = r.cid;
      if (cid === null) { showToast({ title: t('closed.closedEmpty', { name }), tone: 'info' }); return; }
      showToast({ title: t('closed.closed', { name }), action: { label: t('undo.label'), onAction: () => { void closedOne.run(() => closedBoards.restore(cid)).then((x) => { if (x) sayRestore(name, x); else showToast({ title: t('closed.busy'), tone: 'info' }); }); } } });
    });
  };
  // A restore's outcome (the dialog's Restore and Close's Undo alike): a Board that opened says nothing more, unless its
  // entry stayed in the history too.
  const sayRestore = (name: string, r: { readonly entryKept: boolean } | ClosedRefusal) => {
    const said = restoreText(t, name, fullRealmText, r);
    if (said) showToast(said /* noDetails: an outcome told by its own words, no rejection to show (an unknown one is tone unknown) */);
  };
  // Closing the realm's one Board when it is empty would only put an empty Board in its place.
  const closeReason = (b: Board) => (state.boards.length < 2 && filledCount(b) === 0 ? t('closed.lastEmpty') : undefined);
  const scrollEntry = useScrollEntry(board.mode, (next, label) => onBoardOp((b) => setBoardMode(b, next), label));
  // Boards ▾: the Boards' one menu, the same on desktop and phone. Every Board (its tile
  // count; 1-9 switch on desktop), New Board, then the open Board's own rows under its name, then the realm's: Closed
  // Boards…, Export, Import… (refused at 9 Boards, said here first), Keep frames loaded, Keyboard shortcuts… On a phone
  // (no tabs to reorder, no Undo button) it also moves the Board and undoes.
  const tabsRef = useRef<TabsEditHandle>(null);
  // A rename in place on a tab (F2, double-click, or Boards ▾ > Rename) is the rename dialog's twin: open, it is the
  // rename a lock reports as not kept (onRenaming); once its draft differs from the name it holds the state (api.hold),
  // released when it ends. Only the hold it took is released.
  const tabHeld = useRef(false);
  const onTabEditing = (st: { id: string; draft: string } | null) => {
    if (st === null) {
      // With this BoardReady's lockGen: a rename the strip ends as a lock remounts the Board stays open for the lock.
      onRenaming(false, api.lockGen);
      if (tabHeld.current) { tabHeld.current = false; api.hold(false); }
      return;
    }
    onRenaming(true);
    const b = tabBoard(st.id);
    if (!tabHeld.current && b && st.draft !== labelOf(b)) { tabHeld.current = true; api.hold(true); }
  };
  const at = state.boards.findIndex((b) => b.id === board.id);
  const importFull = boardsFull ? (realmId === 'all' ? t('board.importFullAll') : t('board.importFull', { realm: realmName })) : undefined;
  const boardMenuItems: MenuList = [
    {
      id: 'boards',
      select: 'one',
      name: t('boards'),
      current: 'b-' + board.id,
      items: state.boards.map((b, i) => ({ id: 'b-' + b.id, label: labelOf(b) + ' · ' + t('board.tileCount', { count: filledCount(b) }), ...(phone || i > 8 ? {} : { shortcut: String(i + 1) }), onAction: () => switchTo((st) => setActiveBoard(st, b.id)) })),
    },
    { id: 'make', items: [{ id: 'new', label: t('board.new'), isDisabled: boardsFull, disabledReason: boardsFull ? fullRealmText : undefined, onAction: createNew }] },
    {
      id: 'this',
      label: labelOf(board),
      items: [
        // Desktop: the rename in place on its tab (as F2 there); a phone has no tabs, so its dialog.
        phone
          ? { id: 'rename', label: t('board.rename'), opens: true, onAction: () => { setRenaming({ id: board.id, draft: labelOf(board) }); onRenaming(true); } }
          : { id: 'rename', label: t('board.rename'), shortcut: 'F2', onAction: () => { renameChosen.current = true; tabsRef.current?.rename(board.id); } },
        { id: 'left', label: t('board.moveLeft'), isDisabled: at <= 0, disabledReason: at <= 0 ? t('board.alreadyFirst') : undefined, onAction: () => change((st) => reorderBoard(st, at, at - 1)) },
        { id: 'right', label: t('board.moveRight'), isDisabled: at >= state.boards.length - 1, disabledReason: at >= state.boards.length - 1 ? t('board.alreadyLast') : undefined, onAction: () => change((st) => reorderBoard(st, at, at + 1)) },
        { id: 'dup', label: t('board.duplicate'), isDisabled: boardsFull, disabledReason: boardsFull ? fullRealmText : undefined, onAction: () => duplicate(board.id) },
        { id: 'close', label: t('board.close'), isDisabled: !!closeReason(board), disabledReason: closeReason(board), onAction: () => closeBoard(board.id) },
        ...(phone ? [{ id: 'undo', label: api.undoLabel ? t('layout.undoWhat', { what: api.undoLabel }) : api.undoStale ? t('layout.undoStale') : t('layout.undo'), isDisabled: !api.undoLabel, disabledReason: !api.undoLabel && !api.undoStale ? t('layout.nothingToUndo') : undefined, onAction: () => api.undo() }] : []),
      ],
    },
    {
      id: 'realm',
      items: [
        { id: 'closed', label: t('closed.title'), opens: true, onAction: () => setClosedOpen(true) },
        { id: 'export', label: t('board.export'), onAction: exportBoard },
        { id: 'html', label: t('board.html'), opens: true, isDisabled: filledCount(board) === 0, disabledReason: filledCount(board) === 0 ? t('html.empty') : undefined, onAction: () => setHtmlFor(board.id) },
        { id: 'import', label: t('board.import'), opens: true, isDisabled: boardsFull, disabledReason: importFull, onAction: () => fileInput.current?.click() },
      ],
    },
    // The shell keeps the Board loaded and hidden on other pages (view.tsx useKeepPage). A menu row
    // holds no second control, so what it does is said once it is switched.
    {
      id: 'keep',
      select: 'many',
      items: [{ id: 'keep', label: t('board.keepLoaded'), checked: !!state.keep, onAction: () => {
        const on = !state.keep;
        if (!apply((st) => setKeepLoaded(st, on))) showToast({ title: t(on ? 'board.keepLoadedOn' : 'board.keepLoadedOff'), tone: 'info' });
      } }],
    },
    { id: 'help', items: [{ id: 'shortcuts', label: t('board.shortcuts'), opens: true, ...(phone ? {} : { shortcut: '?' }), onAction: openShortcutsSheet }] },
  ];
  const tabBoard = (id: string) => state.boards.find((b) => b.id === id);
  const tabMenu = (id: string): MenuEntry[] => [
    { id: 'dup', label: t('board.duplicate'), isDisabled: boardsFull, disabledReason: boardsFull ? fullRealmText : undefined, onAction: () => duplicate(id) },
    { id: 'close', label: t('board.close'), isDisabled: !!(tabBoard(id) && closeReason(tabBoard(id) as Board)), disabledReason: tabBoard(id) ? closeReason(tabBoard(id) as Board) : undefined, onAction: () => closeBoard(id) },
  ];

  // ---- Layout menu ----
  const filled = filledCount(board);
  const matches = (p: Preset): boolean => {
    const ids = slots(board.layout);
    if (ids.length !== PRESET_SLOTS[p]) return false;
    const want = applyPreset(board, p, rand);
    return !isRefusal(want) && JSON.stringify(equalise(want.layout)) === JSON.stringify(equalise(board.layout));
  };
  // Grouped: the presets as one choice, headed by the Board's tile count while it shows one (it
  // left the strip: here it explains the disabled presets); Scroll as an on/off; Equalise and Undo. A Board with nothing
  // on it shows no count, however many empty slots it has ("2 of 6" read as tiles); a paged Board says it in its note.
  const tileCount = single || filled === 0 || (paging && pager) ? null : t('board.count', { n: boardSlots(board).length });
  const scrollRow = scrollEntry as MenuAction & { checked: boolean; tone?: 'default' };
  const shownPreset = PRESETS.find((p) => matches(p)) ?? null;
  const layoutMenu: MenuList = [
    {
      id: 'presets',
      select: 'one',
      ...(tileCount ? { label: tileCount } : { name: t('layout') }),
      current: shownPreset ? 'preset-' + shownPreset : null,
      items: PRESETS.map((p) => {
        const tooSmall = filled > PRESET_SLOTS[p];
        const narrow = size ? !presetFitsIn(board.mode, p, size.w, size.h) : false;
        return {
          id: 'preset-' + p,
          label: t('layout.' + p),
          picture: <MenuThumb cells={PRESET_CELLS[p]} />,
          isDisabled: tooSmall || narrow,
          disabledReason: tooSmall ? t('layout.tooSmall', { n: filled, m: PRESET_SLOTS[p] }) : narrow ? t('layout.tooNarrow') : undefined,
          onAction: () => onBoardOp((b) => applyPreset(b, p, rand), t('undo.preset')),
        };
      }),
    },
    { id: 'mode', select: 'many', name: scrollRow.label, items: [scrollRow] },
    {
      id: 'tidy',
      items: [
        { id: 'equalise', label: t('layout.equalise'), shortcut: '=', onAction: () => onBoardOp(equaliseBoard, t('undo.equalise')) },
        { id: 'undo', label: api.undoLabel ? t('layout.undoWhat', { what: api.undoLabel }) : api.undoStale ? t('layout.undoStale') : t('layout.undo'), shortcut: 'U', isDisabled: !api.undoLabel, disabledReason: !api.undoLabel && !api.undoStale ? t('layout.nothingToUndo') : undefined, onAction: () => api.undo() },
      ],
    },
  ];

  // ---- frames: focus inside (the keys lock), parent keys ----
  // The lock follows focus into a frame and stays while focus is anywhere on that tile (its header, its buttons);
  // focus anywhere else (another tile, the strip, the shell) ends it.
  const boardIdRef = useRef(board.id);
  boardIdRef.current = board.id;
  useEffect(() => {
    const check = () => setTimeout(() => {
      const a = document.activeElement;
      let hit: string | null = null;
      // contains, not ===: a conversation tile's FrameHandle is its native body, focus anywhere in it enters the tile.
      for (const [slot, f] of frames.current) if (f && a && f.element()?.contains(a)) hit = slot;
      if (hit) { setInside(hit); apply((st) => onActive(st, (b) => focusSlot(b, hit as string))); return; }
      setInside((cur) => (cur && a && document.getElementById(domId(boardIdRef.current, cur))?.contains(a) ? cur : null));
    }, 0);
    window.addEventListener('blur', check);
    window.addEventListener('focus', check);
    document.addEventListener('focusin', check);
    return () => { window.removeEventListener('blur', check); window.removeEventListener('focus', check); document.removeEventListener('focusin', check); };
  }, [apply]);

  const chordRef = useRef<(slot: string, chord: unknown) => void>(() => undefined);
  chordRef.current = (slot, chord) => {
    if (chord === 'escape') { leaveTile(slot); return; }
    const side = ({ left: 'left', right: 'right', up: 'up', down: 'down' } as Record<string, Side>)[String(chord)];
    if (!side) return;
    let to = '';
    apply((st) => onActive(st, (b) => { const x = focusSlot(b, slot) as Board; const n = focusToward(x, side, drawn(x)); to = n.active; return n; }));
    if (to) setTimeout(() => enterTile(to), 0);
  };
  useEffect(() => {
    const on = (e: MessageEvent) => {
      for (const [slot, w] of wins.current) {
        if (e.source !== w.win || e.origin !== w.origin || !w.origin) continue;
        const d = e.data as { type?: unknown; v?: unknown; chord?: unknown } | null;
        if (d && typeof d === 'object' && d.type === 'hoody-parent-key' && d.v === 1) chordRef.current(slot, d.chord);
        return;
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);

  // ---- dragging a tile (header) ----
  const dragRef = useRef<DragTile | null>(null);
  dragRef.current = drag;
  // A tile drag's window listeners end with the view (a remount on lockGen): its release then moves nothing. One
  // gesture at a time: it owns its pointer (another finger or a second press is not it), its hold timer and its
  // listeners, and it ends, moving nothing, when the Board under it changes (a keyboard swap, maximise, a close, a
  // layout that stops fitting): the feedback never stays on a slot whose tile changed.
  const endTileDrag = useRef<(() => void) | null>(null);
  const gestureKey = JSON.stringify([board.id, board.layout, board.tiles, board.max, single, pageKey]);
  useEffect(() => { endTileDrag.current?.(); }, [gestureKey]);
  const startTileDrag = (slot: string) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a')) return;
    if (endTileDrag.current) return;
    if (board.max) {
      // No dragging here, but a plain click on the header still enters the program. The click is the same
      // owned gesture: its own pointer only, ended by a cancel, a Board change or the view ending, never a later release.
      const tileRoot = document.getElementById(domId(boardIdRef.current, slot));
      const cpid = e.pointerId;
      const cend = () => {
        if (endTileDrag.current === cend) endTileDrag.current = null;
        window.removeEventListener('pointerup', cup);
        window.removeEventListener('pointercancel', ccancel);
      };
      const cup = (ev: PointerEvent) => { if (ev.pointerId !== cpid) return; cend(); if (tileRoot?.contains(ev.target as Node)) enterSoon(slot, 0); };
      const ccancel = (ev: PointerEvent) => { if (ev.pointerId === cpid) cend(); };
      endTileDrag.current = cend;
      window.addEventListener('pointerup', cup);
      window.addEventListener('pointercancel', ccancel);
      return;
    }
    const area = areaRef.current?.getBoundingClientRect();
    if (!area) return;
    const x0 = e.clientX - area.left, y0 = e.clientY - area.top;
    // The drag threshold is measured on the screen: a view scrolling under a pressed header moves no pointer.
    const cx0 = e.clientX, cy0 = e.clientY;
    let st: DragTile = { from: slot, x0, y0, x: x0, y: y0, on: false, target: null, zone: null, strip: null, chip: null };
    // A filled tile dragged onto a strip tab or New Board moves to that Board. What moves is captured now,
    // by the tile's id and Board, so a tile closed, replaced or moved off during the drag is refused at the drop.
    const tid0 = board.tiles[slot]?.tid;
    const cap: MoveCapture | null = tid0 ? { tid: tid0, fromBoardId: board.id, name: infoOf(slot)?.name ?? '' } : null;
    let hold: ReturnType<typeof setTimeout> | null = null;
    // The only tile drags as it always did (a drag still holds the state), but shows no pressed feedback: there is no
    // other tile to move it to, and its header reads as fixed (.solo).
    const solo = boardSlots(board).length === 1;
    const begin = () => { st = { ...st, on: true }; setDrag(st); if (!solo) setPressed({ slot, phase: 'press' }); api.hold(true); };
    if (!solo) setPressed({ slot, phase: e.pointerType === 'touch' ? 'hold' : 'press' });
    // A finger held still is dragging over its own tile once the hold passes: the target is read then, so "Release to
    // cancel" shows without a move.
    if (e.pointerType === 'touch') hold = setTimeout(() => { hold = null; begin(); move(last); }, TOUCH_HOLD_MS);
    const pid = e.pointerId;
    const mine = (ev: PointerEvent) => ev.pointerId === pid;
    const onMove = (ev: PointerEvent) => { if (mine(ev)) move(ev); };
    const onCancel = (ev: PointerEvent) => { if (mine(ev)) end(); };
    // The area is read again on every move: in Scroll mode the view can scroll during the drag, and a
    // scroll with the pointer still re-reads the target under it.
    let last: { clientX: number; clientY: number } = { clientX: e.clientX, clientY: e.clientY };
    const move = (ev: { clientX: number; clientY: number }) => {
      last = { clientX: ev.clientX, clientY: ev.clientY };
      const now = areaRef.current?.getBoundingClientRect() ?? area;
      const x = ev.clientX - now.left, y = ev.clientY - now.top;
      if (!st.on) {
        if (Math.hypot(ev.clientX - cx0, ev.clientY - cy0) < DRAG_PX) return;
        if (e.pointerType === 'touch') { end(); return; }
        begin();
      }
      // Only a point inside the view targets a tile: in Scroll the area runs past it, and a tile it clips is not a drop
      // place. A view with no size yet (not laid out) does not limit.
      const vr = viewRef.current?.getBoundingClientRect();
      const inView = !vr || vr.height === 0 || (ev.clientX >= vr.left && ev.clientX <= vr.right && ev.clientY >= vr.top && ev.clientY <= vr.bottom);
      // The strip lies outside the view: the element under the pointer says whether it is over a tab or New Board.
      const strip = cap ? stripDropAt(ev.clientX, ev.clientY, cap.fromBoardId) : null;
      // The chips row lies outside the view too: a chip of another slot is a swap there, so a tile reaches another page
      // by drag. Its own chip is no place, and over any chip no tile is one.
      const overChip = strip === null ? chipDropAt(ev.clientX, ev.clientY) : null;
      const chip = overChip !== null && overChip !== slot ? overChip : null;
      // On a page only the tiles on screen are places, and a drop swaps: an edge would split the saved layout, which is not drawn.
      // One tile at a time, no tile is a place: the drag is for the chips (and the strip), a click still enters.
      const places = single ? [] : paging ? paging.slots : Object.keys(boxes);
      const target = inView && strip === null && overChip === null ? places.find((p) => dropZone(boxes[p] as Box, x, y) !== null) ?? null : null;
      const zone = target ? (paging ? 'centre' : dropZone(boxes[target] as Box, x, y)) : null;
      st = { ...st, x, y, target, zone, strip, chip };
      setDrag(st);
    };
    const end = () => {
      if (endTileDrag.current === end) endTileDrag.current = null;
      if (hold) clearTimeout(hold);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('scroll', onScroll, true);
      setPressed((x) => (x?.slot === slot ? null : x));
      if (st.on) { setDrag(null); api.hold(false); }
    };
    const up = (ev: PointerEvent) => {
      if (!mine(ev)) return;
      // A drop is judged where the pointer is released over the area as it is now (a scroll event may still be
      // queued); with the area gone it drops nothing. A strip place is dropped on only as drawn: one that differs at the
      // release (the strip scrolled under a still pointer, a tab moved) drops nothing.
      const shownStrip = st.strip;
      const shownChip = st.chip;
      if (st.on) {
        if (!areaRef.current) { end(); return; }
        move(ev);
      }
      const done = st;
      end();
      // A click on the header enters the program. Leaving: Escape on the tile bar, Ctrl+Alt+B where the
      // program forwards it, or focus moving outside the tile.
      if (!done.on) { enterSoon(slot, 0); return; }
      if (cap && (done.strip !== null || shownStrip !== null)) {
        if (done.strip === shownStrip && done.strip !== null) moveTile(cap, done.strip === NEW_BOARD_DROP ? { kind: 'new', name: cap.name } : { kind: 'board', toBoardId: done.strip });
        return;
      }
      // A chip, like a strip place, is dropped on only as drawn.
      if (done.chip !== null || shownChip !== null) {
        const to = done.chip;
        if (to !== null && to === shownChip) onBoardOp((b) => moveSlot(b, done.from, to, 'centre'), t('undo.swap'));
        return;
      }
      if (done.target && done.zone && done.target !== done.from) {
        onBoardOp((b) => moveSlot(b, done.from, done.target as string, done.zone as 'centre'), done.zone === 'centre' ? t('undo.swap') : t('undo.move'));
      }
    };
    // Any scroll under a still pointer (the view in Scroll mode; the Board strip when its tabs overflow) reads the
    // target under it again, so what is drawn is what a release drops on.
    const onScroll = () => { if (st.on) move(last); };
    document.addEventListener('scroll', onScroll, true);
    endTileDrag.current = end;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', onCancel);
  };

  // ---- dividers ----
  const splitAtPath = (path: Path) => nodeAt(board.layout, path) as SplitNode | null;
  const stepDivider = (d: Split, delta: number) => {
    const n = splitAtPath(d.path);
    if (n && !isSlot(n)) onBoardOp((b) => setBoardRatio(b, d.path, dragRatio(n, n.ratio + delta, d.length)), t('undo.resize'));
  };
  const equaliseDivider = (d: Split) => {
    const n = splitAtPath(d.path);
    if (n && !isSlot(n)) onBoardOp((b) => setBoardRatio(b, d.path, (equalise(n) as SplitNode).ratio), t('undo.resize'));
  };
  // A drag (the kit Splitter's pointer events): the node and the area are taken at its start; the ratio follows the
  // pointer and lands as one undoable change on release.
  const divRun = useRef<{ n: SplitNode; area: DOMRect; ratio: number } | null>(null);
  useEffect(() => () => { endTileDrag.current?.(); bodyPress.current?.(); divRun.current = null; entryGen.current++; }, []);
  const startDivider = (d: Split) => {
    const n = splitAtPath(d.path);
    const area = areaRef.current?.getBoundingClientRect();
    if (!n || isSlot(n) || !area) return;
    api.hold(true);
    divRun.current = { n, area, ratio: n.ratio };
    setDivDrag({ path: d.path, ratio: n.ratio, div: d });
  };
  const moveDivider = (d: Split, x: number, y: number) => {
    const run = divRun.current;
    if (!run) return;
    const area = areaRef.current?.getBoundingClientRect() ?? run.area; // read again: the view may have scrolled since the drag began
    const pos = d.dir === 'row' ? x - area.left : y - area.top;
    let ratio = dragRatio(run.n, (pos - d.start) / d.length, d.length);
    // In Scroll the area keeps its height during the drag (it grows on release): stop at the last ratio that still
    // draws every tile at its minimum there, nested ratios included.
    if (board.mode === 'scroll' && size) {
      const ok = (r: number) => fits(setRatio(board.layout, d.path, r), size.w, areaH);
      if (!ok(ratio)) {
        let lo = run.ratio, hi = ratio;
        for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
        ratio = lo;
      }
    }
    run.ratio = ratio;
    setDivDrag({ path: d.path, ratio: run.ratio, div: d });
  };
  const endDivider = (d: Split) => {
    const run = divRun.current;
    divRun.current = null;
    setDivDrag(null);
    api.hold(false);
    if (run && run.ratio !== run.n.ratio) onBoardOp((b) => setBoardRatio(b, d.path, run.ratio), t('undo.resize'));
  };

  // U after another tab changed this Board says so once, then is off until there is something to undo.
  const [staleSaid, setStaleSaid] = useState(false);
  useEffect(() => { if (api.undoLabel) setStaleSaid(false); }, [api.undoLabel]);
  const undoKey = () => {
    if (api.undoLabel) { api.undo(); return; }
    if (api.undoStale && !staleSaid) { showToast({ title: t('layout.undoStaleSaid'), tone: 'info' }); setStaleSaid(true); }
  };

  // Keyboard resize keeps every tile at its 240 x 160 minimum while the Board has the room.
  const keyResize = (b: Board, side: Side): Board => {
    const r = resizeActive(b, side);
    return size && layoutFits(b.mode, b.layout, size.w, size.h) && !layoutFits(b.mode, r.layout, size.w, size.h) ? b : r;
  };

  // Previous or next page: the first tile of that page becomes active, which shows the page. The keys stay on the Board.
  const stepPage = (step: 1 | -1) => {
    const to = pager?.pages[pager.index + step];
    const first = to?.[0];
    if (!pager || !to || !first) return;
    entryGen.current++;
    if (apply((st) => onActive(st, (b) => focusSlot(b, first)))) return; // refused (another tab's value opens): stays
    say(t('announce.paged', { page: pager.index + step + 1, pages: pager.pages.length, shown: to.length, count: boardSlots(board).length }));
    focusSurface();
  };

  // ---- keys ----
  const activeInfo = infoOf(board.active);
  const hasTile = !!activeInfo?.tile;
  // Groups for the ? sheet; moving, swapping and resizing are keys, not commands, so they stay out of the palette.
  const move = { group: t('key.groupMove'), palette: false } as const;
  const arrange = { group: t('key.groupArrange'), palette: false } as const;
  const tiles = { group: t('key.groupTiles') } as const;
  const boards = { group: t('key.groupBoards') } as const;
  const keys: PageShortcut[] = [
    ...SIDES.flatMap((side): PageShortcut[] => [
      { ...move, key: ARROW[side], label: t('key.' + side), run: () => apply((st) => onActive(st, (b) => focusToward(b, side, drawn(b)))) },
      { ...move, key: VIM[side], label: t('key.' + side), run: () => apply((st) => onActive(st, (b) => focusToward(b, side, drawn(b)))) },
      { ...arrange, key: VIM[side].toUpperCase(), label: t(SIDE_KEY[side].swap), run: () => onBoardOp((b) => swapToward(b, side, drawn(b)), t('undo.swap')) },
      { ...arrange, key: ARROW[side], mods: ['shift'], label: t(SIDE_KEY[side].swap), run: () => onBoardOp((b) => swapToward(b, side, drawn(b)), t('undo.swap')) },
      { ...arrange, key: ARROW[side], mods: ['alt', 'shift'], label: t(SIDE_KEY[side].resize), enabled: !overflows, run: () => onBoardOp((b) => keyResize(b, side), t('undo.resize')) },
      { ...move, key: ARROW[side], mods: ['ctrl', 'alt'], label: t('key.' + side), run: () => { let to = ''; apply((st) => onActive(st, (b) => { const n = focusToward(b, side, drawn(b)); to = n.active; return n; })); if (to) setTimeout(() => enterTile(to), 0); } },
    ]),
    { ...move, key: 'PageUp', label: t('pager.prev'), enabled: !!pager && pager.index > 0, run: () => stepPage(-1) },
    { ...move, key: 'PageDown', label: t('pager.next'), enabled: !!pager && pager.index < pager.pages.length - 1, run: () => stepPage(1) },
    { ...tiles, palette: false, key: 'KeyB', mods: ['ctrl', 'alt'], whileTyping: true, label: t('key.leave'), run: () => { if (inside) { setInside(null); focusSurface(); } else enterTile(board.active); } },
    { ...tiles, key: 'Enter', label: t('key.enter'), run: () => enterTile(board.active) },
    { ...tiles, key: 'z', label: t('key.max'), run: () => toggleMaximise(board.active) },
    { ...tiles, key: 'n', label: t('key.add'), run: addProgram },
    { ...tiles, key: 's', label: t('key.splitRight'), enabled: !full, run: () => split(board.active, 'right') },
    { ...tiles, key: 'v', label: t('key.splitDown'), enabled: !full, run: () => split(board.active, 'down') },
    { ...tiles, key: 'x', label: t('key.close'), enabled: hasTile || boardSlots(board).length > 1, run: () => close(board.active) },
    { ...tiles, key: 'r', label: t('key.reload'), enabled: hasTile, run: () => reload(board.active) },
    { ...tiles, key: 'b', label: t('key.moveTo'), enabled: hasTile, run: () => openMove(board.active) },
    { ...tiles, key: 'o', label: t('key.options'), enabled: isProgramTile(board.tiles[board.active]), run: () => setOptionsFor(board.active) },
    { ...tiles, key: '.', label: t('key.menu'), enabled: hasTile, run: () => setMenuFor(board.active) },
    { ...tiles, key: '=', label: t('key.equalise'), run: () => onBoardOp(equaliseBoard, t('undo.equalise')) },
    { ...tiles, key: 'u', label: t('key.undo'), enabled: !!api.undoLabel || (api.undoStale && !staleSaid), run: undoKey },
    { ...tiles, palette: false, key: 'KeyZ', mods: ['mod'], label: t('key.undo'), enabled: !!api.undoLabel || (api.undoStale && !staleSaid), run: undoKey },
    ...state.boards.map((_, i): PageShortcut => ({ ...boards, palette: false, key: String(i + 1), label: t('key.board', { n: i + 1 }), run: () => switchTo((st) => boardByNumber(st, i + 1)) })),
    { ...boards, key: '{', label: t('key.prevBoard'), enabled: state.boards.length > 1, run: () => switchTo((st) => stepBoard(st, -1)) },
    { ...boards, key: '}', label: t('key.nextBoard'), enabled: state.boards.length > 1, run: () => switchTo((st) => stepBoard(st, 1)) },
    { ...boards, palette: false, key: 'BracketLeft', mods: ['ctrl', 'alt'], label: t('key.prevBoard'), enabled: state.boards.length > 1, run: () => switchTo((st) => stepBoard(st, -1)) },
    { ...boards, palette: false, key: 'BracketRight', mods: ['ctrl', 'alt'], label: t('key.nextBoard'), enabled: state.boards.length > 1, run: () => switchTo((st) => stepBoard(st, 1)) },
    { ...tiles, key: 'f', label: t('key.focus'), run: () => setFocus((f) => !f) },
    { ...tiles, palette: false, key: 'Escape', label: t('key.escape'), enabled: !!board.max && !focus, run: () => toggleMaximise(board.active) },
  ];
  usePageShortcuts(keys);

  // ---- render ----
  const tabItems = state.boards.map((b) => ({ id: b.id, label: labelOf(b) }));
  const noticeText = (() => {
    const n = api.notice;
    if (!n) return null;
    if (n.kind === 'reset') return t('notice.reset');
    if (n.kind === 'boards') return t('notice.boards', { count: n.n });
    if (n.kind === 'tile') return t('notice.tile');
    if (n.kind === 'other' || n.kind === 'deleted') return t('notice.' + n.kind, { name: n.name || t('board.main') });
    if (n.kind === 'capped') return t('notice.capped', { name: n.name || t('board.main') });
    if (n.kind === 'unreadable') return n.reason === 'foreign' ? t('notice.foreign') : n.reason === 'newer' ? t('notice.newer') : n.reason === 'locked' ? t('notice.locked') : n.reason === 'oversized' ? t('notice.oversized') : t('notice.malformed');
    if (n.kind === 'replaced') return t('notice.replaced');
    if (n.kind === 'updating') return t('notice.updating');
    if (n.kind === 'evicted') {
      const parts = [n.accounts ? t('notice.evictedAccounts', { count: n.accounts }) : '', n.parts ? t('notice.evictedRealms', { count: n.parts }) : ''];
      return parts.filter(Boolean).join(' ');
    }
    return t('notice.unsaved');
  })();
  // The two-tab bands have no button: they clear by themselves (data.ts), and are announced politely.
  const twoTab = api.notice?.kind === 'other' || api.notice?.kind === 'deleted';
  useEffect(() => { if (twoTab && noticeText) say(noticeText); }, [twoTab, noticeText]);
  const pickerStart = (slot: string, step: PickerStep) => {
    const tile = board.tiles[slot];
    if (isProgramTile(tile)) return { step, computer: tile.computer, program: tile.program };
    return tile && 'computer' in tile ? { step: 'program' as PickerStep, computer: tile.computer } : { step: 'computer' as PickerStep };
  };

  const tileStyle = (slot: string): CSSProperties | undefined => {
    const b = shown ? (slot === shown ? fullBox : boxes[slot]) : boxes[slot];
    return b ? { left: b.left, top: b.top, width: b.width, height: b.height } : { visibility: 'hidden' };
  };

  const scrolls = board.mode === 'scroll' && !single && !paging && !board.max;
  const area = (
    <div ref={viewRef} className={cx(scrollStyles.view, board.mode === 'scroll' && scrollStyles.gutter, scrolls && scrollStyles.scroll)}>
      {/* The Board surface: one tab stop whose active tile is named by aria-activedescendant; its keys are the page's. */}
      <div
        ref={(el) => { areaRef.current = el; surface.current = el; }}
        className={s.area}
        style={scrolls ? { flex: 'none', height: areaH } : undefined}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="group"
        aria-label={t('tiles')}
        aria-activedescendant={domId(board.id, board.active)}
      >
        {infos.map((i) => {
          const active = i.slot === board.active;
          const hidden = (!!shown && i.slot !== shown) || (!!paging && !paging.slots.includes(i.slot));
          const box = boxes[i.slot];
          if (!i.tile) {
            return (
              <EmptySlot
                key={i.slot}
                domId={domId(board.id, i.slot)}
                style={tileStyle(i.slot)}
                active={active}
                hidden={hidden}
                only={boardSlots(board).length === 1}
                keys
                addKey={i.slot === firstEmpty}
                pickerOpen={pickerFor === i.slot}
                onPickerOpen={(o) => { showPicker(o ? i.slot : null); if (!o) setSshPrefill(null); }}
                picker={sshPrefill && pickerFor === i.slot ? { ...pickerBase, start: { step: 'ssh', ssh: sshPrefill } } : pickerBase}
                recents={recentChips}
                terminal={quickTerminal}
                onPick={(x) => pick(i.slot, x, 'add')}
                onClose={() => close(i.slot)}
                onActivate={() => activate(i.slot)}
                onHeadPointerDown={startTileDrag(i.slot)}
                {...(pressed?.slot === i.slot ? { pressed: pressed.phase } : {})}
              />
            );
          }
          return (
            <Tile
              key={i.slot}
              info={i}
              domId={domId(board.id, i.slot)}
              style={tileStyle(i.slot)}
              active={active}
              maximised={board.max === i.slot}
              hidden={hidden}
              narrow={!!box && box.width < NARROW_TILE && !shown}
              inside={inside === i.slot}
              onLeave={() => leaveTile(i.slot)}
              reloadKey={reloads[i.slot] ?? 0}
              frameState={frameStates[i.slot] ?? 'loading'}
              frameRef={(f) => { frames.current.set(i.slot, f); }}
              keys
              menu={tileMenu(i)}
              menuOpen={menuFor === i.slot}
              onMenuOpen={(o) => setMenuFor(o ? i.slot : null)}
              onActivate={() => activate(i.slot)}
              onHeadPointerDown={startTileDrag(i.slot)}
              {...(pressed?.slot === i.slot ? { pressed: pressed.phase } : {})}
              onBodyPointerDown={startBodyEnter(i.slot)}
              onMax={single ? undefined : () => toggleMaximise(i.slot)}
              onReload={() => reload(i.slot)}
              onFrameState={(fs) => setFrameStates((m) => (m[i.slot] === fs ? m : { ...m, [i.slot]: fs }))}
              onRegister={(win, origin) => { if (win && origin) wins.current.set(i.slot, { win, origin }); else wins.current.delete(i.slot); }}
              onBack={focusSurface}
              onRetry={retryComputers}
              onOpenComputers={computersLink ? () => followPageLink(computersAt(computersLink, i.computer), go) : null}
              onOpenBilling={billingLink ? () => followPageLink(billingLink, go) : null}
              power={power(i.computer)}
              heldFrom={heldFromLink(power(i.computer), i.computer)}
              changed={phone ? 0 : changedOf(i)}
              onOptions={() => setOptionsFor(i.slot)}
              onSession={isProgramTile(i.tile) ? () => setChangeFor({ slot: i.slot, step: 'session' }) : undefined}
              cardActions={
                i.state === 'gone' ? (
                  <>
                    <Button variant="secondary" onPress={() => setChangeFor({ slot: i.slot, step: 'computer' })}>
                      {t('tile.pickAnother')}
                    </Button>
                    <Button variant="secondary" onPress={() => close(i.slot)}>
                      {t('tile.close')}
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onPress={() => close(i.slot)}>
                    {t('tile.close')}
                  </Button>
                )
              }
            />
          );
        })}
        {divs.map((d) => {
          const key = d.path.join('') || 'root';
          const pct = Math.round((divDrag && divDrag.path.join('') === d.path.join('') ? divDrag.ratio : d.ratio) * 100);
          const names = (ids: readonly string[]) => ids.map((x) => infoOf(x)?.name || t('empty.chip')).join(', ');
          return (
            // The Splitter keeps its arrows and Enter: page shortcuts skip a prevented key and a focused separator.
            <div
              key={key}
              className={cx(s.divSlot, d.dir === 'row' ? s.divRow : s.divCol)}
              style={{ left: d.box.left, top: d.box.top, width: d.box.width, height: d.box.height }}
            >
              <Splitter
                orientation={d.dir === 'row' ? 'vertical' : 'horizontal'}
                value={pct}
                min={10}
                max={90}
                label={t('divider', { a: names(d.a), b: names(d.b) })}
                onStep={(delta: number) => stepDivider(d, delta / 100)}
                onEqualise={() => equaliseDivider(d)}
                onDragStart={() => startDivider(d)}
                onDrag={(x, y) => moveDivider(d, x, y)}
                onDragEnd={() => endDivider(d)}
              />
            </div>
          );
        })}
        {(drag?.on || divDrag) && <div className={cx(s.shield, drag?.on && s.shieldGrab)} aria-hidden="true" />}
        {/* The drop ghost: over another tile, where the tile lands (Swap / Split here); still over the tile it started
            on (a Board with another tile to move to), the origin outlined, and releasing there moves nothing. */}
        {drag?.on && drag.target && boxes[drag.target] && (drag.target === drag.from ? boardSlots(board).length > 1 : !!drag.zone) && (() => {
          const b = boxes[drag.target] as Box;
          const back = drag.target === drag.from;
          const g = back || drag.zone === 'centre' ? b
            : drag.zone === 'left' ? { ...b, width: b.width / 2 } : drag.zone === 'right' ? { ...b, left: b.left + b.width / 2, width: b.width / 2 }
            : drag.zone === 'up' ? { ...b, height: b.height / 2 } : { ...b, top: b.top + b.height / 2, height: b.height / 2 };
          return (
            <div className={s.ghost} style={{ left: g.left, top: g.top, width: g.width, height: g.height }} aria-hidden="true">
              {back ? t('drag.cancel') : drag.zone === 'centre' ? t('drag.swap') : t('drag.split')}
            </div>
          );
        })()}
        {divDrag && (
          <div className={s.ratio} style={{ left: divDrag.div.box.left + 8, top: divDrag.div.box.top + 8 }} aria-hidden="true">
            {ratioLabel(divDrag.ratio)}
          </div>
        )}
      </div>
    </div>
  );

  const chips = hasChips ? (
    <Chips
      infos={infos}
      current={board.active}
      canAdd={!full || boardSlots(board).some((x) => !board.tiles[x])}
      addReason={t('board.full')}
      // A chip switches and enters: a live tile's frame takes focus once it shows; a card hands focus to the Board
      // surface (enterSoon's fallback); the Empty chip only shows its slot (its own button opens the picker).
      onSelect={(slot) => { activate(slot); if (infoOf(slot)?.tile) enterSoon(slot, 0, true); }}
      onMenu={(slot) => { activate(slot); setMenuFor(slot); }}
      onAdd={addProgram}
      pager={pager ? { page: pager.index, pages: pager.pages.length, onStep: stepPage } : null}
      dropTarget={drag?.on ? drag.chip : null}
      // The phone row starts with the same Boards menu, its button the open Board's name (a bottom tray).
      start={phone ? <ActionMenu items={boardMenuItems} label={t('boards')} title={t('boards')} trigger={<Button variant="secondary" iconEnd="chevron-down">{labelOf(board)}</Button>} isOpen={boardMenu} onOpenChange={onBoardMenu} /> : undefined}
      end={phone ? <IconButton icon="maximize" label={t('focus.on')} onPress={() => setFocus((f) => !f)} /> : undefined}
    />
  ) : null;

  // Only a tile of the shown Board: a Board or realm switch closes the panel.
  const optionsInfo = optionsFor ? infoOf(optionsFor) : null;
  const changeTile = changeFor ? board.tiles[changeFor.slot] : null;

  return (
    // Another tab's value opening: the Board stays shown with its dialogs, its edit controls busy (data.ts refreshing).
    <div className={cx(s.page, coarse && s.coarse, keyboardOpen && s.keyboardOpen)} aria-busy={api.refreshing || undefined} data-refreshing={api.refreshing || undefined}>
      {noticeText && (
        <Band size="table" tone={api.notice?.kind === 'unsaved' ? 'warn' : 'neutral'} onDismiss={twoTab || api.notice?.kind === 'unsaved' || api.notice?.kind === 'updating' ? undefined : api.dismissNotice} className={s.notice}>
          {noticeText}
        </Band>
      )}
      {/* The strip is a bar only; the tile area stays in one place whether it shows or not (focus mode, phones), so
          toggling focus never remounts a frame. */}
      {!(phone || focus) && <div className={s.stripAir} aria-hidden="true" />}
      {!(phone || focus) && (
        <Strip
          items={tabItems}
          active={board.id}
          onSelect={(id) => switchTo((st) => setActiveBoard(st, id))}
          onRename={(id, name) => change((st) => renameBoard(st, id, name))}
          onMove={(id, to) => change((st) => reorderBoard(st, st.boards.findIndex((b) => b.id === id), to))}
          tabMenu={tabMenu}
          tabsRef={tabsRef}
          onTabEditing={onTabEditing}
          onCloseTab={(id) => { const b = tabBoard(id); if (b && !closeReason(b)) closeBoard(id); }}
          canCreate={!boardsFull}
          createReason={fullRealmText}
          onCreate={createNew}
          onEven={evenFixes ? () => { onBoardOp(equaliseBoard, t('undo.equalise')); } : null}
          note={single ? { full: t('board.oneAtATime'), short: t('board.oneAtATimeShort') } : paging ? (pager ? { full: t('overflow.paged', { shown: paging.slots.length, count: boardSlots(board).length }), short: t('overflow.pagedShort', { shown: paging.slots.length, count: boardSlots(board).length }) } : { full: t('overflow.fitted'), short: t('overflow.fittedShort') }) : null}
          layoutMenu={layoutMenu}
          boardMenu={boardMenuItems}
          boardMenuOpen={boardMenu}
          onBoardMenuOpen={onBoardMenu}
          onFocus={() => setFocus(true)}
          endSlot={castSlot}
          dropTarget={drag?.on ? drag.strip : null}
          add={filled === 0 && boardSlots(board).length === 1 ? null : { onPress: addProgram, reason: full && !boardSlots(board).some((x) => !board.tiles[x]) ? t('board.full') : null }}
        />
      )}
      <span ref={holdCast} hidden />
      {castNode && createPortal(<Broadcast computers={comps.rows} read={comps} area={areaRef} shown={!(phone || focus)} restoreFocus={focusSurface} />, castNode)}
      <div className={cx(s.tabsPanel, !(phone || focus) && s.underStrip)}>{area}</div>
      {chips}
      <span className={s.srOnly} aria-live="polite">
        {said}
      </span>
      <input ref={fileInput} className={s.fileInput} type="file" accept="application/json,.json" tabIndex={-1} aria-hidden="true" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      {optionsInfo?.tile && isProgramTile(optionsInfo.tile) && (
        <OptionsPanel
          isOpen
          onOpenChange={(o) => { if (!o) setOptionsFor(null); }}
          cat={cat}
          program={optionsInfo.tile.program}
          defaults={boardDefaults(optionsInfo.tile.program, scheme)}
          tileName={optionsInfo.name + (optionsInfo.suffix ?? '')}
          computerName={optionsInfo.computerName}
          onOpenComputer={computersLink && optionsInfo.computer && !hiddenSenderHold(power(optionsInfo.computer), computersServed) ? () => followPageLink(computersAt(computersLink, optionsInfo.computer), go) : null}
          view={optionsInfo.tile.view}
          params={optionsInfo.tile.params}
          dropped={optionsInfo.tile.dropped}
          running={optionsInfo.state === 'live' && !!optionsInfo.url}
          onSave={(next) => { saveOptions(optionsInfo.slot, next); setOptionsFor(null); tokenNotice(next.params); }}
          shell={(() => { const shown = shellShown(optionsInfo); const target = shellTarget(optionsInfo); return shown ? { target: shown, onChange: target ? () => setShellFor({ slot: optionsInfo.slot, target }) : null } : null; })()}
        />
      )}
      <ClosedBoardsDialog
        isOpen={closedOpen}
        onClose={() => setClosedOpen(false)}
        closed={closedBoards}
        one={closedOne}
        fullReason={boardsFull ? fullRealmText : null}
        nameOf={(e) => labelOf(e.board)}
        sayRestore={sayRestore}
      />
      <ConfirmDialog
        overlayId="board-download-html"
        isOpen={htmlFor === board.id}
        onOpenChange={(o) => { if (!o) setHtmlFor(null); }}
        title={t('html.title', { name: labelOf(board) })}
        body={t('html.body')}
        confirmLabel={t('html.download')}
        onConfirm={() => { void downloadHtml(); }}
      />
      <Dialog
        isOpen={!!renaming}
        onOpenChange={(o) => { if (!o) { setRenaming(null); onRenaming(false); api.hold(false); } }}
        title={t('board.rename')}
        primaryLabel={t('board.rename')}
        onPrimary={() => { if (renaming) change((st) => renameBoard(st, renaming.id, renaming.draft)); setRenaming(null); onRenaming(false); api.hold(false); }}
      >
        {renaming && <TextField label={t('board.rename')} value={renaming.draft} maxLength={32} onChange={(v: string) => { api.hold(true); setRenaming({ ...renaming, draft: v }); }} />}
      </Dialog>
      <MoveTileDialog capture={moving} boards={state.boards} labelOf={labelOf} t={t} onClose={() => setMoving(null)} onMove={(c, target) => moveTile(c, target)} />
      <ShellDialog target={shellFor?.target ?? null} onClose={() => setShellFor(null)} onChanged={(at) => reloadTerminal(at)} />
      <RestartDialog target={restartFor} onClose={() => setRestartFor(null)} onChanged={(at) => reloadTerminal(at)} />
      <DevToolsDialog target={devtoolsFor} onClose={() => setDevtoolsFor(null)} />
      <Dialog isOpen={!!changeFor} onOpenChange={(o) => { if (!o) setChangeFor(null); }} title={changeFor?.step === 'session' ? t('tile.changeSession') : t('tile.changeProgram')}>
        {changeFor && (
          <Picker
            {...pickerBase}
            start={changeTile ? pickerStart(changeFor.slot, changeFor.step) : { step: 'computer' }}
            onPick={(x) => pick(changeFor.slot, { ...x, ...(isProgramTile(changeTile) && isProgramTile(x) && changeTile.program === x.program && changeTile.view ? { view: changeTile.view } : {}) }, 'change')}
          />
        )}
      </Dialog>
    </div>
  );
}

