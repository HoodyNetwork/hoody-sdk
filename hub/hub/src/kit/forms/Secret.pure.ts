// The pure parts of the secret fields (Secret.tsx on the web, Secret.term.tsx in the terminal): holding a page string,
// dropping a held secret on unmount, the masked forms, and the multiline secret's view/edit mapping. No DOM.
import { useEffect, useRef } from 'react';
import type { Ctx, HeldSecret } from '@core';

/** Drop `held` when the component really unmounts (deferred, so StrictMode's re-run keeps it). */
export function useDropOnUnmount(held: HeldSecret | null): void {
  const pending = useRef<{ id: ReturnType<typeof setTimeout>; held: HeldSecret } | null>(null);
  useEffect(() => {
    // StrictMode re-runs the effect for the same secret: keep it. A replaced secret still goes.
    if (pending.current?.held === held) {
      clearTimeout(pending.current.id);
      pending.current = null;
    }
    return () => {
      if (held) pending.current = { id: setTimeout(() => held.drop(), 0), held };
    };
  }, [held]);
}

/**
 * Without a core session (the kit gallery, a page test without core booted) a page string is held
 * here: the same drop contract, minus core's context-end signal (route, page hide, resetKey and
 * unmount still wipe it).
 */
export function localHold(value: string): HeldSecret {
  let secret: string | null = value;
  const listeners = new Set<() => void>();
  const drop = () => {
    if (secret === null) return;
    secret = null;
    for (const l of [...listeners]) l();
    listeners.clear();
  };
  return Object.freeze({
    ctx: null as unknown as Ctx,
    reveal: () => secret,
    drop,
    get dropped() {
      return secret === null;
    },
    onDrop(fn: () => void) {
      if (secret === null) {
        fn();
        return () => undefined;
      }
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  });
}

export const BULLETS_MIN = 12;
export const BULLETS_MAX = 32;
/** A masked list item: the same width whatever the code, so nothing about it shows. Eight bullets, written out: a
 *  call at load would make this module impure (kitpure). */
export const ITEM_MASK = '••••••••';

export function bullets(n: number): string {
  return '•'.repeat(Math.min(BULLETS_MAX, Math.max(BULLETS_MIN, n)));
}

/**
 * What a multiline secret field shows for `value`: while hidden one bullet per character (code point) and the line ends;
 * shown, the value itself. A CR LF pair or a lone CR shows as one LF, as a textarea holds only LF. `at[i]` is where the shown
 * UTF-16 unit i starts in the value (`at[text.length]` is the value's length), so an edit of the shown text maps onto the value.
 */
export function secretView(value: string, hidden: boolean): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  let i = 0;
  while (i < value.length) {
    const cp = value.codePointAt(i) as number;
    const len = cp > 0xffff ? 2 : 1;
    if (value[i] === '\r') {
      at.push(i);
      text += '\n';
      i += value[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const shown = value[i] === '\n' ? '\n' : hidden ? '\u2022' : value.slice(i, i + len);
    for (let k = 0; k < shown.length; k++) at.push(i + Math.min(k, len - 1));
    text += shown;
    i += len;
  }
  at.push(value.length);
  return { text, at };
}

/**
 * The value after the shown range [start, end) is replaced by `text`, which goes in as it is (a paste keeps its CR LF).
 * Returns the value and where the caret goes in the text the field then shows.
 */
export function secretSplice(value: string, hidden: boolean, start: number, end: number, text: string): { value: string; caret: number } {
  const { at } = secretView(value, hidden);
  const last = at.length - 1;
  const lo = Math.max(0, Math.min(start, end, last));
  const head = joinLines(value.slice(0, at[lo]), text);
  return { value: joinLines(head, value.slice(at[Math.max(lo, Math.min(end, last))])), caret: secretView(head, hidden).text.length };
}

/**
 * left + right, where lone CRs ending `left` would pair with an LF starting `right` into one CR LF line end (two line ends
 * becoming one): those CRs become LFs, so every line end stays one and the shown text keeps its length.
 */
function joinLines(left: string, right: string): string {
  // The whole run of lone CRs goes: turning only the last one into LF would pair the one before it with that LF.
  return right.startsWith('\n') ? left.replace(/\r+$/, (run) => '\n'.repeat(run.length)) + right : left + right;
}

/**
 * Shown only: the value after the browser edited the field's text into `next`, leaving the caret at `caret`. `before` is the
 * selection when the edit began (from beforeinput): the edit starts no later than it, so a character replaced by the same
 * character is still replaced, and a replaced CR LF goes. Everything after the caret was there before the edit (checked, so
 * any edit maps right: at worst more of `next` is taken, its line ends as the field shows them).
 */
export function secretEdit(value: string, next: string, caret: number, before: { start: number; end: number } | null): { value: string; caret: number } {
  const { text: old, at } = secretView(value, false);
  let a = 0;
  const maxA = Math.min(old.length, next.length);
  while (a < maxA && old[a] === next[a]) a++;
  a = Math.min(a, caret, before ? before.start : a);
  let keep = Math.min(next.length - caret, old.length - a);
  while (keep > 0 && old.slice(old.length - keep) !== next.slice(next.length - keep)) keep--;
  const head = joinLines(value.slice(0, at[a]), next.slice(a, next.length - keep));
  // The value now shows as `next`, so the browser's caret stands as it is.
  return { value: joinLines(head, value.slice(at[old.length - keep])), caret };
}
