// global-inputs.ts: the inputs every page depends on that its closure does not name (global stylesheets, the JSON
// tables of scripts/term, the lockfile), hashed per file so --affected / --changed can say WHICH one made them select
// every page (goldens.ts records the map with each run in .term-cache/goldens-runs.json).

/** Per-file hashes -> one hash (the run record's `global`). */
export function hashGlobalInputs(files: Readonly<Record<string, string>>): string {
  return Bun.hash(Object.keys(files).sort().map((f) => f + ':' + files[f]).join('\n')).toString(36);
}

/** The global inputs that differ between the last run's map and now: changed, added, removed (sorted, labelled). */
export function globalInputChanges(prev: Readonly<Record<string, string>> | undefined, now: Readonly<Record<string, string>>): string[] {
  if (!prev) return [];
  const out: string[] = [];
  for (const f of Object.keys(now).sort()) {
    if (!(f in prev)) out.push(`${f} (added)`);
    else if (prev[f] !== now[f]) out.push(f);
  }
  for (const f of Object.keys(prev).sort()) if (!(f in now)) out.push(`${f} (removed)`);
  return out;
}

/** The reason every page is selected: names the paths, else says why it cannot. */
export function globalChangeWhy(prev: Readonly<Record<string, string>> | undefined, now: Readonly<Record<string, string>>): string {
  const ch = globalInputChanges(prev, now);
  if (!prev) return 'global inputs changed (the last run recorded no per-file list: the next run records one and names the file)';
  if (!ch.length) return 'global inputs changed (same files and contents; the record was written by an older runner)';
  return `global input changed: ${ch.slice(0, 6).join(', ')}${ch.length > 6 ? ` (+${ch.length - 6})` : ''}`;
}
