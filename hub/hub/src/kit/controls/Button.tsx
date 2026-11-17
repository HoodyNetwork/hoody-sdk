// The kit's buttons, one family of slanted plates (Button.module.css): `Button` for a labelled action, `LinkButton` for
// one that goes somewhere, `IconButton` for an icon-only one (it always carries a tooltip, its label). A sentence-like
// action inside text is a `TextButton` (Link.tsx) instead. The soft-disabled helpers here are shared by every kit
// pressable that must stay focusable to say why it cannot act.
import { type ReactNode, type Ref, type RefCallback, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
  Tooltip as AriaTooltip,
  TooltipContext,
  TooltipTrigger,
  TooltipTriggerStateContext,
} from 'react-aria-components';
import { Icon, PxIcon, type IconName, type PxIconName } from '../icons';
import { chipGlyph } from './chipGlyph';
import { useKeyshortcuts } from '../keyshortcuts';
import { ariaKeyshortcuts, Kbd, Shortcut } from './Kbd';
import { useInButtonStrip } from './ButtonStrip';
import { useDisabledPressRef } from './disabledPress';
import { Spinner } from '../states/Spinner';
import s from './Button.module.css';
import { type ButtonSize, type ButtonTone, type ButtonVariant, type ChipVariant, type SoftOwn, TOOLTIP_DELAY_MS, anchorProps, buttonLook, chipFor, cx, softDisabled, softDisabledProps } from './Button.pure';

// The pure rules live in Button.pure.ts (shared with the terminal); their names stay importable from here.
export { SOFT_DISABLED_PROPS, TOOLTIP_DELAY_MS, anchorProps, buttonLook, chipFor, cx, isChipVariant, softDisabled, softDisabledProps } from './Button.pure';
export type { ButtonSize, ButtonTone, ButtonVariant, ChipVariant, SoftOwn } from './Button.pure';

/**
 * `chip={false}` leaves the end glyph out (Cancel, an input-filling suggestion); `chipIcon` names it (else the end
 * icon's pixel twin, else the plus for a "New …" label, else the arrow). Only the glyph variants take them.
 */
// Two members, split by variant only, so a caller's variant that is itself a union ('primary' | 'ghost') still type-checks
// (TS splits a union-typed prop only across a union it can discriminate by that prop). A danger tone never draws the glyph
// at run time (buttonLook gives a danger look, which is not a glyph variant), so `chip` beside it is inert.
type ChipProps =
  | { variant?: ChipVariant; tone?: ButtonTone; chip?: boolean; chipIcon?: PxIconName }
  | { variant: Exclude<ButtonVariant, ChipVariant>; tone?: ButtonTone; chip?: undefined; chipIcon?: undefined };
/** A button's variant, tone and glyph choice, for a wrapper that picks them (Dialog's primary). */
export type ButtonLook = ChipProps;

/** The end glyph, or the busy mark in its place. Decoration: the button's name is its label. */
function Glyph({ busy, glyph }: { busy?: boolean; glyph: PxIconName }) {
  return (
    <span className={s.glyph} aria-hidden="true" data-glyph-mark="">
      {busy ? <ButtonSpinner marked slot="glyph" /> : <PxIcon name={glyph} />}
    </span>
  );
}

/** Where a busy Button's dots sit: the end glyph's place, the end (an end icon's place, or a start icon's moved there), or
 * over the middle of a button with no mark. */
export type BusySlot = 'glyph' | 'end' | 'over';

/** A busy button's mark in place of its icon: the kit Spinner, the one busy mark, in the icon's box (`over`: across the
 * whole button, over its label). */
export function ButtonSpinner({ marked, slot }: { marked?: boolean; slot?: BusySlot }) {
  return (
    <span className={cx(s.spinner, slot === 'over' && s.spinnerOver)} aria-hidden="true" data-spinner={marked ? '' : undefined} data-spinner-slot={slot}>
      <Spinner />
    </span>
  );
}

