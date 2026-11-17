// The schedule checks of New script's Where step (split out of StepWhere.tsx so the terminal build shares them;
// StepWhere.tsx re-exports both).
import { presetOf } from '../logic';

/** Five cron fields of the usual characters. Exec decides the rest when the code is checked. */
const CRON = /^[0-9*/,-]+( [0-9*/,-]+){4}$/;
export const cronOk = (c: string): boolean => CRON.test(c.trim().replace(/\s+/g, ' '));

/** The local time of a preset's UTC hour, "10:00", or null for one that has no single time (hourly, custom). */
export function localOf(cron: string, at: Date = new Date()): string | null {
  const p = presetOf(cron);
  if (p !== 'daily' && p !== 'weekly') return null;
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 8, 0));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
