// Shapes of the CSS-module → terminal style table (css-translate.ts). Runtime-safe: types only.
//
// Style keys are OpenTUI's LayoutOptions / BoxOptions names (packages/core/src/Renderable.ts, renderables/Box.ts), so
// the runtime can spread `style` into a box. Every number is in cells (columns for horizontal keys, rows for vertical).

/** `<n>vh±<rows>`: a height on the mounted region's height, resolved at run time (jsx/dom.ts VH_LENGTH). */
export type Cells = number | 'auto' | `${number}%` | `${number}vh${'+' | '-'}${number}`;

export interface TermStyle {
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flexWrap?: 'no-wrap' | 'wrap' | 'wrap-reverse';
  alignItems?: Align;
  alignSelf?: Align;
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto';
  rowGap?: number | `${number}%`;
  columnGap?: number | `${number}%`;
  paddingTop?: number | `${number}%`;
  paddingRight?: number | `${number}%`;
  paddingBottom?: number | `${number}%`;
  paddingLeft?: number | `${number}%`;
  marginTop?: Cells;
  marginRight?: Cells;
  marginBottom?: Cells;
  marginLeft?: Cells;
  width?: Cells;
  height?: Cells;
  minWidth?: Cells;
  minHeight?: Cells;
  maxWidth?: Cells;
  maxHeight?: Cells;
  position?: 'relative' | 'absolute' | 'static';
  /** `position: sticky`: laid out in flow, then offset at run time from the nearest scroll box so it stays inside its
   *  viewport (top/bottom insets in cells; 0 when the CSS gives none). Read and removed by jsx/dom.ts (jsx/sticky.ts). */
  sticky?: { top?: Cells; bottom?: Cells };
  top?: Cells;
  right?: Cells;
  bottom?: Cells;
  left?: Cells;
  overflow?: 'visible' | 'hidden' | 'scroll';
  zIndex?: number;
}

export type Align = 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';

/** A colour as the CSS names it: `token:--hx-muted` (a tokens.css or module custom property; the runtime maps it to a
 *  terminal role per colour tier), `literal:#fff` (a raw colour, rare), or `none` (explicitly no fill/ink). */
export type Colour = `token:--${string}` | `literal:${string}` | 'none';

