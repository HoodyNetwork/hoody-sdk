// The broadcast's translator (keys built at run time: error.<code>, end.<reason>, confined.<how>, unsupported.<why>;
// text.test.ts checks every family against strings.en.json) and its clock.
import { useStrings, type StringVars } from '@kit';
import strings from './strings.en.json';

export type T = (key: string, vars?: StringVars) => string;

export function useBT(): T {
  return useStrings(strings) as unknown as T;
}

/** Elapsed time as m:ss, or h:mm:ss from an hour. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
