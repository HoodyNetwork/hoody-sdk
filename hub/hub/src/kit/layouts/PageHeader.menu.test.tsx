// PageHeader `menu` (at 390 the computer detail's ⋯ wrapped onto a row of its own under the meta
// line and read as stray dots). The ⋯ is the header's last control in focus order; on a wrapped row it keeps the title
// row's inline end and the actions take the line below. DetailPage's full-page header passes its ⋯ there, a plain
// (ghost) IconButton like the pane's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));
vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

const css = readFileSync(join(__dirname, 'PageHeader.module.css'), 'utf8');
const block = (at: string) => {
  const i = css.indexOf(at);
  return i < 0 ? '' : css.slice(i, css.indexOf('\n}\n', i));
};
const rule = (src: string, sel: string) => {
  const i = src.indexOf(`${sel} {`);
  return i < 0 ? '' : src.slice(i, src.indexOf('}', i));
};

describe('PageHeader menu', () => {
  it('draws the ⋯ after the actions, last in the row and in focus order', () => {
    render(<PageHeader title="atlas" actions={<button type="button">Open terminal</button>} menu={<button type="button">More</button>} />);
    const head = screen.getByRole('banner');
    expect(within(head).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open terminal', 'More']);
    const slot = screen.getByRole('button', { name: 'More' }).parentElement!;
    expect(slot.hasAttribute('data-head-menu')).toBe(true);
    expect(slot.parentElement!.lastElementChild).toBe(slot);
  });

  it('under 600 px the ⋯ comes before the actions in the DOM (Tab follows the wrapped row: ⋯ on the title line, actions below)', () => {
    const RO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: 390 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      render(<PageHeader title="atlas" actions={<button type="button">Open terminal</button>} menu={<button type="button">More</button>} />);
      const head = screen.getByRole('banner');
      expect(within(head).getAllByRole('button').map((b) => b.textContent)).toEqual(['More', 'Open terminal']);
    } finally {
      globalThis.ResizeObserver = RO;
    }
  });

  it('CSS: the ⋯ keeps its own width; under 600 px the title and the ⋯ share the first line and the actions take a full line below', () => {
    expect(rule(css, '.menuEnd')).toMatch(/flex: none;/);
    expect(css).not.toMatch(/\.menuEnd\s*\{[^}]*order:/);
    const narrow = block('@container pagehead (width < 600px)');
    expect(rule(narrow, '.row:has(> .menuEnd) > .titles')).toMatch(/flex-basis: 0;/);
    const actions = rule(narrow, '.row:has(> .menuEnd) > .actions');
    expect(actions).toMatch(/flex: 1 1 100%;/);
    expect(actions).not.toMatch(/order:/);
  });
});
