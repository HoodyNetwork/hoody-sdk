// The sizes of a table row's own controls, as numbers for DataTable's column plan, which reserves the actions column
// before anything is drawn. The kit Button draws them from tokens; rowControlMetrics.test.ts reads those tokens and
// Button.module.css and fails when the two differ, so change them together. Measuring a drawn button instead would
// make the plan wait for a first paint.

/** The inline word button of a row: the kit Button `sm` with no end glyph, in Geist Mono (advance 0.6 em). */
export const ROW_BUTTON = {
  /** `--fs-md`, a button label's size. */
  size: 13,
  /** Geist Mono's advance per character, in em. */
  glyphEm: 0.6,
  /** `--btn-tracking`. */
  tracking: 0.3,
  /** `--btn-pad`: from the plate's edge to the label, each side. */
  pad: 14,
  /** `--btn-pad-icon`: the end padding of a button with a start icon. */
  padIcon: 16,
  /** `--btn-gap`: start icon to label. */
  gap: 8,
  /** `--icon-md`: the start icon's box. */
  icon: 16,
  /** `--bw`: the plate's frame, each side. */
  frame: 1,
} as const;

/** `--sp-2`: what the plan leaves between the inline button and the control beside it. */
export const ROW_CONTROL_GAP = 8;

/** The three-dot's cell: its box on a coarse pointer (`--icon-hit` there), which also covers its fine-pointer plate
 *  (`--btn-h-sm`) with the actions cell's end padding (`--sp-2`). */
export const MENU_W = 44;
/** One hover icon with its gap: the icon button's plate (`--btn-h-sm`) and the wrap's gap (`--sp-half`), rounded up to
 *  the grid. */
export const HOVER_W = 32;
/** What `MENU_W` holds beyond a control: the room a cell with only words or hover icons still needs at its end. */
export const CELL_PAD = 12;

/** The width the plan reserves for a row's inline word button: its label, the plate's padding (with a start icon: the
 *  icon, its gap and the wider end padding), the frame, and the gap to its neighbour. */
export function inlineWidth(label: string, hasIcon: boolean): number {
  const b = ROW_BUTTON;
  const words = label.length * (b.glyphEm * b.size + b.tracking);
  const plate = hasIcon ? b.pad + b.icon + b.gap + b.padIcon : 2 * b.pad;
  return Math.ceil(words + plate + 2 * b.frame) + ROW_CONTROL_GAP;
}
