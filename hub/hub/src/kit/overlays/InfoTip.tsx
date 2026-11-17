// InfoTip: the one "what is this" affordance, for one or two plain sentences about a label or a term. Use Tooltip
// instead for a control's name or shortcut (hover only, never tapped), and Why for an explanation that stays in the page.
//   Icon form: a small info glyph after a label, in a 24 px box (--touch-min on a coarse pointer).
//   Term form (children): the visible words are the trigger, with a dotted underline ("7 tools", "Critical").
//   Press, tap, Enter or Space toggles a non-modal popover; a mouse also opens it after 400 ms of hover. Escape or an
//   outside press closes it and focus stays on the trigger. One InfoTip is open at a time. The popover is a
//   role="dialog" labelled by the trigger, with no focus trap and no focus move; while it is open its text is the
//   trigger's aria-describedby. Placement is logical: `end`, else `bottom` (always `bottom` below 600 px), clamped 8 px
//   inside the viewport.
import { type KeyboardEvent, type PointerEvent, type ReactNode, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Popover as AriaPopover, useLocale } from 'react-aria-components';
import { cx } from '../controls/Button';
import { Link } from '../controls/Link';
import { Icon } from '../icons';
import { FaqLink, type FaqItem } from '../layouts/Faq';
import { useStrings } from '../strings';
import { useIsPhone } from './shared';
import strings from './InfoTip.strings.en.json';
import s from './InfoTip.module.css';

export interface InfoTipProps {
  /** One or two plain sentences, at most 200 characters (a dev assertion). */
  text: string;
  /** What it explains, for the button's name: "About Default". An empty subject names it "More information". */
  subject: string;
  /** Optional deeper answer: the page FAQ item (the kit FaqLink). */
  faq?: { item: FaqItem; label: string };
  /** Term form: the visible words become the trigger (dotted underline): "7 tools", "Critical", "3 days ago". */
  children?: ReactNode;
  /** Term form only: the trigger's name where its visible words say too little alone ("1/5" is "1 of 5 realms in use"). */
  name?: string;
  /** Optional one place to go, after the text: a Hub route or an absolute https address. `onPress` runs as it is followed. */
  link?: { href: string; label: string; onPress?: () => void };
}

/** The longest text an InfoTip takes. */
export const INFO_TIP_MAX = 200;
/** A mouse resting on the trigger opens the tip after this long (the kit Tooltip's delay). */
const HOVER_MS = 400;
/** A hover-opened tip waits this long after the pointer leaves, so the pointer can cross into the popover. */
const LEAVE_MS = 150;
/** The popover's widest inline size in px; equals `--tip-max-w` in InfoTip.module.css. */
const TIP_MAX_W = 280;
/** The viewport inset the popover keeps, in px. */
const EDGE = 8;

type Mode = 'press' | 'hover';

/** The open InfoTip, if any: opening another closes it (one at a time). */
let current: { close: () => void } | null = null;

/** The plain words of a label, for an InfoTip subject ("" when the label is not plain text). */
export function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return '';
}

