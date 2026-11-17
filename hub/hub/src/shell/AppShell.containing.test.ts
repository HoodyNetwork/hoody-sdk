// The content area (#hub-main, `.main`) is the containing block of every absolutely positioned box a page draws without a
// positioned ancestor of its own (visually hidden text, a hidden input). Without position on `.main`, such a box sits
// against the viewport at its place deep in the scrolled content, and the document scrolls past the page's end a second
// time (Plans & billing and Computers did). The browser proof is shell/overscroll.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'AppShell.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('.main contains positioned boxes', () => {
  it('is position: relative in its base rule', () => {
    const i = css.indexOf('\n.main {');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(css.slice(i, css.indexOf('}', i))).toMatch(/\n\s*position:\s*relative;/);
  });

  it('no later rule moves .main back to static', () => {
    const rules = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].map((m) => ({ sel: (m[1] ?? '').trim(), body: m[2] ?? '' }));
    const main = rules.filter((r) => /\.main\b/.test(r.sel));
    expect(main.length).toBeGreaterThan(0);
    for (const r of main) expect(r.body, r.sel).not.toMatch(/position:\s*static/);
  });
});