// `isPending` is omitted: the kit Button owns RAC's pending state and sets it from `busy`, so a caller's isPending would be
// thrown away. Pending is spelled `busy` on every kit control.
interface ButtonBaseProps extends Omit<AriaButtonProps, 'children' | 'className' | 'style' | 'isPending'> {
  size?: ButtonSize;
  icon?: IconName;
  iconEnd?: IconName;
  /** Show a busy pulse in place of the icon and refuse presses (the label stays). */
  busy?: boolean;
  /** Why a disabled button cannot act: see SoftDisabled below. Only read with `isDisabled`. */
  disabledReason?: string;
  /** The button element, as well as the kit's own ref (React 19 ref prop). */
  ref?: Ref<HTMLButtonElement>;
  fullWidth?: boolean;
  /** A keyboard shortcut shown inside the button after the label ('Mod+J', '?'). */
  shortcut?: string;
  /** The shortcut for assistive tech ('Control+J'), set on the element (React Aria's Button would drop it). */
  'aria-keyshortcuts'?: string;
  /**
   * The label is data, shown as written (a name, an id, a path): no theme case or tracking (`data-literal`). The std
   * `literal` rule asks for it on data labels.
   */
  literal?: boolean;
  /**
   * The label is data that may be cut (a realm name in a narrow tile head): the button may get narrower than its words,
   * down to its parent's width, and the label ends in an ellipsis. The touch floor stays (`data-shrink`).
   */
  shrink?: boolean;
  /**
   * The tooltip is the button's own accessible name (`aria-label`), so a page adds no tooltip text (for example
   * the Board's counted options button). `{ shortcut }` adds a key hint in the tooltip only, never a cap in the button
   * (pass `aria-keyshortcuts` for assistive tech). No tooltip without an aria-label, or while a disabled reason shows
   * its own; the button is not remounted as either changes. Keep it set or unset for a button's life (switching it
   * remounts the button).
   */
  nameTooltip?: boolean | { shortcut?: string };
  /** A toggle that is on (aria-pressed): the plate holds its pressed step while it stays on (an open dock, a shown pane). */
  pressed?: boolean;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = ButtonBaseProps & ChipProps;

/**
 * The kit Button's own classes: the base, the variant and the size. A control that looks like a kit button but owns its
 * own element (kit/voice hold to talk: no press layer) takes these; each caller adds full width, the strip look and its
 * own className itself. `chipped` is accepted so a caller passes what chipFor told it; the glyph needs no root class.
 */
export function buttonClass({ variant, size }: { variant: ButtonVariant; size: ButtonSize; chipped?: boolean }): string {
  return cx(s.button, s[variant], s[size]);
}

/** The inside of a button that takes buttonClass: the label, then the end glyph when `chipped`. */
export function ButtonFace({ chipped, children }: { chipped: boolean; children: ReactNode }) {
  return (
    <>
      <span className={s.label} data-btn-label="">{children}</span>
      {chipped && <Glyph glyph={chipGlyph(undefined, undefined, children)} />}
    </>
  );
}

const restoreAttr = (node: Element, name: string, value: string | null) => {
  if (value === null) node.removeAttribute(name);
  else node.setAttribute(name, value);
};

/** What reaches React from the pointer on any other control. A disabled button gets none of it. */
const SOFT_STOPPED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerover', 'pointerout', 'mouseover', 'mouseout', 'dragstart'] as const;

/**
 * The element side of a soft-disabled control (see softDisabled). `setOpen` is the state of the tooltip that shows the reason:
 * focus by keyboard, hover, a tap and a click open it; Escape, blur, leaving and a press elsewhere close it. Escape goes on to
 * whatever else takes it, so a dialog around the control still closes.
 */
export function useSoftDisabled<T extends HTMLElement>(
  soft: boolean,
  busy: boolean | undefined,
  isDisabled: boolean | undefined,
  next: RefCallback<T>,
  setOpen: (open: boolean) => void,
  own: SoftOwn = {},
) {
  const el = useRef<T | null>(null);
  // The element the soft state last wrote to, so it gives back only what it took, and only to that element.
  const wrote = useRef<T | null>(null);
  // A hard-disabled <button> never lets the start of a press reach React Aria (disabledPress.ts). A soft-disabled control
  // is not a disabled element: it is stopped below, with the rest of the pointer.
  const guarded = useDisabledPressRef(next);
  const ref = useCallback(
    (node: T | null) => {
      el.current = node;
      const undo = guarded(node);
      if (!node) return undo;
      // The guard always hands back a cleanup, so React never calls this with null: the element is let go here.
      return () => {
        if (typeof undo === 'function') undo();
        if (el.current === node) el.current = null;
      };
    },
    [guarded],
  );
  // After every commit, not on change: React writes the caller's attributes back when they change (an href).
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (soft) {
      wrote.current = node;
      if (own.href !== undefined) {
        // A link stays the same <a>: with no href it navigates nowhere, and needs its role said. Its focus stays: React Aria
        // gives every enabled link tabindex 0.
        node.removeAttribute('href');
        node.setAttribute('role', 'link');
      }
      node.setAttribute('aria-disabled', 'true');
      node.setAttribute('data-disabled', 'true');
    } else if (wrote.current) {
      const was = wrote.current;
      wrote.current = null;
      if (was !== node) return;
      // A busy control's aria-disabled is React Aria's. data-disabled follows what React Aria is given (isDisabled, unless
      // busy): React wrote nothing for it if that did not change, so the soft state's own one must go.
      if (!busy) restoreAttr(node, 'aria-disabled', own.aria === undefined ? null : String(own.aria));
      if (!isDisabled || busy) node.removeAttribute('data-disabled');
      if (own.href !== undefined) {
        node.setAttribute('href', own.href);
        // React Aria gives an <a> no role of its own and forwards none from a caller.
        node.removeAttribute('role');
      }
    }
  });
  useLayoutEffect(() => {
    const node = el.current;
    if (!soft || !node) return;
    // Whether this hook opened the reason, for Escape. Not a cache of the tooltip: a scroll can close it from outside.
    let open = false;
    const set = (to: boolean) => {
      open = to;
      setOpen(to);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = (e: Event) => e.stopPropagation();
    const onClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      set(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      timer = setTimeout(() => set(true), TOOLTIP_DELAY_MS);
    };
    const onLeave = () => {
      clearTimeout(timer);
      if (document.activeElement !== node) set(false);
    };
    const onFocus = () => {
      if (node.matches(':focus-visible')) set(true);
    };
    const onBlur = () => set(false);
    // Soft-disabled while it holds keyboard focus (a lock that lands under the person's focus): say why now, as a focus
    // would; a mouse focus stays quiet, as onFocus.
    if (document.activeElement === node && node.matches(':focus-visible')) set(true);
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) flushSync(() => set(false));
    };
    const onAway = (e: Event) => {
      if (!(e.target instanceof Node && node.contains(e.target))) set(false);
    };
    for (const type of SOFT_STOPPED) node.addEventListener(type, stop, true);
    node.addEventListener('click', onClick, true);
    node.addEventListener('keydown', onKey, true);
    node.addEventListener('keyup', onKey, true);
    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', onLeave);
    node.addEventListener('focus', onFocus);
    node.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onEscape, true);
    window.addEventListener('pointerdown', onAway, true);
    return () => {
      clearTimeout(timer);
      for (const type of SOFT_STOPPED) node.removeEventListener(type, stop, true);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('keydown', onKey, true);
      node.removeEventListener('keyup', onKey, true);
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('pointerdown', onAway, true);
      setOpen(false);
    };
  }, [soft, setOpen]);
  return { ref, el };
}

