// The comment scan behind app/conformance.comments.test.ts: comment lines in Hub source and tests that carry history
// instead of a present-tense reason. A comment says what the code is for and what a reader must not break; where a
// change came from (a date, a change id, who asked or decided, "was … now …") belongs in the change history. A test
// title is read the same way for a case id, and every line for an internal host name. Test-only.
// Not read: generated files, the page allow files (their rows carry a reason by design), this guard's own test and lint or
// compiler directives (`eslint-disable … -- why`, `stylelint-disable`, `@ts-expect-error`), whose text a tool reads.
// Markers a test or tool reads inside a comment (`noDetails:`, `reason:`, `sql-safe:`) are never a hit by themselves.
import ts from 'typescript';

export interface CommentHit { file: string; line: number; kind: string; text: string }

/** Each marker: what it is called in a message, and the pattern one comment line is tested with. The pattern sources
 *  are stored ROT13-encoded (letters only; digits, escapes' backslashes and punctuation unchanged) and decoded once at
 *  load, so this file never holds the words it looks for in plain text. ROT13 is its own inverse: rot13(stored) is the
 *  regular-expression source as written. */
export const rot13 = (s: string): string =>
  s.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

/** The stored (encoded) form of each marker: [kind, ROT13 of the pattern source]. */
export const HISTORY_MARKER_SOURCES: ReadonlyArray<readonly [kind: string, encoded: string]> = [
  ['a time or date', '\\o\\q{1,2}:\\q{2}M\\o|\\o20\\q{2}-\\q{2}-\\q{2}\\o|\\o(?:bcrengbe|yrnq|ehyvat|ehyrq|erivrj|nccebirq|nfxrq)\\o[^.;]{0,40}\\o(?:0[1-9]|1[0-2])-(?:[0-2]\\q|3[01])\\o|\\((?:0[1-9]|1[0-2])-(?:[0-2]\\q|3[01])\\)'],
  ['a reviewer or designer name', "\\o(?:Green|Nfgen|Netba|Fbaarg|Snoyr|Pneoba)\\o|\\oBchf (?:e\\q|erivrj|A\\q|YBJ|ZRQ|UVTU|FUVC)"],
  ['a lane, set, sequence or cut id', '\\oY-[n-m][n-m0-9]{2,}\\o|(?<![-.\\j[])\\o[n-m][n-m0-9]*(?:-[n-m][n-m0-9]*)+-\\q+[n-m]?\\o(?!-)|\\ofrd \\q{3,4}\\o|\\ofrg [N-M]{1,3}\\q*-?[n-m0-9]*\\o|\\osem-\\q'],
  ['a ruling, review round or plan reference', "\\o(?:yrnq|bcrengbe)(?:'f)? (?:ehyvat|qrog[ ]ehyvat|qrpvfvba|beqre|R\\q|BX\\o)|\\oehyvat [n-m0-9(]|\\o(?:qrog )?ehyvat nfxrq\\o|\\oFVTAZR\\o|\\oEHYVATF\\o|\\oSBYYBJHCF?\\o|\\oQRFVTA-[\\j-]+|\\oQENSGL(?:-CYNA)?\\o|\\oERIVRJ-\\j+|\\oFGEHPGHER-NHQVG\\o|\\oe\\q (?:SVK|FUVC|erivrj)\\o|\\o(?:UVTU|ZRQ|YBJ)\\q\\o"],
  ['a plan or ticket number', '\\oXF?\\q{1,2}[n-m]?\\o|\\oQ\\q{2}[n-m]?\\o|#S\\q+|\\oS\\q+[n-m]\\o|\\oHV-\\q\\o|\\oIX\\q\\o|\\oXA\\q\\o|\\oJS\\q[n-m]?\\o|\\oNV-[N-M]*\\q+[n-m]?(?:-\\q)?\\o|\\oD-[N-M]\\o|\\oC\\q[n-m]\\o|\\oXF-\\q+\\o'],
  ['was … now wording', '\\ojnf\\o[^.;]{0,80}\\oabj\\o|\\oabj\\o[^.;]{0,60}\\o(?:vafgrnq bs|engure guna)\\o|\\ohfrq gb\\o|\\osbezreyl\\o|\\ozbirq (?:sebz|urer)\\o|\\ohagvy [\\j-]+ ynaqf\\o|\\o\\q+\\f*(?:->|\\h2192)\\f*\\q+\\o'],
  ['a case or work-item id', '\\((?!(?:P9|IF16|HGS8|P0|P1|S(?:[1-9]|1[0-2])|U[1-6])\\))(?:nqi(?:vfbel)? )?[N-M]{1,3}\\q{1,2}[n-m]?(?:(?:, | ?/ ?| )(?:[N-M]{1,3}\\q{1,2}[n-m]?|[n-m]\\o))*(?: n11l#\\q+)?\\)|\\onqi-[N-M]\\q+:|\\otebhc [N-M]\\q+ [N-M0-9-]+:'],
  ['where code came from or a past failure', '\\o(?:yvsgrq|zbirq(?: hapunatrq)?) sebz (?:cntrf|xvg|pber|furyy|ncc)\\/|\\oerq orsber gur svk\\o|\\oorsber gur (?:erjbex|fybgf)\\o|\\oserrmr (?:grfgf|ohvyg)\\o|\\oerivrjf? xrcg svaqvat\\o|\\o(?:[Cc]begrq|er-ubzrq)\\o[^.;]{0,40}\\osebz\\o|\\o[Cc]beg bs (?:gur cher cneg bs )?(?:choyvp\\/nhgu\\/)?uho-|\\ogur byq(?:re)? Uho\\o'],
  ['a server path', "(?:^|[\\f(`'\"])\\/(?:Freire|ine\\/gzc|ubzr)\\/"],
];

