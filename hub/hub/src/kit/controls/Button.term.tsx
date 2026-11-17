// Buttons in the terminal: a pressable label in brackets, [Label]. Primary and the filled danger are solid (their
// colour fill, bold), so the one main action still stands out in mono by weight; at md a solid one is ' Label ' (its
// fill padded), at the smaller sizes '[Label]' filled. Icons and the chip are not drawn (the label carries the
// meaning; an IconButton shows its label). Busy puts "…" before the label and refuses presses; pressed marks "✓ ". A disabled button with a reason stays focusable, does nothing and shows the reason while
// focused (SoftPress). The pure rules (variants, chip, danger look, link targets, soft state) are Button.pure.ts.
import { useState, type ReactNode } from 'react';
import type * as Web from './Button';
import { Box, Text, type Colour, type Key } from '../../term/prim';
import { Layer, useAnchor, useFocusWithin } from '../../term/prim/Overlay';
import { focusInk } from '../../term/prim/FocusInk';
import { domKey, useSubmitTarget } from '../forms/termField';
import { useRouter } from '@tanstack/react-router';
import { useGoTerm } from '../../term/app/nav';
import { formatShortcut } from './Kbd';
import { useInButtonStrip } from './ButtonStrip';
import { buttonLook, softDisabled } from './Button.pure';
import { PRESS, SoftPress, useButtonWrap } from './termPress';
import { openOnWeb, openOutside } from '../states/openOutside';
import { maskedLabel, secretHref } from './Link.pure';
import { textOf } from '../../term/prim/semantics';
import { ICON_GLYPHS, iconText } from '../icons.glyphs';
import type { IconName } from '../icons';

/** A button icon in the terminal: its glyph; its word only on a button with no words of its own (beside a label the
 *  word would read as part of it: "lock Ask when needed"); a decorative icon draws nothing (icons.glyphs.ts). */
const glyphOf = (name: IconName | undefined, labelled = false): string => {
  const c = name ? ICON_GLYPHS[name] : undefined;
  return !c || (labelled && c.kind === 'label') ? '' : iconText(c);
};
const hasWords = (children: ReactNode): boolean => children !== undefined && children !== null && children !== false && children !== '';

export type { BusySlot, ButtonProps, ButtonLook, IconButtonProps, LinkButtonProps } from './Button';
export type { ButtonSize, ButtonTone, ButtonVariant, ChipVariant, SoftOwn } from './Button.pure';
export { SOFT_DISABLED_PROPS, TOOLTIP_DELAY_MS, anchorProps, buttonLook, chipFor, cx, isChipVariant, softDisabled, softDisabledProps } from './Button.pure';

/** No CSS here: the class names as words, for a caller that passes them on (nothing reads them). */
export const buttonClass: typeof Web.buttonClass = ({ variant, size, chipped }) => ['button', variant, size, chipped ? 'chipped' : ''].filter(Boolean).join(' ');

/** The busy mark in place of an icon. */
export const ButtonSpinner: typeof Web.ButtonSpinner = () => <Text colour="muted">…</Text>;

/** The inside of a self-drawn button: its label (the chip is not drawn in the terminal). */
export const ButtonFace: typeof Web.ButtonFace = ({ children }) => <>{children}</>;

/** No element to watch here: the soft state is SoftPress's; this hands the caller's ref back unchanged. */
export const useSoftDisabled: typeof Web.useSoftDisabled = (_soft, _busy, _isDisabled, next) => ({ ref: next, el: { current: null } });

export const useReasonTip: typeof Web.useReasonTip = (soft, busy, isDisabled, next, own) => {
  const [open, setOpen] = useState(false);
  const { ref, el } = useSoftDisabled(soft, busy, isDisabled, next, setOpen, own);
  return { ref, el, open, setOpen };
};

/** A reason shown as a line where the caller puts it, while open (the kit's own controls use SoftPress's tip). */
export const ReasonTip: typeof Web.ReasonTip = ({ reason, shown, open }) => (shown && open && reason ? <Text colour="muted">{reason}</Text> : null);

