// What the terminal overlays (Popover.term, Menu.term) share about their trigger: the opener given as the trigger's
// press, and React Aria's placement words as a side and an alignment. Pure React; no document, no terminal.
import { cloneElement, isValidElement, type ReactElement } from 'react';

export type Side = 'bottom' | 'top' | 'start' | 'end';
export type Placement = 'bottom start' | 'bottom end' | 'bottom' | 'top' | 'top start' | 'top end' | 'start' | 'end';

/** React Aria placement → side and alignment ('bottom' alone is centred, as React Aria centres it). */
export function sideOf(placement: Placement): { side: Side; align: 'start' | 'end' | 'center' } {
  const [a, b] = placement.split(' ') as [string, string | undefined];
  const side: Side = a === 'top' ? 'top' : a === 'start' ? 'start' : a === 'end' ? 'end' : 'bottom';
  const align = b === 'end' ? 'end' : b === 'start' ? 'start' : side === 'bottom' || side === 'top' ? 'center' : 'start';
  return { side, align };
}

/** The trigger with the opener as its press (the trigger's own onPress runs first, as a PressResponder chains). */
export function withPress(trigger: ReactElement, open: () => void): ReactElement {
  if (!isValidElement<{ onPress?: (e: unknown) => void }>(trigger)) return trigger;
  const own = trigger.props.onPress;
  return cloneElement(trigger as ReactElement<{ onPress?: (e: unknown) => void }>, { onPress: (e: unknown) => { own?.(e); open(); } });
}
