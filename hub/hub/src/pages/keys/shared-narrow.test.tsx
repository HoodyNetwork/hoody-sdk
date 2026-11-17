// Keys > Shared access on a phone: at 390 px the table shed its Stop column, so a share could not be
// stopped. Stop is the row's list status: where made, Stop and one more column do not fit, the rows become the
// two-line list with Stop on line 1. jsdom has no layout, so the table's measured width is given here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import { shares } from './fixtures';
import { utc } from './share-logic';
import page from './page';
import strings from './strings.en.json';

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

describe('keys: Shared access keeps Stop on a narrow screen', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    measured = 0;
  });
  // The first render has no width yet (all columns); what counts is the rows once the table has been measured.
  const stopsOnceMeasured = async () => {
    await screen.findAllByRole('button', { name: strings['share.stop'] }, { timeout: 10000 }).catch(() => []);
    await waitFor(() => expect(measured).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    return screen.queryAllByRole('button', { name: strings['share.stop'] });
  };

  describe('at a phone width (about 340 px of table)', () => {
    beforeEach(() => vi.stubGlobal('ResizeObserver', atWidth(340)));
    it('every share row still offers Stop sharing', async () => {
      await renderPage(page, { state: 'shared', path: '/keys/shared' });
      expect(await stopsOnceMeasured()).toHaveLength(shares.length);
    }, 30000);
  });

  describe('at a desktop width', () => {
    beforeEach(() => vi.stubGlobal('ResizeObserver', atWidth(1200)));
    it('the table keeps its Stop sharing column', async () => {
      await renderPage(page, { state: 'shared', path: '/keys/shared' });
      expect(await stopsOnceMeasured()).toHaveLength(shares.length);
      expect(screen.getByRole('columnheader', { name: new RegExp(strings['share.colAction']) })).toBeInTheDocument();
    }, 30000);
  });

  describe('at a middle width across all realms (room for three of the four columns)', () => {
    beforeEach(() => vi.stubGlobal('ResizeObserver', atWidth(560)));
    // When a share ends is never dropped; Made gives way first.
    it('Made gives way first: which realm a share is in, when it ends and its Stop stay', async () => {
      await renderPage(page, { state: 'shared', realm: 'all', path: '/keys/shared' });
      expect(await stopsOnceMeasured()).toHaveLength(shares.length);
      expect(screen.getByRole('columnheader', { name: new RegExp(strings['share.colRealm']) })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: new RegExp(strings['share.colEnds']) })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: new RegExp(strings['share.colMade']) })).toBeNull();
    }, 30000);
  });

  describe('at a phone width across all realms', () => {
    beforeEach(() => vi.stubGlobal('ResizeObserver', atWidth(340)));
    it('the realm is line 1 of each row beside Stop, and line 2 is when the share ends', async () => {
      await renderPage(page, { state: 'shared', realm: 'all', path: '/keys/shared' });
      const stops = await stopsOnceMeasured();
      expect(stops).toHaveLength(shares.length);
      for (const stop of stops) {
        const line1 = stop.closest('.listLine1');
        expect(line1).not.toBeNull();
        expect(line1?.querySelector('.listPrimary')?.textContent).toBe('Personal');
        // Line 2 is one clipped line: across all realms it holds only when the share ends, so a phone as narrow as
        // 320 px still shows it (Made and Ends together did not fit).
        const items = stop.closest('.listLines')?.querySelectorAll('.listMeta > .listItem') ?? [];
        expect(Array.from(items).map((i) => i.textContent)).toHaveLength(1);
        // The date says what it is: "Ends", then the time.
        expect(items[0]?.querySelector('.listLabel')?.textContent).toBe(strings['share.colEnds']);
        expect(items[0]?.querySelector('.listValue')?.textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
      }
      // Each row shows its own share's end, to the minute: the row is matched to its share by id.
      for (const stop of stops) {
        const id = stop.closest('[data-row-id]')?.getAttribute('data-row-id');
        const share = shares.find((r) => String(r.id) === id);
        expect(share?.expires_at).toBeTruthy();
        expect(stop.closest('.listLines')?.querySelector('.listMeta .listValue')?.textContent).toBe(utc(String(share?.expires_at)));
      }
    }, 30000);

    it('a share made for someone names them on line 1 beside its realm (Made is no list column here)', async () => {
      await renderPage(page, { state: 'sharedNamed', realm: 'all', path: '/keys/shared' });
      await stopsOnceMeasured();
      const primaries = Array.from(document.querySelectorAll('.listLine1 .listPrimary')).map((e) => e.textContent);
      expect(primaries).toContain('Personal · Alex');
    }, 30000);

    it('in one realm, line 2 labels the end date too ("Ends" before the time)', async () => {
      await renderPage(page, { state: 'shared', path: '/keys/shared' });
      const stops = await stopsOnceMeasured();
      expect(stops.length).toBeGreaterThan(0);
      for (const stop of stops) {
        const item = stop.closest('.listLines')?.querySelector('.listMeta > .listItem');
        expect(item?.querySelector('.listLabel')?.textContent).toBe(strings['share.colEnds']);
        // Each row shows its own share's end, to the minute: the row is matched to its share by id.
        const id = stop.closest('[data-row-id]')?.getAttribute('data-row-id');
        const share = shares.find((r) => String(r.id) === id);
        expect(share?.expires_at).toBeTruthy();
        expect(item?.querySelector('.listValue')?.textContent).toBe(utc(String(share?.expires_at)));
      }
    }, 30000);
  });
});

// A lost share or an unconfirmed stop puts a sentence and Dismiss beside Stop. The list's status slot does not shrink,
// so the action cell bounds its own width and wraps, or a phone row pushes Stop and the date out of sight. jsdom has
// no layout: this checks the rules the layout relies on.
describe('keys: the share action cell stays phone-sized', () => {
  it('it is bounded by the viewport and its notes wrap', () => {
    const read = (...p: string[]) => readFileSync(join(import.meta.dirname, ...p), 'utf8');
    const rule = (css: string, sel: string) => new RegExp(`(?:^|\\n)\\.${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule(read('parts', 'keys.module.css'), 'shareActions')).toMatch(/max-width:\s*min\(\s*260px,\s*\d+vw\s*\)/);
    // The notes are the kit's RowNote, which wraps inside the cell (table cells keep one line).
    expect(rule(read('..', '..', 'kit', 'data', 'Display.module.css'), 'rowNote')).toMatch(/white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
  });
});
