// page.ts: what a page's terminal sibling (src/pages/**/*.term.*) may import, as `@term/prim`.
// Layout and text primitives only. Never the engine (otui), focus internals, semantics plumbing, overlays or tables:
// a page that needs those composes @kit (which has terminal siblings) or asks for a kit component. ESLint
// (hub/page-boundaries, eslint.config.js) allows `@term/prim` only in .term files of pages and refuses every deeper
// path; `@term/prim` is an exact alias (tsconfig.json paths), so `@term/prim/<x>` does not resolve either.
export { Box, Spacer, type BoxProps } from './Box';
export { Text, Br, OneLine, useInText, type TextProps } from './Text';
export { useBoxSize, type TermSize } from './size';
// Cell math (wide CJK and emoji are 2 cells): the only correct way to measure or cut text for a terminal.
export { cellWidth, clipCells, padCells, widestCells } from './TableCells';
// A data colour a person picked (a realm's or computer's colour), always drawn beside its name.
export { FieldSwatch, dataColourAtTier, type FieldSwatchProps } from './FieldSwatch';
// A realm's colour as the terminal draws it (the dark tokens), for that swatch.
export { REALM_HEX, realmHex, type RealmColourName } from './realmColour';
