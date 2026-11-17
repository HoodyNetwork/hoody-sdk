// The Usage readings fit a narrow panel: the tile grid's columns may shrink below a tile's preferred
// width instead of pushing past the panel, and a panel's meter-plus-words lines wrap instead of running off. jsdom
// lays nothing out, so this reads the rules themselves; usage.spec.ts measures the drawn page.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const here = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = here('./parts/parts.module.css');
const rule = (name: string) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('Usage fits the panel', () => {
  it('the tile grid never asks for more than the panel has', () => {
    expect(rule('cards')).toMatch(/minmax\(\s*min\(\s*240px\s*,\s*100%\s*\)\s*,\s*1fr\s*\)/);
  });

  it('a panel usage line wraps and may shrink', () => {
    const r = rule('tileBars');
    expect(r).toMatch(/flex-wrap:\s*wrap/);
    expect(r).toMatch(/min-width:\s*0/);
  });

  it('the computer tiles and the server panel rows use the wrapping line', () => {
    expect(here('./parts/Overview.tsx')).toMatch(/<span className=\{s\.tileBars\}>/);
    expect(here('./parts/ServerDetail.tsx')).toMatch(/<div key=\{key\} className=\{s\.tileBars\}>/);
  });
});
