// A count ratchet over a JSON table (rule -> hub/src file -> allowed hits), shared by the guards whose rows live in app/
// (structure.allow.json, comments.allow.json). A count above its row fails. A count below its row is a stale row: it fails
// only under HUB_RATCHET_STRICT=1 (the full check), so an owner who fixes a site is never red for the row.
// HUB_RATCHET_LOWER=1 rewrites the table downward: rows fall to today's counts and empty rows go; nothing is raised or added.
// Test-only.
import { readFileSync, writeFileSync } from 'node:fs';

export type Table = Record<string, Record<string, number>>;
export const readTable = (path: string): Table => JSON.parse(readFileSync(path, 'utf8')) as Table;

export interface Judged { grew: string[]; stale: string[] }
/** Each (rule, file) against its row: `grew` holds the counts above their rows, `stale` the rows above their counts. */
export function judge(counts: Table, rows: Table, where: (rule: string, file: string) => string = () => ''): Judged {
  const grew: string[] = [];
  const stale: string[] = [];
  for (const rule of new Set([...Object.keys(counts), ...Object.keys(rows)])) {
    const c = counts[rule] ?? {};
    const r = rows[rule] ?? {};
    for (const file of new Set([...Object.keys(c), ...Object.keys(r)])) {
      const n = c[file] ?? 0;
      const allowed = r[file] ?? 0;
      if (n > allowed) grew.push(`${rule}  ${file}: ${n} hit(s), row allows ${allowed}${where(rule, file)}`);
      else if (n < allowed) stale.push(`${rule}  ${file}: row ${allowed}, counted ${n}`);
    }
  }
  return { grew: grew.sort(), stale: stale.sort() };
}

/** The table with every row lowered to its count (a row never rises, a new file never gets one); null when nothing changes. */
export function lowered(counts: Table, rows: Table): Table | null {
  let changed = false;
  const out: Table = {};
  for (const [rule, r] of Object.entries(rows)) {
    out[rule] = {};
    for (const [file, allowed] of Object.entries(r)) {
      const n = Math.min(allowed, counts[rule]?.[file] ?? 0);
      if (n !== allowed) changed = true;
      if (n > 0) out[rule][file] = n;
    }
  }
  return changed ? out : null;
}

export const strict = () => process.env.HUB_RATCHET_STRICT === '1';
/** Under HUB_RATCHET_LOWER=1, writes the lowered table back; returns whether it wrote. */
export function lowerOnDisk(path: string, counts: Table, rows: Table): boolean {
  if (process.env.HUB_RATCHET_LOWER !== '1') return false;
  const next = lowered(counts, rows);
  if (next) writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next !== null;
}
