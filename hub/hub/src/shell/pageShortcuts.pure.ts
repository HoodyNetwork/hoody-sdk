// Page keys, the part both platforms share (split out of pageShortcuts.ts): the declaration types, the one store of
// declared lists, the ids, the shell's reserved keys and the one matching rule. pageShortcuts.ts (web: KeyboardEvent,
// DOM focus) and pageShortcuts.term.ts (terminal: the shell keymap) feed it a key and what owns the keyboard; neither
// has rules of its own. This module touches no DOM and no platform global: the platform (⌘ or Ctrl for `mod`) is
// installed by the caller (setShortcutPlatform), never read here.
import { shortcutKeys } from '@kit/controls/Kbd';
import { makeT } from '@kit/strings';
import strings from './strings.en.json';

export type PageShortcutMod = 'ctrl' | 'alt' | 'shift' | 'mod';

export interface PageShortcut {
  /** A single key: KeyboardEvent.key ('n', 'H', 'Escape', '1'). A chord: KeyboardEvent.code ('KeyB',
   *  'ArrowLeft', 'BracketLeft'). The shell's own keys are refused. */
  key: string;
  /** A chord's modifiers, matched exactly; `mod` is ⌘ on Apple, Ctrl elsewhere. */
  mods?: readonly PageShortcutMod[];
  /** Ctrl+Alt+B only: it also works while a field has the keyboard. Ignored on any other key. */
  whileTyping?: boolean;
  /** What it does, already translated ("New Bot"). */
  label: string;
  run: () => void;
  /** false: not available right now (not run, not listed). Default true. */
  enabled?: boolean;
  /** A group title, already translated ("Tiles"): the `?` sheet lists it as "This page · Tiles". */
  group?: string;
  /** false: keep it out of the palette (moving around, swapping: keys, not commands). Default true. */
  palette?: boolean;
  /** The element the key belongs to (a ref on a raw tag: a Files pane's box). When two parts declare the same key, the
   *  one whose element holds the focus has it; with none holding it, the first-mounted one, as without `within`. The
   *  terminal judges it (pageShortcuts.term.ts: two Files panes, each with its own Backspace). The web ignores it: a
   *  part whose keys belong to an element listens on that element there (pages/files/folderKeys.ts). */
  within?: { readonly current: unknown };
}

/** Keys that do the same thing share a row (same group and label): ← and h for "Move left". */
export interface PageShortcutRow {
  label: string;
  /** Each way to press it, as its keys: [['←'], ['h']]. */
  alts: string[][];
  /** The first way's id, for runPageShortcut. */
  id: string;
  palette: boolean;
}

export interface PageShortcutGroup {
  /** The group title; undefined for the page's ungrouped keys. */
  title: string | undefined;
  rows: PageShortcutRow[];
}

/** A key as both platforms report it: KeyboardEvent's key, code and modifier flags (the terminal keymap builds one
 *  from the engine's key event). */
export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Who owns the keyboard for this key, as the platform sees it. */
export interface KeyOwners {
  /** A text field has the keyboard (the key is typed). */
  typing: boolean;
  /** A program frame owns the keys (web only; the terminal has none). */
  frame: boolean;
  /** A focused control has its own meaning for this Enter, Space or arrow. */
  controlKeeps: boolean;
}

// ---- platform ----

let platform: () => boolean = () => false;
/** Whether `mod` is ⌘ (true) or Ctrl (false), asked at each use. The web installs isApplePlatform; the terminal
 *  leaves the default, Ctrl. */
export function setShortcutPlatform(isApple: () => boolean): void {
  platform = isApple;
}
export const shortcutPlatformApple = (): boolean => platform();

// ---- ids and the shell's own keys ----

