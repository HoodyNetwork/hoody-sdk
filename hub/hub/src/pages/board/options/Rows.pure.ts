// The options rows' strings helpers (split out of Rows.tsx so the terminal build shares them; Rows.tsx re-exports every name).
import { useStrings, type StringVars } from '@kit';
import strings from './strings.en.json';

/** String lookup by a key built at run time (row keys come from model.ts; model.test.ts proves they exist). */
export type TT = (key: string, vars?: StringVars) => string;
/** The strings table has this key (optional help and placeholder lines). */
export const hasKey = (k: string): boolean => Object.prototype.hasOwnProperty.call(strings, k);

export function useT(): TT {
  const t = useStrings(strings);
  return (key, vars) => t(key as never, vars);
}
