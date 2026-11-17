// searchPresence: whether the screen holds a search field `/` can reach. The kit's SearchField (kit/forms/fields.term)
// reports each mounted field; the `?` sheet and the other key lists (shell/shortcuts.term.ts) leave the `/` row out
// while there is none, so the sheet never offers a key that only answers "This page has no search field".
import { useSyncExternalStore } from 'react';

let mounted = 0;
const listeners = new Set<() => void>();
const emit = (): void => { for (const l of [...listeners]) l(); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const present = (): boolean => mounted > 0;

/** A search field is on screen from now until the returned function runs (an effect's cleanup). */
export function searchFieldMounted(): () => void {
  mounted++;
  emit();
  let done = false;
  return () => { if (done) return; done = true; mounted--; emit(); };
}

/** True while at least one search field is mounted. */
export function useSearchFieldPresent(): boolean { return useSyncExternalStore(subscribe, present, present); }
