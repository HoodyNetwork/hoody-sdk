// The one seam between a web class name and terminal layout. A CSS-module import is, in the terminal, a table of class
// ids ("<path under hub/src>#<class>"), so a className is a list of ids; the resolver installed here (css-table.ts, fed
// by scripts/term/css-translate) turns an element (tag, classes, attributes, place among its siblings) plus its
// ancestors into a style. dom.ts reads only this module.
//
// Width classes: the translator builds one table per width class (narrow / medium / wide). setStyleTables installs a
// chooser; setStyleWidth(cols) (the runners call it at start and on every resize) re-selects, and every compat element
// re-renders through useStyleResolver.
import { useSyncExternalStore } from 'react';
import type { BoxProps } from '../prim/Box';
import type { TextProps } from '../prim/Text';

/** An element as the cascade sees it. Attribute values are strings as the DOM would hold them (true = ''). */
export interface ElementInfo {
  tag: string;
  /** className tokens as written (class ids, or plain names for global classes). */
  classes: readonly string[];
  attrs: Readonly<Record<string, string>>;
  /** Place among the parent's children (structural pseudo-classes); undefined = unknown, such a condition fails. */
  index?: number;
  count?: number;
  empty: boolean;
  /** The previous element sibling (CSS `+`), when the parent knows it: absent for the first child and for one whose
   *  previous sibling is a component (what it renders is not known there), so a `+` condition does not hold. */
  prev?: ElementInfo;
}

/** One ancestor, innermost first in a chain. `childRules` are opaque to everyone but the resolver. */
export interface StyleFrame { info: ElementInfo; childRules: readonly unknown[] }

export type TextTransform = 'uppercase' | 'lowercase' | 'capitalize' | 'none';
export interface TextStyle extends Partial<Pick<TextProps, 'colour' | 'bg' | 'bold' | 'dim' | 'italic' | 'underline' | 'strike' | 'inverse' | 'truncate' | 'align'>> {
  transform?: TextTransform;
  /** list-style on a list with a class: numbers or a bullet. Read on the list's own style, never inherited. */
  listMarker?: 'decimal' | 'bullet';
  /** white-space: 'none' = one line (nowrap), 'pre' = keep spaces and newlines. */
  wrap?: 'wrap' | 'none' | 'pre';
  maxLines?: number;
}

export interface GridLayout {
  tracks: number;
  axis: 'row' | 'column';
  /** Engine layout options per track (index % tracks). */
  childStyles: readonly Readonly<Record<string, unknown>>[];
  fallback: 'chunk' | 'column' | 'wrap';
}

export interface BorderStyle { sides: Array<'top' | 'right' | 'bottom' | 'left'>; divider: boolean; colour?: TextProps['colour'] }

/** What an element's classes contribute in the terminal. */
export interface TermStyle {
  box?: Partial<Pick<BoxProps, 'dir' | 'gap' | 'padX' | 'padY' | 'grow' | 'shrink' | 'width' | 'height' | 'minWidth' | 'maxWidth' | 'align' | 'justify' | 'wrap' | 'hidden' | 'clip' | 'raw'>>;
  text?: TextStyle;
  /** display: contents: the children are drawn in place of the element. */
  contents?: boolean;
  border?: BorderStyle;
  grid?: GridLayout;
  /** As a grid item: takes a whole row of its grid. */
  spanAll?: boolean;
  /** Child rules this element hands to its descendants (opaque, for the resolver). */
  childRules?: readonly unknown[];
  /** Generated boxes (CSS ::before / ::after) to draw as the element's first / last child. */
  pseudo?: { before?: PseudoStyle; after?: PseudoStyle };
}

/** One generated box: its text ('' = an empty box, drawn for its size alone) and its own style. */
export interface PseudoStyle { text: string; style: Pick<TermStyle, 'box' | 'text' | 'border'> }

export type StyleResolver = (el: ElementInfo, ancestors: readonly StyleFrame[]) => TermStyle | undefined;

let chooser: ((widthClass: string) => StyleResolver | null) | null = null;
let classOf: (cols: number, paneCols: number) => string = () => 'one';
let width = 'one';
// The two widths conditions are judged by: the terminal's (@media) and the page pane's (@container; null until the
// shell has measured it, and outside a shell: the terminal's then).
let colsNow = 0;
let paneNow: number | null = null;
const keyNow = (): string => classOf(colsNow, Math.min(paneNow ?? colsNow, colsNow));
let current: StyleResolver | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = (): void => { version++; for (const l of listeners) l(); };

/** Installs one resolver for every width; null removes it. */
export function setStyleTable(r: StyleResolver | null): void {
  chooser = null;
  current = r;
  emit();
}

/** Installs a resolver per width band: `keyFor(cols, paneCols)` names the band of a terminal and its page pane
 *  (scripts/term/css-translate/breakpoints.ts), `forKey(name)` builds or returns its resolver. */
export function setStyleTables(forKey: (key: string) => StyleResolver | null, keyFor: (cols: number, paneCols: number) => string, cols: number): void {
  chooser = forKey;
  classOf = keyFor;
  colsNow = cols;
  paneNow = null;
  width = keyNow();
  current = chooser(width);
  emit();
}

function reselect(): void {
  if (!chooser) return;
  const next = keyNow();
  if (next === width) return;
  width = next;
  current = chooser(width);
  emit();
}

/** The terminal is this wide now; re-selects the table when a band was crossed. */
export function setStyleWidth(cols: number): void {
  colsNow = cols;
  reselect();
}

/** The page pane is this wide now (the shell's pane box: the sidebar, an open dock and a split take columns from it);
 *  null: no pane is measured (the shell is gone). Re-selects the table when a container band was crossed. */
export function setStylePane(paneCols: number | null): void {
  if (paneNow === paneCols) return;
  paneNow = paneCols;
  reselect();
}

export const styleWidthClass = (): string => width;
export const styleResolver = (): StyleResolver | null => current;
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => listeners.delete(l); };
/** The current resolver; the calling component re-renders when the table changes (a width class crossed). */
export function useStyleResolver(): StyleResolver | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  return current;
}

const EMPTY: TermStyle = {};
/** The style of an element with no ancestors to consider (tests, and callers outside the compat tree). */
export function styleOf(className: unknown, tag = 'div'): TermStyle {
  if (!current || typeof className !== 'string' || className === '') return EMPTY;
  return current({ tag, classes: className.split(/\s+/).filter(Boolean), attrs: {}, empty: false }, []) ?? EMPTY;
}
