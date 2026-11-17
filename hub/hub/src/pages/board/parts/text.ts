// The page's translator with keys built at run time (program.<name>, layout.<preset>, key.<side>…). Every such key
// family is checked against strings.en.json by text.test.ts, so a built key never falls through to its raw name.
import { useStrings, type StringVars } from '@kit';
import strings from '../strings.en.json';

export type T = (key: string, vars?: StringVars) => string;

export function useT(): T {
  return useStrings(strings) as unknown as T;
}