const noopTip = () => undefined;

/** useSoftDisabled with its own tooltip state, for the controls that have no tooltip of their own. */
export function useReasonTip<T extends HTMLElement>(
  soft: boolean,
  busy: boolean | undefined,
  isDisabled: boolean | undefined,
  next: RefCallback<T>,
  own?: SoftOwn,
) {
  const [open, setOpen] = useState(false);
  const { ref, el } = useSoftDisabled(soft, busy, isDisabled, next, setOpen, own);
  return { ref, el, open, setOpen };
}

/**
 * The tooltip and description of a soft-disabled Button, LinkButton or TextButton, beside the control. The description is a
 * hidden sibling, never inside the control, or it would join the control's name. (IconButton has its own: its name is
 * aria-label, so its description can sit inside.) No wrapper: every control renders this in the same place, so turning on or
 * off never moves the control in the tree, and a TooltipTrigger the caller wraps it in still reaches it.
 */
export function ReasonTip({ reason, shown, id, open, setOpen, trigger }: { reason: string | undefined; shown: boolean; id: string; open: boolean; setOpen: (open: boolean) => void; trigger: RefObject<Element | null> }) {
  // Enough of a tooltip's state for its overlay. useSoftDisabled opens and closes it; the overlay itself closes it when a
  // scroll moves the control (useOverlayPosition), as it does any tooltip.
  const state = useMemo(() => ({ isOpen: open, shouldSkipAnimation: false, open: noopTip, close: () => setOpen(false) }), [open, setOpen]);
  if (!shown) return null;
  return (
    <>
      <span id={id} hidden>
        {reason}
      </span>
      {/* Its own state and trigger, in place of those of a Tooltip the caller wraps the control in. */}
      <TooltipTriggerStateContext.Provider value={state}>
        <TooltipContext.Provider value={{ triggerRef: trigger }}>
          <AriaTooltip placement="bottom" offset={6} className={s.tooltip}>
            {reason}
          </AriaTooltip>
        </TooltipContext.Provider>
      </TooltipTriggerStateContext.Provider>
    </>
  );
}

