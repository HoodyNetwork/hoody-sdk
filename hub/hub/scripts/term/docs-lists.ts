// docs-lists.ts: a doc's written-out export list, checked against the file it names (used by docs-check.ts, rule
// `list`). A doc declares the list between two HTML comments; every backticked name inside counts:
//   <!-- exports-of: src/term/prim/page.ts -->
//   `Box`, `Spacer`, `Text`, ...
//   <!-- exports-of:end -->
// A placeholder such as `<file>` is not a path, so a doc can show the syntax. The check fails on a name the file does not export and on an export the list lacks. One list per source file is
// the rule: other docs link to it instead of repeating it.

export interface ExportList { source: string; line: number; names: Set<string> }

const LIST_RE = /<!-- exports-of: ([\w./-]+) -->([\s\S]*?)<!-- exports-of:end -->/g;

/** Every declared export list in a doc's text, with the 1-based line of its opening comment. */
export function exportLists(text: string): ExportList[] {
  const out: ExportList[] = [];
  for (const m of text.matchAll(LIST_RE)) {
    const names = new Set([...m[2]!.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((x) => x[1]!));
    out.push({ source: m[1]!, line: text.slice(0, m.index).split('\n').length, names });
  }
  return out;
}

/** What is wrong with one list, given the names its source file exports. Empty = the list matches. */
export function exportListProblems(list: ExportList, exported: Iterable<string>): string[] {
  const have = new Set(exported);
  const out: string[] = [];
  for (const n of [...list.names].sort()) if (!have.has(n)) out.push(`\`${n}\` is listed as an export of ${list.source}, which does not export it`);
  for (const n of [...have].sort()) if (!list.names.has(n)) out.push(`${list.source} exports ${n}, which the list lacks`);
  return out;
}
