// The description box of New script (the steps flow, new/StepWhat.tsx) takes the focus with the caret after its last character: when the flow opens on
// Describe it, and after an example or a more idea adds words (then on the next frame, since the box may mount with that
// change, scrolled to its end). Web: the textarea itself. The terminal sibling (describeFocus.term.ts) has no DOM
// textarea and no animation frame: it focuses the field through its handle, a turn later.

/** Focus the description box (`field()` read when it runs) with the caret at `at` (its value's length when omitted).
 *  `later`: on the next frame, scrolled to its end. */
export function focusDescriptionEnd(field: () => HTMLTextAreaElement | null, o: { at?: number; later: boolean }): void {
  const run = () => {
    const el = field();
    if (!el) return;
    const at = o.at ?? el.value.length;
    el.focus({ preventScroll: true });
    el.setSelectionRange(at, at);
    if (o.later) el.scrollTop = el.scrollHeight;
  };
  if (o.later) requestAnimationFrame(run);
  else run();
}
