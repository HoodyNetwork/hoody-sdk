// The kit's control spec as data: what every control measures in each context (CONTROL_SPEC), and where the kit misses
// it (CONTROL_DEBT). Plain data, no imports, no side effects. Read by the gallery's "controls" tab (gallery/controls.tsx:
// one specimen per cell, tagged data-cell=<cellKey>), by controls.matrix.spec.ts (measures every cell in the browser
// against its target) and by controlSpec.test.ts (checks the table against a hand-written inventory of the controls).

export type Theme = 'light' | 'dark';
export type Pointer = 'fine' | 'coarse';
export type Density = 'default' | 'compact';
/** One of the eight contexts the matrix measures. */
export type Ctx = `${Theme}.${Pointer}.${Density}`;
export const THEMES: readonly Theme[] = ['light', 'dark'];
export const POINTERS: readonly Pointer[] = ['fine', 'coarse'];
export const DENSITIES: readonly Density[] = ['default', 'compact'];
// Written out, not computed: kit modules do nothing at load (kitpure.conformance.test.ts); controlSpec.test.ts checks it
// is every theme x pointer x density once.
export const CONTEXTS: readonly Ctx[] = [
  'light.fine.default', 'light.fine.compact', 'light.coarse.default', 'light.coarse.compact',
  'dark.fine.default', 'dark.fine.compact', 'dark.coarse.default', 'dark.coarse.compact',
];

/** What a specimen shows: its rest look, or one state. Toggles are drawn unselected (their rest line is the box's). */
export type State = 'rest' | 'hover' | 'focus' | 'disabled' | 'invalid';
/**
 * What is measured, on the specimen's measured element:
 * - height: the visual border-box height in px (getBoundingClientRect);
 * - hit: the area that takes a touch, `<w>x<h>` px: from the element's centre, how far each way a point still lands on
 *   the element or inside it (document.elementFromPoint), so a pseudo-element's hit extension counts and a covered or
 *   clipped edge does not; the target's `min` holds for both;
 * - borderColor: the computed top border colour (a missing or zero-width border reads `no border`);
 * - background, color: the computed background colour, text colour;
 * - focusShadow: the computed box-shadow once the element (or its FOCUS element) has keyboard focus, which must take:
 *   the focused element is checked; the ring is the focus shape (--focus-ring) and an outline beside it is a miss (it
 *   reads `<shadow> + outline <style> <width>`, and a debt row's `now` may say so);
 * - opacity: the computed opacity.
 */
export type Prop = 'height' | 'hit' | 'borderColor' | 'background' | 'color' | 'focusShadow' | 'opacity';

/**
 * A target. A number is exact px (height) or an exact opacity; `{ min }` is a floor in px; a string is a CSS colour or
 * shadow value, or a var() of a kit token, resolved in the page under the specimen's own context.
 */
export type Target = number | { readonly min: number } | string;

export type ControlId =
  | 'button'
  | 'fileButton'
  | 'buttonGhost'
  | 'buttonPrimary'
  | 'buttonDanger'
  | 'buttonDangerSolid'
  | 'buttonRow'
  | 'buttonBubble'
  | 'linkButton'
  | 'iconButton'
  | 'textField'
  | 'searchField'
  | 'select'
  | 'numberField'
  | 'checkbox'
  | 'switch'
  | 'radio'
  | 'segmented'
  | 'segmentedOption'
  | 'segmentedFolder'
  | 'segmentedIcon'
  | 'tabs';

/**
 * The element a cell is measured on, inside its specimen (`[data-cell]`): the box that draws the control. Checkbox,
 * Switch and Radio are measured on their whole row (the label, which is what takes a press); their drawn box is
 * MEASURE_AT's.
 */
