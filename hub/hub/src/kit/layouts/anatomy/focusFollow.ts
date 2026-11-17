// Focus follows an action that the anatomy re-draws somewhere else (the head's primary moving into the empty state, a
// section's primary moving onto a group's first-use card). The control is a new element with the same key; when the old
// one took focus with it out of the DOM, the new one gets it. A user who had moved on keeps their place.
//
// An action's key names its section too, since two sections may both have an `add` primary: inside a section it is the
// pair (section id, action id), and the first-use card draws each section's primary with that same key. The pair is
// length-prefixed (`<section id length>:<section id>:<action id>`), so no two pairs share a key (a joined `a::b` + `c`
// and `a` + `b::c` did: two different pairs made one key). It keeps to the ids' own characters plus digits and `:`, as the
// card's ids also name its menu items. The card's own actions get `-:<id>` (cardOwnId), outside that key space.
import { useLayoutEffect, useRef, type FocusEvent } from 'react';
import { cardActionId } from './focusFollow.pure';

export { cardActionId, cardOwnId } from './focusFollow.pure';

function keyOf(el: Element): string | null {
  const id = el.getAttribute('data-action-id');
  if (id === null) return null;
  const section = el.parentElement?.closest('[data-hub-section][id]');
  return section ? cardActionId(section.id, id) : id;
}

export function useFocusFollow(trigger: unknown) {
  const last = useRef<string | null>(null);
  const root = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const key = last.current;
    const el = root.current;
    if (key === null || !el) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const actions = [...el.querySelectorAll<HTMLElement>('[data-action-id]')];
    // The same action when it is drawn; else the first action here (a primary folded into ⋯ has no control of its own).
    (actions.find((a) => keyOf(a) === key) ?? actions[0])?.focus();
  }, [trigger]);
  return {
    root,
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const action = (e.target as HTMLElement).closest('[data-action-id]');
      last.current = action ? keyOf(action) : null;
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      // Focus went to another element or to the document (a click on empty space): the user moved
      // on, so a later re-draw does not take focus back, even one in the same task. When the window loses focus the
      // control stays the document's active element and keeps its place. A removal by React keeps it too: React does not
      // dispatch events during its commit. Limit: a removal by other code that blurs first (Chromium) forgets it.
      if (document.activeElement !== e.target) last.current = null;
    },
  };
}
