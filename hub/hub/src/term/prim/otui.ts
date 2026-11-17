// The only file that names OpenTUI's intrinsic elements. Everything else in the Hub builds on the typed components of
// this directory (prim.lint.term.test.ts enforces it), so the engine can change under them.
import { createElement, type ReactElement, type ReactNode } from 'react';
export { createCliRenderer, type CliRenderer, type KeyEvent, type MouseEvent, type BoxRenderable, type ScrollBoxRenderable, TextAttributes } from '@opentui/core';
/** The engine's scroll box class, for `instanceof` (never its name: the shipped bundle is minified and renames classes). */
export { ScrollBoxRenderable as ScrollBoxClass } from '@opentui/core';
export { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react';
import * as OTReact from '@opentui/react';
import { HOST_TEXT_FILTER } from './safe';

// Output safety (prim/safe.ts): every string the React host hands the engine goes through HOST_TEXT_FILTER. The patched
// OpenTUI build exports setHostTextFilter; until it is installed the loader's fork delta publishes the same setter on a
// global (scripts/term/fork-deltas.ts). Neither = refuse to load: nothing may draw unfiltered.
type SetFilter = (f: typeof HOST_TEXT_FILTER | null) => void;
const setHostTextFilter = ((OTReact as Record<string, unknown>).setHostTextFilter
  ?? (globalThis as Record<symbol, unknown>)[Symbol.for('opentui.react.setHostTextFilter')]) as SetFilter | undefined;
if (typeof setHostTextFilter !== 'function') {
  throw new Error('TERM_UNSAFE_OUTPUT: @opentui/react has no host text filter (load through scripts/term/loader.ts, or install the patched build)');
}
setHostTextFilter(HOST_TEXT_FILTER);

type Tag = 'box' | 'text' | 'span' | 'scrollbox' | 'input' | 'br';
export function el(tag: Tag, props: Record<string, unknown> | null, ...children: ReactNode[]): ReactElement {
  return createElement(tag as string, props, ...children);
}
