// A press on a disabled <button> must not cost the next one. A disabled button gets no click, but browsers still send it
// the pointer press. React Aria opens a press on that pointerdown and closes it only at the click, so the first click
// after the button enabled (with no press anywhere else in between) would start no press and be dropped. Every kit
// control that renders a React Aria button which can be disabled and later enabled in place takes this ref.
import { type Ref, type RefCallback, useCallback } from 'react';

/** What starts a press in React Aria (pointer, or mouse and touch where there are no pointer events). */
const PRESS_STARTS = ['pointerdown', 'mousedown', 'touchstart'] as const;

/**
 * Keeps the start of a press from reaching React while `node` is a disabled <button>; returns the undo. The disabled
 * state is read at the event, so it follows whatever disables the button (a prop, a form lock, a stepper at its limit).
 * The listeners are on the button in the capture phase, so a press on its children is stopped too; listeners on the
 * document (a press outside a popover) and React capture handlers on ancestors still see it. Any other element is left
 * alone: a soft-disabled control (aria-disabled) and a link still get their click, which closes the press.
 */
export function stopDisabledPress(node: Element): () => void {
  if (!(node instanceof HTMLButtonElement)) return () => undefined;
  const stop = (e: Event) => {
    if (node.disabled) e.stopPropagation();
  };
  for (const type of PRESS_STARTS) node.addEventListener(type, stop, true);
  return () => {
    for (const type of PRESS_STARTS) node.removeEventListener(type, stop, true);
  };
}

const setRef = <T,>(ref: Ref<T> | undefined, node: T | null): ReturnType<RefCallback<T>> => {
  if (typeof ref === 'function') return ref(node);
  if (ref) (ref as { current: T | null }).current = node;
};

/**
 * The ref for a React Aria button that can be disabled: stopDisabledPress for as long as the element is attached (bound
 * to the element itself, so a new element under the same component is covered). Pass the element's other ref (`other`);
 * it gets the element as before, and a callback ref's returned cleanup is kept.
 */
export function useDisabledPressRef<T extends Element>(other?: Ref<T>): RefCallback<T> {
  return useCallback(
    (node: T | null) => {
      const undoOther = setRef(other, node);
      if (!node) return undoOther;
      const undoPress = stopDisabledPress(node);
      return () => {
        undoPress();
        if (typeof undoOther === 'function') undoOther();
        else setRef(other, null);
      };
    },
    [other],
  );
}
