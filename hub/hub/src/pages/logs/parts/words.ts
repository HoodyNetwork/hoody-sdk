// Shared words and small helpers of the logs page's parts.
import type { Translate } from '@kit';
import type { Tx } from '../logic';
import type strings from '../strings.en.json';

export type T = Translate<typeof strings>;
/** The page's `t` as the plain-key function the pure logic takes (one cast, at the edge). */
export const asTx = (t: T): Tx => t as unknown as Tx;

const pad = (n: number) => String(n).padStart(2, '0');
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function shortClock(ms: number): string {
  try { return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return new Date(ms).toISOString(); }
}
export function dayLabel(ms: number): string {
  try { return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); } catch { return new Date(ms).toDateString(); }
}
