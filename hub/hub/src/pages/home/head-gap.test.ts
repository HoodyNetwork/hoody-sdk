// Vitest (two buttons must not crowd each other): What is Hoody? and Customize sit side by side in
// the page header's actions. Their wrapper draws no box of its own, so both are the kit header's action items and take
// its gap between siblings (PageHeader .actions, --gap-actions); a box of their own would put them edge to edge.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'parts/parts.module.css'), 'utf8');
const rule = (name: string) => [...css.matchAll(new RegExp(String.raw`\.${name}\s*\{([^}]*)\}`, 'g'))].map((m) => m[1] ?? '');

describe('Home header actions', () => {
  it('the wide actions wrapper has no box: its buttons take the kit header gap', () => {
    const [wide] = rule('customizeFull');
    expect(wide).toMatch(/display:\s*contents/);
    expect(wide).not.toMatch(/\bgap\b|margin/);
  });

  it('below 640 px the wrapper still hides (Customize folds into the menu)', () => {
    expect(rule('customizeFull').some((r) => /display:\s*none/.test(r))).toBe(true);
  });
});
