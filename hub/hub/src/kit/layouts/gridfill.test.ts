// Vitest: a card grid fills its row. `repeat(auto-fill, …)` keeps empty tracks, so three cards
// in a wide row each took a sixth of it (Computer › Connect, SSH access); `auto-fit` collapses the empty tracks and the
// cards share the row. auto-fill stays only where one or two cards would otherwise stretch across the row: each such
// declaration says why in a comment that starts with "auto-fill:", on the line just above the declaration.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../..');

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** The 1-based lines of auto-fill declarations without a reason comment. PostCSS parses the file, so comments and
 *  quoted strings are told apart (a "/*" inside a string is not a comment), line numbers hold for CRLF files, and a
 *  value may span lines. PostCSS keeps comments that sit inside a value, so one left-to-right pass drops quoted text, an
 *  unquoted url(…) (whose "/*" is no comment) and those comments before matching: `content: "repeat(auto-fill, …)"` is
 *  no grid, a comment between `repeat(` and `auto-fill` still leaves one, and `url(/*)` cannot swallow a grid up to a
 *  later comment's end (lowercase url( only, as PostCSS's own tokenizer reads it).
 *  The reason is the comment node just before the declaration, ending on the line above its first line. */
function missingReasons(css: string): number[] {
  const bad: number[] = [];
  postcss.parse(css).walkDecls((decl) => {
    const value = decl.value.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\burl\(\s*(?=[^\s"')])(?:\\[\s\S]|[^)\\])*\)|\/\*[\s\S]*?\*\//g, (m) =>
      m.startsWith('/*') ? ' ' : m.startsWith('url(') ? 'url()' : '""',
    );
    if (!/repeat\(\s*auto-fill\b/.test(value)) return;
    const line = decl.source?.start?.line ?? 0;
    const prev = decl.prev();
    const ok = prev?.type === 'comment' && /^auto-fill:\s*\S/.test(prev.text) && prev.source?.end?.line === line - 1;
    if (!ok) bad.push(line);
  });
  return bad;
}

describe('card grids fill their row', () => {
  it('every auto-fill grid says why in an "auto-fill:" comment on the line above', () => {
    const bad = cssFiles(SRC).flatMap((f) => missingReasons(readFileSync(f, 'utf8')).map((l) => `${relative(SRC, f)}:${l}`));
    expect(bad).toEqual([]);
  });

  it('the guard has something to read (the CSS tree is found)', () => {
    expect(cssFiles(SRC).length).toBeGreaterThan(50);
  });

  it('the guard reads declarations, not lines: multi-line values count, examples in comments do not', () => {
    const reason = '/* auto-fill: two cards stay card-sized. */';
    expect(missingReasons('.a {\n  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));\n}')).toEqual([2]);
    expect(missingReasons(`.a {\n  ${reason}\n  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));\n}`)).toEqual([]);
    expect(missingReasons('.a {\n  grid-template-columns: repeat(\n    auto-fill,\n    minmax(9rem, 1fr)\n  );\n}')).toEqual([2]);
    expect(missingReasons(`.a {\n  ${reason}\n  grid-template-columns: repeat(\n    auto-fill,\n    minmax(9rem, 1fr)\n  );\n}`)).toEqual([]);
    expect(missingReasons('/* was repeat(auto-fill, …) before grid-fill-1 */\n.a {\n  grid-template-columns: repeat(auto-fit, 1fr);\n}')).toEqual([]);
    expect(missingReasons(`.a {\n  ${reason}\n\n  grid-template-columns: repeat(auto-fill, 1fr);\n}`)).toEqual([4]);
    expect(missingReasons('.a {\n  /* a reason without the word */\n  grid-template-columns: repeat(auto-fill, 1fr);\n}')).toEqual([3]);
    expect(missingReasons(`.a {\n  ${reason}\n  display: grid; grid-template-columns: repeat(auto-fill, 1fr);\n}`)).toEqual([3]);
  });

  it('the guard knows strings and CRLF: quoted comment marks or a quoted repeat() change nothing', () => {
    const reason = '/* auto-fill: two cards stay card-sized. */';
    expect(missingReasons('.a {\n  --open: "/*";\n  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));\n  --close: "*/";\n}')).toEqual([3]);
    expect(missingReasons('.example::before {\n  content: "repeat(auto-fill, minmax(240px, 1fr))";\n}')).toEqual([]);
    expect(missingReasons(".example::before {\n  content: 'repeat(auto-fill, 1fr)';\n}")).toEqual([]);
    expect(missingReasons(`.a {\r\n  ${reason}\r\n  grid-template-columns: repeat(auto-fill, 1fr);\r\n}`)).toEqual([]);
    expect(missingReasons('.a {\r\n  grid-template-columns: repeat(\r\n    auto-fill,\r\n    1fr\r\n  );\r\n}')).toEqual([2]);
    expect(missingReasons('.a {\n  grid-template-columns: repeat(/* x */ auto-fill, 1fr);\n}')).toEqual([2]);
  });

  it('a comment inside the value neither hides an auto-fill grid nor makes one', () => {
    expect(missingReasons('.a {\n  grid-template-columns: repeat(/**/auto-fill, minmax(240px, 1fr));\n}')).toEqual([2]);
    expect(missingReasons('.a {\n  grid-template-columns: repeat(/* x */auto-fill, minmax(240px, 1fr));\n}')).toEqual([2]);
    expect(missingReasons('.a {\n  grid-template-columns: minmax(min-content/*repeat(auto-fill, 1fr)*/,1fr);\n}')).toEqual([]);
    expect(missingReasons('.a {\n  grid-template-columns: repeat(/* "x */auto-fill, 1fr);\n}')).toEqual([2]);
  });

  it('an unquoted url() is read whole: its "/*" opens no comment', () => {
    // PostCSS keeps a comment that sits inside a function, so a url()'s "/*" could otherwise reach its "*/".
    expect(missingReasons('.a {\n  grid-template-columns: url(/*) repeat(auto-fill, 1fr) x(/* note */);\n}')).toEqual([2]);
    expect(missingReasons('.a {\n  grid-template-columns: var(--tracks, url(/*)) repeat(auto-fill, minmax(240px, 1fr))/**/[end];\n}')).toEqual([2]);
    // An escaped ")" does not end the url(); a quoted url() was already read as a string.
    expect(missingReasons('.a {\n  grid-template-columns: url(a\\)/*) repeat(auto-fill, 1fr) x(/* note */);\n}')).toEqual([2]);
    expect(missingReasons('.a {\n  grid-template-columns: url("/*") repeat(auto-fill, 1fr) x(/* note */);\n}')).toEqual([2]);
    // An escape as the url's first character too; an escaped backslash does end it, so what
    // follows is read as CSS reads it: a real comment, or a real grid.
    expect(missingReasons('.a {\n  --tracks: 10px;\n  grid-template-columns: var(--tracks, url(\\)/*)) repeat(auto-fill, minmax(240px, 1fr))/**/[end];\n}')).toEqual([3]);
    expect(missingReasons('.a {\n  grid-template-columns: url(\\\\)/*) repeat(auto-fill, 1fr) x(/* note */);\n}')).toEqual([]);
    expect(missingReasons('.a {\n  grid-template-columns: url(\\\\) repeat(auto-fill, 1fr) x(/* note */);\n}')).toEqual([2]);
    // A real comment after a url() is still a comment: no grid is made from it.
    expect(missingReasons('.a {\n  grid-template-columns: url(x.png) x(/* repeat(auto-fill, 1fr) */) 1fr;\n}')).toEqual([]);
  });
});
