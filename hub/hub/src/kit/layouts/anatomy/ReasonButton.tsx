// A disabled action that says why: it stays focusable (aria-disabled), never acts, and shows its reason on focus, hover
// and tap. The reason is also the button's description, so a screen reader hears it with the name. The shown copy is
// drawn in a layer above the page (fixed, kept inside the viewport), so a card that clips its content never cuts it.
// An ActionBar draws one for any action with a `disabledReason`; use it directly only for a button outside an action
// row. (Button's own `disabledReason` shows a tooltip instead; this one also answers a tap.)
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, type ButtonSize } from '../../controls/Button';
import type { PxIconName } from '../../icons';
import s from './anatomy.module.css';

export interface ReasonButtonProps {
  /** Why it cannot be used now ("Stop the computer first"). */
  reason: string;
  /** The visible label. */
  children: string;
  /** The accessible name when it says more than the label. */
  name?: string;
  variant?: 'primary' | 'secondary';
  size?: ButtonSize;
  /** Stable id of the action, for focus to follow it. */
  actionId?: string;
  /** The label is data: shown as written (Button `literal`). */
  literal?: boolean;
  /** The end glyph (Button `chipIcon`), so the disabled button looks as the enabled one does. */
  chipIcon?: PxIconName;
  /** It ends or backs out of the flow: no end glyph (Button `chip={false}`), as the enabled action draws it. */
  dismiss?: boolean;
  /** A press on the disabled action, after its reason shows. The action still never runs: use this only to help the
   *  person see why (scroll the failing fact into view), never to act. */
  onPress?: () => void;
  /** Passed to the inner Button, as Button takes it (a card's fixed width, so the off action keeps its enabled twin's). */
  className?: string;
}

/** How long a hover-shown reason stays after the pointer leaves the button, so the pointer can cross the gap onto it. */
export const REASON_HOVER_GRACE_MS = 300;

export function ReasonButton({ reason, children, name, variant = 'secondary', size = 'md', actionId, literal, chipIcon, dismiss, onPress, className }: ReasonButtonProps) {
  // Focus, hover and a press each keep the reason up on their own; Escape hides it until one of them starts again.
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const shown = focused || hovered || pressed;
  const reasonId = useId();
  // The button and the shown reason are one hover area: React counts the portalled reason as inside the wrapper, so the
  // wrapper's enter and leave cover both. Leaving starts the grace (the pointer crosses the gap), entering cancels it.
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enter = () => {
    clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const leave = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      setHovered(false);
      setPressed(false);
    }, REASON_HOVER_GRACE_MS);
  };
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => {
      const wrap = wrapRef.current;
      const tip = tipRef.current;
      if (!wrap || !tip) return;
      const r = wrap.getBoundingClientRect();
      const gap = 4;
      const edge = 8;
      const left = Math.max(edge, Math.min(r.left, window.innerWidth - tip.offsetWidth - edge));
      const below = r.bottom + gap;
      const top = below + tip.offsetHeight > window.innerHeight - edge ? Math.max(edge, r.top - gap - tip.offsetHeight) : below;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [shown, reason]);
  return (
    <span
      ref={wrapRef}
      className={s.reasonWrap}
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <Button
        variant={variant}
        size={size}
        className={className}
        aria-disabled="true"
        literal={literal}
        {...(dismiss ? { chip: false } : chipIcon ? { chipIcon } : {})}
        aria-label={name}
        aria-describedby={reasonId}
        data-action-id={actionId}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPressed(false);
        }}
        onPress={() => {
          setPressed(true);
          onPress?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && shown) {
            clearTimeout(leaveTimer.current);
            setFocused(false);
            setHovered(false);
            setPressed(false);
          } else e.continuePropagation();
        }}
      >
        {children}
      </Button>
      <span id={reasonId} className={s.reasonHidden}>
        {reason}
      </span>
      {shown &&
        createPortal(
          <span ref={tipRef} className={s.reason} aria-hidden="true" data-hub-reason="">
            {reason}
          </span>,
          document.body,
        )}
    </span>
  );
}
