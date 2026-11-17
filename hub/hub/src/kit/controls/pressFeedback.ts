// Press and hold feedback for a header that drags its card (PressFeedback.module.css says what each state draws).
import type { CSSProperties } from 'react';
import s from './PressFeedback.module.css';

/** 'press': a mouse or pen holds the header (or a touch hold completed); 'hold': a touch press is filling its hold. */
export type PressState = 'press' | 'hold';

/** How long a touch press is held before it takes the header (ms): the owner's hold timer waits this long, and the
 *  hold bar fills over the same time. */
export const PRESS_HOLD_MS = 400;

/** The classes for the card (`card`, the ring) and its header (`head` and `headStyle`, the fill or the hold bar) in a
 *  press state; none when not pressed. The header is a direct child of the card; the owner positions both (the ring
 *  and the bar are absolute inside them). */
export function pressClasses(state: PressState | null | undefined): { card?: string; head?: string; headStyle?: CSSProperties } {
  if (state === 'press') return { card: s.pressed, head: s.pressedHead };
  if (state === 'hold') return { head: s.holdHead, headStyle: { '--press-hold': `${PRESS_HOLD_MS}ms` } as CSSProperties };
  return {};
}