interface Mods {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export function modsOf(s: PageShortcut, isApple = platform()): Mods {
  const m = new Set(s.mods ?? []);
  return { ctrl: m.has('ctrl') || (m.has('mod') && !isApple), alt: m.has('alt'), shift: m.has('shift'), meta: m.has('mod') && isApple };
}

export const isChord = (s: PageShortcut): boolean => (s.mods?.length ?? 0) > 0;

/** One id per shortcut (the palette's item id, the dedupe key): 'n', 'ctrl+alt+KeyB'. */
export function pageShortcutId(s: PageShortcut): string {
  if (!isChord(s)) return s.key;
  const m = modsOf(s);
  return [m.ctrl && 'ctrl', m.meta && 'meta', m.alt && 'alt', m.shift && 'shift', s.key].filter(Boolean).join('+');
}

// The shell's own keys (keys.ts) and the browser's F6, plain or with any modifier: never a page's.
const SHELL_SINGLE = new Set(['g', '?', '/', '[']);
export function shellOwns(s: PageShortcut): boolean {
  if (s.key === 'F6') return true;
  if (!isChord(s)) return SHELL_SINGLE.has(s.key);
  const m = modsOf(s);
  const mod = (m.ctrl || m.meta) && !m.alt && !m.shift;
  const altOnly = m.alt && !m.ctrl && !m.meta && !m.shift;
  return (mod && (s.key === 'KeyK' || s.key === 'KeyJ')) || (altOnly && (s.key === 'KeyR' || s.key === 'KeyC'));
}

const leaveChord = (s: PageShortcut): boolean => {
  const m = modsOf(s);
  return s.key === 'KeyB' && m.ctrl && m.alt && !m.shift && !m.meta;
};

// ---- the store: every mounted page part's declared list (its latest render), in first-mount order ----

const lists = new Map<symbol, { current: readonly PageShortcut[] }>();
let snapshot: readonly PageShortcut[] = [];
const listeners = new Set<() => void>();

/** The enabled keys a page may have; when two parts declare the same key, the first-mounted one has it (listed once). */
export function livePageShortcuts(): PageShortcut[] {
  const seen = new Set<string>();
  return [...lists.values()]
    .flatMap((l) => l.current)
    .filter((s) => {
      if (s.enabled === false || shellOwns(s)) return false;
      const id = pageShortcutId(s);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function publishPageShortcuts(): void {
  snapshot = livePageShortcuts();
  for (const l of listeners) l();
}

/** Adds a part's list (kept by reference: the latest render's list is read). Returns the removal. */
export function addPageShortcutList(list: { current: readonly PageShortcut[] }): () => void {
  const me = Symbol('page-shortcuts');
  lists.set(me, list);
  publishPageShortcuts();
  return () => {
    lists.delete(me);
    publishPageShortcuts();
  };
}

export const pageShortcutListCount = (): number => lists.size;

export function subscribePageShortcuts(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const pageShortcutSnapshot = (): readonly PageShortcut[] => snapshot;

/** What makes a list a new one for the sheet and the palette. */
export const pageShortcutSignature = (list: readonly PageShortcut[]): string =>
  list
    .map((s) => [pageShortcutId(s), s.label, s.enabled !== false, s.whileTyping === true, s.group ?? '', s.palette !== false].join('\u0000'))
    .join('\u0001');

// ---- the one matching rule ----

/**
 * Whether `s` applies to key `k`. A single key matches `key` with no ⌘/Ctrl/Alt held (Shift only for a printed key:
 * `H`), never while typing, in a frame, or on a control that keeps it. A chord matches `code` and the exact modifiers;
 * a chord without Ctrl/Alt/⌘ stands aside for a control that keeps the key; while typing or in a frame only the leave
 * chord marked whileTyping applies, and on an AltGr layout a printed character in a field is not that chord.
 */
export function matchShortcut(s: PageShortcut, k: KeyLike, o: KeyOwners): boolean {
  if (!isChord(s)) {
    if (k.metaKey || k.ctrlKey || k.altKey || (k.shiftKey && k.key.length > 1)) return false;
    return s.key === k.key && !o.typing && !o.frame && !o.controlKeeps;
  }
  const m = modsOf(s);
  if (k.code !== s.key || k.ctrlKey !== m.ctrl || k.altKey !== m.alt || k.shiftKey !== m.shift || k.metaKey !== m.meta) return false;
  if (!m.ctrl && !m.alt && !m.meta && o.controlKeeps) return false;
  if (!o.typing && !o.frame) return true;
  if (!(s.whileTyping === true && leaveChord(s))) return false;
  return !(k.key.length === 1 && k.key.toUpperCase() !== s.key.slice(3));
}

/** The live page key for this key, if one applies (the caller runs it and claims the key). */
export function findPageShortcut(k: KeyLike, o: KeyOwners): PageShortcut | undefined {
  return livePageShortcuts().find((s) => matchShortcut(s, k, o));
}

/** Run a listed page key by its id (pageShortcutId), with the page's latest handler. */
export function runPageShortcut(id: string): void {
  livePageShortcuts().find((s) => pageShortcutId(s) === id)?.run();
}

// ---- how keys are shown ----

const t = makeT(strings);

// Named keys and codes as people read them (strings: ←, Esc, Page Up); printed keys as they are.
const KEY_NAME = {
  ArrowLeft: 'keyname.ArrowLeft',
  ArrowRight: 'keyname.ArrowRight',
  ArrowUp: 'keyname.ArrowUp',
  ArrowDown: 'keyname.ArrowDown',
  Escape: 'keyname.Escape',
  Enter: 'keyname.Enter',
  ' ': 'keyname.Space',
  Space: 'keyname.Space',
  Tab: 'keyname.Tab',
  Backspace: 'keyname.Backspace',
  Delete: 'keyname.Delete',
  Home: 'keyname.Home',
  End: 'keyname.End',
  PageUp: 'keyname.PageUp',
  PageDown: 'keyname.PageDown',
} as const;
const CODE_PRINTED: Readonly<Record<string, string>> = { BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`' };

export function keyName(k: string): string {
  if (Object.hasOwn(KEY_NAME, k)) return t(KEY_NAME[k as keyof typeof KEY_NAME]);
  if (/^Key[A-Z]$/.test(k) || /^Digit\d$/.test(k)) return k.slice(-1);
  return Object.hasOwn(CODE_PRINTED, k) ? (CODE_PRINTED[k] ?? k) : k;
}

/** A shortcut's keys as the `?` sheet and the palette show them: ['Ctrl', 'Alt', 'B'], ['←']. */
export function pageShortcutKeys(s: PageShortcut, isApple = platform()): string[] {
  if (!isChord(s)) return [keyName(s.key)];
  const m = new Set(s.mods);
  const parts = [m.has('mod') && 'Mod', m.has('ctrl') && 'Ctrl', m.has('alt') && 'Alt', m.has('shift') && 'Shift'].filter((x): x is string => typeof x === 'string');
  return [...shortcutKeys(parts.join('+'), isApple), keyName(s.key)];
}

/** Group the listed keys (first-seen group order, ungrouped first) and merge same-label keys. */
export function pageShortcutGroups(list: readonly PageShortcut[]): PageShortcutGroup[] {
  const groups = new Map<string, PageShortcutGroup>();
  groups.set('', { title: undefined, rows: [] });
  for (const s of list) {
    const gid = s.group ?? '';
    let g = groups.get(gid);
    if (!g) {
      g = { title: s.group, rows: [] };
      groups.set(gid, g);
    }
    const row = g.rows.find((r) => r.label === s.label);
    if (row) {
      row.alts.push(pageShortcutKeys(s));
      row.palette = row.palette && s.palette !== false;
    } else g.rows.push({ label: s.label, alts: [pageShortcutKeys(s)], id: pageShortcutId(s), palette: s.palette !== false });
  }
  return [...groups.values()].filter((g) => g.rows.length > 0);
}
