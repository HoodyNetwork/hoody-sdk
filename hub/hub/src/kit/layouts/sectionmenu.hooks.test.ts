// The kit SectionMenu's look hooks. The rail look is the default; a caller changes the look only through these
// hooks, set on its own element. Each default is the rail's, each hook is documented in SectionMenu.tsx, and each is
// set by some caller (an unused hook is API nobody needs).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const SRC = path.join(here, '..', '..');
const css = readFileSync(path.join(here, 'SectionMenu.module.css'), 'utf8');
const doc = readFileSync(path.join(here, 'SectionMenu.tsx'), 'utf8');

/** The rail look: each hook's default, as SectionMenu.module.css reads it. */
const RAIL: Record<string, readonly string[]> = {
  '--section-menu-flow': ['column'],
  '--section-menu-gap': ['0'],
  '--section-menu-marks': ['1'],
  '--section-menu-row': ['max(var(--section-row-h), var(--touch-min))'],
  '--section-menu-current-line': ['transparent'],
};

/** Every `var(--section-menu-*, <default>)` in the stylesheet, with its default (balanced parentheses). */
function reads(text: string): [string, string | null][] {
  const out: [string, string | null][] = [];
  const head = /var\(\s*(--section-menu-[a-z-]+)\s*(,)?/g;
  for (let m = head.exec(text); m; m = head.exec(text)) {
    if (!m[2]) {
      out.push([m[1]!, null]);
      continue;
    }
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
    }
    out.push([m[1]!, text.slice(start, i - 1).trim()]);
  }
  return out;
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(dir, f));
}

describe('SectionMenu look hooks', () => {
  const found = reads(css.replace(/\/\*[\s\S]*?\*\//g, ''));

  it('every hook read has a default, and that default is the rail look', () => {
    expect(found.length).toBeGreaterThan(0);
    for (const [name, def] of found) {
      expect(Object.keys(RAIL), `${name} is a known hook`).toContain(name);
      expect(RAIL[name], `${name} defaults to the rail look`).toContain(def);
    }
  });

  it('every known hook is read by the kit part', () => {
    expect([...new Set(found.map(([n]) => n))].sort()).toEqual(Object.keys(RAIL).sort());
  });

  it('every hook is documented in SectionMenu.tsx', () => {
    for (const name of Object.keys(RAIL)) expect(doc, `${name} is documented`).toContain(name);
  });

  it('every hook is set by a caller, never by the kit part itself', () => {
    const callers = cssFiles(SRC).filter((f) => !f.endsWith(`${path.sep}SectionMenu.module.css`));
    const sets = new Set<string>();
    for (const f of callers) for (const m of readFileSync(f, 'utf8').matchAll(/(--section-menu-[a-z-]+)\s*:/g)) sets.add(m[1]!);
    for (const name of Object.keys(RAIL)) expect(sets.has(name), `${name} is set by a caller`).toBe(true);
    expect(/--section-menu-[a-z-]+\s*:/.test(css), 'the kit part sets no hook').toBe(false);
  });
});