export function Button({
  variant = 'secondary',
  tone,
  size = 'md',
  icon,
  iconEnd,
  busy,
  disabledReason,
  ref: callerRef,
  fullWidth,
  shortcut,
  className,
  children,
  isDisabled,
  chip,
  chipIcon,
  literal,
  shrink,
  nameTooltip,
  pressed,
  'aria-keyshortcuts': keyshortcuts,
  ...rest
}: ButtonProps) {
  // A name tooltip's Escape (inside a dialog) needs the element, as IconButton's does; the caller's ref still gets it.
  const tip = useTooltipEscape();
  const withTip = useCallback(
    (node: HTMLButtonElement | null) => {
      tip.ref.current = node;
      if (typeof callerRef === 'function') return callerRef(node);
      if (callerRef) (callerRef as { current: HTMLButtonElement | null }).current = node;
    },
    [callerRef, tip.ref],
  );
  // React Aria's Button drops aria-keyshortcuts; set it on the element (kit/keyshortcuts.ts). A shown shortcut names its
  // keys there and its badge stays out of the button's name, so the name is the label alone.
  const keysRef = useKeyshortcuts<HTMLButtonElement>(keyshortcuts ?? (shortcut ? ariaKeyshortcuts(shortcut) : undefined), nameTooltip ? withTip : callerRef);
  const soft = softDisabled(disabledReason, isDisabled, busy);
  const { ref: elRef, el: elNode, open: reasonOpen, setOpen: setReasonOpen } = useReasonTip(soft, busy, isDisabled, keysRef, { aria: rest['aria-disabled'] });
  const reasonId = useId();
  const softProps = soft ? { ...softDisabledProps(rest), 'aria-describedby': reasonId } : {};
  // Inside a ButtonStrip the button takes the strip look and never the end glyph.
  const strip = useInButtonStrip();
  const look = buttonLook(variant, tone);
  const glyphed = !strip && chipFor({ variant: look, size, chip });
  // A glyph button shows no start icon: the glyph is its one mark. Busy dots never sit before the label, and a button
  // turning busy keeps its width: they take the glyph's place, else an end icon's, else a start icon's moved to the end
  // (one icon box either way), else they sit over a button with no mark, its label kept in place under them.
  const busySlot: BusySlot | null = !busy ? null : glyphed ? 'glyph' : iconEnd || icon ? 'end' : 'over';
  const lead = glyphed || !icon || (busy && !iconEnd) ? null : <Icon name={icon} />;
  const el = (
    <AriaButton
      {...rest}
      ref={elRef}
      isDisabled={isDisabled && !busy}
      isPending={busy}
      {...softProps}
      aria-pressed={pressed ?? rest['aria-pressed']}
      className={cx(buttonClass({ variant: look, size }), fullWidth && s.full, strip && s.inStrip, isOn(pressed, rest['aria-pressed']) && s.pressed, !glyphed && icon && !iconEnd && children !== undefined && s.iconStart, busySlot === 'over' && s.busyOver, shrink && s.shrink, className)}
      data-variant={look}
      data-literal={literal ? '' : undefined}
      data-shrink={shrink ? '' : undefined}
      data-glyph={glyphed ? '' : undefined}
      data-strip={strip ? '' : undefined}
      data-words={children !== undefined ? '' : undefined}
    >
      {lead}
      {children !== undefined && <span className={s.label} data-btn-label="">{children}</span>}
      {busySlot === 'end' && <ButtonSpinner slot="end" />}
      {!glyphed && iconEnd && !busy && <Icon name={iconEnd} />}
      {shortcut && <Shortcut keys={shortcut} className={s.shortcut} aria-hidden />}
      {glyphed && <Glyph busy={busy} glyph={chipGlyph(chipIcon, iconEnd, children)} />}
      {busySlot === 'over' && <ButtonSpinner slot="over" />}
    </AriaButton>
  );
  // The trigger wraps the button whenever `nameTooltip` is set, so a disabled reason or an aria-label coming or going
  // never remounts the button (focus stays); only the tooltip's content and open state follow them.
  const tipName = nameTooltip && !soft ? rest['aria-label'] : undefined;
  const tipKeys = typeof nameTooltip === 'object' ? nameTooltip.shortcut : undefined;
  return (
    <>
      {nameTooltip ? (
        <TooltipTrigger delay={TOOLTIP_DELAY_MS} closeDelay={0} isOpen={!!tipName && tip.open} onOpenChange={tip.setOpen}>
          {el}
          {tipName && (
            <AriaTooltip placement="bottom" offset={6} className={s.tooltip}>
              {tipName}
              {tipKeys && <Kbd>{tipKeys}</Kbd>}
            </AriaTooltip>
          )}
        </TooltipTrigger>
      ) : (
        el
      )}
      <ReasonTip reason={disabledReason} shown={soft} id={reasonId} open={reasonOpen} setOpen={setReasonOpen} trigger={elNode} />
    </>
  );
}

