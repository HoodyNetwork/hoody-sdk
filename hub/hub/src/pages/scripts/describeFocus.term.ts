// The description's focus in the terminal: the field handle (kit TextField inputRef) takes the focus and the caret goes
// to `at`, else after the last character, as on the web. A turn later after an example (the words are set first); no
// animation frame and no DOM search (the terminal Hub has neither).
import type * as Web from './describeFocus';

export const focusDescriptionEnd: typeof Web.focusDescriptionEnd = (field, o) => {
  const run = () => {
    const el = field();
    if (!el) return;
    el.focus();
    const at = o.at ?? el.value.length;
    el.setSelectionRange(at, at);
  };
  if (o.later) setTimeout(run, 0); else run();
};
