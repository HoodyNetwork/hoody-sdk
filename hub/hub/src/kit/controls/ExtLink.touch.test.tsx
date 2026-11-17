// A secret address is a button; on a coarse pointer only the `nav` look (a row or cell) gets a --touch-min box. The
// inline look, a link inside a sentence, keeps the line height (WCAG 2.5.8 inline exception). happy-dom has no pointer
// media, so the stylesheet itself is checked, beside the markup its selector must reach (as Kbd.coarse.test.tsx).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExtLink } from './Link';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Link.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const COARSE = '@media (pointer: coarse) {';

/** The text of each coarse-pointer block, braces included. */
function coarseBlocks(): string[] {
  const out: string[] = [];
  for (let at = css.indexOf(COARSE); at >= 0; at = css.indexOf(COARSE, at + 1)) {
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}' && (depth -= 1) === 0) {
        out.push(css.slice(at, i + 1));
        break;
      }
    }
  }
  return out;
}

/** Every rule of a stylesheet text as [selector list, declarations]; a nested block is flattened. */
const rules = (text: string): Array<[string, string]> => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!] as [string, string]);
const MIN = /min-(block|inline)-size\s*:\s*var\(--touch-min\)/;

/** Whether an element carries the CSS-module class of this local name (a hashed name keeps it between underscores). */
const has = (el: Element, name: string) => [...el.classList].some((c) => new RegExp(`(^|_)${name}(_|$)`).test(c));

const SECRET = 'https://6a0000000000000000000001-c0ffee0000000000000000aa-http-8080.n12.example.test/path';

describe('a secret address on a coarse pointer: the touch-min box is for the nav look only', () => {
  it('the one rule that sets the box names `.extButton.nav`, at zero specificity, inside a coarse-pointer block', () => {
    const blocks = coarseBlocks();
    const coarse = blocks.flatMap((b) => rules(b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'))));
    // A rule that only excludes ext buttons (`:not(.extButton, …)`, a standalone address's box) does not count.
    const boxed = coarse.filter(([sel, body]) => /\.extButton/.test(sel.replace(/:not\([^)]*\)/g, '')) && MIN.test(body));
    expect(boxed.map(([sel]) => sel)).toEqual([':where(.extButton.nav)']);
    expect(boxed[0]![1]).toMatch(/min-block-size\s*:\s*var\(--touch-min\)/);
    expect(boxed[0]![1]).toMatch(/min-inline-size\s*:\s*var\(--touch-min\)/);
  });

  it('no other rule gives an ext button a --touch-min box: nothing outside the coarse block, nothing for the inline look', () => {
    const outside = coarseBlocks().reduce((rest, b) => rest.replace(b, ''), css);
    expect(rules(outside).filter(([sel, body]) => /\.extButton|\.ext\b|\.inline\b/.test(sel) && MIN.test(body))).toEqual([]);
    expect(css).not.toMatch(/:where\(\.extButton\)\s*{/);
    expect(css).not.toMatch(/\.extButton\.inline[^{]*{[^}]*--touch-min/);
  });

  it('the markup it reaches: a nav secret button has .extButton and .nav; an inline one has .extButton and .inline, never .nav', () => {
    render(
      <>
        <ExtLink url={SECRET} look="nav" />
        <p>
          Open <ExtLink url={SECRET} look="inline" /> now
        </p>
      </>,
    );
    const [navBtn, inlineBtn] = screen.getAllByRole('button');
    expect(navBtn!.tagName).toBe('BUTTON');
    expect(has(navBtn!, 'extButton') && has(navBtn!, 'nav')).toBe(true);
    expect(inlineBtn!.tagName).toBe('BUTTON');
    expect(has(inlineBtn!, 'extButton') && has(inlineBtn!, 'inline')).toBe(true);
    expect(has(inlineBtn!, 'nav')).toBe(false);
  });

  it('a plain address is an anchor, not an ext button, in either look: the box rule never reaches it', () => {
    render(
      <>
        <ExtLink url="https://docs.example.test/start" look="nav" />
        <ExtLink url="https://docs.example.test/start" look="inline" />
      </>,
    );
    for (const a of screen.getAllByRole('link')) {
      expect(a.tagName).toBe('A');
      expect(has(a, 'extButton')).toBe(false);
    }
  });
});