export function InfoTip({ text, subject, faq, children, name: termName, link }: InfoTipProps) {
  if (import.meta.env.DEV && text.length > INFO_TIP_MAX) {
    throw new Error(`hub InfoTip: the text for "${subject}" is ${text.length} characters; an InfoTip takes at most ${INFO_TIP_MAX}`);
  }
  const t = useStrings(strings);
  const isPhone = useIsPhone();
  const { direction } = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [placement, setPlacement] = useState<'end' | 'bottom'>('end');
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const self = useRef({ close: () => setMode(null) });
  const triggerId = useId();
  const popId = useId();
  const textId = useId();
  const open = mode !== null;
  const term = children !== undefined && children !== null;

  const clearTimers = () => {
    clearTimeout(hoverTimer.current);
    clearTimeout(leaveTimer.current);
  };
  const show = (m: Mode) => {
    clearTimers();
    if (current && current !== self.current) current.close();
    current = self.current;
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const room = direction === 'rtl' ? r.left : window.innerWidth - r.right;
      setPlacement(!isPhone && room >= TIP_MAX_W + 2 * EDGE ? 'end' : 'bottom');
    }
    setMode(m);
  };
  const hide = (refocus: boolean) => {
    clearTimers();
    if (current === self.current) current = null;
    setMode(null);
    if (refocus) triggerRef.current?.focus();
  };

  // An element outside this tip: not its trigger or popover, and not inside another overlay this tip does not sit in
  // (a FaqLink peek opened from the popover is a layer above it, not an outside press).
  const outside = (el: Element | null) => {
    if (!el || triggerRef.current?.contains(el) || popRef.current?.contains(el)) return false;
    const layer = el.closest('[role="dialog"], [role="alertdialog"]');
    return !layer || layer.contains(triggerRef.current);
  };
  // Focus that belongs to this tip: on the trigger or inside the popover. Nowhere (the document body) counts only for a
  // tip opened or pinned by a press on its trigger, where focus was; a hover-opened tip moves focus onto the trigger only
  // when focus is inside its popover.
  const focusHere = () => {
    const a = document.activeElement;
    if (!a || a === document.body) return mode === 'press';
    return a === triggerRef.current || Boolean(popRef.current?.contains(a));
  };
  // A layer above this tip owns focus: focus is in a dialog that does not hold the trigger (a FaqLink peek opened from
  // the popover). Escape then belongs to that layer.
  const higherOwnsFocus = () => {
    const a = document.activeElement;
    if (!a || a === document.body || popRef.current?.contains(a)) return false;
    const layer = a.closest('[role="dialog"], [role="alertdialog"]');
    return Boolean(layer && !layer.contains(triggerRef.current));
  };

  const onKey = (e: globalThis.KeyboardEvent) => {
    if (e.key === 'Escape' && !higherOwnsFocus()) {
      // One Escape closes one layer: the open tip, wherever focus is below it (a hover-opened tip leaves focus in
      // another field), and the dialog or drawer under the tip stays open. Focus moves back to the trigger only
      // when it was the tip's own.
      e.preventDefault();
      e.stopPropagation();
      hide(focusHere());
    } else if (e.key === 'Tab' && e.target instanceof Node && popRef.current?.contains(e.target)) {
      // The popover is portalled: leaving it returns to the trigger's place in the page order. Shift+Tab lands on the
      // trigger; Tab goes on from the trigger to whatever follows it.
      e.stopPropagation();
      if (e.shiftKey) e.preventDefault();
      hide(true);
    }
  };
  const onDown = (e: globalThis.PointerEvent) => {
    if (!outside(e.target instanceof Element ? e.target : null)) return;
    const held = focusHere();
    hide(false);
    // A press on nothing focusable leaves focus on the trigger, not on the page body.
    if (held)
      setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body) triggerRef.current?.focus();
      }, 0);
  };
  // The listeners are added when the tip opens and removed when it closes, never on a render in between (a parent's
  // live counter would otherwise take them off and put them back each time). They call through this ref, so they
  // always act on the current mode.
  const live = useRef({ onKey, onDown });
  live.current = { onKey, onDown };
  useEffect(() => {
    if (!open) return;
    // On the window, in capture, so it runs before React Aria's own focus-scope Tab handling on the document.
    const key = (e: globalThis.KeyboardEvent) => live.current.onKey(e);
    const down = (e: globalThis.PointerEvent) => live.current.onDown(e);
    window.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', down, true);
    };
  }, [open]);

  useEffect(
    () => () => {
      clearTimers();
      if (current === self.current) current = null;
    },
    [],
  );

  const onPress = () => {
    // A press on a hover-opened tip keeps it open (pinned); a press on a pinned one closes it.
    if (mode === 'press') hide(false);
    else show('press');
  };
  const onPointerEnter = (e: PointerEvent) => {
    clearTimeout(leaveTimer.current);
    if (e.pointerType !== 'mouse' || open) return;
    hoverTimer.current = setTimeout(() => show('hover'), HOVER_MS);
  };
  const onPointerLeave = () => {
    clearTimeout(hoverTimer.current);
    if (mode === 'hover') leaveTimer.current = setTimeout(() => hide(false), LEAVE_MS);
  };
  // The popover is portalled, so Tab from the trigger steps into it (the FAQ link); leaving it is handled in onKey.
  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.shiftKey || !open) return;
    const first = popRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])');
    if (!first) return;
    e.preventDefault();
    first.focus();
  };
  const name = term ? termName : subject ? t('info.about', { subject }) : t('info.more');
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        className={cx(term ? s.term : s.icon, open && !term && s.open)}
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-describedby={open ? textId : undefined}
        onClick={onPress}
        onKeyDown={onTriggerKey}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        {term ? children : <Icon name="info" size="sm" />}
      </button>
      <AriaPopover
        ref={popRef}
        triggerRef={triggerRef}
        isOpen={open}
        onOpenChange={(o) => {
          if (!o) hide(false);
        }}
        isNonModal
        shouldCloseOnInteractOutside={outside}
        placement={placement}
        offset={EDGE}
        containerPadding={EDGE}
        className={s.pop}
      >
        <div role="dialog" id={popId} aria-labelledby={triggerId} className={s.body} onPointerEnter={() => clearTimeout(leaveTimer.current)} onPointerLeave={onPointerLeave}>
          <p id={textId} className={s.text}>
            {text}
          </p>
          {link && (
            <p className={s.faq}>
              <Link href={link.href} variant="inline" onPress={link.onPress}>
                {link.label}
              </Link>
            </p>
          )}
          {faq && (
            <p className={s.faq}>
              <FaqLink item={faq.item}>{faq.label}</FaqLink>
            </p>
          )}
        </div>
      </AriaPopover>
    </>
  );
}

export interface InfoLineProps {
  /** The InfoTip text; without it the label renders alone, exactly as before. */
  tip?: string;
  /** The InfoTip subject (the label's words). */
  subject: string;
  children: ReactNode;
}

/** Kit-internal: a label followed by its icon-form InfoTip on one line. No tip, no wrapper: the label's markup is unchanged. */
export function InfoLine({ tip, subject, children }: InfoLineProps) {
  if (!tip) return <>{children}</>;
  return (
    <span className={s.line}>
      {children}
      <InfoTip text={tip} subject={subject} />
    </span>
  );
}
