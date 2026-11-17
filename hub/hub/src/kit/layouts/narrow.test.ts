// Narrow headers: at phone width a section's or a
// detail's actions drop under the title instead of crushing or cutting it. Layout cannot be
// measured in happy-dom, so this reads the rules; hub:shots at 390 shows the result.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(path.join(import.meta.dirname, f), 'utf8');

/** The body of every `@container content (width < 600px)` block in a stylesheet, joined. */
function phoneBlocks(css: string): string {
  const out: string[] = [];
  const head = /@container content \(width < 600px\)\s*\{/g;
  for (let m = head.exec(css); m; m = head.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push(css.slice(start, i - 1));
  }
  return out.join('\n');
}

/** The declarations of `selector { ... }` (exact selector text) in a block of CSS. */
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('ListDetailPage detail header at phone width', () => {
  const phone = phoneBlocks(read('ListDetailPage.module.css'));

  it('the header wraps and the name takes its own line', () => {
    expect(rule(phone, '.detailHeader')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(phone, '.detailTitles')).toMatch(/flex-basis:\s*100%/);
  });

  it('the name wraps instead of being cut to a few letters', () => {
    expect(rule(phone, '.detailTitle')).toMatch(/white-space:\s*normal/);
    expect(rule(phone, '.detailTitle')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('a long name pushes its status under it instead of squeezing it', () => {
    expect(rule(phone, '.detailTitleLine')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the actions wrap onto a row of their own', () => {
    expect(rule(phone, '.detailActions')).toMatch(/flex-wrap:\s*wrap/);
  });
});

/** The body of the first `@container content (width < <px>px)` block in a stylesheet. */
function containerBlock(css: string, px: number): string {
  const m = new RegExp(`@container content \\(width < ${px}px\\)\\s*\\{`).exec(css);
  if (!m) return '';
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < css.length && depth > 0; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
  }
  return css.slice(start, i - 1);
}

describe('ListDetailPage side inspector between the one-pane switch (846 px usable) and 1180 px of content', () => {
  const css = read('ListDetailPage.module.css');

  it('sits beside the table, never over it: no overlay rule below 1180', () => {
    const m = containerBlock(css, 1180);
    expect(rule(m, '.side .detail')).toBe('');
    expect(rule(m, '.side.hasDetail .split')).toBe('');
    expect(rule(m, '.side .handle')).toBe('');
  });

  it('gives way so the table keeps its least width beside it (the table drops columns by priority)', () => {
    expect(rule(css, '.side.hasDetail .split')).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\) var\(--ld-sep\) min\(var\(--ld-insp-w\), calc\(100% - var\(--pane-list-min\) - var\(--ld-sep\)\)\);/,
    );
  });
});

describe('Section head', () => {
  const css = read('Layouts.module.css');

  it('wraps, so the actions go under the title when both do not fit', () => {
    expect(rule(css, '.sectionHead')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('keeps a readable title width before the actions wrap, and the actions wrap among themselves', () => {
    expect(rule(css, '.sectionTitle')).toMatch(/flex:\s*1 1 \S+/);
    expect(rule(css, '.sectionHead > .panelActions')).toMatch(/flex-wrap:\s*wrap/);
  });
});
