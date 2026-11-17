// The focus of the picker's own-control forms (BrowserForm, SshForm): a render never moves the focus
// from the person.
//   - The form's first enabled control takes it when the form mounts, if `mayFocus` allows (the Picker's opening(): its
//     step just opened, the focus was lost in the panel, or it is parked on the title; absent, always). A form that comes
//     back in its step (after a notice, a read, the full card) so never takes a crumb, the title or an overlay the person
//     focused meanwhile. The ref changes only with `mayFocus` (per step), never per render: an inline ref runs again on
//     every render.
//   - The form holds it while one of its controls has it. When that control goes away while the form stays open (its
//     own press replaced it, as Check again by its outcome, or a busy start disabled it) the focus is left on the page;
//     the next render gives it back to the first enabled control (once one is).
//   - A focus the person moved elsewhere (a crumb, the title, a click on the page) is never taken back: a blur to
//     another element, or to nothing from a control that is still there and enabled, ends the hold.
import { useCallback, useLayoutEffect, useRef, type FocusEvent } from 'react';

// The first enabled control (a disabled one cannot take the focus; while all are disabled nothing takes it).
const focusFirst = (el: HTMLFormElement | null): void => {
  if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus();
};

// The control lost the focus because the app took it away, not the person: it left the page, or it turned disabled
// (a browser drops the focus of a disabled control; an aria-disabled one keeps it, so its blur is the person's).
const takenAway = (el: Element): boolean => !el.isConnected || (el as HTMLButtonElement).disabled === true;

export interface FormFocus {
  ref: (el: HTMLFormElement | null) => void;
  onFocus: () => void;
  onBlur: (e: FocusEvent<HTMLFormElement>) => void;
}

export function useFormFocus(mayFocus?: () => boolean): FormFocus {
  const form = useRef<HTMLFormElement | null>(null);
  const held = useRef(false);
  const ref = useCallback((el: HTMLFormElement | null) => {
    form.current = el;
    if (el && (!mayFocus || mayFocus())) focusFirst(el);
  }, [mayFocus]);
  const onFocus = useCallback(() => { held.current = true; }, []);
  const onBlur = useCallback((e: FocusEvent<HTMLFormElement>) => {
    const to = e.relatedTarget;
    held.current = to instanceof Node ? !!form.current?.contains(to) : takenAway(e.target);
  }, []);
  useLayoutEffect(() => {
    const on = document.activeElement;
    if (held.current && (on === null || on === document.body)) focusFirst(form.current);
  });
  return { ref, onFocus, onBlur };
}
