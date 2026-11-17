// The content and the top bar keep the same scrollbar room: under a classic
// scrollbar a scrolling page was narrower than the bar by the scrollbar, so the bar's end and the content's end sat
// 7 px apart on every page that scrolls and together on every page that does not. That is a desktop-layout rule: on a
// phone-width window (the shell's phone layout, < 768) the bar's end is its own .end rule's, and a kept room only took
// 7 px from every page that does not scroll (kit/forms/fieldaction.spec.ts, kit/layouts/panestate.spec.ts at 390), so
// both boxes give it back there. Read from the sources.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (css: string, sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const shell = read('AppShell.module.css');
const bar = read('TopBar.module.css');
const tsx = read('AppShell.tsx');

/** The shell's phone layout, as AppShell.tsx's `phone` reads it. */
const PHONE = '@media (width < 768px)';
/** The body of every PHONE block, brace-matched, each led by a '}' so `rule` finds its first rule too. */
const phoneBlocks = (css: string): string[] => {
  const out: string[] = [];
  for (let i = css.indexOf(PHONE); i >= 0; i = css.indexOf(PHONE, i + 1)) {
    const open = css.indexOf('{', i);
    let depth = 0;
    for (let j = open; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) {
        out.push(`}${css.slice(open + 1, j)}`);
        break;
      }
    }
  }
  return out;
};
/** `sel`'s declarations in the first PHONE block that has it ('' when none does). */
const phoneRule = (css: string, sel: string) => phoneBlocks(css).map((b) => rule(b, sel)).find((r) => r !== '') ?? '';
const gutters = (css: string) => css.match(/scrollbar-gutter:/g)?.length ?? 0;

describe('scrollbar room: the content and the top bar keep the same', () => {
  it('on the desktop layout the content keeps a classic scrollbar\'s room, scrolled or not', () => {
    const main = rule(shell, '.main');
    expect(main).toMatch(/overflow:\s*auto;/);
    expect(main).toMatch(/scrollbar-gutter:\s*stable;/);
  });

  it('the top bar keeps the same room: it hides its overflow (a scroll container that never scrolls) with a stable gutter', () => {
    const b = rule(bar, '.bar');
    expect(b).toMatch(/overflow:\s*hidden;/);
    expect(b).toMatch(/scrollbar-gutter:\s*stable;/);
  });

  it('a canvas page (the Board) scrolls nothing and keeps no room: edge to edge', () => {
    const canvas = rule(shell, '.canvas');
    expect(canvas).toMatch(/overflow:\s*hidden;/);
    expect(canvas).toMatch(/scrollbar-gutter:\s*auto;/);
    // After the .main rule, so it wins on the element that carries both classes.
    expect(shell.indexOf('.canvas {')).toBeGreaterThan(shell.indexOf('.main {'));
  });
});

describe('scrollbar room on a phone-width window: neither box keeps it', () => {
  it('the width is the shell\'s own phone layout, the one AppShell.tsx reads', () => {
    expect(tsx).toMatch(/const phone = useMedia\('\(width < 768px\)'\);/);
    expect(phoneBlocks(shell).length).toBeGreaterThan(0);
    expect(phoneBlocks(bar).length).toBeGreaterThan(0);
  });

  it('the content gives the room back there', () => {
    expect(phoneRule(shell, '.main')).toMatch(/scrollbar-gutter:\s*auto;/);
  });

  it('the top bar gives it back at the same width, so the two still match', () => {
    expect(phoneRule(bar, '.bar')).toMatch(/scrollbar-gutter:\s*auto;/);
  });

  it('nothing else sets the room: the base rules, the canvas and the phone blocks only', () => {
    expect(gutters(shell)).toBe(3);
    expect(phoneBlocks(shell).reduce((n, b) => n + gutters(b), 0)).toBe(1);
    expect(gutters(bar)).toBe(2);
    expect(phoneBlocks(bar).reduce((n, b) => n + gutters(b), 0)).toBe(1);
  });
});