export const MEASURE: Readonly<Record<ControlId, string>> = {
  button: 'button',
  fileButton: 'button',
  buttonGhost: 'button',
  buttonPrimary: 'button',
  buttonDanger: 'button',
  buttonDangerSolid: 'button',
  buttonRow: 'button',
  buttonBubble: 'button',
  linkButton: 'a',
  iconButton: 'button',
  textField: 'input',
  searchField: 'input',
  select: 'button',
  numberField: '[role="group"]',
  checkbox: 'label',
  switch: 'label',
  radio: 'label',
  segmented: '[role="radiogroup"]',
  segmentedOption: '[role="radio"]',
  segmentedFolder: '[role="radiogroup"]',
  segmentedIcon: '[role="radio"]',
  tabs: '[role="tab"]',
};
/**
 * Where a cell's measure moves, by `<control>.<prop>` or `<control>.<state>` (the first that matches): a toggle's line,
 * height and ring are its drawn box; a segmented strip's focus and disabled look are its first option's; a NumberField's
 * disabled ink is its input's.
 */
export const MEASURE_AT: Readonly<Partial<Record<string, string>>> = {
  // A disabled link has no href, so React Aria draws it as a span.
  'linkButton.disabled': '[data-disabled]',
  'checkbox.height': 'label > span[aria-hidden="true"]',
  'checkbox.borderColor': 'label > span[aria-hidden="true"]',
  'checkbox.focusShadow': 'label > span[aria-hidden="true"]',
  'switch.height': 'label > span[aria-hidden="true"]',
  'switch.borderColor': 'label > span[aria-hidden="true"]',
  'switch.focusShadow': 'label > span[aria-hidden="true"]',
  'radio.height': 'label > span[aria-hidden="true"]',
  'radio.borderColor': 'label > span[aria-hidden="true"]',
  'radio.focusShadow': 'label > span[aria-hidden="true"]',
  'numberField.color': 'input',
  'segmented.focus': '[role="radio"]',
  'segmented.disabled': '[role="radio"]',
};
/** The element keyboard focus goes to, when it is not the measured one (a field's input inside its box, a toggle's input). */
export const FOCUS_AT: Readonly<Partial<Record<ControlId, string>>> = {
  numberField: 'input',
  checkbox: 'input',
  switch: 'input',
  radio: 'input',
};

/** The measured element of a cell. */
export function measureOf(c: Pick<SpecCell, 'control' | 'state' | 'prop'>): string {
  return MEASURE_AT[`${c.control}.${c.prop}`] ?? MEASURE_AT[`${c.control}.${c.state}`] ?? MEASURE[c.control];
}

export interface SpecCell {
  readonly control: ControlId;
  /** The size prop the specimen passes ('md' when the control has no size). */
  readonly size: 'xs' | 'sm' | 'md' | 'toolbar';
  readonly state: State;
  readonly prop: Prop;
  /** The target in every context, and per-context overrides (theme, pointer or density keys, most specific last).
   *  Density never changes a control's height, so a compact target equals the default one. */
  readonly target: Target;
  readonly by?: Readonly<Partial<Record<Theme | Pointer | Density | `${Pointer}.${Density}`, Target>>>;
  /** Measured with this pointer only: hover needs a mouse, a hit area is a touch matter. */
  readonly only?: Pointer;
  /** Where the target comes from: the standard's section (5.1 sizes and hit areas, 5.3 lines and focus, 5.4 states)
   *  and the token. */
  readonly source: string;
}

/** A cell's key: what the gallery puts in data-cell and the debt rows name. */
export const cellKey = (c: Pick<SpecCell, 'control' | 'size' | 'state' | 'prop'>): string => `${c.control}.${c.size}.${c.state}.${c.prop}`;

/** True when the matrix measures a cell in a context. */
export const measuredIn = (c: Pick<SpecCell, 'only'>, ctx: Ctx): boolean => !c.only || ctx.split('.')[1] === c.only;

