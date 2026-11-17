// The key inspector's state tones and lineage type (split out of KeyInspector.tsx so the terminal build shares them;
// KeyInspector.tsx re-exports both).
import type { Tone } from '@kit';
import type { Key } from '../types';

/** Who made a key and which keys it made: `parent` when the maker is in the list read, `parentHidden` when the
 *  key names a maker the list does not show (another realm's view, or deleted). */
export interface Lineage {
  parent: Key | null;
  parentHidden: boolean;
  children: Key[];
}

export const STATE_TONE: Record<Key["state"], Tone> = {
  active: "ok",
  paused: "neutral",
  expired: "warn",
};
