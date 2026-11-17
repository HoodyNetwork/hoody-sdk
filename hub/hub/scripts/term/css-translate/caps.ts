// The style capability list shared by the translator and the runtime: a TermStyle key the translator may
// emit counts as "translated" only if the compat runtime (src/term/jsx/dom.ts boxOf -> prim Box raw) consumes it.
// The translator marks a class using any other key `partial`; the runtime counts such a class in styleLedger().unconsumed.
// Bump CAPS_VERSION whenever the set changes (the table records the version it was built against).
export const CAPS_VERSION = 2;
export const RUNTIME_STYLE_CAPS: ReadonlySet<string> = new Set([
  'flexDirection', 'flexWrap', 'alignItems', 'alignSelf', 'justifyContent', 'flexGrow', 'flexShrink', 'flexBasis',
  'rowGap', 'columnGap', 'gap',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'position', 'top', 'right', 'bottom', 'left', 'overflow', 'zIndex',
  // v2: position: sticky insets, consumed by DomBox (src/term/jsx/sticky.ts), never handed to the engine.
  'sticky',
]);
