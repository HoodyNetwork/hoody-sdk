// focusOnMount.ts: the first focus of the one-file Hub's screens without the `autoFocus` attribute (jsx-a11y/no-autofocus;
// the web Hub's pages also take a first focus with a ref, never the attribute).
//
// Contract (the same as autoFocus):
//   - The element is focused once, when React attaches it (a field shown, or shown again after another step), and only
//     if `on` holds then. A later change of `on`, or a re-render that re-attaches the same element (the kit TextField
//     hands its input through useImperativeHandle on every commit), focuses nothing.
//   - A ref pointing at an input or textarea focuses it; any other element (the wrapper of a kit SecretInput, which has
//     no input ref) focuses its first input or textarea.
//   - `keep`, when given, always holds the attached element (or null), for the refusal refocus of the same field.
import { useCallback, useRef, type RefCallback, type RefObject } from 'react';

export function useFocusOnMount<T extends HTMLElement>(on: boolean, keep?: RefObject<T | null>): RefCallback<T> {
  const seen = useRef<T | null>(null);
  return useCallback(
    (el: T | null) => {
      if (keep) keep.current = el;
      if (!el || el === seen.current) return;
      seen.current = el;
      if (!on) return;
      const target = el.matches('input, textarea') ? el : el.querySelector<HTMLElement>('input, textarea');
      target?.focus();
    },
    [on, keep],
  );
}
