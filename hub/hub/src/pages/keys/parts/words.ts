// Words the keys page picks from its strings by a code, a right's path or a template name. The strings are
// typed, so a lookup by a runtime value goes through one checked cast here.

import { composing } from './words.pure';
import type { KeyLike } from './words.pure';
export { maybe, rightName, groupName, tmplName, accessText, accessChoice, realmName, worksText, outcomeText, deleteMadeText, stopScope, dayUtc, localTime, composing } from './words.pure';
export type { Str, K, T } from './words.pure';

/**
 * Enter in a text field (or Ctrl/Cmd+Enter anywhere) submits a drawer form whose button sits in the footer:
 * the browser only submits on its own when the button is inside the form. Enter in a search box searches; it never
 * makes the key. A field with its own Enter (the realm id field adds the realm) stops the key press itself. An Enter
 * that confirms an input method's composition is the input method's: never a send.
 */
export function enterSubmits(submit: () => void) {
  return (e: KeyLike & { target: EventTarget; preventDefault: () => void }) => {
    if (e.key !== "Enter" || composing(e)) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    const plain =
      !!el &&
      el.tagName === "INPUT" &&
      !/^(checkbox|radio|button|search)$/.test((el as HTMLInputElement).type);
    if (!(plain || e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    submit();
  };
}