/** The target of a cell in one context: the base, then theme, pointer, density and pointer.density overrides. */
export function targetIn(c: Pick<SpecCell, 'target' | 'by'>, ctx: Ctx): Target {
  const [theme, pointer, density] = ctx.split('.') as [Theme, Pointer, Density];
  const by = c.by ?? {};
  return by[`${pointer}.${density}`] ?? by[density] ?? by[pointer] ?? by[theme] ?? c.target;
}

// Cells write their targets out (kit modules do nothing at load, kitpure.conformance.test.ts: no spreads or reads of a
// shared const). The recurring ones:
//   button md    target: 32, by: { coarse: 44 }           --btn-h; on a coarse pointer a button with words is its own
//                box of at least --touch-min (44) both ways
//   button sm    target: 28, by: { coarse: { min: 44 } }  --btn-h-sm; coarse as md
//   button xs    target: 24                               --ctl-h-xs, drawn 24 on every pointer; on a coarse one its
//                press reaches 44 through the button's own ::after (its hit cell)
//   icon md      target: 32, by: { coarse: 44 }           an icon-only button is a square of its size's height, never
//   icon sm      target: 28, by: { coarse: 44 }           under --icon-hit: drawn 44 on a coarse pointer, its press the
//                box it draws
//   toolbar      target: 40, by: { coarse: 44 }           --tb-ctl-h: a toolbar's buttons and its search field
//   field md     target: 40, by: { coarse: 44 }           --ctl-h-md: every field box
//   hit          target: { min: 44 }, only: 'coarse'      every pressable >= 44 x 44 on a touch screen (5.1)
//   field line   target: 'var(--ctl-line-field)'          = --hx-field-line: at least 3:1 beside every surface a field
//                sits on, both themes
//   toggle line  'var(--hx-switch-line)'                  --ctl-line-toggle (5.3): Switch, Checkbox and Radio
//   field hover  'var(--hx-ink)', only: 'fine'            --field-line-hover, SearchField included (5.4)
//   field off    background 'var(--hx-fill)', color 'var(--hx-muted)', opacity 1 (5.4: --field-off-bg, --field-off-ink)
//   focus        'var(--focus-ring)'; disabled pressables, toggles and strips 0.5 (--ctl-off-opacity, 5.4)
// A button's plate is a painted background image under a transparent border, so its computed background colour and
// border colour say nothing about its look: button cells measure size, hit, focus ring and opacity only.

