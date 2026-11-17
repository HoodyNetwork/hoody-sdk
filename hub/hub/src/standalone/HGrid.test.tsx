// HGrid.tsx in Card.tsx: the backdrop of every sign-in screen. It is decoration (one aria-hidden <svg> with no text,
// first in <main>, the card's content untouched), a column of marks sits on the centre line, every mark that touches
// the column with the card or that the screen's edge would cut is cut out, and a mark lights only under a mouse on
// the open page, never under reduced motion or Performance mode.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Card } from './Card';

const realMatchMedia = window.matchMedia;
const realResizeObserver = globalThis.ResizeObserver;

/** A ResizeObserver the test fires by hand: every observer made, with what it watches. */
const observers: { run: () => void; targets: Set<Element> }[] = [];
class HandObserver {
  private readonly entry: { run: () => void; targets: Set<Element> };
  constructor(cb: ResizeObserverCallback) {
    this.entry = { run: () => cb([], this as unknown as ResizeObserver), targets: new Set() };
    observers.push(this.entry);
  }
  observe(el: Element): void { this.entry.targets.add(el); }
  unobserve(el: Element): void { this.entry.targets.delete(el); }
  disconnect(): void { this.entry.targets.clear(); }
}
/** The box of `el` changed: every observer watching it is told, and nothing else happens (no window resize). */
const resized = async (el: Element) => {
  await act(async () => { for (const o of observers) if (o.targets.has(el)) o.run(); });
};

/** The clock the lit marks read (performance.now), stepped by hand: a slow machine never ages a mark. */
let clock = 1000;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  observers.length = 0;
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: realResizeObserver });
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: realMatchMedia });
  document.documentElement.removeAttribute('data-hx-perf');
});

const box = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** The media the lit mark asks about: a mouse, and reduced motion as given. */
const media = (reduced: boolean): void => {
  const answer = (query: string) => ({ matches: query.includes('reduced-motion') ? reduced : true, media: query, addEventListener: () => {}, removeEventListener: () => {} });
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: answer });
};

/** The card on an 800 x 600 screen, its column at 190..610 across and 100..500 down. */
const show = async (reduced = false) => {
  media(reduced);
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: HandObserver });
  const { container } = render(
    <Card title="Sign in" choice={null} below={<p>Under the card</p>}>
      <p>Card body</p>
    </Card>,
  );
  const main = screen.getByRole('main');
  const grid = main.firstElementChild as SVGSVGElement;
  const column = main.lastElementChild as HTMLElement;
  grid.getBoundingClientRect = () => box(0, 0, 800, 600);
  column.getBoundingClientRect = () => box(190, 100, 420, 400);
  await act(async () => { window.dispatchEvent(new Event('resize')); });
  return { container, main, grid, column };
};

const moveTo = async (target: Element, clientX: number, clientY: number) => {
  await act(async () => { target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX, clientY })); });
};
const lit = (grid: Element) => Array.from(grid.children).filter((el) => el.tagName.toLowerCase() === 'g').map((g) => g.getAttribute('transform'));
/** The trail tiles: the grid's own rects that are not one of the two pattern fills. */
const tiles = (grid: Element) =>
  Array.from(grid.children).filter((el) => el.tagName.toLowerCase() === 'rect' && !el.hasAttribute('fill')).map((r) => `${r.getAttribute('x')},${r.getAttribute('y')} ${r.getAttribute('width')}x${r.getAttribute('height')}`);

