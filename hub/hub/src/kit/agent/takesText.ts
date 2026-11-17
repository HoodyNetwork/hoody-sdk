import { useEffect, useState, type FocusEvent, type RefObject } from 'react';

// Whether focus is in a field that takes typed text (the shared focus rule): a host whose arriving gate card would take focus
// counts focus on such a field as typing, so a gate never takes focus from a field and turns the next key into a decision.
// The AI tab's ConversationView and the Board's conversation tile read this one rule.
const EDITABLE = 'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea, select';
/** Whether a focused element takes typed text: a text field, or any editing host (contenteditable true, "", plaintext-only,
 *  or inside one), judged by what the browser says is editable and, where it cannot say, by the attribute. */
export function takesText(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.matches(EDITABLE) || el.isContentEditable) return true;
  const host = el.closest('[contenteditable]');
  return !!host && host.getAttribute('contenteditable')?.toLowerCase() !== 'false';
}

/** Whether the window itself has lost focus (another app, tab or window): a blur then is not the person leaving the field,
 *  since the browser gives focus back to the same element on return. jsdom always reports focus. */
export function windowLeft(): boolean {
  return typeof document !== 'undefined' && !document.hasFocus();
}

/** A host's editing flag (the rule above): focus on a field that takes text inside root. A blur while the window loses
 *  focus keeps it, so a gate arriving while the person is away never takes focus from their field and turns the first key
 *  typed on return into a decision. When the window comes back, the flag is read again from where focus really is (after
 *  the browser restores it), so it never stays set for a field that has gone or that focus did not return to. */
export function useEditing(root: RefObject<HTMLElement | null>): { editing: boolean; onFocus: (e: FocusEvent) => void; onBlur: () => void } {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const back = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const on = document.activeElement;
        setEditing(!!root.current && root.current.contains(on) && takesText(on));
      }, 0);
    };
    window.addEventListener('focus', back);
    return () => {
      window.removeEventListener('focus', back);
      clearTimeout(timer);
    };
  }, [root]);
  return {
    editing,
    onFocus: (e) => setEditing(takesText(e.target)),
    onBlur: () => { if (!windowLeft()) setEditing(false); },
  };
}
