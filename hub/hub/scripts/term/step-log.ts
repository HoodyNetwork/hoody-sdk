// step-log.ts: a failed check.ts step keeps its whole output (a short tail alone can lose the results of every page
// that ran before a timeout). The problem line keeps the short tail and names the
// log; the log holds the command, the exit and every line.
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';

export const STEP_LOG_DIR = path.join(HUB, '.term-cache', 'check-logs');
/** Logs kept: each write removes the older ones past this many, the one just written never. */
export const STEP_LOG_KEEP = 50;

/** Writes a step's full output; returns the log path relative to the hub. Never throws: a log that cannot be written
 *  is said in the problem instead of hiding the step's own failure. */
export function writeStepLog(step: string, cmd: readonly string[], r: { code: number; out: string; timedOut?: boolean }, dir = STEP_LOG_DIR, now = new Date()): string {
  const name = `${step.replace(/[^a-z0-9-]+/gi, '_')}-${now.toISOString().replace(/[:.]/g, '-')}-${process.pid}.log`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, `$ ${cmd.join(' ')}\nexit ${r.code}${r.timedOut ? ' (timed out)' : ''}\n\n${r.out}`);
    pruneStepLogs(dir, file);
    return path.relative(HUB, file);
  } catch (e) {
    return `(log not written: ${String((e as Error)?.message ?? e).split('\n')[0]})`;
  }
}

/** Keeps the newest `max` `.log` files of `dir` (by modification time, then name) and `keep`; removes the rest.
 *  Never throws: a log another process removed first, or one that cannot be removed, is left to the next write. */
export function pruneStepLogs(dir: string, keep: string, max = STEP_LOG_KEEP): void {
  let logs: { file: string; at: number }[] = [];
  try {
    logs = fs.readdirSync(dir).filter((n) => n.endsWith('.log')).map((n) => path.join(dir, n)).flatMap((file) => {
      try { return [{ file, at: fs.statSync(file).mtimeMs }]; } catch { return []; }
    });
  } catch { return; }
  logs.sort((a, b) => b.at - a.at || (a.file < b.file ? 1 : a.file > b.file ? -1 : 0));
  const kept = new Set([keep, ...logs.slice(0, max).map((l) => l.file)]);
  for (const l of logs) if (!kept.has(l.file)) { try { fs.unlinkSync(l.file); } catch { /* next write */ } }
}

/** The problem message of a failed step: exit code, the last 3 output lines, and where the rest is. */
export function exitMessage(r: { code: number; out: string; log?: string }): string {
  return `exit ${r.code}: ${r.out.trim().split('\n').slice(-3).join(' | ')}${r.log ? ` (full output: ${r.log})` : ''}`;
}
