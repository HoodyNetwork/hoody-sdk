// kit.ts: what a KIT terminal file (src/kit/**: a `.term` sibling or a terminal-only kit module, termFiles.ts) may
// import beyond `@term/prim`, as `@term/kit`. The kit draws controls, so it needs interaction
// primitives a page never touches: pressing, focus and keys, a focused control's ink, the hover ground of a part that is no Pressable, scrolling, the composer, colour tiers, safe text and
// wrapping, pane sizes, what an agent reads of a node (useSem, mergeRefs), and the engine's renderable TYPES (no engine value). Pages get `@term/prim` only (page.ts:
// layout and text); scripts/lint/term-imports.cjs refuses `@term/kit` outside src/kit. A kit file imports layout and
// text from `@term/prim` and the rest from here (no name is in both).
export { Pressable, type PressableProps } from './Pressable';
export { Scroll, type ScrollProps } from './Scroll';
export { Compose, type ComposeHandle, type ComposeProps } from './Compose';
export { useFocusable, useKeys, isPressKey, useFocusControl, useFocusedNode, type Focusable, type Key, type KeyHandler, type FocusControl, type FocusId } from './focus';
export { focusInk } from './FocusInk';
export { useHoverFill } from './Hover';
export { colourTier, type Colour, type ColourTier, type Tone } from './tokens';
export { usePaneSize, PaneSize, type PaneDims, type PaneSizeProps } from './size';
export { safeText } from './safe';
export { wrapCells } from './TableCells';
export { mergeRefs, useSem } from './semantics';
// The engine's renderables, as types only (a ref's type: a kit file never calls the engine).
export type { BoxRenderable, ScrollBoxRenderable } from './otui';
