// check-args.ts: check.ts's command line, fail closed. A word check.ts does not read was silently dropped, so a narrow
// ask ran wide: `check.ts --only web-scenarios SegmentedControl` ran every scenario file on the web side
// (one heavy vitest run). Now:
//   - every argument is a known flag, a known flag's value, or a scenario filter given with --scenario;
//   - a bare word is refused (exit 2) with the --scenario spelling it probably meant;
//   - --scenario a,b limits scenarios, web-scenarios and mutants to those files (scenarios.ts matching: a path, a path
//     ending, a component name), and a filter matching no file is refused (it would otherwise run nothing and pass).

/** Flags that take a value (the next argument). */
export const VALUE_FLAGS = ['page', 'only', 'skip', 'jobs', 'json', 'scenario'] as const;
/** Flags with no value. `--changed` takes an optional list (the next argument when it is not a flag). */
export const BARE_FLAGS = ['update', 'record', 'affected', 'changed'] as const;

/** The problems of a check.ts command line; empty = fine. */
export function argProblems(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const n = a.slice(2);
      if ((VALUE_FLAGS as readonly string[]).includes(n)) {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) out.push(`${a} needs a value`);
        else i++;
      } else if (n === 'changed') {
        if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--')) i++;
      } else if (!(BARE_FLAGS as readonly string[]).includes(n)) out.push(`unknown flag ${a}`);
      continue;
    }
    out.push(`unexpected argument ${JSON.stringify(a)} (a scenario filter is \`--scenario ${a}\`; check.ts reads no bare words)`);
  }
  return out;
}

/** scenarios.ts's matching (scenarioFiles): a path, a path ending, the start of a file name, or a part of the path. */
export function matchScenarios(all: readonly string[], filter: readonly string[]): { files: string[]; unmatched: string[] } {
  const hit = (f: string, n: string): boolean => f.endsWith(n) || (f.split('/').pop() ?? '').startsWith(n + '.') || f.includes(n);
  return { files: all.filter((f) => filter.some((n) => hit(f, n))).sort(), unmatched: filter.filter((n) => !all.some((f) => hit(f, n))) };
}

/** The scenario files a run is limited to: the --scenario filter intersected with the scope's (null = no limit). */
export function scenarioScope(scoped: readonly string[] | null, picked: readonly string[] | null): string[] | null {
  if (picked === null) return scoped === null ? null : [...scoped];
  if (scoped === null) return [...picked];
  const s = new Set(scoped);
  return picked.filter((f) => s.has(f));
}
