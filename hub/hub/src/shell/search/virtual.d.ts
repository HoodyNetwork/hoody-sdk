// Jump to's deep index, made by vite.config.mts searchIndexPlugin from the pages' sources (scripts/search-index-gen.ts).
declare module 'virtual:hub-search-index' {
  import type { DeepEntry } from './types';

  export const DEEP: readonly DeepEntry[];
}
