// The pure rules of the kit buttons (Button.tsx on the web, Button.term.tsx in the terminal): variants and the chip
// rule, the danger look, link targets and the soft-disabled state. No React, no DOM.
import type { LinkProps as AriaLinkProps } from 'react-aria-components';

/**
 * `primary`: the one accent plate of a region. `secondary` (the default) and `ghost`: the grey plate; an icon-only
 * ghost is frameless. `row`: a table row's main action, grey at rest and accent on the hovered or focused row, so a
 * table never stacks a column of accent buttons. `bubble`: Home's idea plate, a sentence, never in capitals.
 * `danger` and `dangerSolid` are retired spellings of `tone="danger"` (hub/retired-alias warns on them).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid' | 'row' | 'bubble';
/** `md`: a header, footer or dialog button. `sm`: a row or toolbar action. `xs`: a dense row's action; on a coarse
 *  pointer its press still reaches --touch-min, built in. `toolbar`: a table toolbar's control, as tall as the search
 *  field beside it. Heights are the --btn-h tokens; xs and toolbar never carry the end glyph. */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'toolbar';

/** The variants that carry the end glyph. */
export type ChipVariant = 'primary' | 'secondary';
export const CHIP_VARIANTS: ReadonlySet<ButtonVariant> = new Set<ChipVariant>(['primary', 'secondary']);
export const isChipVariant = (v: ButtonVariant): v is ChipVariant => CHIP_VARIANTS.has(v);

/**
 * Whether a button carries the end glyph (the arrow, plus or another pixel icon inside the plate after the label): every
 * primary and secondary button at md and sm, unless `chip` says otherwise. `link` is accepted for callers that pass it;
 * a LinkButton follows the same rule.
 */
export function chipFor({ variant, size, chip }: { variant: ButtonVariant; size: ButtonSize; hasEnd?: boolean; chip?: boolean; link?: boolean }): boolean {
  if (!CHIP_VARIANTS.has(variant)) return false;
  if (size === 'toolbar' || size === 'xs') return false;
  return chip ?? true;
}

/**
 * What a button's action does to its object: `danger` for one that deletes, removes, revokes, discards or leaves; stop,
 * restart and reset keep `default`. A danger button is the grey plate in the danger ink and never carries the glyph.
 */
export type ButtonTone = 'default' | 'danger';

/**
 * The look a variant takes in a tone, which is also its class and its `data-variant`: in `danger` a primary is
 * `dangerSolid`, any other variant `danger`. Both draw the same danger plate; the two names stay as `data-variant`
 * values, so a reader can still tell an armed confirm from a plain danger action.
 */
export function buttonLook(variant: ButtonVariant, tone: ButtonTone | undefined): ButtonVariant {
  if (tone !== 'danger') return variant;
  return variant === 'primary' || variant === 'dangerSolid' ? 'dangerSolid' : 'danger';
}


/** Every kit tooltip opens after the same pause: the kit Tooltip, IconButton, Qr and the id chips. */
export const TOOLTIP_DELAY_MS = 400;

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * `href`, `target` and `rel` of a Link or LinkButton: an absolute http(s) URL (any case) opens a new tab without opener,
 * whatever the caller passed; any other href keeps the caller's own `target` and `rel`.
 */
export function anchorProps(href: string, own: Pick<AriaLinkProps, 'target' | 'rel'>): Pick<AriaLinkProps, 'href' | 'target' | 'rel'> {
  const external = /^https?:\/\//i.test(href);
  return { href, target: external ? '_blank' : own.target, rel: external ? 'noopener noreferrer' : own.rel };
}

/**
 * A disabled control that says why stays focusable, so the reason is reachable by keyboard and screen reader. It is the same
 * element enabled or not (focus survives, and a caller's own tooltip keeps working while it is enabled). React Aria's isDisabled
 * cannot do this: it takes a button's focus and turns a link into a different element. So the control is enabled to React
 * Aria, and every handler the caller passes goes, focus and blur included (softDisabledProps; a disabled button never gets
 * them either), so React has none of them to run, capture phase included. useSoftDisabled stops what React Aria itself would act on at the
 * element: the click (which also stops a form's implicit submission, as a disabled submit button does), Enter and Space, and
 * the pointer, which covers a press a DialogTrigger or MenuTrigger supplies through context. The reason is its accessible
 * description and its tooltip. A busy button is pending, not disabled, and keeps its own state.
 */
export const softDisabled = (reason: string | undefined, isDisabled: boolean | undefined, busy?: boolean): boolean => !!reason && !!isDisabled && !busy;

export const SOFT_DISABLED_PROPS = {
  isDisabled: false,
  onPress: undefined,
  onPressStart: undefined,
  onPressEnd: undefined,
  onPressUp: undefined,
  onPressChange: undefined,
  onClick: undefined,
  onKeyDown: undefined,
  onKeyUp: undefined,
  onHoverStart: undefined,
  onHoverEnd: undefined,
  onHoverChange: undefined,
} as const;

/**
 * SOFT_DISABLED_PROPS, plus every other handler in the caller's props cleared (onClickCapture, onAuxClick, onFocus...). React
 * Aria's own focus handling is internal and stays, and so do useSoftDisabled's listeners, which are not props.
 */
export function softDisabledProps(callerProps: object): Record<string, unknown> {
  const out: Record<string, unknown> = { ...SOFT_DISABLED_PROPS };
  for (const key of Object.keys(callerProps)) if (/^on[A-Z]/.test(key)) out[key] = undefined;
  return out;
}

/**
 * What React believes the element carries now, from the current props: the soft state gives these back, never a snapshot,
 * so a change in the same commit that ends it (a new href once data loads) is the one kept.
 */
export interface SoftOwn {
  /** The caller's aria-disabled, which React Aria forwards on a button (a link's is React Aria's own). */
  aria?: boolean | 'true' | 'false';
  /** A link's href, only when it renders as an <a>: React Aria draws an empty href as a <span role="link">. */
  href?: string;
}

