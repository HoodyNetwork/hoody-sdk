// red-record.ts: "new versus already red" for check.ts. A recorded run (.term-cache/check-red.json) holds, per gate,
// the signatures of its failures and the tree's content hashes at that time. A later run prints the failures whose
// signature is not in the record FIRST, as NEW. The record is a view, never an allowance: a recorded failure still
// fails its gate and the exit code.
//   written by: `check.ts --record` (do it on the tree before your change), and by any run when no record exists
//   signature:  gate | rule | file without its :line | message with numbers and quoted line refs blanked
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';

export interface SigProblem { file: string; rule: string; message: string }
export interface RedRecord { at: string; tree: Record<string, string>; gates: Record<string, string[]> }

export const RECORD_FILE = path.join(HUB, '.term-cache', 'check-red.json');

/** Stable across line moves and counts: `R4 12 recorded sites` and `R4 13 recorded sites` are the same failure. */
export function signatureOf(gate: string, p: SigProblem): string {
  const file = p.file.replace(/:\d+(:\d+)?$/, '');
  const msg = p.message.replace(/:\d+(:\d+)?\b/g, ':#').replace(/\b\d+(\.\d+)?\b/g, '#').replace(/\s+/g, ' ').trim();
  return `${gate}|${p.rule}|${file}|${msg}`;
}

export function readRecord(file: string = RECORD_FILE): RedRecord | null {
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as RedRecord;
    return r && typeof r.at === 'string' && r.gates && r.tree ? r : null;
  } catch { return null; }
}

export function writeRecord(r: RedRecord, file: string = RECORD_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(r) + '\n');
}

export interface Split<P> { fresh: P[]; known: P[] }
/** Splits a gate's problems into NEW (signature not recorded for that gate) and already red. A gate the record never
 *  ran counts everything as NEW (nothing is known about it). */
export function splitNew<P extends SigProblem>(gate: string, problems: readonly P[], rec: RedRecord | null): Split<P> {
  const known = new Set(rec?.gates[gate] ?? []);
  const ran = !!rec && gate in rec.gates;
  const out: Split<P> = { fresh: [], known: [] };
  for (const p of problems) (ran && known.has(signatureOf(gate, p)) ? out.known : out.fresh).push(p);
  return out;
}
