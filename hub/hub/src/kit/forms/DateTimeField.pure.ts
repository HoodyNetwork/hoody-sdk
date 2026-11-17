// The pure rules of DateTimeField and DateField (web and terminal): a typed YYYY-MM-DD and HH:MM, the epoch ms they make
// with the local calendar, and the ↑/↓ steps. No React, no DOM.
import { stepTime } from './more.pure';

export const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const TIME_24 = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** '1999-3-5' or '19990305' → '1999-03-05' when that day exists; anything else unchanged. */
export function normalizeDate(raw: string): string {
  const v = raw.trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (!m) return v;
  const out = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return dayOf(out) ? out : v;
}

/** The local midnight of a YYYY-MM-DD that exists (February 30 does not), else null. */
export function dayOf(text: string): Date | null {
  const m = DATE.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(y, mo - 1, d);
  return day.getFullYear() === y && day.getMonth() === mo - 1 && day.getDate() === d ? day : null;
}

export function compose(dateText: string, timeText: string): number | null {
  const day = dayOf(dateText);
  const t = TIME_24.exec(timeText);
  if (!day || !t) return null;
  day.setHours(Number(t[1]), Number(t[2]), 0, 0);
  return day.getTime();
}

export function partsOf(ms: number | null): [string, string] {
  if (ms === null || !Number.isFinite(ms)) return ['', ''];
  const d = new Date(ms);
  return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`];
}

/** The day after (dir 1) or before (-1) a typed date; an unreadable one counts from today. */
export function stepDay(dateText: string, dir: 1 | -1): string {
  const day = dayOf(normalizeDate(dateText)) ?? new Date(new Date().setHours(0, 0, 0, 0));
  day.setDate(day.getDate() + dir);
  return partsOf(day.getTime())[0];
}

/** The typed time one mark of the `step` grid up (dir 1) or down (-1): the time fields' one rule (stepTime). */
export function stepTimeGrid(timeText: string, step: number, dir: 1 | -1): string {
  return stepTime(timeText, step, dir);
}
