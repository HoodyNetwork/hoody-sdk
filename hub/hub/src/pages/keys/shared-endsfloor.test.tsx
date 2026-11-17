// Vitest: Ends' floor holds the widest date a share can end on. Table cells draw proportional
// digits, so a date with more of a wide digit (a midnight end's zeros) is wider than a sample date. jsdom has no canvas:
// this file gives the kit a stand-in canvas whose "0" is wider than the other glyphs (as Geist's is), installed before
// anything is measured (the kit keeps the first canvas it gets for the module's life).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { fitWidth } from '@kit';
import { utc } from './share-logic';
import page from './page';
import strings from './strings.en.json';

const ZERO = 9;
/** The kit's edge padding (DataTable Edges): a first cell starts and a last cell ends 4 px
 *  further in than the fit measure allows. Ends drawn first (or last) takes one, Ends alone (first and last) both. */
const ONE_EDGE = 4;
const BOTH_EDGES = 8;
const GLYPH = 7;
const canvas = { font: '', measureText: (text: string) => ({ width: [...text].reduce((n, c) => n + (c === '0' ? ZERO : GLYPH), 0) }) };
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

describe('Shared: Ends\' floor is the widest date', () => {
  it('at the list switch across all realms, Ends is as wide as a date of all zeros, and a midnight end fits it', async () => {
    // Every digit at its widest: the floor the table measures. A sample date with fewer zeros is narrower.
    const widest = fitWidth([utc('2000-08-28T08:08:00Z').replace(/\d/g, '0')]);
    const midnight = fitWidth([utc('2026-06-20T00:00:00Z')]);
    expect(widest).toBeGreaterThan(fitWidth([utc('2000-08-28T08:08:00Z')]));
    expect(widest).toBeGreaterThanOrEqual(midnight);
    // The switch: Made (120, the first column) + Stop (260) + Ends' floor. Just there the table is Ends, Realm and Stop,
    // and Ends is at its floor (the fixture dates are narrower), so its width is the floor itself: the date, plus the
    // 4 px the kit gives the first cell (Ends is drawn first there; Stop, last, is not a fit column).
    const room = 120 + 260 + widest + ONE_EDGE;
    vi.stubGlobal('ResizeObserver', atWidth(room));
    await renderPage(page, { state: 'shared', realm: 'all', path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    await waitFor(() => expect(measured).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const grid = [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((th) => th.textContent?.trim().startsWith(strings['share.colEnds'])));
    expect(grid, `a table at ${room} px, Ends shown`).toBeDefined();
    const heads = [...grid!.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
    const at = heads.findIndex((h) => h.startsWith(strings['share.colEnds']));
    const width = Number.parseFloat((grid!.querySelectorAll('colgroup col')[at] as HTMLElement).style.width);
    expect(width, 'Ends, leading the row, holds a date of all zeros').toBeGreaterThanOrEqual(widest + ONE_EDGE);
    expect(width, 'Ends, leading the row, holds a midnight end').toBeGreaterThanOrEqual(midnight + ONE_EDGE);
  }, 30000);

  it('1 px below the switch it is the list, line 2 the whole date', async () => {
    // A floor measured on a narrower sample, or without the leading cell's padding, keeps the table here, with Ends
    // 1 px short of the widest date: cut.
    const widest = fitWidth([utc('2000-08-28T08:08:00Z').replace(/\d/g, '0')]);
    const room = 120 + 260 + widest + ONE_EDGE - 1;
    vi.stubGlobal('ResizeObserver', atWidth(room));
    await renderPage(page, { state: 'shared', realm: 'all', path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    await waitFor(() => expect(measured).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expectList(`across all realms at ${room} px`);
  }, 30000);

  it('one realm with Made and Can hidden (View menu): Ends leads the row, and at its switch it holds a date of all zeros', async () => {
    // Ends leads here too, so the kit gives it the first cell's 4 px in this mode as well
    // (whichever fit column is drawn first). The columns are hidden the person's way (View
    // options), then the table narrows: fixture boot resets stored views.
    const widest = fitWidth([utc('2000-08-28T08:08:00Z').replace(/\d/g, '0')]);
    type Seen = (e: { contentRect: { width: number } }[]) => void;
    let room = 800;
    const seen = new Set<Seen>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: Seen) {}
        observe() {
          measured += 1;
          seen.add(this.cb);
          this.cb([{ contentRect: { width: room } }]);
        }
        unobserve() {}
        disconnect() {
          seen.delete(this.cb);
        }
      },
    );
    const settle = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
    await renderPage(page, { state: 'sharedManaged', path: '/keys/shared' });
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
    await settle();
    for (const label of [strings['share.colMade'], strings['share.colCan']]) {
      await userEvent.click(screen.getByRole('button', { name: /view options/i }));
      await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: label }));
      await userEvent.keyboard('{Escape}');
      await settle();
    }
    expect(heads(endsGrid()!).some((h) => h.startsWith(strings['share.colMade'])), 'Made is hidden').toBe(false);
    expect(heads(endsGrid()!).some((h) => h.startsWith(strings['share.colCan'])), 'Can is hidden').toBe(false);
    for (const [at, inTable] of [
      [widest + ONE_EDGE + 260, true],
      [widest + ONE_EDGE + 260 - 1, false],
    ] as const) {
      room = at;
      await act(async () => {
        for (const cb of [...seen]) cb([{ contentRect: { width: at } }]);
      });
      await settle();
      const grid = endsGrid();
      if (!inTable) {
        expectList(`one realm, Made and Can hidden, at ${at} px`);
        continue;
      }
      expect(grid, `a table at ${at} px with Ends and Stop`).toBeDefined();
      expect(heads(grid!).findIndex((h) => h.startsWith(strings['share.colEnds'])), 'Ends is the first column').toBe(0);
      const width = Number.parseFloat((grid!.querySelectorAll('colgroup col')[0] as HTMLElement).style.width);
      expect(width, `one realm, Made hidden, at ${at} px: Ends, leading, holds a date of all zeros`).toBeGreaterThanOrEqual(widest + ONE_EDGE);
    }
  }, 60000);

  for (const [mode, realm, hide] of [
    ['one realm', undefined, ['share.colMade', 'share.colCan', 'share.colAction']],
    ['all realms', 'all', ['share.colMade', 'share.colRealm', 'share.colCan', 'share.colAction']],
  ] as const) {
    it(`${mode} with every other column hidden (View menu): Ends alone, first and last, holds a date of all zeros at its switch`, async () => {
      // Ends as the only column is both edge cells, so it needs both pads; the kit gives them.
      // One pad keeps a table 1 px below here, its date cut.
      const widest = fitWidth([utc('2000-08-28T08:08:00Z').replace(/\d/g, '0')]);
      type Seen = (e: { contentRect: { width: number } }[]) => void;
      let room = 900;
      const seen = new Set<Seen>();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(private cb: Seen) {}
          observe() {
            measured += 1;
            seen.add(this.cb);
            this.cb([{ contentRect: { width: room } }]);
          }
          unobserve() {}
          disconnect() {
            seen.delete(this.cb);
          }
        },
      );
      const settle = () =>
        act(async () => {
          await new Promise((r) => setTimeout(r, 30));
        });
      await renderPage(page, { state: 'sharedManaged', ...(realm ? { realm } : {}), path: '/keys/shared' });
      await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 });
      await settle();
      for (const key of hide) {
        await userEvent.click(screen.getByRole('button', { name: /view options/i }));
        await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: strings[key] }));
        await userEvent.keyboard('{Escape}');
        await settle();
      }
      for (const [at, inTable] of [
        [widest + BOTH_EDGES, true],
        [widest + BOTH_EDGES - 1, false],
      ] as const) {
        room = at;
        await act(async () => {
          for (const cb of [...seen]) cb([{ contentRect: { width: at } }]);
        });
        await settle();
        if (!inTable) {
          expectList(`${mode}, Ends alone, at ${at} px`);
          continue;
        }
        const grid = endsGrid();
        expect(grid, `a table at ${at} px with Ends alone`).toBeDefined();
        expect(heads(grid!), `${mode}: Ends is the only column`).toEqual([expect.stringMatching(new RegExp(`^${strings['share.colEnds']}`))]);
        const width = Number.parseFloat((grid!.querySelectorAll('colgroup col')[0] as HTMLElement).style.width);
        expect(width, `${mode}, Ends alone at ${at} px: holds a date of all zeros`).toBeGreaterThanOrEqual(widest + BOTH_EDGES);
      }
    }, 60000);
  }
});