interface LinkButtonBaseProps extends Omit<AriaLinkProps, 'children' | 'className' | 'style'> {
  /** A hash path inside the Hub or an absolute https URL (opens in a new tab). */
  href: string;
  size?: ButtonSize;
  icon?: IconName;
  iconEnd?: IconName;
  /**
   * The label is data, shown as written (a name, an id, a path): no theme case or tracking (`data-literal`). The std
   * `literal` rule asks for it on data labels.
   */
  literal?: boolean;
  /**
   * The label is data that may be cut (a realm name in a narrow tile head): the button may get narrower than its words,
   * down to its parent's width, and the label ends in an ellipsis. The touch floor stays (`data-shrink`).
   */
  shrink?: boolean;
  /** Why a disabled link cannot go anywhere (only read with `isDisabled`): it stays focusable, never navigates, and says why. */
  disabledReason?: string;
  /** The link element (React 19 ref prop). */
  ref?: Ref<HTMLAnchorElement>;
  className?: string;
  children?: ReactNode;
}

export type LinkButtonProps = LinkButtonBaseProps & ChipProps;

/**
 * An action that goes somewhere (open an app's page, its terminal) drawn as a button: same variants, sizes and end glyph
 * as `Button`; an external target opens a new tab. Use `Link` instead for a link inside a sentence.
 */