export interface TermText {
  fg?: Colour;
  bg?: Colour;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Extras beyond the brief's six: cheap for a renderer and meaningful in a terminal. */
  strikethrough?: boolean;
  transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  /** list-style(-type) on a list's own class: numbers (decimal) or a bullet (disc, circle, square). */
  listMarker?: 'decimal' | 'bullet';
  /** white-space: 'none' = nowrap (one line), 'pre' = keep whitespace and newlines. */
  wrap?: 'wrap' | 'none' | 'pre';
  /** text-overflow: ellipsis (meaningful with wrap 'none' and overflow hidden). */
  truncate?: boolean;
  /** -webkit-line-clamp / line-clamp. */
  maxLines?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TermBorder {
  sides: Array<'top' | 'right' | 'bottom' | 'left'>;
  /** OpenTUI borderStyle. dashed/dotted come out 'single' (noted). */
  style: 'single' | 'double' | 'rounded' | 'heavy';
  color?: Colour;
  /** One side only: a rule between items, not a frame. Each drawn side costs a whole cell row/column. */
  divider?: boolean;
}

/** A grid container laid out as flex (grid.ts). `childStyles[i]` applies to the i-th VISIBLE child (display: contents
 *  children count through: their children are the grid items). When the element has more visible items than `tracks`,
 *  CSS starts a second row; the runtime then uses `fallback`:
 *    'chunk'  — wrap the items into row boxes of `tracks` items each (flexDirection = axis), giving the i-th item of
 *               each row childStyles[i]; an item whose entry has `gridItem.spanAll` closes the current row and takes a
 *               row of its own. `aligned` says whether columns line up across rows (no auto/content-sized track).
 *    'column' — stack the items. */
export interface GridPlan {
  pattern: 'column' | 'equal-n' | 'fill-auto' | 'tracks' | 'auto-flow-column' | 'auto-fit';
  tracks: number;
  axis: 'row' | 'column';
  childStyles: TermStyle[];
  /** 'wrap' (auto-fit): one track style for every item, the container wraps its row (CSS fits as many as the width allows). */
  fallback: 'chunk' | 'column' | 'wrap';
  aligned: boolean;
  source: string;
}

/** Declarations of a rule whose subject has no module class (`.list > li`, `.row > :first-child`, `.prose p`), stored
 *  on the nearest class in the selector (the context). The runtime applies them to the context element's direct
 *  children (`direct`) or descendants that match `match` (tag/attrs/structural pseudo; `{}` = any element), with the
 *  rule's specificity (it usually beats the child's own single class). `when` constrains the CONTEXT element. The
 *  context is the nearest compound with a module class; compounds between it and the subject are `path`. */
export interface ChildRule {
  selector: string;
  direct: boolean;
  match: Conditions;
  when?: When;
  /** The compounds between the context class and the subject, innermost first (`.crumbs li > svg` → `[li, direct]`;
   *  `.t tbody tr` → `[tbody]`); each `direct` = it is the parent of the one inside it. With a path, the rule's own
   *  `direct` says whether the context is the parent of the path's outermost element. */
  path?: Array<Conditions & { direct?: boolean }>;
  specificity: [number, number, number];
  style?: TermStyle;
  text?: TermText;
  border?: TermBorder | null;
  hidden?: boolean;
  contents?: boolean;
  /** `grid-column: 1 / -1` on the children (`.create > *`): each one spans every track of its grid. */
  gridItem?: { spanAll: true };
  /** `.list li::before`: the rule styles the generated box of the children it matches, not the children. */
  pseudo?: PseudoBox;
  outcomes: Outcome[];
}

/** What a `::before` / `::after` rule gives the generated box of its class (or, on a ChildRule, of the children it
 *  matches). `content`: strings to join ([] = `""`, an empty box), or 'none' (`none` / `normal`: no box); absent = the
 *  rule does not set it. The runtime cascades every rule that holds for one side; a box exists only when the merged
 *  result has a content that is not 'none' and is not hidden. */
export interface PseudoBox {
  side: 'before' | 'after';
  content?: string[] | 'none';
}

/** A `::before` / `::after` rule whose subject has a module class (`.a::before`, `.a[data-x]::after`, `.p > .a::before`). */
export interface PseudoRule extends PseudoBox {
  selector: string;
  /** Conditions on the element the box belongs to; absent = always. */
  when?: When;
  specificity: [number, number, number];
  style?: TermStyle;
  text?: TermText;
  border?: TermBorder | null;
  hidden?: boolean;
  outcomes: Outcome[];
}

export interface When {
  /** Conditions on the element itself (its other classes, its props, structural position). */
  self?: Conditions;
  /** Conditions on ancestors, innermost first. `direct` = the `>` combinator (parent only). */
  ancestors?: Array<Conditions & { direct?: boolean }>;
}

export interface Conditions {
  /** Class ids (`path#name`) or `global:<name>` for :global classes. */
  classes?: string[];
  attrs?: AttrCond[];
  tags?: string[];
  /** Structural or state pseudo-classes the runtime may evaluate (first-child, last-child, empty, disabled, ...). An
   *  unknown pseudo means the variant does NOT apply. */
  pseudo?: string[];
  /** :not(...) of simple conditions. */
  not?: Conditions[];
  /** The `+` combinator: the element's previous element sibling matches these (`.a + .b`, `.p > .a + *`). */
  prev?: Conditions;
  /** `:is(a, b)` / `:where(a, b)` lists: of every entry, at least one alternative holds. */
  any?: Conditions[][];
}

export interface AttrCond {
  name: string;
  op?: '=' | '~=' | '|=' | '^=' | '$=' | '*=';
  value?: string;
  insensitive?: boolean;
}

export interface Outcome {
  /** The source declaration as written (prop: value). */
  decl: string;
  kind: OutcomeKind;
  /** What it became (translated/lossy) or why not (other kinds). */
  detail?: string;
  /** Where it came from when not a plain rule: `@container (max-width: 640px)`, a variant selector, ... */
  via?: string;
}

export type OutcomeKind =
  | 'translated' // expressed exactly (within the unit model)
  | 'lossy' // expressed approximately; detail says how
  | 'paint' // no terminal meaning (radius, shadow, motion, font size, cursor, ...), ignored
  | 'unexpressible' // affects layout and has no Yoga/OpenTUI form: ignored, the layout differs
  | 'overridden' // a later declaration for the same property won the cascade
  | 'meta' // custom property (consumed by var() resolution) or container naming
  | 'not-applied' // inside an @media/@container/@supports branch that is false for the chosen width class
  | 'dropped'; // under a selector the policy drops (hover, focus, pseudo-element, :has, sibling, no class subject)

export interface Variant {
  when: When;
  /** The selector as written, for diagnostics. */
  selector: string;
  specificity: [number, number, number];
  /** Delta over the base: keys to set. `unset` lists base keys this variant removes. */
  style?: TermStyle;
  text?: TermText;
  border?: TermBorder | null;
  hidden?: boolean;
  contents?: boolean;
  grid?: GridPlan | null;
  /** The element spans every track under this variant (the base does not). */
  gridItem?: { spanAll: true };
  unset?: string[];
  outcomes: Outcome[];
}

export interface ClassEntry {
  /** `<path relative to hub/src>#<class>`. */
  id: string;
  style: TermStyle;
  text?: TermText;
  border?: TermBorder;
  /** display: none. */
  hidden?: true;
  /** display: contents: render the children in place of the box (a fragment). */
  contents?: true;
  grid?: GridPlan;
  /** On a grid item: `grid-column: 1 / -1` (or `span` of every track): the item takes a whole grid row. */
  gridItem?: { spanAll: true };
  /** Rules for children/descendants without a module class (see ChildRule). */
  childRules?: ChildRule[];
  /** `::before` / `::after` rules of this class, in cascade order (see PseudoRule). */
  pseudo?: PseudoRule[];
  /** container-type / container-name on this class (the runtime may evaluate container queries later). */
  container?: { name?: string; type?: string };
  variants?: Variant[];
  notes?: string[];
  status: ClassStatus;
  outcomes: Outcome[];
}

/** full: every applied declaration translated or paint-only. partial: something lossy or unexpressible (base, a
 *  variant, or a dropped rule that changed layout). untranslatable: layout declarations exist and none translated.
 *  empty: no declaration of its own (a hook class, or only paint dropped by policy). */
export type ClassStatus = 'full' | 'partial' | 'untranslatable' | 'empty';

export interface WidthClass {
  name: string;
  /** Width of the viewport (@media), in cells (px = cells x CELL_W_PX); of every query container too when
   *  `containerCols` is absent. */
  cols: number;
  rows: number;
  /** Width @container conditions are judged by: the page pane's, in cells (breakpoints.ts). */
  containerCols?: number;
}

export interface Table {
  version: 1;
  generated: string;
  widthClass: WidthClass;
  unitModel: Record<string, unknown>;
  /** Module path relative to hub/src → local class name → class id. What a CSS-module import evaluates to. */
  modules: Record<string, Record<string, string>>;
  classes: Record<string, ClassEntry>;
}
