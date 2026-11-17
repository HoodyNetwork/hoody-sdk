// Whether the reads on screen agree on which VM holds the name a VM's screen shows.
// Every change of a VM is sent by name. When the VM's own read failed or answers "not there" while an older answer is
// still shown, or the list gives the name to another VM, a change would reach whatever holds the name by then.
//
// Contract:
//   - The VM's screen states it with useMarkVmUnsure(computer id, VM name, unsure). Only a render that is put on screen
//     states anything: a render that is thrown away (StrictMode's second render, a suspended or abandoned one) writes
//     nothing. The statement is in place before any layout or passive effect of that same commit runs, so no handler
//     can run on an older answer. Each screen owns its own statement: it is removed when that screen goes or says
//     "sure", and never removes another screen's, whatever computer and name the other one names.
//   - A tab reads it two ways, both by the VM's name alone:
//       useVmUnsure(name)  at render: true while no change may be sent. Use it to switch every changing control off
//                          (soft-disabled, with the reason string `power.why.unread`).
//       isVmUnsure(name)   at send time, inside every send and confirm handler, right before the request: refuse
//                          while true. This is the one that must never be skipped.
//     Both answer true when ANY screen holds that name unsure, on any computer (they fail closed; one VM screen is
//     shown at a time). Reading stays available.
import { useInsertionEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

/** The screens that say "unsure" now, each by its own owner token, with the computer and name it says it for. */
const stated = new Map<object, string>();
const listeners = new Set<() => void>();
const keyOf = (computer: string, name: string): string => `${computer}\n${name}`;
const tell = (): void => { for (const l of listeners) l(); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while no change of a VM shown under `name` may be sent. Ask at send time, right before the request. */
export function isVmUnsure(name: string): boolean {
  const end = `\n${name}`;
  for (const k of stated.values()) if (k.endsWith(end)) return true;
  return false;
}

/** isVmUnsure(name) for render: follows the VM's screen. */
export function useVmUnsure(name: string): boolean {
  return useSyncExternalStore(subscribe, () => isVmUnsure(name));
}

/** The VM's screen (only it) states whether a change of this VM may be sent now. `computer` null: no computer. */
export function useMarkVmUnsure(computer: string | null, name: string, value: boolean): void {
  const [owner] = useState(() => ({}));
  const key = keyOf(computer ?? '', name);
  // Written when the render is committed, in the commit's first step: every layout and passive effect of the commit,
  // the children's included, already reads it. Removed only as this screen's own statement.
  useInsertionEffect(() => {
    if (!value) return undefined;
    stated.set(owner, key);
    return () => { if (stated.get(owner) === key) stated.delete(owner); };
  }, [owner, key, value]);
  // Readers elsewhere on the page hear of it once it is on screen, and again when it goes.
  useLayoutEffect(() => { tell(); return tell; }, [key, value]);
}