export function LinkButton({ href, variant = 'secondary', tone, size = 'md', icon, iconEnd, literal, shrink, disabledReason, ref, className, children, chip, chipIcon, ...rest }: LinkButtonProps) {
  const soft = softDisabled(disabledReason, rest.isDisabled);
  const anchor = anchorProps(href, rest);
  const reasonId = useId();
  const softProps = soft ? { ...softDisabledProps(rest), 'aria-describedby': reasonId } : {};
  const { ref: elRef, el: elNode, open: reasonOpen, setOpen: setReasonOpen } = useReasonTip(soft, undefined, rest.isDisabled, useKeyshortcuts<HTMLAnchorElement>(undefined, ref), { href: anchor.href || undefined });
  const look = buttonLook(variant, tone);
  const glyphed = chipFor({ variant: look, size, chip });
  const lead = !glyphed && icon ? <Icon name={icon} /> : null;
  const el = (
    <AriaLink
      {...rest}
      {...anchor}
      {...softProps}
      ref={elRef}
      className={cx(buttonClass({ variant: look, size }), lead !== null && !iconEnd && children !== undefined && s.iconStart, shrink && s.shrink, className)}
      data-variant={look}
      data-literal={literal ? '' : undefined}
      data-shrink={shrink ? '' : undefined}
      data-glyph={glyphed ? '' : undefined}
      data-words={children !== undefined ? '' : undefined}
    >
      {lead}
      {children !== undefined && <span className={s.label} data-btn-label="">{children}</span>}
      {!glyphed && iconEnd && <Icon name={iconEnd} />}
      {glyphed && <Glyph glyph={chipGlyph(chipIcon, iconEnd, children)} />}
    </AriaLink>
  );
  return (
    <>
      {el}
      <ReasonTip reason={disabledReason} shown={soft} id={reasonId} open={reasonOpen} setOpen={setReasonOpen} trigger={elNode} />
    </>
  );
}

// `isPending` is omitted as on Button: pending is spelled `busy`.
export interface IconButtonProps extends Omit<AriaButtonProps, 'children' | 'className' | 'style' | 'aria-label' | 'isPending'> {
  icon: IconName;
  /** Accessible name and tooltip text (a resolved string). */
  label: string;
  /** The tooltip's body in place of `label`, for a button whose tooltip shows more than its name (the IpInfo
   *  details). The accessible name stays `label`; a disabled reason still follows the body. */
  tooltip?: ReactNode;
  /** Keyboard hint shown in the tooltip, e.g. '⌘K' or 'J'. */
  shortcut?: string;
  /** The shortcut for assistive tech ('Control+K'), set on the element (React Aria's Button would drop it). */
  'aria-keyshortcuts'?: string;
  /** `danger` is the old spelling of `tone="danger"` (hub/retired-alias warns). */
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger';
  /** `danger`: the outlined danger look, whatever the variant (an icon button is never the filled one). */
  tone?: ButtonTone;
  size?: ButtonSize;
  tooltipPlacement?: 'top' | 'bottom' | 'start' | 'end';
  className?: string;
  /** Marks a toggled state (aria-pressed). */
  pressed?: boolean;
  /** Why the button is what it is right now (usually why it cannot act): its accessible description and the second sentence of
   *  its tooltip; the name stays `label`. With `isDisabled` the button is soft-disabled (focusable, aria-disabled, no press, the
   *  disabled look), so the reason is reachable by keyboard and screen reader. */
  description?: string;
  /** The canonical name of `description` for why it cannot act; `description` stays as its alias. */
  disabledReason?: string;
  /** A busy pulse in place of the icon, and presses refused. */
  busy?: boolean;
  /** The button element, as well as the kit's own ref (React 19 ref prop). */
  ref?: Ref<HTMLButtonElement>;
  /** A three-dot (more actions) button: the small plate every such button shares, whatever its variant. */
  more?: boolean;
  /** Drawn as the place a drag would drop on (data-drop-target), the look of a kit Tabs drop tab (Board strip New Board). */
  dropTarget?: boolean;
}

