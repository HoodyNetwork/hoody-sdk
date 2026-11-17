// Jump to's deep index, loaded on the palette's first open (never in boot): one import shared by every open, and a
// failed load is forgotten so the next open tries again. Until it answers, the palette lists pages and commands only.
import type { DeepEntry } from './types';

let loading: Promise<readonly DeepEntry[]> | undefined;

export function loadDeep(): Promise<readonly DeepEntry[]> {
  loading ??= import('virtual:hub-search-index').then(
    (m) => m.DEEP,
    (e: unknown) => {
      loading = undefined;
      throw e;
    },
  );
  return loading;
}