interface FaceProps {
  label: ReactNode;
  /** Glyphs drawn before / after the words (already resolved; empty = none). */
  icon?: string;
  iconEnd?: string;
  look: Web.ButtonVariant;
  size: Web.ButtonSize;
  focused: boolean;
  /** The pointer is on it and a press would act (SoftPress). */
  hovered?: boolean;
  disabled: boolean;
  busy: boolean;
  shortcut?: string;
  pressed?: boolean;
  strip?: boolean;
  /** Wrap the words over several lines (ButtonWrap) instead of one line cut with "…". */
  wrap?: boolean;
}

/** One button as drawn: brackets (sized), the busy mark, the label, the shortcut; inverse while focused. */
function Face({ label, look, size, focused, hovered, disabled, busy, shortcut, pressed, strip, icon, iconEnd, wrap }: FaceProps): ReactNode {
  const solid = !strip && (look === 'primary' || look === 'dangerSolid');
  const fg: Colour = disabled ? 'faint' : look === 'danger' ? 'danger' : solid ? (look === 'primary' ? 'accInk' : 'dangerInk') : 'ink';
  // Under the pointer a button with no fill of its own stands on the `hover` ground; a solid button keeps its fill.
  const bg: Colour | undefined = disabled || !solid ? (hovered ? 'hover' : undefined) : look === 'primary' ? 'acc' : 'danger';
  // md: a solid button is its fill with a cell of pad each side (no brackets); every other button and size is bracketed.
  const [open, close] = solid && size === 'md' ? [' ', ' '] : ['[', ']'];
  return (
    <Text colour={fg} bg={bg} bold={solid && !disabled} dim={disabled} truncate={!wrap} {...focusInk(focused)}>
      {open}
      {pressed ? '✓ ' : ''}
      {busy ? '… ' : icon ? `${icon} ` : ''}
      {label}
      {iconEnd ? ` ${iconEnd}` : ''}
      {shortcut ? <Text colour={disabled ? 'faint' : 'muted'}>{` ${formatShortcut(shortcut)}`}</Text> : null}
      {close}
    </Text>
  );
}

export const Button: typeof Web.Button = ({ variant = 'secondary', tone, size = 'md', busy, isDisabled, disabledReason, onPress, children, autoFocus, shortcut, fullWidth, icon, iconEnd, shrink, pressed, 'aria-label': ariaLabel, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, type, form, id, onKeyDown }) => {
  const strip = useInButtonStrip();
  const wrap = useButtonWrap();
  const submit = useSubmitTarget(type, form, () => isDisabled === true || busy === true);
  const soft = softDisabled(disabledReason, isDisabled, busy);
  // The web Button's onKeyDown, for keys other than Enter and Space: a handler that calls preventDefault took the key
  // (Escape closing a bar the button sits in), so it goes no further (the drawer around it stays open).
  const keys = onKeyDown ? (k: Key) => { const d = domKey(k); onKeyDown(d.event as never); return d.taken(); } : undefined; // contract-any: a DOM-shaped key slice, not a KeyboardEvent
  return (
    <SoftPress off={isDisabled === true} busy={busy === true} soft={soft} reason={disabledReason} autoFocus={autoFocus} domId={id} onKey={keys} grow={fullWidth} shrink={shrink || wrap} onPress={() => { onPress?.(PRESS); submit(); }}
      // Named as React Aria names it: aria-label, else aria-labelledby (resolved only while the name is unset), else the words.
      sem={{ id, name: ariaLabel ?? (labelledBy ? undefined : textOf(children)), labelledBy, describedBy, busy: busy || undefined, pressed }}>
      {({ focused, hovered }) => <Face hovered={hovered} label={children} look={buttonLook(variant, tone)} size={size} focused={focused} disabled={isDisabled === true && !busy} busy={busy === true} shortcut={shortcut} pressed={pressed} strip={strip} icon={glyphOf(icon, hasWords(children))} iconEnd={glyphOf(iconEnd, hasWords(children))} wrap={wrap} />}
    </SoftPress>
  );
};

/** A button that goes somewhere: a Hub path through the router. An absolute web address cannot be opened from here; the
 *  press does nothing more than the caller's own onPress (ExtLink shows such an address as a terminal link). */