describe('the backdrop behind the sign-in card', () => {
  it('is decoration: one aria-hidden svg, first in main, with no text and no role', async () => {
    const { main, grid } = await show();
    expect(grid.tagName.toLowerCase()).toBe('svg');
    expect(grid.getAttribute('aria-hidden')).toBe('true');
    expect(grid.getAttribute('focusable')).toBe('false');
    expect(grid.textContent).toBe('');
    expect(grid.querySelector('title, desc, text, a, image, [tabindex], [href]')).toBeNull();
    expect(Array.from(main.children).filter((el) => el.tagName.toLowerCase() === 'svg')).toHaveLength(1);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('leaves the card as it is: main holds the backdrop and the column, the title is the one h1, body and line show', async () => {
    const { main, column } = await show();
    expect(main.children).toHaveLength(2);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Sign in']);
    expect(column.contains(screen.getByText('Card body'))).toBe(true);
    expect(column.contains(screen.getByText('Under the card'))).toBe(true);
    expect(main.textContent).toBe(column.textContent);
  });

  it('puts a column of marks on the centre line and cuts out every mark the column or the screen edge would touch', async () => {
    const { grid } = await show();
    // 800 wide: the cells start at -40, so one cell spans 360..440 and its mark 388..412.
    expect(grid.querySelector('#hgrid-lines')?.getAttribute('x')).toBe('-40');
    expect(grid.querySelector('#hgrid-marks')?.getAttribute('x')).toBe('-40');
    const d = grid.querySelector('#hgrid-cut path')?.getAttribute('d') ?? '';
    expect(d.startsWith('M0 0H800V600H0z')).toBe(true);
    // 11 columns (-40 to 760) by 8 rows (0 to 560). Columns 200 to 520 in rows 80 to 400 hold a mark within 2 px of
    // the column: 25 squares. The screen's edges cut the marks of columns -40 and 760 (16) and of row 560 (9 more).
    expect(d.match(/h28v28h-28z/g)).toHaveLength(50);
    expect(d).toContain('M226 106h28v28h-28z');
    expect(d).toContain('M546 426h28v28h-28z');
    expect(d).toContain('M-14 26h28v28h-28z');
    expect(d).toContain('M786 266h28v28h-28z');
    expect(d).toContain('M386 586h28v28h-28z');
    // Whole marks beside, above and below the column stay.
    for (const kept of ['M146 106h', 'M626 106h', 'M386 26h', 'M386 506h', 'M66 26h']) expect(d).not.toContain(kept);
    const marks = Array.from(grid.querySelectorAll('rect')).filter((r) => r.getAttribute('fill') === 'url(#hgrid-marks)');
    expect(marks.map((r) => r.getAttribute('clip-path'))).toEqual(['url(#hgrid-cut)']);
    // The lines are never cut.
    const lines = Array.from(grid.querySelectorAll('rect')).filter((r) => r.getAttribute('fill') === 'url(#hgrid-lines)');
    expect(lines.map((r) => r.getAttribute('clip-path'))).toEqual([null]);
  });

  it('follows the card: a column that grows with no window resize cuts the marks it now touches', async () => {
    const { grid, column } = await show();
    const cut = () => grid.querySelector('#hgrid-cut path')?.getAttribute('d') ?? '';
    expect(observers.some((o) => o.targets.has(column))).toBe(true);
    expect(observers.some((o) => o.targets.has(grid))).toBe(true);
    expect(cut()).not.toContain('M386 506h28v28h-28z');
    // A taller state: the column now ends at 580, so row 480 (marks 508..532) is under it too.
    column.getBoundingClientRect = () => box(190, 100, 420, 480);
    await resized(column);
    expect(cut().match(/h28v28h-28z/g)).toHaveLength(55);
    expect(cut()).toContain('M386 506h28v28h-28z');
    // And back: a shorter state gives the marks under it back.
    column.getBoundingClientRect = () => box(190, 100, 420, 160);
    await resized(column);
    expect(cut()).not.toContain('M386 266h28v28h-28z');
    expect(cut()).toContain('M386 186h28v28h-28z');
  });

  it('lights the mark of the cell under a mouse on the open page, once per cell; a cell left behind is a soft tile, eight cells at most', async () => {
    const { main, grid } = await show();
    expect(lit(grid)).toEqual([]);
    await moveTo(main, 50, 50);
    expect(lit(grid)).toEqual(['translate(68 28)']);
    await moveTo(main, 60, 70);
    expect(lit(grid)).toEqual(['translate(68 28)']);
    expect(tiles(grid)).toEqual([]);
    await moveTo(main, 130, 50);
    expect(lit(grid)).toEqual(['translate(148 28)']);
    expect(tiles(grid)).toEqual(['40,0 80x80']);
    for (let i = 0; i < 12; i += 1) await moveTo(main, 50, 50 + 80 * (i % 7) + (i > 6 ? 1 : 0));
    expect(lit(grid)).toHaveLength(1);
    expect(tiles(grid)).toHaveLength(7);
  });

  it('a lit cell becomes a tile when the pointer goes over the card or leaves the page', async () => {
    const { main, grid, column } = await show();
    await moveTo(main, 50, 50);
    await moveTo(column, 400, 300);
    expect(lit(grid)).toEqual([]);
    expect(tiles(grid)).toEqual(['40,0 80x80']);
    await moveTo(main, 130, 50);
    await act(async () => { document.documentElement.dispatchEvent(new MouseEvent('mouseleave')); });
    expect(lit(grid)).toEqual([]);
    expect(tiles(grid)).toEqual(['40,0 80x80', '120,0 80x80']);
  });

  it('a cell left while its mark still shows becomes a tile; one left after the mark faded out (1440 ms) leaves none', async () => {
    const { main, grid } = await show();
    await moveTo(main, 50, 50);
    clock += 1400;
    await moveTo(main, 130, 50);
    expect(tiles(grid)).toEqual(['40,0 80x80']);
    expect(lit(grid)).toEqual(['translate(148 28)']);
    clock += 1440;
    await moveTo(main, 50, 130);
    expect(tiles(grid)).toEqual(['40,0 80x80']);
    expect(lit(grid)).toEqual(['translate(68 108)']);
  });

  it('lights nothing over the card, or in a cell whose mark is hidden', async () => {
    const { main, grid, column } = await show();
    await moveTo(column, 400, 300);
    expect(lit(grid)).toEqual([]);
    // The cell 200..280 across, 80..160 down is open page at (205, 90), and its mark touches the column.
    await moveTo(main, 205, 90);
    expect(lit(grid)).toEqual([]);
    // The cell at the left edge (-40..40): the edge cuts its mark.
    await moveTo(main, 10, 300);
    expect(lit(grid)).toEqual([]);
    expect(tiles(grid)).toEqual([]);
  });

  it('lights nothing under reduced motion or Performance mode', async () => {
    const still = await show(true);
    await moveTo(still.main, 50, 50);
    await moveTo(still.main, 130, 50);
    expect(lit(still.grid)).toEqual([]);
    expect(tiles(still.grid)).toEqual([]);
    cleanup();
    const perf = await show();
    document.documentElement.setAttribute('data-hx-perf', 'on');
    await moveTo(perf.main, 50, 50);
    expect(lit(perf.grid)).toEqual([]);
  });
});
