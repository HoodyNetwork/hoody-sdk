// Storing the remembered Open-with choice: one program per file type on each computer, in the
// encrypted account preference hub_openwith_v1 (account + computer, removed at sign-out). The value's shape, parse and
// types are rememberDoc.ts.
//   - Run in a terminal and folder actions are never stored: rememberable() (plan.ts) decides, asked before every
//     store.
//   - The whole value stays under 16,000 bytes and 48 types; the least recently used type goes first.
//   - A stored choice is only a suggestion: when used it goes through planFor again (the chooser does that), and a
//     template the computer no longer has is said, never run.
import { usePrefUpdate } from '@core';
import { useCallback } from 'react';
import { rememberable } from './plan';
import { REMEMBER_MAX_BYTES, REMEMBER_MAX_TYPES, TYPE, bytesOf, choiceOf, emptyDoc, parseDoc, type RememberDoc } from './rememberDoc';

export { REMEMBER_KEY, REMEMBER_MAX_BYTES, REMEMBER_MAX_TYPES, bytesOf, choiceFor, emptyDoc, parseDoc, typeOf, type Choice, type RememberDoc } from './rememberDoc';

/** May this choice be kept? Only a template or Other command for a file (rememberable), never Run or a folder action. */
export function keepable(c: { p: string; target?: 'file' | 'dir' }): boolean {
  return rememberable(c);
}

/**
 * The value with `type`'s choice set (and used now), then the least recently used types dropped until it holds at
 * most 48 types and 16,000 bytes. null: the choice may not be kept (Run, a folder action, a bad choice or type), or it
 * alone would not fit.
 */
export function remember(d: RememberDoc, type: string, pick: { p: string; target?: 'file' | 'dir'; tpl?: string; text?: string; opens?: 'terminal' | 'screen' }, now: number): RememberDoc | null {
  if (!TYPE.test(type) || !keepable(pick)) return null;
  const c = choiceOf(pick.p === 'tpl' ? { k: 'tpl', id: pick.tpl } : { k: 'cmd', text: pick.text, opens: pick.opens });
  if (!c) return null;
  const t: RememberDoc['t'] = { ...d.t, [type]: { c, u: Math.max(0, Math.floor(now)) } };
  const next: RememberDoc = { v: 1, t };
  // Oldest first out; the type just set is the newest and stays.
  const order = Object.keys(t).filter((k) => k !== type).sort((a, b) => t[a]!.u - t[b]!.u);
  while (Object.keys(t).length > REMEMBER_MAX_TYPES || bytesOf(next) > REMEMBER_MAX_BYTES) {
    const old = order.shift();
    if (old === undefined) return null;
    delete t[old];
  }
  return next;
}

/** The value without `type`'s choice. */
export function forget(d: RememberDoc, type: string): RememberDoc {
  if (!(type in d.t)) return d;
  const t = { ...d.t };
  delete t[type];
  return { v: 1, t };
}

/** The value with `type`'s choice marked used now (it moves to the end of the eviction order). */
export function touch(d: RememberDoc, type: string, now: number): RememberDoc {
  const e = d.t[type];
  return e ? { v: 1, t: { ...d.t, [type]: { c: e.c, u: Math.max(0, Math.floor(now)) } } } : d;
}

/** The remembered choices of one computer, with the store's status (Saving… / Saved / not saved). */
export function useRemembered(computer: string | null) {
  const { value, update, status } = usePrefUpdate<RememberDoc>('hub_openwith_v1', parseDoc, { scope: 'account+computer', keepAtSignOut: false, part: computer ?? '' });
  const doc = computer ? value : emptyDoc();
  const keep = useCallback(
    (type: string, pick: Parameters<typeof remember>[2]): boolean => {
      if (!computer) return false;
      // Checked before the update too, so a choice that may not be kept never starts a write.
      if (!keepable(pick)) return false;
      return update((d) => remember(d, type, pick, Date.now()) ?? d);
    },
    [computer, update],
  );
  const drop = useCallback((type: string): boolean => (computer ? update((d) => forget(d, type)) : false), [computer, update]);
  const used = useCallback((type: string): boolean => (computer ? update((d) => touch(d, type, Date.now())) : false), [computer, update]);
  return { doc, keep, drop, used, status };
}
