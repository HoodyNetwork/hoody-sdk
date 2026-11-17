// ServerDetail draws its "Computers on this server" list with classes from parts.module.css; a class
// it never defines would leave the list with browser bullets and indents. Vitest does not process CSS
// modules (any class name reads as defined), so this reads the files: every class ServerDetail takes from its
// stylesheet must be defined there. Uses are read from the TypeScript syntax tree (`s.x` and `s['x']` only), so a
// class named in a comment or a string is not a use; only selectors (text before a `{`, CSS comments stripped)
// count as definitions.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const file = join(import.meta.dirname, 'ServerDetail.tsx');
const src = readFileSync(file, 'utf8');
const css = readFileSync(join(import.meta.dirname, 'parts.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [...css.matchAll(/([^{}]*)\{/g)].map((m) => m[1]).join(' ');

function classUses(text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 's') {
      out.add(n.name.text);
    } else if (
      ts.isElementAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 's' &&
      ts.isStringLiteralLike(n.argumentExpression)
    ) {
      out.add(n.argumentExpression.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...out];
}

describe('ServerDetail stylesheet classes', () => {
  it('imports parts.module.css as s', () => {
    expect(src).toMatch(/^import s from '\.\/parts\.module\.css';$/m);
  });

  it('every s.<class> it uses is defined in parts.module.css', () => {
    const used = classUses(src);
    expect(used).toContain('plain');
    const defined = new Set([...selectors.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
    expect(used.filter((c) => !defined.has(c))).toEqual([]);
  });

  it('a class named only in a comment or a string is not a use', () => {
    const probe = "const a = s.plain; // s.ghostA\nconst b = 's.ghostB'; /* s.ghostC */ const c = s['row'];";
    expect(classUses(probe).sort()).toEqual(['plain', 'row']);
  });

  it('the plain list has no bullets or indent and spaces its rows from the token scale', () => {
    const rule = css.match(/\n\.plain\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/list-style:\s*none/);
    expect(rule).toMatch(/padding:\s*0/);
    expect(rule).toMatch(/margin:\s*0/);
    expect(rule).toMatch(/gap:\s*var\(--sp-\d\)/);
  });
});
