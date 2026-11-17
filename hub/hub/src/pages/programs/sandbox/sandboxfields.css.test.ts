// The resource limits pair in two columns at most (related controls pair, never three in a
// row), whatever the resizable editor's width, and stack one per row where two would not fit. Read from the CSS source.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(__dirname, 'SandboxFields.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const decl = (sel: string, prop: string) => {
  const body = new RegExp(`(?:^|[}\\s])${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim().replace(/\s+/g, ' ');
};

describe('SandboxFields resource limits: two to a row at most', () => {
  it('each field takes half the row less half the Row gap (gap 3), so a third never fits beside two', () => {
    expect(decl('.half', 'flex')).toBe('1 1 calc((100% - var(--sp-3)) / 2)');
  });
  it('below two minimum widths they stack, one per row at full width', () => {
    expect(decl('.half', 'min-width')).toBe('min(100%, calc(4 * var(--sp-10)))');
  });
});
