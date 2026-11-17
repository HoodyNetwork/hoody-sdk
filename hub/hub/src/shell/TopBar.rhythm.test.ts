// The top bar's action row, read from the sources as bellCount.test.ts reads the count: one gap between every two actions, the
// row ending where the page's content ends, the bell and the icon-only AI as framed plates, and the Free badge on the
// accent's soft plate through the kit plate's own properties.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The body of the first top-level rule for `sel` in `css`. */
const rule = (css: string, sel: string) => new RegExp(`(?:^|\\})\\s*${esc(sel)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
/** The body of an at-rule block (`@container topbar (width < 1180px)`), braces balanced. */
function block(css: string, head: string): string {
  const i = css.indexOf(`${head} {`);
  if (i < 0) return '';
  let depth = 0;
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(css.indexOf('{', i) + 1, j);
  }
  return '';
}
const css = read('TopBar.module.css');
const tsx = read('TopBar.tsx').replace(/\s+/g, ' ');
const FREE = ".parts [data-hub-topbar-part='billing:free'] button";

describe('the top bar action row: one rhythm', () => {
  it('every two actions are one spacing step apart (8 px), never touching', () => {
    const end = rule(css, '.end');
    expect(end).toMatch(/display:\s*flex;/);
    expect(end).toMatch(/(?:^|[;\s])gap:\s*var\(--sp-2\);/);
    // Below 1024 the same row takes half a step (4 px), still one gap for every pair.
    expect(rule(block(css, '@media (width < 1024px)'), '.end')).toMatch(/^\s*gap:\s*var\(--sp-1\);\s*$/);
    // The parts' holders draw no box, so a part is a flex item of the row and takes the same gap.
    expect(rule(css, '.parts')).toMatch(/display:\s*contents/);
    expect(rule(css, '.part')).toMatch(/display:\s*contents/);
  });

  it('the row ends where the page content ends: the page padding of each content class less the avatar box\'s own 6 px', () => {
    expect(rule(css, '.bar')).toMatch(/container:\s*topbar \/ inline-size;/);
    expect(rule(css, '.bar')).toMatch(/padding-inline:\s*var\(--sp-4\) 0;/);
    // 24, 20 and 16 (--pad-page, AppShell.module.css) less 6: 18, 14 and 10.
    expect(rule(css, '.end')).toMatch(/margin-inline-end:\s*calc\(var\(--sp-5\) - var\(--sp-half\)\);/);
    expect(rule(block(css, '@container topbar (width < 1180px)'), '.end')).toMatch(/margin-inline-end:\s*calc\(var\(--sp-4\) - var\(--sp-half\)\);/);
    expect(rule(block(css, '@container topbar (width < 840px)'), '.end')).toMatch(/margin-inline-end:\s*calc\(var\(--sp-3\) - var\(--sp-half\)\);/);
    // The same classes as the content's own padding, so the two cannot drift apart unseen.
    const shell = read('AppShell.module.css');
    expect(shell).toMatch(/@container content \(width < 1180px\) \{\s*\.main > \* \{\s*--pad-page: 20px;/);
    expect(shell).toMatch(/@container content \(width < 840px\) \{\s*\.main > \* \{\s*--pad-page: 16px;/);
  });

  it('search gives way before the pickers: its shrink outweighs theirs, so the names stay whole', () => {
    expect(rule(css, '.search')).toMatch(/flex:\s*0 1000 260px;/);
    expect(rule(css, '.context')).toMatch(/flex:\s*0 1 auto;/);
  });

  it('on a coarse pointer the count stays inside the bar: on the 44 px plate\'s top edge, not 5 px above it', () => {
    expect(rule(block(css, '@media (pointer: coarse)'), '.bellCount')).toMatch(/^\s*inset-block-start:\s*0;\s*$/);
    // After the base rule (which it corrects) and before the phone's (which places the count on the frameless bell).
    expect(css.indexOf('@media (pointer: coarse)')).toBeGreaterThan(css.indexOf('.bellCount {'));
    expect(css.indexOf('@media (pointer: coarse)')).toBeLessThan(css.lastIndexOf('@media (width < 768px)'));
  });

  it('the phone keeps 8 px after the bell, and its count sits on the frameless bell itself', () => {
    const phone = css.slice(css.lastIndexOf('@media (width < 768px)'));
    expect(rule(phone, '.end')).toMatch(/margin-inline-end:\s*var\(--sp-2\);/);
    const count = rule(phone, '.bellCount');
    expect(count).toMatch(/inset-block-start:\s*calc\(\(var\(--ctl-h\) - var\(--icon-md\)\) \/ 2 - var\(--sp-2\)\);/);
    expect(count).toMatch(/inset-inline-end:\s*calc\(\(var\(--ctl-h\) - var\(--icon-md\)\) \/ 2 - var\(--sp-2\)\);/);
  });

  it('the bell is a framed kit icon button beside the worded plates, frameless only on the phone; the icon-only AI is framed too', () => {
    expect(tsx).toMatch(/const phone = useMedia\('\(width < 768px\)'\);/);
    expect(tsx).toMatch(/<IconButton icon="bell" label=\{[\s\S]*?\} variant=\{phone \? 'ghost' : 'secondary'\} onPress=/);
    expect(tsx).toMatch(/<IconButton icon="sparkle" label=\{askName\} variant="secondary" pressed=\{ask\.isOpen\}/);
  });
});

describe('the Free badge plate (billing:free)', () => {
  it('sits on the accent\'s soft ground inside the accent\'s edge, through the kit plate\'s properties and nothing else', () => {
    const rest = rule(css, FREE);
    expect(rest.split(';').map((d) => d.trim()).filter(Boolean).sort()).toEqual(['--plate-line: var(--hx-acc-edge)', '--plate: var(--hx-acc-soft)']);
  });

  it('under the pointer, pressed or open it keeps its ground and takes the full-ink frame', () => {
    const active = rule(css, `${FREE}:is([data-hovered], [data-pressed], [aria-expanded='true'])`);
    expect(active.split(';').map((d) => d.trim()).filter(Boolean)).toEqual(['--plate-line: var(--hx-btn-line-hover)']);
  });

  it('is never the accent fill (the page\'s one primary) and paints no background, border or colour of its own', () => {
    const mine = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.includes('billing:free'));
    expect(mine.length).toBe(2);
    for (const m of mine) {
      expect(m[2], m[1]!.trim()).not.toMatch(/var\(--hx-acc\)/);
      expect(m[2], m[1]!.trim()).not.toMatch(/(^|[;\s])(background(-color|-image)?|border(-[\w-]+)?|color|opacity)\s*:/);
    }
  });

  it('its words stay the button\'s own ink: only AI and Skills / SDK take the dark action colour', () => {
    const dark = /([^{}]+)\{[^{}]*--ghost-text:[^{}]*\}/.exec(css)?.[1] ?? '';
    expect(dark).toContain('guide:links');
    expect(dark).not.toContain('billing:free');
  });
});
