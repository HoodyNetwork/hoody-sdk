// Vitest: Ends' floor follows whichever digit is widest, not always "0".
// The sibling file's stand-in canvas makes only "0" wide, so a floor that always measured zeros would pass there too. Here
// "7" is the widest glyph (10 px) and "0" is as narrow as the rest: the floor must be a date of all sevens. A separate file
// because the kit keeps the first canvas it gets for the module's life.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import { fitWidth } from '@kit';
import { utc } from './share-logic';
import page from './page';
import strings from './strings.en.json';

const SEVEN = 10;
/** The kit's edge padding (DataTable Edges): a first cell starts and a last cell ends 4 px
 *  further in than the fit measure allows. Ends drawn first (or last) takes one, Ends alone (first and last) both. */
const ONE_EDGE = 4;
const GLYPH = 7;
const canvas = { font: '', measureText: (text: string) => ({ width: [...text].reduce((n, c) => n + (c === '7' ? SEVEN : GLYPH), 0) }) };
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => canvas) as unknown as HTMLCanvasElement['getContext']);

let measured = 0;
const atWidth = (width: number) =>
  class {
    constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
    observe() {
      measured += 1;
      this.cb([{ contentRect: { width } }]);
    }
    unobserve() {}
    disconnect() {}
  };
afterEach(() => {
  vi.unstubAllGlobals();
  measured = 0;
});

const endsGrid = () => [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((th) => th.textContent?.trim().startsWith(strings['share.colEnds'])));
const heads = (t: Element) => [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
/** Below a switch: no table shows Ends, the list is there, and every row's line 2 is "Ends" and the whole date (
 *  a check that passes when there is no Ends table at all proves nothing). */
const expectList = (why: string) => {
  expect(endsGrid(), `${why}: no table shows Ends`).toBeUndefined();
  const items = [...document.querySelectorAll('.listMeta > .listItem')];
  expect(items.length, `${why}: the list, with line 2`).toBeGreaterThan(0);
  for (const i of items) {
    expect(i.querySelector('.listLabel')?.textContent, `${why}: line 2 is labelled`).toBe(strings['share.colEnds']);
    expect(i.querySelector('.listValue')?.textContent, `${why}: line 2 shows the date whole`).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  }
};

describe('Shared: Ends\' floor follows the widest digit', () => {
  const sevens = () => fitWidth([utc('2000-08-28T08:08:00Z').replace(/\d/g, '7')]);
  const zeros = () => fitWidth([utc('2000-08-28T08:08:00Z').replace(/\d/g, '0')]);

  it('with "7" widest, Ends at its switch holds a date of all sevens (wider than one of all zeros)', async () => {
    expect(sevens(), 'the stand-in makes 7 the widest digit').toBeGreaterThan(zeros());
    const room = 120 + 260 + sevens() + ONE_EDGE;
    vi.stubGlobal('ResizeObserver', atWidth(room));
    await renderPage(page, { state: 'shared', realm: 'all', path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    await waitFor(() => expect(measured).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const grid = endsGrid();
    expect(grid, `a table at ${room} px, Ends shown`).toBeDefined();
    const at = heads(grid!).findIndex((h) => h.startsWith(strings['share.colEnds']));
    const width = Number.parseFloat((grid!.querySelectorAll('colgroup col')[at] as HTMLElement).style.width);
    expect(width, 'Ends, leading the row, holds a date of all sevens').toBeGreaterThanOrEqual(sevens() + ONE_EDGE);
  }, 30000);

  it('1 px below that switch it is the list: a floor measured on zeros would keep a table with Ends cut', async () => {
    const room = 120 + 260 + sevens() + ONE_EDGE - 1;
    vi.stubGlobal('ResizeObserver', atWidth(room));
    await renderPage(page, { state: 'shared', realm: 'all', path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    await waitFor(() => expect(measured).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expectList(`across all realms at ${room} px`);
  }, 30000);
});
