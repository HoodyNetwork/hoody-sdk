// What check.ts prints for a gate: never a bare FAIL (a line like "FAIL contract (28.2 s): 27.4 s"
// and nothing else). contractReport reads contract.ts's text output; failLine gives any failing gate's summary its reason.
import type { Problem } from './goldens';

const CONTRACT_FIX = 'Match the web twin (names, types, props read, scenarios); `bun scripts/term/contract.ts --explain <Component>` says why.';
/** Lines of contract.ts that make it exit 1, with the indented detail lines under each. */
const HEAD = /^(FAIL\b|FIXED \(remove from contract\.debt\.json\)|DEBT ADDED|contract\.ts(?: --only)?: )/;

/** contract.ts's output → the gate's summary and problems. The summary is its totals lines (types:, behaviour:), never the
 *  timing line alone; on a failure every failing head becomes a problem with its detail, and a failure with no head
 *  found (a crash, an unknown line) still names the exit code and the output's last lines. */
export function contractReport(out: string, code: number): { ok: boolean; summary: string; problems: Problem[] } {
  const lines = out.split('\n').map((l) => l.replace(/\s+$/, '')).filter(Boolean);
  const totals = lines.filter((l) => /^(types|behaviour): /.test(l));
  const ok = code === 0;
  const problems: Problem[] = [];
  if (!ok) {
    for (let i = 0; i < lines.length; i++) {
      if (!HEAD.test(lines[i]!)) continue;
      const detail: string[] = [];
      for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]!); j++) detail.push(lines[j]!.trim());
      const m = /((?:src|scripts)\/[^\s:,()]+\.tsx?)/.exec(lines[i]!);
      problems.push({ file: m?.[1] ?? 'scripts/term/contract.ts', rule: 'contract', message: [lines[i]!.trim(), ...detail.slice(0, 6)].join(' | '), fix: /^FIXED/.test(lines[i]!) ? 'bun scripts/term/contract.ts --update-debt' : CONTRACT_FIX });
    }
    if (!problems.length) problems.push({ file: 'scripts/term/contract.ts', rule: 'contract', message: `exit ${code}, no failing line recognised: ${lines.slice(-3).join(' | ') || '(no output)'}`, fix: 'Run `bun scripts/term/contract.ts` and read its output.' });
  }
  const summary = totals.length ? totals.join('; ') : (lines[lines.length - 1] ?? `exit ${code}, no output`);
  return { ok, summary, problems };
}

/** A failing gate's summary with its reason: the first problems (file: message), so the run's one line says why. */
export function failLine(summary: string, problems: readonly Problem[], max = 3): string {
  if (!problems.length) return summary ? `${summary} | no problem recorded` : 'no problem recorded';
  const why = problems.slice(0, max).map((p) => `${p.file}: ${p.message}`).join('; ');
  const more = problems.length > max ? ` (+${problems.length - max} more)` : '';
  return `${summary ? `${summary} | ` : ''}${problems.length} problem${problems.length === 1 ? '' : 's'}: ${why}${more}`;
}
