// takesText in the terminal: there are no DOM elements, and the window never loses focus to another app the Hub can see.
// useEditing keeps the shared rule's purpose (an arriving gate never takes focus from where the person is working) in its
// safe direction: while the focus is anywhere inside the host it counts as editing, so a gate there never pulls focus; the
// card's own guards (focus on Deny, arming window) still apply when the person moves to it.
import { useCallback, useState } from 'react';
import type * as Web from './takesText';

export const takesText: typeof Web.takesText = () => false;
export const windowLeft: typeof Web.windowLeft = () => false;
export const useEditing: typeof Web.useEditing = () => {
  const [editing, setEditing] = useState(false);
  const onFocus = useCallback(() => setEditing(true), []);
  const onBlur = useCallback(() => setEditing(false), []);
  return { editing, onFocus, onBlur };
};
