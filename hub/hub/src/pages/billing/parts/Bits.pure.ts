// The billing page's words-as-text helper and its translate type (split out of Bits.tsx so the terminal build shares
// them; Bits.tsx re-exports both).
import type { Translate } from '@kit';
import type strings from '../strings.en.json';
import type { Word } from '../types';

export type T = Translate<typeof strings>;

/** A word (key + values) as text. */
export const say = (t: T, w: Word): string => t(w.k, w.v);
