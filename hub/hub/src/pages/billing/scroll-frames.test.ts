// Vitest: a frame that scrolls a wide table sideways is the containing block of the table's visually hidden header text
// (.srOnly is absolute). Without it the hidden text escapes the frame's clip and the whole page scrolls sideways
// (71px at 900px, found in a browser; page.spec.ts checks the real width). The plans are columns
// (no table, no sideways frame). Every stylesheet in parts/ is still walked rule by rule, so a frame added there (inside
// an @container block, written inline or holding a nested rule) is judged too.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const PARTS = join(import.meta.dirname, 'parts');
const sheets = readdirSync(PARTS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ file: f, root: postcss.parse(readFileSync(join(PARTS, f), 'utf8')) }));
const plans = readFileSync(join(import.meta.dirname, 'parts', 'PlansSection.tsx'), 'utf8');
const declared = (rule: postcss.Rule, prop: string): string[] => rule.nodes.filter((n): n is postcss.Declaration => n.type === 'decl' && n.prop === prop).map((d) => d.value.trim());
const scrolls = (v: string[]): boolean => v.some((x) => /\b(auto|scroll)\b/.test(x));
const frames: { file: string; rule: postcss.Rule; top: boolean }[] = [];
for (const { file, root } of sheets) {
  root.walkRules((rule) => {
    if (scrolls(declared(rule, 'overflow-x')) || scrolls(declared(rule, 'overflow'))) frames.push({ file, rule, top: rule.parent === root });
  });
}

describe('scroll frames of the billing tables', () => {
  it('the plans draw no table and no sideways frame of their own', () => {
    expect(plans).not.toMatch(/<table\b|<ScrollRegion\b/);
  });
  it('walks every stylesheet in parts/', () => {
    expect(sheets.map((s) => s.file)).toContain('parts.module.css');
  });
  it('positions every scroll frame left in a parts/ stylesheet, so absolute header text stays inside it', () => {
    // Inside an @container block a rule only overrides: it must not take the positioning away.
    const unpositioned = frames.filter(({ rule, top }) => declared(rule, 'position').includes('static') || (top && !declared(rule, 'position').includes('relative')));
    expect(unpositioned.map(({ file, rule }) => `${file} ${rule.selector}`)).toEqual([]);
  });
});