export const HISTORY_MARKERS: ReadonlyArray<readonly [kind: string, re: RegExp]> = HISTORY_MARKER_SOURCES.map(
  ([kind, encoded]) => [kind, new RegExp(rot13(encoded))] as const,
);

const DIRECTIVE = /\b(?:eslint-(?:disable|enable)|stylelint-(?:disable|enable)|@ts-(?:expect-error|ignore|nocheck)|prettier-ignore|@vitest-environment|istanbul ignore|c8 ignore)\b/;

/** A test title is read for these alone: [kind, ROT13 of the pattern source], tested on a line that opens a test or a group. */
export const TITLE_MARKER_SOURCES: ReadonlyArray<readonly [kind: string, encoded: string]> = [
  ['a case id leading a test title', '^\\f*(?:vg|grfg|qrfpevor)(?:\\.\\j+)*(?:\\([^)]*\\))?\\(\\f*[\'\\"`](?!(?:P9|S(?:[1-9]|1[0-2]))\\o)[N-M]{1,3}\\q{1,2}[n-m]?(?:\\/[N-M]{0,3}\\q{0,2}[n-m]?)*:? \\F'],
  ['a case or work-item id', '\\((?!(?:P9|IF16|HGS8|P0|P1|S(?:[1-9]|1[0-2])|U[1-6])\\))(?:nqi(?:vfbel)? )?[N-M]{1,3}\\q{1,2}[n-m]?(?:(?:, | ?/ ?| )(?:[N-M]{1,3}\\q{1,2}[n-m]?|[n-m]\\o))*(?: n11l#\\q+)?\\)|\\onqi-[N-M]\\q+:|\\otebhc [N-M]\\q+ [N-M0-9-]+:'],
];
/** Read on every line of a file, code included: [kind, ROT13 of the pattern source]. */
export const LINE_MARKER_SOURCES: ReadonlyArray<readonly [kind: string, encoded: string]> = [
  ['an internal host name', '\\o[n-m]{2}-[n-m]{3}-\\q\\.(?:pbzchgref|pbagnvaref)\\.ubbql\\.'],
];
const decoded = (rows: ReadonlyArray<readonly [string, string]>) => rows.map(([kind, encoded]) => [kind, new RegExp(rot13(encoded))] as const);
export const TITLE_MARKERS: ReadonlyArray<readonly [kind: string, re: RegExp]> = decoded(TITLE_MARKER_SOURCES);
export const LINE_MARKERS: ReadonlyArray<readonly [kind: string, re: RegExp]> = decoded(LINE_MARKER_SOURCES);

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TITLE_LINE = /^\s*(?:it|test|describe)(?:\.\w+)*(?:\([^)]*\))?\(\s*['"`]/;

export const scannedForComments = (f: string): boolean =>
  /^(?:kit|pages|core|shell|app|standalone|ask|term)\//.test(f) &&
  /\.(?:tsx?|css|mjs|cjs)$/.test(f) &&
  !/\.gen\.ts$|\.generated\.ts$|\.d\.ts$/.test(f) &&
  !/(?:^|\/)conformance\.allow\.ts$/.test(f) &&
  !/^app\/conformance(?:\.comments\.test|\/commentScan)\.ts$/.test(f);

/** Every comment of a source text as { pos, text }: block comments of a stylesheet, or the comment trivia of a TS/TSX file
 *  (JSX text is never trivia, so an address written in it is not a comment). */
export function commentsOf(file: string, text: string): { pos: number; text: string }[] {
  const out: { pos: number; text: string }[] = [];
  if (file.endsWith('.css')) {
    for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) out.push({ pos: m.index ?? 0, text: m[0] });
    return out;
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const seen = new Set<number>();
  const take = (ranges: ts.CommentRange[] | undefined) => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      out.push({ pos: r.pos, text: text.slice(r.pos, r.end) });
    }
  };
  const visit = (n: ts.Node): void => {
    if (n.kind !== ts.SyntaxKind.JsxText) {
      take(ts.getLeadingCommentRanges(text, n.getFullStart()));
      take(ts.getTrailingCommentRanges(text, n.getEnd()));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  take(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()));
  return out.sort((a, b) => a.pos - b.pos);
}

/** The comment lines of one file that carry a history marker (one hit per line: its first marker). */
export function commentHits(file: string, text: string): CommentHit[] {
  const hits: CommentHit[] = [];
  for (const c of commentsOf(file, text)) {
    if (DIRECTIVE.test(c.text)) continue;
    const first = text.slice(0, c.pos).split('\n').length;
    c.text.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      const found = HISTORY_MARKERS.find(([, re]) => re.test(line));
      if (found) hits.push({ file, line: first + i, kind: found[0], text: line.slice(0, 140) });
    });
  }
  return hits;
}

/** Everything the guard counts in one file: its comment lines, the titles of a test file and any line naming a
 *  internal host. One hit per line (the comment's marker first), in line order. */
export function sourceHits(file: string, text: string): CommentHit[] {
  const byLine = new Map<number, CommentHit>(commentHits(file, text).map((h) => [h.line, h]));
  const test = TEST_FILE.test(file);
  text.split('\n').forEach((raw, i) => {
    if (byLine.has(i + 1)) return;
    const line = raw.trim();
    const found = (test && TITLE_LINE.test(raw) ? TITLE_MARKERS.find(([, re]) => re.test(raw)) : undefined) ?? LINE_MARKERS.find(([, re]) => re.test(line));
    if (found) byLine.set(i + 1, { file, line: i + 1, kind: found[0], text: line.slice(0, 140) });
  });
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}
