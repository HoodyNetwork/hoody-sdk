// A compact EmptyState or ErrorState is one line. A compact EmptyState never
// shows `body`, `secondary` or `hint`; a compact ErrorState never shows `body` (its `secondary` does show, after the
// retry). A call that passes them loses the reason or the way out without a word.
// Such a place uses size="sm", which shows them. Read from the TypeScript AST: a literal size="compact" with any of
// those props is refused. A size passed through a variable (the kit's Recipes, which drop their own default body on
// purpose) is not judged. KNOWN lists today's breaks with their owners; it only shrinks.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../..');
/** The props each compact state never shows (kit/states/States.tsx). */
const DROPPED: Record<string, string[]> = { EmptyState: ['body', 'secondary', 'hint'], ErrorState: ['body'] };

/** Every literal size="compact" EmptyState/ErrorState in one file that passes a prop compact never shows. */
export function compactDrops(file: string, text: string): string[] {
  if (!/\b(Empty|Error)State\b/.test(text) || !text.includes('compact')) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tag in DROPPED) {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const size = attrs.find((a) => a.name.getText(sf) === 'size');
        const init = size?.initializer;
        const lit =
          init &&
          (ts.isStringLiteral(init)
            ? init.text
            : ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)
              ? init.expression.text
              : null);
        if (lit === 'compact') {
          const dropped = attrs.map((a) => a.name.getText(sf)).filter((n) => DROPPED[tag]!.includes(n));
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          if (dropped.length) out.push(`${file}:${line} ${tag} ${dropped.join(',')}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Today's breaks, `<file> <tag> <props>` (no line, so an edit above does not move it), with the owner. */
const KNOWN: Record<string, string> = {};

const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .map((f) => f.split(sep).join('/'))
  .filter((f) => f.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(f));
const found = ALL.flatMap((f) => compactDrops(f, readFileSync(join(SRC, f), 'utf8')));
const keyOf = (hit: string) => hit.replace(/:\d+ /, ' ');

describe('compact EmptyState/ErrorState passes nothing it does not show', () => {
  it('finds the compact calls at all', () => {
    expect(ALL.filter((f) => /size="compact"/.test(readFileSync(join(SRC, f), 'utf8'))).length).toBeGreaterThan(10);
  });
  it('no compact call passes body, secondary or hint, unless KNOWN', () => {
    expect(found.filter((h) => !(keyOf(h) in KNOWN))).toEqual([]);
  });
  it('every KNOWN entry still matches a call', () => {
    expect(Object.keys(KNOWN).filter((k) => !found.some((h) => keyOf(h) === k))).toEqual([]);
  });
});

describe('the reader (fixtures)', () => {
  const at = (body: string) => compactDrops('f.tsx', `const x = () => (${body});`).map((h) => h.slice(h.indexOf(' ') + 1));
  it('a literal compact with body, secondary or hint is named; sm, md and a variable size are not', () => {
    expect(at(`<EmptyState size="compact" title="a" body="why" />`)).toEqual(['EmptyState body']);
    expect(at(`<EmptyState size={'compact'} title="a" secondary={<b />} hint="h" />`)).toEqual(['EmptyState secondary,hint']);
    expect(at(`<ErrorState size="compact" title="a" body="why"></ErrorState>`)).toEqual(['ErrorState body']);
    expect(at(`<EmptyState size="sm" title="a" body="why" />`)).toEqual([]);
    expect(at(`<EmptyState title="a" body="why" />`)).toEqual([]);
    expect(at(`<EmptyState size={size} title="a" body="why" />`)).toEqual([]);
    expect(at(`<EmptyState size="compact" title="a" action={<b />} />`)).toEqual([]);
    // A compact ErrorState shows its secondary (after the retry), so only its body is refused.
    expect(at(`<ErrorState size="compact" title="a" secondary={<b />} />`)).toEqual([]);
    expect(at(`<ErrorState size="compact" title="a" body="why" secondary={<b />} hint="h" />`)).toEqual(['ErrorState body']);
  });
});