export const LinkButton: typeof Web.LinkButton = ({ href, variant = 'secondary', tone, size = 'md', isDisabled, disabledReason, onPress, children, autoFocus, shrink }) => {
  const go = useGoTerm();
  // An absolute http(s) address is the web's new tab: here the one way out of the Hub (openOutside: the host's
  // browser, else the address copied and shown, never nothing). A Hub route navigates; outside a router (a bare
  // component harness) a press reports itself and goes nowhere.
  const routed = Boolean(useRouter({ warn: false }));
  const wrap = useButtonWrap();
  const soft = softDisabled(disabledReason, isDisabled);
  return (
    <SoftPress off={isDisabled === true} soft={soft} reason={disabledReason} autoFocus={autoFocus} shrink={shrink || wrap} onPress={() => { onPress?.(PRESS); if (/^https?:\/\//i.test(href)) openOutside(href, secretHref(href) ? { shownAs: maskedLabel(href) } : {}); else if (href.startsWith('/auth/')) openOnWeb(href); else if (routed) go(href); }}
      sem={{ role: 'link', name: textOf(children) }}>
      {({ focused, hovered }) => <Face hovered={hovered} label={children} look={buttonLook(variant, tone)} size={size} focused={focused} disabled={isDisabled === true} busy={false} wrap={wrap} />}
    </SoftPress>
  );
};

/** IconButton's info form: "ⓘ", named by its label; the label shows as a tip while the focus is on it, after a press,
 *  or while the pointer rests on it. Esc hides it until the focus leaves and comes back. */
function InfoMark({ label, description, autoFocus }: { label: string; description?: string; autoFocus?: boolean }) {
  const anchor = useAnchor();
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [muted, setMuted] = useState(false);
  useFocusWithin(anchor.ref, (inside) => { setFocusIn(inside); if (!inside) setMuted(false); });
  const show = hover || (focusIn && !muted);
  return (
    <>
      <Box boxRef={anchor.ref} dir="row" shrink={0} raw={{ onMouseOver: () => setHover(true), onMouseOut: () => setHover(false) }}>
        <SoftPress off={false} soft={false} autoFocus={autoFocus} onPress={() => setMuted(false)} sem={{ name: label, description }}>
          {({ focused }) => <Text colour={show ? 'focus' : 'muted'} {...focusInk(focused)}>ⓘ</Text>}
        </SoftPress>
      </Box>
      <Layer open={show} kind="tip" sem={{ role: 'tooltip', name: label }} place={{ at: 'anchor', anchor: anchor.rect, side: 'top', align: 'start', width: Math.min(40, label.length + 4) }} padX={1} onEscape={() => { setHover(false); setMuted(true); }}>
        <Text>{label}</Text>
      </Layer>
    </>
  );
}

export const IconButton: typeof Web.IconButton = ({ icon, label, tooltip, variant = 'ghost', tone, size = 'md', isDisabled, disabledReason, description, busy, pressed, onPress, autoFocus, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, type, form }) => {
  const strip = useInButtonStrip();
  const submit = useSubmitTarget(type, form, () => isDisabled === true || busy === true);
  const reason = isDisabled ? (disabledReason ?? description) : undefined;
  const soft = softDisabled(reason, isDisabled, busy);
  // An info mark with no action (CreateDrawer's feature tips): on the web an ⓘ whose label is its tooltip. Drawn as its
  // label it was the whole sentence (76 cells past the row); it is the ⓘ with the label as a tip on
  // focus, press or pointer, as InfoTip's icon form. A press handler (a Popover trigger: withPress) keeps the button.
  if (icon === 'info' && !onPress && tooltip === undefined && !isDisabled && !busy && type !== 'submit' && !form) return <InfoMark label={label} description={description} autoFocus={autoFocus} />;
  return (
    <SoftPress off={isDisabled === true} busy={busy === true} soft={soft} reason={reason} autoFocus={autoFocus} onPress={() => { onPress?.(PRESS); submit(); }}
      sem={{ name: labelledBy ? undefined : label, labelledBy, describedBy, busy: busy || undefined, pressed: pressed === undefined ? undefined : pressed, description: soft ? undefined : description }}>
      {({ focused, hovered }) => <Face hovered={hovered} label={label} look={buttonLook(variant, tone)} size={size} focused={focused} disabled={isDisabled === true && !busy} busy={busy === true} pressed={pressed} strip={strip} />}
    </SoftPress>
  );
};