export const CONTROL_SPEC: readonly SpecCell[] = [
  // Buttons, every variant (5.1 heights and coarse hit; 5.3 focus; 5.4 disabled). Secondary and primary carry the end
  // glyph at md and sm; a danger button is the grey plate in the danger ink, whichever variant asked for it. The bubble
  // is sized by its padding: no height cell; its hit, focus and disabled are measured.
  { control: 'button', size: 'xs', state: 'rest', prop: 'height', target: 24, source: '5.1 --ctl-h-xs, drawn 24 whatever the pointer' },
  { control: 'button', size: 'xs', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 xs hit >= 44 coarse, built in (--xs-press-out)' },
  { control: 'iconButton', size: 'xs', state: 'rest', prop: 'height', target: 24, source: '5.1 --ctl-h-xs, drawn 24 whatever the pointer' },
  { control: 'iconButton', size: 'xs', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 xs hit >= 44 coarse, built in (--xs-press-out)' },
  { control: 'fileButton', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (FileButton takes the Button sizes)' },
  { control: 'fileButton', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: { min: 44 } }, source: '5.1 --btn-h-sm (FileButton takes the Button sizes)' },
  { control: 'fileButton', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--touch-min)' },
  { control: 'fileButton', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'fileButton', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'linkButton', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'button', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (secondary, end glyph)' },
  { control: 'button', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: { min: 44 } }, source: '5.1 --btn-h-sm (secondary, end glyph)' },
  { control: 'button', size: 'toolbar', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --tb-ctl-h (secondary, no glyph at this size)' },
  { control: 'button', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--touch-min)' },
  { control: 'button', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'button', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'buttonGhost', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (ghost, no glyph)' },
  { control: 'buttonGhost', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: { min: 44 } }, source: '5.1 --btn-h-sm (ghost, no glyph)' },
  { control: 'buttonGhost', size: 'toolbar', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --tb-ctl-h (ghost, no glyph)' },
  { control: 'buttonGhost', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--touch-min)' },
  { control: 'buttonGhost', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'buttonGhost', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'buttonPrimary', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (primary, end glyph)' },
  { control: 'buttonPrimary', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: { min: 44 } }, source: '5.1 --btn-h-sm (primary, end glyph)' },
  { control: 'buttonPrimary', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--touch-min)' },
  { control: 'buttonPrimary', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'buttonPrimary', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'buttonDanger', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (danger tone, no glyph)' },
  { control: 'buttonDanger', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: { min: 44 } }, source: '5.1 --btn-h-sm (danger tone, no glyph)' },
  { control: 'buttonDanger', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--touch-min)' },
  { control: 'buttonDanger', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'buttonDanger', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'buttonDangerSolid', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (primary in the danger tone, no glyph)' },
  { control: 'buttonDangerSolid', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: { min: 44 } }, source: '5.1 --btn-h-sm (primary in the danger tone, no glyph)' },
  { control: 'buttonDangerSolid', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--touch-min)' },
  { control: 'buttonDangerSolid', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'buttonDangerSolid', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'buttonRow', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (row)' },
  { control: 'buttonRow', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: { min: 44 } }, source: '5.1 --btn-h-sm (row)' },
  { control: 'buttonRow', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--touch-min)' },
  { control: 'buttonRow', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'buttonRow', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'buttonBubble', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 hit >= 44 coarse (--touch-min)' },
  { control: 'buttonBubble', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'buttonBubble', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  { control: 'linkButton', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h (LinkButton takes the Button looks)' },
  { control: 'linkButton', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'iconButton', size: 'md', state: 'rest', prop: 'height', target: 32, by: { coarse: 44 }, source: '5.1 --btn-h, a square; --icon-hit 44 on a coarse pointer' },
  { control: 'iconButton', size: 'sm', state: 'rest', prop: 'height', target: 28, by: { coarse: 44 }, source: '5.1 --btn-h-sm, a square; drawn at --icon-hit 44 on a coarse pointer, its press the box it draws' },
  { control: 'iconButton', size: 'toolbar', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --tb-ctl-h' },
  { control: 'iconButton', size: 'md', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 hit >= 44 coarse (--icon-hit)' },
  { control: 'iconButton', size: 'sm', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 sm hit >= 44 coarse (--icon-hit)' },
  { control: 'iconButton', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'iconButton', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled pressables (--ctl-off-opacity)' },
  // Fields (5.1 heights, 5.3 line and focus, 5.4 hover, invalid, disabled)
  { control: 'textField', size: 'md', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --ctl-h-md' },
  { control: 'textField', size: 'md', state: 'rest', prop: 'borderColor', target: 'var(--ctl-line-field)', source: '5.3 --ctl-line-field' },
  { control: 'textField', size: 'md', state: 'hover', prop: 'borderColor', target: 'var(--hx-ink)', only: 'fine', source: '5.4 --field-line-hover' },
  { control: 'textField', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'textField', size: 'md', state: 'invalid', prop: 'borderColor', target: 'var(--hx-danger-fill)', source: '5.4 field invalid' },
  { control: 'textField', size: 'md', state: 'disabled', prop: 'background', target: 'var(--hx-fill)', source: '5.4 --field-off-bg' },
  { control: 'textField', size: 'md', state: 'disabled', prop: 'color', target: 'var(--hx-muted)', source: '5.4 --field-off-ink' },
  { control: 'searchField', size: 'md', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --ctl-h-md' },
  { control: 'searchField', size: 'md', state: 'rest', prop: 'borderColor', target: 'var(--ctl-line-field)', source: '5.3 one field line, SearchField too' },
  { control: 'searchField', size: 'md', state: 'hover', prop: 'borderColor', target: 'var(--hx-ink)', only: 'fine', source: '5.4 --field-line-hover, SearchField included' },
  { control: 'searchField', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'searchField', size: 'md', state: 'invalid', prop: 'borderColor', target: 'var(--hx-danger-fill)', source: '5.4 field invalid, every box' },
  { control: 'searchField', size: 'toolbar', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --tb-ctl-h' },
  { control: 'searchField', size: 'md', state: 'disabled', prop: 'background', target: 'var(--hx-fill)', source: '5.4 --field-off-bg, every box' },
  { control: 'searchField', size: 'md', state: 'disabled', prop: 'color', target: 'var(--hx-muted)', source: '5.4 --field-off-ink, every box' },
  { control: 'select', size: 'md', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --ctl-h-md' },
  { control: 'select', size: 'md', state: 'rest', prop: 'borderColor', target: 'var(--ctl-line-field)', source: '5.3 --ctl-line-field' },
  { control: 'select', size: 'md', state: 'hover', prop: 'borderColor', target: 'var(--hx-ink)', only: 'fine', source: '5.4 --field-line-hover' },
  { control: 'select', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'select', size: 'md', state: 'invalid', prop: 'borderColor', target: 'var(--hx-danger-fill)', source: '5.4 field invalid' },
  { control: 'select', size: 'md', state: 'disabled', prop: 'opacity', target: 1, source: '5.4 field disabled: fill + muted ink, no opacity' },
  { control: 'select', size: 'md', state: 'disabled', prop: 'background', target: 'var(--hx-fill)', source: '5.4 --field-off-bg, every box' },
  { control: 'select', size: 'md', state: 'disabled', prop: 'color', target: 'var(--hx-muted)', source: '5.4 --field-off-ink, every box' },
  { control: 'numberField', size: 'md', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 --ctl-h-md' },
  { control: 'numberField', size: 'md', state: 'rest', prop: 'borderColor', target: 'var(--ctl-line-field)', source: '5.3 --ctl-line-field' },
  { control: 'numberField', size: 'md', state: 'hover', prop: 'borderColor', target: 'var(--hx-ink)', only: 'fine', source: '5.4 --field-line-hover' },
  { control: 'numberField', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'numberField', size: 'md', state: 'invalid', prop: 'borderColor', target: 'var(--hx-danger-fill)', source: '5.4 field invalid' },
  { control: 'numberField', size: 'md', state: 'disabled', prop: 'background', target: 'var(--hx-fill)', source: '5.4 --field-off-bg, every box' },
  { control: 'numberField', size: 'md', state: 'disabled', prop: 'color', target: 'var(--hx-muted)', source: '5.4 --field-off-ink, every box' },
  // Toggles (5.1 box sizes and coarse row hit; 5.3 toggle line and focus; 5.4 disabled)
  { control: 'checkbox', size: 'md', state: 'rest', prop: 'height', target: 16, source: '5.1 --toggle-box 16' },
  { control: 'checkbox', size: 'md', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 the row is the hit, >= 44 coarse' },
  { control: 'checkbox', size: 'md', state: 'rest', prop: 'borderColor', target: 'var(--hx-switch-line)', source: '5.3 --ctl-line-toggle' },
  { control: 'checkbox', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'checkbox', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled toggles' },
  { control: 'switch', size: 'md', state: 'rest', prop: 'height', target: 20, source: '5.1 --switch-h 20' },
  { control: 'switch', size: 'md', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 the row is the hit, >= 44 coarse' },
  { control: 'switch', size: 'md', state: 'rest', prop: 'borderColor', target: 'var(--hx-switch-line)', source: '5.3 --ctl-line-toggle' },
  { control: 'switch', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'switch', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled toggles' },
  { control: 'radio', size: 'md', state: 'rest', prop: 'height', target: 16, source: '5.1 --toggle-box 16 (radio dot)' },
  { control: 'radio', size: 'md', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 the row is the hit, >= 44 coarse' },
  { control: 'radio', size: 'md', state: 'rest', prop: 'borderColor', target: 'var(--hx-switch-line)', source: '5.3 --ctl-line-toggle' },
  { control: 'radio', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring' },
  { control: 'radio', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 disabled toggles' },
  // Strips (5.1 a segmented track of --tog-h options, as tall as a toolbar control; --tabs-h; 5.3 one focus shape;
  // 5.4 one disabled recipe)
  { control: 'segmented', size: 'md', state: 'rest', prop: 'height', target: 40, by: { coarse: 44 }, source: '5.1 the track: a --tog-h option plus --tog-pad and the frame each side = 40, the height of --tb-ctl-h; --touch-min 44 coarse' },
  { control: 'segmented', size: 'md', state: 'focus', prop: 'focusShadow', target: 'var(--focus-ring)', source: '5.3 --focus-ring only (no outline)' },
  { control: 'segmented', size: 'md', state: 'disabled', prop: 'opacity', target: 0.5, source: '5.4 one disabled recipe (--ctl-off-opacity)' },
  { control: 'segmentedOption', size: 'md', state: 'rest', prop: 'height', target: 32, only: 'fine', source: '5.1 --tog-h 32' },
  { control: 'segmentedOption', size: 'md', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 coarse 44' },
  { control: 'segmentedFolder', size: 'md', state: 'rest', prop: 'height', target: 34, by: { coarse: 44 }, source: '5.1 --tabs-h (folder segments)' },
  { control: 'segmentedIcon', size: 'md', state: 'rest', prop: 'height', target: 32, only: 'fine', source: '5.1 --tog-h 32 (an icon-only option)' },
  { control: 'segmentedIcon', size: 'md', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 coarse 44' },
  { control: 'tabs', size: 'md', state: 'rest', prop: 'height', target: 34, by: { coarse: 44 }, source: '5.1 --tabs-h 34, coarse 44' },
  { control: 'tabs', size: 'md', state: 'rest', prop: 'hit', target: { min: 44 }, only: 'coarse', source: '5.1 coarse 44' },
];

/** Where a debt row holds: a context pattern, '*' for any part ('*.*.compact' = every compact context). */
export type CtxPattern = `${Theme | '*'}.${Pointer | '*'}.${Density | '*'}`;

export interface DebtRow {
  /** A cellKey of CONTROL_SPEC. */
  readonly cell: string;
  /** The contexts where the kit misses the target today. */
  readonly where: readonly CtxPattern[];
  /** What the kit measures there today, read like a target: the matrix fails a debt cell that reads anything else. */
  readonly now: Target;
  /** The same, in words (and the CSS that makes it). */
  readonly today: string;
  /** The piece of work that fixes it, by its short name: the matrix prints it when the row can leave. */
  readonly fixBy: string;
  readonly why: string;
}

/** Today's known misses. Only shrinks: the matrix fails a debt row whose miss is gone (the fix removes its row with it)
 *  as it fails a cell that misses with no row, and a debt cell must still read what its row says it reads (`now`), so a
 *  worse value is caught too. */
export const CONTROL_DEBT: readonly DebtRow[] = [
];

/** True when a context matches a debt row's pattern. */
export function ctxMatches(pattern: CtxPattern, ctx: Ctx): boolean {
  const p = pattern.split('.');
  return ctx.split('.').every((part, i) => p[i] === '*' || p[i] === part);
}

/** The debt row that holds a cell in a context, if one does. */
export function debtFor(cell: string, ctx: Ctx): DebtRow | undefined {
  return CONTROL_DEBT.find((d) => d.cell === cell && d.where.some((w) => ctxMatches(w, ctx)));
}