/**
 * React Aria's tooltip stops every Escape while it is open (a document capture listener). Inside a drawer
 * or dialog that swallowed the Escape meant for the overlay: here the
 * tooltip closes first, synchronously, so its listener is gone before the key reaches it and the overlay
 * closes on the same press. Outside an overlay the tooltip keeps its own Escape.
 */
function useTooltipEscape() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.closest('[role="dialog"], [role="alertdialog"]')) flushSync(() => setOpen(false));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  return { open, setOpen, ref };
}

export function IconButton({
  icon,
  label,
  tooltip,
  shortcut,
  variant = 'ghost',
  tone,
  size = 'md',
  tooltipPlacement = 'bottom',
  className,
  pressed,
  more,
  dropTarget,
  description: descriptionAlias,
  disabledReason,
  busy,
  ref: callerRef,
  isDisabled,
  'aria-keyshortcuts': keyshortcuts,
  ...rest
}: IconButtonProps) {
  const tip = useTooltipEscape();
  const description = (isDisabled ? disabledReason : undefined) ?? descriptionAlias;
  // Both the tooltip's Escape and a caller reach the element.
  const shared = useCallback(
    (el: HTMLButtonElement | null) => {
      tip.ref.current = el;
      if (typeof callerRef === 'function') return callerRef(el);
      if (callerRef) (callerRef as { current: HTMLButtonElement | null }).current = el;
    },
    [callerRef, tip.ref],
  );
  const keysRef = useKeyshortcuts<HTMLButtonElement>(keyshortcuts, shared);
  const strip = useInButtonStrip();
  const descId = useId();
  const soft = softDisabled(description, isDisabled, busy);
  const { ref } = useSoftDisabled(soft, busy, isDisabled, keysRef, tip.setOpen, { aria: rest['aria-disabled'] });
  return (
    <TooltipTrigger delay={TOOLTIP_DELAY_MS} closeDelay={0} isOpen={tip.open} onOpenChange={tip.setOpen}>
      <AriaButton
        {...rest}
        isDisabled={isDisabled && !busy}
        isPending={busy}
        {...(soft ? softDisabledProps(rest) : {})}
        ref={ref}
        aria-label={label}
        aria-pressed={pressed ?? rest['aria-pressed']}
        data-drop-target={dropTarget || undefined}
        aria-describedby={description ? descId : rest['aria-describedby']}
        className={cx(s.button, s.iconOnly, s[tone === 'danger' ? 'danger' : variant], s[size], isOn(pressed, rest['aria-pressed']) && s.pressed, more && s.more, strip && s.inStrip, className)}
        data-strip={strip ? '' : undefined}
      >
        {busy ? <ButtonSpinner /> : <Icon name={icon} />}
        {description && <span id={descId} className={s.srOnly}>{description}</span>}
      </AriaButton>
      <AriaTooltip placement={tooltipPlacement} offset={6} className={s.tooltip}>
        {tooltip !== undefined ? (
          // The body, then the reason under it in reading order (a column, not beside it in the tooltip's row).
          <span className={s.tipStack}>
            {tooltip}
            {description && <span>{description}</span>}
          </span>
        ) : description ? (
          `${label}. ${description}`
        ) : (
          label
        )}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

/** Is this toggle on? The kit's `pressed` prop decides; without it, a caller's own aria-pressed does (so the attribute
 *  and the pressed look never disagree). "mixed" is not on. */
function isOn(pressed: boolean | undefined, aria: boolean | 'true' | 'false' | 'mixed' | undefined): boolean {
  return pressed ?? (aria === true || aria === 'true');
}
