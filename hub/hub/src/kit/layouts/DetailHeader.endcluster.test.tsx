// DetailHeader end cluster: the page's buttons, then the pane control,
// then the ⋯ menu last; one gap (--gap-actions) between all of them, no margin of the pane control's own; the ⋯ and
// the pane control share one look, the ghost IconButton (no three-dot plate).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { DetailHeader } from './ListDetailPage';
import { DetailPaneContext } from './pane';

const css = readFileSync(join(__dirname, 'ListDetailPage.module.css'), 'utf8');
const menu = [{ id: 'rename', label: 'Rename', onAction: () => undefined }];
const names = (el: Element) => [...el.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s*\(.*$/, '').trim());
const inPane = (mode: 'fill' | 'side', el: ReactElement) =>
  render(<DetailPaneContext.Provider value={{ mode, listHidden: false, toggleList: () => undefined, close: () => undefined }}>{el}</DetailPaneContext.Provider>);
const looks = (b: HTMLElement) => b.className.split(/\s+/).filter((c) => !/paneCtl/.test(c)).sort().join(' ');

describe('DetailHeader end cluster', () => {
  it('fill: page buttons, then Hide list, then More actions last', () => {
    inPane('fill', <DetailHeader title="atlas" actions={<button type="button">Run</button>} menu={menu} />);
    const end = screen.getByRole('banner');
    expect(names(end)).toEqual(['Run', 'Hide list', 'More actions']);
  });

  it('side: page buttons, then Close, then More actions last', () => {
    inPane('side', <DetailHeader title="atlas" actions={<button type="button">Run</button>} menu={menu} />);
    const end = screen.getByRole('banner');
    expect(names(end)).toEqual(['Run', 'Close details', 'More actions']);
  });

  it('the ⋯ and the pane control take one look: the ghost IconButton, no three-dot plate', () => {
    inPane('fill', <DetailHeader title="atlas" menu={menu} />);
    const more = screen.getByRole('button', { name: /More actions/ });
    const ctl = screen.getByRole('button', { name: /Hide list/ });
    expect(looks(more)).toBe(looks(ctl));
  });

  it('CSS: one gap for the whole cluster (the end group sits one action gap from the page buttons), no margin of the pane control', () => {
    const at = (sel: string) => {
      const i = css.indexOf(`${sel} {`);
      return css.slice(i, css.indexOf('}', i));
    };
    expect(at('.detailActions')).toMatch(/gap: var\(--gap-actions\);/);
    expect(at('.detailEnd')).toMatch(/gap: var\(--gap-actions\);/);
    expect(at('.detailActions + .detailEnd')).toMatch(/margin-inline-start: calc\(var\(--gap-actions\) - var\(--sp-4\)\);/);
    expect(at('.detailHeader')).toMatch(/gap: var\(--sp-4\);/);
    expect(css).not.toMatch(/\.paneCtl\s*\{[^}]*margin/);
  });

  it('the pane control and the ⋯ are one end group after the page buttons; a wrapped header keeps it on the name row', () => {
    inPane('fill', <DetailHeader title="atlas" actions={<button type="button">Run</button>} menu={menu} />);
    const end = screen.getByRole('button', { name: /Hide list/ }).parentElement!;
    expect(end.hasAttribute('data-detail-end')).toBe(true);
    expect(end.lastElementChild).toBe(screen.getByRole('button', { name: /More actions/ }));
    expect(screen.getByRole('button', { name: 'Run' }).parentElement!.nextElementSibling).toBe(end);
  });

  it('under 600 px of content the end group comes before the page buttons in the DOM: Tab follows the wrapped row', () => {
    const main = document.createElement('div');
    main.id = 'hub-main';
    Object.defineProperty(main, 'clientWidth', { value: 390, configurable: true });
    document.body.appendChild(main);
    try {
      render(
        <DetailPaneContext.Provider value={{ mode: 'fill', listHidden: false, toggleList: () => undefined, close: () => undefined }}>
          <DetailHeader title="atlas" actions={<button type="button">Run</button>} menu={menu} />
        </DetailPaneContext.Provider>,
        { container: main },
      );
      expect(names(screen.getByRole('banner'))).toEqual(['Hide list', 'More actions', 'Run']);
      expect(screen.getByRole('banner').className).toMatch(/detailNarrow/);
    } finally {
      main.remove();
    }
  });

  it('one pane with no menu: no end group (the pane control is not drawn), so the actions keep the title row', () => {
    render(
      <DetailPaneContext.Provider value={{ mode: 'fill', onePane: true, listHidden: false, toggleList: () => undefined, close: () => undefined }}>
        <DetailHeader title="atlas" actions={<button type="button">Run</button>} />
      </DetailPaneContext.Provider>,
    );
    expect(document.querySelector('[data-detail-end]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Hide list/ })).toBeNull();
  });

  it('CSS: a wrapped header (stacked, or .detailNarrow) keeps the end group on the name row by DOM order, not by order', () => {
    const at = (src: string, sel: string) => {
      const i = src.indexOf(`${sel} {`);
      return i < 0 ? '' : src.slice(i, src.indexOf('}', i));
    };
    expect(css).not.toMatch(/\.detail(End|Actions)\s*\{[^}]*order:/);
    expect(at(css, '.detailNarrow:has(> .detailEnd) > .detailTitles')).toMatch(/flex: 1 1 0;/);
    expect(at(css, '.detailNarrow:has(> .detailEnd) > .detailActions')).toMatch(/flex-basis: 100%;/);
    expect(at(css, '.detailStacked .detailEnd')).toMatch(/align-self: flex-start;/);
  });

  it('an actions fragment that renders nothing leaves no empty actions box', () => {
    expect(css).toMatch(/\.detailActions:empty\s*\{\s*display: none;/);
  });
});

describe('DetailHeader menuLabel', () => {
  it('names the ⋯ menu, still last after the pane control', () => {
    inPane('fill', <DetailHeader title="atlas" actions={<button type="button">Run</button>} menu={menu} menuLabel="Actions for atlas" />);
    const end = screen.getByRole('banner');
    expect(names(end)).toEqual(['Run', 'Hide list', 'Actions for atlas']);
  });
});
